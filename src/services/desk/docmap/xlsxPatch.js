// Write individual cell values back into the ORIGINAL .xlsx/.xlsm bytes.
// Only the targeted <c> elements (plus row/dimension/calcPr bookkeeping) change;
// every other zip entry keeps its exact uncompressed bytes.
import {
  parseXml, kids, kid, getAttr, rootElement, openTag, escapeText, setAttrInTag,
  removeAttrsInTag, applySplices, pfx,
} from './xml';
import { loadZip, readText, writeZip, toUint8, relsPathFor } from './zip';
import { parseAddr, makeAddr, parseRange, inRange } from './addr';
import { loadWorkbook, readCell, forEachCell } from './xlsxMap';

function normalizeValue(v) {
  if (v === null || v === undefined) return { ok: true, value: null };
  if (typeof v === 'number') return Number.isFinite(v) ? { ok: true, value: Object.is(v, -0) ? 0 : v } : { ok: false };
  if (typeof v === 'boolean' || typeof v === 'string') return { ok: true, value: v };
  return { ok: false };
}

// Literal "_x0041_" in user text must not be decoded by Excel as an escape.
const encodeX = (s) => s.replace(/_x([0-9A-Fa-f]{4})_/g, '_x005F_x$1_');

function cellXml(qname, cp, attrStr, value) {
  if (value === null) return `<${qname}${attrStr}/>`;
  if (typeof value === 'number') return `<${qname}${attrStr}><${cp}v>${String(value)}</${cp}v></${qname}>`;
  if (typeof value === 'boolean') return `<${qname}${attrStr} t="b"><${cp}v>${value ? 1 : 0}</${cp}v></${qname}>`;
  return `<${qname}${attrStr} t="inlineStr"><${cp}is><${cp}t xml:space="preserve">${escapeText(encodeX(value))}</${cp}t></${cp}is></${qname}>`;
}

function patchSheetXml(xml, edits, ctx, allowFormulaOverwrite) {
  const applied = [];
  const skipped = [];
  const tree = parseXml(xml);
  const ws = rootElement(tree);
  const sheetData = kid(ws, 'sheetData');
  if (!sheetData) {
    for (const e of edits) skipped.push({ sheet: e.sheet, cell: e.cell, reason: 'sheet' });
    return { xml, applied, skipped, formulaTouched: false };
  }
  const p = pfx(sheetData);
  const merges = kids(kid(ws, 'mergeCells'), 'mergeCell')
    .map((m) => ({ ref: getAttr(m, 'ref'), range: parseRange(getAttr(m, 'ref')) }))
    .filter((m) => m.range);
  const colStyles = kids(kid(ws, 'cols'), 'col').map((c) => ({
    min: Number(getAttr(c, 'min')), max: Number(getAttr(c, 'max')), style: getAttr(c, 'style'),
  }));

  const rows = new Map();
  const rowList = [];
  let current = null;
  forEachCell(sheetData, (c, a) => {
    current.cells.push({ col: a.col, node: c });
  }, (rowNode, rowNum) => {
    current = { num: rowNum, node: rowNode, cells: [] };
    if (!rows.has(rowNum)) rows.set(rowNum, current);
    rowList.push(current);
  });

  const splices = [];
  const newCells = []; // {row, col, xml}
  let formulaTouched = false;

  for (const e of edits) {
    const a = e.addr;
    const merge = merges.find((m) => inRange(a, m.range));
    if (merge && !(merge.range.start.col === a.col && merge.range.start.row === a.row)) {
      skipped.push({ sheet: e.sheet, cell: e.cell, reason: 'merged', anchor: makeAddr(merge.range.start.col, merge.range.start.row) });
      continue;
    }
    const rowE = rows.get(a.row);
    const cellE = rowE && rowE.cells.find((x) => x.col === a.col);
    if (cellE) {
      const node = cellE.node;
      const fNode = kid(node, 'f');
      if (fNode) {
        if (!allowFormulaOverwrite) {
          skipped.push({ sheet: e.sheet, cell: e.cell, reason: 'formula' });
          continue;
        }
        const ft = getAttr(fNode, 't');
        // Overwriting a shared/array formula master would break its dependents.
        if ((ft === 'shared' && getAttr(fNode, 'ref')) || ft === 'array') {
          skipped.push({ sheet: e.sheet, cell: e.cell, reason: ft === 'array' ? 'arrayFormula' : 'sharedFormula' });
          continue;
        }
        formulaTouched = true;
      }
      const prev = readCell(xml, node, a, ctx, new Map());
      let attrStr = removeAttrsInTag(node.attrRaw, ['t', 'cm', 'vm']).replace(/\s+$/, '');
      if (getAttr(node, 'r') === undefined) attrStr = ` r="${e.cell}"${attrStr}`;
      splices.push({ start: node.start, end: node.end, text: cellXml(node.qname, pfx(node), attrStr, e.value) });
      applied.push({ sheet: e.sheet, cell: e.cell, before: prev ? prev.v : null, after: e.value });
    } else {
      let style;
      if (rowE && getAttr(rowE.node, 'customFormat') === '1' && getAttr(rowE.node, 's')) style = getAttr(rowE.node, 's');
      else {
        const col = colStyles.find((c) => a.col + 1 >= c.min && a.col + 1 <= c.max && c.style);
        if (col) style = col.style;
      }
      const attrStr = ` r="${e.cell}"${style && style !== '0' ? ` s="${style}"` : ''}`;
      newCells.push({ row: a.row, col: a.col, xml: cellXml(`${p}c`, p, attrStr, e.value) });
      applied.push({ sheet: e.sheet, cell: e.cell, before: null, after: e.value });
    }
  }

  // Insert new cells: into existing rows in column order, or new rows in row order.
  const byRow = new Map();
  for (const nc of newCells) {
    if (!byRow.has(nc.row)) byRow.set(nc.row, []);
    byRow.get(nc.row).push(nc);
  }
  const newRows = [];
  for (const [rowNum, list] of byRow) {
    list.sort((x, y) => x.col - y.col);
    const rowE = rows.get(rowNum);
    if (!rowE) {
      newRows.push({ num: rowNum, xml: `<${p}row r="${rowNum}">${list.map((x) => x.xml).join('')}</${p}row>` });
      continue;
    }
    const rowNode = rowE.node;
    let tag = openTag(xml, rowNode);
    const spans = getAttr(rowNode, 'spans');
    if (spans && /^\d+:\d+$/.test(spans)) {
      const [lo, hi] = spans.split(':').map(Number);
      const nlo = Math.min(lo, list[0].col + 1);
      const nhi = Math.max(hi, list[list.length - 1].col + 1);
      if (nlo !== lo || nhi !== hi) tag = setAttrInTag(tag, 'spans', `${nlo}:${nhi}`);
    }
    if (rowNode.selfClosing) {
      tag = tag.replace(/\s*\/>$/, '>');
      splices.push({ start: rowNode.start, end: rowNode.end, text: `${tag}${list.map((x) => x.xml).join('')}</${rowNode.qname}>` });
      continue;
    }
    if (tag !== openTag(xml, rowNode)) splices.push({ start: rowNode.start, end: rowNode.openEnd, text: tag });
    const groups = new Map();
    for (const nc of list) {
      const next = rowE.cells.find((x) => x.col > nc.col);
      const last = rowE.cells[rowE.cells.length - 1];
      const pos = next ? next.node.start : (last ? last.node.end : rowNode.openEnd);
      if (!groups.has(pos)) groups.set(pos, []);
      groups.get(pos).push(nc.xml);
    }
    for (const [pos, xs] of groups) splices.push({ start: pos, end: pos, text: xs.join('') });
  }
  if (newRows.length) {
    newRows.sort((x, y) => x.num - y.num);
    if (sheetData.selfClosing) {
      const tag = openTag(xml, sheetData).replace(/\s*\/>$/, '>');
      splices.push({ start: sheetData.start, end: sheetData.end, text: `${tag}${newRows.map((r) => r.xml).join('')}</${sheetData.qname}>` });
    } else {
      const groups = new Map();
      for (const nr of newRows) {
        const next = rowList.find((r) => r.num > nr.num);
        const pos = next ? next.node.start : sheetData.closeStart;
        if (!groups.has(pos)) groups.set(pos, []);
        groups.get(pos).push(nr.xml);
      }
      for (const [pos, xs] of groups) splices.push({ start: pos, end: pos, text: xs.join('') });
    }
  }

  // Keep <dimension ref> covering any newly created cells.
  const dim = kid(ws, 'dimension');
  if (dim && newCells.length) {
    const r = parseRange(getAttr(dim, 'ref'));
    if (r) {
      let { start, end } = r;
      for (const nc of newCells) {
        start = { col: Math.min(start.col, nc.col), row: Math.min(start.row, nc.row) };
        end = { col: Math.max(end.col, nc.col), row: Math.max(end.row, nc.row) };
      }
      const ref = `${makeAddr(start.col, start.row)}:${makeAddr(end.col, end.row)}`;
      if (ref !== getAttr(dim, 'ref')) splices.push({ start: dim.start, end: dim.openEnd, text: setAttrInTag(openTag(xml, dim), 'ref', ref) });
    }
  }

  return { xml: splices.length ? applySplices(xml, splices) : xml, applied, skipped, formulaTouched };
}

// Ask Excel to recalculate everything on open (our values may feed formulas).
async function setFullCalc(zip, ctx) {
  const xml = ctx.wbXml;
  const wbEl = ctx.wbEl;
  const calc = kid(wbEl, 'calcPr');
  let out;
  if (calc) {
    if (getAttr(calc, 'fullCalcOnLoad') === '1' || getAttr(calc, 'fullCalcOnLoad') === 'true') return;
    out = applySplices(xml, [{ start: calc.start, end: calc.openEnd, text: setAttrInTag(openTag(xml, calc), 'fullCalcOnLoad', '1') }]);
  } else {
    // CT_Workbook order: ... sheets, functionGroups, externalReferences, definedNames, calcPr ...
    let after = null;
    for (const n of ['sheets', 'functionGroups', 'externalReferences', 'definedNames']) after = kid(wbEl, n) || after;
    const pos = after ? after.end : wbEl.closeStart;
    out = applySplices(xml, [{ start: pos, end: pos, text: `<${pfx(wbEl)}calcPr fullCalcOnLoad="1"/>` }]);
  }
  zip.file(ctx.wbPath, out);
}

async function removeCalcChain(zip, ctx) {
  const rel = ctx.rels.find((r) => /\/calcChain$/.test(r.type));
  const path = rel && rel.path ? rel.path : 'xl/calcChain.xml';
  if (!zip.file(path)) return;
  zip.remove(path);
  const relsPath = relsPathFor(ctx.wbPath);
  const relsXml = await readText(zip, relsPath);
  if (relsXml && rel) {
    const t = parseXml(relsXml);
    const n = kids(rootElement(t), 'Relationship').find((r) => getAttr(r, 'Id') === rel.id);
    if (n) zip.file(relsPath, applySplices(relsXml, [{ start: n.start, end: n.end, text: '' }]));
  }
  const ctXml = await readText(zip, '[Content_Types].xml');
  if (ctXml) {
    const t = parseXml(ctXml);
    const n = kids(rootElement(t), 'Override').find((o) => getAttr(o, 'PartName') === `/${path}`);
    if (n) zip.file('[Content_Types].xml', applySplices(ctXml, [{ start: n.start, end: n.end, text: '' }]));
  }
}

/**
 * edits: [{ sheet, cell: 'F12', value: number|string|boolean|null }]
 * → { bytes, applied: [{sheet, cell, before, after}], skipped: [{sheet, cell, reason}] }
 */
export async function applyXlsxEdits(bytes, edits, { allowFormulaOverwrite = false } = {}) {
  const zip = await loadZip(bytes);
  const ctx = await loadWorkbook(zip);
  const applied = [];
  const skipped = [];
  const bySheet = new Map();

  for (const e of edits || []) {
    const sheetName = e ? e.sheet : undefined;
    const cellRaw = e ? e.cell : undefined;
    const sheet = sheetName === undefined || sheetName === null
      ? ctx.sheets[0]
      : ctx.sheets.find((s) => s.name === sheetName)
        || ctx.sheets.find((s) => s.name.toLowerCase() === String(sheetName).toLowerCase());
    if (!sheet || !sheet.xmlPath) {
      skipped.push({ sheet: sheetName, cell: cellRaw, reason: 'sheet' });
      continue;
    }
    const a = parseAddr(String(cellRaw ?? '').replace(/\$/g, ''));
    if (!a) {
      skipped.push({ sheet: sheet.name, cell: cellRaw, reason: 'address' });
      continue;
    }
    const cell = makeAddr(a.col, a.row);
    const nv = normalizeValue(e.value);
    if (!nv.ok) {
      skipped.push({ sheet: sheet.name, cell, reason: 'value' });
      continue;
    }
    if (!bySheet.has(sheet)) bySheet.set(sheet, new Map());
    const m = bySheet.get(sheet);
    m.delete(cell); // last edit of the same cell wins
    m.set(cell, { sheet: sheet.name, cell, addr: a, value: nv.value });
  }

  let changed = false;
  let formulaTouched = false;
  for (const [sheet, m] of bySheet) {
    const xml = await readText(zip, sheet.xmlPath);
    if (xml === null) {
      for (const e of m.values()) skipped.push({ sheet: e.sheet, cell: e.cell, reason: 'sheet' });
      continue;
    }
    const res = patchSheetXml(xml, [...m.values()], ctx, allowFormulaOverwrite);
    applied.push(...res.applied);
    skipped.push(...res.skipped);
    if (res.xml !== xml) {
      zip.file(sheet.xmlPath, res.xml);
      changed = true;
    }
    if (res.formulaTouched) formulaTouched = true;
  }

  if (!changed) return { bytes: toUint8(bytes), applied, skipped };
  await setFullCalc(zip, ctx);
  if (formulaTouched) await removeCalcChain(zip, ctx);
  return { bytes: await writeZip(zip), applied, skipped };
}
