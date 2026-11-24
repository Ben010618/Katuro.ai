import { describe, it, expect } from 'vitest';
import { classProfile, comprehensionLevel, findReadingColumns, lowerLevel, parseSeconds, readersFromRows, scoreReader, wordReadingLevel } from './philIri.js';

describe('Phil-IRI scoring (DepEd Phil-IRI Manual 2018 bands)', () => {
  it('word reading bands: 97–100 independent, 90–96 instructional, 89 and below frustration', () => {
    expect([100, 97, 96.5, 96.4, 90, 89.5, 89.4, 0].map(wordReadingLevel)).toEqual([
      'Independent', 'Independent', 'Independent', 'Instructional', 'Instructional', 'Instructional', 'Frustration', 'Frustration',
    ]);
  });

  it('comprehension bands: 80–100 independent, 59–79 instructional, 58 and below frustration', () => {
    expect([100, 80, 79.6, 79.4, 59, 58.6, 58.3, 0].map(comprehensionLevel)).toEqual([
      'Independent', 'Independent', 'Independent', 'Instructional', 'Instructional', 'Instructional', 'Frustration', 'Frustration',
    ]);
  });

  it('the reading level is the lower of the two', () => {
    expect(lowerLevel('Independent', 'Instructional')).toBe('Instructional');
    expect(lowerLevel('Frustration', 'Independent')).toBe('Frustration');
    expect(lowerLevel('Independent', 'Independent')).toBe('Independent');
  });

  it('one learner: percents, levels and words per minute', () => {
    // 150 words, 3 miscues → 98% · 5 of 7 → 71% · 150 words in 1:40 → 90 wpm
    expect(scoreReader({ name: 'Santos, Maria', words: 150, miscues: 3, correct: 5, questions: 7, seconds: 100 })).toEqual({
      name: 'Santos, Maria', wordPercent: 98, wordLevel: 'Independent', comprehensionPercent: 71, comprehensionLevel: 'Instructional', level: 'Instructional', wpm: 90, problems: [],
    });
    // 16 miscues in 150 words → 89% → Frustration even with full comprehension
    expect(scoreReader({ words: 150, miscues: 16, correct: 7, questions: 7 })).toMatchObject({ wordPercent: 89, wordLevel: 'Frustration', comprehensionPercent: 100, level: 'Frustration', wpm: null });
    expect(scoreReader({ words: '150', miscues: '0', correct: '7', questions: '7' }).level).toBe('Independent');
  });

  it('never guesses: missing or impossible numbers leave the level empty with the reason', () => {
    const a = scoreReader({ name: 'A', words: 150, miscues: null, correct: 5, questions: 7 });
    expect(a).toMatchObject({ level: null, wordLevel: null, comprehensionLevel: 'Instructional', problems: ['no miscue count'] });
    expect(scoreReader({ words: 50, miscues: 60, correct: 1, questions: 5 }).problems).toEqual(['60 miscues is more than the 50 words in the passage']);
    expect(scoreReader({ words: 50, miscues: 1, correct: 9, questions: 5 }).problems).toEqual(['9 correct answers is more than the 5 questions']);
    expect(scoreReader({ words: 50, miscues: 1.5, correct: 'abc', questions: 5 }).problems).toEqual(['miscues "1.5" is not a whole number', 'no comprehension score']);
    expect(scoreReader({ words: 0, miscues: 1, correct: 1, questions: 0 }).problems).toEqual(['no word count for the passage', 'no number of comprehension questions']);
  });

  it('reading time: m:ss, minutes and seconds, plain seconds or minutes', () => {
    expect(['1:40', '1m 40s', '100', '100 sec', '1.5 min', '2 minuto'].map((v) => parseSeconds(v))).toEqual([100, 100, 100, 100, 90, 120]);
    expect(parseSeconds(2, { minutes: true })).toBe(120);
    expect(parseSeconds(95)).toBe(95);
    expect([null, '', 'late', 0, -3].map((v) => parseSeconds(v))).toEqual([null, null, null, null, null]);
  });

  it('class profile: counts per level, percents of those scored, who needs intervention', () => {
    const results = [
      { name: 'A', level: 'Independent', wpm: 100 },
      { name: 'B', level: 'Instructional', wpm: 80 },
      { name: 'C', level: 'Frustration', wpm: 40 },
      { name: 'D', level: 'Frustration', wpm: null },
      { name: 'E', level: null, wpm: null },
    ];
    const p = classProfile(results);
    expect(p).toMatchObject({ total: 5, scored: 4, incomplete: 1, averageWpm: 73, frustration: ['C', 'D'] });
    expect(p.rows).toEqual([{ level: 'Independent', count: 1, percent: 25 }, { level: 'Instructional', count: 1, percent: 25 }, { level: 'Frustration', count: 2, percent: 50 }]);
    expect(classProfile([]).rows.every((r) => r.percent === 0)).toBe(true);
  });
});

describe('reading results from a sheet', () => {
  it('finds the columns under a title, in English or Filipino', () => {
    const rows = [
      ['PHIL-IRI ORAL READING — GRADE 5 RIZAL'],
      [],
      ['Pangalan', 'Bilang ng salita', 'Bilang ng mali', 'Tamang sagot', 'Bilang ng tanong', 'Oras (segundo)'],
    ];
    expect(findReadingColumns(rows)).toEqual({ headerRow: 2, cols: { name: 0, words: 1, miscues: 2, correct: 3, questions: 4, time: 5, timeInMinutes: false, breakdown: [] } });
  });

  it('miscue type columns are added up; class-wide words and questions fill blank cells; totals rows skipped', () => {
    const rows = [
      ["Learner's Name", 'Mispronunciation', 'Omission', 'Substitution', 'Insertion', 'Repetition', 'Comprehension', 'Time'],
      ['Dela Cruz, Juan', 2, 1, 0, 0, 1, 6, '1:30'],
      ['Reyes, Ana', null, null, null, null, null, 4, ''],
      ['Total', 2, 1, 0, 0, 1, 10, ''],
    ];
    const out = readersFromRows(rows, { words: 120, questions: 7 });
    expect(out.readers).toEqual([
      { name: 'Dela Cruz, Juan', row: 2, words: 120, miscues: 4, correct: 6, questions: 7, seconds: 90 },
      { name: 'Reyes, Ana', row: 3, words: 120, miscues: null, correct: 4, questions: 7, seconds: null },
    ]);
    expect(scoreReader(out.readers[0])).toMatchObject({ wordPercent: 97, comprehensionPercent: 86, level: 'Independent', wpm: 80 });
    expect(scoreReader(out.readers[1]).problems).toEqual(['no miscue count']);
  });

  it('"No. of Comprehension Questions" is the questions column, and minutes are converted', () => {
    const found = findReadingColumns([['Name', 'No. of Words', 'Miscues', 'Correct answers', 'No. of Comprehension Questions', 'Reading time (minutes)']]);
    expect(found.cols).toMatchObject({ words: 1, miscues: 2, correct: 3, questions: 4, time: 5, timeInMinutes: true });
  });

  it('a reading SPEED column is not taken as the reading time (it is used as the speed)', () => {
    const rows = [['Name', 'Miscues', 'Comprehension Score', 'Reading Rate (words per minute)'], ['Cruz, Juan', 3, 6, 90]];
    const out = readersFromRows(rows, { words: 150, questions: 7 });
    expect(out.cols).toMatchObject({ rate: 3, time: undefined });
    expect(out.readers[0]).toMatchObject({ seconds: null, rate: 90 });
    expect(scoreReader(out.readers[0]).wpm).toBe(90);
    // KaTuro's own output read again: its "Words per minute" column stays the speed.
    const again = readersFromRows([
      ['Learner', 'Miscues', 'Words', 'Word reading %', 'Word reading level', 'Correct answers', 'Questions', 'Comprehension %', 'Comprehension level', 'Reading level', 'Words per minute', 'Notes'],
      ['Cruz, Juan', 3, 150, 98, 'Independent', 6, 7, 86, 'Independent', 'Independent', 90, ''],
    ]);
    expect(again.cols).toMatchObject({ miscues: 1, words: 2, correct: 5, questions: 6, rate: 10, time: undefined });
    expect(scoreReader(again.readers[0])).toMatchObject({ wordPercent: 98, comprehensionPercent: 86, level: 'Independent', wpm: 90 });
    // A real time column next to a speed column: the time wins (speed is computed).
    const both = readersFromRows([['Name', 'Miscues', 'Comprehension', 'Time (sec)', 'WPM'], ['A', 1, 6, 100, 12]], { words: 150, questions: 7 });
    expect(scoreReader(both.readers[0]).wpm).toBe(90);
  });

  it('"Miscues" over one column per type (two heading rows): the types are added up', () => {
    const rows = [
      ['Name', 'Miscues', null, null, 'Comprehension'],
      [null, 'Mispronunciation', 'Omission', 'Substitution', 'Score'],
      ['Cruz, Juan', 2, 1, 3, 5],
    ];
    const out = readersFromRows(rows, { words: 100, questions: 7 });
    expect(out.cols).toMatchObject({ miscues: undefined, correct: 4, breakdown: [{ key: 'mispronunciation', col: 1 }, { key: 'omission', col: 2 }, { key: 'substitution', col: 3 }] });
    expect(out.readers).toEqual([{ name: 'Cruz, Juan', row: 3, words: 100, miscues: 6, correct: 5, questions: 7, seconds: null }]);
    expect(scoreReader({ ...out.readers[0], correct: 7 })).toMatchObject({ wordPercent: 94, level: 'Instructional' });
    // With a Total column under the group, the Total is the count.
    const t = readersFromRows([
      ['Name', 'Miscues', null, null, 'Comprehension'],
      [null, 'Omission', 'Insertion', 'Total', 'Score'],
      ['Cruz, Juan', 1, 1, 9, 5],
    ], { words: 100, questions: 7 });
    expect(t.readers[0].miscues).toBe(9);
    // A group heading with sub-columns KaTuro does not know: no count (not scored), never the first column.
    const u = readersFromRows([['Name', 'Miscues', null, 'Comprehension'], [null, 'Type A', 'Type B', 'Score'], ['Cruz, Juan', 2, 3, 5]], { words: 100, questions: 7 });
    expect(scoreReader(u.readers[0]).problems).toEqual(['no miscue count']);
  });

  it('"Comprehension" over No. of items | Score (two heading rows): the score is the score, the items are the questions', () => {
    const rows = [
      ['Name', 'Miscues', null, 'Comprehension', null],
      [null, 'Omission', 'Total', 'No. of items', 'Score'],
      ['Cruz, Juan', 1, 3, 7, 5],
    ];
    const out = readersFromRows(rows, { words: 100 });
    expect(out.cols).toMatchObject({ miscues: 2, questions: 3, correct: 4 });
    expect(out.readers[0]).toMatchObject({ miscues: 3, correct: 5, questions: 7 });
    expect(scoreReader(out.readers[0])).toMatchObject({ wordPercent: 97, comprehensionPercent: 71, level: 'Instructional' });
    // Score | % under Comprehension: the percent is never read as the score.
    const p = readersFromRows([['Name', 'Miscues', 'Comprehension', null], [null, null, '%', 'Score'], ['Cruz, Juan', 3, 71, 5]], { words: 100, questions: 7 });
    expect(p.readers[0].correct).toBe(5);
    // Sub-columns under Comprehension that are not recognised: no score taken (not scored), never a guess.
    const u = readersFromRows([['Name', 'Miscues', 'Comprehension', null], [null, null, 'A', 'B'], ['Cruz, Juan', 3, 7, 5]], { words: 100, questions: 7 });
    expect(scoreReader(u.readers[0]).problems).toEqual(['no comprehension score']);
    // A "Reading speed" group with Time | WPM under it.
    const s = readersFromRows([['Name', 'Miscues', 'Comprehension', 'Reading speed', null], [null, null, null, 'Time', 'WPM'], ['Cruz, Juan', 3, 5, '1:40', 60]], { words: 150, questions: 7 });
    expect(s.cols).toMatchObject({ time: 3, rate: 4 });
    expect(scoreReader(s.readers[0]).wpm).toBe(90);
  });

  it('reading speed written as text is read; one that cannot be read is said, and the level still stands', () => {
    expect(scoreReader({ words: 100, miscues: 1, correct: 6, questions: 7, rate: '90 wpm' }).wpm).toBe(90);
    expect(scoreReader({ words: 100, miscues: 1, correct: 6, questions: 7, rate: '88 words per minute' }).wpm).toBe(88);
    const bad = scoreReader({ words: 100, miscues: 1, correct: 6, questions: 7, rate: 'fast' });
    expect(bad).toMatchObject({ wpm: null, level: 'Independent', problems: ['reading speed "fast" could not be read'] });
  });

  it('a learner row with text in it is never taken as a second heading row', () => {
    const out = readersFromRows([['Name', 'Miscues', null, 'Comprehension'], ['Cruz, Juan', 'n/a', 'x', 5]], { words: 100, questions: 7 });
    expect(out.readers).toHaveLength(1);
    expect(scoreReader(out.readers[0]).problems).toEqual(['no miscue count']);
  });

  it('a blank heading cell next to "Miscues" with the first learner below is not a heading row', () => {
    const out = readersFromRows([['Name', 'Miscues', null, 'Comprehension'], ['Cruz, Juan', 4, 7, 5], ['Reyes, Ana', 1, 2, 6]], { words: 100, questions: 7 });
    expect(out.readers.map((r) => [r.name, r.miscues])).toEqual([['Cruz, Juan', 4], ['Reyes, Ana', 1]]);
  });

  it('a sheet without reading columns is not mistaken for one', () => {
    expect(readersFromRows([['Name', 'Quarter 1', 'Quarter 2'], ['A', 88, 90]])).toBeNull();
    expect(readersFromRows([])).toBeNull();
  });
});
