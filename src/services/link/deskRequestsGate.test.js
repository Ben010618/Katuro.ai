/**
 * Fixes from the review gate (KaTuroDesk side): text in score cells, which files are edited
 * in place, attendance files per class folder, the teacher's own columns, and refusing to
 * overwrite a class record that changed after it was read.
 */
import { describe, it, expect } from 'vitest';
import { Buffer } from 'node:buffer';
import ExcelJS from 'exceljs';
import { buildClassRecordWorkbook } from '../desk/generators/xlsxWriters.js';
import { WEIGHT_PRESETS } from '../desk/depedGrading.js';
import { readDocument } from '../desk/readers/index.js';
import { readClassRecord } from '../desk/records/recordSheet.js';
import { applyEdits } from '../desk/docmap/index.js';
import { attendancePathFor, newAttendanceWorkbook, writeAttendance, readAttendance } from '../desk/records/attendance.js';
import { createVirtualWorkspace, readFileBytes, saveWorkingCopy, sha256Hex, fileExists, flattenFileTree, readDirectoryRecursively } from '../localFileSystem.js';
import { createDeskRequestHandler } from './deskRequests.js';

const LEARNERS = [
  { name: 'Dela Cruz, Juan P.', lrn: '136512340001', gender: 'M' },
  { name: 'Reyes, Pedro A.', lrn: '136512340002', gender: 'M' },
  { name: 'Santos, Maria L.', lrn: '136512340003', gender: 'F' },
];
const RECORD = 'Records/Grade 7 - Rizal - Science.xlsx';

const ecr = () => buildClassRecordWorkbook({
  meta: { subject: 'Science' },
  weights: WEIGHT_PRESETS.scienceMath,
  hps: { ww: Array(10).fill(null), pt: Array(10).fill(null), qa: [null] },
  learners: LEARNERS,
  withLrn: true,
});
const parse = async (bytes) => readClassRecord(await readDocument({ bytes, name: 'x.xlsx' }));

async function home() {
  const ws = createVirtualWorkspace('KaTuro');
  ws.handle.katuroHome = true;
  ws.handle.saveVirtualFile(RECORD, await ecr());
  return ws;
}

describe('review gate fixes (KaTuroDesk side)', () => {
  it('text in a score cell ("Absent") counts as occupied: never overwritten without a yes, and Undo puts the text back', async () => {
    const ws = await home();
    const rec = await parse(await readFileBytes(ws.handle, RECORD));
    const pedroRow = rec.learners.find((l) => l.lrn === '136512340002').row;
    const withText = await applyEdits(await readFileBytes(ws.handle, RECORD), 'x.xlsx', [{ sheet: 'Class Record', cell: `D${pedroRow}`, value: 'Absent' }]);
    ws.handle.saveVirtualFile(RECORD, withText.bytes);
    const ask = createDeskRequestHandler({ handle: ws.handle });
    expect((await ask('class', { path: RECORD })).scores.ww1).toEqual({ '136512340002': 'Absent' });
    await expect(ask('record', { id: 't1', path: RECORD, column: 'ww1', hps: 20, scores: [{ lrn: '136512340002', score: 7 }] }))
      .rejects.toMatchObject({ code: 'CONFLICTS', details: { conflicts: [{ lrn: '136512340002', before: 'Absent', after: 7 }] } });
    await ask('record', { id: 't2', path: RECORD, column: 'ww1', hps: 20, overwrite: true, scores: [{ lrn: '136512340002', score: 7 }] });
    expect((await ask('class', { path: RECORD })).scores.ww1).toEqual({ '136512340002': 7 });
    await ask('undo', { id: 't2' });
    expect((await ask('class', { path: RECORD })).scores.ww1).toEqual({ '136512340002': 'Absent' });
  });

  it("a teacher's own workbook in Records is recorded into itself, with a backup each time", async () => {
    const ws = await home();
    const OWN = 'Records/My ECR Science 7.xlsx';
    ws.handle.saveVirtualFile(OWN, await ecr());
    const ask = createDeskRequestHandler({ handle: ws.handle });
    const r1 = await ask('record', { id: 'o1', path: OWN, column: 'ww1', hps: 20, scores: [{ lrn: '136512340001', score: 18 }] });
    expect(r1.savedTo).toBe(OWN);
    await ask('record', { id: 'o2', path: OWN, column: 'ww2', hps: 10, scores: [{ lrn: '136512340001', score: 9 }] });
    const cls = await ask('class', { path: OWN });
    expect([cls.scores.ww1, cls.scores.ww2]).toEqual([{ '136512340001': 18 }, { '136512340001': 9 }]);
    // No second copy beside it; the file as it was before each recording is in KaTuro Backups.
    expect(await fileExists(ws.handle, 'Records/My ECR Science 7 (KaTuro edit).xlsx')).toBe(false);
    const backups = flattenFileTree(await readDirectoryRecursively(ws.handle)).filter((f) => f.path.startsWith('KaTuro Backups/') && f.path.includes('My ECR Science 7 (backup'));
    expect(backups.length).toBe(2);
    const before = await Promise.all(backups.map(async (b) => (await parse(await readFileBytes(ws.handle, b.path))).scores.ww1));
    expect(before).toContainEqual({}); // the file as it was before the first recording
    expect((await ask('classes')).classes.map((c) => c.path).sort()).toEqual([OWN, RECORD].sort());
  });

  it('an earlier "(KaTuro edit)" copy keeps the latest scores: recordings continue in it', async () => {
    const ws = await home();
    const OWN = 'Records/My ECR Science 7.xlsx';
    const COPY = 'Records/My ECR Science 7 (KaTuro edit).xlsx';
    ws.handle.saveVirtualFile(OWN, await ecr());
    ws.handle.saveVirtualFile(COPY, await ecr());
    const ask = createDeskRequestHandler({ handle: ws.handle });
    // WW1 then WW2 from the phone: both land in the copy (made by an older KaTuroDesk), together.
    await ask('record', { id: 'c0', path: OWN, column: 'ww1', hps: 20, scores: [{ lrn: '136512340001', score: 18 }] });
    const r = await ask('record', { id: 'c1', path: OWN, column: 'ww2', hps: 10, scores: [{ lrn: '136512340001', score: 9 }] });
    expect(r.savedTo).toBe(COPY);
    const copy = (await parse(await readFileBytes(ws.handle, COPY))).scores;
    expect([copy.ww1, copy.ww2]).toEqual([{ '136512340001': 18 }, { '136512340001': 9 }]);
    expect((await parse(await readFileBytes(ws.handle, OWN))).scores.ww2).toEqual({});
  });

  it('the same KaTuro-named record outside the KaTuro folder is never edited in place', async () => {
    const ws = await home();
    ws.handle.katuroHome = false; // e.g. D:\School opened in KaTuroDesk
    const ask = createDeskRequestHandler({ handle: ws.handle });
    const r = await ask('record', { id: 'n1', path: RECORD, column: 'ww1', hps: 20, scores: [{ lrn: '136512340001', score: 18 }] });
    expect(r.savedTo).toBe('Records/Grade 7 - Rizal - Science (KaTuro edit).xlsx');
  });

  it('two classes with the same name in different Records folders keep separate attendance files', async () => {
    const ws = await home();
    const OTHER = 'Records/SY 2025-2026/Grade 7 - Rizal - Science.xlsx';
    ws.handle.saveVirtualFile(OTHER, await ecr());
    const ask = createDeskRequestHandler({ handle: ws.handle });
    const a = await ask('attendance', { id: 'x1', path: RECORD, date: '2026-11-16', marks: { '136512340001': 'A' } });
    const b = await ask('attendance', { id: 'x2', path: OTHER, date: '2026-11-16', marks: { '136512340001': 'P' } });
    expect([a.file, b.file]).toEqual(['Records/Attendance/Grade 7 - Rizal - Science.xlsx', 'Records/Attendance/SY 2025-2026/Grade 7 - Rizal - Science.xlsx']);
    expect((await ask('attendanceGet', { path: RECORD, date: '2026-11-16' })).marks['136512340001']).toBe('A');
    expect((await ask('attendanceGet', { path: OTHER, date: '2026-11-16' })).marks['136512340001']).toBe('P');
    expect(attendancePathFor('Records/Grade 7 - Rizal - Science.xlsm')).toBe('Records/Attendance/Grade 7 - Rizal - Science (xlsm).xlsx');
    // Updating a day keeps one file (backed up), never an "(KaTuro edit)" copy.
    await ask('attendance', { id: 'x3', path: RECORD, date: '2026-11-17', marks: { '136512340001': 'P' } });
    const names = ws.handle.getFiles().flatMap(function walk(e) { return e.kind === 'directory' ? e.children.flatMap(walk) : [e.path]; });
    expect(names.filter((p) => p.startsWith('Records/Attendance/') && p.includes('KaTuro edit'))).toEqual([]);
  });

  it("a new day and a new learner never overwrite the teacher's own Remarks column or footer row", async () => {
    const learners = LEARNERS.slice(0, 2).map(({ lrn, name }) => ({ lrn, name }));
    let bytes = await newAttendanceWorkbook({ title: 'G7', learners });
    bytes = (await writeAttendance(bytes, { date: '2026-11-16', marks: { '136512340001': 'A' }, learners })).bytes;
    // The teacher adds a Remarks column (G) and a footer row in Excel.
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(Buffer.from(bytes));
    const sheet = wb.getWorksheet('Attendance');
    sheet.getCell('G3').value = 'Remarks';
    sheet.getCell('G4').value = 'transferee';
    sheet.getCell('C6').value = 'Prepared by: Teacher';
    bytes = new Uint8Array(await wb.xlsx.writeBuffer());
    const all = [...learners, { lrn: '136512340003', name: 'Santos, Maria L.' }];
    bytes = (await writeAttendance(bytes, { date: '2026-11-17', marks: { '136512340001': 'P', '136512340003': 'L' }, learners: all })).bytes;
    const out = new ExcelJS.Workbook();
    await out.xlsx.load(Buffer.from(bytes));
    const s = out.getWorksheet('Attendance');
    expect([s.getCell('G3').value, s.getCell('G4').value, s.getCell('C6').value]).toEqual(['Remarks', 'transferee', 'Prepared by: Teacher']);
    expect(s.getCell('H3').value).toBe('2026-11-17');
    expect([s.getCell('B7').value, s.getCell('H7').value]).toEqual(['136512340003', 'L']);
    expect(await readAttendance(bytes, '2026-11-17')).toEqual({ '136512340001': 'P', '136512340003': 'L' });
  });

  it('a class record that changed after it was read is not overwritten (FILE_CHANGED)', async () => {
    const ws = await home();
    const before = await readFileBytes(ws.handle, RECORD);
    const baseHash = await sha256Hex(before);
    const changed = (await applyEdits(before, 'x.xlsx', [{ sheet: 'Class Record', cell: 'D9', value: 20 }])).bytes;
    ws.handle.saveVirtualFile(RECORD, changed); // e.g. scores sent from the phone meanwhile
    await expect(saveWorkingCopy(ws.handle, RECORD, before, 'application/octet-stream', new Date(), { baseHash })).rejects.toMatchObject({ code: 'FILE_CHANGED' });
    expect(Array.from(await readFileBytes(ws.handle, RECORD))).toEqual(Array.from(changed));
    // With the fingerprint of what is there now, it saves (in place, backup first).
    const ok = await saveWorkingCopy(ws.handle, RECORD, before, 'application/octet-stream', new Date(), { baseHash: await sha256Hex(changed) });
    expect(ok).toMatchObject({ path: RECORD, inPlace: true });
  });
});
