import { useState } from 'react';
import { Trash2, Loader2, AlertTriangle } from 'lucide-react';
import { adminDeleteInactiveNow } from '../../services/db';

const CONFIRM_WORD = 'DELETE';

/**
 * Under Total Users: what the records are (they add up to Total), and for the accounts
 * waiting for deletion, a Delete now button. Deleting goes through the same server function
 * as Inactivity > "Delete all now": every account is checked again on the server and removed
 * completely (data, files, login), so Total drops by that many right away.
 */
export default function TotalUsersBreakdown({ total, breakdown }) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const ids = breakdown.deletableIds;

  const parts = [
    `${breakdown.switchedOn} switched on`,
    `${breakdown.waiting} waiting for deletion`,
    `${breakdown.turnedOff} turned off`,
    ...(breakdown.awaitingApproval ? [`${breakdown.awaitingApproval} awaiting approval`] : []),
  ];

  async function deleteNow() {
    if (typed.trim() !== CONFIRM_WORD || !ids.length) return;
    setBusy(true);
    setResult(null);
    try {
      // A long list is deleted in rounds (each round stops before the server's time limit).
      const r = { deleted: 0, failed: 0, skipped: 0 };
      for (let round = 0; round < 20; round += 1) {
        const step = await adminDeleteInactiveNow(ids);
        r.deleted += step.deleted;
        r.failed += step.failed;
        if (round === 0) r.skipped = step.skipped;
        if (!step.remaining) break;
        setResult({ ok: true, text: `Deleted ${r.deleted} so far; continuing…` });
      }
      const text = [`${r.deleted} account(s) permanently deleted, with all their data and files`];
      if (r.failed) text.push(`${r.failed} failed (see Inactivity > audit log)`);
      if (r.skipped) text.push(`${r.skipped} skipped (logged back in or already gone)`);
      setResult({ ok: !r.failed, text: `${text.join('; ')}.` });
      setTyped('');
      setOpen(false);
    } catch (err) {
      setResult({ ok: false, text: `Nothing was deleted: ${err?.message || 'the request failed'}. Please try again.` });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ marginTop: 3 }}>
      <p style={{ margin: 0, fontSize: 10, lineHeight: 1.45, color: 'var(--kt-text-secondary)' }}>
        {total} records: {parts.join(', ')}
      </p>
      {ids.length > 0 && (
        <button
          type="button"
          onClick={() => { setOpen(true); setTyped(''); setResult(null); }}
          style={{ marginTop: 5, display: 'inline-flex', alignItems: 'center', gap: 4, background: '#e05c5c', color: '#fff', border: '1px solid #e05c5c', borderRadius: 7, padding: '3px 9px', fontSize: 10, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}
        >
          <Trash2 size={11} /> Delete {ids.length} now
        </button>
      )}
      {result && !open && (
        <p role="status" style={{ margin: '4px 0 0', fontSize: 10, color: result.ok ? '#2d6a4f' : '#b42318' }}>{result.text}</p>
      )}

      {open && (
        <div role="dialog" aria-modal="true" aria-label="Delete accounts waiting for deletion" style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.35)', display: 'grid', placeItems: 'center', padding: 16 }} onClick={() => !busy && setOpen(false)}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 440, background: 'var(--kt-card)', border: '1px solid var(--kt-border)', borderRadius: 14, padding: '20px 22px', boxShadow: '0 12px 40px rgba(0,0,0,0.25)' }}>
            <p style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, fontWeight: 700, color: '#b42318' }}>
              <AlertTriangle size={16} /> Permanently delete {ids.length} account(s)?
            </p>
            <p style={{ margin: '10px 0 0', fontSize: 12, lineHeight: 1.5, color: 'var(--kt-text-primary)' }}>
              These accounts were turned off for 90+ days of no use and are waiting for deletion. Deleting now removes each one completely from kaTuro: their data, files, messages on their side, and their login. Total Users drops by {ids.length}. <strong>This cannot be undone.</strong>
            </p>
            <p style={{ margin: '8px 0 0', fontSize: 11, color: 'var(--kt-text-secondary)' }}>
              Admin accounts and your own account are never deleted. Anyone who signed in again since is kept.
            </p>
            <label style={{ display: 'block', margin: '12px 0 0', fontSize: 11, color: 'var(--kt-text-secondary)' }}>
              Type <strong>{CONFIRM_WORD}</strong> to confirm
              <input
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                disabled={busy}
                autoFocus
                style={{ display: 'block', width: '100%', marginTop: 4, padding: '7px 9px', fontSize: 13, borderRadius: 8, border: '1px solid var(--kt-border)', background: 'var(--kt-surface)', color: 'var(--kt-text-primary)', fontFamily: 'inherit', boxSizing: 'border-box' }}
              />
            </label>
            {result && <p role="status" style={{ margin: '8px 0 0', fontSize: 11, color: result.ok ? '#2d6a4f' : '#b42318' }}>{result.text}</p>}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
              <button type="button" onClick={() => setOpen(false)} disabled={busy} style={{ background: 'var(--kt-surface)', color: 'var(--kt-text-primary)', border: '1px solid var(--kt-border)', borderRadius: 8, padding: '7px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
              <button
                type="button"
                onClick={deleteNow}
                disabled={busy || typed.trim() !== CONFIRM_WORD}
                style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#e05c5c', color: '#fff', border: '1px solid #e05c5c', borderRadius: 8, padding: '7px 14px', fontSize: 12, fontWeight: 700, cursor: busy || typed.trim() !== CONFIRM_WORD ? 'not-allowed' : 'pointer', opacity: busy || typed.trim() !== CONFIRM_WORD ? 0.5 : 1, fontFamily: 'inherit' }}
              >
                {busy ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />} {busy ? 'Deleting…' : 'Delete permanently'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
