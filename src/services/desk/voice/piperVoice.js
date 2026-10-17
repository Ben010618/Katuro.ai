/**
 * piperVoice.js — the persona's voice on this computer (KaTuroDesk desktop app).
 *
 * Piper (open source, MIT: github.com/rhasspy/piper, browser build
 * github.com/Mintplex-Labs/piper-tts-web) speaks with natural-sounding neural voices on the
 * laptop: no internet, no cost, no daily limit, and a sentence is ready in about a second.
 * Used when Google's natural voice is not available (offline, its 5 minutes are used up, or
 * the service refuses). Each persona's voice (~60 MB) downloads once in the background and is
 * kept on this computer; until then the Windows voice speaks.
 * The engine files ship with the desktop app (dist/desk-voice, see vite.config.js).
 */

export const PIPER_VOICES = {
  matt: 'en_US-ryan-medium',
  luna: 'en_US-hfc_female-medium',
  grey: 'en_US-joe-medium',
  carmen: 'en_US-kristin-medium',
};

const isDesktop = () => typeof window !== 'undefined' && Boolean(window.katuroDeskApi?.isElectron);
const sessions = new Map(); // voiceId → Promise<TtsSession>
const downloading = new Map(); // voiceId → Promise
let lib = null;

const load = () => {
  if (!lib) lib = import('@mintplex-labs/piper-tts-web');
  return lib;
};

function wasmPaths() {
  const base = new URL('./desk-voice/', document.baseURI).href;
  return { onnxWasm: base, piperData: `${base}piper_phonemize.data`, piperWasm: `${base}piper_phonemize.wasm` };
}

/** True when this persona's voice is saved on this computer. */
async function isStored(voiceId) {
  const { stored } = await load();
  return (await stored()).includes(voiceId);
}

/** Downloads the persona's voice in the background (once); never throws. */
export function prepareVoice(persona) {
  const voiceId = PIPER_VOICES[persona];
  if (!isDesktop() || !voiceId) return Promise.resolve(false);
  if (!downloading.has(voiceId)) {
    downloading.set(voiceId, (async () => {
      try {
        // Loading the voice downloads it the first time (Piper keeps it on this computer),
        // so the first sentence is quick later.
        await session(voiceId);
        return true;
      } catch {
        downloading.delete(voiceId);
        return false;
      }
    })());
  }
  return downloading.get(voiceId);
}

function session(voiceId) {
  if (!sessions.has(voiceId)) {
    sessions.set(voiceId, (async () => {
      const { TtsSession } = await load();
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

/**
 * The sentence as WAV bytes in the persona's voice, or null when the voice is not on this
 * computer yet (its download is started; the Windows voice speaks this time).
 */
export async function piperSpeak(text, persona) {
  const voiceId = PIPER_VOICES[persona] || PIPER_VOICES.matt;
  if (!isDesktop()) return null;
  if (!sessions.has(voiceId) && !(await isStored(voiceId))) {
    prepareVoice(persona);
    return null;
  }
  const s = await session(voiceId);
  const blob = await s.predict(String(text));
  return new Uint8Array(await blob.arrayBuffer());
}
