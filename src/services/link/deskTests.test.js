/**
 * The phone's Tests requests on KaTuroDesk: tests, test, testKey, testRecorded (deskRequests.js)
 * and checkPhotos (deskAssistant.js: the AI reads the photos, code scores; nothing is saved).
 */
import { describe, it, expect, vi } from 'vitest';
import { Buffer } from 'node:buffer';
import jpeg from 'jpeg-js';
import { createVirtualWorkspace, readFileBytes, readDirectoryRecursively } from '../localFileSystem.js';
import { newQuiz, QUIZ_FILE, CHECK_FILE } from '../desk/bubble/quiz.js';
import { createDeskRequestHandler } from './deskRequests.js';
import { createAssistantHandler, ASSISTANT_OPS } from './deskAssistant.js';

const FOLDER = 'Lessons/Tests/Grade 7 - Rizal - Science/Mixtures Quiz';
const PATH = `${FOLDER}/${QUIZ_FILE}`;
const learners = [{ name: 'Dela Cruz, Juan P.', lrn: '136512340001' }, { name: 'Santos, Maria L.', lrn: '136512340003' }];
const photo = (shade) => new Uint8Array(jpeg.encode({ data: Buffer.alloc(16 * 16 * 4, shade), width: 16, height: 16 }, 90).data);
const text = async (ws, p) => JSON.parse(new TextDecoder().decode(await readFileBytes(ws.handle, p)));

function home() {
  const ws = createVirtualWorkspace('KaTuro');
  ws.handle.katuroHome = true;
  const quiz = newQuiz({
    title: 'Mixtures Quiz', items: 4, choices: 4, paper: 'a4', perPage: 4, learners,
    className: 'Grade 7 - Rizal - Science', recordPath: 'Records/Grade 7 - Rizal - Science.xlsx', column: 'ww3', columnLabel: 'Written Work 3',
  }, { now: new Date('2026-11-18T08:00:00Z') }).quiz;
  ws.handle.saveVirtualFile(PATH, JSON.stringify({ ...quiz, testPaper: `${FOLDER}/Mixtures Quiz - Test.docx` }));
  return { ws, quiz };
}

describe('phone Tests requests (KaTuroDesk side)', () => {
  it('tests → the list; test → quiz, key and the Test; testKey saves the key; testRecorded marks it', async () => {
    const { ws, quiz } = home();
    const onWrote = vi.fn();
    const ask = createDeskRequestHandler({ handle: ws.handle, onWrote, now: () => Date.parse('2026-11-19T10:00:00Z') });
    let { tests } = await ask('tests');
    expect(tests).toHaveLength(1);
    expect(tests[0]).toMatchObject({ path: PATH, folder: FOLDER, title: 'Mixtures Quiz', className: 'Grade 7 - Rizal - Science', items: 4, choices: 4, learners: 2, hasKey: false, recordPath: 'Records/Grade 7 - Rizal - Science.xlsx', column: 'ww3', columnLabel: 'Written Work 3', photos: 0, status: 'new' });

    await expect(ask('testKey', { path: PATH, key: ['A', 'B'] })).rejects.toMatchObject({ code: 'INVALID' });
    await expect(ask('testKey', { path: PATH, key: ['A', 'B', 'C', 'F'] })).rejects.toMatchObject({ code: 'INVALID', message: expect.stringMatching(/Item 4/) });
    await expect(ask('testKey', { path: 'Records/x.json', key: [] })).rejects.toMatchObject({ code: 'INVALID' });
    expect(await ask('testKey', { path: PATH, key: ['a', 'B', 'C', 'D'] })).toEqual({ ok: true });
    expect(await text(ws, `${FOLDER}/${CHECK_FILE}`)).toEqual({ sheets: {}, decisions: {}, answerKey: ['A', 'B', 'C', 'D'], keyText: 'ABCD' });
    expect(onWrote).toHaveBeenCalledWith(`${FOLDER}/${CHECK_FILE}`);

    ws.handle.saveVirtualFile(`${FOLDER}/Photos/IMG_1.jpg`, photo(200));
    const one = await ask('test', { path: PATH });
    expect(one.quiz.setId).toBe(quiz.setId);
    expect(one.answerKey).toEqual(['A', 'B', 'C', 'D']);
    expect(one.test).toMatchObject({ hasKey: true, photos: 1, status: 'photos' });
    // The old request still answers older phones the same way.
    expect(await ask('quiz', { path: PATH })).toEqual({ quiz: one.quiz, answerKey: ['A', 'B', 'C', 'D'] });

    expect(await ask('testRecorded', { path: PATH })).toEqual({ ok: true });
    const saved = await text(ws, PATH);
    expect(saved.recordedAt).toBe('2026-11-19T10:00:00.000Z');
    expect(saved.testPaper).toBe(`${FOLDER}/Mixtures Quiz - Test.docx`); // the rest of the manifest is kept
    ({ tests } = await ask('tests'));
    expect(tests[0].status).toBe('recorded');
    await expect(ask('test', { path: `${FOLDER}/nothing/${QUIZ_FILE}` })).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('checkPhotos reads the photos with the AI against the key and the learners; nothing is saved', async () => {
    const { ws } = home();
    ws.handle.saveVirtualFile(`${FOLDER}/${CHECK_FILE}`, JSON.stringify({ answerKey: ['A', 'B', 'C', 'D'], sheets: {}, decisions: {} }));
    const imgs = { [`${FOLDER}/Photos/IMG_1.jpg`]: photo(250), [`${FOLDER}/Photos/IMG_2.jpg`]: photo(150), [`${FOLDER}/Photos/IMG_3.jpg`]: photo(90) };
    for (const [p, b] of Object.entries(imgs)) ws.handle.saveVirtualFile(p, b);
    const reads = {
      [`${FOLDER}/Photos/IMG_1.jpg`]: { name: 'Juan Dela Cruz', answers: { 1: 'A', 2: 'B', 3: 'C', 4: 'D' } },
      [`${FOLDER}/Photos/IMG_2.jpg`]: { name: 'Pedro Penduko', answers: { 1: 'A', 2: '?', 3: 'D', 4: 'D' } },
    };
    const seenPrompts = [];
    const llm = vi.fn(async (opts) => {
      seenPrompts.push(`${opts.system}\n${opts.prompt}`);
      const parts = JSON.stringify(opts.parts);
      const hit = Object.keys(reads).find((p) => parts.includes(Buffer.from(imgs[p]).toString('base64')));
      if (!hit) throw new Error('blurry');
      return reads[hit];
    });
    const before = JSON.stringify(ws.handle.getFiles());
    const assistant = createAssistantHandler({
      getState: () => ({}), calendar: {}, getAccount: () => ({ user: { uid: 'u1' } }), runTurn: vi.fn(), llm,
      getWorkspace: async () => ({ handle: ws.handle, files: await readDirectoryRecursively(ws.handle) }),
    });
    expect(ASSISTANT_OPS.has('checkPhotos')).toBe(true);
    const photos = Object.keys(imgs);
    const { rows } = await assistant('checkPhotos', { path: PATH, photos });
    expect(rows).toEqual([
      { photo: photos[0], n: 1, name: 'Dela Cruz, Juan P.', score: 4, items: 4, unclear: [] },
      { photo: photos[1], n: null, name: 'Pedro Penduko', score: 2, items: 4, unclear: [2], note: 'name not in the class list; unclear: item 2' },
      { photo: photos[2], n: null, name: null, score: null, items: 4, unclear: [], note: 'Could not be read (blurry). Retake the photo.' },
    ]);
    // No learner name goes to the AI, and nothing was written.
    expect(seenPrompts.join('\n')).not.toMatch(/Dela Cruz|Santos/);
    expect(JSON.stringify(ws.handle.getFiles())).toBe(before);
    expect(await text(ws, `${FOLDER}/${CHECK_FILE}`)).toEqual({ answerKey: ['A', 'B', 'C', 'D'], sheets: {}, decisions: {} });
  });

  it('checkPhotos refuses: not signed in, no key, photos outside the test, the AI unavailable', async () => {
    const { ws } = home();
    ws.handle.saveVirtualFile(`${FOLDER}/Photos/IMG_1.jpg`, photo(250));
    ws.handle.saveVirtualFile('Lessons/elsewhere.jpg', photo(250));
    let account = { user: null };
    let llm = vi.fn();
    const assistant = createAssistantHandler({
      getState: () => ({}), calendar: {}, getAccount: () => account, runTurn: vi.fn(), llm: (o) => llm(o),
      getWorkspace: async () => ({ handle: ws.handle }),
    });
    const ok = { path: PATH, photos: [`${FOLDER}/Photos/IMG_1.jpg`] };
    await expect(assistant('checkPhotos', ok)).rejects.toMatchObject({ code: 'NOT_SIGNED_IN' });
    account = { user: { uid: 'u1' } };
    await expect(assistant('checkPhotos', ok)).rejects.toMatchObject({ code: 'NO_KEY' });
    ws.handle.saveVirtualFile(`${FOLDER}/${CHECK_FILE}`, JSON.stringify({ answerKey: ['A', 'B', 'C', 'D'] }));
    await expect(assistant('checkPhotos', { path: PATH, photos: ['Lessons/elsewhere.jpg'] })).rejects.toMatchObject({ code: 'INVALID' });
    await expect(assistant('checkPhotos', { path: PATH, photos: [`${FOLDER}/Photos/../../x.jpg`] })).rejects.toMatchObject({ code: 'INVALID' });
    await expect(assistant('checkPhotos', { path: PATH, photos: [`${FOLDER}/Photos/IMG_9.jpg`] })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(assistant('checkPhotos', { path: PATH, photos: [] })).rejects.toMatchObject({ code: 'INVALID' });
    llm = vi.fn(async () => { throw Object.assign(new Error("Today's limit is reached."), { dailyLimit: true }); });
    await expect(assistant('checkPhotos', ok)).rejects.toMatchObject({ code: 'DAILY_LIMIT' });
    llm = vi.fn(async () => { throw Object.assign(new Error('offline'), { code: 'AI_UNAVAILABLE' }); });
    await expect(assistant('checkPhotos', ok)).rejects.toMatchObject({ code: 'AI_UNAVAILABLE' });
  });

  it('checkPhotos stops at its time limit and answers with what it read; the rest are "not read in time"', async () => {
    const { ws } = home();
    ws.handle.saveVirtualFile(`${FOLDER}/${CHECK_FILE}`, JSON.stringify({ answerKey: ['A', 'B', 'C', 'D'] }));
    const fast = photo(250);
    ws.handle.saveVirtualFile(`${FOLDER}/Photos/IMG_1.jpg`, fast);
    ws.handle.saveVirtualFile(`${FOLDER}/Photos/IMG_2.jpg`, photo(100));
    const llm = vi.fn(async (opts) => (JSON.stringify(opts.parts).includes(Buffer.from(fast).toString('base64'))
      ? { name: 'Santos, Maria', answers: { 1: 'A', 2: 'B', 3: 'C', 4: 'A' } }
      : new Promise(() => {})));
    const assistant = createAssistantHandler({
      getState: () => ({}), calendar: {}, getAccount: () => ({ user: { uid: 'u1' } }), runTurn: vi.fn(), llm, checkPhotosMs: 80,
      getWorkspace: async () => { throw new Error('the whole folder is not read'); }, getHandle: () => ws.handle,
    });
    const { rows } = await assistant('checkPhotos', { path: PATH, photos: [`${FOLDER}/Photos/IMG_1.jpg`, `${FOLDER}/Photos/IMG_2.jpg`] });
    expect(rows).toEqual([
      { photo: `${FOLDER}/Photos/IMG_1.jpg`, n: 2, name: 'Santos, Maria L.', score: 3, items: 4, unclear: [] },
      { photo: `${FOLDER}/Photos/IMG_2.jpg`, n: null, name: null, score: null, items: 4, unclear: [], note: 'Not read in time — check again' },
    ]);
  });
});
