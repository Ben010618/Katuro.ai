/**
 * pptxFromSpec.js — renders a SlidesSpec into a clean 16:9 .pptx (Uint8Array).
 */

import { normalizeSlidesSpec } from '../docSpec.js';
import { toUint8, interop } from './shared.js';

const GREEN = '1F3A2E';
const GREEN2 = '2D6A4F';
const INK = '1F2937';
const MAX_BULLETS = 7;
const FOOTER = 'DepEd · KaTuroDesk';

const chunk = (arr, n) => {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out.length ? out : [[]];
};

const bulletFont = (items) => {
  const chars = items.reduce((a, b) => a + b.length, 0);
  if (chars > 700) return 14;
  if (chars > 450) return 16;
  if (chars > 280) return 18;
  return 20;
};

export async function buildPptx(rawSpec) {
  const spec = normalizeSlidesSpec(rawSpec);
  const PptxGenJS = interop(await import('pptxgenjs'));
  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_16x9'; // 10 x 5.625 in
  pptx.author = 'KaTuroDesk';
  pptx.title = spec.title;

  const addTitleSlide = (title, subtitle, notes) => {
    const s = pptx.addSlide();
    s.background = { color: GREEN };
    s.addShape(pptx.ShapeType.rect, { x: 0.6, y: 2.55, w: 1.2, h: 0.06, fill: { color: 'A7C957' }, line: { color: 'A7C957' } });
    s.addText(title, { x: 0.6, y: 1.0, w: 8.8, h: 1.5, fontFace: 'Calibri', fontSize: 36, bold: true, color: 'FFFFFF', valign: 'bottom', fit: 'shrink' });
    if (subtitle) s.addText(subtitle, { x: 0.6, y: 2.75, w: 8.8, h: 1.0, fontFace: 'Calibri', fontSize: 18, color: 'E5F0E8', valign: 'top', fit: 'shrink' });
    s.addText(FOOTER, { x: 0.6, y: 5.0, w: 8.8, h: 0.35, fontFace: 'Calibri', fontSize: 10, color: 'B7CFC0' });
    if (notes) s.addNotes(notes);
  };

  const titleBar = (s, title) => {
    s.background = { color: 'FFFFFF' };
    s.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 10, h: 0.95, fill: { color: GREEN }, line: { color: GREEN } });
    s.addText(title, { x: 0.45, y: 0.1, w: 9.1, h: 0.75, fontFace: 'Calibri', fontSize: 26, bold: true, color: 'FFFFFF', valign: 'middle', fit: 'shrink' });
    s.addShape(pptx.ShapeType.rect, { x: 0, y: 5.5, w: 10, h: 0.125, fill: { color: GREEN2 }, line: { color: GREEN2 } });
  };

  const bulletText = (items, fontSize) => items.map((t) => ({
    text: t,
    options: { bullet: { indent: 18 }, fontSize, color: INK, fontFace: 'Calibri', paraSpaceAfter: 6, breakLine: true },
  }));

  addTitleSlide(spec.title, spec.subtitle);

  for (const sl of spec.slides) {
    if (sl.layout === 'title') {
      addTitleSlide(sl.title || spec.title, sl.bullets.join(' · ') || '', sl.notes);
      continue;
    }
    if (sl.layout === 'twoColumn') {
      const s = pptx.addSlide();
      titleBar(s, sl.title);
      const left = sl.left || sl.bullets.slice(0, Math.ceil(sl.bullets.length / 2));
      const right = sl.right || sl.bullets.slice(Math.ceil(sl.bullets.length / 2));
      const fs = Math.min(bulletFont(left), bulletFont(right), 18);
      if (left.length) s.addText(bulletText(left, fs), { x: 0.4, y: 1.15, w: 4.45, h: 4.15, valign: 'top', fit: 'shrink' });
      s.addShape(pptx.ShapeType.line, { x: 5.0, y: 1.25, w: 0, h: 3.9, line: { color: 'C8D5CC', width: 1 } });
      if (right.length) s.addText(bulletText(right, fs), { x: 5.15, y: 1.15, w: 4.45, h: 4.15, valign: 'top', fit: 'shrink' });
      if (sl.notes) s.addNotes(sl.notes);
      continue;
    }
    const parts = chunk(sl.bullets, MAX_BULLETS);
    parts.forEach((items, i) => {
      const s = pptx.addSlide();
      titleBar(s, i === 0 ? sl.title : `${sl.title} (cont.)`);
      if (items.length) s.addText(bulletText(items, bulletFont(items)), { x: 0.5, y: 1.15, w: 9.0, h: 4.15, valign: 'top', fit: 'shrink' });
      if (sl.notes && i === 0) s.addNotes(sl.notes);
    });
  }

  return toUint8(await pptx.write({ outputType: 'uint8array' }));
}
