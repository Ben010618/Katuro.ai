/**
 * xlsxWriters.js — exceljs workbooks for KaTuroDesk: generic SheetSpec export,
 * item analysis, and the DO 8 s.2015 quarterly e-Class Record with live formulas.
 */

import { normalizeSheetSpec } from '../docSpec.js';
import { computeQuarterlyGrade, transmute, round2, WEIGHT_PRESETS } from '../depedGrading.js';
import { toUint8, interop } from './shared.js';

const GREEN = 'FF1F3A2E';
const GRAY = 'FFE7E6E6';
const LIGHT_RED = 'FFF8D7DA';
const thin = { style: 'thin', color: { argb: 'FF000000' } };
const BOX = { top: thin, left: thin, bottom: thin, right: thin };

async function newWorkbook() {
  const ExcelJS = interop(await import('exceljs'));
  const wb = new ExcelJS.Workbook();
  wb.creator = 'KaTuroDesk';
  wb.created = new Date();
  return wb;
}

const writeOut = async (wb) => toUint8(await wb.xlsx.writeBuffer());

const fill = (argb) => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });

function styleHeaderRow(row, { green = true } = {}) {
  row.eachCell({ includeEmpty: false }, (c) => {
    c.font = { bold: true, color: { argb: green ? 'FFFFFFFF' : 'FF000000' } };
    c.fill = fill(green ? GREEN : GRAY);
    c.border = BOX;
    c.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  });
}

const textLen = (v) => (v === null || v === undefined ? 0 : String(typeof v === 'object' && 'result' in v ? v.result : v).length);

function autoWidths(ws, colCount, given = []) {
  for (let c = 1; c <= colCount; c++) {
    if (given[c - 1]) {
      ws.getColumn(c).width = Math.min(80, given[c - 1]);
      continue;
    }
    let max = 6;
    ws.getColumn(c).eachCell({ includeEmpty: false }, (cell) => {
      max = Math.max(max, textLen(cell.value));
    });
    ws.getColumn(c).width = Math.min(50, max + 2);
  }
}

/** Generic SheetSpec → .xlsx */
export async function buildSheetWorkbook(rawSpec) {
  const spec = normalizeSheetSpec(rawSpec);
  const wb = await newWorkbook();
  wb.title = spec.title;
  const sheets = spec.sheets.length ? spec.sheets : [{ name: 'Sheet1', columns: [], rows: [], freezeHeader: true }];
  const used = new Set();
  for (const sh of sheets) {
    let name = sh.name;
    for (let i = 2; used.has(name.toLowerCase()); i++) name = `${sh.name.slice(0, 28)} ${i}`;
    used.add(name.toLowerCase());
    const ws = wb.addWorksheet(name);
    const colCount = Math.max(sh.columns.length, ...sh.rows.map((r) => r.length), 0);
    if (sh.columns.length) {
      const hr = ws.addRow(sh.columns.map((c) => c.header));
      styleHeaderRow(hr);
      hr.height = 20;
    }
    for (const r of sh.rows) {
      const row = ws.addRow(r.map((v) => (v === null ? null : v)));
      for (let c = 1; c <= colCount; c++) row.getCell(c).border = BOX;
    }
    autoWidths(ws, colCount, sh.columns.map((c) => c.width));
    if (sh.freezeHeader && sh.columns.length) ws.views = [{ state: 'frozen', xSplit: 0, ySplit: 1 }];
  }
  return writeOut(wb);
}

/** analyzeItems() result → .xlsx with Summary / Item Analysis / Learner Scores sheets. */
export async function buildItemAnalysisWorkbook(analysis, meta = {}) {
  const a = analysis || {};
  const wb = await newWorkbook();

  const sum = wb.addWorksheet('Summary');
  const title = sum.addRow([meta.title || 'Item Analysis Summary']);
  title.font = { bold: true, size: 14 };
  sum.addRow([]);
  const info = [
    ['School', meta.school], ['Learning Area', meta.subject], ['Grade & Section', meta.gradeSection],
    ['Quarter', meta.quarter], ['Test', meta.testTitle], ['Teacher', meta.teacher],
  ].filter(([, v]) => v !== undefined && v !== null && v !== '');
  const stats = [
    ['Examinees', a.examinees ?? 0], ['Number of Items', a.itemCount ?? 0], ['Mean', a.mean ?? 0],
    ['Standard Deviation', a.standardDeviation ?? 0], ['MPS (%)', a.mps ?? 0], ['Mastery Level', a.masteryLevel || ''],
    ['Highest Score', a.highest ?? 0], ['Lowest Score', a.lowest ?? 0], ['LMC Threshold (%)', a.lmcThreshold ?? 75],
  ];
  for (const [k, v] of [...info, ...stats]) {
    const r = sum.addRow([k, v]);
    r.getCell(1).font = { bold: true };
    r.getCell(1).fill = fill(GRAY);
    r.getCell(1).border = BOX;
    r.getCell(2).border = BOX;
  }
  sum.addRow([]);
  const lmcHead = sum.addRow(['Least Mastered Competencies', '% Correct', 'Item No.']);
  styleHeaderRow(lmcHead);
  const lmc = a.leastMastered || [];
  if (!lmc.length) sum.addRow(['None — all items met the threshold']);
  for (const it of lmc) {
    const r = sum.addRow([it.competency || `Item ${it.number}`, it.percentCorrect, it.number]);
    r.eachCell((c) => { c.border = BOX; });
  }
  sum.getColumn(1).width = 44;
  sum.getColumn(2).width = 28;
  sum.getColumn(3).width = 10;

  const ia = wb.addWorksheet('Item Analysis');
  const head = ia.addRow(['No.', 'Competency', 'Correct', 'Examinees', '% Correct', 'Difficulty (p)', 'Difficulty', 'Discrimination (D)', 'Discrimination Remark', 'Mastery', 'LMC?']);
  styleHeaderRow(head);
  for (const it of a.items || []) {
    const r = ia.addRow([
      it.number, it.competency || '', it.correct, it.examinees, it.percentCorrect, it.difficulty, it.difficultyLabel,
      it.discrimination ?? null, it.discriminationLabel, it.mastery, it.isLeastMastered ? 'Yes' : 'No',
    ]);
    r.eachCell({ includeEmpty: true }, (c, col) => {
      c.border = BOX;
      if (it.isLeastMastered) c.fill = fill(LIGHT_RED);
      if (col === 5 || col === 6 || col === 8) c.numFmt = '0.00';
    });
  }
  autoWidths(ia, 11);
  ia.getColumn(2).width = Math.min(50, Math.max(20, ia.getColumn(2).width));
  ia.views = [{ state: 'frozen', xSplit: 0, ySplit: 1 }];

  const ls = wb.addWorksheet('Learner Scores');
  styleHeaderRow(ls.addRow(['Name', 'Score', '%']));
  for (const l of a.learners || []) {
    const r = ls.addRow([l.name, l.score, l.percent]);
    r.eachCell((c) => { c.border = BOX; });
    r.getCell(3).numFmt = '0.00';
  }
  ls.getColumn(1).width = 36;
  ls.getColumn(2).width = 10;
  ls.getColumn(3).width = 10;
  ls.views = [{ state: 'frozen', xSplit: 0, ySplit: 1 }];

  return writeOut(wb);
}

/** DO 8 s.2015 transmutation table, ascending lower bounds, derived from depedGrading.transmute. */
export function transmutationTableAscending() {
  const out = [];
  let prev = null;
  for (let i = 0; i <= 10000; i++) {
    const v = i / 100;
    const g = transmute(v);
    if (g !== prev) {
      out.push([v, g]);
      prev = g;
    }
  }
  return out;
}

const colLetter = (n) => {
  let s = '';
  for (let x = n; x > 0; x = Math.floor((x - 1) / 26)) s = String.fromCharCode(65 + ((x - 1) % 26)) + s;
  return s;
};

const numOrNull = (v) => (v === null || v === undefined || v === '' || Number.isNaN(Number(v)) ? null : Number(v));

/**
 * Quarterly e-Class Record (DO 8 s.2015) with live formulas and cached results.
 * Returns Uint8Array.
 */
export async function buildClassRecordWorkbook({ meta = {}, weights = WEIGHT_PRESETS.scienceMath, hps = {}, learners = [] } = {}) {
  const w = { ww: Number(weights?.ww) || 0, pt: Number(weights?.pt) || 0, qa: Number(weights?.qa) || 0 };
  const H = {
    ww: (hps.ww?.length ? hps.ww : [null]).map(numOrNull),
    pt: (hps.pt?.length ? hps.pt : [null]).map(numOrNull),
    qa: (hps.qa?.length ? hps.qa : [null]).map(numOrNull),
  };
  const wb = await newWorkbook();
  wb.calcProperties = { fullCalcOnLoad: true };
  const ws = wb.addWorksheet('Class Record', {
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 14, horizontalCentered: true, margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 } },
  });

  // Column map
  const cols = {};
  let c = 3;
  for (const k of ['ww', 'pt', 'qa']) {
    cols[k] = { first: c, last: c + H[k].length - 1 };
    c += H[k].length;
    cols[k].total = c++;
    cols[k].ps = c++;
    cols[k].ws = c++;
  }
  const initialCol = c++;
  const qgCol = c;
  const lastCol = qgCol;
  const L = colLetter;
  const table = transmutationTableAscending();
  const tEnd = table.length + 1;

  // Header block
  const merge = (r, c1, c2, value, font = {}) => {
    if (c2 > c1) ws.mergeCells(r, c1, r, c2);
    const cell = ws.getCell(r, c1);
    cell.value = value;
    cell.font = font;
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    return cell;
  };
  merge(1, 1, lastCol, 'CLASS RECORD', { bold: true, size: 14 });
  merge(2, 1, lastCol, '(Pursuant to DepEd Order 8 series of 2015)', { italic: true, size: 9 });
  const metaPairs = [
    [['REGION', meta.region], ['DIVISION', meta.division], ['SCHOOL NAME', meta.school]],
    [['SCHOOL ID', meta.schoolId], ['SCHOOL YEAR', meta.schoolYear], ['QUARTER', meta.quarter]],
    [['GRADE & SECTION', meta.gradeSection], ['TEACHER', meta.teacher], ['SUBJECT', meta.subject]],
  ];
  const third = Math.max(2, Math.floor(lastCol / 3));
  metaPairs.forEach((pairs, i) => {
    const r = 3 + i;
    pairs.forEach(([label, value], j) => {
      const start = 1 + j * third;
      const end = j === 2 ? lastCol : start + third - 1;
      const cell = ws.getCell(r, start);
      if (end > start) ws.mergeCells(r, start, r, end);
      cell.value = { richText: [{ text: `${label}: `, font: { bold: true, size: 10 } }, { text: String(value ?? ''), font: { size: 10 } }] };
      cell.alignment = { horizontal: 'left', vertical: 'middle' };
    });
  });

  // Group header (row 7) and sub-header (row 8)
  const G = 7;
  const S = 8;
  const HPSR = 9;
  const groupNames = { ww: 'WRITTEN WORKS', pt: 'PERFORMANCE TASKS', qa: 'QUARTERLY ASSESSMENT' };
  for (const k of ['ww', 'pt', 'qa']) {
    merge(G, cols[k].first, cols[k].ws, `${groupNames[k]} (${round2(w[k] * 100)}%)`, { bold: true, size: 10 });
  }
  merge(G, 1, 2, '', {});
  const sub = ws.getRow(S);
  sub.getCell(1).value = 'No.';
  sub.getCell(2).value = "LEARNERS' NAMES";
  for (const k of ['ww', 'pt', 'qa']) {
    H[k].forEach((_, i) => { sub.getCell(cols[k].first + i).value = k === 'qa' ? `QA ${i + 1}` : `${k.toUpperCase()} ${i + 1}`; });
    sub.getCell(cols[k].total).value = 'Total';
    sub.getCell(cols[k].ps).value = 'PS';
    sub.getCell(cols[k].ws).value = 'WS';
  }
  ws.getCell(G, initialCol).value = 'INITIAL GRADE';
  ws.getCell(G, qgCol).value = 'QUARTERLY GRADE';
  ws.mergeCells(G, initialCol, S, initialCol);
  ws.mergeCells(G, qgCol, S, qgCol);
  for (const r of [G, S]) {
    for (let cc = 1; cc <= lastCol; cc++) {
      const cell = ws.getCell(r, cc);
      cell.font = { bold: true, size: 9, color: { argb: 'FFFFFFFF' } };
      cell.fill = fill(GREEN);
      cell.border = BOX;
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    }
  }
  ws.getRow(S).height = 30;

  // Highest possible score row
  const hpsRow = ws.getRow(HPSR);
  hpsRow.getCell(2).value = 'HIGHEST POSSIBLE SCORE';
  for (const k of ['ww', 'pt', 'qa']) {
    const { first, last, total, ps } = cols[k];
    H[k].forEach((v, i) => { hpsRow.getCell(first + i).value = v; });
    const hpsSum = H[k].reduce((a, b) => a + (b || 0), 0);
    hpsRow.getCell(total).value = { formula: `SUM(${L(first)}${HPSR}:${L(last)}${HPSR})`, result: hpsSum };
    hpsRow.getCell(ps).value = 100;
    hpsRow.getCell(cols[k].ws).value = w[k];
    hpsRow.getCell(cols[k].ws).numFmt = '0%';
  }
  for (let cc = 1; cc <= lastCol; cc++) {
    const cell = hpsRow.getCell(cc);
    cell.font = { bold: true, size: 9 };
    cell.fill = fill(GRAY);
    cell.border = BOX;
    cell.alignment = { horizontal: cc === 2 ? 'left' : 'center' };
  }

  // Learner groups
  const groups = [
    ['MALE', learners.filter((l) => /^m/i.test(String(l?.gender || '')))],
    ['FEMALE', learners.filter((l) => /^f/i.test(String(l?.gender || '')))],
    ['LEARNERS', learners.filter((l) => !/^[mf]/i.test(String(l?.gender || '')))],
  ].filter(([, list]) => list.length);
  const byName = (a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'en', { sensitivity: 'base' });

  let r = HPSR + 1;
  for (const [label, list] of groups) {
    ws.mergeCells(r, 1, r, lastCol);
    const div = ws.getCell(r, 1);
    div.value = label;
    div.font = { bold: true };
    div.fill = fill('FFD8E8DD');
    div.border = BOX;
    r++;
    [...list].sort(byName).forEach((l, idx) => {
      const row = ws.getRow(r);
      row.getCell(1).value = idx + 1;
      row.getCell(2).value = String(l.name || '');
      const comps = {};
      for (const k of ['ww', 'pt', 'qa']) {
        const scores = H[k].map((_, i) => numOrNull(l?.[k]?.scores?.[i]));
        comps[k] = { scores: scores.map((s) => s ?? 0), hps: H[k].map((h) => h || 0) };
        scores.forEach((s, i) => { row.getCell(cols[k].first + i).value = s; });
      }
      const g = computeQuarterlyGrade(comps, w);
      const wsRefs = [];
      for (const k of ['ww', 'pt', 'qa']) {
        const { first, last, total, ps } = cols[k];
        const x = g.components[k];
        const T = `${L(total)}${r}`;
        const HT = `$${L(total)}$${HPSR}`;
        row.getCell(total).value = { formula: `SUM(${L(first)}${r}:${L(last)}${r})`, result: x.total };
        row.getCell(ps).value = { formula: `IF(${HT}>0,ROUND(${T}/${HT}*100,2),0)`, result: x.ps };
        row.getCell(cols[k].ws).value = { formula: `ROUND(${L(ps)}${r}*$${L(cols[k].ws)}$${HPSR},2)`, result: x.ws };
        wsRefs.push(`${L(cols[k].ws)}${r}`);
      }
      row.getCell(initialCol).value = { formula: `ROUND(${wsRefs.join('+')},2)`, result: g.initialGrade };
      row.getCell(qgCol).value = { formula: `LOOKUP(${L(initialCol)}${r},Transmutation!$A$2:$A$${tEnd},Transmutation!$B$2:$B$${tEnd})`, result: g.quarterlyGrade };
      for (let cc = 1; cc <= lastCol; cc++) {
        const cell = row.getCell(cc);
        cell.border = BOX;
        cell.font = { size: 10, bold: cc === qgCol };
        if (cc !== 2) cell.alignment = { horizontal: 'center' };
      }
      for (const k of ['ww', 'pt', 'qa']) {
        row.getCell(cols[k].ps).numFmt = '0.00';
        row.getCell(cols[k].ws).numFmt = '0.00';
      }
      row.getCell(initialCol).numFmt = '0.00';
      row.getCell(qgCol).numFmt = '0';
      r++;
    });
  }

  // Widths
  ws.getColumn(1).width = 5;
  ws.getColumn(2).width = 32;
  for (let cc = 3; cc <= lastCol; cc++) ws.getColumn(cc).width = 6.5;
  for (const k of ['ww', 'pt', 'qa']) {
    ws.getColumn(cols[k].ps).width = 7.5;
    ws.getColumn(cols[k].ws).width = 7.5;
  }
  ws.getColumn(initialCol).width = 10;
  ws.getColumn(qgCol).width = 11;
  ws.views = [{ state: 'frozen', xSplit: 2, ySplit: HPSR }];
  ws.pageSetup.printTitlesRow = `${G}:${HPSR}`;

  // Transmutation sheet
  const tt = wb.addWorksheet('Transmutation');
  styleHeaderRow(tt.addRow(['Initial Grade (from)', 'Transmuted Grade']));
  for (const [low, grade] of table) {
    const row = tt.addRow([low, grade]);
    row.eachCell((cell) => { cell.border = BOX; });
    row.getCell(1).numFmt = '0.00';
  }
  tt.getColumn(1).width = 20;
  tt.getColumn(2).width = 18;
  tt.addRow([]);
  tt.addRow(['Source: DepEd Order No. 8, s. 2015 (Appendix B)']).getCell(1).font = { italic: true, size: 9 };

  return writeOut(wb);
}
