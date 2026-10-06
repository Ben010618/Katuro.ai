/**
 * consolidate.js — combines many classroom files into ONE Excel workbook.
 *
 * Data is copied by code, never retyped by the AI: spreadsheet sheets and Word tables go
 * in exactly as they are in the files. Only photos/scans need the AI (one small request
 * each). An "Index" sheet lists every file, what was taken from it, and anything that
 * could not be read — nothing is dropped silently.
 */

const INVALID_SHEET_CHARS = /[\\/?*[\]:]/g;

/** Excel tab names: max 31 characters, no \ / ? * [ ] :, and unique (case-insensitive). */
export function uniqueSheetName(base, used) {
  const clean = String(base || 'Sheet').replace(INVALID_SHEET_CHARS, ' ').replace(/\s+/g, ' ').trim() || 'Sheet';
  let name = clean.slice(0, 31);
  for (let n = 2; used.has(name.toLowerCase()); n++) {
    const suffix = ` (${n})`;
    name = clean.slice(0, 31 - suffix.length) + suffix;
  }
  used.add(name.toLowerCase());
  return name;
}

const isBlank = (v) => v === null || v === undefined || (typeof v === 'string' && !v.trim());

/** Drops empty rows and trailing empty cells (template workbooks have many). */
export function cleanRows(rows) {
  const out = [];
  for (const row of rows || []) {
    const r = Array.isArray(row) ? [...row] : [row];
    while (r.length && isBlank(r[r.length - 1])) r.pop();
    if (r.length) out.push(r.map((v) => (isBlank(v) ? null : v)));
  }
  return out;
}

/** Text read from a photo: numbers become numbers ("18" -> 18); everything else stays as written. */
function photoCell(v) {
  const s = String(v ?? '');
  return s.trim() !== '' && /^-?\d+(\.\d+)?$/.test(s.trim()) ? Number(s) : s || null;
}

const fileName = (p) => String(p).split('/').pop();
const stem = (p) => fileName(p).replace(/\.[^.]+$/, '');

/**
 * entries: one per source file, in order —
 *   { path, sheets: [{ name, rows }] }           spreadsheet / CSV
 *   { path, tables: [{ rows }] }                  Word tables
 *   { path, photo: { title, columns, rows, notes } }   read by AI from a photo/scan
 *   { path, skipped: 'reason' }                   nothing taken (and why)
 * Returns a sheet spec: Index first, then the data sheets in file order.
 */
export function buildConsolidatedSpec(entries, { title = 'Consolidated Files' } = {}) {
  const used = new Set(['index']);
  const index = [];
  const sheets = [];
  const multi = (n) => n > 1;

  for (const e of entries) {
    const file = fileName(e.path);
    if (e.skipped) {
      index.push([file, 'Not included', 0, '', e.skipped]);
      continue;
    }
    if (e.sheets) {
      const kept = e.sheets.map((s) => ({ name: s.name, rows: cleanRows(s.rows) })).filter((s) => s.rows.length);
      if (!kept.length) {
        index.push([file, 'Spreadsheet', 0, '', 'No data in this file.']);
        continue;
      }
      for (const s of kept) {
        const name = uniqueSheetName(multi(kept.length) ? `${stem(e.path)} - ${s.name}` : stem(e.path), used);
        sheets.push({ name, columns: [], rows: s.rows, freezeHeader: false });
        index.push([file, multi(kept.length) ? `Spreadsheet, sheet "${s.name}"` : 'Spreadsheet', s.rows.length, name, 'Copied exactly from the file.']);
      }
      continue;
    }
    if (e.tables) {
      const kept = e.tables.map((t) => cleanRows(t.rows)).filter((rows) => rows.length);
      if (!kept.length) {
        index.push([file, 'Word document', 0, '', 'No tables in this document (text only), so nothing to copy.']);
        continue;
      }
      kept.forEach((rows, i) => {
        const name = uniqueSheetName(multi(kept.length) ? `${stem(e.path)} - Table ${i + 1}` : stem(e.path), used);
        sheets.push({ name, columns: [], rows, freezeHeader: false });
        index.push([file, multi(kept.length) ? `Word table ${i + 1}` : 'Word table', rows.length, name, 'Copied exactly from the file.']);
      });
      continue;
    }
    if (e.photo) {
      const { columns = [], rows = [], notes = '' } = e.photo;
      const name = uniqueSheetName(stem(e.path), used);
      sheets.push({
        name,
        columns: columns.map((h) => ({ header: String(h ?? '') })),
        rows: rows.map((r) => (Array.isArray(r) ? r : [r]).map(photoCell)),
        freezeHeader: true,
      });
      index.push([file, 'Photo / scan (read by AI)', rows.length, name, `Read from a photo: please check against the original.${notes ? ` AI note: ${notes}` : ''}`]);
    }
  }

  return {
    kind: 'sheet',
    title,
    sheets: [
      {
        name: 'Index',
        columns: [{ header: 'File', width: 40 }, { header: 'What was taken', width: 26 }, { header: 'Rows', width: 8 }, { header: 'Sheet in this workbook', width: 32 }, { header: 'Note', width: 60 }],
        rows: index,
        freezeHeader: true,
      },
      ...sheets,
    ],
  };
}
