/**
 * placeSignature.js — the teacher's own e-signature placed above the teacher's own name on
 * signature lines (a line that is just the name, e.g. "ANA M. REYES" under "Prepared by:").
 * Never above anyone else's name.
 */
import { toUint8, interop } from './shared.js';

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The teacher's name as it can be written: any case, middle initials optional, "Dr."/"Mr." etc. before. */
export function nameMatcher(fullName) {
  const words = String(fullName || '').replace(/,/g, ' ').split(/\s+/).filter((w) => w && !/^[A-Za-z]\.?$/.test(w));
  if (words.length < 2) return null;
  const core = words.map((w) => esc(w.replace(/\.$/, ''))).join('(?:\\s+[A-Za-zÑñ]\\.?)*\\s+');
  return {
    // A signature line: just the name (titles before, ", Teacher III"/degrees after are fine).
    line: new RegExp(`^\\s*(?:(?:mr|mrs|ms|dr|sir|ma'?am|maam|gng|g|bb)\\.?\\s+)?${core}\\s*(?:,\\s*[^,]{1,30})*\\s*$`, 'i'),
    any: new RegExp(core, 'i'),
  };
}

/** PNG size in pixels (IHDR). */
function pngSize(u8) {
  const v = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  return { w: v.getUint32(16), h: v.getUint32(20) };
}

const paraText = (p) => (p.match(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g) || []).map((t) => t.replace(/<[^>]+>/g, '')).join('').replace(/&amp;/g, '&');

/**
 * Word: a picture paragraph inserted right above each line that is the teacher's name.
 * → { bytes, placed, mentions } (mentions = the name appears, but only inside other text)
 */
export async function signDocx(bytes, png, { fullName, widthIn = 1.5 }) {
  const m = nameMatcher(fullName);
  if (!m) return { bytes, placed: 0, mentions: 0 };
  const PizZip = interop(await import('pizzip'));
  const zip = new PizZip(toUint8(bytes));
  let doc = zip.file('word/document.xml').asText();
  const { w, h } = pngSize(toUint8(png));
  const cx = Math.round(widthIn * 914400);
  const cy = Math.round((cx * h) / w);
  const rid = 'rIdKtSignature1';
  let placed = 0;
  let mentions = 0;
  let id = 9000;
  doc = doc.replace(/<w:p[ >](?:(?!<w:p[ >])[\s\S])*?<\/w:p>/g, (p) => {
    const text = paraText(p);
    if (!m.any.test(text)) return p;
    if (!m.line.test(text)) { mentions += 1; return p; }
    placed += 1;
    id += 1;
    const jc = (p.match(/<w:jc w:val="[^"]+"\/>/) || [''])[0];
    const pic = `<w:p><w:pPr><w:spacing w:before="0" w:after="0"/>${jc}</w:pPr><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${id}" name="Signature ${placed}"/><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="${id}" name="signature.png"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${rid}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`;
    return pic + p;
  });
  if (!placed) return { bytes, placed, mentions };
  // Namespaces, the picture file, its link and its type.
  doc = doc.replace(/<w:document\b([^>]*)>/, (tag, attrs) => {
    let a = attrs;
    if (!/xmlns:wp=/.test(a)) a += ' xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"';
    if (!/xmlns:r=/.test(a)) a += ' xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
    return `<w:document${a}>`;
  });
  zip.file('word/document.xml', doc);
  zip.file('word/media/kt_signature.png', toUint8(png));
  const relsPath = 'word/_rels/document.xml.rels';
  const rels = zip.file(relsPath)?.asText() || '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>';
  if (!rels.includes(rid)) zip.file(relsPath, rels.replace('</Relationships>', `<Relationship Id="${rid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/kt_signature.png"/></Relationships>`));
  const ct = zip.file('[Content_Types].xml')?.asText();
  if (ct && !/Extension="png"/i.test(ct)) zip.file('[Content_Types].xml', ct.replace('<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">', '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="png" ContentType="image/png"/>'));
  return { bytes: toUint8(zip.generate({ type: 'uint8array', compression: 'DEFLATE' })), placed, mentions };
}

/**
 * PDF: the signature drawn just above each text line that is the teacher's name.
 *   lines: pdfForm.pageLines(pdfjsDoc)
 * → { bytes, placed, mentions, pages: [n] }
 */
export async function signPdf(bytes, png, lines, { fullName, widthIn = 1.5 }) {
  const m = nameMatcher(fullName);
  if (!m) return { bytes, placed: 0, mentions: 0, pages: [] };
  const { PDFDocument } = await import('pdf-lib');
  const doc = await PDFDocument.load(toUint8(bytes), { ignoreEncryption: true });
  const img = await doc.embedPng(toUint8(png));
  const wPt = widthIn * 72;
  const hPt = (img.height / img.width) * wPt;
  let placed = 0;
  let mentions = 0;
  const pages = new Set();
  lines.forEach((page, pi) => {
    for (const line of page.lines) {
      const text = line.items.map((it) => it.str).join(' ').replace(/\s+/g, ' ');
      if (!m.any.test(text)) continue;
      // The name may share a line with other signers ("ANA REYES      JUAN CRUZ"): use the name's own pieces.
      const own = line.items.filter((it) => m.any.test(it.str) || m.line.test(it.str));
      const pieces = own.length ? own : (m.line.test(text) ? line.items : []);
      if (!pieces.length || !(m.line.test(pieces.map((it) => it.str).join(' ')))) { mentions += 1; continue; }
      const left = Math.min(...pieces.map((it) => it.x));
      const right = Math.max(...pieces.map((it) => it.x + it.w));
      const top = Math.max(...pieces.map((it) => it.y + it.h));
      const x = (left + right) / 2 - wPt / 2;
      // Sits on the signature line just above the name (a little overlap looks signed by hand).
      doc.getPage(pi).drawImage(img, { x, y: top - hPt * 0.15, width: wPt, height: hPt });
      placed += 1;
      pages.add(pi + 1);
    }
  });
  return { bytes: placed ? toUint8(await doc.save()) : toUint8(bytes), placed, mentions, pages: [...pages] };
}
