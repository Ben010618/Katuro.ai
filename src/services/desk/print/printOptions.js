/**
 * printOptions.js — the choices in KaTuroDesk's Print panel, checked before printing. Pure code.
 */
import { normalizeDocumentSpec, PAPER_SIZES } from '../docSpec.js';

/**
 * "1-3, 5, 8-" → [{ from, to }] zero-based (as the printer wants), or { error }.
 * Empty means all pages. Page numbers past `pageCount` (when known) are refused.
 */
export function parsePageRanges(text, pageCount = Infinity) {
  const t = String(text ?? '').trim();
  if (!t) return { ranges: [] };
  const ranges = [];
  for (const part of t.split(/[,;]+/).map((x) => x.trim()).filter(Boolean)) {
    const m = part.match(/^(\d{1,4})\s*(?:-\s*(\d{1,4})?)?$/);
    if (!m) return { error: `"${part}" is not a page or a range like 2-5.` };
    const from = Number(m[1]);
    const to = m[2] ? Number(m[2]) : part.includes('-') ? pageCount : from;
    if (from < 1 || !Number.isFinite(to) || to < from) return { error: `"${part}" is not a page range you can print.` };
    if (Number.isFinite(pageCount) && from > pageCount) return { error: `The document has ${pageCount} page${pageCount === 1 ? '' : 's'}.` };
    ranges.push({ from: from - 1, to: Math.min(to, Number.isFinite(pageCount) ? pageCount : to) - 1 });
  }
  return { ranges };
}

/** The document laid out for the paper and orientation chosen in the Print panel. */
export function specForPrint(spec, { paper, orientation }) {
  const base = normalizeDocumentSpec(spec);
  return normalizeDocumentSpec({ ...base, paper: PAPER_SIZES[paper] ? paper : base.paper, orientation: orientation === 'landscape' ? 'landscape' : orientation === 'portrait' ? 'portrait' : base.orientation });
}

/** Paper size for the printer, portrait (the printer turns it for landscape). */
export function portraitPaperInches(paper) {
  const p = PAPER_SIZES[paper] || PAPER_SIZES.long;
  return { width: p.widthIn, height: p.heightIn };
}

/** The printer to start with: the Windows default if it works, else the first working real printer. */
export function pickPrinter(printers = []) {
  const ok = (p) => !p.problem;
  return (printers.find((p) => p.isDefault && ok(p))
    || printers.find((p) => ok(p) && !p.savesFile)
    || printers.find((p) => p.isDefault)
    || printers[0] || null)?.name || '';
}
