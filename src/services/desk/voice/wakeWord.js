/**
 * wakeWord.js — "Hello Matt": the persona answers when the teacher says the wake phrase.
 *
 * Listening runs entirely on this computer with Vosk (open source, github.com/alphacep/vosk-api,
 * browser build github.com/ccoreilly/vosk-browser) and its small English model. The recognizer
 * may only choose between the wake phrases, a few look-alike phrases common in class
 * ("hello ma'am", "hello class") and "something else", so ordinary talk is not mistaken for
 * the wake phrase, and nothing is recorded or sent anywhere until it is said.
 */

// Phrases teachers and learners say all day that sound like a wake phrase. They are given to
// the recognizer so it can tell them apart ("hello ma'am" was heard as "hello matt" without them).
export const LOOKALIKES = ['hello mam', 'hello madam', 'hello sir', 'hello class', 'hello everyone', 'hello mama', 'hello po', 'good morning mam', 'hey man', 'hello there'];

export const MAX_PHRASES = 6;

/** A phrase as the recognizer wants it: lower case, letters and spaces, 2 to 4 words. */
export function normalizePhrase(raw) {
  const p = String(raw ?? '').toLowerCase().replace(/[’']/g, '').replace(/[^a-z ]+/g, ' ').replace(/\s+/g, ' ').trim();
  const n = p ? p.split(' ').length : 0;
  return n >= 2 && n <= 4 ? p : '';
}

/** The persona's own wake phrases: "hello matt", "hey matt" (Lola Carmen: "hello carmen", "hello lola carmen"). */
export function defaultPhrases(personaName) {
  const words = normalizePhrase(`x ${personaName}`).split(' ').slice(1);
  const last = words[words.length - 1];
  if (!last) return [];
  const out = [`hello ${last}`, `hey ${last}`];
  if (words.length > 1) out.push(`hello ${words.join(' ')}`);
  return [...new Set(out.map(normalizePhrase).filter(Boolean))];
}

/** All phrases to listen for: the persona's own, then the teacher's (no duplicates, no look-alikes). */
export function wakePhrases(personaName, custom = []) {
  const all = [...defaultPhrases(personaName), ...custom.map(normalizePhrase)];
  return [...new Set(all.filter((p) => p && !LOOKALIKES.includes(p)))].slice(0, MAX_PHRASES);
}

/** The recognizer's grammar: wake phrases, look-alikes, and "[unk]" for everything else. */
export const grammarFor = (phrases) => JSON.stringify([...phrases, ...LOOKALIKES, '[unk]']);

/**
 * Which wake phrase the recognized text holds (as whole words, in order), or null.
 * minConf: every word of the phrase must be at least this sure (Vosk word confidences).
 */
export function matchWake(result, phrases, minConf = 0.6) {
  const words = Array.isArray(result?.result) ? result.result : null;
  const text = String(result?.text ?? result?.partial ?? '').trim();
  if (!text) return null;
  const said = text.split(/\s+/);
  for (const phrase of phrases) {
    const want = phrase.split(' ');
    for (let i = 0; i + want.length <= said.length; i += 1) {
      if (!want.every((w, j) => said[i + j] === w)) continue;
      if (words && !want.every((w, j) => (words[i + j]?.word === w ? words[i + j].conf >= minConf : true))) continue;
      return phrase;
    }
  }
  return null;
}

/**
 * Fast wake: Vosk confirms a phrase only after about 3 s of quiet, too slow for "Hello Matt".
 * Its running guess is used instead, once the speaking has stopped and the guess has not
 * changed for a moment (then it is the same as the final answer would be, and a half-heard
 * "hello ma..." has had time to become "hello mam").
 *   s: { partial, changedAt, quietSince } (ms)   → the wake phrase, or null
 */
export const STABLE_MS = 450;
export function stableWake(s, phrases, now) {
  if (!s?.partial || !s.quietSince) return null;
  if (now - s.changedAt < STABLE_MS || now - s.quietSince < STABLE_MS) return null;
  const words = s.partial.split(/\s+/).filter((w) => w !== '[unk]');
  // The phrase must be the last thing said (not something said before other words).
  const tail = words.join(' ');
  return phrases.find((p) => tail === p || tail.endsWith(` ${p}`)) || null;
}

// How each persona answers its name (short, so the teacher can talk right after).
const ACKS = {
  matt: ['Yes, {t}? What can I do for you?', "Hi {t}! I'm listening."],
  luna: ['Yes, {t}? How may I help?', "I'm here, {t}. Go ahead."],
  grey: ['Listening, {t}.', 'Yes, {t}? Go ahead.'],
  carmen: ['Yes, anak? What do you need?', "I'm here, {t}. Tell me."],
};

/** The acknowledgement after the wake phrase. pick: 0..1 (random by default). */
export function ackFor(personaId, teacher = 'Teacher', pick = Math.random()) {
  const list = ACKS[personaId] || ACKS.matt;
  return list[Math.min(list.length - 1, Math.floor(pick * list.length))].replace('{t}', teacher || 'Teacher');
}

// ── The listener (KaTuroDesk window) ──────────────────────────────────────────

/**
 * Listens for the wake phrases until stop(). The microphone stays on this computer; only the
 * recognizer sees it. onWake(phrase) is called once per wake; pause()/resume() mute it while
 * the persona talks or the teacher is already talking to it.
 *   loadModel() → a vosk-browser Model (cached by the caller)
 */
export async function startWakeListener({ loadModel, phrases, onWake, onError }) {
  if (!phrases.length) throw new Error('No wake phrase to listen for.');
  const model = await loadModel();
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
  const ctx = new AudioContext();
  const source = ctx.createMediaStreamSource(stream);
  const processor = ctx.createScriptProcessor(4096, 1, 1);
  let recognizer = null;
  let paused = false;
  let stopped = false;
  const live = { partial: '', changedAt: 0, quietSince: 0 };

  const wake = (hit) => {
    paused = true;
    fresh(); // forget what was heard, so the same words never trigger twice
    Promise.resolve(onWake(hit)).catch((err) => onError?.(err));
  };
  const fresh = () => {
    recognizer?.remove();
    Object.assign(live, { partial: '', changedAt: 0, quietSince: 0 });
    recognizer = new model.KaldiRecognizer(ctx.sampleRate, grammarFor(phrases));
    recognizer.setWords(true);
    recognizer.on('result', (m) => {
      live.partial = '';
      if (paused || stopped) return;
      const hit = matchWake(m.result, phrases);
      if (hit) wake(hit);
    });
    recognizer.on('partialresult', (m) => {
      const p = String(m.result?.partial || '');
      if (p !== live.partial) Object.assign(live, { partial: p, changedAt: performance.now() });
    });
  };
  fresh();
  processor.onaudioprocess = (e) => {
    if (paused || stopped) return;
    const data = e.inputBuffer.getChannelData(0);
    let sum = 0;
    for (let i = 0; i < data.length; i += 4) sum += data[i] * data[i];
    const loud = Math.sqrt(sum / (data.length / 4)) * 4 >= 0.07;
    const now = performance.now();
    if (loud) live.quietSince = 0;
    else if (!live.quietSince) live.quietSince = now;
    try {
      recognizer.acceptWaveformFloat(new Float32Array(data), ctx.sampleRate);
    } catch (err) {
      onError?.(err);
      return;
    }
    const hit = stableWake(live, phrases, now);
    if (hit) wake(hit);
  };
  source.connect(processor);
  processor.connect(ctx.destination);

  return {
    pause() { paused = true; },
    resume() {
      if (stopped) return;
      fresh();
      paused = false;
    },
    stop() {
      stopped = true;
      processor.onaudioprocess = null;
      try { source.disconnect(); processor.disconnect(); } catch { /* already disconnected */ }
      stream.getTracks().forEach((t) => t.stop());
      ctx.close().catch(() => {});
      recognizer?.remove();
    },
  };
}
