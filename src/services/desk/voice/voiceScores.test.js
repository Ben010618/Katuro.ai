import { describe, it, expect } from 'vitest';
import {
  parseNamedScores, parseListScores, matchSpokenName, checkVoiceReply,
  emptySession, addNamedEntries, addListValues, resolveIssue, setScore, scoreProblem, buildScorePlan,
  NAMED_SCORES_PROMPT, LIST_SCORES_PROMPT,
} from './voiceScores';

const cell = (row) => ({ sheet: 'TERM1', cell: `F${row}` });
const L = (name, row, before = null) => ({ name, values: { ww3: before }, cells: { ww3: cell(row) } });
const ROSTER = [
  L('ALVAREZ, JUAN P.', 12),
  L('BAUTISTA, ANA M.', 13),
  L('CRUZ, PEDRO', 14),
  L('DE LA CRUZ, MARIA', 15),
  L('GARCIA, LIZA', 16, 9),
  L('SANTOS, MARK', 17),
  L('SANTOS, JOHN', 18),
];
const COL = { key: 'ww3', header: 'WW3' };

describe('voice score encoding', () => {
  it('prompts are English only, strict line formats, and never guess', () => {
    for (const p of [NAMED_SCORES_PROMPT, LIST_SCORES_PROMPT]) {
      expect(p).toMatch(/English only/);
      expect(p).toMatch(/Do not add, fix or guess/);
      expect(p).toMatch(/digits/);
    }
    expect(NAMED_SCORES_PROMPT).toMatch(/<name> = <score>/);
    expect(() => checkVoiceReply('[not english]')).toThrow(/English only/);
    expect(checkVoiceReply('[no speech]')).toBe('');
  });

  it('parses "name = score" lines, absent, unclear, and the plain fallback', () => {
    expect(parseNamedScores('Alvarez = 18\nBautista = 15.5\nDe la Cruz = absent\nGarcia = ?\nSantos 17\n')).toEqual([
      { name: 'Alvarez', value: 18 },
      { name: 'Bautista', value: 15.5 },
      { name: 'De la Cruz', value: 'absent' },
      { name: 'Garcia', value: null },
      { name: 'Santos', value: 17 },
    ]);
  });

  it('parses list values: digits, absent, skip, unclear', () => {
    expect(parseListScores('18\n15\nabsent\nskip\nfifteen\n20')).toEqual([18, 15, 'absent', 'skip', null, 20]);
  });

  it('matches surnames exactly: "Cruz" is CRUZ, not DE LA CRUZ; "De la Cruz" is DE LA CRUZ', () => {
    expect(matchSpokenName('Cruz', ROSTER)).toEqual({ status: 'ok', index: 2, how: 'surname' });
    expect(matchSpokenName('De la Cruz', ROSTER)).toEqual({ status: 'ok', index: 3, how: 'surname' });
    expect(matchSpokenName('Dela Cruz', ROSTER)).toMatchObject({ status: 'ok', index: 3 });
  });

  it('two learners with the same surname: asks, unless the first name is said', () => {
    expect(matchSpokenName('Santos', ROSTER)).toEqual({ status: 'ambiguous', candidates: [5, 6] });
    expect(matchSpokenName('Mark Santos', ROSTER)).toEqual({ status: 'ok', index: 5, how: 'name' });
    expect(matchSpokenName('Santos John', ROSTER)).toEqual({ status: 'ok', index: 6, how: 'name' });
  });

  it('close spelling only with one clear winner; strangers are unknown', () => {
    expect(matchSpokenName('Bautesta', ROSTER)).toEqual({ status: 'ok', index: 1, how: 'close' });
    expect(matchSpokenName('Reyes', ROSTER)).toEqual({ status: 'unknown', candidates: [] });
    expect(matchSpokenName('', ROSTER).status).toBe('unknown');
  });

  it('a close-sounding name is a question to confirm, never an automatic match', () => {
    const s = addNamedEntries(emptySession(), [{ name: 'Bautesta', value: 15 }], ROSTER);
    expect(s.assignments).toEqual({});
    expect(s.issues).toMatchObject([{ kind: 'confirm', heard: 'Bautesta', value: 15, candidates: [1] }]);
    expect(resolveIssue(s, s.issues[0].id, 1).assignments[1].value).toBe(15);
  });

  it('typed scores keep exactly what was typed ("1." is not turned into 1)', () => {
    let s = setScore(emptySession(), 0, '1.');
    expect(s.assignments[0]).toMatchObject({ value: '1.', text: '1.' });
    expect(scoreProblem(s.assignments[0].value, 20)).toBe('Not a score');
    s = setScore(s, 0, '1.5');
    expect(s.assignments[0]).toMatchObject({ value: 1.5, text: '1.5' });
    s = setScore(s, 0, 'Absent');
    expect(s.assignments[0].value).toBe('absent');
  });

  it('named clips: matched scores assigned, questions kept, later score replaces earlier', () => {
    let s = addNamedEntries(emptySession(), parseNamedScores('Alvarez = 18\nSantos = 17\nReyes = 12\nGarcia = ?'), ROSTER);
    expect(s.assignments).toEqual({ 0: { value: 18, heard: 'Alvarez', replaced: undefined } });
    expect(s.issues.map((i) => [i.kind, i.heard, i.candidates])).toEqual([['ambiguous', 'Santos', [5, 6]], ['unknown', 'Reyes', []], ['no-score', 'Garcia', [4]]]);
    s = addNamedEntries(s, [{ name: 'Alvarez', value: 19 }], ROSTER);
    expect(s.assignments[0]).toEqual({ value: 19, heard: 'Alvarez', replaced: 18 });
    s = resolveIssue(s, s.issues[0].id, 6); // teacher: that Santos was John
    expect(s.assignments[6].value).toBe(17);
    s = resolveIssue(s, s.issues[0].id, null); // dismiss "Reyes"
    s = resolveIssue(s, s.issues[0].id, 4, 11); // Garcia's score typed in
    expect(s.issues).toEqual([]);
    expect(s.assignments[4].value).toBe(11);
  });

  it('list clips fill from the cursor; skip moves on; unclear asks; extras are questions', () => {
    let s = addListValues(emptySession(), [18, 'skip', null, 'absent'], ROSTER);
    expect(s.cursor).toBe(4);
    expect(s.assignments).toMatchObject({ 0: { value: 18 }, 3: { value: 'absent' } });
    expect(s.issues).toMatchObject([{ kind: 'unclear', candidates: [2] }]);
    s = addListValues({ ...s, cursor: 6 }, [10, 11], ROSTER);
    expect(s.assignments[6].value).toBe(10);
    expect(s.issues.at(-1)).toMatchObject({ kind: 'extra', value: 11 });
  });

  it('typed corrections, and score checks against the highest possible score', () => {
    let s = setScore(emptySession(), 1, '50');
    expect(scoreProblem(s.assignments[1].value, 20)).toBe('Above 20');
    s = setScore(s, 1, 'abc');
    expect(scoreProblem(s.assignments[1].value, 20)).toBe('Not a score');
    s = setScore(s, 1, '');
    expect(s.assignments).toEqual({});
    expect(scoreProblem('absent', 20)).toBe('');
    expect(scoreProblem(-1, 20)).toBe('Below 0');
  });

  it('review plan refuses until everything is answered and valid', () => {
    let s = addNamedEntries(emptySession(), [{ name: 'Alvarez', value: 25 }, { name: 'Santos', value: 3 }, { name: 'Cruz', value: 'absent' }], ROSTER);
    const r = buildScorePlan({ learners: ROSTER, column: COL, kind: 'xlsx', session: s, maxScore: 20 });
    expect(r.ok).toBe(false);
    expect(r.problems.join(' ')).toMatch(/open question/);
    expect(r.problems.join(' ')).toMatch(/Fix 1 score/);
    expect(r.problems.join(' ')).toMatch(/absent/);
    expect(buildScorePlan({ learners: ROSTER, column: null, kind: 'xlsx', session: emptySession(), maxScore: 0 }).problems).toEqual(
      ['Choose the column to fill.', 'Enter the highest possible score.', 'No scores yet.'],
    );
  });

  it('builds cell edits; keeps filled cells unless replacing; absent as blank or 0', () => {
    const s = addNamedEntries(emptySession(), parseNamedScores('Alvarez = 18\nCruz = absent\nGarcia = 12\nBautista = 15'), ROSTER);
    const blank = buildScorePlan({ learners: ROSTER, column: COL, kind: 'xlsx', session: s, maxScore: 20, absentAs: 'blank' });
    expect(blank.ok).toBe(true);
    expect(blank.plan.edits).toEqual([{ sheet: 'TERM1', cell: 'F12', value: 18 }, { sheet: 'TERM1', cell: 'F13', value: 15 }]);
    expect(blank.plan.conflicts).toMatchObject([{ targetName: 'GARCIA, LIZA', before: 9, after: 12 }]); // already had 9: kept
    expect(blank.plan.changes[0]).toMatchObject({ learner: 'Alvarez', targetName: 'ALVAREZ, JUAN P.', location: 'TERM1!F12', after: 18 });

    const zero = buildScorePlan({ learners: ROSTER, column: COL, kind: 'xlsx', session: s, maxScore: 20, absentAs: 'zero', overwrite: true });
    expect(zero.plan.edits).toContainEqual({ sheet: 'TERM1', cell: 'F14', value: 0 });
    expect(zero.plan.edits).toContainEqual({ sheet: 'TERM1', cell: 'F16', value: 12 });
    expect(zero.plan.stats).toMatchObject({ matched: 4, cellsToChange: 4, conflicts: 0 });
    expect(zero.plan.unmatchedTarget).toEqual(['DE LA CRUZ, MARIA', 'SANTOS, MARK', 'SANTOS, JOHN']);
  });

  it('Word tables get text edits', () => {
    const doc = [{ name: 'ALVAREZ, JUAN', values: { ww3: null }, cells: { ww3: { id: 't0.r3.c4' } } }];
    const r = buildScorePlan({ learners: doc, column: COL, kind: 'docx', session: setScore(emptySession(), 0, '18'), maxScore: 20 });
    expect(r.plan.edits).toEqual([{ id: 't0.r3.c4', text: '18' }]);
  });
});
