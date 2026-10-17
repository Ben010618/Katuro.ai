import { describe, it, expect, vi } from 'vitest';
import { createTalk, intentOf, cleanTalk, TALK_PROMPT, LINES } from './talk';

function setup({ heard = 'What is my next class?', plan = null, answer = 'Your next class is Science 7 at 7:30.', early = '' } = {}) {
  let waiting = plan;
  const said = [];
  const states = [];
  const deps = {
    record: vi.fn(async () => ({ stop: async () => new Uint8Array([1, 2, 3]), cancel: vi.fn() })),
    transcribe: vi.fn(async () => heard),
    ask: vi.fn(async (text, { onReply }) => { if (early) onReply(early); return { content: answer }; }),
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

  it("the agent's first words are spoken right away while it works, and not repeated", async () => {
    const { talk, said } = setup({ early: 'Sure, making the quiz now.', answer: 'Sure, making the quiz now.' });
    await talk.begin();
    await talk.end();
    expect(said).toEqual(['Sure, making the quiz now.']);
    const two = setup({ early: 'Sure, one moment.', answer: 'Here is your quiz with 20 items.' });
    await two.talk.begin();
    await two.talk.end();
    expect(two.said).toEqual(['Sure, one moment.', 'Here is your quiz with 20 items.']);
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

  it('letting go outside the button sends nothing', async () => {
    const { talk, deps } = setup();
    await talk.begin();
    talk.cancel();
    await talk.end();
    expect(deps.transcribe).not.toHaveBeenCalled();
    expect(talk.getState().phase).toBe('idle');
  });
});
