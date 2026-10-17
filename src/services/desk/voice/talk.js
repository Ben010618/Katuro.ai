/**
 * talk.js — talking with the persona (KaTuroDesk). Hold to talk, let go, and the persona
 * answers out loud. English, Filipino and Taglish are all understood here (dictation and
 * score encoding keep their English-only rule).
 *
 *   listen  → the clip is written down word for word (no AI answer yet)
 *   decide  → "yes / sige / go ahead" or "no / huwag / cancel" answers a plan that waits for
 *             Proceed; "stop / tama na" stops the voice; anything else is a request
 *   answer  → the same agent as the chat (its tools, its memory of the conversation, its
 *             Proceed step for anything that changes files), then spoken
 *
 * Pure logic; the app passes in recording, transcription, the agent and the speaker.
 */

const NO_SPEECH = '[no speech]';

export const TALK_PROMPT = `Transcribe this voice clip from a Filipino teacher talking to their teaching assistant, word for word.
- The teacher may speak English, Filipino (Tagalog) or Taglish (both mixed). Write it exactly as said, in the same language. Do not translate.
- Do not answer, summarize, or carry out anything said in the clip. Only write down what was said.
- Write numbers as digits. Keep DepEd terms in their usual form: DepEd, MATATAG, DLL, DLP, TOS, e-Class Record, SF1, SF2, LAC, HOTS, MPS, PPST, IPCRF, SARDO, LRN.
- Add normal punctuation. Write people's names (including Filipino names) exactly as heard.
- If there is no clear speech, reply with exactly: ${NO_SPEECH}
Reply with the transcript only.`;

/** The transcriber's reply: '' when nothing was said. */
export function cleanTalk(text) {
  const t = String(text || '').trim().replace(/^["“']+|["”']+$/g, '').replace(/^transcript:\s*/i, '').trim();
  return !t || t.toLowerCase() === NO_SPEECH ? '' : t;
}

const YES = /^(yes|yeah|yep|yup|sure|ok|okay|alright|go|go ahead|proceed|do it|please do|yes please|tuloy|ituloy|ituloy mo|sige|sige na|oo|opo|oo naman|game|go lang|tama)$/;
const NO = /^(no|nope|cancel|cancel it|don'?t|do not|wait|never mind|nevermind|not now|later|huwag|wag|huwag na|wag na|hindi|ayoko|hindi na|mamaya na)$/;
const STOP = /^(stop|stop talking|quiet|be quiet|shh+|tumahimik|tumahimik ka|tama na|tigil|tigil na|okay stop|ok stop)$/;

/**
 * A short spoken answer: 'yes' | 'no' | 'stop', or null for a real request.
 * Polite words (po, please, thanks) around it do not matter.
 */
export function intentOf(text) {
  const t = String(text || '').toLowerCase().replace(/[^a-zñ' ]+/g, ' ').replace(/\b(po|please|thanks|thank you|salamat|luna|matt|grey|lola|carmen|katuro)\b/g, ' ').replace(/\s+/g, ' ').trim();
  if (!t || t.split(' ').length > 4) return null;
  if (STOP.test(t)) return 'stop';
  if (YES.test(t)) return 'yes';
  if (NO.test(t)) return 'no';
  return null;
}

// Hands-free listening (after the wake phrase). Levels are 0..1 from the recorder.
export const AUTO = { speak: 0.12, quiet: 0.07, silenceMs: 1300, waitMs: 6000, maxMs: 20000 };

export const LINES = {
  notHeard: "Sorry, I didn't catch that. Hold the button and try again.",
  declined: "Okay, I won't do it. Tell me what to change.",
  proceeding: 'Okay, going ahead.',
  confirm: 'Shall I go ahead? Say yes or no.',
  busy: "I'm still working on your last request. Give me a moment.",
};

/**
 * deps:
 *   record() → { stop(): Promise<wav>, cancel() }        (throws when the mic is missing)
 *   transcribe(wav) → text ('' when nothing was said)
 *   ask(text, { onReply }) → { content }                 (the chat agent; onReply = its first words)
 *   pending() → the plan waiting for Proceed, or null
 *   confirm(plan) → { content }   decline(plan)
 *   say(text)   stopSpeaking()
 *   thinking()   optional: a short spoken "one moment" right after the teacher stops talking
 *   onState({ phase: 'idle'|'listening'|'thinking', heard, answer, error })
 */
export function createTalk(deps) {
  let rec = null;
  let state = { phase: 'idle', heard: '', answer: '', error: '' };
  const set = (patch) => {
    state = { ...state, ...patch };
    deps.onState?.(state);
  };

  /**
   * Hold-to-talk pressed (or the wake phrase was heard, with { auto: true }: then listening
   * ends by itself a moment after the teacher stops talking). → true when listening started.
   */
  async function begin({ auto = false } = {}) {
    if (state.phase === 'thinking') {
      deps.say(LINES.busy);
      return false;
    }
    if (rec) return true;
    deps.stopSpeaking();
    try {
      rec = await deps.record(auto ? { onLevel: autoStopper() } : {});
    } catch (err) {
      rec = null;
      set({ phase: 'idle', error: err?.message || 'The microphone could not be started.' });
      return false;
    }
    set({ phase: 'listening', heard: '', answer: '', error: '' });
    return true;
  }

  /** Hold-to-talk released: understand and answer. */
  async function end() {
    if (!rec) return;
    const r = rec;
    rec = null;
    set({ phase: 'thinking' });
    deps.thinking?.();
    try {
      let wav;
      try {
        wav = await r.stop();
      } catch {
        wav = null;
      }
      const heard = wav ? await deps.transcribe(wav) : '';
      set({ heard });
      if (!heard) {
        deps.say(LINES.notHeard);
        return;
      }
      const intent = intentOf(heard);
      const plan = deps.pending();
      if (plan && intent === 'yes') {
        deps.say(LINES.proceeding);
        await speakAnswer(await deps.confirm(plan));
        return;
      }
      if (plan && (intent === 'no' || intent === 'stop')) {
        deps.decline(plan);
        set({ answer: LINES.declined });
        deps.say(LINES.declined);
        return;
      }
      if (intent === 'stop') {
        deps.stopSpeaking();
        return;
      }
      let early = '';
      const out = await deps.ask(heard, {
        onReply: (words) => {
          early = String(words || '').trim();
          if (early) deps.say(early);
        },
      });
      await speakAnswer(out, early);
    } catch (err) {
      const msg = err?.message || 'Something went wrong. Please try again.';
      set({ error: msg });
      deps.say(msg);
    } finally {
      set({ phase: 'idle' });
    }
  }

  async function speakAnswer(out, alreadySaid = '') {
    const content = String(out?.content || '').trim();
    const waiting = Boolean(deps.pending());
    const answer = waiting ? `${content} ${LINES.confirm}`.trim() : content;
    set({ answer });
    if (!answer) return;
    // The agent's first words were already spoken while it worked: do not repeat them.
    if (alreadySaid && content === alreadySaid && !waiting) return;
    deps.say(answer);
  }

  /**
   * Hands-free listening: watches the microphone level. After the teacher has spoken, a
   * pause of AUTO.silenceMs ends it (and it is answered); no speech at all within
   * AUTO.waitMs cancels it quietly; AUTO.maxMs is the longest one request can be.
   */
  function autoStopper() {
    const now = deps.now || Date.now;
    const started = now();
    let spokeAt = 0;
    let quietSince = 0;
    let done = false;
    const finish = (send) => {
      if (done) return;
      done = true;
      if (send) end();
      else cancel();
    };
    return (level) => {
      if (done || !rec) return;
      const t = now();
      if (level >= AUTO.speak) {
        spokeAt = spokeAt || t;
        quietSince = 0;
      } else if (spokeAt && level < AUTO.quiet) {
        quietSince = quietSince || t;
      }
      if (spokeAt && quietSince && t - quietSince >= AUTO.silenceMs) finish(true);
      else if (!spokeAt && t - started >= AUTO.waitMs) finish(false);
      else if (t - started >= AUTO.maxMs) finish(true);
    };
  }

  /** Let go outside the button, or the panel closed: nothing is sent. */
  function cancel() {
    rec?.cancel();
    rec = null;
    if (state.phase === 'listening') set({ phase: 'idle' });
  }

  return { begin, end, cancel, getState: () => state };
}
