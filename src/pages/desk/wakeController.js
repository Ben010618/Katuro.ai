/**
 * wakeController.js — "Hello Matt" in KaTuroDesk. When the teacher turns the wake phrase on
 * (Settings > Assistant > Voice), the window listens on this computer for the persona's wake
 * phrases. Hearing one: the persona answers ("Yes, Teacher Ana?"), then listens hands-free
 * (talk.js auto mode) and answers like the Talk button. Then it waits for the phrase again.
 * The speech model (Vosk, ~41 MB) is downloaded the first time and kept on this computer.
 */
import { useDeskStore } from '../../store/deskStore';
import { getPersona } from '../../services/desk/personas';
import { getTeacherSalutationName } from '../../services/teacherProfileUtils';
import { startWakeListener, wakePhrases, ackFor } from '../../services/desk/voice/wakeWord';
import { deskSpeaker } from '../../services/desk/voice/speech';
import { deskTalk, subscribeTalk, getTalkContext } from './talkController';

const api = () => (typeof window !== 'undefined' ? window.katuroDeskApi : undefined);
export const wakeSupported = () => Boolean(api()?.getWakeModel);

let modelPromise = null;
let listener = null;
let listeningFor = '';
let starting = null;
let state = { status: 'off', progress: 0, error: '', phrases: [] };
const listeners = new Set();
const emit = (patch) => {
  state = { ...state, ...patch };
  listeners.forEach((fn) => fn(state));
};

/** The speech model, loaded once per session (downloaded once per computer). */
function loadModel() {
  if (!modelPromise) {
    modelPromise = (async () => {
      emit({ status: 'loading', progress: 0, error: '' });
      const off = api().onWakeProgress?.((p) => emit({ progress: Math.round((p.received / p.total) * 100) }));
      try {
        const bytes = await api().getWakeModel();
        const { createModel } = await import('vosk-browser');
        const url = URL.createObjectURL(new Blob([bytes], { type: 'application/gzip' }));
        return await createModel(url, -1);
      } finally {
        off?.();
      }
    })().catch((err) => {
      modelPromise = null;
      throw err;
    });
  }
  return modelPromise;
}

const settings = () => useDeskStore.getState().speechSettings || {};
const phrasesNow = () => {
  const s = useDeskStore.getState();
  return wakePhrases(getPersona(s.persona).name, settings().wakeCustom || []);
};

/** Waits until the conversation (listening, thinking, speaking) is over. */
function conversationOver() {
  return new Promise((resolve) => {
    let offTalk = () => {};
    let offSpeech = () => {};
    const quiet = () => deskTalk().getState().phase === 'idle' && !deskSpeaker().getState().speaking && !deskSpeaker().getState().queued;
    let done = false;
    const check = () => {
      if (done || !quiet()) return;
      // Checked again a moment later: the next queued sentence may be about to start.
      setTimeout(() => {
        if (done || !quiet()) return;
        done = true;
        offTalk();
        offSpeech();
        resolve();
      }, 250);
    };
    offTalk = subscribeTalk(check);
    offSpeech = deskSpeaker().subscribe(check);
  });
}

// The answer to the next wake, made ready in advance in the persona's voice so it plays at once.
let nextAck = null; // { persona, name, natural, text }
const ackSpec = () => {
  const s = useDeskStore.getState();
  const { user, profile } = getTalkContext();
  return { persona: s.persona, name: getTeacherSalutationName(profile, user), natural: settings().natural !== false };
};
function readyNextAck() {
  const spec = ackSpec();
  nextAck = { ...spec, text: ackFor(spec.persona, spec.name) };
  deskSpeaker().prepare?.(nextAck.text, { persona: spec.persona, natural: spec.natural }).catch(() => {});
}

async function onWake() {
  if (deskTalk().getState().phase !== 'idle' || deskSpeaker().getState().speaking) {
    listener?.resume();
    return;
  }
  const spec = ackSpec();
  const ready = nextAck && nextAck.persona === spec.persona && nextAck.name === spec.name && nextAck.natural === spec.natural;
  const line = ready ? nextAck.text : ackFor(spec.persona, spec.name);
  // The persona answers its name, then listens without a button.
  await deskSpeaker().say(line, { persona: spec.persona, natural: spec.natural, volume: settings().volume ?? 0.9 });
  await deskTalk().begin({ auto: true });
  await conversationOver();
  readyNextAck();
  listener?.resume();
}

async function stopListening() {
  const l = listener;
  listener = null;
  listeningFor = '';
  l?.stop();
}

/** Starts, restarts (other phrases) or stops listening to match the settings. */
export async function syncWake() {
  if (!wakeSupported()) return;
  if (starting) await starting.catch(() => {});
  const want = settings().wake === true;
  const phrases = phrasesNow();
  const key = phrases.join('|');
  if (!want || !phrases.length) {
    await stopListening();
    emit({ status: 'off', phrases, error: '' });
    return;
  }
  if (listener && listeningFor === key) return;
  await stopListening();
  starting = (async () => {
    try {
      listener = await startWakeListener({ loadModel, phrases, onWake, onError: (err) => emit({ error: err?.message || String(err) }) });
      listeningFor = key;
      emit({ status: 'listening', phrases, error: '' });
      readyNextAck();
    } catch (err) {
      listener = null;
      const msg = /Permission|NotAllowed|NotFound|device/i.test(`${err?.name} ${err?.message}`)
        ? 'The microphone could not be used. Check that one is connected and allowed for KaTuroDesk.'
        : err?.message || 'The wake phrase could not be started.';
      emit({ status: 'error', error: msg, phrases });
    }
  })();
  await starting;
  starting = null;
}

/** Keeps listening in step with the settings; returns stop(). Desktop app only. */
export function startWakeController() {
  if (!wakeSupported()) return () => {};
  let last = '';
  const check = () => {
    const s = useDeskStore.getState();
    const key = JSON.stringify([settings().wake, settings().wakeCustom, s.persona]);
    if (key === last) return;
    last = key;
    syncWake();
  };
  const unsub = useDeskStore.subscribe(check);
  check();
  return () => {
    unsub();
    stopListening();
  };
}

/**
 * "Test it": listens up to `ms` for one phrase only and says whether it was recognized.
 * The wake listener (if any) is paused meanwhile. → true | false
 */
export async function testWakePhrase(phrase, ms = 6000) {
  listener?.pause();
  let tester = null;
  try {
    let hit = () => {};
    const heard = new Promise((resolve) => { hit = resolve; });
    // The time to say it starts once listening has started (not while the model loads).
    tester = await startWakeListener({ loadModel, phrases: [phrase], onWake: () => hit(true) });
    if (state.status === 'loading') emit({ status: listener ? 'listening' : 'off' });
    return await Promise.race([heard, new Promise((r) => setTimeout(() => r(false), ms))]);
  } finally {
    tester?.stop();
    listener?.resume();
    if (state.status === 'loading') emit({ status: listener ? 'listening' : 'off' });
  }
}

export function subscribeWake(fn) {
  listeners.add(fn);
  fn(state);
  return () => listeners.delete(fn);
}
