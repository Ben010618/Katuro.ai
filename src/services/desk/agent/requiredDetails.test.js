import { describe, it, expect, vi, beforeEach } from 'vitest';
import { callGeminiProxy } from '../../geminiConfig';
import { runDeskAgentTurn, clearAnswerMemory } from './deskAgent';
import { resetTaskActionSupport } from './llm';
import { createVirtualWorkspace } from '../../localFileSystem';
import { gradeInText, subjectInText, parseTeachingLoad, missingDetails } from './requiredDetails';
import { teacherFactsForAI } from '../../teacherInfo';

vi.mock('../../geminiConfig', () => ({ callGeminiProxy: vi.fn() }));

beforeEach(() => {
  resetTaskActionSupport();
  clearAnswerMemory();
  callGeminiProxy.mockReset();
});

describe('required details: never assume the subject or grade', () => {
  it('finds the grade and learning area in what the teacher wrote', () => {
    expect([gradeInText('DLL for Grade 7'), gradeInText('g10 quiz'), gradeInText('Kinder worksheet'), gradeInText('quiz on cells')]).toEqual([7, 10, 0, null]);
    expect(subjectInText('a DLL in Science about cells')).toBe('Science');
    expect(subjectInText('a lesson about the water cycle')).toBeNull();
  });

  it("tap answers come from the teacher's own teaching load", () => {
    expect(parseTeachingLoad('Science 7 – A, B; Math 8 – C').map((l) => l.label)).toEqual(['Science 7', 'Math 8']);
    expect(parseTeachingLoad('')).toEqual([]);
  });

  it('asks unless the teacher said it (this message or the last few), or the source files carry it', () => {
    const dll = (args) => ({ tool: 'write_document', args: { docType: 'dll', title: 'DLL', instructions: 'Week 3 on cells', ...args } });
    const teacher = { teachingLoad: 'Science 7 – A, B; Math 8 – C' };
    expect(missingDetails(dll({}), { prompt: 'gawa ng DLL', teacher })).toEqual({
      question: 'Which learning area and grade level is this Daily Lesson Log for?', missing: ['learning area', 'grade level'], choices: ['Science 7', 'Math 8'],
    });
    // A subject the AI filled in by itself (even from the profile) is not the teacher's word.
    expect(missingDetails(dll({ subject: 'Science' }), { prompt: 'DLL for Grade 7', teacher }).question).toBe('Which learning area is this Daily Lesson Log for?');
    expect(missingDetails(dll({ subject: 'Science', gradeLevel: 'Grade 7' }), { prompt: 'gawa ka ng DLL', teacher }).missing).toEqual(['learning area', 'grade level']);
    // The tap answer "Science 7", or an earlier message, counts.
    expect(missingDetails(dll({}), { prompt: 'Science 7', teacher })).toBeNull();
    expect(missingDetails(dll({}), { prompt: 'Week 3 po', history: [{ role: 'user', content: 'DLL for Math 8' }], teacher })).toBeNull();
    expect(missingDetails(dll({}), { prompt: 'DLL sa Filipino, Baitang 7', teacher })).toBeNull();
    expect(missingDetails(dll({}), { prompt: 'DLL for Science 7 (Grade 7)', teacher })).toBeNull();
    expect(missingDetails(dll({}), { prompt: 'DLL in Science', teacher }).question).toBe('Which grade level is this Daily Lesson Log for?');
    // Built from the teacher's own files: the files carry the details.
    expect(missingDetails(dll({ sourcePaths: ['Lesson.docx'] }), { prompt: 'make a DLL from this', teacher })).toBeNull();
    // Letters and reports do not need a learning area.
    expect(missingDetails({ tool: 'write_document', args: { docType: 'letter', instructions: 'invite parents' } }, { prompt: 'letter' })).toBeNull();
    expect(missingDetails({ tool: 'make_slides', args: {} }, { prompt: 'slides' }).question).toBe('What topic should the slides be about?');
  });

  it('end to end: a DLL with no subject or grade asks first, runs nothing, spends no extra AI call', async () => {
    const ws = createVirtualWorkspace('Folder');
    ws.files = ws.handle.getFiles();
    callGeminiProxy.mockImplementation(async () => ({ text: JSON.stringify({ confidence: 'high', reply: 'Gagawin ko na po!', tasks: [{ id: 't1', tool: 'write_document', args: { docType: 'dll', title: 'DLL', instructions: 'about photosynthesis' } }] }) }));
    const res = await runDeskAgentTurn({
      prompt: 'gawa ka ng DLL', workspace: ws, user: { uid: 'u1' },
      profile: { fullName: 'Ana Reyes', teachingLoad: 'Science 7 – A, B; Math 8 – C' },
    });
    expect(res.content).toBe('**Needs your input** — Which learning area and grade level is this Daily Lesson Log for?');
    expect(res.choices).toEqual(['Science 7', 'Math 8']);
    expect(res.createdFiles).toHaveLength(0);
    expect(callGeminiProxy).toHaveBeenCalledTimes(1); // only the planner
  });
});

describe('the teacher profile tells the AI who the teacher is to their classes', () => {
  it('advisory class and teaching load are facts for the AI (only when filled in)', () => {
    const facts = teacherFactsForAI({ fullName: 'Ana Reyes', advisoryClass: 'Grade 5 – Rizal', teachingLoad: 'Science 5 – Rizal, Mabini' });
    expect(facts).toMatch(/Class adviser of: Grade 5 – Rizal/);
    expect(facts).toMatch(/Teaching load \(subjects and sections\): Science 5 – Rizal, Mabini/);
    expect(teacherFactsForAI({ fullName: 'Ana Reyes' })).not.toMatch(/adviser|Teaching load/);
  });
});
