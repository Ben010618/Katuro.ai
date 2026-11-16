import { describe, it, expect } from 'vitest';
import { FIRST_RUN, WHATS_NEW, compareVersions, whatsNewSteps, latestWhatsNew, tourToShow } from './tourSteps.js';

describe('which KaTuroDesk tour to show', () => {
  it('compares versions as numbers', () => {
    expect(compareVersions('1.19.0', '1.9.2')).toBe(1);
    expect(compareVersions('1.16.2', '1.19.0')).toBe(-1);
    expect(compareVersions('1.19.0', '1.19.0')).toBe(0);
  });

  it('a teacher opening KaTuroDesk for the first time gets the welcome tour', () => {
    expect(tourToShow({ seen: null, firstRun: true, version: '1.19.0' })).toEqual({ kind: 'welcome', steps: FIRST_RUN });
  });

  it('a teacher who updated (KaTuroDesk was used before) gets only what is new', () => {
    const r = tourToShow({ seen: null, firstRun: false, version: '1.19.0' });
    expect(r.kind).toBe('new');
    expect(r.steps).toEqual(WHATS_NEW.find((n) => n.version === '1.19.0').steps);
  });

  it('nothing again once seen or skipped for this version; the next update shows its own highlights', () => {
    expect(tourToShow({ seen: { version: '1.19.0' }, firstRun: true, version: '1.19.0' })).toBeNull();
    expect(tourToShow({ seen: { version: '1.19.0' }, firstRun: false, version: '1.19.1' })).toBeNull(); // no highlights for a fix
    expect(whatsNewSteps('1.18.0', '1.19.0').length).toBeGreaterThan(0);
    expect(tourToShow({ seen: { version: '1.16.2' }, firstRun: false, version: '1.19.0' }).kind).toBe('new');
  });

  it('Settings → What\'s new replays the newest highlights, also on a later fix version', () => {
    expect(latestWhatsNew('1.19.0')).toEqual(WHATS_NEW[0].steps);
    expect(latestWhatsNew('1.19.3')).toEqual(WHATS_NEW[0].steps);
    expect(latestWhatsNew('')).toEqual(WHATS_NEW[0].steps);
    expect(latestWhatsNew('1.0.0')).toEqual([]);
  });

  it('the phone step is in both tours, and every step has a title and text', () => {
    expect(FIRST_RUN.some((s) => s.target === 'phone')).toBe(true);
    expect(WHATS_NEW[0].steps[0].target).toBe('phone');
    for (const s of [...FIRST_RUN, ...WHATS_NEW.flatMap((n) => n.steps)]) {
      expect(s.title).toBeTruthy();
      expect(s.body).toBeTruthy();
    }
  });
});
