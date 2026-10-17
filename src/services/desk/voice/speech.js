/**
 * speech.js — the persona speaks (KaTuroDesk). One speaker for the whole app: bubble
 * reminders, bubble answers and (when the teacher turns it on) chat replies.
 *
 *   natural voice: the server's deskSpeak (Gemini voices, one per persona), 5 minutes a day
 *   then, or offline: the persona's voice on this computer (Piper, open source, desktop app)
 *   last resort: Windows' own voice, tuned per persona, so it never goes silent
 *
 * A new sentence replaces the one being spoken. Listeners hear { speaking, engine } for the
 * talking animation and the Stop buttons.
 */

const MAX_SPOKEN = 420; // characters: the first sentences of a reply, not a whole document

// This computer's voice, per persona (rate/pitch only; Windows voices are few).
export const SYSTEM_TUNING = {
  matt: { rate: 1.08, pitch: 1.05, gender: 'male' },
  luna: { rate: 0.98, pitch: 1.12, gender: 'female' },
  grey: { rate: 0.97, pitch: 0.92, gender: 'male' },
  carmen: { rate: 0.88, pitch: 0.95, gender: 'female' },
};

/**
 * What to say out loud from a piece of chat or bubble text: markdown removed, sentences that
 * name folder paths skipped (they stay on screen), at most MAX_SPOKEN characters, whole sentences.
 */
export function speechText(raw, max = MAX_SPOKEN) {
  const flat = String(raw ?? '')
    .replace(/https?:\/\/\S+/g, 'the link')
    .replace(/\*\*|__|`|#+\s/g, '')
    .replace(/^\s*(?:[-•*]|\d+[.)])\s+/gm, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!flat) return '';
  const sentences = flat.split(/(?<=[.!?])\s+/);
  const kept = sentences.filter((s) => !/[\w)]\/[\w(]|[A-Za-z]:\\/.test(s));
  let out = '';
  for (const s of kept.length ? kept : sentences) {
    if (out && out.length + s.length + 1 > max) break;
    out = out ? `${out} ${s}` : s;
  }
  return out.length > max ? `${out.slice(0, max - 1).replace(/\s+\S*$/, '')}.` : out;
}

/** 16-bit mono PCM (base64) → a WAV file's bytes. */
export function pcmToWav(base64, sampleRate = 24000) {
  const bin = atob(base64);
  const n = bin.length;
  const out = new Uint8Array(44 + n);
  const v = new DataView(out.buffer);
  const str = (o, s) => { for (let i = 0; i < s.length; i += 1) out[o + i] = s.charCodeAt(i); };
  str(0, 'RIFF'); v.setUint32(4, 36 + n, true); str(8, 'WAVE');
  str(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, sampleRate, true); v.setUint32(28, sampleRate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  str(36, 'data'); v.setUint32(40, n, true);
  for (let i = 0; i < n; i += 1) out[44 + i] = bin.charCodeAt(i);
  return out;
}

/**
 * Sentences grouped for speaking: the first chunk is the first sentence alone (so the voice
 * starts as soon as possible), the rest are grouped up to `size` characters.
 */
export function speechChunks(words, size = 170) {
  const sentences = String(words || '').split(/(?<=[.!?])\s+/).filter(Boolean);
  if (!sentences.length) return [];
  const chunks = [sentences[0]];
  let cur = '';
  for (const s of sentences.slice(1)) {
    if (cur && cur.length + s.length + 1 > size) {
      chunks.push(cur);
      cur = s;
    } else cur = cur ? `${cur} ${s}` : s;
  }
  if (cur) chunks.push(cur);
  return chunks;
}

// After the natural voice fails or its daily minutes are used up, it is not asked again for a
// while: asking costs time on every reply (that made answers slow).
export const NATURAL_COOLDOWN_MS = 10 * 60 * 1000;
export const OFFLINE_COOLDOWN_MS = 2 * 60 * 1000;

/**
 * The speaker. deps (all replaceable in tests):
 *   callTts({ text, persona }) → server answer, or throws (offline)      natural voice
 *   localTts(text, persona) → WAV bytes, or null when not ready          voice on this computer (Piper)
 *   playWav(bytes, volume) → { done: Promise, stop() }
 *   systemSay(text, tuning, volume) → { done: Promise, stop() }           last resort (Windows)
 *   now() → ms
 */
export function createSpeaker({ callTts, localTts = null, playWav, systemSay, now = Date.now }) {
  const listeners = new Set();
  const cache = new Map(); // persona|text → { engine, wav } (repeated reminders cost nothing)
  let current = null; // { stop }
  let token = 0;
  let state = { speaking: false, engine: null };
  let usage = null; // { usedSeconds, limitSeconds } from the last natural-voice answer
  let naturalOffUntil = 0;

  const emit = (patch) => {
    state = { ...state, ...patch };
    for (const l of listeners) l(state);
  };

  function stop() {
    token += 1;
    current?.stop();
    current = null;
    if (state.speaking) emit({ speaking: false, engine: null });
  }

  /** One chunk's audio: natural voice, then this computer's voice; null wav = Windows voice. */
  async function synth(chunk, persona, natural) {
    const key = `${persona}|${chunk}`;
    const hit = cache.get(key);
    if (hit && (hit.engine === 'natural' || !natural || now() < naturalOffUntil)) return { ...hit, reason: '' };
    let reason = natural ? '' : 'off';
    if (natural && now() < naturalOffUntil) reason = 'resting';
    else if (natural) {
      try {
        const res = await callTts({ text: chunk, persona });
        if (res?.usedSeconds !== undefined) usage = { usedSeconds: res.usedSeconds, limitSeconds: res.limitSeconds, ...(res.provider ? { provider: res.provider } : {}) };
        if (res?.audio) {
          const out = { engine: 'natural', wav: pcmToWav(res.audio, res.sampleRate) };
          remember(key, out);
          return { ...out, reason: '' };
        }
        reason = res?.fallback || 'unavailable';
        naturalOffUntil = now() + NATURAL_COOLDOWN_MS;
      } catch {
        reason = 'offline';
        naturalOffUntil = now() + OFFLINE_COOLDOWN_MS;
      }
    }
    if (localTts) {
      try {
        const wav = await localTts(chunk, persona);
        if (wav) {
          const out = { engine: 'local', wav };
          remember(key, out);
          return { ...out, reason };
        }
      } catch {
        // the voice on this computer is not ready: the Windows voice speaks this time
      }
    }
    return { engine: 'system', wav: null, reason };
  }

  function remember(key, out) {
    cache.set(key, out);
    if (cache.size > 40) cache.delete(cache.keys().next().value);
  }

  /**
   * Says `text`. options: { persona, natural (default true), volume (0..1) }
   * The first sentence plays as soon as it is ready; the next is prepared while it plays.
   * → { engine: 'natural' | 'local' | 'system' | 'none', reason? }   (the first sentence's)
   */
  async function say(text, { persona = 'matt', natural = true, volume = 0.9 } = {}) {
    const words = speechText(text);
    stop();
    const chunks = speechChunks(words);
    if (!chunks.length) return { engine: 'none' };
    const mine = ++token;
    const vol = Math.max(0, Math.min(1, Number(volume) || 0));
    let first = null;
    let next = synth(chunks[0], persona, natural);
    for (let i = 0; i < chunks.length; i += 1) {
      const res = await next;
      if (mine !== token) return { engine: 'none', reason: 'replaced' };
      if (i + 1 < chunks.length) next = synth(chunks[i + 1], persona, natural);
      first = first || res;
      current = res.wav ? playWav(res.wav, vol) : systemSay(chunks[i], SYSTEM_TUNING[persona] || SYSTEM_TUNING.matt, vol);
      emit({ speaking: true, engine: res.engine });
      await current.done.catch(() => {});
      if (mine !== token) return { engine: first.engine, reason: first.reason || undefined };
    }
    emit({ speaking: false, engine: null });
    return first.reason ? { engine: first.engine, reason: first.reason } : { engine: first.engine };
  }

  return {
    say,
    stop,
    subscribe(fn) { listeners.add(fn); fn(state); return () => listeners.delete(fn); },
    getState: () => state,
    getUsage: () => usage,
    /** After the teacher picks another voice: forget sentences made with the old one. */
    forgetCache: () => cache.clear(),
  };
}

// ── The app's speaker (browser / KaTuroDesk window) ──────────────────────────
export function browserPlayWav(bytes, volume) {
  const url = URL.createObjectURL(new Blob([bytes], { type: 'audio/wav' }));
  const audio = new Audio(url);
  audio.volume = volume;
  const done = new Promise((resolve, reject) => {
    audio.onended = resolve;
    audio.onerror = () => reject(new Error('audio'));
    audio.play().catch(reject);
  }).finally(() => URL.revokeObjectURL(url));
  return { done, stop: () => { audio.pause(); audio.dispatchEvent(new Event('ended')); } };
}

export function browserSystemSay(text, tuning, volume) {
  const synth = typeof window !== 'undefined' ? window.speechSynthesis : null;
  if (!synth) return { done: Promise.resolve(), stop() {} };
  synth.cancel();
  const u = new SpeechSynthesisUtterance(text);
  const voices = synth.getVoices().filter((v) => /^en(-|_)/i.test(v.lang));
  const female = /zira|hazel|susan|aria|jenny|eva|female|catherine|libby|sonia/i;
  const male = /david|mark|george|guy|male|ryan|james/i;
  u.voice = voices.find((v) => (tuning.gender === 'female' ? female : male).test(v.name)) || voices[0] || null;
  u.rate = tuning.rate;
  u.pitch = tuning.pitch;
  u.volume = volume;
  const done = new Promise((resolve) => { u.onend = resolve; u.onerror = resolve; synth.speak(u); });
  return { done, stop: () => synth.cancel() };
}

async function serverTts(payload) {
  const [{ getFunctions, httpsCallable }, { default: app }] = await Promise.all([import('firebase/functions'), import('../../../firebase')]);
  const res = await httpsCallable(getFunctions(app, 'asia-southeast1'), 'deskSpeak', { timeout: 60000 })(payload);
  return res.data;
}

let appSpeaker = null;
export function deskSpeaker() {
  if (!appSpeaker) {
    appSpeaker = createSpeaker({
      callTts: serverTts,
      // The voice on this computer (Piper, desktop app): never waits for a first download.
      localTts: async (text, persona) => {
        const { piperSpeak } = await import('./piperVoice.js');
        return piperSpeak(text, persona);
      },
      playWav: browserPlayWav,
      systemSay: browserSystemSay,
    });
  }
  return appSpeaker;
}
