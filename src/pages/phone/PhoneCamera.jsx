import { useEffect, useRef, useState } from 'react';
import { BookOpen, Camera, CheckCircle2, ClipboardCheck, FileText, Image as ImageIcon, Loader2, PartyPopper, ScanLine, X } from 'lucide-react';
import { sendFiles } from '../../services/link/phoneFiles';

// Where each kind of photo goes on KaTuroDesk. Inside Lessons: KaTuroDesk lets phones add
// files there by default (Records is view-only unless the teacher changes it).
const PHOTO_HOME = 'Lessons/Phone Photos';
const PHOTO_KINDS = [
  { id: 'tests', label: 'Test papers', hint: 'Checked quizzes and tests, essays', folder: 'Test papers', prefix: 'Test paper', icon: ClipboardCheck },
  { id: 'lesson', label: 'Lesson materials', hint: 'Board work, book pages, modules', folder: 'Lesson materials', prefix: 'Lesson', icon: BookOpen },
  { id: 'docs', label: 'Documents and forms', hint: 'Letters, memos, forms, receipts', folder: 'Documents', prefix: 'Document', icon: FileText },
  { id: 'events', label: 'Activities and events', hint: 'Class activities, programs, proof of work', folder: 'Activities', prefix: 'Activity', icon: PartyPopper },
  { id: 'other', label: 'Something else', hint: '', folder: 'Other', prefix: 'Photo', icon: ImageIcon },
];

/**
 * The camera, one tap away (top of the app and beside the chat box). The teacher says what the
 * photo is for; it goes to KaTuroDesk into Lessons › Phone Photos › <kind>: at once, or it stays
 * on this phone (the outbox) and goes by itself as soon as the phone is on the same Wi-Fi.
 * Bubble sheets are checked instead (Scores → the class → Fill from bubble sheets).
 */
export default function PhoneCamera({ client, onClose, onBubbleSheets, onSent }) {
  const [kind, setKind] = useState(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState([]); // sendFiles results: { name, ok, queued?, error? }
  const [error, setError] = useState('');
  const inputRef = useRef(null);
  const closeRef = useRef(null);
  useEffect(() => { closeRef.current?.focus(); }, []);

  const pick = (k) => {
    setKind(k);
    setError('');
    // Open the camera straight away (the tap that chose the kind allows it).
    requestAnimationFrame(() => inputRef.current?.click());
  };

  const take = async (e) => {
    const files = [...(e.target.files || [])];
    e.target.value = '';
    if (!files.length || !kind) return;
    setBusy(true);
    setError('');
    try {
      const res = await sendFiles(client, `${PHOTO_HOME}/${kind.folder}`, files, () => {}, { prefix: kind.prefix });
      setDone((d) => [...d, ...res]);
      const refused = res.find((r) => !r.ok);
      if (refused) setError(refused.code === 'NOT_ALLOWED' || refused.code === 'NOT_FOUND' ? 'KaTuroDesk does not let this phone add photos to Lessons. On the computer: Settings → Phones → Lessons → View & add. This photo was not kept.' : `The photo could not be saved: ${refused.error}`);
      onSent?.();
    } finally {
      setBusy(false);
    }
  };

  const sent = done.filter((d) => d.ok && !d.queued).length;
  const waiting = done.filter((d) => d.queued).length;
  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/40" onClick={busy ? undefined : onClose} role="presentation">
      <div role="dialog" aria-modal="true" aria-label="Camera" onClick={(e) => e.stopPropagation()} className="nm w-full rounded-t-3xl p-5 space-y-3" style={{ paddingBottom: 'max(20px, env(safe-area-inset-bottom))' }}>
        <div className="flex items-center justify-between">
          <p className="flex items-center gap-2 text-base font-semibold"><Camera size={20} className="text-emerald-700" /> {kind ? kind.label : 'What is the photo for?'}</p>
          <button ref={closeRef} type="button" onClick={onClose} aria-label="Close" className="p-1"><X size={22} /></button>
        </div>
        <input ref={inputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={take} />

        {!kind && (
          <>
            <button type="button" onClick={() => { onClose(); onBubbleSheets(); }} className="nm-accent nm-press flex w-full items-center gap-3 rounded-2xl px-4 py-3.5 text-left">
              <ScanLine size={22} className="flex-shrink-0" />
              <span><span className="block text-sm font-semibold">Check bubble sheets</span><span className="block text-xs opacity-90">Scan them; the scores go to your class record</span></span>
            </button>
            {PHOTO_KINDS.map((k) => (
              <button key={k.id} type="button" onClick={() => pick(k)} className="nm-sm nm-press flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left">
                <k.icon size={20} className="flex-shrink-0 text-emerald-700" />
                <span className="min-w-0"><span className="block text-sm font-medium">{k.label}</span>{k.hint && <span className="nm-muted block text-xs">{k.hint}</span>}</span>
              </button>
            ))}
          </>
        )}

        {kind && (
          <div className="space-y-3">
            {busy && <p className="flex items-center gap-2 text-sm"><Loader2 size={16} className="animate-spin" /> Saving the photo…</p>}
            {(sent > 0 || waiting > 0) && (
              <div className="nm-in rounded-2xl px-4 py-3 text-sm" role="status">
                {sent > 0 && <p className="flex items-center gap-2 font-medium text-emerald-800"><CheckCircle2 size={16} /> {sent} sent to KaTuroDesk</p>}
                {waiting > 0 && <p className="flex items-center gap-2 font-medium text-amber-800"><CheckCircle2 size={16} /> {waiting} saved on this phone: {waiting > 1 ? 'they go' : 'it goes'} to KaTuroDesk by {waiting > 1 ? 'themselves' : 'itself'} on the same Wi-Fi</p>}
                <p className="nm-muted mt-1 text-xs">{['Lessons', 'Phone Photos', kind.folder].join(' › ')}</p>
              </div>
            )}
            {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
            <div className="grid grid-cols-2 gap-2">
              <button type="button" disabled={busy} onClick={() => inputRef.current?.click()} className="nm-accent nm-press flex items-center justify-center gap-2 rounded-2xl py-3 text-sm font-semibold disabled:opacity-50"><Camera size={18} /> {done.length ? 'Take another' : 'Take a photo'}</button>
              <button type="button" disabled={busy} onClick={() => { setKind(null); setDone([]); }} className="nm-sm nm-press rounded-2xl py-3 text-sm font-medium disabled:opacity-50">Something else</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
