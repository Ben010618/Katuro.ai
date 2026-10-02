// Read any .xlsx/.xlsm into an addressable cell map straight from the OOXML.
import { parseXml, kids, kid, getAttr, textOf, rootElement, descendants } from './xml';
import { loadZip, readText, readRels, mainPartPath, INVALID_FILE } from './zip';
import { parseAddr, makeAddr, parseRange, indexToCol, colToIndex } from './addr';

// ---------- workbook-level context (shared with xlsxPatch) ----------

export async function loadWorkbook(zip) {
  const wbPath = await mainPartPath(zip, 'xl/workbook.xml');
  if (!wbPath) throw new Error(INVALID_FILE);
  const wbXml = await readText(zip, wbPath);
  const wbTree = parseXml(wbXml);
  const wbEl = rootElement(wbTree);
  if (!wbEl || wbEl.name !== 'workbook') throw new Error(INVALID_FILE);
  const rels = await readRels(zip, wbPath);
  const relById = new Map(rels.map((r) => [r.id, r]));

  const wbPr = kid(wbEl, 'workbookPr');
  const d1904 = getAttr(wbPr, 'date1904');
  const date1904 = d1904 === '1' || d1904 === 'true';

  const sheets = kids(kid(wbEl, 'sheets'), 'sheet').map((s, index) => {
    const rel = relById.get(getAttr(s, 'r:id') || getAttr(s, 'id'));
    return {
      name: getAttr(s, 'name') || `Sheet${index + 1}`,
      index,
      xmlPath: rel && rel.path ? rel.path : null,
      state: getAttr(s, 'state') === 'hidden' || getAttr(s, 'state') === 'veryHidden' ? 'hidden' : 'visible',
    };
  });

  const definedNames = kids(kid(wbEl, 'definedNames'), 'definedName').map((d) => {
    const out = { name: getAttr(d, 'name'), ref: textOf(wbXml, d) };
    const ls = getAttr(d, 'localSheetId');
    if (ls !== undefined && sheets[Number(ls)]) out.sheet = sheets[Number(ls)].name;
    return out;
  });

  const ssRel = rels.find((r) => /\/sharedStrings$/.test(r.type));
  const stRel = rels.find((r) => /\/styles$/.test(r.type));
  const sharedStrings = parseSharedStrings(ssRel && ssRel.path ? await readText(zip, ssRel.path) : null);
  const styles = parseStyles(stRel && stRel.path ? await readText(zip, stRel.path) : null);

  return { wbPath, wbXml, wbTree, wbEl, rels, sheets, definedNames, sharedStrings, styles, date1904 };
}

// Excel escapes some characters as _xHHHH_ in strings.
export function decodeXEscapes(s) {
  return s.indexOf('_x') < 0 ? s : s.replace(/_x([0-9A-Fa-f]{4})_/g, (a, h) => String.fromCharCode(parseInt(h, 16)));
}

const SKIP_PHONETIC = new Set(['rPh', 'phoneticPr']);

// Text of an <si>/<is>: plain <t> or rich runs <r><t>, ignoring phonetic runs.
export function stringItemText(xml, node) {
  let s = '';
  for (const t of descendants(node, 't', SKIP_PHONETIC)) s += textOf(xml, t);
  return decodeXEscapes(s);
}

function parseSharedStrings(xml) {
  if (!xml) return [];
  const tree = parseXml(xml);
  return kids(rootElement(tree), 'si').map((si) => stringItemText(xml, si));
}

const BUILTIN_KIND = {
  14: 'date', 15: 'date', 16: 'date', 17: 'date', 22: 'datetime',
  18: 'time', 19: 'time', 20: 'time', 21: 'time', 45: 'time', 46: 'time', 47: 'time',
};

export function formatKind(numFmtId, code) {
  if (BUILTIN_KIND[numFmtId]) return BUILTIN_KIND[numFmtId];
  if (!code) return null;
  const sec = code.split(';')[0]
    .replace(/"[^"]*"/g, '')
    .replace(/\\./g, '')
    .replace(/[_*]./g, '')
    .replace(/\[[^\]]*\]/g, '')
    .toLowerCase();
  if (/^general$/.test(sec.trim())) return null;
  const hasTime = /[hs]/.test(sec);
  const hasDate = /[dy]/.test(sec) || (/m/.test(sec) && !hasTime);
  if (hasDate && hasTime) return 'datetime';
  if (hasDate) return 'date';
  if (hasTime && /[hs]/.test(sec.replace(/am\/pm|a\/p/g, ''))) return 'time';
  return null;
}

function parseStyles(xml) {
  const kindByStyle = [];
  if (!xml) return { kindByStyle };
  const tree = parseXml(xml);
  const ss = rootElement(tree);
  const codes = {};
  for (const nf of kids(kid(ss, 'numFmts'), 'numFmt')) codes[Number(getAttr(nf, 'numFmtId'))] = getAttr(nf, 'formatCode') || '';
  kids(kid(ss, 'cellXfs'), 'xf').forEach((xf, i) => {
    const id = Number(getAttr(xf, 'numFmtId') || 0);
    kindByStyle[i] = formatKind(id, codes[id]);
  });
  return { kindByStyle };
}

// ---------- dates ----------

const DAY_MS = 86400000;
const pad = (n) => String(n).padStart(2, '0');

export function serialToDateText(serial, kind, date1904) {
  if (!Number.isFinite(serial) || serial < 0) return String(serial);
  let ms;
  if (date1904) ms = Date.UTC(1904, 0, 1) + serial * DAY_MS;
  else if (serial < 60) ms = Date.UTC(1899, 11, 31) + serial * DAY_MS;
  else if (Math.floor(serial) === 60) return '1900-02-29'; // Lotus leap-year bug
  else ms = Date.UTC(1899, 11, 30) + serial * DAY_MS;
  ms = Math.round(ms / 1000) * 1000;
  const d = new Date(ms);
  const date = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  const hm = `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
  const secs = d.getUTCSeconds() ? `:${pad(d.getUTCSeconds())}` : '';
  const frac = serial % 1 !== 0;
  if (kind === 'time') return serial < 1 ? hm + secs : `${date} ${hm}${secs}`;
  if (kind === 'datetime' && frac) return `${date} ${hm}${secs}`;
  return date;
}

export function numberText(n) {
  if (!Number.isFinite(n)) return String(n);
  if (Number.isInteger(n)) return String(n);
  return String(Number(n.toPrecision(15)));
}

// ---------- shared formula translation ----------

// Shift relative refs of a shared-formula master by (dRow, dCol).
export function shiftFormula(f, dRow, dCol) {
  if (!dRow && !dCol) return f;
  return f.split(/("(?:[^"]|"")*"|'(?:[^']|'')*')/).map((part, i) => {
    if (i % 2) return part;
    return part.replace(/(?<![A-Za-z0-9_.])(\$?)([A-Z]{1,3})(\$?)(\d+)(?![A-Za-z0-9_(])/g, (all, d1, col, d2, row) => {
      const c = d1 ? colToIndex(col) : colToIndex(col) + dCol;
      const r = d2 ? Number(row) : Number(row) + dRow;
      if (c < 0 || r < 1) return all;
      return `${d1}${indexToCol(c)}${d2}${r}`;
    });
  }).join('');
}

// ---------- cells ----------

/**
 * Read one <c> element. Returns null for empty cells (no value, no formula).
 * `shared` is a per-sheet Map(si -> {f, col, row}) for shared formulas.
 */
export function readCell(xml, c, addr, ctx, shared) {
  const t = getAttr(c, 't') || 'n';
  const sAttr = getAttr(c, 's');
  const s = sAttr !== undefined ? Number(sAttr) : 0;
  const vNode = kid(c, 'v');
  const fNode = kid(c, 'f');
  const vText = vNode ? textOf(xml, vNode) : null;

  let f;
  if (fNode) {
    f = textOf(xml, fNode);
    const si = getAttr(fNode, 'si');
    if (getAttr(fNode, 't') === 'shared' && si !== undefined) {
      if (f && getAttr(fNode, 'ref')) shared.set(si, { f, col: addr.col, row: addr.row });
      else if (!f && shared.has(si)) {
        const m = shared.get(si);
        f = shiftFormula(m.f, addr.row - m.row, addr.col - m.col);
      }
    }
  }

  let v = null;
  let text;
  if (t === 's') {
    if (vText !== null && vText !== '') v = ctx.sharedStrings[Number(vText)] ?? '';
  } else if (t === 'inlineStr') {
    const is = kid(c, 'is');
    if (is) v = stringItemText(xml, is);
    else if (vText !== null) v = decodeXEscapes(vText);
    if (v === '' && !fNode) v = null;
  } else if (t === 'str') {
    v = vText !== null ? decodeXEscapes(vText) : (fNode ? '' : null);
  } else if (t === 'b') {
    if (vText !== null && vText !== '') v = vText === '1' || vText === 'true';
  } else if (t === 'e') {
    if (vText !== null) v = vText;
  } else if (t === 'd') {
    if (vText !== null && vText !== '') v = vText;
  } else if (vText !== null && vText.trim() !== '') {
    const n = Number(vText);
    v = Number.isFinite(n) ? n : vText;
  }

  if (v === null && !f) return null;

  if (typeof v === 'number') {
    const kind = ctx.styles.kindByStyle[s];
    text = kind ? serialToDateText(v, kind, ctx.date1904) : numberText(v);
  } else if (typeof v === 'boolean') {
    text = v ? 'TRUE' : 'FALSE';
  } else if (t === 'd' && v) {
    text = String(v).slice(0, 10);
  } else {
    text = v === null ? '' : String(v);
  }

  const out = { v, text, t, s };
  if (f !== undefined) out.f = f;
  return out;
}

/**
 * Walk all <row>/<c> of a parsed worksheet, giving each cell its address even
 * when r= attributes are omitted. cb(cNode, {col,row}, rowNode)
 */
export function forEachCell(sheetData, cb, rowCb) {
  let rowNum = 0;
  for (const row of kids(sheetData, 'row')) {
    const r = Number(getAttr(row, 'r'));
    rowNum = r > 0 ? r : rowNum + 1;
    if (rowCb) rowCb(row, rowNum);
    let col = -1;
    for (const c of kids(row, 'c')) {
      const a = parseAddr(getAttr(c, 'r'));
      col = a ? a.col : col + 1;
      cb(c, { col, row: a ? a.row : rowNum }, row);
    }
  }
}

function parseSheet(xml, ctx) {
  const tree = parseXml(xml);
  const ws = rootElement(tree);
  const cells = {};
  let maxRow = 0;
  let maxCol = 0;
  const shared = new Map();
  forEachCell(kid(ws, 'sheetData'), (c, a) => {
    const cell = readCell(xml, c, a, ctx, shared);
    if (!cell) return;
    cells[makeAddr(a.col, a.row)] = cell;
    if (a.row > maxRow) maxRow = a.row;
    if (a.col + 1 > maxCol) maxCol = a.col + 1;
  });
  const merges = kids(kid(ws, 'mergeCells'), 'mergeCell').map((m) => getAttr(m, 'ref')).filter(Boolean);
  for (const m of merges) {
    const r = parseRange(m);
    if (!r) continue;
    if (r.end.row > maxRow) maxRow = r.end.row;
    if (r.end.col + 1 > maxCol) maxCol = r.end.col + 1;
  }
  return { cells, merges, maxRow, maxCol };
}

export async function buildXlsxMap(bytes) {
  const zip = await loadZip(bytes);
  const ctx = await loadWorkbook(zip);
  const sheets = [];
  for (const s of ctx.sheets) {
    const xml = s.xmlPath ? await readText(zip, s.xmlPath) : null;
    const parsed = xml ? parseSheet(xml, ctx) : { cells: {}, merges: [], maxRow: 0, maxCol: 0 };
    sheets.push({ name: s.name, index: s.index, xmlPath: s.xmlPath, state: s.state, ...parsed });
  }
  return { kind: 'xlsx', sheets, definedNames: ctx.definedNames, date1904: ctx.date1904 };
}

function findSheet(map, sheetName) {
  if (!map || !map.sheets) return null;
  if (sheetName === undefined || sheetName === null) return map.sheets[0] || null;
  if (typeof sheetName === 'number') return map.sheets[sheetName] || null;
  return map.sheets.find((s) => s.name === sheetName)
    || map.sheets.find((s) => s.name.toLowerCase() === String(sheetName).toLowerCase()) || null;
}

export function getCell(map, sheetName, addr) {
  const s = findSheet(map, sheetName);
  if (!s) return null;
  const a = parseAddr(addr);
  if (!a) return null;
  return s.cells[makeAddr(a.col, a.row)] || null;
}

// 2-D array of values (dates as ISO text) for row/column heuristics.
export function sheetGrid(map, sheetName, { maxRows = 2000 } = {}) {
  const s = findSheet(map, sheetName);
  if (!s) return [];
  const rows = Math.min(s.maxRow, maxRows);
  const grid = Array.from({ length: rows }, () => new Array(s.maxCol).fill(null));
  for (const [addr, cell] of Object.entries(s.cells)) {
    const a = parseAddr(addr);
    if (!a || a.row > rows) continue;
    const isDate = typeof cell.v === 'number' && cell.text !== numberText(cell.v);
    grid[a.row - 1][a.col] = isDate ? cell.text : cell.v;
  }
  return grid;
}
