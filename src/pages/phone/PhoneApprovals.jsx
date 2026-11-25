import { useCallback, useEffect, useState } from 'react';
import { Check, Hand, Loader2, X } from 'lucide-react';

const EVERY_MS = 60000;
const STATUS = { done: 'Done', approved: 'Approved', waiting: 'Waiting', pending: 'Not yet', skipped: 'Skipped', error: 'Did not finish', needs_info: 'Needs input', rejected: 'Not approved', running: 'Working' };

/**
 * Routines on KaTuroDesk waiting for the teacher's OK ("Ask me first"), answered from the phone.
 * Shown only when something waits; nothing shows with an older KaTuroDesk.
 */
export default function PhoneApprovals({ client, online }) {
  const [items, setItems] = useState([]);
  const [busy, setBusy] = useState('');
  const [note, setNote] = useState({ text: '', bad: false });
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!client || !online) return undefined;
    let alive = true;
    const load = () => client.request('routineInbox')
      .then((r) => { if (alive && !client.closed) setItems(Array.isArray(r?.items) ? r.items : []); })
      .catch(() => { if (alive) setItems([]); }); // an older KaTuroDesk, or no Wi-Fi: nothing to show
    load();
    const id = setInterval(load, EVERY_MS);
    return () => { alive = false; clearInterval(id); };
  }, [client, online, tick]);

  const answer = useCallback(async (item, approve) => {
    setBusy(item.id);
    setNote({ text: '', bad: false });
    try {
      const r = await client.request('routineDecide', { id: item.id, approve });
      setNote({ text: approve ? `Approved. ${r?.summary || ''}`.trim() : 'Not approved: KaTuroDesk did nothing after it.', bad: false });
      setTick((t) => t + 1);
    } catch (err) {
      setNote({ text: err?.message || 'KaTuroDesk could not be reached.', bad: true });
    } finally {
      setBusy('');
    }
  }, [client]);

  if (!items.length && !note.text) return null;
  return (
    <section className="nm rounded-3xl p-4" aria-label="Waiting for your OK">
      <p className="flex items-center gap-2 text-base font-semibold"><Hand size={18} aria-hidden="true" /> Waiting for your OK</p>
      {note.text ? <p className={`mt-2 text-sm ${note.bad ? 'text-red-600' : 'nm-green'}`} role="status">{note.text}</p> : null}
      <div className="mt-3 space-y-3">
        {items.map((it) => (
          <div key={it.id} className="nm-in space-y-2 rounded-2xl p-3">
            <p className="text-sm font-semibold">{it.routineName}</p>
            {it.note ? <p className="text-sm">{it.note}</p> : null}
            {it.preview?.length ? <ul className="nm-muted list-disc space-y-0.5 pl-5 text-xs">{it.preview.map((p) => <li key={p} className="break-words">{p}</li>)}</ul> : null}
            {it.steps?.length ? (
              <p className="nm-muted text-xs">{it.steps.map((s) => `${s.label}: ${STATUS[s.status] || s.status}`).join(' → ')}</p>
            ) : null}
            <div className="flex flex-wrap gap-2 pt-1">
              <button type="button" onClick={() => answer(it, true)} disabled={Boolean(busy)} className="nm-accent flex min-h-[2.75rem] items-center gap-1.5 rounded-2xl px-4 text-sm font-semibold disabled:opacity-60">
                {busy === it.id ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />} Approve
              </button>
              <button type="button" onClick={() => answer(it, false)} disabled={Boolean(busy)} className="nm-sm nm-press flex min-h-[2.75rem] items-center gap-1.5 rounded-2xl px-4 text-sm font-semibold disabled:opacity-60">
                <X size={16} /> Do not do it
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
