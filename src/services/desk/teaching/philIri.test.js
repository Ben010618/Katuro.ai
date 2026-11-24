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

  it('a sheet without reading columns is not mistaken for one', () => {
    expect(readersFromRows([['Name', 'Quarter 1', 'Quarter 2'], ['A', 88, 90]])).toBeNull();
    expect(readersFromRows([])).toBeNull();
  });
});
