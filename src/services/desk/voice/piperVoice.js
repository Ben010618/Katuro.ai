/**
 * piperVoice.js — the persona's voice on this computer (KaTuroDesk desktop app).
 *
 * Piper (open source, MIT: github.com/rhasspy/piper, browser build
 * github.com/Mintplex-Labs/piper-tts-web) speaks with natural-sounding neural voices on the
 * laptop: no internet, no cost, no daily limit, and a sentence is ready in about a second.
 * Used when the online voice is not available (offline, its 5 minutes are used up, or no
 * service answers). Each persona's voice (about 60 MB) downloads once in the background and is
 * kept on this computer; until then the Windows voice speaks.
 * The engine files ship with the desktop app (dist/desk-voice, see vite.config.js).
 */

/**
 * Each persona's voice on this computer is FIXED (it never changes, so the persona always
 * sounds like itself). Chosen by measuring all medium English voices with the same sentence
 * (2026-10-17): pitch, liveliness and speed.
 *   Matt   Ryan    148 Hz, the brightest and fastest man's voice: jolly, energetic
 *   Grey   Alan     93 Hz, the deepest, deliberate British voice: serious, smart
 *   Luna   Hannah  220 Hz, the brightest and warmest woman's voice: sweet, polite
 *   Carmen Kristin 159 Hz, the lowest and flattest woman's voice: strict, stern
 * ("high" voices left out: measured twice as slow as the speech itself.)
 */
export const PIPER_VOICES = {
  matt: 'en_US-ryan-medium',
  grey: 'en_GB-alan-medium',
  luna: 'en_US-hfc_female-medium',
  carmen: 'en_US-kristin-medium',
};

// Played at the voice's own speed: changing it also shifts the pitch and sounds less natural.
export const PLAYBACK_RATE = { matt: 1, grey: 1, luna: 1, carmen: 1 };

const isDesktop = () => typeof window !== 'undefined' && Boolean(window.katuroDeskApi?.isElectron);
const sessions = new Map(); // voiceId → Promise<TtsSession>
const preparing = new Map(); // voiceId → Promise<boolean>
let lib = null;

const load = () => {
  if (!lib) lib = import('@mintplex-labs/piper-tts-web');
  return lib;
};

/** The voice this persona uses on this computer. */
export const voiceOf = (persona) => PIPER_VOICES[persona] || PIPER_VOICES.matt;

function wasmPaths() {
  const base = new URL('./desk-voice/', document.baseURI).href;
  return { onnxWasm: base, piperData: `${base}piper_phonemize.data`, piperWasm: `${base}piper_phonemize.wasm` };
}

async function isStored(voiceId) {
  const { stored } = await load();
  return (await stored()).includes(voiceId);
}

function session(voiceId) {
  if (!sessions.has(voiceId)) {
    sessions.set(voiceId, (async () => {
      const { TtsSession } = await load();
      // Loading a voice downloads it the first time; Piper keeps it on this computer.
      const s = new TtsSession({ voiceId, wasmPaths: wasmPaths() });
      await s.init();
      return s;
    })().catch((err) => {
      sessions.delete(voiceId);
      throw err;
    }));
  }
  return sessions.get(voiceId);
}

/** Gets a voice ready in the background (downloads it once, then loads it). Never throws. */
export function prepareVoiceId(voiceId) {
  if (!isDesktop() || !voiceId) return Promise.resolve(false);
  if (!preparing.has(voiceId)) {
    preparing.set(voiceId, session(voiceId).then(() => true).catch(() => {
      preparing.delete(voiceId);
      return false;
    }));
  }
  return preparing.get(voiceId);
}

/** Gets the persona's voice ready in the background. Never throws. */
export const prepareVoice = (persona) => prepareVoiceId(voiceOf(persona));

/**
 * The sentence as WAV bytes in the persona's voice, or null when the voice is not on this
 * computer yet (getting it ready is started; the Windows voice speaks this time).
 */
export async function piperSpeak(text, persona) {
  if (!isDesktop()) return null;
  const voiceId = voiceOf(persona);
  if (!sessions.has(voiceId) && !(await isStored(voiceId))) {
    prepareVoiceId(voiceId);
    return null;
  }
  const s = await session(voiceId);
  const blob = await s.predict(String(text));
  return new Uint8Array(await blob.arrayBuffer());
}

/** A voice says a sample, waiting for its first download (QA and tests). → WAV bytes */
export async function previewVoice(voiceId, text) {
  const s = await session(voiceId);
  const blob = await s.predict(String(text));
  return new Uint8Array(await blob.arrayBuffer());
}
