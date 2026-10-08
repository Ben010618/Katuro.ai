/**
 * pdfForm.js — fill a PDF form, by code:
 *   fillable PDFs: the form fields themselves (text, check boxes, choices);
 *   flat PDFs with text: the blanks ("Name: ______", "Date:" at a line end) are found from
 *   the page text and the value is written on the line;
 *   scanned PDFs: the blank boxes come from reading the page image (the caller's AI) and the
 *   value is written in each box.
 * Labels are matched with the same rules as Word forms (wordForm.js).
 */
import { toUint8 } from './shared.js';
import { isLabel, cleanLabel } from './wordForm.js';

const lib = () => import('pdf-lib');

/** Text items of each page, grouped into lines (pdfjs). → [[{ str, x, y, w, h }]] per page */
async function pageLines(pdfjsDoc) {
  const pages = [];
  for (let p = 1; p <= pdfjsDoc.numPages; p += 1) {
    const page = await pdfjsDoc.getPage(p);
    const view = page.getViewport({ scale: 1 });
    const items = (await page.getTextContent()).items.filter((it) => typeof it.str === 'string' && it.str.trim())
      .map((it) => ({ str: it.str, x: it.transform[4], y: it.transform[5], w: it.width, h: Math.abs(it.transform[3]) || it.height || 10 }));
    const lines = [];
    for (const it of items.sort((a, b) => b.y - a.y || a.x - b.x)) {
      const line = lines.find((l) => Math.abs(l.y - it.y) < Math.max(2, it.h * 0.4));
      if (line) line.items.push(it); else lines.push({ y: it.y, items: [it] });
    }
    lines.forEach((l) => l.items.sort((a, b) => a.x - b.x));
    pages.push({ width: view.width, height: view.height, lines });
  }
  return pages;
}

/** Blanks on a flat PDF page from its text: underscore runs, or a "Label:" ending the line. */
function flatBlanks(page, pageIndex) {
  const found = [];
  for (const line of page.lines) {
    let label = '';
    line.items.forEach((it, k) => {
      const perChar = it.w / Math.max(1, it.str.length);
      let last = 0;
      for (const m of it.str.matchAll(/_{3,}|\.{6,}/g)) {
        label = cleanLabel(`${label} ${it.str.slice(last, m.index)}`.split(/[.;]\s/).pop());
        if (isLabel(label)) found.push({ label, page: pageIndex, rect: { x: it.x + m.index * perChar, y: it.y, w: m[0].length * perChar, h: it.h } });
        label = '';
        last = m.index + m[0].length;
      }
      label = `${label} ${it.str.slice(last)}`.trim();
      // "Label:" with nothing after it on the line: the blank runs to the next item or the margin.
      const lm = it.str.slice(last).match(/^\s*([^:]{2,60}):\s*$/);
      if (lm && isLabel(lm[1])) {
        const next = line.items[k + 1];
        const x = it.x + it.w + 4;
        const right = next ? next.x - 6 : page.width - 36;
        if (right - x > 40) found.push({ label: cleanLabel(lm[1]), page: pageIndex, rect: { x, y: it.y, w: right - x, h: it.h } });
        label = '';
      }
    });
  }
  return found;
}

/**
 * What can be filled in this PDF.
 * → { kind: 'fillable'|'flat'|'scanned', fields: [{ id, label, type, options?, page, rect? }] }
 */
export async function scanPdfForm(bytes, pdfjsDoc) {
  const { PDFDocument, PDFName, PDFTextField, PDFCheckBox, PDFDropdown, PDFRadioGroup, PDFOptionList } = await lib();
  const doc = await PDFDocument.load(toUint8(bytes), { ignoreEncryption: true });
  const pages = await pageLines(pdfjsDoc);
  const pageRefs = doc.getPages().map((p) => p.ref);
  const formFields = doc.getForm().getFields();
  const fields = [];
  const seen = new Map();
  const unique = (label) => { const k = label.toLowerCase(); const n = (seen.get(k) || 0) + 1; seen.set(k, n); return n > 1 ? `${label} (${n})` : label; };
  if (formFields.length) {
    for (const f of formFields) {
      const type = f instanceof PDFTextField ? 'text' : f instanceof PDFCheckBox ? 'check' : f instanceof PDFDropdown || f instanceof PDFOptionList ? 'choice' : f instanceof PDFRadioGroup ? 'radio' : null;
      if (!type || f.isReadOnly()) continue;
      const widget = f.acroField.getWidgets()[0];
      const rect = widget?.getRectangle();
      // Its page: the widget's /P, else the page whose annotations list it.
      let pIdx = pageRefs.findIndex((r) => widget?.P() && r === widget.P());
      if (pIdx < 0) pIdx = doc.getPages().findIndex((p) => (p.node.Annots()?.asArray() || []).some((a) => doc.context.lookup(a) === widget?.dict));
      pIdx = Math.max(0, pIdx);
      // The label: the field's tooltip, else the text just left of (or above) the box, else its name.
      const tip = f.acroField.dict.get(PDFName.of('TU'));
      let label = tip ? cleanLabel(tip.decodeText ? tip.decodeText() : String(tip)) : '';
      if (!label && rect && pages[pIdx]) {
        const near = pages[pIdx].lines.filter((l) => l.y >= rect.y - 4 && l.y <= rect.y + rect.height + 4)
          .flatMap((l) => l.items).filter((it) => it.x + it.w <= rect.x + 6).sort((a, b) => b.x - a.x)[0];
        const above = pages[pIdx].lines.filter((l) => l.y > rect.y + rect.height && l.y < rect.y + rect.height + 18)
          .flatMap((l) => l.items).filter((it) => it.x < rect.x + rect.width && it.x + it.w > rect.x)[0];
        label = cleanLabel((near || above)?.str || '');
      }
      if (!isLabel(label)) label = cleanLabel(f.getName().replace(/[_.]+/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2'));
      const options = type === 'choice' || type === 'radio' ? f.getOptions() : undefined;
      fields.push({ id: `f${fields.length + 1}`, label: unique(label || `Field ${fields.length + 1}`), type, options, name: f.getName(), page: pIdx });
    }
    return { kind: 'fillable', fields };
  }
  const hasText = pages.some((p) => p.lines.length > 2);
  if (!hasText) return { kind: 'scanned', fields: [] };
  pages.forEach((p, i) => flatBlanks(p, i).forEach((b) => fields.push({ id: `f${fields.length + 1}`, label: unique(b.label), type: 'text', page: b.page, rect: b.rect })));
  return { kind: 'flat', fields };
}

/** Scanned-form boxes from the AI (0–1000 page coordinates, top-left origin) → fields in PDF points. */
export function fieldsFromBoxes(boxes, pageSizes) {
  const fields = [];
  const seen = new Map();
  for (const b of Array.isArray(boxes) ? boxes : []) {
    const label = cleanLabel(b?.label);
    const page = Math.max(0, Math.min(pageSizes.length - 1, (Number(b?.page) || 1) - 1));
    const box = Array.isArray(b?.box) ? b.box.map(Number) : [];
    if (!isLabel(label) || box.length !== 4 || box.some((v) => !(v >= 0 && v <= 1000))) continue;
    const [ymin, xmin, ymax, xmax] = box;
    if (ymax <= ymin || xmax <= xmin) continue;
    const { width, height } = pageSizes[page];
    const k = label.toLowerCase();
    const n = (seen.get(k) || 0) + 1;
    seen.set(k, n);
    fields.push({ id: `f${fields.length + 1}`, label: n > 1 ? `${label} (${n})` : label, type: 'text', page, rect: { x: (xmin / 1000) * width, y: height - (ymax / 1000) * height, w: ((xmax - xmin) / 1000) * width, h: ((ymax - ymin) / 1000) * height } });
  }
  return fields;
}

const yes = (v) => /^(yes|oo|true|x|✓|check(ed)?|1|on)$/i.test(String(v).trim());

/**
 * The filled PDF. values: { [field id]: text }.
 * → { bytes, skipped: [{ label, why }] }
 */
export async function fillPdfForm(bytes, scan, values) {
  const { PDFDocument, StandardFonts, rgb } = await lib();
  const doc = await PDFDocument.load(toUint8(bytes), { ignoreEncryption: true });
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const skipped = [];
  const fits = (text) => { try { font.encodeText(text); return true; } catch { return false; } };
  if (scan.kind === 'fillable') {
    const form = doc.getForm();
    for (const f of scan.fields) {
      const v = values[f.id];
      if (v === undefined || v === null || String(v).trim() === '') continue;
      const field = form.getField(f.name);
      try {
        if (f.type === 'text') {
          if (!fits(String(v))) { skipped.push({ label: f.label, why: 'has letters this PDF cannot show' }); continue; }
          field.setText(String(v));
        } else if (f.type === 'check') {
          if (yes(v)) field.check(); else field.uncheck();
        } else {
          const opt = (f.options || []).find((o) => o.toLowerCase() === String(v).trim().toLowerCase());
          if (!opt) { skipped.push({ label: f.label, why: `"${v}" is not one of its choices (${(f.options || []).join(', ')})` }); continue; }
          field.select(opt);
        }
      } catch (err) {
        skipped.push({ label: f.label, why: err?.message || 'could not be filled' });
      }
    }
    form.updateFieldAppearances(font);
  } else {
    const pages = doc.getPages();
    for (const f of scan.fields) {
      const v = values[f.id];
      if (v === undefined || v === null || String(v).trim() === '') continue;
      const text = String(v);
      if (!fits(text)) { skipped.push({ label: f.label, why: 'has letters this PDF cannot show' }); continue; }
      let size = Math.max(6, Math.min(11, f.rect.h * (scan.kind === 'scanned' ? 0.6 : 0.95)));
      while (size > 6 && font.widthOfTextAtSize(text, size) > f.rect.w - 4) size -= 0.5;
      const y = scan.kind === 'scanned' ? f.rect.y + (f.rect.h - size) / 2 + size * 0.2 : f.rect.y + 1.5;
      pages[f.page].drawText(text, { x: f.rect.x + 2, y, size, font, color: rgb(0.05, 0.1, 0.45) });
    }
  }
  return { bytes: toUint8(await doc.save()), skipped };
}
