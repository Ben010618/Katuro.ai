/**
 * attendance.js — attendance taken by tap on the KaTuro App, kept by KaTuroDesk in
 *   Records/Attendance/<class>.xlsx      e.g. Records/Attendance/Grade 7 - Rizal - Science.xlsx
 *
 * One KaTuro-made workbook per class (the class record itself is never restructured):
 *   row 4 on: No. | LRN | Learner | Absences | Lates | one column per school day ("2026-11-16")
 *   marks: P present, A absent, L late, E excused
 * Absences and Lates are live COUNTIF formulas, so the teacher's own edits in Excel count too.
 * The learners come from the ready class record (LRN is the key; new learners are added).
 */
import { indexToCol } from '../docmap/addr.js';
import { interop, toUint8 as toU8 } from '../generators/shared.js';

const SHEET = 'Attendance';
const HEADER_ROW = 3;
const FIRST_ROW = 4;
const FIRST_DAY_COL = 6; // F
export const MARKS = ['P', 'A', 'L', 'E'];
const ATTENDANCE_DIR = 'Records/Attendance';
const ISO = /^\d{4}-\d{2}-\d{2}$/;

async function excel() {
  return interop(await import('exceljs'));
}

const colLetter = (n) => indexToCol(n - 1); // 1-based column number → "F"

/**
 * The attendance file of a class record, mirroring its folder under Records/Attendance, so two
 * classes never share one file:
 *   "Records/Grade 7 - Rizal - Science.xlsx"            → "Records/Attendance/Grade 7 - Rizal - Science.xlsx"
 *   "Records/SY 2025-2026/Grade 7 - Rizal - Science.xlsx" → "Records/Attendance/SY 2025-2026/Grade 7 - Rizal - Science.xlsx"
 *   "Records/Grade 7 - Rizal - Science.xlsm"            → "Records/Attendance/Grade 7 - Rizal - Science (xlsm).xlsx"
 */
export function attendancePathFor(recordPath) {
  const inside = String(recordPath).replace(/\\/g, '/').replace(/^records\//i, '');
  return `${ATTENDANCE_DIR}/${inside.replace(/\.xlsm$/i, ' (xlsm).xlsx')}`;
}

/** True for files in Records/Attendance (they are not class records). */
export const isAttendanceFile = (path) => /^records\/attendance\//i.test(String(path || ''));

const cellText = (v) => {
  if (v === null || v === undefined) return '';
  if (typeof v === 'object' && 'result' in v) return String(v.result ?? '');
  if (typeof v === 'object' && v.richText) return v.richText.map((t) => t.text).join('');
  return String(v);
};

/** A new attendance workbook for these learners ([{ lrn, name }]). → Uint8Array */
export async function newAttendanceWorkbook({ title = '', learners = [] } = {}) {
  const ExcelJS = await excel();
  const wb = new ExcelJS.Workbook();
  wb.creator = 'KaTuroDesk';
  const ws = wb.addWorksheet(SHEET, { views: [{ state: 'frozen', xSplit: 5, ySplit: HEADER_ROW }] });
  ws.getCell('A1').value = `Attendance — ${title}`.trim();
  ws.getCell('A1').font = { bold: true, size: 13 };
  ws.getCell('A2').value = 'P present · A absent · L late · E excused. Taken with the KaTuro App; you can also type marks here.';
  ws.getCell('A2').font = { italic: true, size: 9, color: { argb: 'FF555555' } };
  ['No.', 'LRN', 'Learner', 'Absences', 'Lates'].forEach((h, i) => {
    const c = ws.getRow(HEADER_ROW).getCell(i + 1);
    c.value = h;
    c.font = { bold: true };
  });
  ws.getColumn(1).width = 5;
  ws.getColumn(2).width = 15;
  ws.getColumn(3).width = 32;
  ws.getColumn(4).width = 10;
  ws.getColumn(5).width = 8;
  learners.forEach((l, i) => writeLearnerRow(ws, FIRST_ROW + i, i + 1, l));
  return toU8(await wb.xlsx.writeBuffer());
}

function writeLearnerRow(ws, r, n, l) {
  const row = ws.getRow(r);
  row.getCell(1).value = n;
  row.getCell(2).value = String(l.lrn);
  row.getCell(2).numFmt = '@';
  row.getCell(3).value = l.name;
  const range = `${colLetter(FIRST_DAY_COL)}${r}:${colLetter(FIRST_DAY_COL + 400)}${r}`;
  row.getCell(4).value = { formula: `COUNTIF(${range},"A")`, result: 0 };
  row.getCell(5).value = { formula: `COUNTIF(${range},"L")`, result: 0 };
}

function layout(ws) {
  const rows = new Map(); // lrn → row number
  let last = HEADER_ROW;
  for (let r = FIRST_ROW; r <= ws.rowCount; r++) {
    const lrn = cellText(ws.getRow(r).getCell(2).value).replace(/\s/g, '');
    if (lrn) { rows.set(lrn, r); last = r; }
  }
  const days = new Map(); // 'YYYY-MM-DD' → column number
  const header = ws.getRow(HEADER_ROW);
  let lastCol = FIRST_DAY_COL - 1;
  for (let c = FIRST_DAY_COL; c <= Math.max(header.cellCount, FIRST_DAY_COL); c++) {
    const v = header.getCell(c).value;
    const d = v instanceof Date ? v.toISOString().slice(0, 10) : cellText(v).slice(0, 10);
    if (ISO.test(d)) { days.set(d, c); lastCol = c; }
  }
  return { rows, last, days, lastCol };
}

/** Marks of one day. → { [lrn]: 'P'|'A'|'L'|'E' } (only the marks in the file) */
export async function readAttendance(bytes, date) {
  const ExcelJS = await excel();
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(bytes);
  const ws = wb.getWorksheet(SHEET);
  if (!ws) return {};
  const { rows, days } = layout(ws);
  const col = days.get(date);
  if (!col) return {};
  const out = {};
  for (const [lrn, r] of rows) {
    const m = cellText(ws.getRow(r).getCell(col).value).trim().toUpperCase();
    if (MARKS.includes(m)) out[lrn] = m;
  }
  return out;
}

/**
 * Writes one day's marks (adds the day column and any learner not yet in the file).
 *   marks: { [lrn]: 'P'|'A'|'L'|'E' }   learners: [{ lrn, name }] from the class record
 * → { bytes, absentStreaks: [{ lrn, name, days }] } — learners absent 3+ school days in a row up to `date`
 */
export async function writeAttendance(bytes, { date, marks = {}, learners = [] }) {
  if (!ISO.test(String(date || ''))) throw new Error('Choose the date.');
  const ExcelJS = await excel();
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(bytes);
  const ws = wb.getWorksheet(SHEET);
  if (!ws) throw new Error('This attendance file has no Attendance sheet.');
  const { rows, days, last, lastCol } = layout(ws);
  // The teacher may have typed in the sheet (a Remarks column, a footer row): a new learner goes
  // into the first fully empty row after the learners, a new day into the first empty column
  // after the days. Nothing the teacher wrote is ever overwritten.
  const blankRow = (r) => !ws.getRow(r).values.some((v) => cellText(v).trim());
  let free = last + 1;
  for (const l of learners) {
    if (rows.has(l.lrn)) continue;
    while (!blankRow(free)) free += 1;
    writeLearnerRow(ws, free, rows.size + 1, l);
    rows.set(l.lrn, free);
    free += 1;
  }
  const blankColumn = (c) => !cellText(ws.getRow(HEADER_ROW).getCell(c).value).trim()
    && [...rows.values()].every((r) => !cellText(ws.getRow(r).getCell(c).value).trim());
  let col = days.get(date);
  if (!col) {
    col = lastCol + 1;
    while (!blankColumn(col)) col += 1;
    const h = ws.getRow(HEADER_ROW).getCell(col);
    h.value = date;
    h.font = { bold: true };
    h.alignment = { textRotation: 90 };
    ws.getColumn(col).width = 4;
    days.set(date, col);
  }
  for (const [lrn, mark] of Object.entries(marks)) {
    const r = rows.get(lrn);
    const m = String(mark || '').toUpperCase();
    if (!r || !MARKS.includes(m)) continue;
    const c = ws.getRow(r).getCell(col);
    c.value = m;
    c.alignment = { horizontal: 'center' };
    c.font = m === 'A' ? { bold: true, color: { argb: 'FFB42318' } } : m === 'L' ? { color: { argb: 'FFB54708' } } : {};
  }
  // Consecutive absences (DepEd SARDO early warning: 3 or more school days in a row).
  const ordered = [...days.entries()].filter(([d]) => d <= date).sort(([a], [b]) => a.localeCompare(b)).map(([, c]) => c);
  const names = new Map(learners.map((l) => [l.lrn, l.name]));
  const absentStreaks = [];
  for (const [lrn, r] of rows) {
    let n = 0;
    for (let i = ordered.length - 1; i >= 0; i--) {
      if (cellText(ws.getRow(r).getCell(ordered[i]).value).trim().toUpperCase() === 'A') n += 1;
      else break;
    }
    if (n >= 3) absentStreaks.push({ lrn, name: names.get(lrn) || cellText(ws.getRow(r).getCell(3).value), days: n });
  }
  return { bytes: toU8(await wb.xlsx.writeBuffer()), absentStreaks };
}
