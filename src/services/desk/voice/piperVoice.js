/**
 * piperVoice.js — the persona's voice on this computer (KaTuroDesk desktop app).
 *
 * Piper (open source, MIT: github.com/rhasspy/piper, browser build
 * github.com/Mintplex-Labs/piper-tts-web) speaks with natural-sounding neural voices on the
 * laptop: no internet, no cost, no daily limit, and a sentence is ready in about a second.
 * Used when the online voice is not available (offline, its 5 minutes are used up, or no
 * service answers). Each chosen voice (about 60 MB) downloads once in the background and is
 * kept on this computer; until then the Windows voice speaks.
 * The engine files ship with the desktop app (dist/desk-voice, see vite.config.js).
 */

/**
 * Voices a teacher can choose (Settings > Assistant > Voice). Only "medium" voices: the "high"
 * ones sound a little better but take twice as long as the speech itself on a normal laptop
 * (measured: 7.8 s for a 3.5 s sentence), so the persona would pause mid-reply.
 */
export const PIPER_CHOICES = [
  { id: 'en_US-hfc_female-medium', label: 'Hannah (woman, US)', gender: 'female' },
  { id: 'en_US-lessac-medium', label: 'Lessac (woman, US)', gender: 'female' },
  { id: 'en_US-amy-medium', label: 'Amy (woman, US)', gender: 'female' },
  { id: 'en_US-kristin-medium', label: 'Kristin (woman, US)', gender: 'female' },
  { id: 'en_US-ljspeech-medium', label: 'Linda (woman, US)', gender: 'female' },
  { id: 'en_GB-cori-medium', label: 'Cori (woman, UK)', gender: 'female' },
  { id: 'en_GB-jenny_dioco-medium', label: 'Jenny (woman, UK)', gender: 'female' },
  { id: 'en_US-ryan-medium', label: 'Ryan (man, US)', gender: 'male' },
  { id: 'en_US-joe-medium', label: 'Joe (man, US)', gender: 'male' },
  { id: 'en_US-john-medium', label: 'John (man, US)', gender: 'male' },
  { id: 'en_US-bryce-medium', label: 'Bryce (man, US)', gender: 'male' },
  { id: 'en_US-norman-medium', label: 'Norman (man, US)', gender: 'male' },
  { id: 'en_US-hfc_male-medium', label: 'Harry (man, US)', gender: 'male' },
  { id: 'en_GB-alan-medium', label: 'Alan (man, UK)', gender: 'male' },
];

export const PIPER_VOICES = {
  matt: 'en_US-ryan-medium',
  luna: 'en_US-hfc_female-medium',
  grey: 'en_US-joe-medium',
  carmen: 'en_US-kristin-medium',
};

const isDesktop = () => typeof window !== 'undefined' && Boolean(window.katuroDeskApi?.isElectron);
const sessions = new Map(); // voiceId → Promise<TtsSession>
const preparing = new Map(); // voiceId → Promise<boolean>
let chosen = {}; // persona → voiceId (the teacher's choices)
let lib = null;

const load = () => {
  if (!lib) lib = import('@mintplex-labs/piper-tts-web');
  return lib;
};

/** The teacher's voice choices (from Settings); unknown voices are ignored. */
export function setVoiceChoices(map = {}) {
  chosen = Object.fromEntries(Object.entries(map || {}).filter(([, id]) => PIPER_CHOICES.some((c) => c.id === id)));
}

/** The voice this persona uses on this computer. */
export const voiceOf = (persona) => chosen[persona] || PIPER_VOICES[persona] || PIPER_VOICES.matt;

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

/** Settings "Preview": a voice says a sample (waits for its first download). → WAV bytes */
export async function previewVoice(voiceId, text) {
  const s = await session(voiceId);
  const blob = await s.predict(String(text));
  return new Uint8Array(await blob.arrayBuffer());
}
