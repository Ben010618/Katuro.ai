/**
 * Recording scores from the phone into a class record in Records (KaTuroDesk side):
 * reading the E-Class Record, the recording rules, and the request handler end to end.
 */
import { describe, it, expect } from 'vitest';
import { Buffer } from 'node:buffer';
import ExcelJS from 'exceljs';
import { buildClassRecordWorkbook } from '../desk/generators/xlsxWriters.js';
import { WEIGHT_PRESETS } from '../desk/depedGrading.js';
import { readDocument } from '../desk/readers/index.js';
import { readClassRecord, planRecord } from '../desk/records/recordSheet.js';
import { createVirtualWorkspace, readFileBytes, flattenFileTree } from '../localFileSystem.js';
import { createDeskRequestHandler } from './deskRequests.js';

const LEARNERS = [
  { name: 'Dela Cruz, Juan P.', lrn: '136512340001', gender: 'M' },
  { name: 'Reyes, Pedro A.', lrn: '136512340002', gender: 'M' },
  { name: 'Santos, Maria L.', lrn: '136512340003', gender: 'F' },
];
const RECORD = 'Records/Grade 7 - Rizal - Science.xlsx';

const ecr = (learners = LEARNERS) => buildClassRecordWorkbook({
  meta: { subject: 'Science', gradeSection: 'Grade 7 - Rizal' },
  weights: WEIGHT_PRESETS.scienceMath,
  hps: { ww: Array(10).fill(null), pt: Array(10).fill(null), qa: [null] },
  learners,
  withLrn: true,
});

const parse = async (bytes, name = 'x.xlsx') => readClassRecord(await readDocument({ bytes, name }));

async function cellValue(bytes, addr) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(Buffer.from(bytes));
  const v = wb.getWorksheet('Class Record').getCell(addr).value;
  return v && typeof v === 'object' && 'result' in v ? v.result : v;
}

describe('readClassRecord', () => {
  it('finds the learners (with LRN and sex) and the 10 WW, 10 PT and 1 QA columns', async () => {
    const r = await parse(await ecr());
    expect(r.error).toBeUndefined();
    expect(r.ready).toBe(true);
    expect(r.lrnColumn).toBe('B');
    expect(r.learners.map((l) => [l.lrn, l.name, l.sex])).toEqual([
      ['136512340001', 'Dela Cruz, Juan P.', 'M'],
      ['136512340002', 'Reyes, Pedro A.', 'M'],
      ['136512340003', 'Santos, Maria L.', 'F'],
    ]);
    expect(r.columns.map((c) => c.key)).toEqual([...Array(10)].map((_, i) => `ww${i + 1}`).concat([...Array(10)].map((_, i) => `pt${i + 1}`), ['qa1']));
    expect(r.columns[0]).toMatchObject({ label: 'WW 1', cell: 'D', hps: null, hpsCell: 'D9', filled: 0 });
  });

  it('a record without LRNs is read but not ready', async () => {
    const r = await parse(await ecr(LEARNERS.map((l) => ({ ...l, lrn: '' }))));
    expect(r.ready).toBe(false);
  });
});

describe('planRecord', () => {
  it('writes each score in the learner\'s row (matched by LRN) and the HPS when it is blank', async () => {
    const r = await parse(await ecr());
    const plan = planRecord(r, { column: 'ww3', hps: 20, scores: [{ lrn: '136512340003', score: 18 }, { lrn: '136512340001', score: 15.5 }, { lrn: '136512340002', score: null }] });
    expect(plan.ok).toBe(true);
    const juan = r.learners.find((l) => l.lrn === '136512340001');
    expect(plan.edits).toEqual(expect.arrayContaining([
      { sheet: 'Class Record', cell: 'F9', value: 20 },
      { sheet: 'Class Record', cell: `F${juan.row}`, value: 15.5 },
    ]));
    expect(plan.missing.map((m) => m.name)).toEqual(['Reyes, Pedro A.']);
  });

  it('refuses: no HPS, a score above the HPS, an unknown LRN, a record that is not ready', async () => {
    const r = await parse(await ecr());
    expect(planRecord(r, { column: 'ww1', scores: [] })).toMatchObject({ ok: false, reason: 'needs_hps' });
    expect(planRecord(r, { column: 'ww1', hps: 10, scores: [{ lrn: '136512340001', score: 11 }] })).toMatchObject({ ok: false, reason: 'invalid' });
    expect(planRecord(r, { column: 'ww1', hps: 10, scores: [{ lrn: '999999999999', score: 5 }] })).toMatchObject({ ok: false, reason: 'unknown_learners' });
    expect(planRecord(r, { column: 'zz9', hps: 10, scores: [] })).toMatchObject({ ok: false, reason: 'no_column' });
    const notReady = await parse(await ecr(LEARNERS.map((l) => ({ ...l, lrn: '' }))));
    expect(planRecord(notReady, { column: 'ww1', hps: 10, scores: [] })).toMatchObject({ ok: false, reason: 'not_ready' });
  });
});

async function home() {
  const ws = createVirtualWorkspace('KaTuro');
  ws.handle.saveVirtualFile(RECORD, await ecr());
  ws.handle.saveVirtualFile('Lessons/Week 1.docx', new Uint8Array([1]));
  return ws;
}

describe('KaTuroDesk answering the phone', () => {
  it('lists the classes, records scores straight into the class record (backup first), and reports missing papers', async () => {
    const ws = await home();
    const wrote = [];
    const ask = createDeskRequestHandler({ handle: ws.handle, onWrote: (p) => wrote.push(p) });

    const { classes } = await ask('classes');
    expect(classes).toEqual([expect.objectContaining({ path: RECORD, name: 'Grade 7 - Rizal - Science', gradeLevel: 'Grade 7', section: 'Rizal', subject: 'Science', ready: true, learnerCount: 3 })]);

    const cls = await ask('class', { path: RECORD });
    expect(cls.learners).toHaveLength(3);

    const res = await ask('record', { id: 'r1', path: RECORD, column: 'ww1', hps: 20, scores: [{ lrn: '136512340001', score: 18 }, { lrn: '136512340003', score: 20 }] });
    expect(res).toMatchObject({ ok: true, written: 2, hps: 20, savedTo: RECORD });
    expect(res.missing.map((m) => m.name)).toEqual(['Reyes, Pedro A.']);
    expect(res.backup).toMatch(/^KaTuro Backups\//);
    expect(wrote).toEqual([RECORD]);

    // The backup holds the record as it was; the record has the scores and the HPS.
    const backup = await readFileBytes(ws.handle, res.backup);
    expect(await cellValue(backup, 'D9')).toBeNull();
    const copy = await readFileBytes(ws.handle, RECORD);
    expect(await cellValue(copy, 'D9')).toBe(20);
    const juanRow = cls.learners.find((l) => l.lrn === '136512340001').row;
    expect(await cellValue(copy, `D${juanRow}`)).toBe(18);

    // The next recording keeps WW1, and there is still one file for the class (no copy).
    const res2 = await ask('record', { id: 'r2', path: RECORD, column: 'ww2', hps: 10, scores: [{ lrn: '136512340002', score: 7 }] });
    expect(res2.written).toBe(1);
    const copy2 = await readFileBytes(ws.handle, res2.savedTo);
    expect(await cellValue(copy2, `D${juanRow}`)).toBe(18);
    expect((await ask('class', { path: RECORD })).columns.find((c) => c.key === 'ww1').filled).toBe(2);
    expect((await ask('classes')).classes).toHaveLength(1);
    expect(flattenFileTree(ws.handle.getFiles()).filter((f) => f.path.startsWith('Records/')).map((f) => f.path)).toEqual([RECORD]);
    // Every recording made its own backup.
    expect(flattenFileTree(ws.handle.getFiles()).filter((f) => f.path.startsWith('KaTuro Backups/'))).toHaveLength(2);
  });

  it('the same recording sent twice is written once', async () => {
    const ws = await home();
    const ask = createDeskRequestHandler({ handle: ws.handle });
    const args = { id: 'same-id', path: RECORD, column: 'pt1', hps: 50, scores: [{ lrn: '136512340001', score: 45 }] };
    await ask('record', args);
    const again = await ask('record', args);
    expect(again).toMatchObject({ repeated: true, written: 1 });
    const backups = flattenFileTree(ws.handle.getFiles()).filter((f) => f.path.startsWith('KaTuro Backups/'));
    expect(backups).toHaveLength(1);
  });

  it('never replaces a score without the teacher confirming', async () => {
    const ws = await home();
    const ask = createDeskRequestHandler({ handle: ws.handle });
    await ask('record', { id: 'a', path: RECORD, column: 'qa1', hps: 50, scores: [{ lrn: '136512340001', score: 40 }] });
    await expect(ask('record', { id: 'b', path: RECORD, column: 'qa1', hps: 50, scores: [{ lrn: '136512340001', score: 44 }] }))
      .rejects.toMatchObject({ code: 'CONFLICTS', details: { conflicts: [{ lrn: '136512340001', before: 40, after: 44 }] } });
    const ok = await ask('record', { id: 'c', path: RECORD, column: 'qa1', hps: 50, overwrite: true, scores: [{ lrn: '136512340001', score: 44 }] });
    expect(ok.written).toBe(1);
  });

  it('a class record that is not ready is listed with what to fix, and refuses recording', async () => {
    const ws = createVirtualWorkspace('KaTuro');
    ws.handle.saveVirtualFile(RECORD, await ecr(LEARNERS.map((l, i) => ({ ...l, lrn: i === 1 ? '' : l.lrn }))));
    const ask = createDeskRequestHandler({ handle: ws.handle });
    const [c] = (await ask('classes')).classes;
    expect(c.ready).toBe(false);
    expect(c.problems[0]).toMatch(/Reyes, Pedro A\. has no LRN/);
    await expect(ask('record', { id: 'x', path: RECORD, column: 'ww1', hps: 10, scores: [{ lrn: '136512340001', score: 5 }] })).rejects.toMatchObject({ code: 'NOT_READY' });
  });

  it('a class record open in Excel is not changed; the teacher is told to close it', async () => {
    const ws = await home();
    const ask = createDeskRequestHandler({ handle: ws.handle });
    const save = ws.handle.saveVirtualFile.bind(ws.handle);
    ws.handle.saveVirtualFile = (path, ...rest) => {
      if (path === RECORD) throw new Error("EBUSY: resource busy or locked, open 'C:\\Users\\T\\Documents\\KaTuro\\Records\\Grade 7 - Rizal - Science.xlsx'");
      return save(path, ...rest);
    };
    await expect(ask('record', { id: 'busy', path: RECORD, column: 'ww1', hps: 20, scores: [{ lrn: '136512340001', score: 18 }] }))
      .rejects.toMatchObject({ code: 'FILE_OPEN', message: expect.stringMatching(/open in Excel/) });
    ws.handle.saveVirtualFile = save;
    // Nothing was written, so the same recording can be sent again once Excel is closed.
    expect((await ask('record', { id: 'busy', path: RECORD, column: 'ww1', hps: 20, scores: [{ lrn: '136512340001', score: 18 }] })).written).toBe(1);
  });
});

describe('history and undo of phone recordings', () => {
  it('keeps who recorded what, and Undo puts the scores (and a new HPS) back as they were', async () => {
    const ws = await home();
    const ask = createDeskRequestHandler({ handle: ws.handle, now: () => 1700000000000 });
    const phone = { id: 'd1', name: "Ma'am Ana's phone" };
    await ask('record', { id: 'r1', path: RECORD, column: 'ww1', hps: 20, scores: [{ lrn: '136512340001', score: 18 }] }, phone);
    await ask('record', { id: 'r2', path: RECORD, column: 'ww1', hps: 20, overwrite: true, scores: [{ lrn: '136512340001', score: 19 }, { lrn: '136512340003', score: 20 }] }, phone);
    const { history } = await ask('history', { path: RECORD });
    expect(history.map((h) => [h.id, h.device, h.columnLabel, h.count])).toEqual([['r2', "Ma'am Ana's phone", 'WW 1', 2], ['r1', "Ma'am Ana's phone", 'WW 1', 1]]);
    expect(history[0].cells).toEqual([{ lrn: '136512340001', name: 'Dela Cruz, Juan P.', before: 18, after: 19 }, { lrn: '136512340003', name: 'Santos, Maria L.', before: null, after: 20 }]);

    // Undo the newest: Juan back to 18, Maria blank again.
    expect(await ask('undo', { id: 'r2' }, phone)).toMatchObject({ ok: true, restored: 2 });
    let cls = await ask('class', { path: RECORD });
    expect(cls.scores.ww1).toEqual({ '136512340001': 18 });
    // Undo the first: Juan blank, and the HPS it set is cleared.
    await ask('undo', { id: 'r1' }, phone);
    cls = await ask('class', { path: RECORD });
    expect(cls.scores.ww1).toEqual({});
    expect(cls.columns.find((c) => c.key === 'ww1').hps).toBeNull();
    expect((await ask('undo', { id: 'r1' }))).toMatchObject({ already: true });
  });

  it('never undoes over a score changed after the recording', async () => {
    const ws = await home();
    const ask = createDeskRequestHandler({ handle: ws.handle });
    await ask('record', { id: 'a', path: RECORD, column: 'pt1', hps: 50, scores: [{ lrn: '136512340001', score: 40 }] });
    await ask('record', { id: 'b', path: RECORD, column: 'pt1', hps: 50, overwrite: true, scores: [{ lrn: '136512340001', score: 45 }] });
    await expect(ask('undo', { id: 'a' })).rejects.toMatchObject({ code: 'CHANGED_SINCE' });
    expect((await ask('class', { path: RECORD })).scores.pt1).toEqual({ '136512340001': 45 });
  });
});

describe('attendance by tap', () => {
  const ATT = 'Records/Attendance/Grade 7 - Rizal - Science.xlsx';

  it('makes Records/Attendance/<class>.xlsx, keeps each day, counts absences, warns on 3 in a row; not a class', async () => {
    const ws = await home();
    const ask = createDeskRequestHandler({ handle: ws.handle });
    let n = 0;
    const mark = (date, m) => ask('attendance', { id: `att-${(n += 1)}`, path: RECORD, date, marks: m });
    const r1 = await mark('2026-11-16', { '136512340001': 'P', '136512340002': 'A', '136512340003': 'L' });
    expect(r1).toMatchObject({ ok: true, file: ATT, counts: { P: 1, A: 1, L: 1 }, absentStreaks: [] });
    await mark('2026-11-17', { '136512340002': 'A' });
    const r3 = await mark('2026-11-18', { '136512340002': 'a', '136512340001': 'P' });
    expect(r3.absentStreaks).toEqual([{ lrn: '136512340002', name: 'Reyes, Pedro A.', days: 3 }]);

    const day1 = await ask('attendanceGet', { path: RECORD, date: '2026-11-16' });
    expect(day1.marks).toEqual({ '136512340001': 'P', '136512340002': 'A', '136512340003': 'L' });
    expect(day1.learners).toHaveLength(3);
    // Changing a day keeps the others.
    await mark('2026-11-16', { '136512340002': 'E' });
    expect((await ask('attendanceGet', { path: RECORD, date: '2026-11-16' })).marks['136512340002']).toBe('E');
    expect((await ask('attendanceGet', { path: RECORD, date: '2026-11-17' })).marks).toEqual({ '136512340002': 'A' });

    // The Absences column counts with a live formula.
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(Buffer.from(await readFileBytes(ws.handle, ATT)));
    const sheet = wb.getWorksheet('Attendance');
    const pedro = [4, 5, 6].find((r) => sheet.getCell(`B${r}`).value === '136512340002');
    expect(sheet.getCell(`D${pedro}`).value.formula).toMatch(/^COUNTIF\(F\d+:/);
    // The attendance file is not listed as a class.
    expect((await ask('classes')).classes.map((c) => c.path)).toEqual([RECORD]);
  });

  it('only for a ready class record, only known learners and marks', async () => {
    const ws = createVirtualWorkspace('KaTuro');
    ws.handle.saveVirtualFile(RECORD, await ecr(LEARNERS.map((l, i) => ({ ...l, lrn: i ? l.lrn : '' }))));
    const ask = createDeskRequestHandler({ handle: ws.handle });
    await expect(ask('attendance', { path: RECORD, date: '2026-11-16', marks: { '136512340002': 'A' } })).rejects.toMatchObject({ code: 'NOT_READY' });
    const ok = await home();
    const ask2 = createDeskRequestHandler({ handle: ok.handle });
    await expect(ask2('attendance', { path: RECORD, date: '2026-11-16', marks: { '999999999999': 'A', '136512340001': 'Z' } })).rejects.toMatchObject({ code: 'INVALID' });
  });
});
