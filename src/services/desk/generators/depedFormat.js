/**
 * depedFormat.js — the teacher's own Word file put in the school's print format in one
 * step, by code only: paper size (long bond by default), margins, one font (and size when
 * asked), tables and pictures fitted to the new page, and optionally the DepEd letterhead
 * and the signatory block from the profile. Text and content are not changed.
 */
import { toUint8, interop, headerLines } from './shared.js';

const TWIP = 1440;
const EMU_PER_TWIP = 635;
export const PAPER_TWIPS = { long: [12240, 18720], a4: [11906, 16838], letter: [12240, 15840], legal: [12240, 20160] };
const PAPER_NAMES = { long: 'Long bond (8.5" x 13")', a4: 'A4', letter: 'Letter (8.5" x 11")', legal: 'Legal (8.5" x 14")' };
/** KaTuroDesk's DepEd layout (the same as its own generated documents). */
export const HOUSE = { paper: 'long', margins: { top: 0.5, bottom: 0.5, left: 0.6, right: 0.6 }, font: 'Arial' };
const SYMBOL_FONTS = /symbol|wingdings|webdings|marlett|mt extra|zapf/i;
const PARTS = /^word\/(document|header\d*|footer\d*|footnotes|endnotes|styles|numbering)\.xml$/;

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const attr = (tag, name) => (tag.match(new RegExp(`w:${name}="([^"]*)"`)) || [])[1];
const fmtIn = (tw) => `${Math.round((Number(tw) / TWIP) * 100) / 100}"`;

/** Which paper a page size is (portrait or landscape), or its size in inches. */
export function paperName(w, h) {
  const [a, b] = [Math.min(w, h), Math.max(w, h)];
  const hit = Object.entries(PAPER_TWIPS).find(([, [pw, ph]]) => Math.abs(pw - a) < 60 && Math.abs(ph - b) < 60);
  return hit ? hit[0] : `${fmtIn(a)} x ${fmtIn(b)}`;
}

function setSection(sect, { paper, margins }) {
  const pg = sect.match(/<w:pgSz\b[^>]*\/>/)?.[0] || '';
  const w = Number(attr(pg, 'w')) || 12240;
  const h = Number(attr(pg, 'h')) || 15840;
  const landscape = attr(pg, 'orient') === 'landscape' || w > h;
  const [pw, ph] = PAPER_TWIPS[paper];
  const newPg = `<w:pgSz w:w="${landscape ? ph : pw}" w:h="${landscape ? pw : ph}"${landscape ? ' w:orient="landscape"' : ''}/>`;
  const mar = sect.match(/<w:pgMar\b[^>]*\/>/)?.[0] || '';
  const keep = (name, dflt) => attr(mar, name) ?? dflt;
  const newMar = `<w:pgMar w:top="${Math.round(margins.top * TWIP)}" w:right="${Math.round(margins.right * TWIP)}" w:bottom="${Math.round(margins.bottom * TWIP)}" w:left="${Math.round(margins.left * TWIP)}" w:header="${keep('header', 720)}" w:footer="${keep('footer', 720)}" w:gutter="${keep('gutter', 0)}"/>`;
  let out = sect;
  out = pg ? out.replace(pg, newPg) : out.replace(/(<w:sectPr\b[^>]*>)/, `$1${newPg}`);
  out = mar ? out.replace(mar, newMar) : out.replace(newPg, `${newPg}${newMar}`);
  const before = { paper: paperName(w, h), landscape, margins: mar ? ['top', 'right', 'bottom', 'left'].map((k) => Number(attr(mar, k) || 0)) : null };
  const contentW = (landscape ? ph : pw) - Math.round(margins.left * TWIP) - Math.round(margins.right * TWIP);
  return { xml: out, before, contentW };
}

/** One font for every run and style (symbol fonts like Wingdings stay). */
function setFonts(xml, font) {
  const old = new Set();
  let count = 0;
  const tag = `<w:rFonts w:ascii="${esc(font)}" w:hAnsi="${esc(font)}" w:cs="${esc(font)}" w:eastAsia="${esc(font)}"/>`;
  const out = xml.replace(/<w:rFonts\b[^>]*\/>/g, (t) => {
    const name = attr(t, 'ascii') || attr(t, 'hAnsi') || '';
    if (SYMBOL_FONTS.test(name)) return t;
    if (name && name !== font) old.add(name);
    if (!name && /Theme=/.test(t)) old.add('theme font');
    if (t === tag) return t;
    count += 1;
    return tag;
  });
  return { xml: out, old, count };
}

/** The most used text size of the body (half-points), to change it when a size is asked for. */
function bodySize(docXml, stylesXml) {
  const counts = new Map();
  for (const m of docXml.matchAll(/<w:r>[\s\S]*?<\/w:r>|<w:r [\s\S]*?<\/w:r>/g)) {
    const sz = (m[0].match(/<w:sz w:val="(\d+)"\/>/) || [])[1] || 'default';
    const len = (m[0].match(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g) || []).join('').length;
    counts.set(sz, (counts.get(sz) || 0) + len);
  }
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  if (top && top !== 'default') return Number(top);
  return Number((stylesXml.match(/<w:rPrDefault>[\s\S]*?<w:sz w:val="(\d+)"\/>/) || [])[1]) || 22;
}

/** Tables and pictures wider than the text area are scaled down to fit. */
function fitToWidth(xml, contentW) {
  let tables = 0;
  let pictures = 0;
  let depth = 0;
  let start = -1;
  const spans = [];
  for (const m of xml.matchAll(/<w:tbl>|<\/w:tbl>/g)) {
    if (m[0] === '<w:tbl>') { if (!depth) start = m.index; depth += 1; } else { depth -= 1; if (!depth) spans.push([start, m.index + m[0].length]); }
  }
  let out = '';
  let last = 0;
  for (const [s, e] of spans) {
    let tbl = xml.slice(s, e);
    const tblW = tbl.match(/<w:tblW\b[^>]*\/>/)?.[0] || '';
    const grid = [...tbl.matchAll(/<w:gridCol w:w="(\d+)"\/>/g)].map((m) => Number(m[1]));
    const width = attr(tblW, 'type') === 'dxa' ? Number(attr(tblW, 'w')) : grid.reduce((a, b) => a + b, 0);
    if (width > contentW + 20) {
      const f = contentW / width;
      tbl = tbl.replace(/<w:gridCol w:w="(\d+)"\/>/g, (_, v) => `<w:gridCol w:w="${Math.floor(Number(v) * f)}"/>`)
        .replace(/(<w:(?:tblW|tcW)\b[^>]*w:w=")(\d+)("[^>]*w:type="dxa"[^>]*\/>)/g, (_, a, v, b) => `${a}${Math.floor(Number(v) * f)}${b}`)
        .replace(/(<w:(?:tblW|tcW)\b[^>]*w:type="dxa"[^>]*w:w=")(\d+)(")/g, (_, a, v, b) => `${a}${Math.floor(Number(v) * f)}${b}`);
      tables += 1;
    }
    out += xml.slice(last, s) + tbl;
    last = e;
  }
  out += xml.slice(last);
  const maxEmu = contentW * EMU_PER_TWIP;
  out = out.replace(/<w:drawing>[\s\S]*?<\/w:drawing>/g, (d) => {
    const ext = d.match(/<wp:extent cx="(\d+)" cy="(\d+)"\/>/);
    if (!ext || Number(ext[1]) <= maxEmu) return d;
    const f = maxEmu / Number(ext[1]);
    pictures += 1;
    return d.replace(/(<(?:wp|a):ext(?:ent)? cx=")(\d+)(" cy=")(\d+)(")/g, (_, a, cx, b, cy, c) => `${a}${Math.floor(Number(cx) * f)}${b}${Math.floor(Number(cy) * f)}${c}`);
  });
  return { xml: out, tables, pictures };
}

const docText = (xml) => xml.replace(/<\/w:p>/g, '\n').replace(/<[^>]+>/g, '');
const rPr = (font, sz, extra = '') => `<w:rPr><w:rFonts w:ascii="${esc(font)}" w:hAnsi="${esc(font)}" w:cs="${esc(font)}" w:eastAsia="${esc(font)}"/>${extra}<w:sz w:val="${sz}"/><w:szCs w:val="${sz}"/></w:rPr>`;
const para = (text, { font, sz, jc, after = 0, bold = false, italic = false, border = false }) => `<w:p><w:pPr>${border ? '<w:pBdr><w:top w:val="single" w:sz="4" w:space="2" w:color="000000"/></w:pBdr>' : ''}<w:spacing w:before="0" w:after="${after}"/>${jc ? `<w:jc w:val="${jc}"/>` : ''}</w:pPr><w:r>${rPr(font, sz, `${bold ? '<w:b/>' : ''}${italic ? '<w:i/>' : ''}`)}<w:t xml:space="preserve">${esc(text)}</w:t></w:r></w:p>`;

/** Signature block: up to three people per row, label above, NAME over a line, position below. */
function signatureBlock(signers, { font, sz, contentW }) {
  const perRow = Math.min(3, signers.length);
  const w = Math.floor(contentW / perRow);
  const none = '<w:tblBorders><w:top w:val="nil"/><w:left w:val="nil"/><w:bottom w:val="nil"/><w:right w:val="nil"/><w:insideH w:val="nil"/><w:insideV w:val="nil"/></w:tblBorders>';
  let rows = '';
  for (let i = 0; i < signers.length; i += perRow) {
    const group = signers.slice(i, i + perRow);
    while (group.length < perRow) group.push(null);
    rows += `<w:tr><w:trPr><w:cantSplit/></w:trPr>${group.map((s) => `<w:tc><w:tcPr><w:tcW w:w="${w}" w:type="dxa"/></w:tcPr>${s
      ? para(s.label, { font, sz, after: 360 }) + para(String(s.name).toUpperCase(), { font, sz, jc: 'center', bold: true, border: true }) + para(s.role || '', { font, sz: Math.max(16, sz - 2), jc: 'center', italic: true, after: 240 })
      : '<w:p/>'}</w:tc>`).join('')}</w:tr>`;
  }
  return `<w:p><w:pPr><w:spacing w:after="240"/></w:pPr></w:p><w:tbl><w:tblPr><w:tblW w:w="${w * perRow}" w:type="dxa"/>${none}<w:tblLayout w:type="fixed"/></w:tblPr><w:tblGrid>${'<w:gridCol w:w="'.concat(String(w), '"/>').repeat(perRow)}</w:tblGrid>${rows}</w:tbl><w:p/>`;
}

/**
 * The formatted copy.
 *   opts: { paper, margins: { top, right, bottom, left } (inches), font, size (pt) | null,
 *           signers: [{ label, name, role }] | null, letterhead: { region, division, school } | null }
 * → { bytes, changes: [text], notes: [text] }
 */
export async function formatDocx(bytes, opts = {}) {
  const paper = PAPER_TWIPS[opts.paper] ? opts.paper : HOUSE.paper;
  const margins = { ...HOUSE.margins, ...(opts.margins || {}) };
  const font = String(opts.font || HOUSE.font).trim();
  const PizZip = interop(await import('pizzip'));
  const zip = new PizZip(toUint8(bytes));
  const docFile = zip.file('word/document.xml');
  if (!docFile) throw new Error('This file is not a Word document (.docx).');
  let doc = docFile.asText();
  const stylesFile = zip.file('word/styles.xml');
  let styles = stylesFile ? stylesFile.asText() : '';
  const changes = [];
  const notes = [];

  // 1. Paper and margins, in every section.
  let firstBefore = null;
  let contentW = 0;
  doc = doc.replace(/<w:sectPr\b[^>]*>[\s\S]*?<\/w:sectPr>|<w:sectPr\b[^>]*\/>/g, (sect) => {
    const full = sect.endsWith('/>') ? sect.replace(/\/>$/, '></w:sectPr>') : sect;
    const res = setSection(full, { paper, margins });
    if (!firstBefore) firstBefore = res.before;
    contentW = contentW || res.contentW;
    return res.xml;
  });
  if (!firstBefore) {
    const res = setSection('<w:sectPr></w:sectPr>', { paper, margins });
    doc = doc.replace(/<\/w:body>/, `${res.xml}</w:body>`);
    firstBefore = { paper: 'not set', landscape: false, margins: null };
    contentW = res.contentW;
  }
  changes.push(`paper ${firstBefore.paper === paper ? 'already' : `${PAPER_NAMES[firstBefore.paper] || firstBefore.paper} →`} ${PAPER_NAMES[paper]}${firstBefore.landscape ? ' (landscape kept)' : ''}`);
  const m = margins;
  const marText = m.top === m.bottom && m.left === m.right && m.top === m.left ? `${m.top}" all around` : `${m.top}" top, ${m.bottom}" bottom, ${m.left}" left, ${m.right}" right`;
  changes.push(`margins ${firstBefore.margins ? `${firstBefore.margins.map(fmtIn).join('/')} (top/right/bottom/left) → ` : ''}${marText}`);

  // 2. One font (and the body size, when asked).
  const oldFonts = new Set();
  let fontRuns = 0;
  for (const name of Object.keys(zip.files).filter((n) => PARTS.test(n))) {
    const xml = name === 'word/document.xml' ? doc : name === 'word/styles.xml' ? styles : zip.file(name).asText();
    const res = setFonts(xml, font);
    res.old.forEach((f) => oldFonts.add(f));
    fontRuns += res.count;
    if (name === 'word/document.xml') doc = res.xml;
    else if (name === 'word/styles.xml') styles = res.xml;
    else zip.file(name, res.xml);
  }
  if (styles) {
    // Text with no font of its own follows the document default.
    const fonts = `<w:rFonts w:ascii="${esc(font)}" w:hAnsi="${esc(font)}" w:cs="${esc(font)}" w:eastAsia="${esc(font)}"/>`;
    if (!/<w:docDefaults>/.test(styles)) styles = styles.replace(/(<w:styles\b[^>]*>)/, `$1<w:docDefaults><w:rPrDefault><w:rPr>${fonts}</w:rPr></w:rPrDefault></w:docDefaults>`);
    else if (!/<w:rPrDefault>/.test(styles)) styles = styles.replace('<w:docDefaults>', `<w:docDefaults><w:rPrDefault><w:rPr>${fonts}</w:rPr></w:rPrDefault>`);
    else if (!/<w:rPrDefault>\s*<w:rPr>[\s\S]*?<w:rFonts/.test(styles)) styles = styles.replace(/<w:rPrDefault>\s*<w:rPr>/, `<w:rPrDefault><w:rPr>${fonts}`).replace(/<w:rPrDefault>\s*<w:rPr\/>/, `<w:rPrDefault><w:rPr>${fonts}</w:rPr>`);
  }
  changes.push(oldFonts.size ? `font ${[...oldFonts].slice(0, 4).join(', ')} → ${font}` : `font ${font} throughout`);
  let size = null;
  if (opts.size) {
    const target = Math.round(Number(opts.size) * 2);
    const body = bodySize(doc, styles);
    if (target && target !== body) {
      const swap = (xml) => xml.replace(new RegExp(`<w:sz w:val="${body}"/>`, 'g'), `<w:sz w:val="${target}"/>`).replace(new RegExp(`<w:szCs w:val="${body}"/>`, 'g'), `<w:szCs w:val="${target}"/>`);
      doc = swap(doc);
      if (styles) {
        styles = /<w:rPrDefault>[\s\S]*?<w:sz w:val="\d+"\/>/.test(styles)
          ? styles.replace(/(<w:rPrDefault>[\s\S]*?<w:sz w:val=")\d+("\/>)/, `$1${target}$2`)
          : styles.replace(/(<w:rPrDefault>\s*<w:rPr>)/, `$1<w:sz w:val="${target}"/><w:szCs w:val="${target}"/>`);
        styles = swap(styles);
      }
      changes.push(`body text ${body / 2} pt → ${target / 2} pt (headings keep their sizes)`);
    }
    size = target;
  }
  const sz = size || bodySize(doc, styles);

  // 3. Tables and pictures that no longer fit.
  const fit = fitToWidth(doc, contentW);
  doc = fit.xml;
  if (fit.tables) changes.push(`${fit.tables} table(s) narrowed to fit the page`);
  if (fit.pictures) changes.push(`${fit.pictures} picture(s) scaled down to fit the page`);

  // 4. Letterhead and signatures (only when asked).
  const allText = Object.keys(zip.files).filter((n) => /^word\/(document|header\d*)\.xml$/.test(n)).map((n) => docText(n === 'word/document.xml' ? doc : zip.file(n).asText())).join('\n');
  if (opts.letterhead) {
    if (/department of education/i.test(allText)) notes.push('it already has the DepEd letterhead, so I did not add another');
    else {
      const lines = headerLines({ ...opts.letterhead, deped: true });
      const sizeOf = (s) => (s === 'large' ? sz + 4 : s === 'small' ? Math.max(16, sz - 2) : sz);
      const xml = lines.map((l, i) => para(l.text, { font, sz: sizeOf(l.size), jc: 'center', bold: l.bold, after: i === lines.length - 1 ? 240 : 0 })).join('');
      doc = doc.replace(/(<w:body>)/, `$1${xml}`);
      changes.push(`DepEd letterhead added (${lines.length} lines)`);
    }
  }
  if (opts.signers?.length) {
    if (/prepared by|checked by|noted by|approved by|submitted by/i.test(docText(doc))) notes.push('it already has a signature block (Prepared by / Noted by), so I did not add another');
    else {
      const block = signatureBlock(opts.signers, { font, sz, contentW });
      // Before the document's own page settings (the last thing in the body), else at the end.
      const finalSect = doc.match(/<w:sectPr\b(?:(?!<w:sectPr\b)[\s\S])*?<\/w:sectPr>\s*<\/w:body>/);
      const insertAt = finalSect ? finalSect.index : doc.lastIndexOf('</w:body>');
      doc = doc.slice(0, insertAt) + block + doc.slice(insertAt);
      changes.push(`signature block added (${opts.signers.map((s) => s.label.replace(/:$/, '')).join(', ')})`);
    }
  }

  zip.file('word/document.xml', doc);
  if (stylesFile) zip.file('word/styles.xml', styles);
  return { bytes: toUint8(zip.generate({ type: 'uint8array', compression: 'DEFLATE' })), changes, notes, fontRuns };
}
