/**
 * The phone ↔ KaTuroDesk link: the real KaTuroDesk service (electron/linkService.cjs)
 * against the real KaTuro App client (src/services/link/linkClient.js), over HTTP on this PC.
 */
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { createRequire } from 'module';
import { parseLinkQr, pairWithDesk, createLinkClient } from '../src/services/link/linkClient.js';

const require = createRequire(import.meta.url);
const { createLinkService, insideHome } = require('../electron/linkService.cjs');

// Stand-in for Windows DPAPI: reversible, and the saved file never holds the raw key.
const protect = { encrypt: (b) => `x${Buffer.from(b).toString('hex')}`, decrypt: (s) => Buffer.from(String(s).slice(1), 'hex') };

const TEACHER = 'uid-teacher-ana';
let tmp;
let service;
afterEach(() => {
  service?.stop();
  service = null;
  if (tmp) fs.rmSync(tmp, { recursive: true, force: true });
});

async function setup({ now, askDesk } = {}) {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kt-link-'));
  const home = path.join(tmp, 'KaTuro');
  fs.mkdirSync(path.join(home, 'Records'), { recursive: true });
  fs.mkdirSync(path.join(home, 'Lessons', 'Week 1'), { recursive: true });
  fs.writeFileSync(path.join(home, 'Records', 'Grade 7 - Rizal - Science.xlsx'), 'class record bytes');
  fs.writeFileSync(path.join(home, 'Lessons', 'Week 1', 'Cells.pdf'), '%PDF-1.4 lesson');
  fs.writeFileSync(path.join(home, 'Records', '~$Grade 7 - Rizal - Science.xlsx'), 'excel lock file');
  fs.writeFileSync(path.join(tmp, 'secret.txt'), 'outside the KaTuro folder');
  const storeFile = path.join(tmp, 'appdata', 'linked-phones.json');
  service = createLinkService({
    account: TEACHER,
    home: () => home, storeFile, protect, deskName: "Teacher's laptop",
    addresses: () => [{ address: '127.0.0.1', name: 'test' }],
    ...(now ? { now } : {}),
    ...(askDesk ? { askDesk } : {}),
  });
  await service.start(0);
  return { home, storeFile };
}

async function pairPhone() {
  const { qrText } = service.beginPairing();
  const qr = parseLinkQr(qrText);
  const link = await pairWithDesk(qr, { deviceName: "Ma'am Ana's phone", uid: TEACHER });
  return { qr, qrText, link };
}

describe('phone link', () => {
  it('pairs once by QR code, then lists and opens files in the KaTuro folder', async () => {
    const { storeFile } = await setup();
    const { qr, link } = await pairPhone();
    expect(qr).toMatchObject({ hosts: ['127.0.0.1'], deskName: "Teacher's laptop" });
    expect(link.deviceId).toBeTruthy();
    expect(link.key).toMatch(/^[A-Za-z0-9_-]{43}$/);

    // The saved phones file holds no raw key.
    const saved = fs.readFileSync(storeFile, 'utf8');
    expect(saved).toContain("Ma'am Ana's phone");
    expect(saved).not.toContain(link.key);
    expect(service.status().devices.map((d) => d.name)).toEqual(["Ma'am Ana's phone"]);

    const client = createLinkClient(link);
    const hello = await client.hello();
    expect(hello).toMatchObject({ deskName: "Teacher's laptop", phone: "Ma'am Ana's phone" });

    const top = await client.list('');
    expect(top.items.map((i) => [i.name, i.kind])).toEqual([['Lessons', 'directory'], ['Records', 'directory']]);
    const records = await client.list('Records');
    // Excel's "~$" lock files are left out.
    expect(records.items.map((i) => i.name)).toEqual(['Grade 7 - Rizal - Science.xlsx']);
    expect((await client.list('Lessons/Week 1')).items[0]).toMatchObject({ path: 'Lessons/Week 1/Cells.pdf', kind: 'file' });

    const file = await client.read('Records/Grade 7 - Rizal - Science.xlsx');
    expect(new TextDecoder().decode(file.bytes)).toBe('class record bytes');
  });

  it('never reaches outside the KaTuro folder', async () => {
    await setup();
    const client = createLinkClient((await pairPhone()).link);
    await expect(client.read('../secret.txt')).rejects.toThrow(/not in your KaTuro folder/);
    await expect(client.read('Records/../../secret.txt')).rejects.toThrow(/not in your KaTuro folder/);
    await expect(client.list('..')).rejects.toThrow(/not in your KaTuro folder/);
    expect(insideHome('/home/KaTuro', 'C:/Windows')).toBeNull();
  });

  it('a pairing QR code works for one phone only', async () => {
    await setup();
    const { qr } = await pairPhone();
    await expect(pairWithDesk(qr, { deviceName: 'Second phone' })).rejects.toThrow(/not linked/);
    expect(service.status().devices).toHaveLength(1);
  });

  it('an old pairing QR code is refused', async () => {
    let t = Date.now();
    await setup({ now: () => t });
    const { qrText } = service.beginPairing();
    t += 11 * 60 * 1000;
    await expect(pairWithDesk(parseLinkQr(qrText), { deviceName: 'Late phone' })).rejects.toThrow();
    expect(service.status().devices).toHaveLength(0);
  });

  it('a removed phone can no longer connect', async () => {
    await setup();
    const { link } = await pairPhone();
    const client = createLinkClient(link);
    await client.hello();
    service.removeDevice(link.deviceId);
    await expect(client.hello()).rejects.toMatchObject({ code: 'NOT_LINKED' });
  });

  it('a stolen device id without the key, a tampered message and a replayed message are all refused', async () => {
    await setup();
    const { link } = await pairPhone();
    const port = service.status().port;
    const wrongKey = createLinkClient({ ...link, key: link.key.replace(/^./, (c) => (c === 'A' ? 'B' : 'A')) });
    await expect(wrongKey.hello()).rejects.toMatchObject({ code: 'NOT_LINKED' });

    // Capture one real request, then send it again (replay) and send a changed copy.
    let captured = null;
    const spy = async (url, init) => { captured = init.body; return fetch(url, init); };
    await createLinkClient(link, { fetchImpl: spy }).list('Records');
    const post = (body) => fetch(`http://127.0.0.1:${port}/link`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body }).then((r) => r.json());
    expect(await post(captured)).toMatchObject({ code: 'STALE' });
    const env = JSON.parse(captured);
    const flipped = env.ct.slice(0, -2) + (env.ct.endsWith('A') ? 'BB' : 'AA');
    expect(await post(JSON.stringify({ ...env, ct: flipped }))).toMatchObject({ code: 'NOT_LINKED' });
  });

  it('nothing answers without encryption, and the phone says so when KaTuroDesk is off', async () => {
    await setup();
    const port = service.status().port;
    const res = await fetch(`http://127.0.0.1:${port}/files`);
    expect(res.status).toBe(404);
    const { link } = await pairPhone();
    service.stop();
    await expect(createLinkClient(link).hello()).rejects.toMatchObject({ code: 'UNREACHABLE' });
  });

  it('class-record requests go to the KaTuroDesk window, with its answer or its reason back', async () => {
    const asked = [];
    await setup({
      askDesk: async (op, args, device) => {
        asked.push([op, args, device.name]);
        if (op === 'record') throw Object.assign(new Error('1 learner(s) already have a score.'), { code: 'CONFLICTS', details: { conflicts: [{ lrn: '1', before: 4, after: 5 }] } });
        return { classes: [{ name: 'Grade 7 - Rizal - Science' }] };
      },
    });
    const client = createLinkClient((await pairPhone()).link);
    expect(await client.request('classes')).toEqual({ classes: [{ name: 'Grade 7 - Rizal - Science' }] });
    await expect(client.request('record', { path: 'Records/x.xlsx' })).rejects.toMatchObject({ code: 'CONFLICTS', details: { conflicts: [{ lrn: '1', before: 4, after: 5 }] } });
    expect(asked.map((a) => [a[0], a[2]])).toEqual([['classes', "Ma'am Ana's phone"], ['record', "Ma'am Ana's phone"]]);
  });

  it('a phone can send files into Records or Lessons only, never over an existing file, and never programs', async () => {
    const { home } = await setup();
    const client = createLinkClient((await pairPhone()).link);
    const photo = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
    expect(await client.upload('Lessons/Week 1', 'Board notes.jpg', photo)).toMatchObject({ path: 'Lessons/Week 1/Board notes.jpg', size: 7 });
    expect(await client.upload('Lessons/Week 1', 'Board notes.jpg', photo)).toMatchObject({ path: 'Lessons/Week 1/Board notes (2).jpg' });
    expect(await client.upload('Records/Scanned Papers/Quiz 3', 'Juan.jpg', photo)).toMatchObject({ path: 'Records/Scanned Papers/Quiz 3/Juan.jpg' });
    expect(fs.readFileSync(path.join(home, 'Lessons', 'Week 1', 'Board notes.jpg'))).toEqual(Buffer.from(photo));
    // A name with slashes stays inside the folder.
    expect(await client.upload('Lessons', '../../evil.pdf', photo)).toMatchObject({ path: 'Lessons/evil.pdf' });
    await expect(client.upload('Seminars', 'a.pdf', photo)).rejects.toMatchObject({ code: 'NOT_ALLOWED' });
    await expect(client.upload('Lessons/../..', 'a.pdf', photo)).rejects.toThrow();
    await expect(client.upload('Lessons', 'setup.exe', photo)).rejects.toMatchObject({ code: 'NOT_ALLOWED' });
    // No formats that can carry macros.
    for (const name of ['grades.xlsm', 'old.doc', 'old.xls', 'old.ppt']) {
      await expect(client.upload('Lessons', name, photo)).rejects.toMatchObject({ code: 'NOT_ALLOWED' });
    }
    expect(fs.existsSync(path.join(tmp, 'a.pdf'))).toBe(false);
  });

  it('a message captured on the Wi-Fi cannot be replayed after KaTuroDesk restarts', async () => {
    const { home, storeFile } = await setup();
    const { link } = await pairPhone();
    let captured = null;
    const spy = async (url, init) => { captured = init.body; return fetch(url, init); };
    await createLinkClient(link, { fetchImpl: spy }).list('Records');
    service.stop();
    // KaTuroDesk opens again (same app data), then the captured message is sent again.
    service = createLinkService({ home: () => home, storeFile, protect, addresses: () => [{ address: '127.0.0.1', name: 'test' }], account: TEACHER });
    await service.start(0);
    const res = await fetch(`http://127.0.0.1:${service.status().port}/link`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: captured }).then((r) => r.json());
    expect(res).toMatchObject({ code: 'STALE' });
    // The phone itself still works after the restart.
    expect(await createLinkClient({ ...link, port: service.status().port }).hello()).toMatchObject({ phone: "Ma'am Ana's phone" });
  });

  it('a phone that could not be saved is not linked, and leaves nothing behind', async () => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kt-link-'));
    const home = path.join(tmp, 'KaTuro');
    fs.mkdirSync(home);
    fs.writeFileSync(path.join(tmp, 'not-a-folder'), 'x');
    // The phones list would go inside a file, so saving always fails.
    service = createLinkService({ home: () => home, storeFile: path.join(tmp, 'not-a-folder', 'linked-phones.json'), protect, addresses: () => [{ address: '127.0.0.1', name: 'test' }], account: TEACHER });
    await service.start(0);
    await expect(pairPhone()).rejects.toThrow(/could not save this phone/);
    expect(service.status().devices).toEqual([]);
  });

  it('links only a phone signed in to the same KaTuro account as KaTuroDesk', async () => {
    await setup();
    const qr = parseLinkQr(service.beginPairing().qrText);
    await expect(pairWithDesk(qr, { deviceName: 'Other teacher', uid: 'uid-someone-else' })).rejects.toMatchObject({ code: 'WRONG_ACCOUNT' });
    await expect(pairWithDesk(qr, { deviceName: 'No account' })).rejects.toMatchObject({ code: 'WRONG_ACCOUNT' });
    expect(service.status().devices).toEqual([]);
    service.setAccount('');
    await expect(pairWithDesk(parseLinkQr(service.beginPairing().qrText), { uid: TEACHER })).rejects.toMatchObject({ code: 'DESK_SIGNED_OUT' });
  });

  it('when KaTuroDesk signs in to another account, phones of the first one are not served', async () => {
    await setup();
    const client = createLinkClient((await pairPhone()).link);
    await client.hello();
    service.setAccount('uid-another-teacher');
    await expect(client.list('Records')).rejects.toMatchObject({ code: 'OTHER_ACCOUNT' });
    service.setAccount(TEACHER);
    expect((await client.list('Records')).items.length).toBeGreaterThan(0);
  });
});
