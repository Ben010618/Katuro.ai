import { describe, it, expect, vi } from 'vitest';
import { createTalk, intentOf, cleanTalk, TALK_PROMPT, LINES, firstSentence, restAfter } from './talk';

function setup({ heard = 'What is my next class?', plan = null, answer = 'Your next class is Science 7 at 7:30.', early = '' } = {}) {
  let waiting = plan;
  const said = [];
  const states = [];
  const deps = {
    record: vi.fn(async () => ({ stop: async () => new Uint8Array([1, 2, 3]), cancel: vi.fn() })),
    transcribe: vi.fn(async () => heard),
    // The reply streams in: onReply hears it growing, word by word.
    ask: vi.fn(async (text, { onReply }) => { if (early) { const w = early.split(' '); for (let i = 1; i <= w.length; i += 1) onReply(w.slice(0, i).join(' ')); } return { content: answer }; }),
    pending: () => waiting,
    confirm: vi.fn(async () => { waiting = null; return { content: 'Done. I made the quiz.' }; }),
    decline: vi.fn(() => { waiting = null; }),
    say: vi.fn((t) => said.push(t)),
    stopSpeaking: vi.fn(),
    onState: (s) => states.push(s.phase),
  };
  return { talk: createTalk(deps), deps, said, states, setPlan: (p) => { waiting = p; } };
}

describe('talking with the persona', () => {
  it('understands English, Filipino and Taglish (the prompt allows all three, never translates)', () => {
    expect(TALK_PROMPT).toMatch(/English, Filipino \(Tagalog\) or Taglish/);
    expect(TALK_PROMPT).toMatch(/Do not translate/);
    expect(cleanTalk('"Gawa ka ng quiz for Grade 7."')).toBe('Gawa ka ng quiz for Grade 7.');
    expect(cleanTalk('[no speech]')).toBe('');
  });

  it('short answers: yes / no / stop, with po and names around them; real requests are not mistaken', () => {
    expect(['Yes.', 'Sige po', 'Go ahead, Luna!', 'Opo', 'Okay po', 'ituloy mo'].map(intentOf)).toEqual(['yes', 'yes', 'yes', 'yes', 'yes', 'yes']);
    expect(['No', 'Huwag na po', 'Cancel', 'Wait', 'Hindi'].map(intentOf)).toEqual(['no', 'no', 'no', 'no', 'no']);
    expect(['Stop', 'Tama na', 'Be quiet please'].map(intentOf)).toEqual(['stop', 'stop', 'stop']);
    expect(['Yes, make it 20 items instead', 'Okay make a quiz', 'No more lessons today please Luna thanks', 'What is my next class?'].map(intentOf)).toEqual([null, null, null, null]);
  });

  it('hold, speak, let go: listening → thinking → idle; the answer is spoken; any voice already talking stops first', async () => {
    const { talk, deps, said, states } = setup();
    expect(await talk.begin()).toBe(true);
    expect(deps.stopSpeaking).toHaveBeenCalled();
    await talk.end();
    expect(deps.ask).toHaveBeenCalledWith('What is my next class?', expect.any(Object));
    expect(said).toEqual(['Your next class is Science 7 at 7:30.']);
    expect(states).toEqual(['listening', 'thinking', 'thinking', 'thinking', 'idle']);
  });

  it("the reply's first full sentence is spoken while it works; the rest follows, nothing twice", async () => {
    const { talk, said } = setup({ early: 'Sure, making the quiz now. It will have', answer: 'Sure, making the quiz now. It will have 20 items.' });
    await talk.begin();
    await talk.end();
    expect(said).toEqual(['Sure, making the quiz now.', 'It will have 20 items.']);
    const one = setup({ early: 'Your next class is at 10', answer: 'Your next class is at 10.30.' });
    await one.talk.begin();
    await one.talk.end();
    expect(one.said).toEqual(['Your next class is at 10.30.']); // "at 10." is never said early
    const done = setup({ early: 'Okay, done. ', answer: '**Okay, done.**' });
    await done.talk.begin();
    await done.talk.end();
    expect(done.said).toEqual(['Okay, done.']);
  });

  it('first sentence and the rest', () => {
    expect(firstSentence('Sure. More')).toBe('');
    expect(firstSentence('Sure thing, Sir. More')).toBe('Sure thing, Sir.');
    expect(firstSentence('No end yet')).toBe('');
    expect(restAfter('Hello there. Rest here.', 'Hello there.')).toBe('Rest here.');
    expect(restAfter('Something else.', 'Hello there.')).toBe('Something else.');
    expect(restAfter('Hello there.', 'Hello there.')).toBe('');
  });

  it('the fixed spoken lines are short', () => {
    for (const line of Object.values(LINES)) expect(line.split(' ').length).toBeLessThanOrEqual(6);
  });

  it('a plan that changes files waits for a spoken yes or no', async () => {
    const asked = setup({ answer: 'I will make the quiz and save it in your folder.' });
    asked.deps.ask.mockImplementation(async () => { asked.setPlan({ tasks: [1] }); return { content: 'I will make the quiz and save it in your folder.' }; });
    await asked.talk.begin();
    await asked.talk.end();
    expect(asked.said.at(-1)).toBe(`I will make the quiz and save it in your folder. ${LINES.confirm}`);

    const yes = setup({ heard: 'Sige po', plan: { tasks: [1] } });
    await yes.talk.begin();
    await yes.talk.end();
    expect(yes.deps.confirm).toHaveBeenCalledWith({ tasks: [1] });
    expect(yes.deps.ask).not.toHaveBeenCalled();
    expect(yes.said).toEqual([LINES.proceeding, 'Done. I made the quiz.']);

    const no = setup({ heard: 'Huwag na', plan: { tasks: [1] } });
    await no.talk.begin();
    await no.talk.end();
    expect(no.deps.decline).toHaveBeenCalled();
    expect(no.deps.confirm).not.toHaveBeenCalled();
    expect(no.said).toEqual([LINES.declined]);
  });

  it('nothing heard, "stop", busy, and a missing microphone are all handled kindly', async () => {
    const quiet = setup({ heard: '' });
    await quiet.talk.begin();
    await quiet.talk.end();
    expect(quiet.said).toEqual([LINES.notHeard]);

    const stop = setup({ heard: 'Tama na' });
    await stop.talk.begin();
    await stop.talk.end();
    expect(stop.deps.ask).not.toHaveBeenCalled();
    expect(stop.said).toEqual([]);

    const busy = setup();
    let release;
    busy.deps.ask.mockImplementation(() => new Promise((r) => { release = r; }));
    await busy.talk.begin();
    const running = busy.talk.end();
    await new Promise((r) => setTimeout(r, 0));
    expect(await busy.talk.begin()).toBe(false);
    expect(busy.said).toEqual([LINES.busy]);
    release({ content: 'Done.' });
    await running;

    const nomic = setup();
    nomic.deps.record.mockRejectedValue(new Error('No microphone was found.'));
    expect(await nomic.talk.begin()).toBe(false);
    expect(nomic.talk.getState()).toMatchObject({ phase: 'idle', error: 'No microphone was found.' });
  });

  it('hands-free (after the wake phrase): ends by itself after a pause; no speech at all cancels quietly', async () => {
    let t = 0;
    let level = null;
    const s = setup();
    s.deps.now = () => t;
    s.deps.record.mockImplementation(async ({ onLevel } = {}) => { level = onLevel; return { stop: async () => new Uint8Array([1]), cancel: vi.fn() }; });
    const { talk, deps } = { talk: createTalk(s.deps), deps: s.deps };
    await talk.begin({ auto: true });
    expect(typeof level).toBe('function');
    for (const [ms, lv] of [[100, 0.02], [500, 0.4], [900, 0.5], [1300, 0.3], [1500, 0.03], [2000, 0.02]]) { t = ms; level(lv); }
    expect(deps.transcribe).not.toHaveBeenCalled(); // only 500 ms of quiet so far
    t = 2900; level(0.02);
    await new Promise((r) => setTimeout(r, 0));
    expect(deps.transcribe).toHaveBeenCalledTimes(1);

    const q = setup();
    let lv2 = null;
    let tt = 0;
    q.deps.now = () => tt;
    q.deps.record.mockImplementation(async ({ onLevel } = {}) => { lv2 = onLevel; return { stop: async () => new Uint8Array([1]), cancel: vi.fn() }; });
    const quiet = createTalk(q.deps);
    await quiet.begin({ auto: true });
    tt = 6100; lv2(0.01);
    await new Promise((r) => setTimeout(r, 0));
    expect(q.deps.transcribe).not.toHaveBeenCalled();
    expect(quiet.getState().phase).toBe('idle');
  });

  it('letting go outside the button sends nothing', async () => {
    const { talk, deps } = setup();
    await talk.begin();
    talk.cancel();
    await talk.end();
    expect(deps.transcribe).not.toHaveBeenCalled();
    expect(talk.getState().phase).toBe('idle');
  });
});
