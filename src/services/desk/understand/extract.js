/**
 * extract.js — reads data out of a document using its recognized layout.
 * Pure code: every value comes from the file at the layout's addresses.
 *
 * Canonical data:
 * {
 *   docType, title,
 *   fields: { [key]: { label, value, location } },
 *   tables: [{ id, purpose, columns, learners: [{ name, row, sex?, lrn?, values: { [colKey]: value }, cells: { [colKey]: location } }] }]
 * }
 * cell locations: xlsx { sheet, cell } | docx { id: 't0.r5.c3' }
 */

import { isDividerText } from './recognize.js';

const colLetters = (col) => String(col).replace(/[^A-Z]/g, '');

function xlsxCellValue(sheet, addr) {
  const c = sheet?.cells?.[addr];
  if (!c) return null;
  if (c.text !== undefined && c.text !== null && typeof c.v === 'number' && /^\d{4}-\d{2}-\d{2}$/.test(String(c.text))) return c.text;
  return c.v ?? c.text ?? null;
}

function docxCell(map, tableId, r, c) {
  const table = (map.blocks || []).find((b) => b.id === tableId);
  return table?.rows?.[r]?.[c] || null;
}

function findDocxById(map, id) {
  for (const b of map.blocks || []) {
    if (b.id === id) return b.text ?? '';
    if (b.type === 'table') {
      for (const row of b.rows || []) {
        for (const cell of row) {
          if (cell.id === id) return cell.text;
          for (const p of cell.paragraphs || []) if (p.id === id) return p.text;
        }
      }
    }
  }
  return null;
}

/** "School Name: Rizal NHS" → "Rizal NHS" when the label and value share a cell. */
function stripLabel(value, label) {
  const s = String(value ?? '').trim();
  const m = s.match(/^[^:]{2,40}:\s*(.+)$/);
  if (m && (!label || s.toLowerCase().startsWith(String(label).toLowerCase().slice(0, 4)))) return m[1].trim();
  return s;
}

function cleanName(v) {
  return String(v ?? '').replace(/\s+/g, ' ').replace(/^\d+[.)]\s*/, '').trim();
}

function normalizeSex(v) {
  const s = String(v ?? '').trim().toLowerCase();
  if (/^(m|male|lalaki|boy)$/.test(s)) return 'M';
  if (/^(f|female|babae|girl)$/.test(s)) return 'F';
  return undefined;
}

/**
 * Data rows: from firstRow, through lastRow, and beyond it while names continue
 * (a remembered template applied to a bigger section). Dividers set the sex.
 */
function* xlsxRows(sheet, t) {
  const nameCol = colLetters(t.nameColumn);
  const maxRow = Math.max(t.location.lastRow, sheet.maxRow || t.location.lastRow);
  let blanks = 0;
  let sex;
  for (let r = t.location.firstRow; r <= maxRow; r++) {
    const raw = xlsxCellValue(sheet, `${nameCol}${r}`);
    const text = cleanName(raw);
    // A divider may sit in another column of the row (e.g. "MALE" in column A).
    const rowTexts = [text, ...['A', 'B', 'C'].map((c) => String(xlsxCellValue(sheet, `${c}${r}`) ?? ''))];
    const divider = rowTexts.find((x) => isDividerText(x));
    if (divider) {
      if (/^(male|boys?|lalaki)/i.test(divider.trim())) sex = 'M';
      else if (/^(female|girls?|babae)/i.test(divider.trim())) sex = 'F';
      else if (r > t.location.lastRow) break; // totals / signatures after the list
      continue;
    }
    if (!text || typeof raw === 'number') {
      blanks += 1;
      if (r > t.location.lastRow && blanks >= 2) break;
      continue;
    }
    blanks = 0;
    yield { row: r, name: text, sex };
  }
}

export function extractData(map, layout) {
  const out = { docType: layout.docType, title: layout.title, fields: {}, tables: [] };
  const isX = map.kind === 'xlsx';

  for (const f of layout.fields || []) {
    let value;
    if (isX) {
      const sheet = map.sheets.find((s) => s.name === f.location.sheet);
      value = xlsxCellValue(sheet, f.location.cell);
    } else {
      value = findDocxById(map, f.location.id);
    }
    out.fields[f.key] = { label: f.label, value: stripLabel(value, f.label), location: f.location };
  }

  for (const t of layout.tables || []) {
    const learners = [];
    if (isX) {
      const sheet = map.sheets.find((s) => s.name === t.location.sheet);
      if (!sheet) continue;
      for (const { row, name, sex } of xlsxRows(sheet, t)) {
        const values = {};
        const cells = {};
        let lrn;
        let rowSex = sex;
        for (const c of t.columns) {
          const addr = `${colLetters(c.column)}${row}`;
          const v = xlsxCellValue(sheet, addr);
          cells[c.key] = { sheet: sheet.name, cell: addr };
          if (c.meaning === 'learner_name') continue;
          if (c.meaning === 'lrn') lrn = v === null ? undefined : String(v);
          if (c.meaning === 'sex') rowSex = normalizeSex(v) || rowSex;
          values[c.key] = v;
        }
        learners.push({ name, row, ...(rowSex ? { sex: rowSex } : {}), ...(lrn ? { lrn } : {}), values, cells });
      }
    } else {
      const table = (map.blocks || []).find((b) => b.id === t.location.table);
      if (!table) continue;
      let sex;
      for (let r = t.location.firstRow; r < table.rows.length; r++) {
        const nameCell = docxCell(map, table.id, r, Number(t.nameColumn));
        const text = cleanName(nameCell?.text);
        const divider = isDividerText(text) ? text : null;
        if (divider) {
          if (/^(male|boys?|lalaki)/i.test(divider)) sex = 'M';
          else if (/^(female|girls?|babae)/i.test(divider)) sex = 'F';
          else if (r > t.location.lastRow) break;
          continue;
        }
        if (!text || /^\d+$/.test(text)) {
          if (r > t.location.lastRow) break;
          continue;
        }
        const values = {};
        const cells = {};
        let lrn;
        let rowSex = sex;
        for (const c of t.columns) {
          const cell = docxCell(map, table.id, r, Number(c.column));
          cells[c.key] = { id: cell?.id || `${table.id}.r${r}.c${c.column}` };
          if (c.meaning === 'learner_name') continue;
          const v = cell ? cell.text.trim() : null;
          const num = v !== null && v !== '' && !Number.isNaN(Number(v)) ? Number(v) : v;
          if (c.meaning === 'lrn') lrn = v || undefined;
          if (c.meaning === 'sex') rowSex = normalizeSex(v) || rowSex;
          values[c.key] = num === '' ? null : num;
        }
        learners.push({ name: text, row: r, ...(rowSex ? { sex: rowSex } : {}), ...(lrn ? { lrn } : {}), values, cells });
      }
    }
    out.tables.push({ id: t.id, purpose: t.purpose, columns: t.columns, marks: t.marks, learners });
  }
  return out;
}

/** Attendance helper: which day columns are absences for a learner, per the table's marks. */
export function attendanceDays(table, learner) {
  const absent = new Set((table.marks?.absent?.length ? table.marks.absent : ['x', 'a', 'absent']).map((m) => m.toLowerCase()));
  const tardy = new Set((table.marks?.tardy || []).map((m) => m.toLowerCase()));
  return table.columns
    .filter((c) => c.meaning === 'day' || c.meaning === 'date')
    .map((c) => {
      const raw = String(learner.values[c.key] ?? '').trim().toLowerCase();
      return { key: c.key, day: c.day, date: c.date, mark: raw, status: absent.has(raw) ? 'A' : tardy.has(raw) ? 'T' : raw ? 'P' : '' };
    });
}
