import { useState } from 'react';
import { ThumbsUp, ThumbsDown, Send } from 'lucide-react';
import { useDeskStore } from '../../store/deskStore';
import { DOWN_REASONS, sendFeedback, toolsOf } from '../../services/desk/feedback';

/**
 * "Was this helpful?" under a KaTuroDesk answer. Thumbs down asks why (one tap) and
 * takes an optional short comment. Only the rating, reason, comment and tool names
 * are sent: never the request, the answer, files or learner names.
 */
export default function AnswerFeedback({ msg, uid, persona }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const mark = (feedback) => useDeskStore.getState().updateMessage(msg.id, { feedback });

  if (msg.feedback) {
    return <p className="mt-2 text-[10.5px] text-gray-400">{msg.feedback === 'up' ? 'Thanks for the feedback.' : 'Thanks. This helps the KaTuro team improve KaTuroDesk.'}</p>;
  }

  const send = async (rating, why = '', note = '') => {
    setBusy(true); setError('');
    try {
      await sendFeedback({ uid, rating, reason: why, comment: note, tools: toolsOf(msg), persona });
      mark(rating);
    } catch (e) {
      setError(e?.message || 'Could not send. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-2">
      <div className="flex items-center gap-1 text-gray-400">
        <span className="text-[10.5px] mr-1">Helpful?</span>
        <button type="button" aria-label="Helpful" title="Helpful" disabled={busy} onClick={() => send('up')} className="p-1 rounded hover:bg-gray-100 hover:text-emerald-700 transition">
          <ThumbsUp size={12} />
        </button>
        <button type="button" aria-label="Not helpful" title="Not helpful" disabled={busy} onClick={() => setOpen((o) => !o)} className={`p-1 rounded hover:bg-gray-100 hover:text-amber-700 transition ${open ? 'text-amber-700' : ''}`}>
          <ThumbsDown size={12} />
        </button>
      </div>
      {open && (
        <div className="mt-1.5 p-2 rounded-lg border border-gray-200 bg-gray-50">
          <p className="text-[11px] font-semibold text-gray-700 mb-1.5">What went wrong?</p>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Reason">
            {DOWN_REASONS.map((r) => (
              <button key={r} type="button" onClick={() => setReason(r)} aria-pressed={reason === r}
                className={`px-2 py-0.5 rounded-full border text-[10.5px] transition ${reason === r ? 'border-amber-500 bg-amber-50 text-amber-800' : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-100'}`}>
                {r}
              </button>
            ))}
          </div>
          <div className="mt-1.5 flex gap-1.5">
            <input
              value={comment}
              onChange={(e) => setComment(e.target.value.slice(0, 400))}
              placeholder="Optional: what did you mean? (no learner names please)"
              className="flex-1 min-w-0 text-[11px] px-2 py-1 rounded border border-gray-300 bg-white focus:outline-none focus:border-emerald-500"
              aria-label="Comment"
            />
            <button type="button" disabled={busy || !reason} onClick={() => send('down', reason, comment)}
              className="px-2 py-1 rounded bg-emerald-700 hover:bg-emerald-800 text-white text-[11px] font-semibold flex items-center gap-1 disabled:opacity-50">
              <Send size={11} /> Send
            </button>
          </div>
          {error && <p className="mt-1 text-[10.5px] text-red-600">{error}</p>}
        </div>
      )}
    </div>
  );
}
