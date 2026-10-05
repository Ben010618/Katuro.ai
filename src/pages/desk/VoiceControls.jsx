import { Mic, Square, Loader2, X } from 'lucide-react';
import { VOICE_MAX_SECONDS } from '../../services/desk/voice/voiceInput';

const mmss = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

/** Microphone button for the composer: click to start, click again to stop. */
export function VoiceButton({ voice, disabled }) {
  const listening = voice.status === 'listening';
  const busy = voice.status === 'starting' || voice.status === 'transcribing';
  return (
    <button
      type="button"
      onClick={() => (listening ? voice.stop() : voice.start())}
      disabled={disabled || busy}
      aria-pressed={listening}
      title={listening ? 'Stop and turn into text' : `Speak instead of typing (English only, up to ${VOICE_MAX_SECONDS} seconds)`}
      className={`p-2 rounded-lg transition flex-shrink-0 disabled:opacity-40 ${
        listening ? 'bg-red-600 text-white hover:bg-red-700' : 'text-gray-500 hover:text-emerald-700 hover:bg-emerald-50'
      }`}
    >
      {busy ? <Loader2 size={15} className="animate-spin" /> : listening ? <Square size={13} fill="currentColor" /> : <Mic size={15} />}
    </button>
  );
}

/** Status line above the composer while listening / transcribing, or a voice error. */
export function VoiceStatus({ voice }) {
  if (voice.status === 'listening' || voice.status === 'starting') {
    const bars = [0.55, 0.85, 1, 0.75, 0.5];
    return (
      <div className="mb-2 flex items-center gap-3 rounded-lg border border-red-200 bg-red-50/60 px-3 py-1.5 text-[11px] text-red-900" role="status">
        <span className="flex items-end gap-[3px] h-4" aria-hidden="true">
          {bars.map((w, i) => (
            <span key={i} className="w-[3px] rounded-full bg-red-600 transition-[height] duration-100" style={{ height: `${Math.max(3, Math.round(16 * Math.min(1, voice.level * w * 1.6)))}px` }} />
          ))}
        </span>
        <span className="font-semibold tabular-nums">{voice.status === 'starting' ? 'Starting microphone…' : `Listening ${mmss(voice.seconds)}`}</span>
        {/* Always shown: audio can't be name-masked, so the teacher is told where it goes. */}
        <span className="flex-1 min-w-0 truncate text-red-800/70" title="Your voice is turned into text by Google AI and is not saved.">Turned into text by Google AI, not saved.</span>
        <button type="button" onClick={voice.stop} disabled={voice.status !== 'listening'} className="px-2 py-0.5 rounded-md bg-red-600 text-white font-medium hover:bg-red-700 disabled:opacity-50">Done</button>
        <button type="button" onClick={voice.cancel} className="p-1 rounded-md text-red-800 hover:bg-red-100" title="Cancel recording"><X size={12} /></button>
      </div>
    );
  }
  if (voice.status === 'transcribing') {
    return (
      <div className="mb-2 flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 text-[11px] text-gray-600" role="status">
        <Loader2 size={12} className="animate-spin text-emerald-700" /> Turning your voice into text…
      </div>
    );
  }
  if (voice.error) {
    return (
      <div className="mb-2 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-[11px] text-amber-900" role="alert">
        <span className="flex-1">{voice.error}</span>
        <button type="button" onClick={voice.clearError} className="p-1 rounded-md hover:bg-amber-100" title="Dismiss"><X size={12} /></button>
      </div>
    );
  }
  return null;
}
