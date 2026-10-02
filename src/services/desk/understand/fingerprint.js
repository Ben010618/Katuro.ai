/**
 * fingerprint.js — recognizes "the same school template" across files.
 *
 * Two SF2s from the same school differ in learner names, dates and marks, but share
 * their LABELS ("Name of Learner", "School ID", "TOTAL FOR THE MONTH"...) at the same
 * places. We fingerprint a file by its label cells and compare with Jaccard similarity,
 * so next quarter's / another section's copy is recognized without an AI call.
 */

const PERSON_NAME = /^[A-ZÑ][A-Za-zñÑ.'\- ]+,\s*[A-Za-zñÑ][A-Za-zñÑ.'\- ]*$/;

export function normalizeLabel(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[0-9]+/g, '#')
    .replace(/[^a-z#]+/g, ' ')
    .trim();
}

/** A cell/paragraph worth fingerprinting: short text that is not data (not a number, not a learner name). */
export function isLabelText(text) {
  const t = String(text ?? '').trim();
  if (t.length < 2 || t.length > 60) return false;
  if (/^[-+]?[\d.,%/: ]+$/.test(t)) return false; // numbers, dates, percentages
  if (PERSON_NAME.test(t)) return false;
  if (/^(x|a|p|l|e|\/|✓|✗)$/i.test(t)) return false; // attendance marks
  return /[a-z]/i.test(t);
}

/** Label tokens of a map: "Sheet|COL|label" for xlsx (row-independent), "label" for docx. */
export function labelSet(map, { maxRowsPerSheet = 25 } = {}) {
  const labels = new Set();
  if (map?.kind === 'xlsx') {
    for (const sheet of map.sheets || []) {
      if (sheet.state === 'hidden') continue;
      for (const [addr, cell] of Object.entries(sheet.cells || {})) {
        const row = Number(addr.replace(/^[A-Z]+/, ''));
        if (row > maxRowsPerSheet) continue;
        const text = cell.text ?? cell.v;
        if (!isLabelText(text)) continue;
        labels.add(`${normalizeLabel(sheet.name)}|${addr.replace(/\d+$/, '')}|${normalizeLabel(text)}`);
      }
    }
  } else if (map?.kind === 'docx') {
    let n = 0;
    for (const b of map.blocks || []) {
      if (n > 120) break;
      if (b.type === 'paragraph' && isLabelText(b.text)) {
        labels.add(normalizeLabel(b.text));
        n += 1;
      } else if (b.type === 'table') {
        // Header rows carry the template's labels; data rows don't.
        for (const row of (b.rows || []).slice(0, 3)) {
          for (const cell of row) {
            if (isLabelText(cell.text)) labels.add(`${b.id}|${normalizeLabel(cell.text)}`);
          }
        }
        n += 1;
      }
    }
  }
  return labels;
}

export function similarity(a, b) {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter += 1;
  return inter / (a.size + b.size - inter);
}
