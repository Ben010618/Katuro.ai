/* global Buffer */
import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import mammoth from 'mammoth';
import ExcelJS from 'exceljs';
import { PDFDocument } from 'pdf-lib';
import { Document, Packer, Paragraph, TextRun, Header } from 'docx';
import { normalizeDocumentSpec } from '../docSpec.js';
import { analyzeItems, computeQuarterlyGrade, WEIGHT_PRESETS } from '../depedGrading.js';
import { buildDocx } from './docxFromSpec.js';
import { buildHtml, specToHtmlBody, escapeHtml } from './htmlFromSpec.js';
import { buildPdf } from './pdfFromSpec.js';
import { buildPptx } from './pptxFromSpec.js';
import { buildSheetWorkbook, buildItemAnalysisWorkbook, buildClassRecordWorkbook, transmutationTableAscending } from './xlsxWriters.js';
import {
  fillDocxTemplate, listDocxPlaceholders, normalizeLearnerName, matchLearnerName, writeScoresIntoWorkbook, findWorkbookColumns,
} from './fillTemplates.js';
import { mergePdfs, splitPdf, imagesToPdf, getPdfPageCount } from './pdfTools.js';
import { itemAnalysisReportSpec, remedialSlipsSpec, homeVisitationNoticeSpec, classRecordSummarySpec } from './depedTemplates.js';

const ascii = (u8, n) => String.fromCharCode(...u8.slice(0, n));
const docText = async (bytes) => (await mammoth.extractRawText({ buffer: Buffer.from(bytes) })).value;
const loadWb = async (bytes) => {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(Buffer.from(bytes));
  return wb;
};

const sampleSpec = {
  title: 'Summative Test in Science 7',
  subtitle: 'Quarter 1',
  header: { region: 'Region IV-A CALABARZON', division: 'Division of Batangas', school: 'Sample National High School' },
  meta: [{ label: 'Learning Area', value: 'Science' }, { label: 'Grade', value: '7' }, { label: 'Quarter', value: '1' }],
  blocks: [
    { type: 'heading', level: 1, text: 'Test I. Multiple Choice' },
    { type: 'paragraph', text: 'Read each item **carefully**.' },
    { type: 'bullets', items: ['Use a pencil', 'No erasures'] },
    { type: 'bullets', ordered: true, items: ['First', 'Second'] },
    { type: 'table', columns: ['Topic', 'Items'], rows: [['Mixtures', '5'], ['Solutions', '5']], widths: [3, 1] },
    {
      type: 'questions',
      showAnswers: true,
      items: [
        { question: 'Which is a homogeneous mixture?', choices: ['Halo-halo', 'Saltwater', 'Sand and water', 'Oil and water'], answer: 'B' },
        { question: 'What is the universal solvent?', choices: ['Oil', 'Alcohol', 'Water', 'Vinegar'], answer: 'Water' },
      ],
    },
    { type: 'answerLines', count: 2 },
    { type: 'cutLine' },
    { type: 'pageBreak' },
    { type: 'paragraph', text: 'Second page. Señor Niño — "quotes"' },
  ],
  signatures: [{ label: 'Prepared by:', name: 'Ana Reyes', role: 'Teacher III' }, { label: 'Noted by:', name: 'Jose Cruz', role: 'Principal I' }],
};

describe('buildDocx', () => {
  it('renders a valid docx with title, table, questions and answer key', async () => {
    const bytes = await buildDocx(sampleSpec);
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(ascii(bytes, 2)).toBe('PK');
    const text = await docText(bytes);
    expect(text).toContain('Summative Test in Science 7');
    expect(text).toContain('Department of Education');
    expect(text).toContain('SAMPLE NATIONAL HIGH SCHOOL');
    expect(text).toContain('Mixtures');
    expect(text).toContain('Which is a homogeneous mixture?');
    expect(text).toContain('B. Saltwater');
    expect(text).toContain('Answer Key');
    expect(text).toMatch(/1\. B/);
    expect(text).toMatch(/2\. C/);
    expect(text).toContain('ANA REYES');
    const xml = await (await JSZip.loadAsync(bytes)).file('word/document.xml').async('string');
    expect(xml).toContain('w:w="12240"');
    expect(xml).toContain('w:h="18720"');
    expect(xml).toContain('w:tblHeader');
  });

  it('omits the answer key without showAnswers and supports landscape', async () => {
    const spec = { ...sampleSpec, orientation: 'landscape', blocks: sampleSpec.blocks.map((b) => (b.type === 'questions' ? { ...b, showAnswers: false } : b)) };
    const bytes = await buildDocx(spec);
    const text = await docText(bytes);
    expect(text).not.toContain('Answer Key');
    const xml = await (await JSZip.loadAsync(bytes)).file('word/document.xml').async('string');
    expect(xml).toMatch(/w:w="18720"/);
    expect(xml).toMatch(/w:orient="landscape"/);
  });

  it('handles an empty spec', async () => {
    const bytes = await buildDocx({});
    expect(ascii(bytes, 2)).toBe('PK');
  });
});

describe('buildHtml', () => {
  it('escapes content and includes page size', () => {
    const html = buildHtml({ title: '<script>alert(1)</script>', blocks: [{ type: 'paragraph', text: 'a <b>x</b> & **bold**' }, { type: 'cutLine' }, { type: 'pageBreak' }] });
    expect(html).toMatch(/^<!doctype html>/);
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('<strong>bold</strong>');
    expect(html).toContain('@page { size: 8.5in 13in');
    expect(html).toContain('class="cut-line"');
    expect(html).toContain('class="page-break"');
    expect(buildHtml({ title: 'x', paper: 'a4', orientation: 'landscape' }, { forPrint: true })).toContain('size: 11.69in 8.27in');
  });

  it('body mirrors the docx structure', () => {
    const body = specToHtmlBody(sampleSpec);
    expect(body).toContain('Republic of the Philippines');
    expect(body).toContain('<thead>');
    expect(body).toContain('Answer Key');
    expect(body).toContain('B. Saltwater');
    expect(escapeHtml(`"'&`)).toBe('&quot;&#39;&amp;');
  });
});

describe('buildPdf', () => {
  it('produces a multi-page PDF', async () => {
    const bytes = await buildPdf(sampleSpec);
    expect(ascii(bytes, 4)).toBe('%PDF');
    expect(await getPdfPageCount(bytes)).toBeGreaterThanOrEqual(3);
    const land = await buildPdf({ title: 'Wide', orientation: 'landscape' });
    const doc = await PDFDocument.load(land);
    const { width, height } = doc.getPage(0).getSize();
    expect(Math.round(width)).toBe(936);
    expect(Math.round(height)).toBe(612);
  });
});

describe('buildPptx', () => {
  it('creates slides with notes and continuation slides', async () => {
    const bytes = await buildPptx({
      title: 'Photosynthesis',
      subtitle: 'Science 7',
      slides: [
        { title: 'Objectives', bullets: ['A', 'B', 'C'], notes: 'Say hello to the class' },
        { title: 'Many points', bullets: Array.from({ length: 9 }, (_, i) => `Point ${i + 1}`) },
        { title: 'Compare', layout: 'twoColumn', left: ['Plants'], right: ['Animals'] },
      ],
    });
    expect(ascii(bytes, 2)).toBe('PK');
    const zip = await JSZip.loadAsync(bytes);
    expect(zip.file('ppt/slides/slide2.xml')).toBeTruthy();
    expect(zip.file('ppt/slides/slide5.xml')).toBeTruthy(); // title + 1 + 2 (continued) + 1
    const notes = await Promise.all(Object.keys(zip.files).filter((f) => /notesSlides\/notesSlide\d+\.xml$/.test(f)).map((f) => zip.file(f).async('string')));
    expect(notes.join('')).toContain('Say hello to the class');
    expect(await zip.file('ppt/slides/slide4.xml').async('string')).toContain('(cont.)');
  });
});

describe('xlsx writers', () => {
  it('buildSheetWorkbook round-trips', async () => {
    const bytes = await buildSheetWorkbook({ title: 'T', sheets: [{ name: 'Scores', columns: ['Name', { header: 'Score', width: 12 }], rows: [['Juan', 18], ['Maria', null]] }] });
    const wb = await loadWb(bytes);
    const ws = wb.getWorksheet('Scores');
    expect(ws.getCell('A1').value).toBe('Name');
    expect(ws.getCell('A1').font.bold).toBe(true);
    expect(ws.getCell('B2').value).toBe(18);
    expect(typeof ws.getCell('B2').value).toBe('number');
    expect(ws.views[0].ySplit).toBe(1);
  });

  it('buildClassRecordWorkbook writes live formulas with correct cached results', async () => {
    const weights = WEIGHT_PRESETS.scienceMath;
    const hps = { ww: [20, 20], pt: [50], qa: [50] };
    const learners = [
      { name: 'Santos, Maria', gender: 'F', ww: { scores: [20, 19] }, pt: { scores: [45] }, qa: { scores: [40] } },
      { name: 'Dela Cruz, Juan', gender: 'M', ww: { scores: [18, 17] }, pt: { scores: [40] }, qa: { scores: [42] } },
      { name: 'Abad, Pedro', gender: 'M', ww: { scores: [10, null] }, pt: { scores: [30] }, qa: { scores: [25] } },
      { name: 'No Gender, Kid', ww: { scores: [5, 5] }, pt: { scores: [5] }, qa: { scores: [5] } },
    ];
    const bytes = await buildClassRecordWorkbook({ meta: { school: 'Sample NHS', quarter: '1', subject: 'Science 7', gradeSection: '7-Rizal' }, weights, hps, learners });
    const wb = await loadWb(bytes);
    const ws = wb.getWorksheet('Class Record');
    expect(wb.getWorksheet('Transmutation')).toBeTruthy();

    let juanRow = null;
    const names = [];
    ws.eachRow((row, r) => {
      const v = row.getCell(2).value;
      if (typeof v === 'string') names.push(v);
      if (v === 'Dela Cruz, Juan') juanRow = r;
    });
    expect(names).toContain('HIGHEST POSSIBLE SCORE');
    // Males sorted, then female group
    const order = ['Abad, Pedro', 'Dela Cruz, Juan', 'Santos, Maria', 'No Gender, Kid'].map((n) => names.indexOf(n));
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(order.every((i) => i >= 0)).toBe(true);

    const expected = computeQuarterlyGrade({ ww: { scores: [18, 17], hps: [20, 20] }, pt: { scores: [40], hps: [50] }, qa: { scores: [42], hps: [50] } }, weights);
    expect(expected.initialGrade).toBe(83.8);
    const row = ws.getRow(juanRow);
    // Columns: A No, B name, C-D WW, E total, F PS, G WS, H PT1, I total, J PS, K WS, L QA1, M total, N PS, O WS, P initial, Q QG
    expect(row.getCell('C').value).toBe(18);
    expect(row.getCell('E').value.formula).toBe(`SUM(C${juanRow}:D${juanRow})`);
    expect(row.getCell('E').value.result).toBe(35);
    expect(row.getCell('F').value.formula).toContain('ROUND(');
    expect(row.getCell('F').value.result).toBe(expected.components.ww.ps);
    expect(row.getCell('G').value.result).toBe(expected.components.ww.ws);
    expect(row.getCell('K').value.result).toBe(expected.components.pt.ws);
    expect(row.getCell('O').value.result).toBe(expected.components.qa.ws);
    expect(row.getCell('P').value.formula).toBe(`ROUND(G${juanRow}+K${juanRow}+O${juanRow},2)`);
    expect(row.getCell('P').value.result).toBe(expected.initialGrade);
    expect(row.getCell('Q').value.formula).toMatch(/^LOOKUP\(P\d+,Transmutation!\$A\$2:\$A\$42,Transmutation!\$B\$2:\$B\$42\)$/);
    expect(row.getCell('Q').value.result).toBe(expected.quarterlyGrade);
    expect(expected.quarterlyGrade).toBe(89);
    expect(ws.views[0]).toMatchObject({ state: 'frozen', xSplit: 2 });
    expect(ws.pageSetup.orientation).toBe('landscape');

    const tt = wb.getWorksheet('Transmutation');
    expect(tt.getCell('A2').value).toBe(0);
    expect(tt.getCell('B2').value).toBe(60);
    expect(tt.getCell('B42').value).toBe(100);
  });

  it('transmutation table is ascending with the DO 8 bounds', () => {
    const t = transmutationTableAscending();
    expect(t).toHaveLength(41);
    expect(t[0]).toEqual([0, 60]);
    expect(t.find(([, g]) => g === 75)[0]).toBe(60);
    expect(t.find(([, g]) => g === 76)[0]).toBe(61.6);
    expect(t[t.length - 1]).toEqual([100, 100]);
  });

  it('buildItemAnalysisWorkbook marks LMC rows', async () => {
    const learners = [
      { name: 'A', responses: [1, 1, 0] }, { name: 'B', responses: [1, 0, 0] },
      { name: 'C', responses: [1, 1, 1] }, { name: 'D', responses: [1, 0, 0] },
    ];
    const analysis = analyzeItems(learners, [{ competency: 'Comp 1' }, { competency: 'Comp 2' }, { competency: 'Comp 3' }]);
    const bytes = await buildItemAnalysisWorkbook(analysis, { title: 'IA', school: 'Sample NHS' });
    const wb = await loadWb(bytes);
    expect(wb.worksheets.map((w) => w.name)).toEqual(['Summary', 'Item Analysis', 'Learner Scores']);
    const ia = wb.getWorksheet('Item Analysis');
    expect(ia.getCell('K2').value).toBe('No');
    expect(ia.getCell('K3').value).toBe('Yes');
    expect(ia.getCell('A3').fill.fgColor.argb).toBe('FFF8D7DA');
    expect(ia.getCell('A2').fill?.fgColor?.argb).not.toBe('FFF8D7DA');
    expect(wb.getWorksheet('Learner Scores').getCell('A2').value).toBe('A');
  });
});

async function makeTemplate() {
  const doc = new Document({
    sections: [{
      headers: { default: new Header({ children: [new Paragraph({ children: [new TextRun('School: {{school}}')] })] }) },
      children: [
        new Paragraph({ children: [new TextRun('Hello '), new TextRun({ text: '{{na', bold: true }), new TextRun('me}}!')] }),
        new Paragraph({ children: [new TextRun('Missing: [{{missing}}]')] }),
        new Paragraph({ children: [new TextRun('{{#learners}}')] }),
        new Paragraph({ children: [new TextRun('{{lname}} - {{score}}')] }),
        new Paragraph({ children: [new TextRun('{{/learners}}')] }),
      ],
    }],
  });
  return new Uint8Array(await Packer.toBuffer(doc));
}

describe('fillTemplates', () => {
  it('fills tags, loops and blanks missing values', async () => {
    const tpl = await makeTemplate();
    const tags = await listDocxPlaceholders(tpl);
    expect(tags).toEqual(expect.arrayContaining(['school', 'name', 'missing', 'learners', 'lname', 'score']));
    const out = await fillDocxTemplate(tpl, { name: 'Ma\'am Ana', school: 'Sample NHS', learners: [{ lname: 'Juan', score: 18 }, { lname: 'Maria', score: 20 }] });
    const text = await docText(out);
    expect(text).toContain("Hello Ma'am Ana!");
    expect(text).toContain('Missing: []');
    expect(text).toContain('Juan - 18');
    expect(text).toContain('Maria - 20');
    expect(text).not.toContain('undefined');
    expect(text).not.toContain('{{');
  });

  it('normalizes and matches learner names', () => {
    expect(normalizeLearnerName('Dela Cruz,  Juan P.')).toBe('juan p dela cruz');
    expect(normalizeLearnerName('PEÑA, NIÑO')).toBe('nino pena');
    expect(matchLearnerName('Dela Cruz, Juan P.', 'Juan P. Dela Cruz')).toBeGreaterThanOrEqual(0.85);
    expect(matchLearnerName('Dela Cruz, Juan P.', 'Juan Dela Cruz')).toBeGreaterThanOrEqual(0.85);
    expect(matchLearnerName('DELA CRUZ JUAN', 'Juan Dela Cruz')).toBeGreaterThanOrEqual(0.85);
    expect(matchLearnerName('Peña, Niño', 'nino pena')).toBe(1);
    expect(matchLearnerName('Delacruz, Juan', 'Juan Dela Cruz')).toBeGreaterThanOrEqual(0.85);
    expect(matchLearnerName('Santos, Maria Clara', 'Maria Santos')).toBeGreaterThanOrEqual(0.85);
    expect(matchLearnerName('Santos, Maria', 'Santos, Mario')).toBeLessThan(0.85);
    expect(matchLearnerName('Juan Dela Cruz', 'Juan Santos')).toBeLessThan(0.85);
    expect(matchLearnerName('', 'Juan')).toBe(0);
  });

  it('writes scores into an existing workbook, preserving styles and formulas', async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Q1');
    ws.getCell('A1').value = 'CLASS RECORD';
    ws.getRow(3).values = ['No.', "LEARNERS' NAMES", 'WW1', 'WW2', 'Total'];
    ws.getCell('A4').value = 'MALE';
    const people = [['DELA CRUZ, JUAN P.', 10, null], ['REYES, PEDRO', 9, 7], ['SANTOS, MARIA', 8, null]];
    people.forEach(([n, a, b], i) => {
      const r = 5 + i;
      ws.getCell(`A${r}`).value = i + 1;
      ws.getCell(`B${r}`).value = n;
      ws.getCell(`C${r}`).value = a;
      if (b !== null) ws.getCell(`D${r}`).value = b;
      ws.getCell(`D${r}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFF00' } };
      ws.getCell(`E${r}`).value = { formula: `SUM(C${r}:D${r})`, result: a + (b || 0) };
    });
    const src = new Uint8Array(await wb.xlsx.writeBuffer());

    const cols = await findWorkbookColumns(src);
    expect(cols.sheets).toEqual(['Q1']);
    expect(cols.headers).toEqual(expect.arrayContaining([expect.objectContaining({ text: 'WW2', letter: 'D', row: 3 })]));

    const res = await writeScoresIntoWorkbook(src, {
      nameColumn: 'B',
      targetColumn: 'WW2',
      scores: [{ name: 'Juan Dela Cruz', score: 9 }, { name: 'Pedro Reyes', score: 10 }, { name: 'Maria Santos', score: '8' }, { name: 'Unknown Learner', score: 5 }],
    });
    expect(res.written.map((w) => w.matchedName)).toEqual(['DELA CRUZ, JUAN P.', 'SANTOS, MARIA']);
    expect(res.written[0]).toMatchObject({ row: 5, score: 9 });
    expect(res.unmatched).toEqual(['Unknown Learner']);
    expect(res.skippedExisting).toEqual(['Pedro Reyes']);

    const out = await loadWb(res.bytes);
    const o = out.getWorksheet('Q1');
    expect(o.getCell('D5').value).toBe(9);
    expect(o.getCell('D7').value).toBe(8);
    expect(o.getCell('D6').value).toBe(7);
    expect(o.getCell('D5').fill.fgColor.argb).toBe('FFFFFF00');
    expect(o.getCell('E5').value.formula).toBe('SUM(C5:D5)');

    const over = await writeScoresIntoWorkbook(src, { nameColumn: 2, startRow: 5, targetColumn: 4, scores: [{ name: 'Reyes, Pedro', score: 10 }], overwrite: true });
    expect(over.written).toHaveLength(1);
    expect((await loadWb(over.bytes)).getWorksheet('Q1').getCell('D6').value).toBe(10);
  });
});

const PNG_1x1 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

describe('pdfTools', () => {
  it('merges, splits, and converts images', async () => {
    const a = await buildPdf({ title: 'A', blocks: [{ type: 'paragraph', text: 'one' }, { type: 'pageBreak' }, { type: 'paragraph', text: 'two' }] });
    const b = await buildPdf({ title: 'B' });
    const na = await getPdfPageCount(a);
    const nb = await getPdfPageCount(b);
    expect(na).toBe(2);
    const merged = await mergePdfs([a, b]);
    expect(merged).toBeInstanceOf(Uint8Array);
    expect(await getPdfPageCount(merged)).toBe(na + nb);
    const parts = await splitPdf(merged, [[1, 2], [3, 3]]);
    expect(parts).toHaveLength(2);
    expect(await getPdfPageCount(parts[0])).toBe(2);
    expect(await getPdfPageCount(parts[1])).toBe(1);

    const png = new Uint8Array(Buffer.from(PNG_1x1, 'base64'));
    const imgPdf = await imagesToPdf([{ bytes: png, mimeType: 'image/png' }, { bytes: png, mimeType: 'image/png' }]);
    expect(ascii(imgPdf, 4)).toBe('%PDF');
    const doc = await PDFDocument.load(imgPdf);
    expect(doc.getPageCount()).toBe(2);
    expect(Math.round(doc.getPage(0).getSize().height)).toBe(936);
  });
});

describe('depedTemplates', () => {
  const analysis = analyzeItems(
    [{ name: 'A', responses: [1, 0, 1] }, { name: 'B', responses: [1, 0, 0] }, { name: 'C', responses: [1, 1, 1] }, { name: 'D', responses: [1, 0, 1] }],
    [{ competency: 'Identify mixtures' }, { competency: 'Separate mixtures' }, { competency: 'Describe solutions' }],
  );

  it('itemAnalysisReportSpec', async () => {
    const spec = itemAnalysisReportSpec(analysis, { school: 'Sample NHS', subject: 'Science', teacher: 'Ana Reyes' }, { remarks: ['Item 2 needs review'], interventions: ['Remedial class'] });
    expect(normalizeDocumentSpec(spec)).toEqual(spec);
    expect(spec.title).toBe('Item Analysis and Least Mastered Competencies Report');
    const tables = spec.blocks.filter((b) => b.type === 'table');
    expect(tables).toHaveLength(2);
    expect(tables[1].rows.map((r) => r[1])).toContain('Separate mixtures');
    expect(spec.signatures.map((s) => s.label)).toEqual(['Prepared by:', 'Checked by:', 'Noted by:']);
    const text = await docText(await buildDocx(spec));
    expect(text).toContain('Least Mastered Competencies');
  });

  it('remedialSlipsSpec lays out 2-up slips with cut lines and page breaks', async () => {
    const practice = { title: 'Remedial Practice Slip', competency: 'Separate mixtures', instructions: 'Answer the following.', items: [{ question: 'What is filtration?', answer: 'Separating solids' }, { question: 'Pick one', choices: ['A1', 'B1'], answer: 'B' }] };
    const retest = { instructions: 'Choose the best answer.', items: Array.from({ length: 5 }, (_, i) => ({ question: `Retest ${i + 1}?`, choices: ['x', 'y', 'z', 'w'], answer: 'A' })) };
    const spec = remedialSlipsSpec({ meta: { school: 'Sample NHS', subject: 'Science', gradeSection: '7-Rizal' }, practice, retest });
    expect(normalizeDocumentSpec(spec)).toEqual(spec);
    expect(spec.header).toBeNull();
    const types = spec.blocks.map((b) => b.type);
    expect(types.filter((t) => t === 'cutLine')).toHaveLength(2);
    expect(types.filter((t) => t === 'pageBreak')).toHaveLength(2);
    const q = spec.blocks.filter((b) => b.type === 'questions');
    expect(q).toHaveLength(4);
    expect(q[2].items).toHaveLength(5);
    expect(q.every((b) => !b.showAnswers)).toBe(true);
    const key = spec.blocks[spec.blocks.length - 1];
    expect(key.type).toBe('table');
    expect(key.rows[1]).toEqual(['2', 'B', 'A']);
    expect(ascii(await buildPdf(spec), 4)).toBe('%PDF');
  });

  it('homeVisitationNoticeSpec is bilingual with acknowledgment slip', () => {
    const spec = homeVisitationNoticeSpec({ learnerName: 'Juan Dela Cruz', parentName: 'Maria Dela Cruz', gradeSection: 'Grade 7-Rizal', absences: 5, dates: ['Sept 1', 'Sept 2'], schedule: 'October 5, 2026, 3:00 PM', teacherName: 'Ana Reyes', schoolName: 'Sample NHS' });
    expect(normalizeDocumentSpec(spec)).toEqual(spec);
    const text = spec.blocks.map((b) => b.text || '').join(' ');
    expect(text).toContain('Magandang araw');
    expect(text).toContain('Good day');
    expect(text).toContain('Sept 1, Sept 2');
    expect(spec.blocks.some((b) => b.type === 'cutLine')).toBe(true);
    expect(spec.header.school).toBe('Sample NHS');
  });

  it('classRecordSummarySpec accepts flat and computeQuarterlyGrade-shaped rows', () => {
    const g = computeQuarterlyGrade({ ww: { scores: [18], hps: [20] }, pt: { scores: [40], hps: [50] }, qa: { scores: [42], hps: [50] } });
    const spec = classRecordSummarySpec({ meta: { subject: 'Science' }, rows: [{ name: 'Juan', ...g }, { name: 'Maria', wwPs: 90, ptPs: 85, qaPs: 80, initialGrade: 85.5, quarterlyGrade: 91 }] });
    expect(normalizeDocumentSpec(spec)).toEqual(spec);
    const rows = spec.blocks[0].rows;
    expect(rows[0][2]).toBe('90');
    expect(rows[0][6]).toBe(String(g.quarterlyGrade));
    expect(rows[1][7]).toBe('Outstanding');
  });
});

describe('hideTitle and question start', () => {
  const spec = {
    title: 'Hidden Title XYZ',
    subtitle: 'Hidden Subtitle',
    hideTitle: true,
    header: null,
    blocks: [
      { type: 'questions', start: 11, showAnswers: true, items: [{ question: 'Eleventh question?', choices: ['a', 'b'], answer: 'B' }, { question: 'Twelfth question?', answer: 'A' }] },
    ],
  };

  it('docx skips the title and numbers from start', async () => {
    const text = await docText(await buildDocx(spec));
    expect(text).not.toContain('Hidden Title XYZ');
    expect(text).not.toContain('Hidden Subtitle');
    expect(text).toContain('11. Eleventh question?');
    expect(text).toContain('12. Twelfth question?');
    expect(text).toMatch(/11\. B/);
    expect(text).toMatch(/12\. A/);
    const shown = await docText(await buildDocx({ ...spec, hideTitle: false }));
    expect(shown).toContain('Hidden Title XYZ');
  });

  it('html skips the title and uses ol start', () => {
    const body = specToHtmlBody(spec);
    expect(body).not.toContain('doc-title');
    expect(body).not.toContain('Hidden Subtitle');
    expect(body).toContain('<ol class="questions" start="11">');
    expect(body).toContain('<ol class="key" start="11">');
    expect(buildHtml(spec)).toContain('<title>Hidden Title XYZ</title>');
  });

  it('pdf renders with hideTitle and start', async () => {
    const bytes = await buildPdf(spec);
    expect(ascii(bytes, 4)).toBe('%PDF');
    const shown = await buildPdf({ ...spec, hideTitle: false });
    expect(shown.length).toBeGreaterThan(bytes.length);
  });

  it('remedial slips hide the title', () => {
    const s = remedialSlipsSpec({ practice: { items: [{ question: 'Q?' }] } });
    expect(s.hideTitle).toBe(true);
    expect(specToHtmlBody(s)).not.toContain('doc-title');
  });
});

describe('compact choices', () => {
  const practice = { title: 'Remedial Practice Slip', competency: 'Identify cell parts', instructions: 'Answer the following.', items: [{ question: 'What controls the activities of the cell?', choices: ['Nucleus', 'Cell wall', 'Vacuole', 'Cell membrane'], answer: 'A' }, { question: 'Which organelle makes food in plant cells?', choices: ['Chloroplast', 'Mitochondrion', 'Ribosome', 'Vacuole'], answer: 'A' }] };
  const retest = { instructions: 'Choose the letter of the correct answer.', items: Array.from({ length: 5 }, (_, i) => ({ question: `Re-test question number ${i + 1}: which part of the cell is described here?`, choices: ['Nucleus', 'Wall', 'Vacuole', 'Membrane'], answer: 'B' })) };

  it('keeps both 2-up copies on one page (practice + re-test + key = 3 pages)', async () => {
    const spec = remedialSlipsSpec({ meta: { school: 'Sample National High School', subject: 'Science 7', gradeSection: '7-Rizal' }, practice, retest });
    expect(await getPdfPageCount(await buildPdf(spec))).toBe(3);
    const text = await docText(await buildDocx(spec));
    expect(text).toContain('Re-test question number 5');
  });

  it('renders short choices inline, medium as a grid, long stacked', () => {
    const body = specToHtmlBody({
      title: 'T',
      blocks: [{
        type: 'questions',
        items: [
          { question: 'Short?', choices: ['Nucleus', 'Wall', 'Vacuole', 'Membrane'] },
          { question: 'Medium?', choices: ['The cell membrane only', 'The nucleus and cytoplasm', 'Chloroplasts in leaves', 'None of these choices'] },
          { question: 'Long?', choices: ['A very long choice that clearly exceeds forty characters in length', 'B', 'C'] },
        ],
      }],
    });
    expect(body).toContain('<div class="choices inline"><div>A. Nucleus</div><div>B. Wall</div><div>C. Vacuole</div><div>D. Membrane</div></div>');
    expect(body).toContain('class="choices grid"');
    expect(body).toContain('class="choices stack"');
    expect(buildHtml(remedialSlipsSpec({ practice, retest }))).toContain('class="sheet compact"');
  });
});
