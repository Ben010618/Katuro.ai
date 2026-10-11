/**
 * electron/phoneCapture.cjs — the phone-to-computer photo session for bubble-sheet quizzes.
 */
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const capture = require('../electron/phoneCapture.cjs');

const jpeg = () => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(400, 7)]);

describe('phone capture session', () => {
  let dir;
  afterEach(() => {
    capture.stop();
    if (dir) fs.rmSync(dir, { recursive: true, force: true });
  });

  async function begin(onPhoto = () => {}) {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kt-capture-'));
    const photos = path.join(dir, 'Photos');
    const res = await capture.start({ dir: photos, title: 'Science <Quiz> 1', onPhoto });
    const local = `http://127.0.0.1:${res.port}${res.path}`;
    return { res, photos, local };
  }

  it('the page opens only with the right key; the first phone owns the session; only photos are saved', async () => {
    const saved = [];
    const { res, photos, local } = await begin((p) => saved.push(p));
    expect(res.path).toMatch(/^\/c\/[A-Za-z0-9_-]{24}$/);
    for (const u of res.urls) expect(u.url).toBe(`http://${new URL(u.url).hostname}:${res.port}${res.path}`);

    const page = await fetch(local);
    expect(page.status).toBe(200);
    const html = await page.text();
    expect(html).toContain('Science &lt;Quiz&gt; 1');
    expect(html).toContain('capture="environment"');

    const base = `http://127.0.0.1:${res.port}`;
    expect((await fetch(`${base}/c/wrongkeywrongkeywrongkey`)).status).toBe(404);
    expect((await fetch(`${base}/`)).status).toBe(404);
    expect((await fetch(`${local}/status`)).status).toBe(400); // no device id

    const A = { 'X-KT-Device': 'phone-a' };
    expect(await (await fetch(`${local}/status`, { headers: A })).json()).toEqual({ count: 0 });
    const other = await fetch(`${local}/status`, { headers: { 'X-KT-Device': 'phone-b' } });
    expect(other.status).toBe(409);

    const ok = await fetch(`${local}/photo`, { method: 'POST', headers: A, body: jpeg() });
    expect(await ok.json()).toEqual({ ok: true, count: 1 });
    const second = await fetch(`${local}/photo`, { method: 'POST', headers: A, body: jpeg() });
    expect((await second.json()).count).toBe(2);
    expect((await fetch(`${local}/photo`, { method: 'POST', headers: A, body: Buffer.from('<script>x</script>'.repeat(20)) })).status).toBe(415);
    expect((await fetch(`${local}/photo`, { method: 'POST', headers: { 'X-KT-Device': 'phone-b' }, body: jpeg() })).status).toBe(409);

    const files = fs.readdirSync(photos);
    expect(files).toHaveLength(2);
    expect(files.every((f) => /^Photo \d{4}-\d{2}-\d{2} \d{6}( \(\d+\))?\.jpg$/.test(f))).toBe(true);
    expect(saved.map((p) => p.count)).toEqual([1, 2]);
    expect(capture.status()).toEqual({ active: true, count: 2, connected: true });
  });

  it('a photo over 15 MB is refused and nothing is saved', async () => {
    const { photos, local } = await begin();
    const big = Buffer.concat([jpeg(), Buffer.alloc(16 * 1024 * 1024)]);
    await fetch(`${local}/photo`, { method: 'POST', headers: { 'X-KT-Device': 'a' }, body: big }).catch(() => null);
    expect(fs.readdirSync(photos)).toHaveLength(0);
  });

  it('after Stop the page is gone', async () => {
    const { local } = await begin();
    capture.stop();
    await expect(fetch(local)).rejects.toThrow();
    expect(capture.status()).toEqual({ active: false, count: 0, connected: false });
  });

  it('a new session replaces the old one (new key, new phone)', async () => {
    const first = await begin();
    const second = await capture.start({ dir: first.photos, title: 'Again' });
    expect(second.path).not.toBe(first.res.path);
    await expect(fetch(first.local)).rejects.toThrow();
  });
});
