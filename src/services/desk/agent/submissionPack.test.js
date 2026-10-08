import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Buffer } from 'node:buffer';
import fs from 'node:fs';
import process from 'node:process';
import jpeg from 'jpeg-js';
import * as XLSX from 'xlsx';
import PptxGenJS from 'pptxgenjs';
import { Document, Packer, Paragraph } from 'docx';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { callGeminiProxy } from '../../geminiConfig';
import { runDeskAgentTurn, clearAnswerMemory } from './deskAgent';
import { resetTaskActionSupport } from './llm';
import { createVirtualWorkspace, readFileBytes } from '../../localFileSystem';

vi.mock('../../geminiConfig', () => ({ callGeminiProxy: vi.fn() }));

async function files(ws) {
  const pdf = await PDFDocument.create();
  const f = await pdf.embedFont(StandardFonts.Helvetica);
  pdf.addPage().drawText('ATTENDANCE PAGE ONE', { x: 50, y: 700, font: f });
  pdf.addPage().drawText('ATTENDANCE PAGE TWO', { x: 50, y: 700, font: f });
  ws.handle.saveVirtualFile('Submission/1 SF2 October.pdf', await pdf.save());
  ws.handle.saveVirtualFile('Submission/2 Bulletin board.jpg', new Uint8Array(jpeg.encode({ data: Buffer.alloc(20 * 30 * 4, 200), width: 20, height: 30 }, 80).data));
  const p = new PptxGenJS();
  p.addSlide().addText('LESSON SLIDE A', { x: 1, y: 1, w: 6, h: 1 });
  p.addSlide().addText('LESSON SLIDE B', { x: 1, y: 1, w: 6, h: 1 });
  ws.handle.saveVirtualFile('Submission/3 Lesson.pptx', new Uint8Array(await p.write({ outputType: 'uint8array' })));
  ws.handle.saveVirtualFile('Submission/4 Narrative Report.docx', new Uint8Array(await Packer.toArrayBuffer(new Document({ sections: [{ children: [new Paragraph('NARRATIVE REPORT TEXT')] }] }))));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Learner', 'Score'], ['Reyes, Ben', 18]]), 'Quiz 1');
  ws.handle.saveVirtualFile('Submission/5 Quiz Scores.xlsx', new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' })));
  ws.handle.saveVirtualFile('Submission/notes.txt', new TextEncoder().encode('not for submission'));
  ws.files = ws.handle.getFiles();
}

async function pageTexts(bytes) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await pdfjs.getDocument({ data: bytes.slice(), isEvalSupported: false, verbosity: 0 }).promise;
  const out = [];
  for (let i = 1; i <= doc.numPages; i += 1) out.push((await (await doc.getPage(i)).getTextContent()).items.map((t) => t.str).join(' '));
  return out;
}

describe('submission pack: one ready PDF', () => {
  beforeEach(() => { resetTaskActionSupport(); clearAnswerMemory(); callGeminiProxy.mockReset(); });

  const run = async (ws, args) => {
    callGeminiProxy.mockImplementation(async () => ({ text: JSON.stringify({ confidence: 'high', reply: 'Sige po.', tasks: [{ id: 't1', tool: 'submission_pack', args }] }) }));
    return runDeskAgentTurn({ prompt: 'make a submission pack', workspace: ws, user: { uid: 'u1' }, profile: { fullName: 'Ana Reyes', school: 'Dayap Elementary School', division: 'Division of Laguna', designation: 'Teacher III' }, autoApprove: true });
  };

  it('all kinds of files in order, numbered, with a cover whose contents point to the right pages', async () => {
    const ws = createVirtualWorkspace('Class');
    await files(ws);
    const res = await run(ws, { folder: 'Submission', title: 'Term 1 Submission - Grade 5 Rizal', submittedTo: 'School Head' });
    expect(res.content).toMatch(/Made Term 1 Submission - Grade 5 Rizal\.pdf: 5 document\(s\), \d+ page\(s\) plus the cover page with the contents, page numbers at the bottom/);
    expect(res.content).toMatch(/Order: 1 SF2 October\.pdf, 2 Bulletin board\.jpg, 3 Lesson\.pptx, 4 Narrative Report\.docx, 5 Quiz Scores\.xlsx\./);
    expect(res.content).toMatch(/Left out \(not a document or photo\): notes\.txt/);
    const bytes = await readFileBytes(ws.handle, res.createdFiles[0].path);
    if (process.env.KT_PACK_OUT) fs.writeFileSync(process.env.KT_PACK_OUT, bytes);
    const pages = await pageTexts(bytes);
    const cover = pages[0];
    expect(cover).toMatch(/Republic of the Philippines.*Department of Education.*DIVISION OF LAGUNA.*DAYAP ELEMENTARY SCHOOL/);
    expect(cover).toMatch(/Term 1 Submission - Grade 5 Rizal/);
    expect(cover).toMatch(/Submitted by:\s+Ana Reyes, Teacher III/);
    expect(cover).toMatch(/Submitted to:\s+School Head/);
    // Each contents line names the page; that page (after the cover) really starts the document.
    const want = { 'SF2 October': 'ATTENDANCE PAGE ONE', 'Bulletin board': null, Lesson: 'LESSON SLIDE A', 'Narrative Report': 'NARRATIVE REPORT TEXT', 'Quiz Scores': 'Reyes, Ben' };
    for (const [doc, text] of Object.entries(want)) {
      const m = cover.match(new RegExp(`\\d\\. ${doc}[ .]*page (\\d+)`));
      expect(m, doc).toBeTruthy();
      const page = pages[Number(m[1])];                       // pages[0] is the cover
      expect(page).toMatch(new RegExp(`Page ${m[1]} of ${pages.length - 1}`));
      if (text) expect(page).toContain(text);
    }
    expect(pages[0]).not.toMatch(/Page \d+ of/);              // the cover is not numbered
  });

  it('asks for the title and the files', async () => {
    const ws = createVirtualWorkspace('Class');
    await files(ws);
    const a = await run(ws, { folder: 'Submission' });
    expect(a.content).toMatch(/Needs your input.*What is the title of this submission/);
    clearAnswerMemory();
    const b = await run(ws, { paths: ['Submission/notes.txt'], title: 'X' });
    expect(b.content).toMatch(/Needs your input.*Which files should go into the submission pack/);
  });
});
