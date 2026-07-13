import { describe, it, expect } from 'vitest';
import { computeFinalGrade, sumComponentWeights, reshapeItemCount, updateMaxScore } from './classroomDb';

describe('computeFinalGrade', () => {
  it('gives a transmuted grade of 100 for perfect scores across WW/PT/ST', () => {
    const grade = computeFinalGrade({
      writtenWorks: [100, 100, 100], performanceTask: [100, 100], summativeTests: [100, 100],
      wwMax: [100, 100, 100], ptMax: [100, 100], stMax: [100, 100],
    });
    expect(grade).toBe(100);
  });

  it('never lets the transmuted grade fall below the 60 passing floor', () => {
    const grade = computeFinalGrade({
      writtenWorks: [0, 0, 0], performanceTask: [0, 0], summativeTests: [0, 0],
      wwMax: [100, 100, 100], ptMax: [100, 100], stMax: [100, 100],
    });
    expect(grade).toBe(60);
  });

  it('never exceeds 100 even if component weights sum above 100', () => {
    const grade = computeFinalGrade({
      writtenWorks: [100, 100, 100], performanceTask: [100, 100], summativeTests: [100, 100],
      wwMax: [100, 100, 100], ptMax: [100, 100], stMax: [100, 100],
      writtenWorksWeight: 100, performanceTaskWeight: 100, summativeTestWeight: 100,
    });
    expect(grade).toBe(100);
  });

  it('falls back to the legacy quarterlyExam/quarterlyExamWeight fields when summativeTests is empty', () => {
    const grade = computeFinalGrade({
      writtenWorks: [80, 80, 80], performanceTask: [80, 80],
      quarterlyExam: 88, quarterlyExamWeight: 30,
      writtenWorksWeight: 35, performanceTaskWeight: 35,
      wwMax: [100, 100, 100], ptMax: [100, 100], stMax: [], qeMax: 100,
    });
    expect(grade).toBeCloseTo(92.96, 2);
  });

  it('only sums the first wwCount/ptCount entries even when the arrays hold extra values', () => {
    const withExtra = computeFinalGrade({
      writtenWorks: [100, 100, 100, 0, 0], performanceTask: [100, 100],
      summativeTests: [100, 100],
      wwMax: [100, 100, 100, 100, 100], ptMax: [100, 100], stMax: [100, 100],
      wwCount: 3, ptCount: 2,
    });
    expect(withExtra).toBe(100);
  });
});

describe('sumComponentWeights', () => {
  it('sums the three component weight fields', () => {
    expect(sumComponentWeights({ writtenWorksWeight: 40, performanceTaskWeight: 40, summativeTestWeight: 20 })).toBe(100);
  });

  it('treats missing weight fields as zero', () => {
    expect(sumComponentWeights({ writtenWorksWeight: 40 })).toBe(40);
    expect(sumComponentWeights()).toBe(0);
  });
});

describe('reshapeItemCount', () => {
  it('increments wwCount and extends wwMax with a default-100 slot', () => {
    const weights = { wwCount: 3, wwMax: [90, 95, 100] };
    const result = reshapeItemCount(weights, 'wwCount', 1);
    expect(result.wwCount).toBe(4);
    expect(result.wwMax).toEqual([90, 95, 100, 100]);
  });

  it('decrements ptCount and truncates ptMax to match', () => {
    const weights = { ptCount: 2, ptMax: [80, 90] };
    const result = reshapeItemCount(weights, 'ptCount', -1);
    expect(result.ptCount).toBe(1);
    expect(result.ptMax).toEqual([80]);
  });

  it('never lets a count drop below 1', () => {
    const weights = { wwCount: 1, wwMax: [100] };
    const result = reshapeItemCount(weights, 'wwCount', -5);
    expect(result.wwCount).toBe(1);
  });

  it('does not mutate the original weights object', () => {
    const weights = { wwCount: 3, wwMax: [90, 95, 100] };
    reshapeItemCount(weights, 'wwCount', 1);
    expect(weights.wwCount).toBe(3);
    expect(weights.wwMax).toEqual([90, 95, 100]);
  });
});

describe('updateMaxScore', () => {
  it('updates the value at the given index of the given field', () => {
    const weights = { wwMax: [100, 100, 100] };
    const result = updateMaxScore(weights, 'wwMax', 1, 50);
    expect(result.wwMax).toEqual([100, 50, 100]);
  });

  it('clamps negative or non-numeric input, falling back to 100 for falsy values (including 0)', () => {
    const weights = { ptMax: [100, 100] };
    // Note: `Number(value) || 100` treats 0 as falsy, so a literal 0 input becomes 100, not 1.
    expect(updateMaxScore(weights, 'ptMax', 0, 0).ptMax).toEqual([100, 100]);
    expect(updateMaxScore(weights, 'ptMax', 0, -20).ptMax).toEqual([1, 100]);
    expect(updateMaxScore(weights, 'ptMax', 0, 'abc').ptMax).toEqual([100, 100]);
  });

  it('does not mutate the original weights object', () => {
    const weights = { wwMax: [100, 100, 100] };
    updateMaxScore(weights, 'wwMax', 0, 50);
    expect(weights.wwMax).toEqual([100, 100, 100]);
  });
});
