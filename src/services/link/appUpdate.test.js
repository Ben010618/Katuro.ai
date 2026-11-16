import { describe, it, expect } from 'vitest';
import { versionCodeOf, parseUpdate } from './appUpdate.js';

const GOOD = {
  version: '1.0.1',
  versionCode: 10001,
  url: 'https://github.com/Ben010618/Katuro.ai/releases/download/katuro-app/KaTuro-App-1.0.1.apk',
  sha256: 'a'.repeat(64),
  size: 15000000,
  notes: 'Faster bubble sheets',
};

describe('KaTuro App versions and online updates', () => {
  it('versions are numbered V1.0.0, V1.0.1, V1.1.0 … and compared by a single number', () => {
    expect(versionCodeOf('1.0.0')).toBe(10000);
    expect(versionCodeOf('1.0.1')).toBe(10001);
    expect(versionCodeOf('1.1.0')).toBe(10100);
    expect(versionCodeOf('2.0.0')).toBe(20000);
    expect(versionCodeOf('1.1.1') > versionCodeOf('1.1.0')).toBe(true);
    expect(versionCodeOf('1.0')).toBe(0);
    expect(versionCodeOf('1.100.0')).toBe(0);
  });

  it('accepts only a well-formed update from KaTuro’s GitHub', () => {
    expect(parseUpdate(JSON.stringify(GOOD))).toMatchObject({ version: '1.0.1', versionCode: 10001, sha256: 'a'.repeat(64) });
    expect(parseUpdate({ ...GOOD, url: 'http://github.com/x/KaTuro.apk' })).toBeNull();
    expect(parseUpdate({ ...GOOD, url: 'https://evil.example.com/KaTuro.apk' })).toBeNull();
    expect(parseUpdate({ ...GOOD, url: 'https://github.com/x/KaTuro.exe' })).toBeNull();
    expect(parseUpdate({ ...GOOD, sha256: 'nope' })).toBeNull();
    expect(parseUpdate({ ...GOOD, versionCode: 10002 })).toBeNull(); // must match the version
    expect(parseUpdate('not json')).toBeNull();
  });
});
