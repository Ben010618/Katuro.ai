import { describe, it, expect } from 'vitest';
import { subjectFinal, generalAverage, actionTaken, studentFinals } from './gradeRules';

describe('report card / SF5 rules', () => {
  it('a final rating needs every term (a missing term is not averaged away)', () => {
    expect(subjectFinal([82, 85, 88])).toBe(85);
    expect(subjectFinal([82, undefined, undefined])).toBeNull(); // used to print 82 as the final
    expect(subjectFinal([82, null, 90])).toBeNull();
  });

  it('general average needs every subject complete', () => {
    expect(generalAverage([85, 90])).toBe(87.5);
    expect(generalAverage([85, null])).toBeNull();
    expect(generalAverage([])).toBeNull();
  });

  it('PROMOTED only when every learning area is complete and passed; otherwise the teacher decides', () => {
    expect(actionTaken([80, 90, 76])).toBe('PROMOTED');
    expect(actionTaken([95, 95, 70])).toBe(''); // average 86.7 used to say PROMOTED despite failing one area
    expect(actionTaken([80, null])).toBe('');
  });

  it('reads allGrades[term][subject][studentId].finalGrade', () => {
    const all = { term1: { Math: { s1: { finalGrade: 80 } } }, term2: { Math: { s1: { finalGrade: 82 } } }, term3: { Math: { s1: { finalGrade: 84 } } } };
    expect(studentFinals(all, ['Math', 'Science'], 's1')).toEqual([82, null]);
  });
});
