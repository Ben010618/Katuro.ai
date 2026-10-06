import { describe, it, expect, beforeEach, vi } from 'vitest';
import { parseDeskRelease, getLatestDeskRelease, DESK_RELEASES_URL } from './deskRelease';

const RELEASE = {
  tag_name: 'v1.8.2',
  assets: [
    { name: 'KaTuroDesk-Setup-1.8.2.exe.blockmap', browser_download_url: 'https://x/blockmap' },
    { name: 'latest.yml', browser_download_url: 'https://x/latest.yml' },
    { name: 'KaTuroDesk-Setup-1.8.2.exe', browser_download_url: 'https://github.com/Ben010618/Katuro.ai/releases/download/v1.8.2/KaTuroDesk-Setup-1.8.2.exe' },
  ],
};
const okFetch = (json) => vi.fn(async () => ({ ok: true, json: async () => json }));

describe('KaTuroDesk download button source', () => {
  beforeEach(() => localStorage.clear());

  it('reads the version and the installer (not the blockmap or latest.yml)', () => {
    expect(parseDeskRelease(RELEASE)).toEqual({ version: '1.8.2', url: RELEASE.assets[2].browser_download_url });
  });

  it('no installer or no proper version → null (the button then opens the releases page)', () => {
    expect(parseDeskRelease({ tag_name: 'v1.8.2', assets: [RELEASE.assets[0]] })).toBeNull();
    expect(parseDeskRelease({ tag_name: 'nightly', assets: RELEASE.assets })).toBeNull();
    expect(parseDeskRelease(null)).toBeNull();
    expect(DESK_RELEASES_URL).toBe('https://github.com/Ben010618/Katuro.ai/releases/latest');
  });

  it('asks GitHub once per hour (cached), and follows new releases', async () => {
    const f = okFetch(RELEASE);
    await expect(getLatestDeskRelease({ fetchImpl: f })).resolves.toMatchObject({ version: '1.8.2' });
    await expect(getLatestDeskRelease({ fetchImpl: f })).resolves.toMatchObject({ version: '1.8.2' });
    expect(f).toHaveBeenCalledTimes(1);
    expect(f.mock.calls[0][0]).toBe('https://api.github.com/repos/Ben010618/Katuro.ai/releases/latest');

    localStorage.clear(); // cache expired
    const next = okFetch({ tag_name: 'v1.9.0', assets: [{ name: 'KaTuroDesk-Setup-1.9.0.exe', browser_download_url: 'https://x/1.9.0.exe' }] });
    await expect(getLatestDeskRelease({ fetchImpl: next })).resolves.toEqual({ version: '1.9.0', url: 'https://x/1.9.0.exe' });
  });

  it('GitHub down, rate-limited or offline → null, never an error', async () => {
    await expect(getLatestDeskRelease({ fetchImpl: vi.fn(async () => ({ ok: false, status: 403 })) })).resolves.toBeNull();
    await expect(getLatestDeskRelease({ fetchImpl: vi.fn(async () => { throw new Error('offline'); }) })).resolves.toBeNull();
  });
});
