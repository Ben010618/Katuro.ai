import { describe, it, expect } from 'vitest';
import { phaseIndicators } from './cotDocx';

describe('phaseIndicators', () => {
  it('returns only selected indicators mapped to the given phase', () => {
    const selected = [
      { id: 'ppst-2-4-2', num: 1, description: 'a' },
      { id: 'ppst-1-1-2', num: 2, description: 'b' },
      { id: 'ppst-5-1-2', num: 3, description: 'c' },
    ];
    expect(phaseIndicators('introduction', selected)).toEqual([selected[0]]);
    expect(phaseIndicators('analysis', selected)).toEqual([selected[1]]);
    expect(phaseIndicators('application', selected)).toEqual([selected[2]]);
  });

  it('excludes selected indicators not mapped to the given phase', () => {
    const selected = [{ id: 'ppst-9-9-9', num: 1, description: 'unmapped' }];
    expect(phaseIndicators('introduction', selected)).toEqual([]);
  });

  it('returns an empty array for an unknown phase', () => {
    const selected = [{ id: 'ppst-2-4-2', num: 1, description: 'a' }];
    expect(phaseIndicators('not-a-real-phase', selected)).toEqual([]);
  });

  it('returns an empty array when no indicators are selected', () => {
    expect(phaseIndicators('introduction', [])).toEqual([]);
  });
});
