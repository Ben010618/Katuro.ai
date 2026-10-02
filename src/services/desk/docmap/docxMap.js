// Read a .docx/.dotx into addressable blocks (paragraph / table / cell ids).
import { parseXml, kids, kid, getAttr, textOf, rootElement } from './xml';
import { loadZip, readText, mainPartPath, dirOf, INVALID_FILE } from './zip';

// Subtrees whose text is not part of the paragraph's visible run text.
export const SKIP_TEXT = new Set([
  'pPr', 'rPr', 'delText', 'instrText', 'del', 'moveFrom', 'drawing', 'pict', 'object',
  'AlternateContent', 'txbxContent', 'fldData', 'tcPr', 'tblPr', 'trPr', 'sdtPr', 'sdtEndPr',
]);

/**
 * Visit the text-bearing pieces of a paragraph in order.
 * cb({ kind: 't'|'sep', node, text })  — 'sep' = tab/break (not matchable text).
 */
export function walkParagraphText(xml, p, cb) {
  const walk = (n) => {
    for (const c of n.children) {
      if (c.type !== 'el' || SKIP_TEXT.has(c.name)) continue;
      if (c.name === 't') cb({ kind: 't', node: c, text: textOf(xml, c) });
      else if (c.name === 'tab' && c.parent.name === 'r') cb({ kind: 'sep', node: c, text: '\t' });
      else if ((c.name === 'br' || c.name === 'cr') && c.parent.name === 'r') cb({ kind: 'sep', node: c, text: '\n' });
      else if (c.name === 'noBreakHyphen' && c.parent.name === 'r') cb({ kind: 'sep', node: c, text: '-' });
      else if (c.name !== 'p' && c.name !== 'tbl') walk(c);
    }
  };
  walk(p);
}

export function paragraphText(xml, p) {
  let s = '';
  walkParagraphText(xml, p, (x) => { s += x.text; });
  return s;
}

// Flatten block-level wrappers (content controls, custom XML) into their children.
function blockChildren(container, names) {
  const out = [];
  for (const c of kids(container)) {
    if (names.has(c.name)) out.push(c);
    else if (c.name === 'sdt') out.push(...blockChildren(kid(c, 'sdtContent'), names));
    else if (c.name === 'customXml') out.push(...blockChildren(c, names));
  }
  return out;
}

const PT = new Set(['p', 'tbl']);
const TR = new Set(['tr']);
const TC = new Set(['tc']);

function walkTable(xml, tbl, id) {
  const rows = blockChildren(tbl, TR).map((tr, ri) => blockChildren(tr, TC).map((tc, ci) => {
    const cellId = `${id}.r${ri}.c${ci}`;
    const tcPr = kid(tc, 'tcPr');
    const gs = Number(getAttr(kid(tcPr, 'gridSpan'), 'val'));
    const vmNode = kid(tcPr, 'vMerge');
    const inner = walkContainer(xml, tc, `${cellId}.`);
    const paragraphs = inner.filter((b) => b.type === 'paragraph');
    const tables = inner.filter((b) => b.type === 'table');
    const text = inner.map((b) => b.text).join('\n');
    return {
      id: cellId,
      text,
      gridSpan: gs > 0 ? gs : 1,
      vMerge: vmNode ? (getAttr(vmNode, 'val') || 'continue') : null,
      paragraphs,
      tables,
      node: tc,
    };
  }));
  const text = rows.map((r) => r.map((c) => c.text.replace(/\n/g, ' ')).join('\t')).join('\n');
  return { id, type: 'table', rows, text, node: tbl };
}

// Blocks of a body / cell / header, with nodes attached (used by the patcher).
export function walkContainer(xml, container, prefix = '') {
  const blocks = [];
  let pi = 0;
  let ti = 0;
  for (const c of blockChildren(container, PT)) {
    if (c.name === 'p') {
      const text = paragraphText(xml, c);
      const style = getAttr(kid(kid(c, 'pPr'), 'pStyle'), 'val') || null;
      blocks.push({ id: `${prefix}p${pi++}`, type: 'paragraph', text, style, isEmpty: text.trim() === '', node: c });
    } else {
      blocks.push(walkTable(xml, c, `${prefix}t${ti++}`));
    }
  }
  return blocks;
}

// id -> { kind: 'paragraph'|'table'|'cell', block }
export function indexBlocks(blocks, out = new Map()) {
  for (const b of blocks) {
    out.set(b.id, { kind: b.type, block: b });
    if (b.type === 'table') {
      for (const row of b.rows) {
        for (const cell of row) {
          out.set(cell.id, { kind: 'cell', block: cell });
          indexBlocks(cell.paragraphs, out);
          indexBlocks(cell.tables, out);
        }
      }
    }
  }
  return out;
}

export function stripNodes(blocks) {
  return blocks.map((b) => {
    if (b.type === 'paragraph') return { id: b.id, type: b.type, text: b.text, style: b.style, isEmpty: b.isEmpty };
    return {
      id: b.id,
      type: 'table',
      rows: b.rows.map((r) => r.map((c) => {
        const cell = {
          id: c.id,
          text: c.text,
          gridSpan: c.gridSpan,
          vMerge: c.vMerge,
          paragraphs: c.paragraphs.map((p) => ({ id: p.id, text: p.text })),
        };
        if (c.tables.length) cell.tables = stripNodes(c.tables);
        return cell;
      })),
    };
  });
}

// Body of document.xml or the root of a header/footer part.
export function partContainer(tree) {
  const root = rootElement(tree);
  if (!root) return null;
  return root.name === 'document' ? kid(root, 'body') : root;
}

// Header/footer parts next to the main part, with their id prefixes (h1:, f2:…).
export function headerFooterParts(zip, mainPath) {
  const dir = dirOf(mainPath);
  const found = { header: [], footer: [] };
  zip.forEach((path) => {
    if (!path.startsWith(dir)) return;
    const m = /^(header|footer)(\d*)\.xml$/.exec(path.slice(dir.length));
    if (m) found[m[1]].push({ part: path, num: m[2] ? Number(m[2]) : 0 });
  });
  const assign = (list, letter) => list
    .sort((a, b) => a.num - b.num)
    .map((x, i) => ({ part: x.part, prefix: `${letter}${x.num || i + 1}:` }));
  return { headers: assign(found.header, 'h'), footers: assign(found.footer, 'f') };
}

export async function loadDocxParts(zip) {
  const mainPath = await mainPartPath(zip, 'word/document.xml');
  if (!mainPath) throw new Error(INVALID_FILE);
  return { mainPath, ...headerFooterParts(zip, mainPath) };
}

export async function buildDocxMap(bytes) {
  const zip = await loadZip(bytes);
  const { mainPath, headers, footers } = await loadDocxParts(zip);
  const xml = await readText(zip, mainPath);
  const tree = parseXml(xml);
  const body = partContainer(tree);
  if (!body || rootElement(tree).name !== 'document') throw new Error(INVALID_FILE);
  const blocks = stripNodes(walkContainer(xml, body));
  const readPart = async ({ part, prefix }) => {
    const px = await readText(zip, part);
    const c = partContainer(parseXml(px));
    return { part, blocks: c ? stripNodes(walkContainer(px, c, prefix)) : [] };
  };
  const hs = [];
  for (const h of headers) hs.push(await readPart(h));
  const fs = [];
  for (const f of footers) fs.push(await readPart(f));
  return { kind: 'docx', blocks, headers: hs, footers: fs };
}
