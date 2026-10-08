/**
 * mailMerge.js — one copy of the teacher's Word template per learner (certificates,
 * parent letters, report-card comments, awards), by code only.
 *
 * Fields in the template can be written {{Name}}, [Name], «Name» or <<Name>>, or the
 * teacher can name a sample text to replace ("JUAN DELA CRUZ" → each learner's name).
 */
import { toUint8, interop, unescapeXml } from './shared.js';

const PARTS = /^word\/(document|header\d*|footer\d*)\.xml$/;
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const unesc = unescapeXml;

/** Field names usable in {{ }}: letters, digits, spaces, apostrophes, dots, dashes. */
const FIELD = "[A-Za-zÑñ][A-Za-zÑñ0-9 .'_-]{0,40}";

/**
 * Rewrites one paragraph's text when it contains a marker: the paragraph's runs are
 * joined into its first run (that run's formatting is kept), then markers become {{ }}.
 */
function rewriteParagraph(pXml, replaceFn) {
  const texts = [...pXml.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)];
  if (!texts.length) return pXml;
  const joined = unesc(texts.map((m) => m[1]).join(''));
  const replaced = replaceFn(joined);
  if (replaced === joined) return pXml;
  let first = true;
  return pXml.replace(/<w:t(?:\s[^>]*)?>[\s\S]*?<\/w:t>/g, () => {
    if (!first) return '<w:t></w:t>';
    first = false;
    return `<w:t xml:space="preserve">${esc(replaced)}</w:t>`;
  });
}

/**
 * Turns the teacher's markers into {{Field}} tags.
 *   replaceText: { "JUAN DELA CRUZ": "Name", ... } (sample text → field)
 * → { bytes, fields: [unique field names], inHeaders: [fields used in headers/footers] }
 */
export async function prepareMergeTemplate(templateBytes, { replaceText = {} } = {}) {
  const PizZip = interop(await import('pizzip'));
  const zip = new PizZip(toUint8(templateBytes));
  const samples = Object.entries(replaceText || {}).filter(([k, v]) => String(k).trim() && String(v).trim());
  const markers = new RegExp(`\\[(${FIELD})\\]|«(${FIELD})»|<<(${FIELD})>>`, 'g');
  const convert = (text) => {
    let t = text.replace(markers, (_, a, b, c) => `{{${(a || b || c).trim()}}}`);
    for (const [sample, field] of samples) t = t.split(sample).join(`{{${field.trim()}}}`);
    return t;
  };
  const fields = [];
  const inHeaders = new Set();
  for (const name of Object.keys(zip.files).filter((n) => PARTS.test(n))) {
    let xml = zip.file(name).asText();
    // Innermost paragraphs only (text boxes hold paragraphs inside a paragraph).
    xml = xml.replace(/<w:p[ >](?:(?!<w:p[ >])[\s\S])*?<\/w:p>/g, (p) => rewriteParagraph(p, convert));
    zip.file(name, xml);
    const plain = unesc(xml.replace(/<[^>]+>/g, ''));
    for (const m of plain.matchAll(/\{\{\s*([^{}#/^]+?)\s*\}\}/g)) {
      const f = m[1].trim();
      if (!fields.includes(f)) fields.push(f);
      if (!/document\.xml$/.test(name)) inHeaders.add(f);
    }
  }
  return { bytes: toUint8(zip.generate({ type: 'uint8array', compression: 'DEFLATE' })), fields, inHeaders: [...inHeaders] };
}

function makeDoc(Docxtemplater, zip) {
  return new Docxtemplater(zip, { delimiters: { start: '{{', end: '}}' }, paragraphLoop: true, linebreaks: true, nullGetter: () => '' });
}

/** One filled copy. */
export async function renderMergeCopy(preparedBytes, values) {
  const PizZip = interop(await import('pizzip'));
  const Docxtemplater = interop(await import('docxtemplater'));
  const doc = makeDoc(Docxtemplater, new PizZip(toUint8(preparedBytes)));
  doc.render(values || {});
  return toUint8(doc.getZip().generate({ type: 'uint8array', compression: 'DEFLATE' }));
}

/** All copies in one document, one learner per page (page break between learners). */
export async function renderMergeCombined(preparedBytes, rows) {
  const PizZip = interop(await import('pizzip'));
  const Docxtemplater = interop(await import('docxtemplater'));
  const zip = new PizZip(toUint8(preparedBytes));
  const docXml = zip.file('word/document.xml').asText();
  const bodyStart = docXml.indexOf('<w:body>') + '<w:body>'.length;
  const bodyEnd = docXml.lastIndexOf('</w:body>');
  const body = docXml.slice(bodyStart, bodyEnd);
  // The final section properties (page size, margins) stay outside the loop.
  const sect = body.lastIndexOf('<w:sectPr');
  const content = sect >= 0 ? body.slice(0, sect) : body;
  const sectPr = sect >= 0 ? body.slice(sect) : '';
  const para = (t) => `<w:p><w:r><w:t>${t}</w:t></w:r></w:p>`;
  const pageBreak = '<w:p><w:r><w:br w:type="page"/></w:r></w:p>';
  const looped = `${para('{{#__copies}}')}${content}${para('{{#__more}}')}${pageBreak}${para('{{/__more}}')}${para('{{/__copies}}')}${sectPr}`;
  zip.file('word/document.xml', docXml.slice(0, bodyStart) + looped + docXml.slice(bodyEnd));
  const doc = makeDoc(Docxtemplater, zip);
  doc.render({ __copies: rows.map((r, i) => ({ ...r, __more: i < rows.length - 1 })) });
  return toUint8(doc.getZip().generate({ type: 'uint8array', compression: 'DEFLATE' }));
}

const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');

/**
 * Which class-list column (or constant) fills each field.
 *   headers: class-list column headings; constants: { field-ish key: value } (teacher's values, profile)
 * → { map: { field: { column } | { value } }, missing: [field] }
 */
export function mapMergeFields(fields, headers, constants = {}) {
  const map = {};
  const missing = [];
  const constKeys = Object.keys(constants);
  for (const field of fields) {
    const f = norm(field);
    const constHit = constKeys.find((k) => norm(k) === f);
    if (constHit) { map[field] = { value: String(constants[constHit] ?? '') }; continue; }
    let col = headers.find((h) => norm(h) === f);
    if (!col) col = headers.find((h) => norm(h) && (norm(h).includes(f) || f.includes(norm(h))) && Math.min(norm(h).length, f.length) >= 3);
    if (!col && /name|pangalan/.test(f)) col = headers.find((h) => /name|pangalan|learner|student|pupil/i.test(h));
    if (col) map[field] = { column: col };
    else missing.push(field);
  }
  return { map, missing };
}

/** "Dela Cruz, Juan P." → "Juan P. Dela Cruz" (for certificates); other names unchanged. */
export function firstNameFirst(name) {
  const t = String(name || '').trim().replace(/^\d{1,3}\s*[.)-]\s*/, '');
  const comma = t.indexOf(',');
  return comma > 0 ? `${t.slice(comma + 1).trim()} ${t.slice(0, comma).trim()}`.replace(/\s+/g, ' ') : t;
}
