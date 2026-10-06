import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
import path from 'path';

const require = createRequire(path.resolve(__dirname, '../functions/index.js'));
const { normalizeQuery, typoDistance, usernameScore, searchUsernames } = require('./chatSearch.js');

const DIR = ['ben', 'benjie', 'bernadette', 'eyey', 'mseyey', 'ana.cruz', 'anna', 'carl', 'bena', 'xyz123'].map((u, i) => ({ uid: `u${i}`, username: u }));
const names = (q, opts) => searchUsernames(q, DIR, opts).map((r) => r.username);

describe('find teachers by @username', () => {
  it('reads "@Ben " as "ben"', () => {
    expect(normalizeQuery('  @Ben ')).toBe('ben');
    expect(normalizeQuery('@@eyey!')).toBe('eyey');
  });

  it('exact username first, then usernames that start with it, then ones that contain it', () => {
    expect(names('ben')).toEqual(['ben', 'bena', 'benjie', 'bernadette']); // close spelling last
    expect(names('@eyey')).toEqual(['eyey', 'mseyey']);
  });

  it('a typo suggests the closest username ("@ban" → @ben)', () => {
    const r = searchUsernames('ban', DIR);
    expect(r[0].username).toBe('ben');
    expect(r[0].score).toBeLessThan(0.75); // shown as "Did you mean @ben?"
    expect(names('eyye')).toContain('eyey'); // swapped letters count as one typo
    expect(names('crl')).toContain('carl');
  });

  it('bands never overlap: exact > starts with > contains > close spelling', () => {
    expect(usernameScore('ben', 'ben')).toBe(1);
    expect(usernameScore('ben', 'benjie')).toBeGreaterThan(usernameScore('ben', 'xbenx'));
    expect(usernameScore('eyey', 'mseyey')).toBeGreaterThan(usernameScore('eyey', 'eyez'));
    expect(usernameScore('ban', 'ben')).toBeLessThan(0.7 + 1e-9);
  });

  it('short or unrelated queries do not invent matches', () => {
    expect(names('zz')).toEqual([]);
    expect(names('qqqq')).toEqual([]);
    expect(names('')).toEqual([]);
    expect(names('b', { limit: 3 })).toEqual(['ben', 'bena', 'benjie']); // 1 letter: starts-with only
  });

  it('typo distance', () => {
    expect(typoDistance('ban', 'ben')).toBe(1);
    expect(typoDistance('eyye', 'eyey')).toBe(1);
    expect(typoDistance('', 'abc')).toBe(3);
  });
});
