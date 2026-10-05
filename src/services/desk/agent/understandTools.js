/**
 * understandTools.js — "understand the file, edit only the cells".
 *
 * understand_file : what is this paper (any school's template) and where is everything
 * transfer_data   : copy data from one paper into another paper's OWN template
 * compare_files   : roster/value differences between two papers
 * edit_file       : natural-language edits to a Word/Excel file, cell by cell
 *
 * Edits are never written directly: tools return a pending "changes" artifact.
 * The teacher reviews it in the Canvas; applying follows the safe-edit SOP
 * (original backed up, working copy "<name> (KaTuro edit)" edited).
 */

import { recognizeMap, harvestNames } from '../understand/recognize.js';
import { extractData } from '../understand/extract.js';
import { planTransfer, compareTables, mapColumns, locationLabel } from '../understand/transfer.js';
import { mapFromGrids } from '../understand/gridMap.js';
import { sharedTemplateMemory } from '../understand/templateMemory.js';
import { normalizeDocumentSpec } from '../docSpec.js';
import { extractTableWithAI, documentArtifact, saveDocumentOutputs, headerFor, teacherSignatures, baseMeta, slug } from './tools.js';

const EDITABLE = /\.(xlsx|xlsm|docx)$/i;
const DOC_TYPE_LABEL = {
  attendance: 'attendance record',
  class_record: 'class record',
  masterlist: 'masterlist',
  scores: 'score sheet',
  item_analysis: 'item analysis',
  grades_summary: 'grade summary',
  report_card: 'report card',
  lesson_plan: 'lesson plan',
  letter: 'letter',
  certificate: 'certificate',
  form: 'form',
  other: 'document',
};

/**
 * Loads, maps, recognizes and extracts a file once per turn (cached in ctx.memory).
 * Returns { path, map, layout, data, source: 'memory'|'ai', editable }.
 */
export async function understandFile(path, ctx, { hint } = {}) {
  const key = `understood:${path}`;
  if (ctx.memory.has(key)) return ctx.memory.get(key);
  const promise = (async () => {
    const docmap = await import('../docmap/index.js');
    const name = path.split('/').pop();
    let map = null;
    if (EDITABLE.test(path)) {
      map = await docmap.buildMap(await ctx.readBytes(path), name);
    } else {
      const parsed = await ctx.readParsed(path);
      if (parsed.sheets?.length) {
        map = mapFromGrids(parsed.sheets.map((s) => ({ name: s.name, rows: s.rows })));
      } else if (parsed.needsVision || parsed.tables?.length || parsed.kind === 'pdf') {
        const t = await extractTableWithAI(path, ctx, 'the main table (learner names and their marks/scores) and any header details (school, section, month, subject)');
        map = mapFromGrids([{ name: 'Extracted', rows: [...(t.title ? [[t.title]] : []), t.columns, ...t.rows] }]);
      }
    }
    if (!map) throw new Error(`I can't read the structure of ${path} yet (supported: Word, Excel, CSV, PDF, photos).`);
    const memory = ctx.templateMemory || sharedTemplateMemory();
    const { layout, source } = await recognizeMap(map, { name, ctx, memory, renderMapForAI: docmap.renderMapForAI, hint });
    const data = extractData(map, layout);
    for (const t of data.tables) ctx.masker.addNames(t.learners.map((l) => l.name));
    ctx.masker.addNames(harvestNames(map));
    return { path, map, layout, data, source, editable: EDITABLE.test(path) && !map.readOnly };
  })();
  ctx.memory.set(key, promise);
  return promise;
}

function pickTable(data, preferPurpose) {
  const tables = data.tables.filter((t) => t.learners.length);
  if (!tables.length) return null;
  return tables.find((t) => t.purpose === preferPurpose) || [...tables].sort((a, b) => b.learners.length - a.learners.length)[0];
}

/** Asks the AI to pair the columns the code could not pair (by header meaning). */
async function aiColumnMapping(sourceTable, targetTable, instructions, ctx) {
  const { unmappedSource } = mapColumns(sourceTable, targetTable);
  const freeTargets = targetTable.columns.filter((c) => c.meaning !== 'learner_name');
  if (!unmappedSource.length || !freeTargets.length) return {};
  const describe = (c) => ({ key: c.key, header: c.header, meaning: c.meaning, ...(c.day ? { day: c.day } : {}), ...(c.date ? { date: c.date } : {}), ...(c.component ? { component: c.component } : {}), ...(c.item ? { item: c.item } : {}) });
  const res = await ctx.llm({
    system: ctx.docPersona,
    prompt: `Pair SOURCE columns with TARGET columns that hold the same information, for copying data from one school paper into another.
Return ONLY JSON {"mapping": {"<sourceKey>": "<targetKey>"}}. Only include confident pairs; leave the rest out.
${instructions ? `Teacher's instructions: ${ctx.masker.mask(instructions)}\n` : ''}SOURCE columns: ${JSON.stringify(unmappedSource.map(describe))}
TARGET columns: ${JSON.stringify(freeTargets.map(describe))}`,
    json: true,
    maxTokens: 2000,
    temperature: 0.1,
    tier: 'fast',
  });
  return res?.mapping && typeof res.mapping === 'object' ? res.mapping : {};
}

function changesArtifact({ title, subtitle, targetPath, kind, plan, extra = {} }) {
  return {
    type: 'changes',
    title,
    subtitle,
    files: [],
    editable: false,
    data: {
      targetPath,
      kind,
      edits: plan.edits,
      changes: plan.changes,
      conflicts: plan.conflicts || [],
      unmatched: plan.unmatched || [],
      unmatchedTarget: plan.unmatchedTarget || [],
      nameFixes: plan.nameFixes || [],
      columns: plan.columns || [],
      unmappedSource: plan.unmappedSource || [],
      stats: plan.stats || {},
      status: 'pending',
      ...extra,
    },
  };
}

function describeUnderstanding(u) {
  const { layout, data } = u;
  const what = DOC_TYPE_LABEL[layout.docType] || 'document';
  const facts = Object.values(data.fields).filter((f) => f.value).slice(0, 6).map((f) => `${f.label}: ${f.value}`);
  const tables = data.tables.map((t) => {
    const kinds = {};
    t.columns.forEach((c) => { kinds[c.meaning] = (kinds[c.meaning] || 0) + 1; });
    const cols = Object.entries(kinds).filter(([m]) => m !== 'learner_name').map(([m, n]) => `${n} ${m.replace('_', ' ')}`).join(', ');
    return `${t.learners.length} learners (${cols || 'names only'})`;
  });
  return `${layout.title || what} — ${what}${facts.length ? `; ${facts.join('; ')}` : ''}${tables.length ? `; ${tables.join(' + ')}` : ''}${u.source === 'memory' ? ' (recognized from a template I learned before)' : ''}`;
}

export const UNDERSTAND_TOOLS = {
  understand_file: {
    label: 'Understand file',
    description: "Recognize what a school paper is in ANY school's own format (attendance, class record, masterlist, score sheet, school form, report card...) and where its data is (names, days, scores, header facts). Use when the teacher asks what a file is/contains, or to check that KaTuro read it right. Remembers the template for next time.",
    args: '{ "path": string, "hint"?: string }',
    async run({ path, hint }, ctx, report) {
      report(`Reading the layout of ${path}…`);
      const u = await understandFile(path, ctx, { hint });
      const sheets = [{
        name: 'Fields',
        columns: [{ header: 'Detail' }, { header: 'Value' }, { header: 'Where' }],
        rows: Object.values(u.data.fields).map((f) => [f.label, String(f.value ?? ''), locationLabel(f.location)]),
      }];
      u.data.tables.forEach((t, i) => {
        sheets.push({
          name: `Table ${i + 1} (${t.purpose})`.slice(0, 31),
          columns: [{ header: 'Learner' }, ...t.columns.filter((c) => c.meaning !== 'learner_name').slice(0, 40).map((c) => ({ header: c.header || c.key }))],
          rows: t.learners.slice(0, 300).map((l) => [l.name, ...t.columns.filter((c) => c.meaning !== 'learner_name').slice(0, 40).map((c) => l.values[c.key] ?? '')]),
        });
      });
      return {
        summary: describeUnderstanding(u),
        artifacts: [{ type: 'sheet', title: `What I see in ${path.split('/').pop()}`, subtitle: describeUnderstanding(u), spec: { kind: 'sheet', title: 'Understanding', sheets }, files: [], editable: false }],
        data: { docType: u.layout.docType },
      };
    },
  },

  transfer_data: {
    label: 'Transfer data',
    description: "Copy data from one school paper into ANOTHER paper's own template without changing its formatting: e.g. attendance typed in a Word doc → the school's SF2 Excel; scores from a CSV/photo → the teacher's class record; LRN/sex from the SF1 → a masterlist. Learners are matched by LRN/name (spelling-tolerant), columns by date/day/header. Produces a change preview for the teacher to approve; the original target is backed up and a working copy is edited. Target must be .xlsx or .docx.",
    args: '{ "sourcePath": string, "targetPath": string, "instructions"?: string, "overwrite"?: boolean }',
    async run({ sourcePath, targetPath, instructions = '', overwrite = false }, ctx, report) {
      if (!EDITABLE.test(targetPath)) throw new Error('I can type data into Excel (.xlsx) and Word (.docx) files. Please choose one of those as the target.');
      report('Reading both papers…');
      const [src, tgt] = await Promise.all([understandFile(sourcePath, ctx, { hint: instructions }), understandFile(targetPath, ctx, { hint: instructions })]);
      const sTable = pickTable(src.data);
      if (!sTable) throw new Error(`I couldn't find learner data in ${sourcePath}.`);
      const tTable = pickTable(tgt.data, sTable.purpose);
      if (!tTable) throw new Error(`I couldn't find the learner list in ${targetPath} to fill in.`);

      report(`Matching ${sTable.learners.length} learners and columns…`);
      let mapping = {};
      try {
        mapping = await aiColumnMapping(sTable, tTable, instructions, ctx);
      } catch (err) {
        if (err?.code !== 'AI_UNAVAILABLE') throw err;
      }
      const plan = planTransfer(sTable, tTable, { targetKind: tgt.map.kind, mapping, overwrite });
      const s = plan.stats;
      const summary = `${s.matched}/${s.sourceLearners} learners matched, ${s.cellsToChange} cell(s) to fill${s.conflicts ? `, ${s.conflicts} already filled (kept)` : ''}${plan.unmatched.length ? `, ${plan.unmatched.length} not found in the target` : ''}. Review and tap Apply.`;
      return {
        summary,
        artifacts: [changesArtifact({
          title: `Fill ${targetPath.split('/').pop()} from ${sourcePath.split('/').pop()}`,
          subtitle: summary,
          targetPath,
          kind: tgt.map.kind,
          plan,
          extra: { sourcePath, operation: 'transfer' },
        })],
      };
    },
  },

  compare_files: {
    label: 'Compare files',
    description: 'Compare two school papers (any formats): learners missing from either, name spelling differences, and values that disagree (grades, LRN, sex, attendance, scores) — e.g. SF1 vs class record, SF5 vs e-Class Record, two versions of a masterlist. Saves a comparison report (.docx). Nothing is changed in the files.',
    args: '{ "pathA": string, "pathB": string, "instructions"?: string }',
    async run({ pathA, pathB, instructions = '' }, ctx, report) {
      report('Reading both papers…');
      const [a, b] = await Promise.all([understandFile(pathA, ctx, { hint: instructions }), understandFile(pathB, ctx, { hint: instructions })]);
      const aT = pickTable(a.data);
      const bT = pickTable(b.data, aT?.purpose);
      if (!aT || !bT) throw new Error('I need a learner list in both files to compare them.');
      let mapping = {};
      try {
        mapping = await aiColumnMapping(aT, bT, instructions, ctx);
      } catch (err) {
        if (err?.code !== 'AI_UNAVAILABLE') throw err;
      }
      const cmp = compareTables(aT, bT, { mapping });
      const nameA = pathA.split('/').pop();
      const nameB = pathB.split('/').pop();
      const blocks = [
        { type: 'paragraph', text: `**${nameA}**: ${cmp.stats.a} learners. **${nameB}**: ${cmp.stats.b} learners. Matched: ${cmp.stats.matched}. Values that disagree: ${cmp.stats.mismatches}.` },
        { type: 'heading', level: 2, text: `Only in ${nameA} (${cmp.onlyInA.length})` },
        cmp.onlyInA.length ? { type: 'table', columns: ['Learner', `Closest name in ${nameB}`], rows: cmp.onlyInA.map((x) => [x.name, x.closest ? `${x.closest.name} (${Math.round(x.closest.score * 100)}%)` : '—']) } : { type: 'paragraph', text: 'None.' },
        { type: 'heading', level: 2, text: `Only in ${nameB} (${cmp.onlyInB.length})` },
        cmp.onlyInB.length ? { type: 'bullets', items: cmp.onlyInB } : { type: 'paragraph', text: 'None.' },
        { type: 'heading', level: 2, text: `Name spelling differences (${cmp.nameVariants.length})` },
        cmp.nameVariants.length ? { type: 'table', columns: [nameA, nameB, 'Similarity'], rows: cmp.nameVariants.map((v) => [v.a, v.b, `${Math.round(v.score * 100)}%`]) } : { type: 'paragraph', text: 'None.' },
        { type: 'heading', level: 2, text: `Values that disagree (${cmp.mismatches.length})` },
        cmp.mismatches.length
          ? { type: 'table', columns: ['Learner', 'What', nameA, nameB, `Where in ${nameA}`, `Where in ${nameB}`], rows: cmp.mismatches.slice(0, 500).map((m) => [m.learner, m.column, String(m.a), String(m.b), m.aLocation, m.bLocation]) }
          : { type: 'paragraph', text: 'None — every compared value matches.' },
        { type: 'heading', level: 3, text: 'Columns compared' },
        cmp.comparedColumns.length ? { type: 'bullets', items: cmp.comparedColumns.map((c) => `${c.a} ↔ ${c.b}`) } : { type: 'paragraph', text: 'Only the learner lists were compared (no shared columns found).' },
      ];
      const spec = normalizeDocumentSpec({
        title: 'Comparison Report',
        subtitle: `${nameA} vs ${nameB}`,
        header: headerFor(ctx),
        meta: baseMeta(ctx, [{ label: 'Date', value: new Date().toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' }) }]),
        orientation: cmp.mismatches.length ? 'landscape' : 'portrait',
        blocks,
        signatures: teacherSignatures(ctx).slice(0, 1),
      });
      const files = await saveDocumentOutputs(spec, slug(`Comparison_${nameA}_vs_${nameB}`, 70), ['docx'], ctx);
      const summary = `${cmp.onlyInA.length} only in ${nameA}, ${cmp.onlyInB.length} only in ${nameB}, ${cmp.nameVariants.length} spelling difference(s), ${cmp.mismatches.length} value(s) that disagree`;
      return { summary, artifacts: [documentArtifact(spec, files, { subtitle: summary, data: cmp })] };
    },
  },

  voice_encode_scores: {
    label: 'Encode scores by voice',
    description: "Open the voice score-encoding panel for the teacher's OWN class record or score sheet (Excel or Word). The teacher reads names and scores aloud (or only the scores, going down the list); KaTuro matches each one to the learner list in that file and shows them for checking before anything is written (review, then Apply: original backed up, working copy edited). Use when the teacher wants to encode, enter, record or type scores by voice, by speaking or by dictating.",
    args: '{ "targetPath": string, "column"?: string (header or column letter of the score column, only if the teacher said it) }',
    async run({ targetPath, column }, ctx, report) {
      if (!EDITABLE.test(targetPath || '')) throw new Error('Voice encoding fills an Excel (.xlsx) or Word (.docx) class record or score sheet. Please choose one of those.');
      report(`Reading the learner list in ${targetPath}…`);
      const u = await understandFile(targetPath, ctx);
      if (!u.editable) throw new Error(`${targetPath} can't be edited (it may be protected or read-only).`);
      const table = pickTable(u.data, 'class_record');
      if (!table) throw new Error(`I couldn't find a learner list in ${targetPath}.`);
      // Only columns a score can go into (never names, totals, grades or attendance).
      const columns = table.columns
        .filter((c) => c.meaning === 'score' || c.meaning === 'other')
        .map((c) => ({ key: c.key, header: c.header || '', column: String(c.column ?? ''), meaning: c.meaning, ...(c.component ? { component: c.component } : {}), ...(Number.isFinite(c.item) ? { item: c.item } : {}), ...(Number.isFinite(c.max) && c.max > 0 ? { max: c.max } : {}) }));
      if (!columns.length) throw new Error(`I couldn't find a score column in ${targetPath}.`);
      const wanted = String(column || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
      const pre = wanted ? columns.find((c) => c.header.toLowerCase().replace(/[^a-z0-9]+/g, '') === wanted || c.column.toLowerCase() === wanted) : null;
      const name = targetPath.split('/').pop();
      const summary = `${table.learners.length} learners found in ${name}. ${pre ? `Column ${pre.header || pre.column} is selected.` : 'Choose the score column in the Canvas.'} Then press the microphone and read the scores in English.`;
      return {
        summary,
        artifacts: [{
          type: 'voice_scores',
          title: `Voice encoding: ${name}`,
          subtitle: `${table.learners.length} learners`,
          files: [],
          editable: false,
          data: {
            targetPath,
            kind: u.map.kind,
            learners: table.learners.map((l) => ({ name: l.name, values: l.values, cells: l.cells })),
            columns,
            columnKey: pre?.key || '',
          },
        }],
      };
    },
  },

  edit_file: {
    label: 'Edit file',
    description: 'Make specific changes inside an existing Word or Excel file while keeping its exact formatting: e.g. "change the school year to 2026-2027", "fill the remarks column: Passed if grade ≥ 75", "put my name as adviser", "correct Juan\'s LRN". Only the needed cells/paragraphs change. Produces a change preview for approval; original backed up, working copy edited.',
    args: '{ "path": string, "instructions": string }',
    async run({ path, instructions = '' }, ctx, report) {
      if (!EDITABLE.test(path)) throw new Error('I can edit Excel (.xlsx) and Word (.docx) files in place. For other files, ask me to create a new document instead.');
      report(`Reading ${path}…`);
      const docmap = await import('../docmap/index.js');
      const map = await docmap.buildMap(await ctx.readBytes(path), path.split('/').pop());
      ctx.masker.addNames(harvestNames(map));
      report('Working out the exact changes…');
      const isX = map.kind === 'xlsx';
      const raw = await ctx.llm({
        system: `${ctx.docPersona}\nYou edit school documents surgically: change only what the teacher asked, nothing else.`,
        prompt: `Return ONLY JSON {"edits": [...], "note": string}.
${isX ? 'Each edit: {"sheet": string, "cell": "F12", "value": number|string|null}. Numbers as JSON numbers. Do not write into cells that contain formulas.' : 'Each edit: {"id": "p3" | "t0.r5.c2", "text": string} to replace a paragraph/cell text, or {"find": string, "replace": string} to change words wherever they appear.'}
Use only addresses from the map. Keep learner codes like "Learner 01" exactly as written.
Teacher's request: ${ctx.masker.mask(instructions)}

Document map:
${ctx.masker.mask(docmap.renderMapForAI(map, { maxRows: 150, maxChars: 30000 }))}`,
        json: true,
        maxTokens: 6000,
        temperature: 0.1,
      });
      const edits = ctx.masker.unmask(Array.isArray(raw?.edits) ? raw.edits : []).filter((e) => e && (isX ? e.sheet && /^[A-Z]{1,3}\d+$/.test(String(e.cell)) : e.id || e.find));
      if (!edits.length) throw new Error(raw?.note ? `No changes made: ${ctx.masker.unmask(raw.note)}` : 'I could not find what to change. Could you say it more specifically?');
      const changes = edits.map((e) => {
        if (isX) {
          const before = map.sheets.find((s) => s.name === e.sheet)?.cells?.[e.cell];
          return { learner: '', column: '', location: `${e.sheet}!${e.cell}`, before: before ? (before.text ?? before.v ?? '') : '', after: e.value ?? '' };
        }
        if (e.find) return { learner: '', column: '', location: 'Find & replace', before: e.find, after: e.replace ?? '' };
        return { learner: '', column: '', location: locationLabel({ id: e.id }), before: '', after: e.text ?? '' };
      });
      const summary = `${edits.length} change(s) ready${raw?.note ? ` — ${ctx.masker.unmask(raw.note)}` : ''}. Review and tap Apply.`;
      return {
        summary,
        artifacts: [changesArtifact({
          title: `Changes to ${path.split('/').pop()}`,
          subtitle: summary,
          targetPath: path,
          kind: map.kind,
          plan: { edits, changes, stats: { cellsToChange: edits.length } },
          extra: { operation: 'edit' },
        })],
      };
    },
  },
};
