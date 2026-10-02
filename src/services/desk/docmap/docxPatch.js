// Write paragraph / table-cell text back into the ORIGINAL .docx bytes.
// Only the targeted <w:p>/<w:tc> (or individual <w:t>) elements are rewritten;
// every other zip entry keeps its exact uncompressed bytes.
import { parseXml, kids, kid, raw, openTag, hasDesc, descendants, escapeText, applySplices, pfx } from './xml';
import { loadZip, readText, writeZip, toUint8 } from './zip';
import { walkContainer, indexBlocks, partContainer, loadDocxParts, walkParagraphText } from './docxMap';

// Paragraph content we refuse to flatten (fields, images, equations, notes).
const COMPLEX = new Set([
  'fldChar', 'instrText', 'drawing', 'pict', 'object', 'fldSimple', 'AlternateContent', 'txbxContent',
  'oMath', 'oMathPara', 'footnoteReference', 'endnoteReference',
]);
// Zero-width markers kept in place when a paragraph's runs are replaced.
const MARKERS = new Set(['bookmarkStart', 'bookmarkEnd', 'commentRangeStart', 'commentRangeEnd', 'permStart', 'permEnd']);
// Run-level content that gets replaced by the single new run.
const CONTENT = new Set([
  'r', 'hyperlink', 'ins', 'del', 'moveFrom', 'moveTo', 'smartTag', 'sdt', 'customXml', 'fldSimple',
  'proofErr', 'subDoc', 'dir', 'bdo', 'oMath', 'oMathPara',
]);
const NO_ENTER = new Set(['del', 'moveFrom', 'drawing', 'pict', 'object', 'AlternateContent', 'txbxContent', 'pPr']);
const PARA_MARK_ONLY = new Set(['ins', 'del', 'moveFrom', 'moveTo', 'rPrChange']);

// Re-emit an element without the listed child elements.
function rebuildWithout(xml, node, names) {
  if (node.selfClosing) return raw(xml, node);
  let s = openTag(xml, node);
  for (const c of node.children) {
    if (c.type === 'el' && names.has(c.name)) continue;
    s += xml.slice(c.start, c.end);
  }
  return s + xml.slice(node.closeStart, node.end);
}

function runContent(text, P) {
  return String(text).split('\n')
    .map((line) => line.split('\t').map((seg) => `<${P}t xml:space="preserve">${escapeText(seg)}</${P}t>`).join(`<${P}tab/>`))
    .join(`<${P}br/>`);
}

// rPr of the first text run (template font/size/bold), else the paragraph-mark rPr.
function templateRPr(xml, p) {
  const runs = descendants(p, 'r', NO_ENTER);
  const run = runs.find((r) => kid(r, 't')) || runs[0];
  const rPr = run && kid(run, 'rPr');
  if (rPr) return raw(xml, rPr);
  const markRPr = kid(kid(p, 'pPr'), 'rPr');
  return markRPr ? rebuildWithout(xml, markRPr, PARA_MARK_ONLY) : '';
}

function isComplex(p) {
  return hasDesc(p, COMPLEX);
}

/** New XML for paragraph `p` holding `text`; null when the paragraph is complex. */
function setParagraphXml(xml, p, text, { clone = false } = {}) {
  if (isComplex(p)) return null;
  const P = pfx(p);
  let tag = openTag(xml, p);
  if (p.selfClosing) tag = tag.replace(/\s*\/>$/, '>');
  // Clones must not duplicate Word's unique paragraph ids.
  if (clone) tag = tag.replace(/\s+[\w.-]+:(paraId|textId)\s*=\s*("[^"]*"|'[^']*')/g, '');
  let pPr = '';
  const before = [];
  const after = [];
  let seen = false;
  for (const c of kids(p)) {
    if (c.name === 'pPr') pPr = clone ? rebuildWithout(xml, c, new Set(['sectPr'])) : raw(xml, c);
    else if (MARKERS.has(c.name)) {
      if (!clone) (seen ? after : before).push(raw(xml, c));
    } else if (CONTENT.has(c.name)) seen = true;
    else if (!clone) after.push(raw(xml, c));
  }
  const run = `<${P}r>${templateRPr(xml, p)}${runContent(text, P)}</${P}r>`;
  return `${tag}${pPr}${before.join('')}${run}${after.join('')}</${p.qname}>`;
}

/** New XML for cell `tc`: first paragraph keeps pPr/rPr, extra lines clone it. */
function setCellXml(xml, tc, text) {
  if (kids(tc, 'tbl').length || kids(tc, 'sdt').length || kids(tc, 'customXml').length) return null;
  const ps = kids(tc, 'p');
  if (ps.some(isComplex)) return null;
  const P = pfx(tc);
  const lines = String(text).split('\n');
  let parts;
  if (!ps.length) parts = lines.map((l) => `<${P}p><${P}r>${runContent(l, P)}</${P}r></${P}p>`);
  else {
    parts = [setParagraphXml(xml, ps[0], lines[0])];
    for (const l of lines.slice(1)) parts.push(setParagraphXml(xml, ps[0], l, { clone: true }));
  }
  let tag = openTag(xml, tc);
  if (tc.selfClosing) tag = tag.replace(/\s*\/>$/, '>');
  const tcPr = kid(tc, 'tcPr');
  return `${tag}${tcPr ? raw(xml, tcPr) : ''}${parts.join('')}</${tc.qname}>`;
}

function collectParagraphs(blocks, out = []) {
  for (const b of blocks) {
    if (b.type === 'paragraph') out.push(b);
    else if (b.type === 'table') {
      for (const row of b.rows) for (const c of row) { collectParagraphs(c.paragraphs, out); collectParagraphs(c.tables, out); }
    }
  }
  return out;
}

// Find/replace inside one paragraph, matching across run boundaries.
function findReplaceInParagraph(xml, p, find, replace, splices) {
  const segs = [];
  let concat = '';
  walkParagraphText(xml, p, (x) => {
    segs.push({ ...x, start: concat.length });
    concat += x.kind === 't' ? x.text : '\u0001'.repeat(x.text.length); // separators never match
  });
  const matches = [];
  for (let i = concat.indexOf(find); i >= 0; i = concat.indexOf(find, i + find.length)) matches.push(i);
  if (!matches.length) return null;
  const del = new Uint8Array(concat.length);
  const ins = new Map();
  for (const m of matches) {
    del.fill(1, m, m + find.length);
    ins.set(m, replace); // replacement lands in the run owning the first matched char
  }
  let after = '';
  for (const seg of segs) {
    if (seg.kind !== 't') {
      after += seg.text;
      continue;
    }
    let s = '';
    for (let k = seg.start; k < seg.start + seg.text.length; k++) {
      if (ins.has(k)) s += ins.get(k);
      if (!del[k]) s += concat[k];
    }
    after += s;
    if (s !== seg.text) {
      const P = pfx(seg.node);
      splices.push({ start: seg.node.start, end: seg.node.end, text: `<${P}t xml:space="preserve">${escapeText(s)}</${P}t>` });
    }
  }
  return { count: matches.length, after };
}

/**
 * edits: [{ id, text }] and/or [{ find, replace, scope?: 'all'|'<id>' }]
 * → { bytes, applied: [{id, before, after}], skipped: [{id, reason}] }
 */
export async function applyDocxEdits(bytes, edits) {
  const zip = await loadZip(bytes);
  const { mainPath, headers, footers } = await loadDocxParts(zip);
  const partByPrefix = new Map([['', mainPath], ...[...headers, ...footers].map((h) => [h.prefix, h.part])]);
  const cache = new Map();
  const getXml = async (path) => {
    if (!cache.has(path)) {
      const x = await readText(zip, path);
      cache.set(path, { xml: x, orig: x });
    }
    return cache.get(path).xml;
  };
  const prefixOf = (id) => {
    const m = /^([hf]\d+:)/.exec(id);
    return m ? m[1] : '';
  };
  const applied = [];
  const skipped = [];

  const loadPart = async (prefix) => {
    const path = partByPrefix.get(prefix);
    const xml = path ? await getXml(path) : null;
    if (xml === null) return null;
    const container = partContainer(parseXml(xml));
    if (!container) return null;
    const blocks = walkContainer(xml, container, prefix);
    return { path, xml, blocks, index: indexBlocks(blocks) };
  };

  async function applyIdGroup(group) {
    const byPart = new Map();
    for (const e of group) {
      const pre = prefixOf(e.id);
      if (!partByPrefix.has(pre)) {
        skipped.push({ id: e.id, reason: 'notFound' });
        continue;
      }
      if (!byPart.has(pre)) byPart.set(pre, []);
      byPart.get(pre).push(e);
    }
    for (const [pre, list] of byPart) {
      // Non-overlapping targets are spliced in one pass; overlapping ones (e.g. a
      // cell and then one of its paragraphs) wait for a re-parse, keeping order.
      let pending = list;
      while (pending.length) {
        const part = await loadPart(pre);
        if (!part) {
          for (const e of pending) skipped.push({ id: e.id, reason: 'notFound' });
          break;
        }
        const taken = [];
        const next = [];
        const splices = [];
        for (const e of pending) {
          const hit = part.index.get(e.id);
          if (!hit) {
            if (taken.some((x) => e.id.startsWith(`${x.id}.`))) {
              next.push(e);
              taken.push({ id: e.id, r: [-1, -1] });
            } else skipped.push({ id: e.id, reason: 'notFound' });
            continue;
          }
          const node = hit.block.node;
          const r = [node.start, node.end];
          if (taken.some((x) => r[0] < x.r[1] && x.r[0] < r[1])) {
            next.push(e);
            taken.push({ id: e.id, r });
            continue;
          }
          const text = String(e.text ?? '');
          let out;
          if (hit.kind === 'paragraph') out = setParagraphXml(part.xml, node, text);
          else if (hit.kind === 'cell') out = setCellXml(part.xml, node, text);
          else {
            skipped.push({ id: e.id, reason: 'unsupported' });
            continue;
          }
          if (out === null) {
            skipped.push({ id: e.id, reason: 'complex' });
            continue;
          }
          splices.push({ start: r[0], end: r[1], text: out });
          taken.push({ id: e.id, r });
          applied.push({ id: e.id, before: hit.block.text, after: text });
        }
        if (splices.length) cache.get(part.path).xml = applySplices(part.xml, splices);
        else if (next.length) {
          for (const e of next) skipped.push({ id: e.id, reason: 'notFound' });
          break;
        }
        pending = next;
      }
    }
  }

  async function applyFind(e) {
    const find = e.find;
    const replace = String(e.replace ?? '');
    const scope = e.scope && e.scope !== 'all' ? e.scope : null;
    if (!find) {
      skipped.push({ id: scope || 'all', find, reason: 'invalid' });
      return;
    }
    const prefixes = scope ? [prefixOf(scope)] : [...partByPrefix.keys()];
    let total = 0;
    for (const pre of prefixes) {
      const part = await loadPart(pre);
      if (!part) continue;
      let paras;
      if (scope) {
        const hit = part.index.get(scope);
        if (!hit) continue;
        if (hit.kind === 'paragraph') paras = [hit.block];
        else if (hit.kind === 'cell') paras = collectParagraphs([...hit.block.paragraphs, ...hit.block.tables]);
        else paras = collectParagraphs([hit.block]);
      } else paras = collectParagraphs(part.blocks);
      const splices = [];
      for (const b of paras) {
        const res = findReplaceInParagraph(part.xml, b.node, find, replace, splices);
        if (!res) continue;
        total += res.count;
        applied.push({ id: b.id, before: b.text, after: res.after });
      }
      if (splices.length) cache.get(part.path).xml = applySplices(part.xml, splices);
    }
    if (!total) skipped.push({ id: scope || 'all', find, reason: 'noMatch' });
  }

  let group = [];
  for (const e of edits || []) {
    if (e && typeof e.find === 'string') {
      if (group.length) await applyIdGroup(group);
      group = [];
      await applyFind(e);
    } else if (e && typeof e.id === 'string') group.push(e);
    else skipped.push({ id: e && e.id, reason: 'invalid' });
  }
  if (group.length) await applyIdGroup(group);

  let changed = false;
  for (const [path, c] of cache) {
    if (c.xml !== c.orig) {
      zip.file(path, c.xml);
      changed = true;
    }
  }
  return { bytes: changed ? await writeZip(zip) : toUint8(bytes), applied, skipped };
}
