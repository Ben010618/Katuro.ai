import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Buffer } from 'node:buffer';
import PizZip from 'pizzip';
import { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, UnderlineType } from 'docx';
import { callGeminiProxy } from '../../geminiConfig';
import { runDeskAgentTurn, clearAnswerMemory } from './deskAgent';
import { resetTaskActionSupport } from './llm';
import { createVirtualWorkspace, readFileBytes, flattenFileTree } from '../../localFileSystem';
import { scanWordForm, fillWordForm, profileValueFor, isLabel } from '../generators/wordForm';

vi.mock('../../geminiConfig', () => ({ callGeminiProxy: vi.fn() }));

const docText = (bytes) => new PizZip(bytes).file('word/document.xml').asText()
  .replace(/<w:tab\/>/g, '\t').replace(/<\/w:p>/g, '\n').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&');
const cell = (t) => new TableCell({ children: [new Paragraph(t)] });

async function form() {
  const doc = new Document({ sections: [{ children: [
    new Paragraph({ children: [new TextRun({ text: 'PARENT CONFERENCE FORM', bold: true })] }),
    new Paragraph('Directions:'),
    new Paragraph('Fill out completely and return to the adviser.'),
    new Paragraph({ children: [new TextRun({ text: 'Name: ', bold: true }), new TextRun('________________')] }),
    new Paragraph('Grade & Section: __________  School Year: __________'),
    new Paragraph('Date: ..............'),
    new Paragraph({ children: [new TextRun('Subject: '), new TextRun({ text: '\t\t\t', underline: { type: UnderlineType.SINGLE } })] }),
    new Paragraph('Adviser:'),
    new Paragraph(''),
    new Table({ rows: [
      new TableRow({ children: [cell('Name of Parent'), cell('')] }),
      new TableRow({ children: [cell('Contact No.'), cell('')] }),
    ] }),
    new Table({ rows: [
      new TableRow({ children: [cell('No.'), cell('Concern'), cell('Action Taken')] }),
      new TableRow({ children: [cell('1'), cell(''), cell('')] }),
      new TableRow({ children: [cell('2'), cell(''), cell('')] }),
    ] }),
    new Paragraph('______________________________'),
    new Paragraph('Signature over Printed Name'),
  ] }] });
  return new Uint8Array(await Packer.toArrayBuffer(doc));
}

describe('fill your own Word form (no {{blanks}})', () => {
  beforeEach(() => { resetTaskActionSupport(); clearAnswerMemory(); callGeminiProxy.mockReset(); });

  const run = async (ws, args, { prompt = 'fill out my form', answer } = {}) => {
    const calls = [];
    callGeminiProxy.mockImplementation(async (req) => {
      const text = JSON.stringify(req.contents);
      if (text.includes('You are the planner')) { calls.push('planner'); return { text: JSON.stringify({ confidence: 'high', reply: 'Sige po.', tasks: [{ id: 't1', tool: 'fill_word_form', args }] }) }; }
      calls.push('fields');
      return { text: JSON.stringify(answer || {}) };
    });
    const res = await runDeskAgentTurn({ prompt, workspace: ws, user: { uid: 'u1' }, profile: { fullName: 'Ana Reyes', school: 'Dayap Elementary School' }, autoApprove: true });
    return { res, calls };
  };

  it('finds every kind of blank, in order, and leaves headings and list tables alone', async () => {
    const { fields, grids } = await scanWordForm(await form());
    expect(fields.map((f) => `${f.label} [${f.kind}]`)).toEqual([
      'Name [line]', 'Grade & Section [line]', 'School Year [line]', 'Date [line]', 'Subject [line]', 'Adviser [after label]',
      'Name of Parent [table cell]', 'Contact No [table cell]', 'Signature over Printed Name [signature]',
    ]);
    expect(grids).toBe(1);
    expect(isLabel('of')).toBe(false);
    expect(profileValueFor('Signature over Printed Name', { teacher: { fullName: 'Ana Reyes' } })).toBe('Ana Reyes');
    expect(profileValueFor('Name', { teacher: { fullName: 'Ana Reyes' } })).toBe(null); // could be anyone: ask
  });

  it('fills from what the teacher said and the profile; the rest stays blank and is listed; original backed up', async () => {
    const ws = createVirtualWorkspace('Class');
    const original = await form();
    ws.handle.saveVirtualFile('Conference Form.docx', original);
    ws.files = ws.handle.getFiles();
    const { res, calls } = await run(ws, { path: 'Conference Form.docx', values: { 'Grade and Section': 'Grade 5 - Rizal', Subject: 'Science', 'Name of Parent': 'SAMPLE PARENT' } });
    expect(calls).toEqual(['planner']); // nothing else sent to the AI
    expect(res.content).toMatch(/Filled 7 of 9 blank\(s\) in Conference Form \(KaTuro edit\)\.docx/);
    expect(res.content).toMatch(/Left blank \(tell me what to put\): Name, Contact No\./);
    expect(res.content).toMatch(/I used today's date for "Date"/);
    const edited = res.createdFiles.find((f) => /KaTuro edit/.test(f.name));
    const t = docText(await readFileBytes(ws.handle, edited.path));
    expect(t).toMatch(/Name: ________________/);                        // unknown: left as is
    expect(t).toMatch(/Grade & Section: Grade 5 - Rizal {2}School Year: \d{4}-\d{4}/);
    expect(t).toMatch(new RegExp(`Date: ${new Date().getFullYear()}|Date: [A-Z][a-z]+ \\d{1,2}, \\d{4}`));
    expect(t).toMatch(/Subject: Science\n/);
    expect(t).toMatch(/Adviser: Ana Reyes\n/);
    expect(t).toMatch(/Name of Parent\nSAMPLE PARENT\nContact No\.\n\n/);   // cell next to the label; unknown one left empty
    expect(t).toMatch(/Ana Reyes\nSignature over Printed Name/);
    expect(t).toMatch(/Directions:\nFill out completely/);                // heading untouched
    expect(t).toMatch(/No\.\nConcern\nAction Taken\n1\n\n\n2\n\n\n/);     // list table untouched
    expect(Buffer.from(await readFileBytes(ws.handle, 'Conference Form.docx')).equals(Buffer.from(original))).toBe(true);
    expect(flattenFileTree(ws.handle.getFiles()).some((f) => f.path.startsWith('KaTuro Backups/'))).toBe(true);
  });

  it('reads missing details from files, keeping only values that are really in them', async () => {
    const ws = createVirtualWorkspace('Class');
    ws.handle.saveVirtualFile('Slip.docx', new Uint8Array(await Packer.toArrayBuffer(new Document({ sections: [{ children: [
      new Paragraph('Learner: ____________'), new Paragraph('LRN: ____________'), new Paragraph('Guardian: ____________'),
    ] }] }))));
    ws.handle.saveVirtualFile('Info.txt', new TextEncoder().encode('Learner: Ben Reyes, LRN 123456789014. Guardian not stated.'));
    ws.files = ws.handle.getFiles();
    const { res, calls } = await run(ws, { path: 'Slip.docx', sourcePaths: ['Info.txt'] }, { answer: { Learner: 'Ben Reyes', LRN: '123456789014', Guardian: 'Maria Reyes' } });
    expect(calls).toEqual(['planner', 'fields']);
    expect(res.content).toMatch(/Filled 2 of 3 blank\(s\)/);
    expect(res.content).toMatch(/Left blank \(tell me what to put\): Guardian\./);   // the made-up guardian was dropped
    const t = docText(await readFileBytes(ws.handle, res.createdFiles[0].path));
    expect(t).toMatch(/Learner: Ben Reyes\nLRN: 123456789014\nGuardian: ____________/);
  });

  it('asks when it has nothing to fill with, or when the file has no blanks', async () => {
    const ws = createVirtualWorkspace('Class');
    ws.handle.saveVirtualFile('Slip.docx', new Uint8Array(await Packer.toArrayBuffer(new Document({ sections: [{ children: [new Paragraph('Name: ________'), new Paragraph('LRN: ________')] }] }))));
    ws.handle.saveVirtualFile('Plan.docx', new Uint8Array(await Packer.toArrayBuffer(new Document({ sections: [{ children: [new Paragraph('Lesson plan in Science 5')] }] }))));
    ws.files = ws.handle.getFiles();
    const a = await run(ws, { path: 'Slip.docx' });
    expect(a.res.content).toMatch(/Needs your input.*Slip\.docx has 2 blank\(s\): Name, LRN\. What should go in them\?/);
    expect(a.res.createdFiles).toHaveLength(0);
    clearAnswerMemory();
    const b = await run(ws, { path: 'Plan.docx' });
    expect(b.res.content).toMatch(/Needs your input.*could not find blanks to fill in Plan\.docx/);
  });

  it('a value with special characters and a blank split across runs', async () => {
    const xml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>'
      + '<w:p><w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve">Remarks: </w:t></w:r><w:r><w:t>___</w:t></w:r><w:r><w:rPr><w:i/></w:rPr><w:t>____</w:t></w:r></w:p>'
      + '<w:sectPr/></w:body></w:document>';
    const zip = new PizZip();
    zip.file('word/document.xml', xml);
    const bytes = zip.generate({ type: 'uint8array' });
    const { fields } = await scanWordForm(bytes);
    expect(fields).toEqual([{ id: 'f1', label: 'Remarks', kind: 'line' }]);
    const out = new PizZip(await fillWordForm(bytes, { f1: 'Passed <with> "honors" & more' })).file('word/document.xml').asText();
    expect(out).toContain('<w:b/></w:rPr><w:t xml:space="preserve">Remarks: </w:t>');      // label keeps its bold
    expect(out).toContain('Passed &lt;with&gt; "honors" &amp; more');
    expect(out).not.toMatch(/_{2,}/);
  });
});
