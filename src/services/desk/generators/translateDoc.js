/**
 * translateDoc.js — a document translated into Filipino or a mother tongue while its
 * layout stays: every stretch of text is translated in place, so paragraphs, tables, tabs,
 * pictures, page setup and formatting are untouched. Runs with different formatting inside a
 * stretch (a bold word in a sentence) are kept apart with ⟦n⟧ markers the AI must return.
 *
 * Word (.docx), PowerPoint (.pptx) and Excel (.xlsx text cells) are supported.
 */
import { toUint8, interop, unescapeXml } from './shared.js';

/** DepEd's mother tongues (MTB-MLE) and Filipino/English, as teachers write them. */
export const LANGUAGES = {
  filipino: 'Filipino', tagalog: 'Filipino', english: 'English', cebuano: 'Cebuano', bisaya: 'Cebuano', binisaya: 'Cebuano',
  hiligaynon: 'Hiligaynon', ilonggo: 'Hiligaynon', ilocano: 'Ilocano', iloko: 'Ilocano', ilokano: 'Ilocano', waray: 'Waray',
  bikol: 'Bikol', bicol: 'Bikol', kapampangan: 'Kapampangan', pangasinan: 'Pangasinan', pangasinense: 'Pangasinan',
  tausug: 'Tausug', maguindanaon: 'Maguindanaon', maguindanaoan: 'Maguindanaon', maranao: 'Maranao', chavacano: 'Chavacano',
  ybanag: 'Ybanag', ibanag: 'Ybanag', ivatan: 'Ivatan', sambal: 'Sambal', aklanon: 'Aklanon', kinaraya: 'Kinaray-a',
  'kinaray-a': 'Kinaray-a', yakan: 'Yakan', surigaonon: 'Surigaonon',
};
export const languageName = (s) => LANGUAGES[String(s || '').toLowerCase().replace(/[^a-z-]/g, '')] || null;

const unesc = unescapeXml;
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Nothing to translate: numbers, codes, links, blanks and lines, single letters. */
export function skipText(t) {
  const s = String(t || '').trim();
  return !s || !/[A-Za-zÑñ]{2,}/.test(s) || /^(https?:\/\/|www\.)\S+$/i.test(s) || /^\S+@\S+\.\S+$/.test(s) || /^[A-Z]{1,4}\d*[.)]?$/.test(s) || /^[_.…\s-]+$/.test(s);
}

/**
 * The text stretches of one XML part, in order. A stretch is the text between breaks
 * (tab, line break, picture, end of paragraph); its pieces are grouped by run formatting.
 * → { stretches: [{ pieces: [index], groups: [[index]] }], texts: [text by w:t index] }
 */
function readStretches(xml, ns) {
  const re = new RegExp(`<${ns}:t(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${ns}:t>|<${ns}:t\\/>|<${ns}:tab\\/>|<${ns}:br\\b[^>]*\\/>|<${ns}:cr\\/>|<\\/${ns}:p>|<w:drawing>|<mc:AlternateContent>|<${ns}:r(?:\\s[^>]*)?>|<${ns}:rPr\\b[^>]*\\/>|<${ns}:rPr\\b[^>]*>[\\s\\S]*?<\\/${ns}:rPr>|<${ns}:fld\\b[^>]*>`, 'g');
  const stretches = [];
  const texts = [];
  let cur = null;
  let rPr = '';
  const close = () => { if (cur?.pieces.length) stretches.push(cur); cur = null; };
  for (const m of xml.matchAll(re)) {
    const tok = m[0];
    if (tok.startsWith(`<${ns}:t>`) || tok.startsWith(`<${ns}:t `) || tok === `<${ns}:t/>`) {
      const i = texts.length;
      texts.push(m[1] !== undefined ? unesc(m[1]) : '');
      if (!cur) cur = { pieces: [], groups: [], styles: [] };
      cur.pieces.push(i);
      const last = cur.styles.length - 1;
      if (last >= 0 && cur.styles[last] === rPr) cur.groups[last].push(i);
      else { cur.styles.push(rPr); cur.groups.push([i]); }
    } else if (tok.startsWith(`<${ns}:r`) && !tok.startsWith(`<${ns}:rPr`)) {
      rPr = '';
    } else if (tok.startsWith(`<${ns}:rPr`)) {
      rPr = tok;
    } else {
      close();
    }
  }
  close();
  return { stretches, texts };
}

/** Writes the new texts back, w:t by w:t, in the same order they were read. */
function writeTexts(xml, ns, texts) {
  let i = 0;
  const re = new RegExp(`<${ns}:t(?:\\s[^>]*)?>[\\s\\S]*?<\\/${ns}:t>|<${ns}:t\\/>`, 'g');
  return xml.replace(re, (tok) => {
    const t = texts[i];
    i += 1;
    if (t === undefined) return tok;
    return ns === 'w' ? `<w:t xml:space="preserve">${esc(t)}</w:t>` : `<a:t>${esc(t)}</a:t>`;
  });
}

/** A stretch as one string for the AI: ⟦1⟧…⟦2⟧… when its runs are formatted differently. */
function stretchSource(st, texts) {
  if (st.groups.length === 1) return st.pieces.map((i) => texts[i]).join('');
  return st.groups.map((g, k) => `⟦${k + 1}⟧${g.map((i) => texts[i]).join('')}`).join('');
}

/** Puts a translated stretch back into its pieces (first piece of each group takes the text). */
function applyStretch(st, texts, translated) {
  const out = [...texts];
  if (st.groups.length === 1) {
    st.pieces.forEach((i, k) => { out[i] = k === 0 ? translated : ''; });
    return out;
  }
  const parts = translated.split(/⟦(\d+)⟧/);
  const byGroup = new Map();
  for (let k = 1; k < parts.length; k += 2) byGroup.set(Number(parts[k]), (byGroup.get(Number(parts[k])) || '') + parts[k + 1]);
  st.groups.forEach((g, k) => g.forEach((i, j) => { out[i] = j === 0 ? (byGroup.get(k + 1) ?? '') : ''; }));
  if (parts[0]) out[st.groups[0][0]] = parts[0] + out[st.groups[0][0]];
  return out;
}

/** The translation is usable: same markers in order, same numbers, same name tokens. */
export function checkTranslation(src, out) {
  if (typeof out !== 'string' || !out.trim()) return 'empty';
  const marks = (s) => (s.match(/⟦\d+⟧/g) || []).join('');
  if (marks(src) !== marks(out)) return 'markers';
  const tokens = (s) => (s.match(/⟪\d+⟫/g) || []).sort().join('');
  // ⟪n⟫ are learner names hidden from the AI; they must all come back.
  if (tokens(src) !== tokens(out)) return 'names';
  const nums = (s) => (s.replace(/⟦\d+⟧|⟪\d+⟫/g, ' ').match(/\d+(?:[.,:/]\d+)*/g) || []).sort().join(' ');
  if (nums(src) !== nums(out)) return 'numbers';
  return null;
}

const WORD_PARTS = /^word\/(document|header\d*|footer\d*|footnotes|endnotes)\.xml$/;
const SLIDE_PARTS = /^ppt\/(slides\/slide\d+|notesSlides\/notesSlide\d+)\.xml$/;

/**
 * Every string to translate in a Word/PowerPoint file.
 * → { items: [{ part, stretch, source }], parts: { name: { xml, texts, stretches } } }
 */
export async function collectOffice(bytes, kind) {
  const PizZip = interop(await import('pizzip'));
  const zip = new PizZip(toUint8(bytes));
  const ns = kind === 'pptx' ? 'a' : 'w';
  const re = kind === 'pptx' ? SLIDE_PARTS : WORD_PARTS;
  const parts = {};
  const items = [];
  const names = Object.keys(zip.files).filter((n) => re.test(n)).sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
  for (const name of names) {
    const xml = zip.file(name).asText();
    const { stretches, texts } = readStretches(xml, ns);
    parts[name] = { xml, texts, stretches };
    stretches.forEach((st, si) => {
      const source = stretchSource(st, texts);
      if (!skipText(source.replace(/⟦\d+⟧/g, ''))) items.push({ part: name, stretch: si, source });
    });
  }
  return { zip, ns, parts, items };
}

/** The translated Word/PowerPoint file. translations: Map(source → translated). */
export function buildOffice({ zip, ns, parts, items }, translations) {
  let done = 0;
  for (const [name, p] of Object.entries(parts)) {
    let texts = p.texts;
    let changed = false;
    for (const it of items.filter((x) => x.part === name)) {
      const tr = translations.get(it.source);
      if (tr === undefined) continue;
      texts = applyStretch(p.stretches[it.stretch], texts, tr);
      changed = true;
      done += 1;
    }
    if (changed) zip.file(name, writeTexts(p.xml, ns, texts));
  }
  return { bytes: toUint8(zip.generate({ type: 'uint8array', compression: 'DEFLATE' })), done };
}

/**
 * Asks the AI in batches; only checked translations are kept.
 *   translateBatch(strings) → strings (same length), via the caller's AI
 * → { map: Map(source → translated), failed: [source] }
 */
export async function translateAll(sources, translateBatch, { maxItems = 40, maxChars = 4000, onProgress } = {}) {
  const unique = [...new Set(sources)];
  const map = new Map();
  const failed = [];
  const batches = [];
  let cur = [];
  let chars = 0;
  for (const s of unique) {
    if (cur.length && (cur.length >= maxItems || chars + s.length > maxChars)) { batches.push(cur); cur = []; chars = 0; }
    cur.push(s);
    chars += s.length;
  }
  if (cur.length) batches.push(cur);
  for (const [b, batch] of batches.entries()) {
    onProgress?.(b + 1, batches.length);
    let pending = batch;
    for (let attempt = 0; attempt < 2 && pending.length; attempt += 1) {
      let out = [];
      try {
        out = await translateBatch(pending);
      } catch {
        out = [];
      }
      const retry = [];
      pending.forEach((src, i) => {
        const tr = Array.isArray(out) && out.length === pending.length ? out[i] : undefined;
        if (tr !== undefined && !checkTranslation(src, tr)) map.set(src, tr);
        else retry.push(src);
      });
      pending = retry;
    }
    failed.push(...pending);
  }
  return { map, failed };
}
