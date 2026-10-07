import { describe, it, expect } from 'vitest';
import { calendarPosition, calendarContext, manilaDate } from './schoolCalendar';
import { cleanCard, cardsFor, ruleCardsText, triggerList, CARD_LIMITS } from './ruleCards';
import { isCorrection, toolsOf, summarizeFeedback } from '../feedback';
import { plannerKnowledge, decideAction } from '../agent/deskAgent';
import { EXAM_CASES, EXAM_FILES, examOutcome, gradeCase, runTeacherExam } from '../agent/teacherExam';
import { TOOLS } from '../agent/registry';

describe('school calendar (DO 9, s. 2026)', () => {
  it('places dates in the right term and block', () => {
    expect(calendarPosition('2026-06-08')).toMatchObject({ schoolYear: '2026-2027', term: 1, block: 'opening' });
    expect(calendarPosition('2026-06-15')).toMatchObject({ term: 1, block: 'instructional' });
    expect(calendarPosition('2026-09-02')).toMatchObject({ term: 1, block: 'endOfTerm', daysToTermEnd: 13 });
    expect(calendarPosition('2026-09-15')).toMatchObject({ term: 1, block: 'endOfTerm', daysToTermEnd: 0 });
    expect(calendarPosition('2026-09-16')).toMatchObject({ term: 2, block: 'instructional' });
    expect(calendarPosition('2026-12-07')).toMatchObject({ term: 2, block: 'endOfTerm' });
    expect(calendarPosition('2026-12-25')).toMatchObject({ block: 'betweenTerms', nextTerm: 3, nextStart: '2027-01-04' });
    expect(calendarPosition('2027-03-24')).toMatchObject({ term: 3, block: 'endOfTerm' });
    expect(calendarPosition('2027-04-20')).toMatchObject({ block: 'eosyBreak', term: null });
  });

  it('never guesses outside a known school year', () => {
    expect(calendarPosition('2026-05-01')).toBeNull();
    expect(calendarPosition('2027-06-01')).toBeNull();
    expect(calendarContext('2030-01-01')).toBe('');
  });

  it('uses the Philippine date, not the computer clock', () => {
    // 11 PM in UTC on Sept 15 is already Sept 16 in Manila (Term 2).
    expect(manilaDate(new Date('2026-09-15T23:00:00Z'))).toBe('2026-09-16');
    expect(calendarPosition(new Date('2026-09-15T23:00:00Z'))).toMatchObject({ term: 2 });
  });

  it('gives the planner one short, sourced line', () => {
    const c = calendarContext('2026-10-07');
    expect(c).toMatch(/DepEd Order No\. 9, s\. 2026/);
    expect(c).toMatch(/Term 2, Instructional Block/);
    expect(c).toMatch(/"This term" means Term 2/);
    expect(c.length).toBeLessThan(700);
    expect(calendarContext('2026-12-10')).toMatch(/End-of-Term Block.*computing grades/);
  });
});

describe('rule cards', () => {
  const card = { id: 'c1', title: 'DLL weekly', triggers: 'DLL, daily lesson log', text: 'A DLL covers one week.', source: 'DepEd Order No. 42, s. 2016' };

  it('requires a title, the rule, a source and a trigger', () => {
    expect(cleanCard(card).card).toMatchObject({ id: 'c1', active: true });
    expect(cleanCard({ ...card, source: '' }).error).toMatch(/official source/);
    expect(cleanCard({ ...card, title: ' ' }).error).toMatch(/title/);
    expect(cleanCard({ ...card, text: '' }).error).toMatch(/rule/);
    expect(cleanCard({ ...card, triggers: 'a' }).error).toMatch(/trigger/);
    expect(cleanCard({ ...card, text: 'x'.repeat(5000) }).card.text).toHaveLength(CARD_LIMITS.text);
  });

  it('matches whole trigger words only, active cards only', () => {
    expect(triggerList('DLL; daily lesson log\nTOS')).toEqual(['dll', 'daily lesson log', 'tos']);
    expect(cardsFor('Gawa ka ng DLL po', [card])).toHaveLength(1);
    expect(cardsFor('make my daily lesson log', [card])).toHaveLength(1);
    expect(cardsFor('the DLLs folder name', [card])).toHaveLength(0); // "DLLs" is not "DLL"
    expect(cardsFor('make a DLL', [{ ...card, active: false }])).toHaveLength(0);
    expect(ruleCardsText('make a quiz', [card])).toBe('');
  });

  it('cites the source and stays under the size cap', () => {
    expect(ruleCardsText('make a DLL', [card])).toMatch(/DLL weekly: A DLL covers one week\. \(Source: DepEd Order No\. 42, s\. 2016\)/);
    const many = Array.from({ length: 10 }, (_, i) => ({ ...card, id: `c${i}`, text: 'y'.repeat(1000) }));
    expect(ruleCardsText('DLL', many).length).toBeLessThanOrEqual(CARD_LIMITS.sentChars);
  });

  it('reach the planner with the calendar, only when relevant', () => {
    const now = new Date('2026-10-07T09:00:00+08:00');
    const k = plannerKnowledge('make a DLL for Science 7', [], '2026-2027', now, [card]);
    expect(k).toMatch(/School calendar/);
    expect(k).toMatch(/Official rule cards/);
    expect(plannerKnowledge('make a quiz', [], '2026-2027', now, [card])).not.toMatch(/rule cards/);
  });
});

describe('teacher feedback', () => {
  it('recognizes corrections in English and Filipino', () => {
    for (const t of ['No, I meant Grade 6', 'hindi po, yung SF2', 'Mali, Term 2 dapat', 'wrong file', "that's not what I asked"]) expect(isCorrection(t)).toBe(true);
    for (const t of ['now make the slides', 'November grades', 'noted, thanks']) expect(isCorrection(t)).toBe(false);
  });

  it('keeps only tool names', () => {
    expect(toolsOf({ artifacts: [{ sourceTool: 'edit_file' }, { sourceTool: 'edit_file' }], toolNames: ['analyze_scores'] })).toEqual(['edit_file', 'analyze_scores']);
    expect(toolsOf(undefined)).toEqual([]);
  });

  it('summarizes the last 30 days for the admin', () => {
    const now = new Date('2026-10-07T00:00:00Z');
    const day = (n) => new Date(now.getTime() - n * 86400000);
    const s = summarizeFeedback([
      { rating: 'up', at: day(1), tools: ['write_document'] },
      { rating: 'down', reason: 'Wrong file or data', at: day(2), tools: ['edit_file'], comment: 'it opened SF1' },
      { rating: 'correction', reason: 'Teacher corrected KaTuro', at: day(3), tools: ['edit_file'] },
      { rating: 'down', reason: 'Old', at: day(45), tools: ['merge_pdfs'] },
    ], { now });
    expect(s).toMatchObject({ up: 1, down: 1, corrections: 1 });
    expect(s.tools[0]).toEqual(['edit_file', 2]);
    expect(s.reasons.map((r) => r[0])).not.toContain('Old');
    expect(s.comments).toHaveLength(1);
  });
});

describe('decideAction: ask, confirm or run', () => {
  const dll = { tool: 'write_document', args: { docType: 'dll' } };
  const high = { confidence: 'high', missing: [], choices: [] };

  it('answers when there is nothing to run', () => {
    expect(decideAction({ tasks: [] }).action).toBe('answer');
  });
  it('asks for a missing grade or subject before the AI writes anything', () => {
    const d = decideAction({ tasks: [dll], check: high, prompt: 'gawa ka ng DLL', teacher: { teachingLoad: 'Science 7' } });
    expect(d.action).toBe('ask');
    expect(d.gap.choices).toEqual(['Science 7']);
  });
  it('asks when the planner is unsure, confirms big jobs when only fairly sure', () => {
    const full = { tool: 'write_document', args: { docType: 'dll', subject: 'Science', gradeLevel: 'Grade 7' } };
    expect(decideAction({ tasks: [full], check: { ...high, confidence: 'low' } }).action).toBe('ask');
    expect(decideAction({ tasks: [full], check: { ...high, missing: ['week'] } }).action).toBe('ask');
    expect(decideAction({ tasks: [full], check: { ...high, confidence: 'medium' } }).action).toBe('confirm');
    expect(decideAction({ tasks: [full], check: { ...high, confidence: 'medium' }, autoApprove: true }).action).toBe('run');
    expect(decideAction({ tasks: [full], check: high }).action).toBe('run');
  });
  it('runs an approved plan without asking again', () => {
    expect(decideAction({ tasks: [dll], check: { ...high, confidence: 'low' }, confirmed: true }).action).toBe('run');
  });
});

describe('teacher exam', () => {
  it('every case is well formed and names real tools and files', () => {
    const ids = new Set();
    const paths = new Set(EXAM_FILES.map((f) => f.path));
    expect(EXAM_CASES.length).toBeGreaterThanOrEqual(30);
    for (const c of EXAM_CASES) {
      expect(ids.has(c.id), c.id).toBe(false);
      ids.add(c.id);
      expect(c.expect.action.length, c.id).toBeGreaterThan(0);
      for (const t of c.expect.tools || []) expect(TOOLS[t], `${c.id}: ${t}`).toBeTruthy();
      for (const p of c.attached || []) expect(paths.has(p), `${c.id}: ${p}`).toBe(true);
    }
  });

  it('a question in the reply counts as asking', () => {
    expect(examOutcome({ action: 'answer' }, { confidence: 'high', missing: [], choices: [] }, 'Which section po?')).toBe('ask');
    expect(examOutcome({ action: 'answer' }, { confidence: 'high', missing: [], choices: ['Grade 5', 'Grade 6'] }, 'Sure.')).toBe('ask');
    expect(examOutcome({ action: 'answer' }, { confidence: 'high', missing: [], choices: [] }, 'The passing grade is 75.')).toBe('answer');
    expect(examOutcome({ action: 'confirm' }, null, '')).toBe('confirm');
  });

  it('grades the outcome and the tool', () => {
    const c = { expect: { action: ['run', 'confirm'], tools: ['analyze_scores'] } };
    expect(gradeCase(c, 'run', [{ tool: 'analyze_scores' }]).pass).toBe(true);
    expect(gradeCase(c, 'run', [{ tool: 'write_document' }]).why).toMatch(/expected analyze_scores, planned write_document/);
    expect(gradeCase(c, 'ask', []).why).toMatch(/expected run or confirm, got ask/);
  });

  it('runs every case through the planner and the same decision as a chat turn', async () => {
    const seen = [];
    // A fake planner: plans the right tool for the item analysis, asks for everything else.
    const call = async ({ prompt }) => {
      seen.push(prompt);
      if (/item analysis please/.test(prompt)) return { reply: 'Running it.', confidence: 'high', tasks: [{ tool: 'analyze_scores', args: { path: 'Grade 7 Sampaguita - Quiz 1 Scores.xlsx' } }] };
      return { reply: 'Which one po?', confidence: 'low', missing: ['details'], tasks: [] };
    };
    const progress = [];
    const r = await runTeacherExam({ call, onProgress: (row) => progress.push(row.id), now: new Date('2026-10-07T09:00:00+08:00') });
    expect(r.total).toBe(EXAM_CASES.length);
    expect(progress).toHaveLength(EXAM_CASES.length);
    expect(r.rows.find((x) => x.id === 'item-analysis')).toMatchObject({ pass: true, outcome: 'run', tools: ['analyze_scores'] });
    expect(r.rows.find((x) => x.id === 'greet')).toMatchObject({ pass: true, outcome: 'answer' }); // no AI call
    expect(r.rows.find((x) => x.id === 'quiz-bare')).toMatchObject({ pass: true, outcome: 'ask' });
    expect(r.rows.find((x) => x.id === 'passing-grade').pass).toBe(false); // it asked instead of answering
    // The planner sees the sample folder and the calendar, never learner data.
    expect(seen.join('\n')).toMatch(/Grades\/Grade 5 Rizal - Math Term 1\.xlsx/);
    expect(seen.some((p) => /School calendar/.test(p))).toBe(true);
  });

  it('can be stopped and survives an AI error', async () => {
    const ctrl = new AbortController();
    let n = 0;
    const call = async () => {
      n += 1;
      if (n === 2) ctrl.abort();
      throw new Error('AI busy');
    };
    const r = await runTeacherExam({ call, signal: ctrl.signal });
    expect(r.total).toBeLessThan(EXAM_CASES.length);
    expect(r.rows.filter((x) => x.outcome === 'error').every((x) => x.why === 'AI busy')).toBe(true);
  });
});
