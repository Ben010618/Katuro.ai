import { describe, it, expect, vi, beforeEach } from 'vitest';
import PizZip from 'pizzip';
import ExcelJS from 'exceljs';
import { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell } from 'docx';
import { callGeminiProxy } from '../../geminiConfig';
import { runDeskAgentTurn, clearAnswerMemory } from './deskAgent';
import { resetTaskActionSupport } from './llm';
import { createVirtualWorkspace, readFileBytes } from '../../localFileSystem';
import { checkTranslation, languageName, skipText, translateAll } from '../generators/translateDoc';

vi.mock('../../geminiConfig', () => ({ callGeminiProxy: vi.fn() }));

const cell = (t) => new TableCell({ children: [new Paragraph(t)] });
async function lessonDoc() {
  const doc = new Document({ sections: [{ children: [
    new Paragraph({ children: [new TextRun({ text: 'Activity Sheet', bold: true, size: 32 })] }),
    new Paragraph({ children: [new TextRun('Read the '), new TextRun({ text: 'story', bold: true }), new TextRun(' and answer 5 questions.')] }),
    new Paragraph({ children: [new TextRun('Name:'), new TextRun({ text: '\t' }), new TextRun('________')] }),
    new Table({ rows: [new TableRow({ children: [cell('Name'), cell('Score')] }), new TableRow({ children: [cell('Dela Cruz, Juan'), cell('18')] }), new TableRow({ children: [cell('Santos, Maria'), cell('20')] })] }),
    new Paragraph('Juan Dela Cruz did very well on 10/08/2026.'),
  ] }] });
  return new Uint8Array(await Packer.toArrayBuffer(doc));
}
const xmlText = (bytes, part = 'word/document.xml') => new PizZip(bytes).file(part).asText();

/** A pretend translator: upper-cases the words (keeps markers, tokens and numbers). */
const upper = (strings) => strings.map((s) => s.replace(/[A-Za-z]+/g, (w) => w.toUpperCase()));

describe('translate a document, keeping its layout', () => {
  beforeEach(() => { resetTaskActionSupport(); clearAnswerMemory(); callGeminiProxy.mockReset(); });

  const run = async (ws, args, translator = upper) => {
    const prompts = [];
    callGeminiProxy.mockImplementation(async (req) => {
      const text = JSON.stringify(req.contents);
      if (text.includes('You are the planner')) return { text: JSON.stringify({ confidence: 'high', reply: 'Sige po.', tasks: [{ id: 't1', tool: 'translate_document', args }] }) };
      prompts.push(text);
      const strings = JSON.parse(JSON.parse(text)[0].parts.map((p) => p.text).join('').split('\n').slice(-1)[0]);
      return { text: JSON.stringify({ t: translator(strings) }) };
    });
    const res = await runDeskAgentTurn({ prompt: 'translate this to Filipino', workspace: ws, user: { uid: 'u1' }, profile: { fullName: 'Ana Reyes' }, autoApprove: true });
    return { res, prompts };
  };

  it('helpers: languages, what is skipped, what a usable translation keeps', () => {
    expect([languageName('Tagalog'), languageName('bisaya'), languageName('Iloko'), languageName('Klingon')]).toEqual(['Filipino', 'Cebuano', 'Ilocano', null]);
    expect(['18', '________', 'A.', 'https://deped.gov.ph', 'Name'].map(skipText)).toEqual([true, true, true, true, false]);
    expect(checkTranslation('⟦1⟧Read the ⟦2⟧story', '⟦1⟧Basahin ang ⟦2⟧kuwento')).toBe(null);
    expect(checkTranslation('⟦1⟧Read the ⟦2⟧story', 'Basahin ang kuwento')).toBe('markers');
    expect(checkTranslation('answer 5 questions', 'sagutin ang mga tanong')).toBe('numbers');
    expect(checkTranslation('⟪01⟫ did well', 'Mahusay si Mag-aaral 01')).toBe('names');
  });

  it('Word: words translated in place; bold word, tab, table and numbers kept; names never sent to the AI', async () => {
    const ws = createVirtualWorkspace('Class');
    const original = await lessonDoc();
    ws.handle.saveVirtualFile('Activity.docx', original);
    ws.files = ws.handle.getFiles();
    const { res, prompts } = await run(ws, { path: 'Activity.docx', language: 'Tagalog' });
    expect(res.content).toMatch(/Translated Activity\.docx into Filipino: \d+ of \d+ text part\(s\)/);
    expect(res.content).toMatch(/please have it read by a fluent Filipino speaker/);
    expect(prompts.join(' ')).not.toMatch(/Juan|Dela Cruz|Santos|Maria/);                // names hidden from the AI
    const file = res.createdFiles.find((f) => f.name === 'Activity (Filipino).docx');
    const xml = xmlText(await readFileBytes(ws.handle, file.path));
    expect(xml).toMatch(/<w:b\/>[\s\S]*?<w:t xml:space="preserve">ACTIVITY SHEET<\/w:t>/);
    expect(xml).toMatch(/READ THE <\/w:t>[\s\S]*?<w:b\/>[\s\S]*?>STORY<\/w:t>[\s\S]*?> AND ANSWER 5 QUESTIONS\.<\/w:t>/); // bold word still bold
    expect(xml).toMatch(/NAME:(\t|<\/w:t>[\s\S]*?<w:tab\/>[\s\S]*?>)________<\/w:t>/);   // tab still between
    expect(xml).toMatch(/>Dela Cruz, Juan<\/w:t>/);                                     // names unchanged
    expect(xml).toMatch(/>Juan Dela Cruz DID VERY WELL ON 10\/08\/2026\.<\/w:t>/);
    expect(xml).toMatch(/>18<\/w:t>/);
    expect(xmlText(await readFileBytes(ws.handle, 'Activity.docx'))).toMatch(/>Read the <\/w:t>/); // original unchanged
  });

  it('a translation that loses a number is not used; that part stays as it was and is listed', async () => {
    const ws = createVirtualWorkspace('Class');
    ws.handle.saveVirtualFile('Activity.docx', await lessonDoc());
    ws.files = ws.handle.getFiles();
    const dropNumbers = (strings) => upper(strings).map((s) => (/QUESTIONS/.test(s) ? s.replace(/5 /, '') : s));
    const { res } = await run(ws, { path: 'Activity.docx', language: 'Cebuano' }, dropNumbers);
    expect(res.content).toMatch(/1 part\(s\) were left in the original language because the translation did not keep its numbers or markers: "Read the story and answer 5 questions\."/);
    const xml = xmlText(await readFileBytes(ws.handle, res.createdFiles[0].path));
    expect(xml).toMatch(/>Read the <\/w:t>/);
    expect(xml).toMatch(/ACTIVITY SHEET/);
  });

  it('PowerPoint slides and Excel text cells (numbers and formulas untouched)', async () => {
    const zip = new PizZip();
    zip.file('[Content_Types].xml', '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>');
    zip.file('ppt/slides/slide1.xml', '<p:sld xmlns:a="a" xmlns:p="p"><a:p><a:r><a:rPr b="1"/><a:t>Parts of a Plant</a:t></a:r></a:p><a:p><a:r><a:t>The root holds the plant.</a:t></a:r><a:br/><a:r><a:t>Page 2</a:t></a:r></a:p></p:sld>');
    const wb = new ExcelJS.Workbook();
    const s = wb.addWorksheet('Quiz');
    s.addRow(['Question', 'Points']);
    s.addRow(['What gives a plant water?', 2]);
    s.getCell('B3').value = { formula: 'SUM(B2:B2)', result: 2 };
    const ws = createVirtualWorkspace('Class');
    ws.handle.saveVirtualFile('Plants.pptx', zip.generate({ type: 'uint8array' }));
    ws.handle.saveVirtualFile('Quiz.xlsx', new Uint8Array(await wb.xlsx.writeBuffer()));
    ws.files = ws.handle.getFiles();
    const a = await run(ws, { path: 'Plants.pptx', language: 'Ilocano' });
    const slide = xmlText(await readFileBytes(ws.handle, a.res.createdFiles[0].path), 'ppt/slides/slide1.xml');
    expect(slide).toBe('<p:sld xmlns:a="a" xmlns:p="p"><a:p><a:r><a:rPr b="1"/><a:t>PARTS OF A PLANT</a:t></a:r></a:p><a:p><a:r><a:t>THE ROOT HOLDS THE PLANT.</a:t></a:r><a:br/><a:r><a:t>PAGE 2</a:t></a:r></a:p></p:sld>');
    clearAnswerMemory();
    const b = await run(ws, { path: 'Quiz.xlsx', language: 'Filipino' });
    const out = new ExcelJS.Workbook();
    await out.xlsx.load(await readFileBytes(ws.handle, b.res.createdFiles[0].path));
    const q = out.getWorksheet('Quiz');
    expect([q.getCell('A1').value, q.getCell('A2').value, q.getCell('B2').value, q.getCell('B3').value.formula]).toEqual(['QUESTION', 'WHAT GIVES A PLANT WATER?', 2, 'SUM(B2:B2)']);
  });

  it('asks for the language; batches are retried once', async () => {
    const ws = createVirtualWorkspace('Class');
    ws.handle.saveVirtualFile('Activity.docx', await lessonDoc());
    ws.files = ws.handle.getFiles();
    const a = await run(ws, { path: 'Activity.docx', language: 'Klingon' });
    expect(a.res.content).toMatch(/Needs your input.*I don't know the language "Klingon"/);
    let calls = 0;
    const flaky = async (strings) => { calls += 1; return calls === 1 ? ['wrong length'] : upper(strings); };
    const { map, failed } = await translateAll(['Good morning', 'Thank you'], flaky);
    expect([map.get('Good morning'), failed.length, calls]).toEqual(['GOOD MORNING', 0, 2]);
  });
});
