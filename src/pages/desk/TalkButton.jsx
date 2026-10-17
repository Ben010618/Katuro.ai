import { useEffect, useRef, useState } from 'react';
import { AudioLines, Loader2, Square } from 'lucide-react';
import { deskTalk, subscribeTalk } from './talkController';
import { deskSpeaker } from '../../services/desk/voice/speech';

/**
 * Hold to talk with the persona (chat box). Hold the button, or hold Ctrl+Space, speak,
 * let go. The answer is spoken and shown in the chat. Releasing outside the button cancels.
 */
export function TalkButton({ personaName, disabled }) {
  const [talk, setTalk] = useState({ phase: 'idle' });
  const [speaking, setSpeaking] = useState(false);
  const holding = useRef(false);

  useEffect(() => subscribeTalk(setTalk), []);
  useEffect(() => deskSpeaker().subscribe((s) => setSpeaking(s.speaking)), []);

  // Hold Ctrl+Space anywhere in KaTuroDesk to talk.
  useEffect(() => {
    const down = (e) => {
      if (e.code === 'Space' && e.ctrlKey && !e.repeat && !holding.current) {
        e.preventDefault();
        holding.current = true;
        deskTalk().begin();
      }
    };
    const up = (e) => {
      if (holding.current && (e.code === 'Space' || e.key === 'Control')) {
        e.preventDefault();
        holding.current = false;
        deskTalk().end();
      }
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);

  const press = (e) => {
    if (disabled || e.button !== 0) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    holding.current = true;
    deskTalk().begin();
  };
  const release = (e) => {
    if (!holding.current) return;
    holding.current = false;
    const r = e.currentTarget.getBoundingClientRect();
    const inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
    if (inside) deskTalk().end();
    else deskTalk().cancel();
  };

  const listening = talk.phase === 'listening';
  const thinking = talk.phase === 'thinking';
  return (
    <button
      type="button"
      onPointerDown={press}
      onPointerUp={release}
      onPointerCancel={() => { holding.current = false; deskTalk().cancel(); }}
      disabled={disabled && !listening}
      title={`Hold to talk with ${personaName} (or hold Ctrl+Space). English, Filipino or Taglish.`}
      aria-label={`Hold to talk with ${personaName}`}
      aria-pressed={listening}
      className={`p-2 rounded-lg transition flex-shrink-0 disabled:opacity-40 select-none touch-none ${listening ? 'bg-emerald-600 text-white' : thinking ? 'text-emerald-700' : speaking ? 'text-emerald-700 bg-emerald-50' : 'text-gray-500 hover:text-emerald-700 hover:bg-emerald-50'}`}
    >
      {thinking ? <Loader2 size={15} className="animate-spin" /> : <AudioLines size={15} />}
    </button>
  );
}

/** One line above the chat box while talking: what was heard, and Stop while the persona speaks. */
export function TalkStatus({ personaName }) {
  const [talk, setTalk] = useState({ phase: 'idle' });
  const [speaking, setSpeaking] = useState(false);
  useEffect(() => subscribeTalk(setTalk), []);
  useEffect(() => deskSpeaker().subscribe((s) => setSpeaking(s.speaking)), []);
  const text = talk.phase === 'listening'
    ? `Listening… let go to send to ${personaName}.`
    : talk.phase === 'thinking'
      ? (talk.heard ? `You said: "${talk.heard}"` : 'Understanding what you said…')
      : speaking
        ? `${personaName} is speaking.`
        : talk.error || '';
  if (!text) return null;
  return (
    <div className="mb-2 flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-[11px] text-emerald-900" role="status">
      <span className="min-w-0 flex-1 truncate">{text}</span>
      {speaking && (
        <button type="button" onClick={() => deskSpeaker().stop()} className="flex items-center gap-1 rounded border border-emerald-300 bg-white px-2 py-0.5 text-[10.5px] font-semibold text-emerald-800 hover:bg-emerald-100">
          <Square size={9} /> Stop
        </button>
      )}
    </div>
  );
}
