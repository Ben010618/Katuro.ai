/**
 * speech.js — the persona speaks (KaTuroDesk). One speaker for the whole app: bubble
 * reminders, bubble answers and (when the teacher turns it on) chat replies.
 *
 *   natural voice: the server's deskSpeak (Gemini voices, one per persona), 5 minutes a day
 *   then, or offline: this computer's voice (Windows), tuned per persona, so it never goes silent
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
 * The speaker. deps (all replaceable in tests):
 *   callTts({ text, persona }) → server answer, or throws (offline)
 *   playWav(bytes, volume) → { done: Promise, stop() }
 *   systemSay(text, tuning, volume) → { done: Promise, stop() }
 */
export function createSpeaker({ callTts, playWav, systemSay }) {
  const listeners = new Set();
  const cache = new Map(); // persona|text → wav bytes (repeated reminders cost nothing)
  let current = null; // { stop }
  let token = 0;
  let state = { speaking: false, engine: null };
  let usage = null; // { usedSeconds, limitSeconds } from the last natural-voice answer

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

  /**
   * Says `text`. options: { persona, natural (default true), volume (0..1) }
   * → { engine: 'natural' | 'system' | 'none', reason? }
   */
  async function say(text, { persona = 'matt', natural = true, volume = 0.9 } = {}) {
    const words = speechText(text);
    stop();
    if (!words) return { engine: 'none' };
    const mine = ++token;
    const vol = Math.max(0, Math.min(1, Number(volume) || 0));
    let reason = natural ? '' : 'off';
    if (natural) {
      const key = `${persona}|${words}`;
      try {
        let wav = cache.get(key);
        if (!wav) {
          const res = await callTts({ text: words, persona });
          if (mine !== token) return { engine: 'none', reason: 'replaced' };
          if (res?.usedSeconds !== undefined) usage = { usedSeconds: res.usedSeconds, limitSeconds: res.limitSeconds };
          if (res?.audio) {
            wav = pcmToWav(res.audio, res.sampleRate);
            cache.set(key, wav);
            if (cache.size > 24) cache.delete(cache.keys().next().value);
          } else reason = res?.fallback || 'unavailable';
        }
        if (wav) {
          current = playWav(wav, vol);
          emit({ speaking: true, engine: 'natural' });
          await current.done.catch(() => {});
          if (mine === token) emit({ speaking: false, engine: null });
          return { engine: 'natural' };
        }
      } catch {
        if (mine !== token) return { engine: 'none', reason: 'replaced' };
        reason = 'offline';
      }
    }
    current = systemSay(words, SYSTEM_TUNING[persona] || SYSTEM_TUNING.matt, vol);
    emit({ speaking: true, engine: 'system' });
    await current.done.catch(() => {});
    if (mine === token) emit({ speaking: false, engine: null });
    return { engine: 'system', reason };
  }

  return {
    say,
    stop,
    subscribe(fn) { listeners.add(fn); fn(state); return () => listeners.delete(fn); },
    getState: () => state,
    getUsage: () => usage,
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
  if (!appSpeaker) appSpeaker = createSpeaker({ callTts: serverTts, playWav: browserPlayWav, systemSay: browserSystemSay });
  return appSpeaker;
}
