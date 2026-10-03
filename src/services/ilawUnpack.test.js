import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./geminiConfig', () => ({ callGeminiProxy: vi.fn() }));

const { callGeminiProxy } = await import('./geminiConfig');
const { unpackCompetency, __test } = await import('./ai');

const base = {
  competencyText: 'Identify the indicators of a chemical reaction',
  subject: 'Science', gradeLevel: 'Grade 7', term: 'Term 1',
  numberOfDays: 2, selectedDates: ['Mon, Oct 6', 'Tue, Oct 7'],
};
const reply = (obj) => callGeminiProxy.mockResolvedValueOnce({ text: JSON.stringify(obj), finishReason: 'STOP' });

beforeEach(() => callGeminiProxy.mockReset());

describe('ILAW unpacking: "AI response missing competencyCeiling"', () => {
  it('works out the ceiling from the AI\'s own session levels when the label is missing', async () => {
    reply({ sessions: [{ day: 1, bloomsLevel: 'Understand', objective: 'x' }, { day: 2, bloomsLevel: 'Apply — Review and Practice', objective: 'y' }] });
    const out = await unpackCompetency(base);
    expect(out.competencyCeiling).toBe('Apply');
    expect(out.fullLadder).toEqual(['Remember', 'Understand', 'Apply']);
  });

  it('says plainly when the text is not a competency (no guessing, no pointless retry)', async () => {
    reply({ notACompetency: true, reason: 'The text is an instruction, not something a learner does.' });
    const err = await unpackCompetency({ ...base, competencyText: 'Paste the content standards from the Curriculum Guide' }).catch((e) => e);
    expect(err.code).toBe('NOT_A_COMPETENCY');
    expect(err.message).toMatch(/instruction/);
  });

  it('refuses when neither the ceiling nor any session level is a Bloom level', async () => {
    reply({ competencyCeiling: '', sessions: [{ day: 1, bloomsLevel: 'Recall facts', objective: 'x' }, { day: 2, bloomsLevel: '???', objective: 'y' }] });
    await expect(unpackCompetency(base)).rejects.toMatchObject({ code: 'NOT_A_COMPETENCY' });
  });

  it('keeps a valid ceiling and normalizes spelling', async () => {
    reply({ competencyCeiling: 'analyse', fullLadder: ['Remember', 'Understand', 'Apply', 'Analyze'], sessions: [{ day: 1, bloomsLevel: 'Apply', objective: 'a' }, { day: 2, bloomsLevel: 'Analyze', objective: 'b' }] });
    expect((await unpackCompetency(base)).competencyCeiling).toBe('Analyze');
  });

  it('never sends a made-up subject, grade or term', async () => {
    reply({ competencyCeiling: 'Apply', sessions: [{ day: 1, bloomsLevel: 'Understand', objective: 'a' }, { day: 2, bloomsLevel: 'Apply', objective: 'b' }] });
    await unpackCompetency({ ...base, subject: '', gradeLevel: '', term: '' });
    const prompt = callGeminiProxy.mock.calls[0][0].contents[0].parts[0].text;
    expect(prompt).toMatch(/Subject: not given\nGrade Level: not given\nTerm: not given/);
    expect(prompt).not.toMatch(/Subject: Science/);
  });

  it('one session per teaching day: extras are dropped, missing ones are retried', async () => {
    reply({ competencyCeiling: 'Apply', sessions: [{ bloomsLevel: 'Remember', objective: 'a' }, { bloomsLevel: 'Apply', objective: 'b' }, { bloomsLevel: 'Apply', objective: 'c' }] });
    expect((await unpackCompetency(base)).sessions).toHaveLength(2);
    reply({ competencyCeiling: 'Apply', sessions: [{ bloomsLevel: 'Apply', objective: 'a' }] });
    await expect(unpackCompetency(base)).rejects.toThrow(/1 of 2 sessions/);
    reply({ competencyCeiling: 'Apply', sessions: [{ bloomsLevel: 'Apply', objective: 'a' }, { bloomsLevel: '', objective: 'b' }] });
    await expect(unpackCompetency(base)).rejects.toThrow(/without a Bloom level/);
  });

  it('normalizes Bloom levels', () => {
    expect(__test.normalizeBloom('APPLY — Enrichment Activity')).toBe('Apply');
    expect(__test.highestBloom(['Remember', 'Create', 'Apply'])).toBe('Create');
    expect(__test.highestBloom(['', 'nonsense'])).toBe('');
  });
});
