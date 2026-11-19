/**
 * The phone ↔ KaTuroDesk link: the real KaTuroDesk service (electron/linkService.cjs)
 * against the real KaTuro App client (src/services/link/linkClient.js), over HTTP on this PC.
 */
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { createRequire } from 'module';
import { execSync } from 'child_process';
import crypto from 'crypto';
import { parseLinkQr, pairWithDesk, createLinkClient } from '../src/services/link/linkClient.js';

const require = createRequire(import.meta.url);
const { createLinkService } = require('../electron/linkService.cjs');
const { resolvePhonePath } = require('../electron/phoneAccess.cjs');

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

// Opens KaTuroDesk's encrypted answer to a captured request (the test holds the phone's key).
function openAnswer(link, capturedBody, answer) {
  const key = Buffer.from(link.key, 'base64url');
  const open = (env, aadText) => {
    const iv = Buffer.from(env.iv, 'base64url');
    const all = Buffer.from(env.ct, 'base64url');
    const d = crypto.createDecipheriv('aes-256-gcm', key, iv);
    d.setAAD(Buffer.from(aadText));
    d.setAuthTag(all.subarray(all.length - 16));
    return JSON.parse(Buffer.concat([d.update(all.subarray(0, all.length - 16)), d.final()]).toString('utf8'));
  };
  const req = open(JSON.parse(capturedBody), `katuro-link|${link.deviceId}|req`);
  return open(answer, `katuro-link|${link.deviceId}|res|${req.nonce}`);
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
    expect(qr).toMatchObject({ hosts: ['127.0.0.1'] });
    expect(link.deskName).toBe("Teacher's laptop");
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
    await expect(client.read('../secret.txt')).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(client.read('Records/../../secret.txt')).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(client.list('..')).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(resolvePhonePath('C:/Windows', { home: path.join(tmp, 'KaTuro') })).toBeNull();
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
    // Refused, in KaTuroDesk's encrypted answer (so nobody on the Wi-Fi can fake the time in it).
    expect(openAnswer(link, captured, await post(captured))).toMatchObject({ code: 'STALE' });
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

  it("Tests requests follow the phone's level for the test's folder (Lessons)", async () => {
    const asked = [];
    const T = 'Lessons/Tests/Grade 7 - Rizal - Science/Quiz 1/KaTuro bubble quiz.json';
    await setup({
      askDesk: async (op) => {
        asked.push(op);
        if (op === 'tests') return { tests: [{ path: T }, { path: 'Records/Old/KaTuro bubble quiz.json' }] };
        if (op === 'quizzes') return { quizzes: [{ path: T }, { path: 'Records/Old/KaTuro bubble quiz.json' }] };
        return { ok: true };
      },
    });
    const client = createLinkClient((await pairPhone()).link);
    const [id] = service.status().devices.map((d) => d.id);
    service.setAccess(id, 'home:records', 'hidden');
    expect(await client.request('tests')).toEqual({ tests: [{ path: T }] });
    expect(await client.request('quizzes')).toEqual({ quizzes: [{ path: T }] });
    await expect(client.request('quiz', { path: 'Records/Old/KaTuro bubble quiz.json' })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(await client.request('testKey', { path: T, key: ['A'] })).toEqual({ ok: true });
    await expect(client.request('checkPhotos', { path: T, photos: ['../secret.txt'] })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    service.setAccess(id, 'home:lessons', 'view');
    expect(await client.request('test', { path: T })).toEqual({ ok: true });
    await expect(client.request('testRecorded', { path: T })).rejects.toMatchObject({ code: 'NOT_ALLOWED' });
    service.setAccess(id, 'home:lessons', 'hidden');
    expect(await client.request('tests')).toEqual({ tests: [] });
    await expect(client.request('test', { path: T })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(client.request('quiz', { path: T })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(asked).toEqual(['tests', 'quizzes', 'testKey', 'test', 'tests']);
  });

  it('a phone can send files where KaTuroDesk allows it (Lessons by default), never over an existing file, and never programs', async () => {
    const { home } = await setup();
    const client = createLinkClient((await pairPhone()).link);
    const photo = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
    expect(await client.upload('Lessons/Week 1', 'Board notes.jpg', photo)).toMatchObject({ path: 'Lessons/Week 1/Board notes.jpg', size: 7 });
    expect(await client.upload('Lessons/Week 1', 'Board notes.jpg', photo)).toMatchObject({ path: 'Lessons/Week 1/Board notes (2).jpg' });
    // Records is view only by default: scores go in through the checked Scores flow.
    await expect(client.upload('Records/Scanned Papers/Quiz 3', 'Juan.jpg', photo)).rejects.toMatchObject({ code: 'NOT_ALLOWED' });
    await expect(client.upload('', 'loose.jpg', photo)).rejects.toMatchObject({ code: 'NOT_ALLOWED' });
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
    expect(openAnswer(link, captured, res)).toMatchObject({ code: 'STALE' });
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

  it('after unlink / sign-out the old client answers nothing and saves nothing', async () => {
    await setup();
    const saved = [];
    const client = createLinkClient((await pairPhone()).link, { onLinkChange: (l) => saved.push(l) });
    expect((await pairPhone()).link.uid).toBe(TEACHER);
    const pending = client.list('Records');
    client.close();
    await expect(pending).rejects.toMatchObject({ code: 'CLOSED' });
    await expect(client.hello()).rejects.toMatchObject({ code: 'CLOSED' });
    expect(saved).toEqual([]);
    expect(client.closed).toBe(true);
  });

  it('learns an address KaTuroDesk has that the phone did not save (no crash), and keeps the list short', async () => {
    await setup();
    const { link } = await pairPhone();
    const saved = [];
    // The phone reached the Desk as "localhost"; the Desk reports 127.0.0.1.
    const client = createLinkClient({ ...link, hosts: ['localhost'] }, { onLinkChange: (l) => saved.push(l) });
    await client.hello();
    expect(saved.at(-1).hosts).toEqual(['localhost', '127.0.0.1']);
    expect(client.link.hosts.length).toBeLessThanOrEqual(6);
  });
});

describe('what phones can see (Settings → Phones)', () => {
  const photo = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
  const levelsOf = (items) => Object.fromEntries(items.map((i) => [i.name, i.access]));

  it('starts with Records view, Lessons view & add, and shows each item with its level', async () => {
    await setup();
    const client = createLinkClient((await pairPhone()).link);
    const top = await client.list('');
    expect(levelsOf(top.items)).toEqual({ Lessons: 'add', Records: 'view' });
    expect((await client.list('Lessons')).access).toBe('add');
    const st = service.status();
    expect(st.folders.map((f) => [f.name, f.kind])).toEqual([['Records', 'home'], ['Lessons', 'home']]);
    expect(st.devices[0].levels).toEqual({ 'home:records': 'view', 'home:lessons': 'add' });
  });

  it('a hidden folder is not on the phone at all; each phone has its own levels', async () => {
    await setup();
    const ana = createLinkClient((await pairPhone()).link);
    const tablet = createLinkClient((await pairPhone()).link);
    const [phoneId] = service.status().devices.map((d) => d.id);
    service.setAccess(phoneId, 'home:records', 'hidden');
    expect((await ana.list('')).items.map((i) => i.name)).toEqual(['Lessons']);
    await expect(ana.list('Records')).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(ana.read('Records/Grade 7 - Rizal - Science.xlsx')).rejects.toMatchObject({ code: 'NOT_FOUND' });
    // The tablet keeps the default.
    expect((await tablet.list('')).items.map((i) => i.name)).toEqual(['Lessons', 'Records']);
    expect(() => service.setAccess(phoneId, 'home:records', 'boss')).toThrow();
  });

  it('an outside folder the teacher adds shows on the phone, view only until changed, and never leads outside', async () => {
    const { home } = await setup();
    const school = path.join(tmp, 'School Files');
    fs.mkdirSync(path.join(school, 'Science'), { recursive: true });
    fs.writeFileSync(path.join(school, 'Science', 'Quiz.docx'), 'quiz');
    const client = createLinkClient((await pairPhone()).link);
    const st = service.addShared(school);
    const folder = st.folders.find((f) => f.kind === 'outside');
    expect(folder).toMatchObject({ name: 'School Files', path: school });
    const top = await client.list('');
    expect(top.items.find((i) => i.outside)).toMatchObject({ name: 'School Files', path: ':School Files', access: 'view' });
    expect((await client.list(':School Files/Science')).items[0]).toMatchObject({ path: ':School Files/Science/Quiz.docx', access: 'view' });
    expect((await client.read(':School Files/Science/Quiz.docx')).name).toBe('Quiz.docx');
    await expect(client.upload(':School Files/Science', 'a.jpg', photo)).rejects.toMatchObject({ code: 'NOT_ALLOWED' });
    service.setAccess(st.devices[0].id, folder.key, 'add');
    expect(await client.upload(':School Files/Science', 'a.jpg', photo)).toMatchObject({ path: ':School Files/Science/a.jpg' });
    await expect(client.read(':School Files/../secret.txt')).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(client.list(':Nope')).rejects.toMatchObject({ code: 'NOT_FOUND' });
    // A shortcut inside it that leads out of it is refused.
    fs.symlinkSync(tmp, path.join(school, 'Way out'), 'junction');
    await expect(client.list(':School Files/Way out')).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect((await client.list(':School Files')).items.map((i) => i.name)).toEqual(['Science']);
    // Removed: gone from the phone.
    service.removeShared(folder.id);
    await expect(client.list(':School Files')).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(fs.existsSync(path.join(home, 'Lessons'))).toBe(true);
  });

  it('refuses folders that are not safe to show: a drive, KaTuroDesk\'s own files, the KaTuro folder, overlaps', async () => {
    const { home, storeFile } = await setup();
    const appData = path.dirname(storeFile);
    service.stop();
    service = createLinkService({
      account: TEACHER, home: () => home, storeFile, protect, addresses: () => [],
      guard: { profile: path.join(tmp, 'me'), protectedPaths: [appData], systemPaths: [path.join(tmp, 'Windows')] },
    });
    fs.mkdirSync(path.join(tmp, 'me', 'Docs'), { recursive: true });
    fs.mkdirSync(path.join(tmp, 'Windows', 'System32'), { recursive: true });
    const refuse = (dir, re) => expect(() => service.addShared(dir)).toThrow(re);
    refuse(path.parse(tmp).root, /whole drive/);
    refuse(path.join(tmp, 'Windows', 'System32'), /Windows/);
    refuse(tmp, /KaTuroDesk's own files/);
    refuse(path.join(tmp, 'me'), /whole user folder/);
    refuse(home, /already on the phone/);
    refuse(path.join(home, 'Lessons'), /already on the phone/);
    refuse(path.join(tmp, 'missing'), /cannot be found/);
    service.addShared(path.join(tmp, 'me', 'Docs'));
    refuse(path.join(tmp, 'me', 'Docs'), /overlaps/);
  });

  it('full: rename (same ending), move inside the same folder, replace with a backup first', async () => {
    const { home } = await setup();
    const client = createLinkClient((await pairPhone()).link);
    const id = service.status().devices[0].id;
    const cells = 'Lessons/Week 1/Cells.pdf';
    await expect(client.request('rename', { path: cells, name: 'Plant cells.pdf' })).rejects.toMatchObject({ code: 'NOT_ALLOWED' });
    service.setAccess(id, 'home:lessons', 'full');
    expect((await client.list('Lessons/Week 1')).items[0].access).toBe('full');
    await expect(client.request('rename', { path: cells, name: 'Cells.exe' })).rejects.toThrow(/Keep the .pdf ending/);
    expect(await client.request('rename', { path: cells, name: 'Plant cells.pdf' })).toMatchObject({ path: 'Lessons/Week 1/Plant cells.pdf' });
    fs.mkdirSync(path.join(home, 'Lessons', 'Week 2'));
    expect(await client.request('move', { path: 'Lessons/Week 1/Plant cells.pdf', to: 'Lessons/Week 2' })).toMatchObject({ path: 'Lessons/Week 2/Plant cells.pdf' });
    // Not into a folder the phone may not change (Records is view).
    await expect(client.request('move', { path: 'Lessons/Week 2/Plant cells.pdf', to: 'Records' })).rejects.toMatchObject({ code: 'NOT_ALLOWED' });
    const fresh = new TextEncoder().encode('%PDF-1.4 new');
    const res = await client.request('replace', { path: 'Lessons/Week 2/Plant cells.pdf', name: 'scan.pdf', data: Buffer.from(fresh).toString('base64') });
    expect(fs.readFileSync(path.join(home, 'Lessons', 'Week 2', 'Plant cells.pdf'), 'utf8')).toBe('%PDF-1.4 new');
    expect(res.backup).toMatch(/^KaTuro Backups\/\d{4}-\d{2}-\d{2}\/Lessons\/Week 2\/Plant cells \(backup \d{6}\)\.pdf$/);
    expect(fs.readFileSync(path.join(home, ...res.backup.split('/')), 'utf8')).toBe('%PDF-1.4 lesson');
    await expect(client.request('replace', { path: 'Lessons/Week 2/Plant cells.pdf', name: 'x.docx', data: 'AA==' })).rejects.toThrow(/Choose a .pdf file/);
    // The KaTuro folders themselves and KaTuro Backups stay as they are.
    await expect(client.request('rename', { path: 'Lessons', name: 'X' })).rejects.toBeTruthy();
    expect(() => service.setAccess(id, 'home:katuro backups', 'full')).toThrow(/up to "view"/);
  });
});

describe('a phone holding a valid key cannot get around the levels', () => {
  const photo = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
  const b64 = (t) => Buffer.from(t).toString('base64');
  // The 8.3 short name Windows gives a folder (null where short names are switched off).
  const shortName = (p) => {
    if (process.platform !== 'win32') return null;
    try {
      const out = execSync(`cmd /c for %I in ("${p}") do @echo %~sI`, { encoding: 'utf8' }).trim();
      const name = path.basename(out);
      return name.includes('~') ? name : null;
    } catch { return null; }
  };

  it('another spelling of a hidden folder (NTFS stream, short name, case) is still hidden', async () => {
    const { home } = await setup();
    const client = createLinkClient((await pairPhone()).link);
    service.setAccess(service.status().devices[0].id, 'home:records', 'hidden');
    for (const p of ['Records::$INDEX_ALLOCATION', 'Records::$INDEX_ALLOCATION/Grade 7 - Rizal - Science.xlsx', 'RECORDS/Grade 7 - Rizal - Science.xlsx', 'Records./Grade 7 - Rizal - Science.xlsx', 'Records /x', 'CON', 'Lessons/NUL.pdf']) {
      await expect(client.read(p)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    }
    const short = shortName(path.join(home, 'Records'));
    if (short && short.toLowerCase() !== 'records') await expect(client.list(short)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('a full phone cannot change KaTuro Backups in an outside folder, not even by its short name', async () => {
    await setup();
    const sci = path.join(tmp, 'Sci');
    fs.mkdirSync(path.join(sci, 'KaTuro Backups'), { recursive: true });
    fs.writeFileSync(path.join(sci, 'KaTuro Backups', 'old.docx'), 'backup');
    const client = createLinkClient((await pairPhone()).link);
    const st = service.addShared(sci);
    service.setAccess(st.devices[0].id, st.folders.find((f) => f.kind === 'outside').key, 'full');
    const names = ['KaTuro Backups', 'katuro backups', 'KaTuro Backups::$INDEX_ALLOCATION'];
    const short = shortName(path.join(sci, 'KaTuro Backups'));
    if (short) names.push(short);
    for (const n of names) {
      await expect(client.request('replace', { path: `:Sci/${n}/old.docx`, data: b64('EVIL') })).rejects.toBeTruthy();
      await expect(client.upload(`:Sci/${n}`, 'x.pdf', photo)).rejects.toBeTruthy();
    }
    expect(fs.readFileSync(path.join(sci, 'KaTuro Backups', 'old.docx'), 'utf8')).toBe('backup');
    expect(fs.readdirSync(path.join(sci, 'KaTuro Backups'))).toEqual(['old.docx']);
  });

  it('a new folder below a shortcut that leads outside is refused, and nothing is made outside', async () => {
    await setup();
    const sci = path.join(tmp, 'Sci');
    const outside = path.join(tmp, 'outside');
    fs.mkdirSync(sci);
    fs.mkdirSync(outside);
    fs.symlinkSync(outside, path.join(sci, 'junc'), 'junction');
    const client = createLinkClient((await pairPhone()).link);
    const st = service.addShared(sci);
    service.setAccess(st.devices[0].id, st.folders.find((f) => f.kind === 'outside').key, 'full');
    await expect(client.upload(':Sci/junc/new', 'x.pdf', photo)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(client.upload(':Sci/junc', 'x.pdf', photo)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(fs.readdirSync(outside)).toEqual([]);
  });

  it('programs and macro files cannot be replaced, renamed or moved; device names are refused', async () => {
    const { home } = await setup();
    fs.writeFileSync(path.join(home, 'Lessons', 'run.bat'), 'echo hi');
    fs.writeFileSync(path.join(home, 'Lessons', 'marks.xlsm'), 'macro');
    const client = createLinkClient((await pairPhone()).link);
    service.setAccess(service.status().devices[0].id, 'home:lessons', 'full');
    for (const f of ['run.bat', 'marks.xlsm']) {
      await expect(client.request('replace', { path: `Lessons/${f}`, data: b64('calc') })).rejects.toMatchObject({ code: 'NOT_ALLOWED' });
      await expect(client.request('rename', { path: `Lessons/${f}`, name: `x${path.extname(f)}` })).rejects.toMatchObject({ code: 'NOT_ALLOWED' });
    }
    expect(fs.readFileSync(path.join(home, 'Lessons', 'run.bat'), 'utf8')).toBe('echo hi');
    await expect(client.upload('Lessons', 'CON.pdf', photo)).rejects.toMatchObject({ code: 'NOT_ALLOWED' });
    await expect(client.request('rename', { path: 'Lessons/Week 1/Cells.pdf', name: 'nul.pdf' })).rejects.toMatchObject({ code: 'NOT_ALLOWED' });
  });

  it('two replaces in the same second each keep their own backup', async () => {
    const { home } = await setup();
    const client = createLinkClient((await pairPhone()).link);
    service.setAccess(service.status().devices[0].id, 'home:lessons', 'full');
    const a = await client.request('replace', { path: 'Lessons/Week 1/Cells.pdf', data: b64('%PDF one') });
    const b = await client.request('replace', { path: 'Lessons/Week 1/Cells.pdf', data: b64('%PDF two') });
    expect(a.backup).not.toBe(b.backup);
    expect(fs.readFileSync(path.join(home, ...b.backup.split('/')), 'utf8')).toBe('%PDF one');
  });

  it('a dot folder reached by its short name (.git as GIT~1) stays hidden', async () => {
    await setup();
    const sci = path.join(tmp, 'Sci');
    fs.mkdirSync(path.join(sci, '.git'), { recursive: true });
    fs.writeFileSync(path.join(sci, '.git', 'config.txt'), 'secret');
    const client = createLinkClient((await pairPhone()).link);
    const st = service.addShared(sci);
    service.setAccess(st.devices[0].id, st.folders.find((f) => f.kind === 'outside').key, 'full');
    const short = shortName(path.join(sci, '.git'));
    if (!short) return;
    await expect(client.read(`:Sci/${short}/config.txt`)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(client.list(`:Sci/${short}`)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(client.upload(`:Sci/${short}`, 'hook.txt', photo)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(fs.readdirSync(path.join(sci, '.git'))).toEqual(['config.txt']);
  });

  it('a hidden folder such as .ssh cannot be added for phones', async () => {
    await setup();
    fs.mkdirSync(path.join(tmp, '.ssh'));
    expect(() => service.addShared(path.join(tmp, '.ssh'))).toThrow(/Hidden folders/);
  });
});

describe('linking is quick: a short QR code, every address at once, a phone clock that is off', () => {
  it('the QR code is short (a sparse code a camera reads at once) and old codes still read', async () => {
    await setup();
    const { qrText } = service.beginPairing();
    expect(qrText.startsWith('KT2|')).toBe(true);
    expect(qrText.length).toBeLessThan(110);
    expect(parseLinkQr(qrText)).toMatchObject({ hosts: ['127.0.0.1'], port: service.status().port });
    const old = 'KTLINK1:' + Buffer.from(JSON.stringify({ v: 1, id: 'p-x', k: 'A'.repeat(43), h: ['10.0.0.2'], p: 47821, n: 'Old PC', d: 'd' })).toString('base64url');
    expect(parseLinkQr(old)).toMatchObject({ id: 'p-x', hosts: ['10.0.0.2'], deskName: 'Old PC' });
    expect(parseLinkQr('KT2|only|two')).toBeNull();
    expect(parseLinkQr('hello')).toBeNull();
  });

  it('a phone whose clock is an hour off still links and works (KaTuroDesk tells it the time)', async () => {
    const hourAhead = () => Date.now() + 60 * 60 * 1000;
    await setup({ now: hourAhead });
    const { link } = await pairPhone();
    expect(link.deviceId).toBeTruthy();
    const client = createLinkClient(link);
    expect((await client.list('')).items.length).toBeGreaterThan(0);
  });

  it('an address that does not answer does not slow linking down', async () => {
    await setup();
    const { qrText } = service.beginPairing();
    const qr = parseLinkQr(qrText);
    const started = Date.now();
    // 192.0.2.1 is a documentation address: nothing answers there.
    const link = await pairWithDesk({ ...qr, hosts: ['192.0.2.1', ...qr.hosts] }, { deviceName: 'Tablet', uid: TEACHER });
    expect(Date.now() - started).toBeLessThan(3000);
    expect(link.hosts[0]).toBe('127.0.0.1');
  });
});

