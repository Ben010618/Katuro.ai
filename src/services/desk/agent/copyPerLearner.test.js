import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as XLSX from 'xlsx';
import PizZip from 'pizzip';
import { Document, Packer, Paragraph, TextRun } from 'docx';
import { callGeminiProxy } from '../../geminiConfig';
import { runDeskAgentTurn, clearAnswerMemory } from './deskAgent';
import { resetTaskActionSupport } from './llm';
import { createVirtualWorkspace, readFileBytes, flattenFileTree } from '../../localFileSystem';
import { prepareMergeTemplate, renderMergeCombined, firstNameFirst, mapMergeFields } from '../generators/mailMerge';

vi.mock('../../geminiConfig', () => ({ callGeminiProxy: vi.fn() }));

const docxText = (bytes) => {
  const xml = new PizZip(bytes).file('word/document.xml').asText();
  return xml.replace(/<w:br w:type="page"\/>/g, '\n=PAGE=\n').replace(/<\/w:p>/g, '\n').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/\n+/g, '\n').trim();
};
async function certificate(lines) {
  const doc = new Document({ sections: [{ children: lines.map((l) => new Paragraph({ children: (Array.isArray(l) ? l : [l]).map((t) => new TextRun({ text: t, bold: /\[|«|JUAN/.test(t) })) })) }] });
  return new Uint8Array(await Packer.toArrayBuffer(doc));
}
const classList = (rows) => {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'List');
  return new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }));
};
const LIST = [['No.', "Learner's Name", 'LRN', 'Award'], [1, 'Dela Cruz, Juan P.', '123456789012', 'With Honors'], [2, 'Santos, Maria A.', '123456789013', 'With High Honors'], [3, 'Reyes, Ben', '123456789014', '']];

describe('one Word copy per learner', () => {
  beforeEach(() => { resetTaskActionSupport(); clearAnswerMemory(); callGeminiProxy.mockReset(); });

  const run = async (ws, args, prompt = 'make a certificate for each learner') => {
    callGeminiProxy.mockImplementation(async () => ({ text: JSON.stringify({ confidence: 'high', reply: 'Sige po.', tasks: [{ id: 't1', tool: 'copy_per_learner', args }] }) }));
    return runDeskAgentTurn({ prompt, workspace: ws, user: { uid: 'u1' }, profile: { fullName: 'Ana Reyes', school: 'Dayap Elementary School' }, autoApprove: true });
  };

  it('fills [Name], [Award] and [School] for every learner: one combined file (a page each) plus separate files', async () => {
    const ws = createVirtualWorkspace('Awards');
    ws.handle.saveVirtualFile('Certificate.docx', await certificate(['CERTIFICATE OF RECOGNITION', 'is awarded to', '[Name]', 'for being [Award]', 'Given at [School]']));
    ws.handle.saveVirtualFile('Class List.xlsx', classList(LIST));
    ws.files = ws.handle.getFiles();
    const res = await run(ws, { templatePath: 'Certificate.docx', listPath: 'Class List.xlsx', nameOrder: 'first-last' });
    expect(res.content).toMatch(/Made 3 copies of Certificate\.docx/);
    expect(res.content).toMatch(/\[Name\] ← column "Learner's Name"; \[Award\] ← column "Award"; \[School\] ← "Dayap Elementary School"/);
    expect(res.content).toMatch(/left blank where the class list has no value: \[Award\] for 1 learner/);
    const combined = res.createdFiles.find((f) => f.name === 'Certificate - all learners.docx');
    const text = docxText(await readFileBytes(ws.handle, combined.path));
    expect(text.split('=PAGE=')).toHaveLength(3);                         // 3 learners, 2 page breaks
    expect(text).toMatch(/Juan P\. Dela Cruz\nfor being With Honors\nGiven at Dayap Elementary School/);
    expect(text).toMatch(/Maria A\. Santos\nfor being With High Honors/);
    const separate = flattenFileTree(ws.handle.getFiles()).filter((f) => f.path.includes('Certificate per learner/'));
    expect(separate.map((f) => f.name).sort()).toEqual(['Certificate - Ben Reyes.docx', 'Certificate - Juan P. Dela Cruz.docx', 'Certificate - Maria A. Santos.docx']);
    expect(docxText(await readFileBytes(ws.handle, 'Certificate.docx'))).toMatch(/\[Name\]/); // template unchanged
  });

  it('a sample name in the template can stand for each learner\'s name', async () => {
    const ws = createVirtualWorkspace('Awards');
    ws.handle.saveVirtualFile('Letter.docx', await certificate(['Dear Parent of', 'JUAN DELA CRUZ', 'Please attend the meeting.']));
    ws.handle.saveVirtualFile('List.xlsx', classList(LIST));
    ws.files = ws.handle.getFiles();
    const res = await run(ws, { templatePath: 'Letter.docx', listPath: 'List.xlsx', replaceText: { 'JUAN DELA CRUZ': 'Name' }, output: 'combined' });
    const text = docxText(await readFileBytes(ws.handle, res.createdFiles.find((f) => /all learners/.test(f.name)).path));
    expect(text).toMatch(/Dear Parent of\nDela Cruz, Juan P\./);
    expect(text).not.toMatch(/JUAN DELA CRUZ/);
  });

  it('asks instead of guessing: a template without fields, or a field with no matching column', async () => {
    const ws = createVirtualWorkspace('Awards');
    ws.handle.saveVirtualFile('Plain.docx', await certificate(['Certificate of Participation']));
    ws.handle.saveVirtualFile('Odd.docx', await certificate(['[Name] of [Section]']));
    ws.handle.saveVirtualFile('List.xlsx', classList(LIST));
    ws.files = ws.handle.getFiles();
    const none = await run(ws, { templatePath: 'Plain.docx', listPath: 'List.xlsx' });
    expect(none.content).toMatch(/Needs your input.*has no fields to fill.*\[Name\]/);
    clearAnswerMemory();
    const odd = await run(ws, { templatePath: 'Odd.docx', listPath: 'List.xlsx' });
    expect(odd.content).toMatch(/Needs your input.*I don't know what to put in \[Section\]\. Your class list has: No\., Learner's Name, LRN, Award/);
    expect(odd.createdFiles).toHaveLength(0);
  });

  it('markers split across formatting runs and names inside a text box are handled', async () => {
    const run2 = (t, bold) => `<w:r>${bold ? '<w:rPr><w:b/></w:rPr>' : ''}<w:t xml:space="preserve">${t}</w:t></w:r>`;
    const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>`
      + `<w:p>${run2('Award: «Aw', true)}${run2('ard»', false)}</w:p>`
      + `<w:p><w:r><w:pict><v:shape xmlns:v="urn:schemas-microsoft-com:vml"><v:textbox><w:txbxContent><w:p>${run2('[Name]', true)}</w:p></w:txbxContent></v:textbox></v:shape></w:pict></w:r></w:p>`
      + '<w:sectPr><w:pgSz w:w="12240" w:h="18720"/></w:sectPr></w:body></w:document>';
    const zip = new PizZip();
    zip.file('[Content_Types].xml', '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
    zip.file('word/document.xml', xml);
    const prepared = await prepareMergeTemplate(new Uint8Array(zip.generate({ type: 'uint8array' })));
    expect(prepared.fields).toEqual(['Award', 'Name']);
    const out = await renderMergeCombined(prepared.bytes, [{ Award: 'Best in Math', Name: 'Ana' }, { Award: 'Best in Science', Name: 'Ben' }]);
    const docXml = new PizZip(out).file('word/document.xml').asText();
    expect(docXml).toContain('<w:txbxContent>');                            // the text box is still there
    expect(docXml.match(/Best in Math|Best in Science|>Ana<|>Ben</g)).toHaveLength(4);
    expect(docXml.match(/<w:sectPr/g)).toHaveLength(1);                     // page settings kept once (long bond)
  });

  it('helpers: names first-name-first, field matching', () => {
    expect(firstNameFirst('Dela Cruz, Juan P.')).toBe('Juan P. Dela Cruz');
    expect(firstNameFirst('1. Ana Reyes')).toBe('Ana Reyes');
    expect(mapMergeFields(['Name', 'LRN', 'School'], ["Learner's Name", 'LRN'], {}).missing).toEqual(['School']);
  });
});
