/**
 * Every ready-made routine, end to end, through the REAL engine and the REAL KaTuroDesk tools,
 * on realistic files (only the AI is stood in for, where a card really uses it).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Buffer } from 'node:buffer';
import jpeg from 'jpeg-js';
import * as XLSX from 'xlsx';
import { callGeminiProxy } from '../../../services/geminiConfig';
import { useDeskStore, workspaceIdOf } from '../../../store/deskStore';
import { useRoutineStore } from '../../../store/routineStore';
import { createVirtualWorkspace } from '../../../services/localFileSystem';
import { resetTaskActionSupport } from '../../../services/desk/agent/llm';
import { clearAnswerMemory } from '../../../services/desk/agent/deskAgent';
import { buildClassRecordWorkbook } from '../../../services/desk/generators/xlsxWriters';
import { WEIGHT_PRESETS } from '../../../services/desk/depedGrading';
import { fromTemplate, TEMPLATES } from '../../../services/desk/routines/templates';
import { answerRun, startRoutine } from './routineEngine';

vi.mock('../../../services/geminiConfig', () => ({ callGeminiProxy: vi.fn() }));

const sheet = (sheets) => {
  const wb = XLSX.utils.book_new();
  for (const [name, rows] of Object.entries(sheets)) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), name);
  return new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }));
};
const photo = (shade) => new Uint8Array(jpeg.encode({ data: Buffer.alloc(16 * 16 * 4, shade), width: 16, height: 16 }, 90).data);
const b64 = (u8) => Buffer.from(u8).toString('base64');
const flat = (tree) => tree.flatMap((e) => (e.children ? flat(e.children) : [e]));
const user = { uid: 'u1' };
const profile = { fullName: 'Ana Reyes', school: 'Rizal NHS' };

const LEARNERS = [
  { name: 'Dela Cruz, Juan P.', lrn: '136512340001', gender: 'M' },
  { name: 'Santos, Maria L.', lrn: '136512340003', gender: 'F' },
];
const RECORD = 'Records/Grade 7 - Rizal - Science.xlsx';
const PHOTOS = {
  'Lessons/Quiz 1/Photos/IMG_1.jpg': { img: photo(250), read: { name: 'Juan Dela Cruz', answers: { 1: 'A', 2: 'C', 3: 'B', 4: 'D', 5: 'A' } } },
  'Lessons/Quiz 1/Photos/IMG_2.jpg': { img: photo(200), read: { name: 'Maria Santos', answers: { 1: 'A', 2: 'B', 3: 'B', 4: 'D', 5: 'A' } } },
};

async function folder() {
  const ws = createVirtualWorkspace('KaTuro');
  ws.handle.katuroHome = true;
  const save = (p, b) => ws.handle.saveVirtualFile(p, b);
  save('Records/SF2 October.xlsx', sheet({ October: [
    ['School Form 2 (SF2) Daily Attendance Report of Learners'],
    ['Name of School', 'Rizal NHS', null, 'Month', 'October'],
    ["LEARNER'S NAME (Last Name, First Name, Middle Name)", 3, 4, 5, 6, 7, 10, 11, 'ABSENT', 'TARDY'],
    [null, 'M', 'T', 'W', 'TH', 'F', 'M', 'T'],
    ['Dela Cruz, Juan P.', null, 'x', 'x', 'x', null, null, null, 3, 0],
    ['Santos, Maria L.', null, null, null, null, null, null, null, 0, 0],
  ] }));
  save('Records/Attendance/SF2 September.xlsx', sheet({ September: [['Name', 'Days present', 'Days absent'], ['Dela Cruz, Juan P.', 18, 2], ['Santos, Maria L.', 20, 0]] }));
  save('Records/Attendance/SF2 October.xlsx', sheet({ October: [['Name', 'Days present', 'Days absent'], ['Dela Cruz, Juan P.', 17, 3], ['Santos, Maria L.', 19, 1]] }));
  const record = await buildClassRecordWorkbook({ meta: { subject: 'Science' }, weights: WEIGHT_PRESETS.scienceMath, hps: { ww: Array(10).fill(null), pt: Array(10).fill(null), qa: [null] }, learners: LEARNERS, withLrn: true });
  recordRows = await findRecordRows(record);
  save(RECORD, record);
  save('Lessons/Quiz 1 Answer Key.txt', '1. A 2. C 3. B 4. D 5. A');
  for (const [p, s] of Object.entries(PHOTOS)) save(p, s.img);
  save('Records/Quiz 1 items.xlsx', sheet({ Items: [['Name', '1', '2', '3', '4', '5'], ['Dela Cruz, Juan P.', 1, 1, 1, 0, 1], ['Santos, Maria L.', 1, 0, 1, 0, 0], ['Reyes, Ben', 0, 1, 1, 0, 1]] }));
  save('Records/Science scores.xlsx', sheet({ Scores: [
    ['Name', 'WW1', 'WW2', 'PT1', 'QA'],
    ['Highest Possible Score', 10, 10, 20, 40],
    ['Dela Cruz, Juan P.', 8, 9, 18, 35],
    ['Santos, Maria L.', 7, 10, 16, 30],
  ] }));
  save('Records/Reading/Phil-IRI pre-test.xlsx', sheet({ Results: [['Name', 'Miscues', 'Comprehension', 'Time'], ['Dela Cruz, Juan P.', 2, 6, '1:40'], ['Santos, Maria L.', 9, 5, '2:30']] }));
  save('Records/Section records/Science 5.xlsx', sheet({ SUMMARY: [
    ['SUMMARY OF GRADES'], ['Learning Area: Science', null, null, 'Grade & Section: 5 - Rizal'],
    ['No.', "LEARNER'S NAME", 'LRN', 'TERM', null, null], [null, null, null, 1, 2, 3],
    [1, 'DELA CRUZ, JUAN P.', '136512340001', 85, 87, 90], [2, 'SANTOS, MARIA L.', '136512340003', 92, 94, 95],
  ] }));
  save('Records/Section records/Math 5.xlsx', sheet({ Sheet1: [['Name of Learners', 'Term 1', 'Term 2', 'Term 3'], ['Dela Cruz, Juan P.', 80, 82, 81], ['Santos, Maria L.', 95, 96, 97]] }));
  ws.files = ws.handle.getFiles();
  return ws;
}

/** Where the learners are in KaTuro's own E-Class Record (as the AI recognizes its layout). */
let recordRows = { firstRow: 1, lastRow: 1 };
async function findRecordRows(bytes) {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(Buffer.from(bytes));
  const rows = [];
  wb.getWorksheet('Class Record').eachRow((row, n) => { if (/^\d{12}$/.test(String(row.getCell(2).value))) rows.push(n); });
  return { firstRow: Math.min(...rows), lastRow: Math.max(...rows) };
}

/** The pretend AI: reads the photos and the record's layout; short remarks / documents for the tools that write words. */
function fakeAI() {
  callGeminiProxy.mockImplementation(async (req) => {
    const text = JSON.stringify(req.contents);
    const shot = Object.values(PHOTOS).find((s) => text.includes(b64(s.img)));
    if (shot) return { text: JSON.stringify(shot.read) };
    if (/nameColumn/.test(text)) {
      return { text: JSON.stringify({ docType: 'class_record', title: 'Class record', confidence: 0.9, fields: [], tables: [{ id: 't', purpose: 'class_record', location: { sheet: 'Class Record', ...recordRows }, nameColumn: 'C', columns: [{ key: 'lrn', column: 'B', header: 'LRN', meaning: 'lrn' }, { key: 'name', column: 'C', header: "Learner's Name", meaning: 'learner_name' }] }] }) };
    }
    if (/Daily Lesson Log|DLL/.test(text)) {
      return { text: JSON.stringify({ title: 'Daily Lesson Log – Science 7', blocks: [{ type: 'heading', level: 1, text: 'Daily Lesson Log' }, { type: 'paragraph', text: 'Objectives: identify mixtures.' }] }) };
    }
    return { text: JSON.stringify({ remarks: ['Reteach item 4.'], interventions: ['Small-group review.'], title: 'Remedial', blocks: [{ type: 'paragraph', text: 'Remedial activity.' }] }) };
  });
}

let ws;
beforeEach(async () => {
  resetTaskActionSupport();
  clearAnswerMemory();
  callGeminiProxy.mockReset();
  fakeAI();
  ws = await folder();
  useDeskStore.setState({ workspace: ws, isGenerating: false, messages: [], artifacts: [] });
  useRoutineStore.setState({ routines: [], meta: {}, runs: [] });
});

/** A ready-made routine with the teacher's choices, saved and run (approved when it asks). */
async function runTemplate(id, choices, trigger) {
  const r = fromTemplate(id);
  for (const c of r.cards) Object.assign(c.settings, choices[c.type] || {});
  const { routine, problems } = useRoutineStore.getState().saveRoutine(r, { workspaceId: workspaceIdOf(ws), workspaceName: ws.name });
  expect(problems.map((p) => p.text)).toEqual([]);
  let run = await startRoutine(routine.id, { user, profile, ...(trigger ? { trigger } : {}) });
  let asked = 0;
  while (run?.status === 'waiting' && asked < 3) {
    asked += 1;
    run = await answerRun(run.id, true, { user, profile });
  }
  const lines = run.routine.cards.map((c) => `${c.type}: ${run.steps[c.id]?.status} — ${run.steps[c.id]?.summary || ''}`);
  return { run, lines, asked };
}

const madeFiles = (run) => Object.values(run.steps).flatMap((s) => s.files || []);

describe('every ready-made routine works end to end', () => {
  it('Friday attendance wrap-up: SF2 → notices', async () => {
    const { run, lines } = await runTemplate('friday-attendance', { 'get.sheet': { path: 'Records/SF2 October.xlsx' } });
    expect(run.status, lines.join('\n')).toBe('done');
    expect(madeFiles(run).some((p) => /Home_Visitation_Notices.*\.docx$/.test(p))).toBe(true);
  });

  it('New answer-sheet photos → check with the key → Ask me first → typed into the class record', async () => {
    const { run, lines, asked } = await runTemplate('answer-sheet-photos', {
      'when.newFiles': { folder: 'Lessons/Quiz 1/Photos' },
      'do.checkPapers': { answerKeyPath: 'Lessons/Quiz 1 Answer Key.txt', listPath: RECORD, title: 'Science Quiz 1' },
      'do.typeScores': { targetPath: RECORD, targetColumn: 'WW 1' },
    }, { kind: 'newFiles', files: Object.keys(PHOTOS) });
    expect(asked).toBe(1);
    expect(run.status, lines.join('\n')).toBe('done');
    // The scores are really in the class record now (a backup was made first).
    const ExcelJS = (await import('exceljs')).default;
    const { readFileBytes } = await import('../../../services/localFileSystem');
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(Buffer.from(await readFileBytes(ws.handle, RECORD)));
    const sheetCR = wb.getWorksheet('Class Record');
    let col = 0;
    sheetCR.eachRow((row) => row.eachCell((cell, c) => { if (String(cell.value).trim() === 'WW 1') col = c; }));
    const got = {};
    sheetCR.eachRow((row) => { if (/^\d{12}$/.test(String(row.getCell(2).value))) got[row.getCell(3).value] = row.getCell(col).value; });
    expect(got, `${lines.join(' | ')} || files: ${madeFiles(run).join(', ')}`).toEqual({ 'Dela Cruz, Juan P.': 5, 'Santos, Maria L.': 4 });
    expect(flat(ws.handle.getFiles()).some((f) => f.path.startsWith('KaTuro Backups/') && /Grade 7 - Rizal - Science/.test(f.path))).toBe(true);
  });

  it('a paper from someone not in the class record: the others are typed, it STOPS and names who is missing (never "done")', async () => {
    const stranger = photo(120);
    ws.handle.saveVirtualFile('Lessons/Quiz 1/Photos/IMG_3.jpg', stranger);
    ws.files = ws.handle.getFiles();
    useDeskStore.setState({ workspace: ws });
    PHOTOS['Lessons/Quiz 1/Photos/IMG_3.jpg'] = { img: stranger, read: { name: 'Pedro Penduko', answers: { 1: 'A', 2: 'A', 3: 'A', 4: 'A', 5: 'A' } } };
    try {
      const { run } = await runTemplate('answer-sheet-photos', {
        'when.newFiles': { folder: 'Lessons/Quiz 1/Photos' },
        'do.checkPapers': { answerKeyPath: 'Lessons/Quiz 1 Answer Key.txt' },
        'do.typeScores': { targetPath: RECORD, targetColumn: 'WW 1' },
      }, { kind: 'newFiles', files: Object.keys(PHOTOS) });
      expect(run.status).toBe('error');
      const step = Object.entries(run.steps).find(([id]) => run.routine.cards.find((c) => c.id === id).type === 'do.typeScores')[1];
      expect(step.status).toBe('needs_info');
      expect(step.summary.startsWith('2 score(s) typed; 1 name(s) not found in your class record: Pedro Penduko. Check that the names match')).toBe(true);
    } finally {
      delete PHOTOS['Lessons/Quiz 1/Photos/IMG_3.jpg'];
    }
  });

  it('End of term: score sheet → grades (DO 8) → check for mistakes', async () => {
    const { run, lines } = await runTemplate('end-of-term', { 'get.sheet': { path: 'Records/Science scores.xlsx' }, 'do.classGrades': { subject: 'Science', gradeSection: 'Grade 7 - Rizal' } });
    expect(run.status, lines.join('\n')).toBe('done');
  });

  it('Adviser: section class records → SF9 → submission pack', async () => {
    const { run, lines } = await runTemplate('adviser-sf9', { 'get.folder': { folder: 'Records/Section records' }, 'do.reportCards': { grade: '5', section: 'Rizal' } });
    expect(run.status, lines.join('\n')).toBe('done');
    expect(madeFiles(run).some((p) => /\.pdf$/.test(p))).toBe(true);
  });

  it('Phil-IRI reading levels', async () => {
    const { run, lines } = await runTemplate('phil-iri', { 'get.sheet': { path: 'Records/Reading/Phil-IRI pre-test.xlsx' }, 'do.reading': { passageWords: 150, questions: 7 } });
    expect(run.status, lines.join('\n')).toBe('done');
  });

  it('Item analysis + remedial slips', async () => {
    const { run, lines } = await runTemplate('item-analysis', { 'get.sheet': { path: 'Records/Quiz 1 items.xlsx' } });
    expect(run.status, lines.join('\n')).toBe('done');
  });

  it('Month-end attendance summary: folder → one Excel → submission pack', async () => {
    const { run, lines } = await runTemplate('month-end-sf2', { 'get.folder': { folder: 'Records/Attendance' } });
    expect(run.status, lines.join('\n')).toBe('done');
    expect(madeFiles(run).some((p) => /\.pdf$/.test(p))).toBe(true);
  });

  it('Friday DLL draft', async () => {
    const { run, lines } = await runTemplate('weekly-dll', { 'do.dll': { subject: 'Science', gradeLevel: 'Grade 7', topic: 'Mixtures and their components' } });
    expect(run.status, lines.join('\n')).toBe('done');
    expect(madeFiles(run).some((p) => /\.docx$/.test(p))).toBe(true);
  });

  it('covers every ready-made routine', () => {
    expect(TEMPLATES.map((t) => t.id).sort()).toEqual(['adviser-sf9', 'answer-sheet-photos', 'end-of-term', 'friday-attendance', 'item-analysis', 'month-end-sf2', 'phil-iri', 'weekly-dll']);
  });
});
