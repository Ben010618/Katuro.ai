import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as XLSX from 'xlsx';
import { Document, Packer, Paragraph } from 'docx';
import { callGeminiProxy } from '../../geminiConfig';
import { runDeskAgentTurn, clearAnswerMemory } from './deskAgent';
import { resetTaskActionSupport } from './llm';
import { createVirtualWorkspace, flattenFileTree } from '../../localFileSystem';
import { classify, consistentName, tidyName, folderFor } from './organizeFolder';

vi.mock('../../geminiConfig', () => ({ callGeminiProxy: vi.fn() }));

const xlsx = (rows) => { const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'S'); return new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' })); };
const docx = async (lines) => new Uint8Array(await Packer.toArrayBuffer(new Document({ sections: [{ children: lines.map((l) => new Paragraph(l)) }] })));

describe('organize the folder (as a copy)', () => {
  beforeEach(() => { resetTaskActionSupport(); clearAnswerMemory(); callGeminiProxy.mockReset(); });

  it('reads grade, section, term, subject and kind; tidy and consistent names', () => {
    expect(classify('Grade 5 Rizal/Science_Class Record_Q1.xlsx')).toEqual({ grade: 'Grade 5', section: 'Rizal', term: 'Term 1', subject: 'Science', kind: 'Class Record', form: '' });
    expect(classify('grades/G5-Mabini Math Term 2 FINAL FINAL.xlsx')).toMatchObject({ grade: 'Grade 5', section: 'Mabini', term: 'Term 2', subject: 'Mathematics' });
    expect(classify('SF2 October.xlsx', 'School Form 2 Daily Attendance\nGrade 6 - Bonifacio\nQuarter 2')).toMatchObject({ grade: 'Grade 6', section: 'Bonifacio', term: 'Term 2', kind: 'Attendance', form: 'SF2' });
    expect(tidyName('Copy of DLL_week3 FINAL final (2)')).toBe('DLL week3');
    expect(consistentName(classify('Grade 5 Rizal/Science_Class Record_Q1.xlsx'), 'Science_Class Record_Q1.xlsx')).toBe('Science - Class Record - Grade 5 Rizal - Term 1.xlsx');
    expect(consistentName({ grade: '', section: '', term: '', subject: '', kind: '', form: '' }, 'my_notes (1).docx')).toBe('my notes.docx');
    expect(folderFor({ grade: 'Grade 5', section: 'Rizal', term: '' })).toBe('Grade 5/Rizal');
    expect(folderFor({ grade: '' })).toBe('Unsorted');
  });

  it('copies into Grade / Section / Term folders, copies duplicates once, leaves originals where they are', async () => {
    const ws = createVirtualWorkspace('Class');
    const record = xlsx([['CLASS RECORD'], ['Learner', 'WW1'], ['Dela Cruz, Juan', 9]]);
    ws.handle.saveVirtualFile('Grade 5 Rizal/Science_Class Record_Q1.xlsx', record);
    ws.handle.saveVirtualFile('Copy of Science_Class Record_Q1.xlsx', record);
    ws.handle.saveVirtualFile('grades/G5-Rizal Math Term 1 FINAL FINAL.xlsx', xlsx([['Name', 'Score'], ['Reyes, Ben', 7]]));
    ws.handle.saveVirtualFile('SF2 October.xlsx', xlsx([['School Form 2 Daily Attendance'], ['Grade 6 - Bonifacio'], ['Quarter 2']]));
    ws.handle.saveVirtualFile('DLL_week3 (2).docx', await docx(['DAILY LESSON LOG', 'Grade 5 - Rizal', 'Term 1, Week 3', 'English']));
    ws.handle.saveVirtualFile('random notes.docx', await docx(['Things to buy for the classroom']));
    ws.files = ws.handle.getFiles();
    const before = flattenFileTree(ws.handle.getFiles()).map((f) => f.path).sort();
    callGeminiProxy.mockImplementation(async () => ({ text: JSON.stringify({ confidence: 'high', reply: 'Sige po.', tasks: [{ id: 't1', tool: 'organize_folder', args: {} }] }) }));
    const res = await runDeskAgentTurn({ prompt: 'organize my folder', workspace: ws, user: { uid: 'u1' }, profile: { fullName: 'Ana Reyes' }, autoApprove: true });
    expect(res.content).toMatch(/1 exact duplicate\(s\) were copied only once: Copy of Science_Class Record_Q1\.xlsx = Grade 5 Rizal\/Science_Class Record_Q1\.xlsx/);
    expect(res.content).toMatch(/in "Unsorted" \(no grade in the name or first lines\)/);
    expect(res.content).toMatch(/Your original files were not moved, renamed or deleted/);
    const after = flattenFileTree(ws.handle.getFiles()).map((f) => f.path);
    for (const p of before) expect(after).toContain(p);                       // originals still there
    const made = after.filter((p) => p.includes('/Organized folder/')).map((p) => p.replace(/^.*\/Organized folder\//, '')).sort();
    expect(made).toEqual(expect.arrayContaining([
      'Grade 5/Rizal/Term 1/Science - Class Record - Grade 5 Rizal - Term 1.xlsx',
      'Grade 5/Rizal/Term 1/Mathematics - Grades - Grade 5 Rizal - Term 1.xlsx',      // it sits in a "grades" folder
      'Grade 5/Rizal/Term 1/English - DLL - Grade 5 Rizal - Term 1.docx',
      'Grade 6/Bonifacio/Term 2/SF2 - Grade 6 Bonifacio - Term 2.xlsx',
      'Unsorted/random notes.docx',
      'Organized folder - what went where.xlsx',
    ]));
    expect(made.filter((p) => /Science - Class Record/.test(p))).toHaveLength(1);  // the duplicate once
  });
});
