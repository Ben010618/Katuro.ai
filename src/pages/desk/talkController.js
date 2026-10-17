/**
 * talkController.js — the app's one conversation with the persona (chat Talk button, the
 * bubble's Talk button and Ctrl+Space all share it). Wires talk.js to the microphone, the
 * transcriber (English, Filipino, Taglish), the chat agent and the persona's voice.
 */
import { useDeskStore } from '../../store/deskStore';
import { startRecording, transcribeAudio } from '../../services/desk/voice/voiceInput';
import { createTalk, TALK_PROMPT, cleanTalk, LINES } from '../../services/desk/voice/talk';
import { deskSpeaker } from '../../services/desk/voice/speech';
import { runChatTurn } from './runChatTurn';

let context = { user: null, profile: null, onOpenCanvas: null };
/** KaTuroDeskPage keeps this current (who is signed in, how to open the Canvas). */
export function setTalkContext(next) {
  context = { ...context, ...next };
}
export const getTalkContext = () => context;

const listeners = new Set();
let talk = null;

/** The plan waiting for Proceed: only in the newest reply (an older plan is never run by voice). */
function pendingPlan() {
  const msgs = useDeskStore.getState().messages;
  const last = [...msgs].reverse().find((m) => m.role === 'assistant' && !m.isThinking);
  return last?.pendingPlan && !last.planDecision ? last : null;
}

function speak(text) {
  const s = useDeskStore.getState();
  const v = s.speechSettings || {};
  deskSpeaker().say(text, { persona: s.persona, natural: v.natural !== false, volume: v.volume ?? 0.9 }).catch(() => {});
}

export function deskTalk() {
  if (talk) return talk;
  talk = createTalk({
    record: (opts) => startRecording(opts || {}),
    transcribe: (wav) => transcribeAudio(wav, { prompt: TALK_PROMPT, clean: cleanTalk }),
    async ask(text, { onReply }) {
      const s = useDeskStore.getState();
      if (!context.user) throw new Error('Please sign in to your KaTuro account first.');
      if (s.isGenerating) throw new Error(LINES.busy);
      const attachments = [...s.attachedPaths];
      const out = await runChatTurn({ text, attachments, user: context.user, profile: context.profile, onOpenCanvas: context.onOpenCanvas, speakReply: false, onReply });
      if (out.status === 'done' || out.files.length) useDeskStore.getState().clearAttachments();
      return out;
    },
    pending: pendingPlan,
    async confirm(msg) {
      useDeskStore.getState().updateMessage(msg.id, { planDecision: 'proceed' });
      const out = await runChatTurn({ text: 'Proceed', attachments: msg.pendingAttachments || [], user: context.user, profile: context.profile, onOpenCanvas: context.onOpenCanvas, confirmedPlan: msg.pendingPlan, speakReply: false });
      if (out.status === 'done' || out.files.length) useDeskStore.getState().clearAttachments();
      return out;
    },
    decline(msg) {
      useDeskStore.getState().updateMessage(msg.id, { planDecision: 'change' });
    },
    say: speak,
    stopSpeaking: () => deskSpeaker().stop(),
    onState: (st) => listeners.forEach((fn) => fn(st)),
  });
  return talk;
}

/** Hears every change of { phase, heard, answer, error }. Returns unsubscribe. */
export function subscribeTalk(fn) {
  listeners.add(fn);
  fn(deskTalk().getState());
  return () => listeners.delete(fn);
}
