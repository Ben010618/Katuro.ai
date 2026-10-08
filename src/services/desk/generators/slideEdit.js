/**
 * slideEdit.js — editing the teacher's own PowerPoint deck in place:
 *   restyle to a school template deck: its theme colours and fonts, and its slide-master
 *   background (colour, gradient or picture) are copied in; explicit fonts follow the
 *   template's fonts (titles: heading font, the rest: body font).
 * Text edits reuse translateDoc.js (collectOffice/buildOffice), so formatting stays.
 */
import { toUint8, interop } from './shared.js';

const SYMBOL_FONTS = /symbol|wingdings|webdings|marlett/i;
const relsOf = (part) => part.replace(/([^/]+)$/, '_rels/$1.rels');
const resolve = (fromPart, target) => {
  const parts = fromPart.split('/').slice(0, -1);
  for (const seg of target.split('/')) { if (seg === '..') parts.pop(); else if (seg !== '.') parts.push(seg); }
  return parts.join('/');
};
const relTargets = (zip, part, type) => {
  const rels = zip.file(relsOf(part))?.asText() || '';
  return [...rels.matchAll(/<Relationship\b[^>]*>/g)].map((m) => m[0])
    .filter((r) => r.includes(`/relationships/${type}"`))
    .map((r) => ({ id: (r.match(/Id="([^"]+)"/) || [])[1], target: resolve(part, (r.match(/Target="([^"]+)"/) || [])[1] || '') }));
};
const masters = (zip) => Object.keys(zip.files).filter((n) => /^ppt\/slideMasters\/slideMaster\d+\.xml$/.test(n)).sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));

/** Slide number (or "notes N") of a part name. */
export const slideLabel = (part) => {
  const m = part.match(/(notesSlide|slide)(\d+)\.xml$/);
  return m ? (m[1] === 'notesSlide' ? `notes ${m[2]}` : `slide ${m[2]}`) : part;
};

/**
 * The deck restyled to the template deck.
 * → { bytes, changes: [text] }
 */
export async function applySchoolTheme(deckBytes, templateBytes) {
  const PizZip = interop(await import('pizzip'));
  const deck = new PizZip(toUint8(deckBytes));
  const tpl = new PizZip(toUint8(templateBytes));
  const changes = [];
  const tMaster = masters(tpl)[0];
  if (!tMaster) throw new Error('The template is not a PowerPoint deck (no slide master).');
  const tTheme = relTargets(tpl, tMaster, 'theme')[0]?.target;
  const tThemeXml = tTheme ? tpl.file(tTheme)?.asText() || '' : '';
  const clr = tThemeXml.match(/<a:clrScheme\b[\s\S]*?<\/a:clrScheme>/)?.[0];
  const fonts = tThemeXml.match(/<a:fontScheme\b[\s\S]*?<\/a:fontScheme>/)?.[0];
  const major = fonts?.match(/<a:majorFont>[\s\S]*?<a:latin typeface="([^"]*)"/)?.[1] || '';
  const minor = fonts?.match(/<a:minorFont>[\s\S]*?<a:latin typeface="([^"]*)"/)?.[1] || '';

  // 1. Theme colours and fonts in every theme the deck's masters use.
  const deckThemes = new Set(masters(deck).flatMap((m) => relTargets(deck, m, 'theme').map((t) => t.target)));
  for (const th of deckThemes) {
    let xml = deck.file(th)?.asText();
    if (!xml) continue;
    if (clr) xml = xml.replace(/<a:clrScheme\b[\s\S]*?<\/a:clrScheme>/, clr);
    if (fonts) xml = xml.replace(/<a:fontScheme\b[\s\S]*?<\/a:fontScheme>/, fonts);
    deck.file(th, xml);
  }
  if (clr) changes.push(`colours from the template (${(clr.match(/name="([^"]*)"/) || [])[1] || 'theme'})`);
  if (major || minor) changes.push(`fonts: headings ${major || '(same)'}, text ${minor || '(same)'}`);

  // 2. The master background (a picture is copied with it).
  let bg = tpl.file(tMaster).asText().match(/<p:bg>[\s\S]*?<\/p:bg>/)?.[0];
  if (bg) {
    const embeds = [...bg.matchAll(/r:embed="([^"]+)"/g)].map((m) => m[1]);
    const tRels = relTargets(tpl, tMaster, 'image');
    for (const [k, id] of embeds.entries()) {
      const src = tRels.find((r) => r.id === id);
      if (!src || !tpl.file(src.target)) { bg = null; break; }
      const ext = src.target.split('.').pop();
      const media = `ppt/media/kt_template_bg${k + 1}.${ext}`;
      deck.file(media, tpl.file(src.target).asUint8Array());
      for (const dm of masters(deck)) {
        const rp = relsOf(dm);
        const rels = deck.file(rp)?.asText() || '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>';
        const newId = `rIdKtBg${k + 1}`;
        if (!rels.includes(`Id="${newId}"`)) deck.file(rp, rels.replace('</Relationships>', `<Relationship Id="${newId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/${media.split('/').pop()}"/></Relationships>`));
      }
      bg = bg.replace(`r:embed="${id}"`, `r:embed="rIdKtBg${k + 1}"`);
      const ct = deck.file('[Content_Types].xml').asText();
      const mime = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', bmp: 'image/bmp' }[ext.toLowerCase()];
      if (mime && !new RegExp(`Extension="${ext}"`, 'i').test(ct)) deck.file('[Content_Types].xml', ct.replace(/(<Types\b[^>]*>)/, `$1<Default Extension="${ext}" ContentType="${mime}"/>`));
    }
    if (bg) {
      for (const dm of masters(deck)) {
        const xml = deck.file(dm).asText();
        deck.file(dm, /<p:bg>[\s\S]*?<\/p:bg>/.test(xml) ? xml.replace(/<p:bg>[\s\S]*?<\/p:bg>/, bg) : xml.replace(/(<p:cSld\b[^>]*>)/, `$1${bg}`));
      }
      changes.push(`background from the template${embeds.length ? ' (with its picture)' : ''}`);
    }
  }

  // 3. Explicit fonts on the slides follow the template (titles: heading font).
  let fontRuns = 0;
  if (major || minor) {
    for (const part of Object.keys(deck.files).filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))) {
      const xml = deck.file(part).asText().replace(/<p:sp>[\s\S]*?<\/p:sp>/g, (sp) => {
        const isTitle = /<p:ph\b[^>]*type="(title|ctrTitle)"/.test(sp);
        const face = isTitle ? major || minor : minor || major;
        return sp.replace(/<a:(latin|ea|cs) typeface="([^"]*)"/g, (m, kind, f) => {
          if (SYMBOL_FONTS.test(f) || f.startsWith('+') || f === face) return m;
          if (kind === 'latin') fontRuns += 1;
          return `<a:${kind} typeface="${face}"`;
        });
      });
      deck.file(part, xml);
    }
  }
  if (fontRuns) changes.push(`${fontRuns} text run(s) switched to the template fonts`);
  if (!changes.length) throw new Error('The template has no theme colours, fonts or background to copy.');
  return { bytes: toUint8(deck.generate({ type: 'uint8array', compression: 'DEFLATE' })), changes };
}

/** How much two texts share (0–1), by words: a typo fix stays close to the original. */
export function closeness(a, b) {
  const wa = String(a).toLowerCase().split(/\s+/).filter(Boolean);
  const wb = String(b).toLowerCase().split(/\s+/).filter(Boolean);
  if (!wa.length && !wb.length) return 1;
  const pool = [...wb];
  let same = 0;
  for (const w of wa) { const k = pool.indexOf(w); if (k >= 0) { same += 1; pool.splice(k, 1); } }
  return (2 * same) / (wa.length + wb.length);
}
