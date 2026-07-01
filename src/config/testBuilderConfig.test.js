import { describe, it, expect } from 'vitest';
import { deriveLanguage } from './testBuilderConfig';

describe('deriveLanguage', () => {
  it('uses Filipino for Filipino, ESP, and Araling Panlipunan', () => {
    expect(deriveLanguage('Filipino')).toBe('fil');
    expect(deriveLanguage('ESP')).toBe('fil');
    expect(deriveLanguage('Araling Panlipunan')).toBe('fil');
  });

  it('uses English for every other subject', () => {
    expect(deriveLanguage('Science')).toBe('en');
    expect(deriveLanguage('Mathematics')).toBe('en');
    expect(deriveLanguage('English')).toBe('en');
    expect(deriveLanguage('MAPEH')).toBe('en');
    expect(deriveLanguage('GMRC')).toBe('en');
    expect(deriveLanguage('Makabansa')).toBe('en');
  });

  it('defaults to English for an unset/unknown subject', () => {
    expect(deriveLanguage('')).toBe('en');
    expect(deriveLanguage(undefined)).toBe('en');
  });
});
