import { describe, it, expect, vi } from 'vitest';
import { Buffer } from 'node:buffer';
import { createSpeaker, speechText, pcmToWav, SYSTEM_TUNING } from './speech';

const ended = () => {
  let finish;
  const done = new Promise((r) => { finish = r; });
  return { done, stop: vi.fn(() => finish()), finish };
};

describe('the persona speaks', () => {
  it('speech text: markdown, lists and folder paths are not read aloud; long replies are cut at a sentence', () => {
    expect(speechText('**Done!** I saved the quiz in Lesson Prep/G7. It has 20 items.')).toBe('Done! It has 20 items.');
    expect(speechText('- first\n- second')).toBe('first second');
    const long = 'This is one sentence that is fairly long. '.repeat(20);
    const out = speechText(long);
    expect(out.length).toBeLessThanOrEqual(420);
    expect(out.endsWith('.')).toBe(true);
    expect(speechText('   ')).toBe('');
    expect(speechText('Yooooooooooowwww, Sir Ben! Amazing dayyyy!')).toBe('Yoooowwww, Sir Ben! Amazing dayyyy!');
  });

  it('PCM becomes a playable WAV (24 kHz, 16-bit, mono)', () => {
    const wav = pcmToWav(Buffer.alloc(4800, 0).toString('base64'), 24000);
    const v = new DataView(wav.buffer);
    expect(String.fromCharCode(...wav.slice(0, 4))).toBe('RIFF');
    expect([v.getUint16(22, true), v.getUint32(24, true), v.getUint16(34, true), v.getUint32(40, true)]).toEqual([1, 24000, 16, 4800]);
  });

  it('natural voice first; repeated text is not fetched again; the animation hears speaking on/off', async () => {
    const callTts = vi.fn(async () => ({ audio: Buffer.alloc(480).toString('base64'), sampleRate: 24000, usedSeconds: 3, limitSeconds: 300 }));
    const plays = [];
    const sp = createSpeaker({ callTts, playWav: () => { const e = ended(); plays.push(e); setTimeout(e.finish, 5); return e; }, systemSay: vi.fn() });
    const seen = [];
    sp.subscribe((s) => seen.push(s.speaking));
    expect(await sp.say('Hello, Teacher!', { persona: 'luna' })).toEqual({ engine: 'natural' });
    expect(callTts).toHaveBeenCalledWith({ text: 'Hello, Teacher!', persona: 'luna' });
    await sp.say('Hello, Teacher!', { persona: 'luna' });
    expect(callTts).toHaveBeenCalledTimes(1);
    expect(plays).toHaveLength(2);
    expect(seen).toEqual([false, true, false, true, false]);
    expect(sp.getUsage()).toEqual({ usedSeconds: 3, limitSeconds: 300 });
  });

  it("after the 5 minutes, offline, or natural voice off: this computer's voice, tuned per persona", async () => {
    const systemSay = vi.fn(() => { const e = ended(); setTimeout(e.finish, 1); return e; });
    let sp = createSpeaker({ callTts: async () => ({ fallback: 'limit', usedSeconds: 300, limitSeconds: 300 }), playWav: vi.fn(), systemSay });
    expect(await sp.say('Your class starts soon.', { persona: 'carmen', volume: 0.5 })).toEqual({ engine: 'system', reason: 'limit' });
    expect(systemSay).toHaveBeenCalledWith('Your class starts soon.', SYSTEM_TUNING.carmen, 0.5);
    sp = createSpeaker({ callTts: async () => { throw new Error('offline'); }, playWav: vi.fn(), systemSay });
    expect((await sp.say('Hi.', { persona: 'grey' })).reason).toBe('offline');
    const callTts = vi.fn();
    sp = createSpeaker({ callTts, playWav: vi.fn(), systemSay });
    expect((await sp.say('Hi.', { natural: false })).reason).toBe('off');
    expect(callTts).not.toHaveBeenCalled();
  });

  it("the laptop's own voice (Piper) speaks before the Windows voice; a failed natural voice is not asked again for 10 minutes", async () => {
    let t = 0;
    const callTts = vi.fn(async () => ({ fallback: 'unavailable' }));
    const localTts = vi.fn(async () => new Uint8Array([1, 2]));
    const systemSay = vi.fn(() => { const e = ended(); setTimeout(e.finish, 1); return e; });
    const playWav = vi.fn(() => { const e = ended(); setTimeout(e.finish, 1); return e; });
    const sp = createSpeaker({ callTts, localTts, playWav, systemSay, now: () => t });
    expect(await sp.say('Hello.', { persona: 'luna' })).toEqual({ engine: 'local', reason: 'unavailable' });
    expect(systemSay).not.toHaveBeenCalled();
    t = 5 * 60 * 1000;
    expect(await sp.say('Next one.', { persona: 'luna' })).toEqual({ engine: 'local', reason: 'resting' });
    expect(callTts).toHaveBeenCalledTimes(1);
    t = 11 * 60 * 1000;
    await sp.say('Third one.', { persona: 'luna' });
    expect(callTts).toHaveBeenCalledTimes(2);
    // Not ready on this computer yet (first download): the Windows voice speaks this time.
    const notReady = createSpeaker({ callTts: async () => ({ fallback: 'limit' }), localTts: async () => null, playWav, systemSay });
    expect((await notReady.say('Hi.', { persona: 'grey' })).engine).toBe('system');
  });

  it("each persona's voice is fixed, and the laptop voice plays at its natural speed", async () => {
    const { PIPER_VOICES, PLAYBACK_RATE, voiceOf } = await import('./piperVoice');
    expect(PIPER_VOICES).toEqual({ matt: 'en_US-ryan-medium', grey: 'en_GB-alan-medium', luna: 'en_US-hfc_female-medium', carmen: 'en_US-kristin-medium' });
    expect(voiceOf('carmen')).toBe('en_US-kristin-medium');
    expect(voiceOf('nobody')).toBe('en_US-ryan-medium');
    expect(Object.values(PLAYBACK_RATE)).toEqual([1, 1, 1, 1]); // natural speed: no pitch shift
    const playWav = vi.fn(() => { const e = ended(); setTimeout(e.finish, 1); return e; });
    const sp = createSpeaker({ callTts: async () => ({ fallback: 'unavailable' }), localTts: async () => new Uint8Array([1]), playWav, systemSay: vi.fn(), localRate: (p) => PLAYBACK_RATE[p] });
    await sp.say('Again. Properly this time.', { persona: 'carmen' });
    expect(playWav.mock.calls[0][2]).toBe(1);
    const natural = createSpeaker({ callTts: async () => ({ audio: Buffer.from('ab').toString('base64'), sampleRate: 24000 }), playWav, systemSay: vi.fn(), localRate: () => 2 });
    await natural.say('Hello.', { persona: 'matt' });
    expect(playWav.mock.calls.at(-1)[2]).toBe(1); // online voices keep their own pace
  });

  it('queued sayings wait for the one being spoken (never cut off); Stop drops the queue; spoken answers can be kept short', async () => {
    const order = [];
    const playWav = vi.fn(() => { const e = ended(); order.push('play'); setTimeout(() => { order.push('end'); e.finish(); }, 10); return e; });
    const callTts = vi.fn(async ({ text }) => ({ audio: Buffer.from(text).toString('base64'), sampleRate: 24000 }));
    const sp = createSpeaker({ callTts, playWav, systemSay: vi.fn() });
    const states = [];
    sp.subscribe((s) => states.push(s.queued));
    const a = sp.say('First one.', { queue: true });
    const b = sp.say('Second one.', { queue: true });
    expect(sp.getState().queued).toBe(2);
    await Promise.all([a, b]);
    expect(order).toEqual(['play', 'end', 'play', 'end']);
    expect(sp.getState().queued).toBe(0);
    const c = sp.say('Third one.', { queue: true });
    const d = sp.say('Fourth one.', { queue: true });
    sp.stop();
    expect(await d).toEqual({ engine: 'none', reason: 'stopped' });
    await c;
    expect(sp.getState().queued).toBe(0);
    callTts.mockClear();
    await sp.say('One short sentence here. Another long sentence that should not be spoken at all.', { max: 30 });
    expect(callTts.mock.calls.map((x) => x[0].text)).toEqual(['One short sentence here.']);
  });

  it('the wake answer can be made ready in advance: it then plays at once, with no new request', async () => {
    const callTts = vi.fn(async () => ({ audio: Buffer.from('ab').toString('base64'), sampleRate: 24000 }));
    const playWav = vi.fn(() => { const e = ended(); setTimeout(e.finish, 1); return e; });
    const sp = createSpeaker({ callTts, playWav, systemSay: vi.fn() });
    await sp.prepare('Yooooooow, Sir Ben! What can I do for you?', { persona: 'matt' });
    const made = callTts.mock.calls.length;
    expect(made).toBeGreaterThan(0);
    expect(playWav).not.toHaveBeenCalled(); // nothing is played while preparing
    expect(await sp.say('Yooooooow, Sir Ben! What can I do for you?', { persona: 'matt' })).toEqual({ engine: 'natural' });
    expect(callTts).toHaveBeenCalledTimes(made); // every sentence came from the prepared audio
    expect(playWav).toHaveBeenCalledTimes(made);
  });

  it('a long answer: the first sentence plays while the next one is being prepared', async () => {
    const order = [];
    const callTts = vi.fn(async ({ text }) => { order.push(`make:${text.slice(0, 6)}`); return { audio: Buffer.from('ab').toString('base64'), sampleRate: 24000 }; });
    const playWav = vi.fn(() => { order.push('play'); const e = ended(); setTimeout(() => { order.push('end'); e.finish(); }, 10); return e; });
    const sp = createSpeaker({ callTts, playWav, systemSay: vi.fn() });
    await sp.say('First sentence here. Second sentence is here. Third one too.');
    expect(callTts.mock.calls.map((c) => c[0].text)).toEqual(['First sentence here.', 'Second sentence is here. Third one too.']);
    expect(order).toEqual(['make:First ', 'make:Second', 'play', 'end', 'play', 'end']); // prepared while the first plays
  });

  it('Stop ends the voice at once; a new sentence replaces the one being spoken', async () => {
    const first = ended();
    const second = ended();
    const queue = [first, second];
    const sp = createSpeaker({ callTts: async ({ text }) => ({ audio: Buffer.from(text).toString('base64'), sampleRate: 24000 }), playWav: () => queue.shift(), systemSay: vi.fn() });
    const a = sp.say('First thing.');
    await new Promise((r) => setTimeout(r, 5));
    expect(sp.getState().speaking).toBe(true);
    const b = sp.say('Second thing.');
    expect(first.stop).toHaveBeenCalled();
    await new Promise((r) => setTimeout(r, 5));
    sp.stop();
    expect(second.stop).toHaveBeenCalled();
    await Promise.all([a, b]);
    expect(sp.getState().speaking).toBe(false);
  });
});
