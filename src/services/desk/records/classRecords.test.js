/**
 * Class records in the KaTuro folder's Records folder: naming, the readiness rule (full
 * name + 12-digit LRN for every learner), default save places, and the agent tools.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Buffer } from 'node:buffer';
import ExcelJS from 'exceljs';
import { callGeminiProxy } from '../../geminiConfig';
import { runDeskAgentTurn, clearAnswerMemory } from '../agent/deskAgent';
import { resetTaskActionSupport } from '../agent/llm';
import { createVirtualWorkspace, readFileBytes, editsInPlace } from '../../localFileSystem';
import { buildClassRecordWorkbook } from '../generators/xlsxWriters.js';
import {
  classRecordFileName, parseClassRecordFileName, gradeLabel, isInRecords, isKaturoHome,
  unclearNameReason, checkClassList, readinessText, defaultOutputFolder,
} from './classRecords.js';

vi.mock('../../geminiConfig', () => ({ callGeminiProxy: vi.fn() }));

beforeEach(() => {
  resetTaskActionSupport();
  clearAnswerMemory();
  callGeminiProxy.mockReset();
});

const GOOD = [
  { name: 'Dela Cruz, Juan P.', lrn: '136512340001', sex: 'M' },
  { name: 'Reyes, Pedro A.', lrn: '136512340002', sex: 'M' },
  { name: 'Santos, Maria L.', lrn: '136512340003', sex: 'F' },
];

describe('class record file names', () => {
  it('one file per class and subject: "Grade 7 - Rizal - Science.xlsx"', () => {
    expect(classRecordFileName({ gradeLevel: '7', section: 'Rizal', subject: 'Science' })).toBe('Grade 7 - Rizal - Science.xlsx');
    expect(classRecordFileName({ gradeLevel: 'grade 10', section: ' St. Paul ', subject: 'Araling Panlipunan' })).toBe('Grade 10 - St. Paul - Araling Panlipunan.xlsx');
    expect(classRecordFileName({ gradeLevel: 'G8', section: 'A/B', subject: 'TLE: ICT' })).toBe('Grade 8 - A B - TLE ICT.xlsx');
    expect(gradeLabel('Kinder')).toBe('Kinder');
    expect(() => classRecordFileName({ gradeLevel: '7', section: '', subject: 'Math' })).toThrow(/section/);
  });

  it('only KaTuro class records in the KaTuro folder are edited in place; everything else gets a copy', () => {
    const home = { katuroHome: true };
    expect(editsInPlace('Records/Grade 7 - Rizal - Science.xlsx', home)).toBe(true);
    expect(editsInPlace('Records/SY 2025-2026/Grade 7 - Rizal - Science.xlsx', home)).toBe(true);
    // Another folder the teacher opened (e.g. D:\School\Records\…): never in place.
    expect(editsInPlace('Records/Grade 7 - Rizal - Science.xlsx', { katuroHome: false })).toBe(false);
    expect(editsInPlace('Records/Grade 7 - Rizal - Science.xlsx', undefined)).toBe(false);
    // Not a class record, macros, attendance, a working copy, outside Records.
    expect(editsInPlace('Records/SF2 October.xlsx', home)).toBe(false);
    expect(editsInPlace('Records/Grade 7 - Rizal - Science.xlsm', home)).toBe(false);
    expect(editsInPlace('Records/Attendance/Grade 7 - Rizal - Science.xlsx', home)).toBe(false);
    expect(editsInPlace('Records/Grade 7 - Rizal - Science (KaTuro edit).xlsx', home)).toBe(false);
    expect(editsInPlace('Lessons/Grade 7 - Rizal - Science.xlsx', home)).toBe(false);
  });

  it('reads a class back from its file name', () => {
    expect(parseClassRecordFileName('Records/Grade 7 - Rizal - Science.xlsx')).toEqual({ gradeLevel: 'Grade 7', section: 'Rizal', subject: 'Science' });
    expect(parseClassRecordFileName('Records/my grades.xlsx')).toBeNull();
  });

  it('knows Records, Lessons and the KaTuro folder', () => {
    expect(isInRecords('Records/Grade 7 - Rizal - Science.xlsx')).toBe(true);
    expect(isInRecords('records/Old/x.xlsx')).toBe(true);
    expect(isInRecords('Lessons/Records/x.xlsx')).toBe(false);
    const dir = (name) => ({ name, path: name, kind: 'directory', children: [] });
    expect(isKaturoHome([dir('Records'), dir('Lessons'), dir('Seminars')])).toBe(true);
    expect(isKaturoHome([dir('Records')])).toBe(false);
  });
});

describe('readiness: every learner needs a clear full name and a 12-digit LRN', () => {
  it('a complete list is ready', () => {
    const check = checkClassList(GOOD);
    expect(check.ready).toBe(true);
    expect(check.counts).toEqual({ learners: 3, male: 2, female: 1 });
    expect(readinessText('Grade 7 - Rizal - Science.xlsx', check)).toMatch(/is ready: 3 learners/);
  });

  it('unclear names are refused', () => {
    expect(unclearNameReason('Juan')).toMatch(/last name and the first name/);
    expect(unclearNameReason('Learner 01')).toBeTruthy();
    expect(unclearNameReason('Santos, M4ria')).toMatch(/numbers/);
    expect(unclearNameReason('Dela Cruz, ?')).toBeTruthy();
    expect(unclearNameReason('')).toMatch(/blank/);
    expect(unclearNameReason('Dela Cruz, Juan P.')).toBeNull();
    expect(unclearNameReason('Peñafrancia, Niño')).toBeNull();
  });

  it('missing, wrong-length and duplicate LRNs, and duplicate names, all block recording', () => {
    const check = checkClassList([
      ...GOOD,
      { name: 'Bautista, Ana', lrn: '' },
      { name: 'Garcia, Jose', lrn: '12345' },
      { name: 'Lim, Rosa', lrn: '136512340001' },
      { name: 'Santos, Maria L.', lrn: '136512340009' },
      { name: 'Cruz, Ben', lrn: '1365 1234 0010' },
    ]);
    expect(check.ready).toBe(false);
    const types = check.problems.map((p) => p.type).sort();
    expect(types).toEqual(['bad_lrn', 'duplicate_lrn', 'duplicate_name', 'missing_lrn']);
    // An LRN typed with spaces is fine once cleaned.
    expect(check.learners.find((l) => l.name === 'Cruz, Ben').lrn).toBe('136512340010');
    const text = readinessText('Grade 7 - Rizal - Science.xlsx', check);
    expect(text).toMatch(/not ready/);
    expect(text).toMatch(/Bautista, Ana has no LRN/);
    expect(text).toMatch(/"12345" is not 12 digits/);
  });

  it('an empty list is not ready', () => {
    expect(checkClassList([]).problems[0].type).toBe('no_learners');
  });
});

describe('default save places', () => {
  const date = '2026-11-16';
  it('in the KaTuro folder: records into Records, everything else into Lessons', () => {
    expect(defaultOutputFolder('make_class_record', { home: true, date })).toBe('Records/KaTuro Outputs/2026-11-16');
    expect(defaultOutputFolder('check_attendance', { home: true, date })).toBe('Records/KaTuro Outputs/2026-11-16');
    expect(defaultOutputFolder('write_document', { home: true, date })).toBe('Lessons/KaTuro Outputs/2026-11-16');
    expect(defaultOutputFolder('make_slides', { home: true, date })).toBe('Lessons/KaTuro Outputs/2026-11-16');
  });
  it('any other folder keeps "KaTuro Outputs"', () => {
    expect(defaultOutputFolder('make_class_record', { home: false, date })).toBe('KaTuro Outputs/2026-11-16');
  });
});

describe('E-Class Record with an LRN column', () => {
  it('puts the LRN (as text) before the names and shifts the score columns', async () => {
    const bytes = await buildClassRecordWorkbook({
      meta: { subject: 'Science' },
      hps: { ww: [null, null], pt: [null], qa: [null] },
      learners: GOOD.map((l) => ({ name: l.name, lrn: l.lrn, gender: l.sex })),
    });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(Buffer.from(bytes));
    const ws = wb.getWorksheet('Class Record');
    expect(ws.getCell('B8').value).toBe('LRN');
    expect(ws.getCell('C8').value).toBe("LEARNERS' NAMES");
    expect(ws.getCell('D8').value).toBe('WW 1');
    let juan = null;
    ws.eachRow((row, r) => { if (row.getCell(3).value === 'Dela Cruz, Juan P.') juan = r; });
    expect(ws.getCell(`B${juan}`).value).toBe('136512340001');
    expect(ws.getCell(`F${juan}`).value.formula).toBe(`SUM(D${juan}:E${juan})`);
    expect(ws.views[0]).toMatchObject({ xSplit: 3 });
  });

  it('without LRNs the layout is exactly as before', async () => {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(Buffer.from(await buildClassRecordWorkbook({ learners: [{ name: 'Dela Cruz, Juan', gender: 'M' }] })));
    expect(wb.getWorksheet('Class Record').getCell('B8').value).toBe("LEARNERS' NAMES");
  });
});

// ── agent tools ───────────────────────────────────────────────

async function xlsx(rows) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Sheet1');
  rows.forEach((r, i) => r.forEach((v, j) => { ws.getCell(i + 1, j + 1).value = v; }));
  return new Uint8Array(await wb.xlsx.writeBuffer());
}

const LIST_ROWS = [
  ['LRN', "Learner's Name", 'Sex'],
  ['136512340001', 'Dela Cruz, Juan P.', 'M'],
  ['136512340002', 'Reyes, Pedro A.', 'M'],
  ['136512340003', 'Santos, Maria L.', 'F'],
];
// What the AI answers when KaTuroDesk asks what the file is (the layout of the paper).
const layout = (lastRow, purpose = 'masterlist') => ({
  docType: purpose, title: 'Class list', confidence: 0.9, fields: [],
  tables: [{
    id: 't', purpose, location: { sheet: 'Sheet1', firstRow: 2, lastRow }, nameColumn: 'B',
    columns: [{ key: 'lrn', column: 'A', header: 'LRN', meaning: 'lrn' }, { key: 'name', column: 'B', header: "Learner's Name", meaning: 'learner_name' }, { key: 'sex', column: 'C', header: 'Sex', meaning: 'sex' }],
  }],
});
const aiAnswers = (obj) => callGeminiProxy.mockImplementation(async () => ({ text: JSON.stringify(obj) }));

async function katuroHome(files = {}) {
  const ws = createVirtualWorkspace('KaTuro');
  ws.handle.saveVirtualFile('Lessons/Week 1.docx', new Uint8Array([1]));
  ws.handle.saveVirtualFile('Records/.keep', new Uint8Array([1]));
  for (const [path, rows] of Object.entries(files)) ws.handle.saveVirtualFile(path, await xlsx(rows));
  ws.files = ws.handle.getFiles();
  return ws;
}

const run = (workspace, tool, args) => runDeskAgentTurn({
  prompt: tool, workspace, user: { uid: 'u1' }, autoApprove: true,
  confirmedPlan: { reply: '', tasks: [{ id: 't1', tool, args, label: tool }] },
});
const SETUP = { listPath: 'Lessons/SF1 Rizal.xlsx', gradeLevel: '7', section: 'Rizal', subject: 'Science' };

describe('setup_class_record / check_class_record', () => {
  it('makes "Records/Grade 7 - Rizal - Science.xlsx" from the class list, with names and LRNs', async () => {
    const workspace = await katuroHome({ 'Lessons/SF1 Rizal.xlsx': LIST_ROWS });
    aiAnswers(layout(4));
    const res = await run(workspace, 'setup_class_record', SETUP);

    const made = res.createdFiles.find((f) => f.name === 'Grade 7 - Rizal - Science.xlsx');
    expect(made?.path, res.content).toBe('Records/Grade 7 - Rizal - Science.xlsx');
    expect(res.content).toMatch(/3 learners \(2 male, 1 female\)/);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(Buffer.from(await readFileBytes(workspace.handle, made.path)));
    const ws = wb.getWorksheet('Class Record');
    const rows = [];
    ws.eachRow((row) => { if (/^\d{12}$/.test(String(row.getCell(2).value))) rows.push([row.getCell(2).value, row.getCell(3).value]); });
    expect(rows).toEqual([
      ['136512340001', 'Dela Cruz, Juan P.'],
      ['136512340002', 'Reyes, Pedro A.'],
      ['136512340003', 'Santos, Maria L.'],
    ]);
    expect(ws.getCell('D8').value).toBe('WW 1');
    expect(ws.getCell('M8').value).toBe('WW 10');
  });

  it('refuses a class list with a missing LRN, and says what to fix', async () => {
    const workspace = await katuroHome({ 'Lessons/SF1 Rizal.xlsx': [...LIST_ROWS, ['', 'Bautista, Ana M.', 'F']] });
    aiAnswers(layout(5));
    const res = await run(workspace, 'setup_class_record', SETUP);
    expect(res.createdFiles.some((f) => f.path.startsWith('Records/'))).toBe(false);
    expect(res.content).toMatch(/Bautista, Ana M\. has no LRN/);
  });

  it('never replaces a class record that already exists', async () => {
    const workspace = await katuroHome({ 'Lessons/SF1 Rizal.xlsx': LIST_ROWS, 'Records/Grade 7 - Rizal - Science.xlsx': LIST_ROWS });
    aiAnswers(layout(4));
    const res = await run(workspace, 'setup_class_record', SETUP);
    expect(res.content).toMatch(/already exists/);
    expect(res.createdFiles).toEqual([]);
  });

  it('asks for the grade, section and subject when they are missing', async () => {
    const workspace = await katuroHome({ 'Lessons/SF1 Rizal.xlsx': LIST_ROWS });
    const res = await run(workspace, 'setup_class_record', { listPath: 'Lessons/SF1 Rizal.xlsx', gradeLevel: '7' });
    expect(res.content).toMatch(/section, subject/);
    expect(res.createdFiles).toEqual([]);
  });

  it('recording into a class record in Records that is not ready is refused', async () => {
    const workspace = await katuroHome({
      'Records/Grade 7 - Rizal - Science.xlsx': [['LRN', "Learner's Name", 'Sex'], ['136512340001', 'Dela Cruz, Juan P.', 'M'], ['', 'Reyes, Pedro A.', 'M']],
      'Lessons/Quiz 1 scores.xlsx': [['Name', 'Score'], ['Dela Cruz, Juan P.', 18], ['Reyes, Pedro A.', 15]],
    });
    aiAnswers(layout(3, 'class_record'));
    const res = await run(workspace, 'encode_scores', { sourcePath: 'Lessons/Quiz 1 scores.xlsx', targetPath: 'Records/Grade 7 - Rizal - Science.xlsx', targetColumn: 'C' });
    expect(res.content).toMatch(/not ready for recording/);
    expect(res.content).toMatch(/Reyes, Pedro A\. has no LRN/);
    expect(res.createdFiles).toEqual([]);
  });

  it('check_class_record reports a ready record', async () => {
    const workspace = await katuroHome({ 'Records/Grade 7 - Rizal - Science.xlsx': LIST_ROWS });
    aiAnswers(layout(4, 'class_record'));
    const res = await run(workspace, 'check_class_record', { path: 'Records/Grade 7 - Rizal - Science.xlsx' });
    expect(res.content).toMatch(/is ready: 3 learners/);
  });

  it('in the KaTuro folder new lesson files are saved in Lessons', async () => {
    const workspace = await katuroHome();
    aiAnswers({ title: 'Seat Plan', sheets: [{ name: 'Seats', columns: [{ header: 'Row' }], rows: [['1']] }] });
    const res = await run(workspace, 'make_spreadsheet', { request: 'a seat plan' });
    expect(res.createdFiles.length, res.content).toBeGreaterThan(0);
    expect(res.createdFiles.every((f) => f.path.startsWith('Lessons/KaTuro Outputs/'))).toBe(true);
  });
});
