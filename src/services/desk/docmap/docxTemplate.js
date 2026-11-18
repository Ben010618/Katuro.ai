/**
 * docxTemplate.js — a new Word document from a COPY of the teacher's template.
 *
 * The template's own XML is kept: page size, margins, fonts, sizes, colours, headers and
 * footers, logos, table borders and shading. Only the content changes, by these operations
 * (ids from the template's map, docxMap.js; all refer to the template as it was):
 *
 *   { id: 'p7', text }               new text for a paragraph (or a table cell 't0.r2.c1');
 *                                    lines separated by "\n" in a paragraph become separate
 *                                    paragraphs that look the same (more steps, more objectives…)
 *   { id: 't1.r3', rows: [[…], …] }  that table row is the model for these rows (one array of
 *                                    cell texts per row): more or fewer rows, each formatted alike
 *   { id, remove: true }             a paragraph, a table row ('t1.r3') or a whole table ('t2')
 *
 * The result is always a valid Word file: the last paragraph of a cell, header, footer or the
 * document is emptied instead of removed (they must end with a paragraph), and a table whose
 * rows would all go is removed whole.
 *
 * → { bytes, applied: [{ id, op }], skipped: [{ id, reason }] }
 */
import { parseXml, kids, raw, openTag } from './xml';
import { loadZip, readText, writeZip, toUint8 } from './zip';
import { walkContainer, indexBlocks, partContainer } from './docxMap';
import { setParagraphXml, setCellXml, stripParaIds, partPrefixOf, docxPartsByPrefix } from './docxPatch';

const removesRow = (op) => op.remove || (Array.isArray(op.rows) && op.rows.length === 0);
const SECTION = /<(\w+:)?sectPr[\s>/]/;
// A copied cell must not continue or restart a vertical merge of the model row.
const noMerge = (s) => s.replace(/<(\w+:)?vMerge\b[^>]*\/>/g, '').replace(/<(\w+:)?vMerge\b[^>]*>\s*<\/(\w+:)?vMerge>/g, '');

/** One table row built from the model row `tr` with these cell texts (null when it cannot be). */
function rowXml(xml, tr, cells, copy) {
  if (tr.selfClosing) return null;
  let out = openTag(xml, tr);
  let ci = 0;
  for (const c of kids(tr)) {
    if (c.name === 'tc') {
      const cellText = cells[ci++];
      const made = setCellXml(xml, c, cellText === undefined || cellText === null ? '' : String(cellText));
      if (made === null) return null;
      out += copy ? noMerge(made) : made;
    } else if (c.name === 'sdt' || c.name === 'customXml') return null;
    else out += raw(xml, c);
  }
  out += xml.slice(tr.closeStart, tr.end);
  return copy ? stripParaIds(out) : out;
}

/** Paragraph ids that are the last block of their container (a cell, or the part itself). */
function lastParagraphs(blocks, out = new Set()) {
  const last = blocks[blocks.length - 1];
  if (last?.type === 'paragraph') out.add(last.id);
  for (const b of blocks) {
    if (b.type !== 'table') continue;
    for (const row of b.rows) {
      for (const cell of row) {
        const inner = [...cell.paragraphs, ...cell.tables].sort((x, y) => x.node.start - y.node.start);
        lastParagraphs(inner, out);
      }
    }
  }
  return out;
}

/** Ops made safe for this part: see the header. */
function normalize(list, blocks, index) {
  const keepLast = lastParagraphs(blocks);
  let ops = list.map((op) => (op.remove && keepLast.has(op.id) && index.get(op.id)?.kind === 'paragraph' ? { ...op, remove: false, text: '', emptied: true } : op));
  // Tables whose rows would all go: the whole table goes instead.
  for (const [id, hit] of index) {
    if (hit.kind !== 'table') continue;
    const n = hit.block.rows.length;
    const gone = new Set(ops.filter((op) => removesRow(op) && new RegExp(`^${id.replace(/[.:]/g, '\\$&')}\\.r\\d+$`).test(op.id)).map((op) => op.id));
    if (n && gone.size === n) ops = [...ops.filter((op) => !gone.has(op.id)), { id, remove: true }];
  }
  return ops;
}

export async function applyTemplateEdits(bytes, ops = []) {
  const zip = await loadZip(bytes);
  const partByPrefix = await docxPartsByPrefix(zip);
  const applied = [];
  const skipped = [];
  const byPart = new Map();
  for (const op of ops) {
    if (!op || typeof op.id !== 'string') { skipped.push({ id: op?.id, reason: 'invalid' }); continue; }
    const pre = partPrefixOf(op.id);
    if (!partByPrefix.has(pre)) { skipped.push({ id: op.id, reason: 'notFound' }); continue; }
    if (!byPart.has(pre)) byPart.set(pre, []);
    byPart.get(pre).push(op);
  }

  let changed = false;
  for (const [pre, list] of byPart) {
    const path = partByPrefix.get(pre);
    const xml = await readText(zip, path);
    const container = xml === null ? null : partContainer(parseXml(xml));
    if (!container) { for (const op of list) skipped.push({ id: op.id, reason: 'notFound' }); continue; }
    const blocks = walkContainer(xml, container, pre);
    const index = indexBlocks(blocks);
    const splices = [];
    const overlaps = (s, e) => splices.some((x) => s < x.end && x.start < e);
    for (const op of normalize(list, blocks, index)) {
      const hit = index.get(op.id);
      if (!hit?.block?.node) { skipped.push({ id: op.id, reason: 'notFound' }); continue; }
      const node = hit.block.node;
      if (overlaps(node.start, node.end)) { skipped.push({ id: op.id, reason: 'overlap' }); continue; }
      let text;
      let kind;
      if (op.remove) {
        // A paragraph holding a section break keeps it (emptied instead).
        if (hit.kind === 'paragraph' && SECTION.test(raw(xml, node))) { text = setParagraphXml(xml, node, ''); kind = 'emptied'; }
        else if (hit.kind === 'paragraph' || hit.kind === 'row' || hit.kind === 'table') { text = ''; kind = 'removed'; }
        else { skipped.push({ id: op.id, reason: 'unsupported' }); continue; }
        if (text === null) { skipped.push({ id: op.id, reason: 'complex' }); continue; }
      } else if (Array.isArray(op.rows)) {
        if (hit.kind !== 'row') { skipped.push({ id: op.id, reason: 'notARow' }); continue; }
        const made = op.rows.map((cells, i) => rowXml(xml, node, Array.isArray(cells) ? cells : [cells], i > 0));
        if (made.some((m) => m === null)) { skipped.push({ id: op.id, reason: 'complex' }); continue; }
        text = made.join('');
        kind = `rows:${op.rows.length}`;
      } else if (op.text !== undefined || Array.isArray(op.lines)) {
        const lines = Array.isArray(op.lines) ? op.lines.map(String) : String(op.text ?? '').split('\n');
        if (hit.kind === 'paragraph') {
          // The original paragraph comes last: it keeps any section break and bookmarks.
          const parts = lines.map((l, i) => setParagraphXml(xml, node, l, { clone: i < lines.length - 1 }));
          if (parts.some((x) => x === null)) { skipped.push({ id: op.id, reason: 'complex' }); continue; }
          text = parts.join('');
        } else if (hit.kind === 'cell') {
          text = setCellXml(xml, node, lines.join('\n'));
          if (text === null) { skipped.push({ id: op.id, reason: 'complex' }); continue; }
        } else { skipped.push({ id: op.id, reason: 'unsupported' }); continue; }
        kind = op.emptied ? 'emptied' : 'text';
      } else { skipped.push({ id: op.id, reason: 'invalid' }); continue; }
      splices.push({ start: node.start, end: node.end, text });
      applied.push({ id: op.id, op: kind });
    }
    if (splices.length) {
      splices.sort((a, b) => b.start - a.start);
      let out = xml;
      for (const s of splices) out = out.slice(0, s.start) + s.text + out.slice(s.end);
      zip.file(path, out);
      changed = true;
    }
  }
  return { bytes: changed ? await writeZip(zip) : toUint8(bytes), applied, skipped };
}
