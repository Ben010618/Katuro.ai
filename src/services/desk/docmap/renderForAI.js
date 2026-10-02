// Compact, addressable text views of a document map for the LLM.
import { parseAddr, indexToCol } from './addr';
import { numberText } from './xlsxMap';

const clip = (s, n) => {
  const t = String(s ?? '').replace(/\r?\n/g, ' / ');
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
};

function cellValueText(cell) {
  if (typeof cell.v === 'number' && cell.text === numberText(cell.v)) return numberText(cell.v);
  return cell.text;
}

// Choose which of `items` to show: all, or head + tail with an omission note.
function capRows(items, maxRows) {
  if (items.length <= maxRows) return { head: items, tail: [], omitted: 0 };
  const headN = Math.max(1, Math.floor(maxRows / 2));
  const tailN = Math.max(1, Math.floor(maxRows / 6));
  return { head: items.slice(0, headN), tail: items.slice(items.length - tailN), omitted: items.length - headN - tailN };
}

function renderSheet(sheet, { maxRows, maxCellsPerRow }) {
  const merges = sheet.merges.length
    ? `, merges: ${sheet.merges.slice(0, 30).join(', ')}${sheet.merges.length > 30 ? `, … +${sheet.merges.length - 30}` : ''}`
    : '';
  const lines = [`### Sheet "${sheet.name}"${sheet.state === 'hidden' ? ' [hidden]' : ''} (rows 1–${sheet.maxRow}${merges})`];
  const byRow = new Map();
  for (const [addr, cell] of Object.entries(sheet.cells)) {
    const a = parseAddr(addr);
    if (!a) continue;
    if (!byRow.has(a.row)) byRow.set(a.row, []);
    byRow.get(a.row).push({ col: a.col, cell });
  }
  const rowNums = [...byRow.keys()].sort((x, y) => x - y);
  const rowLine = (r) => {
    const cells = byRow.get(r).sort((x, y) => x.col - y.col);
    const parts = cells.slice(0, maxCellsPerRow).map(({ col, cell }) => {
      const val = clip(cellValueText(cell), 60);
      return cell.f !== undefined ? `${indexToCol(col)}${r}:=${clip(cell.f, 60)}→${val}` : `${indexToCol(col)}${r}:${val}`;
    });
    if (cells.length > maxCellsPerRow) parts.push(`… +${cells.length - maxCellsPerRow} cells`);
    return `${r} | ${parts.join(' | ')}`;
  };
  const { head, tail, omitted } = capRows(rowNums, maxRows);
  for (const r of head) lines.push(rowLine(r));
  if (omitted) lines.push(`… (${omitted} rows omitted; rows look like row ${head[head.length - 1]})`);
  for (const r of tail) lines.push(rowLine(r));
  if (!rowNums.length) lines.push('(empty)');
  return lines.join('\n');
}

function renderTable(t, opts, indent = '') {
  const cols = Math.max(0, ...t.rows.map((r) => r.reduce((n, c) => n + (c.gridSpan || 1), 0)));
  const lines = [`${indent}[${t.id}] table ${t.rows.length}×${cols}`];
  const rowLine = (row, ri) => {
    const nonEmpty = row.filter((c) => c.text.trim() !== '');
    const parts = nonEmpty.slice(0, opts.maxCellsPerRow).map((c) => `${c.id.slice(c.id.lastIndexOf('.') + 1)}:${clip(c.text, 60)}`);
    if (nonEmpty.length > opts.maxCellsPerRow) parts.push(`… +${nonEmpty.length - opts.maxCellsPerRow} cells`);
    const out = [`${indent}[${t.id}.r${ri}] ${parts.join(' | ') || '(empty)'}`];
    for (const c of row) for (const nt of c.tables || []) out.push(renderTable(nt, opts, `${indent}  `));
    return out.join('\n');
  };
  const idx = t.rows.map((_, i) => i);
  const { head, tail, omitted } = capRows(idx, opts.maxRows);
  for (const i of head) lines.push(rowLine(t.rows[i], i));
  if (omitted) lines.push(`${indent}… (${omitted} rows omitted; rows look like [${t.id}.r${head[head.length - 1]}])`);
  for (const i of tail) lines.push(rowLine(t.rows[i], i));
  return lines.join('\n');
}

function renderBlocks(blocks, opts) {
  const lines = [];
  let empties = [];
  const flush = () => {
    if (!empties.length) return;
    lines.push(empties.length === 1 ? `[${empties[0]}] (empty)` : `[${empties[0]}..${empties[empties.length - 1]}] (${empties.length} empty paragraphs)`);
    empties = [];
  };
  for (const b of blocks) {
    if (b.type === 'paragraph') {
      if (b.isEmpty) {
        empties.push(b.id);
        continue;
      }
      flush();
      lines.push(`[${b.id}]${b.style ? ` {${b.style}}` : ''} ${clip(b.text, 300)}`);
    } else {
      flush();
      lines.push(renderTable(b, opts));
    }
  }
  flush();
  return lines.join('\n');
}

export function renderMapForAI(map, { maxRows = 120, maxCellsPerRow = 40, maxChars = 30000, sheets } = {}) {
  if (!map) return '';
  const opts = { maxRows, maxCellsPerRow };
  let out;
  if (map.kind === 'xlsx') {
    const list = sheets && sheets.length ? map.sheets.filter((s) => sheets.includes(s.name)) : map.sheets;
    out = list.map((s) => renderSheet(s, opts)).join('\n\n');
  } else if (map.kind === 'docx') {
    const parts = [renderBlocks(map.blocks, opts)];
    for (const h of map.headers || []) parts.push(`--- Header (${h.part}) ---\n${renderBlocks(h.blocks, opts)}`);
    for (const f of map.footers || []) parts.push(`--- Footer (${f.part}) ---\n${renderBlocks(f.blocks, opts)}`);
    out = parts.filter(Boolean).join('\n\n');
  } else return '';
  if (out.length > maxChars) out = `${out.slice(0, maxChars)}\n… (truncated)`;
  return out;
}

export function describeMap(map) {
  if (!map) return '';
  if (map.kind === 'xlsx') {
    const n = map.sheets.length;
    const shown = map.sheets.slice(0, 3).map((s) => `${s.name} (${s.maxRow} rows × ${s.maxCol} cols)`).join(', ');
    return `Excel · ${n} sheet${n === 1 ? '' : 's'} · ${shown}${n > 3 ? ', …' : ''}`;
  }
  if (map.kind === 'docx') {
    const p = map.blocks.filter((b) => b.type === 'paragraph' && !b.isEmpty).length;
    const t = map.blocks.filter((b) => b.type === 'table').length;
    const extra = [];
    if (map.headers && map.headers.length) extra.push(`${map.headers.length} header${map.headers.length === 1 ? '' : 's'}`);
    return `Word · ${p} paragraph${p === 1 ? '' : 's'} · ${t} table${t === 1 ? '' : 's'}${extra.length ? ` · ${extra.join(' · ')}` : ''}`;
  }
  return '';
}
