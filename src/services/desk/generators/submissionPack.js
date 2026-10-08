/**
 * submissionPack.js — several documents as ONE ready-to-submit PDF: page numbers on the
 * documents, then a cover page (DepEd header, title, who submits, date, contents with the
 * page each document starts on) in front. By code (pdf-lib).
 */
import { toUint8, headerLines } from './shared.js';

/** Joins PDFs in order. → { bytes, starts: [first page of each (1-based)], pages } */
export async function joinPdfs(list) {
  const { PDFDocument } = await import('pdf-lib');
  const out = await PDFDocument.create();
  const starts = [];
  for (const bytes of list) {
    const src = await PDFDocument.load(toUint8(bytes), { ignoreEncryption: true });
    if (src.isEncrypted) throw new Error('One of the PDFs is password-protected. Remove the password first.');
    starts.push(out.getPageCount() + 1);
    (await out.copyPages(src, src.getPageIndices())).forEach((p) => out.addPage(p));
  }
  return { bytes: toUint8(await out.save()), starts, pages: out.getPageCount() };
}

/**
 * The cover page in front of the numbered documents.
 *   info: { title, subtitle, header: { region, division, school }, submittedBy, position, submittedTo, date }
 *   contents: [{ title, page }]
 */
export async function addCover(bytes, info, contents, { paper = [612, 936] } = {}) {
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');
  const doc = await PDFDocument.load(toUint8(bytes), { ignoreEncryption: true });
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const safe = (f, s) => [...String(s ?? '')].map((ch) => { try { f.encodeText(ch); return ch; } catch { return '?'; } }).join('');
  const [W, H] = paper;
  const page = doc.insertPage(0, [W, H]);
  const center = (text, y, size, f = font, color = rgb(0, 0, 0)) => {
    const t = safe(f, text);
    page.drawText(t, { x: (W - f.widthOfTextAtSize(t, size)) / 2, y, size, font: f, color });
  };
  let y = H - 72;
  for (const l of headerLines(info.header)) {
    const size = l.size === 'large' ? 15 : l.size === 'small' ? 10 : 12;
    center(l.text, y, size, l.bold ? bold : font);
    y -= size + 6;
  }
  if (info.header) { page.drawLine({ start: { x: 72, y: y + 2 }, end: { x: W - 72, y: y + 2 }, thickness: 1 }); y -= 70; } else y -= 60;
  // The title, wrapped to the page.
  const words = safe(bold, info.title || 'Submission').split(/\s+/);
  let line = '';
  const lines = [];
  for (const w of words) { const next = line ? `${line} ${w}` : w; if (bold.widthOfTextAtSize(next, 22) > W - 144 && line) { lines.push(line); line = w; } else line = next; }
  lines.push(line);
  for (const l of lines) { center(l, y, 22, bold); y -= 30; }
  if (info.subtitle) { center(info.subtitle, y, 13); y -= 24; }
  y -= 30;
  // Contents.
  if (contents.length) {
    page.drawText('Contents', { x: 90, y, size: 13, font: bold });
    y -= 22;
    for (const [i, c] of contents.entries()) {
      if (y < 260) { page.drawText(`… and ${contents.length - i} more`, { x: 100, y, size: 10, font }); break; }
      let t = safe(font, `${i + 1}. ${c.title}`);
      while (font.widthOfTextAtSize(t, 11) > W - 260) t = `${t.slice(0, -2)}…`;
      page.drawText(t, { x: 100, y, size: 11, font });
      const p = `page ${c.page}`;
      page.drawText(p, { x: W - 90 - font.widthOfTextAtSize(p, 11), y, size: 11, font });
      // Dotted leader between the title and the page.
      const from = 100 + font.widthOfTextAtSize(t, 11) + 6;
      const to = W - 96 - font.widthOfTextAtSize(p, 11);
      for (let x = from; x < to; x += 5) page.drawText('.', { x, y, size: 11, font, color: rgb(0.55, 0.55, 0.55) });
      y -= 18;
    }
  }
  // Who submits, to whom, when.
  let by = 200;
  const row = (label, value) => {
    if (!value) return;
    page.drawText(safe(bold, label), { x: 90, y: by, size: 11, font: bold });
    page.drawText(safe(font, value), { x: 200, y: by, size: 11, font });
    by -= 20;
  };
  row('Submitted by:', [info.submittedBy, info.position].filter(Boolean).join(', '));
  row('Submitted to:', info.submittedTo);
  row('Date:', info.date);
  return toUint8(await doc.save());
}

/** "Page n of N" at the bottom centre of every page (before the cover is added). */
export async function numberPages(bytes) {
  const { PDFDocument, StandardFonts, rgb, degrees } = await import('pdf-lib');
  const doc = await PDFDocument.load(toUint8(bytes), { ignoreEncryption: true });
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const pages = doc.getPages();
  pages.forEach((p, i) => {
    const text = `Page ${i + 1} of ${pages.length}`;
    const { width: w, height: h } = p.getSize();
    const rot = ((p.getRotation().angle % 360) + 360) % 360;
    const seenW = rot === 90 || rot === 270 ? h : w;
    const X = (seenW - font.widthOfTextAtSize(text, 9)) / 2;
    const Y = 18;
    // Seen position → page coordinates (same as pdfPages.js).
    const at = rot === 90 ? { x: w - Y, y: X } : rot === 180 ? { x: w - X, y: h - Y } : rot === 270 ? { x: Y, y: h - X } : { x: X, y: Y };
    p.drawText(text, { ...at, size: 9, font, color: rgb(0.25, 0.25, 0.25), rotate: degrees(rot) });
  });
  return toUint8(await doc.save());
}
