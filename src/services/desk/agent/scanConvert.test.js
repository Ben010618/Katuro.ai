import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Buffer } from 'node:buffer';
import jpeg from 'jpeg-js';
import ExcelJS from 'exceljs';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { callGeminiProxy } from '../../geminiConfig';
import { runDeskAgentTurn, clearAnswerMemory } from './deskAgent';
import { resetTaskActionSupport } from './llm';
import { createVirtualWorkspace, readFileBytes } from '../../localFileSystem';
import { tidyBlocks } from '../generators/scanConvert';

vi.mock('../../geminiConfig', () => ({ callGeminiProxy: vi.fn() }));

async function digitalPdf() {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const page = pdf.addPage([612, 936]);
  page.drawText('SUMMARY OF QUIZ RESULTS', { x: 150, y: 880, size: 18, font: bold });
  page.drawText('The class took the quiz on October 6. Most learners did well', { x: 50, y: 840, size: 11, font });
  page.drawText('and four need more practice.', { x: 50, y: 826, size: 11, font });
  const rows = [['Learner', 'Score', 'Remarks'], ['Dela Cruz, Juan', '18', 'Passed'], ['Reyes, Ben', '9', 'Failed'], ['Santos, Maria', '20', 'Passed']];
  rows.forEach((r, i) => r.forEach((c, k) => page.drawText(c, { x: [50, 250, 400][k], y: 780 - i * 18, size: 11, font })));
  page.drawText('Prepared by: Ana Reyes', { x: 50, y: 680, size: 11, font });
  return pdf.save();
}

async function scannedPdf(pages = 1) {
  const data = Buffer.alloc(40 * 60 * 4, 255);
  const img = new Uint8Array(jpeg.encode({ data, width: 40, height: 60 }, 70).data);
  const pdf = await PDFDocument.create();
  const embedded = await pdf.embedJpg(img);
  for (let i = 0; i < pages; i += 1) pdf.addPage([612, 936]).drawImage(embedded, { x: 0, y: 0, width: 612, height: 936 });
  return pdf.save();
}

const html = async (bytes) => { const m = await import('mammoth'); return (await (m.default || m).convertToHtml({ buffer: Buffer.from(bytes) })).value; };

describe('scanned or digital PDF to an editable file', () => {
  beforeEach(() => { resetTaskActionSupport(); clearAnswerMemory(); callGeminiProxy.mockReset(); });

  const run = async (ws, args, blocks = []) => {
    const ai = [];
    callGeminiProxy.mockImplementation(async (req) => {
      const text = JSON.stringify(req.contents);
      if (text.includes('You are the planner')) return { text: JSON.stringify({ confidence: 'high', reply: 'Sige po.', tasks: [{ id: 't1', tool: 'scan_to_editable', args }] }) };
      ai.push(text.match(/Transcribe ([^"]*?) into JSON/)?.[1]);
      return { text: JSON.stringify({ blocks }) };
    });
    const res = await runDeskAgentTurn({ prompt: 'make this pdf editable', workspace: ws, user: { uid: 'u1' }, profile: { fullName: 'Ana Reyes' }, autoApprove: true });
    return { res, ai };
  };

  it('digital PDF → Word by code: heading, joined paragraph, the table, no AI', async () => {
    const ws = createVirtualWorkspace('Class');
    ws.handle.saveVirtualFile('Results.pdf', await digitalPdf());
    ws.files = ws.handle.getFiles();
    const { res, ai } = await run(ws, { path: 'Results.pdf', format: 'docx' });
    expect(ai).toEqual([]);
    expect(res.content).toMatch(/Made Results \(editable\)\.docx from Results\.pdf: \d+ heading\(s\)\/paragraph\(s\) and 1 table\(s\)\. The words come straight from the PDF's text \(no AI\)/);
    const h = await html(await readFileBytes(ws.handle, res.createdFiles[0].path));
    expect(h).toMatch(/SUMMARY OF QUIZ RESULTS/);
    expect(h).toMatch(/<p>The class took the quiz on October 6\. Most learners did well and four need more practice\.<\/p>/);
    expect(h).toMatch(/<table>[\s\S]*Learner[\s\S]*Score[\s\S]*Remarks[\s\S]*Dela Cruz, Juan[\s\S]*18[\s\S]*Passed[\s\S]*Santos, Maria[\s\S]*20[\s\S]*<\/table>/);
    expect(h).toMatch(/Prepared by: Ana Reyes/);
  });

  it('digital PDF → Excel: the table on its own sheet, numbers as numbers', async () => {
    const ws = createVirtualWorkspace('Class');
    ws.handle.saveVirtualFile('Results.pdf', await digitalPdf());
    ws.files = ws.handle.getFiles();
    const { res } = await run(ws, { path: 'Results.pdf', format: 'xlsx' });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await readFileBytes(ws.handle, res.createdFiles[0].path));
    const vals = [];
    wb.getWorksheet('Table 1').eachRow((r) => vals.push(r.values.slice(1)));
    expect(vals.slice(-4)).toEqual([['Learner', 'Score', 'Remarks'], ['Dela Cruz, Juan', 18, 'Passed'], ['Reyes, Ben', 9, 'Failed'], ['Santos, Maria', 20, 'Passed']]);
  });

  it('scanned PDF → read by AI (10 pages per request), unreadable parts counted', async () => {
    const ws = createVirtualWorkspace('Class');
    ws.handle.saveVirtualFile('Scan.pdf', await scannedPdf(12));
    ws.files = ws.handle.getFiles();
    const blocks = [{ type: 'heading', level: 1, text: 'ATTENDANCE' }, { type: 'table', columns: ['Name', 'Days'], rows: [['Juan', '20'], ['Ben', '[unclear]']] }];
    const { res, ai } = await run(ws, { path: 'Scan.pdf' }, blocks);
    expect(ai).toEqual(['pages 1 to 10 of this scanned document', 'pages 11 to 12 of this scanned document']);
    expect(res.content).toMatch(/Read from the scan by AI: please proofread it against the original before using it\. 2 part\(s\) could not be read and are marked \[unclear\]/);
    const h = await html(await readFileBytes(ws.handle, res.createdFiles[0].path));
    expect(h.match(/ATTENDANCE/g)).toHaveLength(2);
  });

  it('tidies what the AI returns; asks for Excel when there are no tables', async () => {
    expect(tidyBlocks([{ type: 'table', columns: ['A', 'B', 'C'], rows: [['1'], ['2', '3', '4', '5']] }, { type: 'image' }, { type: 'paragraph', text: '  ' }, { type: 'pageBreak' }]))
      .toEqual([{ type: 'table', columns: ['A', 'B', 'C', ''], rows: [['1', '', '', ''], ['2', '3', '4', '5']] }]);
    const ws = createVirtualWorkspace('Class');
    ws.handle.saveVirtualFile('Scan.pdf', await scannedPdf(1));
    ws.files = ws.handle.getFiles();
    const { res } = await run(ws, { path: 'Scan.pdf', format: 'xlsx' }, [{ type: 'paragraph', text: 'Dear parents,' }]);
    expect(res.content).toMatch(/Needs your input.*has no tables, only text\. Should I make a Word file instead\?/);
  });
});
