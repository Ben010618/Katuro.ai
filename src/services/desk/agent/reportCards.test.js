import { describe, it, expect, vi, beforeEach } from 'vitest';
import ExcelJS from 'exceljs';
import * as XLSX from 'xlsx';
import { Document, Packer, Paragraph, Table, TableRow, TableCell, TextRun } from 'docx';
import { callGeminiProxy } from '../../geminiConfig';
import { runDeskAgentTurn, clearAnswerMemory, plannerKnowledge } from './deskAgent';
import { resetTaskActionSupport } from './llm';
import { createVirtualWorkspace, readFileBytes } from '../../localFileSystem';
import { parseTermLabel, nameKey } from './reportCards';
import {
  finalGrade, compositeFinalGrade, generalAverage, descriptorFor, remarksFor, promotionFor,
  academicExcellenceByGrades, gradingModeFor, matchLearningArea, keyStage, roundGrade,
} from '../knowledge/gradingRules';
import { formsFor, formKnowledgeFor, talksAboutGrades } from '../knowledge/schoolForms';

vi.mock('../../geminiConfig', () => ({ callGeminiProxy: vi.fn() }));

describe('grading rules (DepEd Order No. 15, s. 2026)', () => {
  it('Final Grade = average of the three terms, rounded to the nearest whole number (para. 52)', () => {
    expect(finalGrade([85, 87, 90])).toBe(87); // 87.33
    expect(finalGrade([84, 85, 85])).toBe(85); // 84.67
    expect(finalGrade([84, 84, 85.5])).toBe(85); // 84.5 → halves round up
    expect(finalGrade([74, 75, 76])).toBe(75);
    expect(finalGrade([80, 82])).toBeNull(); // Term 3 not yet recorded
    expect(finalGrade([80, 'INC', 82])).toBeNull();
    expect(roundGrade(89.5)).toBe(90);
  });

  it('MAPEH = average of its components; passed even if one component failed (Annex D para. 20)', () => {
    expect(compositeFinalGrade([70, 80])).toBe(75);
    expect(remarksFor(compositeFinalGrade([70, 80]))).toBe('Passed');
    expect(compositeFinalGrade([70, null])).toBeNull();
  });

  it('General Average over all Final Grades, whole number (para. 53)', () => {
    expect(generalAverage([91, 81, 87, 89])).toBe(87);
    expect(generalAverage([91, null])).toBeNull();
  });

  it('descriptors and remarks at every boundary (Table 11)', () => {
    expect([100, 90, 89, 80, 79, 75, 74, 65, 64, 0].map((g) => descriptorFor(g).descriptor)).toEqual([
      'Advancing', 'Advancing', 'Benchmarking', 'Benchmarking', 'Connecting', 'Connecting', 'Developing', 'Developing', 'Emerging', 'Emerging',
    ]);
    expect(remarksFor(75)).toBe('Passed');
    expect(remarksFor(74)).toBe('Failed');
    expect(descriptorFor(90).filipino).toBe('Namumukod-tangi');
  });

  it('promotion (para. 67) and Academic Excellence by grades (para. 75)', () => {
    expect(promotionFor([80, 90, 75])).toBe('Promoted');
    expect(promotionFor([74, 90, 80])).toBe('Summer Remedial Class');
    expect(promotionFor([74, 70, 80])).toBe('Summer Remedial Class');
    expect(promotionFor([74, 70, 60, 80])).toBe('Retained');
    expect(academicExcellenceByGrades(92, [95, 90, 80])).toBe(true);
    expect(academicExcellenceByGrades(92, [99, 99, 79])).toBe(false); // an FG below 80
    expect(academicExcellenceByGrades(89, [89, 89])).toBe(false);
  });

  it('who is graded how in each school year (Table 12)', () => {
    expect(gradingModeFor('2026-2027', 'Kindergarten').mode).toBe('descriptive');
    expect(gradingModeFor('2026-2027', 'Grade One').mode).toBe('descriptive');
    expect(gradingModeFor('2026-2027', 'Grade 2').mode).toBe('numerical');
    expect(gradingModeFor('2026-2027', '3').mode).toBe('numerical');
    expect(gradingModeFor('2026-2027', 'Grade 7')).toMatchObject({ mode: 'numerical', terms: 3, report: "Learner's Performance Report (SF9)" });
    expect(gradingModeFor('2027-2028', 'Grade 2').mode).toBe('descriptive');
    expect(gradingModeFor('2027-2028', 'Grade 3').mode).toBe('numerical');
    expect(gradingModeFor('2028-2029', 'Grade 3').mode).toBe('descriptive');
    expect(gradingModeFor('2025-2026', 'Grade 5').terms).toBe(4); // before the three-term calendar
    expect([keyStage('K'), keyStage(3), keyStage(4), keyStage(10), keyStage(12)]).toEqual([1, 1, 2, 3, 4]);
  });

  it('recognises learning areas the way teachers write them', () => {
    const key = (s) => matchLearningArea(s)?.key || null;
    expect(key('Science 5 - Rizal')).toBe('science');
    expect(key('Grade 5 Mathematics')).toBe('mathematics');
    expect(key('AP')).toBe('ap');
    expect(key('Araling Panlipunan')).toBe('ap');
    expect(key('EsP 7')).toBe('gmrc');
    expect(key('MAPEH – Music and Arts')).toBe('music_arts');
    expect(key('P.E. and Health')).toBe('pe_health');
    expect(key('MAPEH')).toBe('mapeh');
    expect(key('Makabansa')).toBe('makabansa');
    expect(key('Apelyido')).toBeNull();
    expect(key('Name of Learners')).toBeNull();
  });

  it('reads term headers in every common form; quarters are recognised as the old system', () => {
    expect(['TERM 1', '1st Term', 'Second Term', 'Trimester 3', 'T2', 'Term-3'].map(parseTermLabel)).toEqual([1, 1, 2, 3, 2, 3]);
    expect(parseTermLabel('FINAL GRADE')).toBe('final');
    expect(parseTermLabel('Q1')).toBe('quarter');
    expect(parseTermLabel('REMARKS')).toBeNull();
    expect(nameKey('DELA CRUZ, JUAN A.')).toBe(nameKey('Juan Dela Cruz'));
  });
});

describe('teacher knowledge: understanding what the teacher means', () => {
  it('"consolidate all the grades" means the report cards (SF9)', () => {
    expect(formsFor('consolidate all of the grades').map((f) => f.id)).toEqual(['sf9', 'class_record']);
    expect(formsFor('pakigawa ng card ng mga bata').map((f) => f.id)).toContain('sf9');
    expect(formsFor('I need the SF2 for June').map((f) => f.id)).toEqual(['sf2']);
    expect(formsFor('Form 137 of my learners').map((f) => f.id)).toEqual(['sf10']);
    expect(formsFor('make a quiz about El Nino')).toEqual([]);
  });

  const OFF_CAL = new Date('2030-01-01T12:00:00+08:00'); // outside any known calendar: no date line
  it('the planner gets only what is relevant (a few hundred words, not everything)', () => {
    const k = plannerKnowledge('consolidate all the grades for the cards', [], '2026-2027', OFF_CAL);
    expect(k).toMatch(/Learner's Progress Report Card \(SF9\)/);
    expect(k).toMatch(/build_report_cards/);
    expect(k).toMatch(/average of the three Term Grades/);
    expect(k).toMatch(/Kindergarten and Grade 1 are DESCRIPTIVE/);
    expect(k.length).toBeLessThan(3500);
    expect(plannerKnowledge('make a quiz about El Nino', [], '2026-2027', OFF_CAL)).toBe('');
    // A short follow-up keeps the topic.
    expect(plannerKnowledge('Grade 5 Rizal po', [{ role: 'user', content: 'consolidate the grades' }], '2026-2027')).toMatch(/SF9/);
    expect(formKnowledgeFor('can you do the SF4?')).toBe('');
    expect(formKnowledgeFor('can you do the SF4 and SF2?')).toMatch(/SF4 .* not teacher forms/);
    expect(talksAboutGrades('what is the general average?')).toBe(true);
  });
});

// ── End to end: a section's class records → report cards + summary ─────────────
const sheetBytes = (sheets) => {
  const wb = XLSX.utils.book_new();
  for (const [name, rows] of sheets) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), name);
  return new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }));
};

const science = () => sheetBytes([['SUMMARY', [
  ['Calauan Science High School'], // a school name: must not be taken as the subject
  ['SUMMARY OF GRADES'],
  ['Learning Area: Science', null, null, 'Grade & Section: 5 - Rizal'],
  ['No.', "LEARNER'S NAME", 'LRN', 'TERM', null, null, 'FINAL GRADE', 'REMARKS'],
  [null, null, null, 1, 2, 3, null, null],
  ['MALE'],
  [1, 'DELA CRUZ, JUAN A.', '123456789123', 85, 87, 90],
  [2, 'SANTOS, PEDRO', '123456789124', 74, 75, 76],
  ['FEMALE'],
  [3, 'REYES, MARIA', '123456789125', 92, 94, 95],
]]]);

const math = () => sheetBytes([['Sheet1', [
  ['Name of Learners', 'Term 1', 'Term 2', 'Term 3'],
  ['Dela Cruz, Juan', 80, 82, 81],
  ['Santos, Pedro', 70, 72, 71],
  ['Reyes, Maria', 95, 96, null], // Term 3 not recorded yet
]]]);

const mapeh = () => sheetBytes([['Grades', [
  ['Learner', 'Music and Arts', null, null, 'PE and Health', null, null],
  [null, 1, 2, 3, 1, 2, 3],
  ['DELA CRUZ, JUAN', 88, 88, 88, 90, 90, 91],
  ['SANTOS, PEDRO', 70, 70, 70, 80, 80, 80],
  ['REYES, MARIAH', 90, 90, 90, 92, 92, 92], // spelled differently
]]]);

const oldQuarters = () => sheetBytes([['AP', [['Name', 'Q1', 'Q2', 'Q3', 'Q4'], ['Dela Cruz, Juan', 80, 80, 80, 80]]]]);

async function englishDocx() {
  const row = (cells) => new TableRow({ children: cells.map((t) => new TableCell({ children: [new Paragraph({ children: [new TextRun(String(t))] })] })) });
  const doc = new Document({ sections: [{ children: [
    new Paragraph('English 5 – Rizal'),
    new Table({ rows: [['Name', 'Term 1', 'Term 2', 'Term 3'], ['Dela Cruz, Juan', 90, 91, 92], ['Santos, Pedro', 75, 75, 75], ['Reyes, Maria', 89, 90, 90]].map(row) }),
  ] }] });
  return new Uint8Array(await Packer.toArrayBuffer(doc));
}

describe('end to end: "consolidate all the grades for the report cards"', () => {
  beforeEach(() => {
    resetTaskActionSupport();
    clearAnswerMemory();
    callGeminiProxy.mockReset();
  });

  const setup = async () => {
    const ws = createVirtualWorkspace('Grade 5 Rizal');
    ws.handle.saveVirtualFile('Grade 5/Science 5 - Rizal.xlsx', science());
    ws.handle.saveVirtualFile('Grade 5/Mathematics 5 Rizal.xlsx', math());
    ws.handle.saveVirtualFile('Grade 5/MAPEH 5 Rizal.xlsx', mapeh());
    ws.handle.saveVirtualFile('Grade 5/English 5 Rizal.docx', await englishDocx());
    ws.handle.saveVirtualFile('Grade 5/AP old quarters.xlsx', oldQuarters());
    ws.files = ws.handle.getFiles();
    return ws;
  };
  const paths = ['Grade 5/Science 5 - Rizal.xlsx', 'Grade 5/Mathematics 5 Rizal.xlsx', 'Grade 5/MAPEH 5 Rizal.xlsx', 'Grade 5/English 5 Rizal.docx', 'Grade 5/AP old quarters.xlsx'];

  it('computes every grade in code, flags what to check, and sends no learner data to the AI', async () => {
    const ws = await setup();
    const aiTexts = [];
    callGeminiProxy.mockImplementation(async (req) => {
      const text = JSON.stringify(req.contents) + JSON.stringify(req.systemInstruction || '');
      aiTexts.push(text);
      return { text: JSON.stringify({ reply: 'Preparing the report cards.', tasks: [{ id: 't1', tool: 'build_report_cards', args: { sourcePaths: paths } }] }) };
    });
    const res = await runDeskAgentTurn({
      prompt: 'Consolidate all the grades of my advisory class for the report cards',
      workspace: ws, attachedPaths: paths, user: { uid: 'u1' },
      profile: { fullName: 'Ana Reyes', school: 'Dayap Elementary School', division: 'Laguna', region: 'IV-A' },
    });

    // One AI call (the planner), and it never saw a learner's name or grade.
    expect(aiTexts).toHaveLength(1);
    expect(aiTexts[0]).toMatch(/Grading rules for SY/); // the planner got the DepEd knowledge
    for (const n of ['DELA CRUZ', 'Dela Cruz', 'SANTOS', 'Santos, Pedro', 'REYES, MARIA', 'Reyes, Maria', '123456789']) expect(aiTexts[0]).not.toContain(n);

    expect(res.content).toMatch(/Prepared report cards for \*\*3 learner\(s\)\*\*/);
    expect(res.content).toMatch(/item\(s\) to check/);
    expect(res.content).toMatch(/nothing was estimated by AI/);
    const xlsx = res.createdFiles.find((f) => f.format === 'xlsx');
    const docx = res.createdFiles.find((f) => f.format === 'docx');
    expect(xlsx.name).toMatch(/^Summary_of_Grades_Grade5_Rizal/);
    expect(docx.name).toMatch(/^Report_Cards_Grade5_Rizal/);

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await readFileBytes(ws.handle, xlsx.path));
    const values = (name) => wb.getWorksheet(name).getSheetValues().slice(1).map((r) => (r || []).slice(1));
    const finals = values('Final Grades');
    expect(finals[0]).toEqual(['No.', 'Learner', 'LRN', 'Sex', 'English', 'Mathematics', 'Science', 'MAPEH', 'General Average', 'Descriptor', 'Promotion', 'Academic Excellence (by grades)']);
    // Males first, then females (alphabetical); names as written in the first file.
    expect(finals[1]).toEqual([1, 'DELA CRUZ, JUAN A.', '123456789123', 'Male', 91, 81, 87, 89, 87, 'Benchmarking', 'Promoted', '']);
    // Mathematics 71 failed → Summer Remedial Class; MAPEH 75 (70 and 80) passes; GA 74.
    expect(finals[2]).toEqual([2, 'SANTOS, PEDRO', '123456789124', 'Male', 75, 71, 75, 75, 74, 'Developing', 'Summer Remedial Class', '']);
    // Mathematics Term 3 missing → no Final Grade and no General Average yet.
    expect(finals[3].slice(0, 8)).toEqual([3, 'REYES, MARIA', '123456789125', 'Female', 90, undefined, 94, 91]);

    const checks = values('Checks').map((r) => r.join(' | '));
    expect(checks.some((c) => /Missing grades \| REYES, MARIA: no Mathematics grade for Term 3/.test(c))).toBe(true);
    expect(checks.some((c) => /Name spelling \| "REYES, MARIAH" .* matched to "REYES, MARIA"/.test(c))).toBe(true);
    expect(checks.some((c) => /quarterly grades \(Q1–Q4\)/.test(c))).toBe(true);
    expect(values('Basis').some((r) => /para\. 52/.test(r[1]))).toBe(true);

    // The report cards: one page per learner, with the computed rows.
    const card = res.artifacts.find((a) => a.type === 'document').spec;
    expect(card.blocks.filter((b) => b.type === 'pageBreak')).toHaveLength(2);
    const juan = card.blocks.find((b) => b.type === 'table' && b.columns[0] === 'Learning Areas');
    expect(juan.rows.map((r) => r[0].trim())).toEqual(['English', 'Mathematics', 'Science', 'MAPEH', 'Music and Arts', 'Physical Education and Health', 'General Average']);
    expect(juan.rows[2]).toEqual(['Science', '85', '87', '90', '87', 'Passed']);
    expect(juan.rows[3]).toEqual(['MAPEH', '', '', '', '89', 'Passed']);
    expect(juan.rows[6]).toEqual(['General Average', '', '', '', '87', 'Passed']);
    expect(card.blocks.some((b) => b.type === 'paragraph' && /Dayap Elementary School/.test(b.text))).toBe(true);
  });

  it('Grade 1 in SY 2026–2027 is descriptive: asks instead of printing numbers', async () => {
    const ws = await setup();
    callGeminiProxy.mockImplementation(async () => ({ text: JSON.stringify({ reply: 'OK.', tasks: [{ id: 't1', tool: 'build_report_cards', args: { sourcePaths: paths, grade: 'Grade 1' } }] }) }));
    const realNow = Date;
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new realNow('2026-10-07T08:00:00+08:00'));
    try {
      const res = await runDeskAgentTurn({ prompt: 'make the report cards', workspace: ws, attachedPaths: paths, user: { uid: 'u1' } });
      expect(res.content).toMatch(/Needs your input.*Grade 1 uses the descriptive Learner's Progress Report \(SF9\), with no numerical grades/);
      expect(res.createdFiles).toHaveLength(0);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('official form layouts (from the reference files)', () => {
  it('SF1: the planner sees the real columns and Remarks codes when SF1 comes up', () => {
    const k = formKnowledgeFor('update my SF1 masterlist');
    expect(k).toMatch(/Legal \(8\.5" × 14"\), landscape/);
    expect(k).toMatch(/Age as of 1st Friday of June/);
    expect(k).toMatch(/T\/O = Transferred Out/);
    expect(k).toMatch(/LE = Late Enrollment \(Reason \(enrollment beyond 1st Friday of June\)\)/);
    expect(formKnowledgeFor('make a quiz')).toBe('');
  });
});

describe('report cards use the teacher profile, not guesses', () => {
  beforeEach(() => {
    resetTaskActionSupport();
    clearAnswerMemory();
    callGeminiProxy.mockReset();
  });

  it('files without a grade: the profile "Advisory class" supplies it; without it, KaTuro asks', async () => {
    const ws = createVirtualWorkspace('G5');
    ws.handle.saveVirtualFile('Grade 5/Mathematics.xlsx', math());
    ws.files = ws.handle.getFiles();
    callGeminiProxy.mockImplementation(async () => ({ text: JSON.stringify({ reply: 'OK.', tasks: [{ id: 't1', tool: 'build_report_cards', args: { sourcePaths: ['Grade 5/Mathematics.xlsx'] } }] }) }));
    const asked = await runDeskAgentTurn({ prompt: 'report cards', workspace: ws, attachedPaths: ['Grade 5/Mathematics.xlsx'], user: { uid: 'u1' }, profile: { fullName: 'Ana Reyes' } });
    expect(asked.content).toMatch(/Needs your input.*Which grade level is this class\?/);
    clearAnswerMemory();
    const done = await runDeskAgentTurn({ prompt: 'report cards', workspace: ws, attachedPaths: ['Grade 5/Mathematics.xlsx'], user: { uid: 'u1' }, profile: { fullName: 'Ana Reyes', advisoryClass: 'Grade 5 – Rizal' } });
    expect(done.content).toMatch(/Prepared report cards for \*\*3 learner\(s\)\*\*/);
    expect(done.createdFiles.find((f) => f.format === 'xlsx').name).toMatch(/Grade5_Rizal/);
  });
});
