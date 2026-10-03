import { describe, it, expect } from 'vitest';
import { groupReports, reportSignature } from './errorReports';
import { isStaleChunkError, reloadForNewVersion } from '../utils/staleChunk';

const at = (iso) => ({ toMillis: () => new Date(iso).getTime() });

describe('AI Error Reports grouping', () => {
  const reports = [
    { id: 'a', feature: 'app-crash', errorMessage: 'useFacultyStore is not defined', createdAt: at('2026-10-01T03:20:00Z') },
    { id: 'b', feature: 'app-crash', errorMessage: 'useFacultyStore is not defined', createdAt: at('2026-10-01T12:15:00Z'), resolved: true },
    { id: 'c', feature: 'app-crash', errorMessage: 'Failed to fetch dynamically imported module: https://katuro.website/assets/AdminDashboard-CLPOlrP3.js', createdAt: at('2026-10-03T01:37:00Z') },
    { id: 'd', feature: 'app-crash', errorMessage: 'Failed to fetch dynamically imported module: https://katuro.website/assets/AssessmentGateway-CWm0UCyb.js', createdAt: at('2026-10-01T07:26:00Z') },
    { id: 'e', feature: 'dll_gen', errorMessage: '[functions/internal] Gemini 503 (gemini-3.5-flash): high demand', createdAt: at('2026-10-02T10:28:00Z') },
    { id: 'f', feature: 'ilaw_unpack', errorMessage: '[functions/internal] Gemini 503 (gemini-3.5-flash): high demand', createdAt: at('2026-09-29T01:05:00Z') },
  ];

  it('collapses repeats that differ only by file hash, URL or numbers', () => {
    expect(reportSignature(reports[2])).toBe(reportSignature(reports[3]));
    expect(reportSignature(reports[4])).not.toBe(reportSignature(reports[5])); // different feature stays separate
  });

  it('counts open vs resolved and shows the newest first', () => {
    const groups = groupReports(reports);
    const faculty = groups.find((g) => g.sample.errorMessage.includes('useFacultyStore'));
    expect(faculty).toMatchObject({ count: 2, openCount: 1, openIds: ['a'] });
    expect(faculty.sample.id).toBe('b'); // most recent occurrence
    expect(groups[0].sample.id).toBe('c');
    expect(groups.find((g) => g.key.includes('dynamically')).count).toBe(2);
  });
});

describe('old tab after a deploy', () => {
  it('recognizes stale-file errors from every browser', () => {
    expect(isStaleChunkError(new Error('Failed to fetch dynamically imported module: https://katuro.website/assets/x-1.js'))).toBe(true);
    expect(isStaleChunkError(new TypeError('Importing a module script failed.'))).toBe(true); // Safari
    expect(isStaleChunkError('error loading dynamically imported module')).toBe(true); // Firefox
    expect(isStaleChunkError(new Error('useFacultyStore is not defined'))).toBe(false);
  });

  it('reloads once, then lets a genuinely broken deploy show its error', () => {
    const store = new Map();
    let reloads = 0;
    const win = {
      sessionStorage: { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) },
      location: { reload: () => { reloads += 1; } },
    };
    expect(reloadForNewVersion(win)).toBe(true);
    expect(reloadForNewVersion(win)).toBe(false); // right after: no loop
    store.set('kt_stale_chunk_reload_at', String(Date.now() - 61000));
    expect(reloadForNewVersion(win)).toBe(true); // a later deploy can recover again
    expect(reloads).toBe(2);
  });
});

describe('errors outside React are reported once, without noise', async () => {
  const { createGlobalErrorReporter } = await import('../utils/globalErrorReporter');
  it('dedupes, caps, and skips noise that is already handled', async () => {
    const sent = [];
    const handle = createGlobalErrorReporter((e) => sent.push(e));
    expect(handle('app-error', new TypeError("Cannot read properties of undefined (reading 'map')"))).toBe(true);
    expect(handle('app-error', new TypeError("Cannot read properties of undefined (reading 'map')"))).toBe(false); // same again
    expect(handle('app-error', new Error('ResizeObserver loop completed with undelivered notifications.'))).toBe(false);
    expect(handle('app-error', new Error('Failed to fetch dynamically imported module: x.js'))).toBe(false); // reload handles it
    expect(handle('app-unhandled-promise', Object.assign(new Error('busy'), { details: { busy: true } }))).toBe(false);
    for (let i = 0; i < 10; i += 1) handle('app-error', new Error(`distinct ${i}`));
    await Promise.resolve();
    await Promise.resolve();
    expect(sent).toHaveLength(5); // MAX_PER_SESSION
    expect(sent[0]).toMatchObject({ feature: 'app-error', errorMessage: "Cannot read properties of undefined (reading 'map')" });
  });
});
