/**
 * recognize.js — "what is this file, and which part means what?"
 *
 * Works on any school's own template: the AI reads the addressed document map
 * (docmap/renderForAI) and returns a LAYOUT — addresses, never values. Code then
 * extracts data deterministically from those addresses (extract.js), so numbers
 * and names come from the file itself, not from the AI.
 *
 * Layout:
 * {
 *   docType: 'attendance'|'class_record'|'masterlist'|'scores'|'item_analysis'|'grades_summary'|'report_card'|'lesson_plan'|'letter'|'certificate'|'form'|'other',
 *   title, summary, confidence,
 *   fields:  [{ key, label, location }]       // header facts: school, section, adviser, month, quarter...
 *   tables:  [{
 *     id, purpose: 'roster'|'attendance'|'scores'|'grades'|'other',
 *     location,                                // xlsx { sheet, firstRow, lastRow }  docx { table, firstRow, lastRow }
 *     nameColumn,                              // xlsx 'B' | docx column index
 *     columns: [{ key, column, header, meaning, date?, day?, component?, item?, max? }],
 *     marks?: { absent: string[], present: string[], tardy: string[] }
 *   }]
 * }
 * location for fields: xlsx { sheet, cell } | docx { id }
 */

import { labelSet } from './fingerprint.js';

export const DOC_TYPES = ['attendance', 'class_record', 'masterlist', 'scores', 'item_analysis', 'grades_summary', 'report_card', 'lesson_plan', 'letter', 'certificate', 'form', 'other'];
export const MEANINGS = ['learner_name', 'lrn', 'sex', 'date', 'day', 'score', 'hps', 'total', 'average', 'grade', 'remarks', 'absences', 'tardies', 'number', 'other'];

const PERSON_NAME = /^[A-ZÑ][A-Za-zñÑ.'\- ]+,\s*[A-Za-zñÑ][A-Za-zñÑ.'\- ]*$/;
const DIVIDER = /^(male|female|boys?|girls?|lalaki|babae|total|average|mean|hps|highest possible score|prepared by|checked by|noted by)\b/i;

/** Learner-looking names anywhere in the map, so they can be masked before the AI sees it. */
export function harvestNames(map) {
  const names = new Set();
  const add = (t) => {
    const s = String(t ?? '').replace(/\s+/g, ' ').trim();
    if (s.length >= 5 && s.length <= 60 && PERSON_NAME.test(s)) names.add(s);
  };
  if (map?.kind === 'xlsx') {
    for (const sh of map.sheets || []) for (const c of Object.values(sh.cells || {})) add(c.text ?? c.v);
  } else if (map?.kind === 'docx') {
    const walk = (blocks) => {
      for (const b of blocks || []) {
        if (b.type === 'paragraph') add(b.text);
        if (b.type === 'table') for (const row of b.rows || []) for (const cell of row) add(cell.text);
      }
    };
    walk(map.blocks);
  }
  return [...names];
}

const LAYOUT_GUIDE = `Return ONLY JSON describing the document's STRUCTURE (addresses), not its data:
{
  "docType": one of ${JSON.stringify(DOC_TYPES)},
  "title": string, "summary": string (one sentence: what this paper is, for which class/period),
  "confidence": number 0..1,
  "fields": [{ "key": "school"|"school_id"|"grade_section"|"adviser"|"teacher"|"subject"|"month"|"quarter"|"school_year"|"date"|string, "label": string, "location": XLSX {"sheet": string, "cell": "C3"} or DOCX {"id": "p2" | "t0.r0.c1"} }],
  "tables": [{
    "id": "roster1", "purpose": "roster"|"attendance"|"scores"|"grades"|"other",
    "location": XLSX {"sheet": string, "firstRow": number, "lastRow": number} or DOCX {"table": "t0", "firstRow": number, "lastRow": number},
    "nameColumn": XLSX column letter like "B" or DOCX 0-based column index,
    "columns": [{ "key": short unique key, "column": XLSX letter or DOCX index, "header": string, "meaning": one of ${JSON.stringify(MEANINGS)}, "date"?: "YYYY-MM-DD", "day"?: day-of-month number, "component"?: "WW"|"PT"|"QA", "item"?: number, "max"?: number }],
    "marks"?: { "absent": [strings that mean absent, e.g. "x","A"], "present": [...], "tardy": [...] }
  }]
}
Rules:
- firstRow/lastRow are the first and last LEARNER rows (data), not headers. Rows with MALE/FEMALE/TOTAL inside the range are fine; they are skipped automatically.
- The field "location" points at the cell/paragraph that holds the VALUE (e.g. the cell to the right of "School Name:"), or the same cell if label and value share it.
- List every meaningful column (each school day, each quiz item, each score). For attendance, give each day column its "day" (and "date" if the month/year is known).
- Learner names may appear as codes like "Learner 01" (privacy masking) — treat them as names.
- Only use addresses that exist in the map. If something is not in the document, leave it out.`;

/** Removes anything the map cannot back up (AI mistakes) and fills safe defaults. */
export function validateLayout(raw, map) {
  const out = { docType: DOC_TYPES.includes(raw?.docType) ? raw.docType : 'other', title: String(raw?.title || ''), summary: String(raw?.summary || ''), confidence: Math.max(0, Math.min(1, Number(raw?.confidence) || 0.5)), fields: [], tables: [] };
  const isX = map.kind === 'xlsx';
  const sheetNames = new Set((map.sheets || []).map((s) => s.name));
  const docTables = new Map((map.blocks || []).filter((b) => b.type === 'table').map((b) => [b.id, b]));
  const docIds = new Set();
  for (const b of map.blocks || []) {
    if (b.type === 'paragraph') docIds.add(b.id);
    if (b.type === 'table') b.rows.forEach((r) => r.forEach((c) => docIds.add(c.id)));
  }

  for (const f of Array.isArray(raw?.fields) ? raw.fields : []) {
    const loc = f?.location || {};
    const ok = isX ? sheetNames.has(loc.sheet) && /^[A-Z]{1,3}\d+$/.test(String(loc.cell || '')) : docIds.has(loc.id);
    if (ok && f.key) out.fields.push({ key: String(f.key), label: String(f.label || f.key), location: isX ? { sheet: loc.sheet, cell: loc.cell } : { id: loc.id } });
  }

  for (const [i, t] of (Array.isArray(raw?.tables) ? raw.tables : []).entries()) {
    const loc = t?.location || {};
    const firstRow = Math.floor(Number(loc.firstRow));
    const lastRow = Math.floor(Number(loc.lastRow));
    if (!Number.isFinite(firstRow) || !Number.isFinite(lastRow) || lastRow < firstRow) continue;
    if (isX && !sheetNames.has(loc.sheet)) continue;
    if (!isX && !docTables.has(loc.table)) continue;
    const colOk = (c) => (isX ? /^[A-Z]{1,3}$/.test(String(c)) : Number.isInteger(Number(c)) && Number(c) >= 0);
    const columns = (Array.isArray(t.columns) ? t.columns : [])
      .filter((c) => c && colOk(c.column))
      .map((c, j) => ({
        key: String(c.key || `${c.meaning || 'col'}_${j}`),
        column: isX ? String(c.column) : Number(c.column),
        header: String(c.header || ''),
        meaning: MEANINGS.includes(c.meaning) ? c.meaning : 'other',
        ...(c.date && /^\d{4}-\d{2}-\d{2}$/.test(c.date) ? { date: c.date } : {}),
        ...(Number.isFinite(Number(c.day)) && c.day !== null && c.day !== '' ? { day: Number(c.day) } : {}),
        ...(['WW', 'PT', 'QA'].includes(c.component) ? { component: c.component } : {}),
        ...(Number.isFinite(Number(c.item)) && c.item !== null ? { item: Number(c.item) } : {}),
        ...(Number.isFinite(Number(c.max)) && c.max !== null ? { max: Number(c.max) } : {}),
      }));
    // Unique keys (the AI sometimes repeats them).
    const seen = new Set();
    for (const c of columns) {
      let k = c.key;
      let n = 2;
      while (seen.has(k)) k = `${c.key}_${n++}`;
      c.key = k;
      seen.add(k);
    }
    const nameColumn = colOk(t.nameColumn) ? (isX ? String(t.nameColumn) : Number(t.nameColumn)) : columns.find((c) => c.meaning === 'learner_name')?.column;
    if (nameColumn === undefined) continue;
    const marks = t.marks && typeof t.marks === 'object'
      ? { absent: (t.marks.absent || []).map(String), present: (t.marks.present || []).map(String), tardy: (t.marks.tardy || []).map(String) }
      : undefined;
    out.tables.push({
      id: String(t.id || `table${i + 1}`),
      purpose: ['roster', 'attendance', 'scores', 'grades', 'other'].includes(t.purpose) ? t.purpose : 'other',
      location: isX ? { sheet: loc.sheet, firstRow, lastRow } : { table: loc.table, firstRow, lastRow },
      nameColumn,
      columns,
      ...(marks ? { marks } : {}),
    });
  }
  return out;
}

export function isDividerText(text) {
  return DIVIDER.test(String(text ?? '').trim());
}

/**
 * Recognizes a mapped document. Uses the template memory first (instant, no AI),
 * then the AI. `ctx` needs: llm(), masker; `memory` = templateMemory.
 * Returns { layout, source: 'memory'|'ai', score? }.
 */
export async function recognizeMap(map, { name, ctx, memory, renderMapForAI, hint = '' }) {
  const labels = labelSet(map);
  const remembered = memory?.find(map.kind, labels);
  if (remembered) {
    const layout = validateLayout(remembered.entry.layout, map);
    if (layout.tables.length || layout.fields.length) {
      memory.touch(remembered.entry);
      return { layout, source: 'memory', score: remembered.score };
    }
  }

  ctx.masker.addNames(harvestNames(map));
  const mapText = ctx.masker.mask(renderMapForAI(map, { maxRows: 90, maxChars: 26000 }));
  const raw = await ctx.llm({
    system: 'You are an expert at reading Philippine DepEd and school documents in ANY school or division format (school forms, class records, attendance, masterlists, test results, letters). You locate where things are in a document precisely.',
    prompt: `${LAYOUT_GUIDE}\n\nFile name: ${name}${hint ? `\nTeacher's note: ${ctx.masker.mask(hint)}` : ''}\n\nDocument map (addresses on the left):\n${mapText}`,
    json: true,
    maxTokens: 6000,
    temperature: 0.1,
    // Full model on purpose: this runs once per school template (then it's remembered), so accuracy beats speed.
    tier: 'standard',
  });
  const layout = validateLayout(raw, map);
  if (memory && (layout.tables.length || layout.fields.length) && layout.confidence >= 0.6) {
    memory.save({ kind: map.kind, labels, layout, sourceName: name });
  }
  return { layout, source: 'ai' };
}
