import { useState, useEffect } from 'react';
import {
  collection, query, where, orderBy, limit, onSnapshot,
  updateDoc, deleteField, doc, Timestamp,
} from 'firebase/firestore';
import { UserX, RotateCcw, Trash2, Loader2, AlertTriangle } from 'lucide-react';
import { db } from '../../firebase';
import { adminDeleteInactiveNow, adminPurgeLeftovers } from '../../services/db';

const card = {
  background: 'var(--kt-card)', borderRadius: 14,
  border: '1px solid var(--kt-border)', padding: '20px 22px',
};
const btnSecondary = {
  background: 'var(--kt-surface)', color: '#1a3d2b', border: '1px solid rgba(45,106,79,0.2)',
  borderRadius: 8, padding: '6px 12px', fontSize: 11,
  fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
  display: 'flex', alignItems: 'center', gap: 5,
};

const btnDanger = {
  background: '#e05c5c', color: '#fff', border: '1px solid #e05c5c',
  borderRadius: 8, padding: '6px 12px', fontSize: 11,
  fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
  display: 'flex', alignItems: 'center', gap: 5,
};

const GRACE_DAYS = 30;
const CONFIRM_WORD = 'DELETE';

function ts(t) {
  if (!t) return '';
  const d = t.toDate ? t.toDate() : new Date(t);
  return d.toLocaleString('en-PH', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
function daysSince(t) {
  if (!t) return 0;
  const ms = t.toMillis ? t.toMillis() : new Date(t).getTime();
  return Math.floor((Date.now() - ms) / 86400000);
}

export default function InactiveUsersSection() {
  const [pending, setPending] = useState([]);
  const [logs, setLogs]       = useState([]);
  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [typed, setTyped]       = useState('');
  const [deleting, setDeleting] = useState(false);
  const [result, setResult]     = useState(null); // { ok, text }
  const [leftovers, setLeftovers] = useState(null); // null | { found } (counted, waiting for confirmation)
  const [leftTyped, setLeftTyped] = useState('');
  const [leftBusy, setLeftBusy]   = useState(false);

  useEffect(() => {
    const unsub = onSnapshot(
      query(collection(db, 'teachers'), where('deactivatedForInactivityAt', '>', Timestamp.fromMillis(0))),
      (snap) => {
        setPending(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setLoading(false);
      },
      () => setLoading(false),
    );
    return unsub;
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(
      query(collection(db, 'deletionLogs'), orderBy('deletedAt', 'desc'), limit(25)),
      (snap) => setLogs(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      () => {},
    );
    return unsub;
  }, []);

  async function reactivate(t) {
    await updateDoc(doc(db, 'teachers', t.id), {
      disabled: false,
      deactivatedForInactivityAt: deleteField(),
    }).catch(() => {});
  }

  const pendingSorted = [...pending].sort((a, b) => daysSince(b.deactivatedForInactivityAt) - daysSince(a.deactivatedForInactivityAt));
  // Admin accounts are never deleted (the server skips them too).
  const deletable = pendingSorted.filter((t) => !t.isAdmin);

  async function deleteAllNow() {
    if (typed.trim() !== CONFIRM_WORD || !deletable.length) return;
    setDeleting(true);
    setResult(null);
    try {
      // A long list is deleted in rounds (each round stops before the server's time limit).
      const ids = deletable.map((t) => t.id);
      const r = { deleted: 0, failed: 0, skipped: 0 };
      for (let round = 0; round < 20; round += 1) {
        const step = await adminDeleteInactiveNow(ids);
        r.deleted += step.deleted;
        r.failed += step.failed;
        if (round === 0) r.skipped = step.skipped;
        if (!step.remaining) break;
        setResult({ ok: true, text: `Deleted ${r.deleted} so far; continuing…` });
      }
      const parts = [`${r.deleted} account(s) permanently deleted, with all their data and files`];
      if (r.failed) parts.push(`${r.failed} failed (see the audit log below)`);
      if (r.skipped) parts.push(`${r.skipped} skipped (logged back in, already gone, or an admin)`);
      setResult({ ok: !r.failed, text: `${parts.join('; ')}.` });
      setConfirming(false);
      setTyped('');
    } catch (err) {
      setResult({ ok: false, text: `Nothing was deleted: ${err?.message || 'the request failed'}. Please try again.` });
    } finally {
      setDeleting(false);
    }
  }

  async function countLeftovers() {
    setLeftBusy(true);
    setResult(null);
    try {
      const r = await adminPurgeLeftovers({ dryRun: true });
      if (!r.found) setResult({ ok: true, text: 'No leftovers: every deleted account is fully removed.' });
      else { setLeftovers({ found: r.found }); setLeftTyped(''); }
    } catch (err) {
      setResult({ ok: false, text: `Could not check: ${err?.message || 'the request failed'}.` });
    } finally {
      setLeftBusy(false);
    }
  }

  async function removeLeftovers() {
    if (leftTyped.trim() !== CONFIRM_WORD) return;
    setLeftBusy(true);
    try {
      let deleted = 0;
      let failed = 0;
      for (let round = 0; round < 20; round += 1) {
        const step = await adminPurgeLeftovers();
        deleted += step.deleted;
        failed += step.failed;
        if (!step.remaining) break;
      }
      setResult({ ok: !failed, text: `Removed the leftovers of ${deleted} deleted account(s)${failed ? `; ${failed} failed (see the audit log)` : ''}.` });
      setLeftovers(null);
    } catch (err) {
      setResult({ ok: false, text: `Nothing more was removed: ${err?.message || 'the request failed'}. Please try again.` });
    } finally {
      setLeftBusy(false);
    }
  }

  return (
    <div style={{ ...card, marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <div style={{ width: 34, height: 34, borderRadius: 9, background: pending.length > 0 ? 'rgba(224,92,92,0.1)' : '#f5faf7', display: 'grid', placeItems: 'center' }}>
          <UserX size={16} color={pending.length > 0 ? '#e05c5c' : '#9bb8a5'} />
        </div>
        <div>
          <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--kt-text-primary)' }}>
            Inactivity Cleanup
            {pending.length > 0 && <span style={{ marginLeft: 8, fontSize: 11, background: '#fef0f0', color: '#e05c5c', border: '1px solid rgba(224,92,92,0.2)', borderRadius: 20, padding: '1px 8px' }}>{pending.length} pending deletion</span>}
          </h3>
          <p style={{ margin: 0, fontSize: 11, color: 'var(--kt-text-secondary)' }}>
            Accounts inactive 90+ days are deactivated automatically, then permanently deleted after a {GRACE_DAYS}-day grace window. Logging in reactivates an account.
          </p>
        </div>
        {deletable.length > 0 && !confirming && (
          <button type="button" onClick={() => { setConfirming(true); setTyped(''); setResult(null); }} style={{ ...btnDanger, marginLeft: 'auto', flexShrink: 0 }} title="Permanently delete every account in this list now, without waiting for the grace window">
            <Trash2 size={11} /> Delete all now
          </button>
        )}
      </div>

      {confirming && (
        <div role="alertdialog" aria-label="Confirm delete all" style={{ marginBottom: 14, padding: '12px 14px', borderRadius: 10, background: 'rgba(224,92,92,0.06)', border: '1px solid rgba(224,92,92,0.3)' }}>
          <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: '#c0392b', display: 'flex', alignItems: 'center', gap: 6 }}>
            <AlertTriangle size={14} /> Permanently delete {deletable.length} account{deletable.length > 1 ? 's' : ''} now?
          </p>
          <p style={{ margin: '6px 0 0', fontSize: 11, color: 'var(--kt-text-secondary)', lineHeight: 1.5 }}>
            Every account in this list loses its login and all its data (lesson files, class records, sections) right away, instead of at the end of the {GRACE_DAYS}-day grace window. This cannot be undone.
            Accounts that log back in before you confirm are kept, and admin accounts are never deleted. Each deletion is written to the audit log.
          </p>
          <label style={{ display: 'block', margin: '10px 0 4px', fontSize: 11, fontWeight: 600, color: 'var(--kt-text-primary)' }} htmlFor="kt-delete-all-confirm">
            Type {CONFIRM_WORD} to confirm
          </label>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <input
              id="kt-delete-all-confirm" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" disabled={deleting}
              style={{ flex: '1 1 160px', fontSize: 12, padding: '6px 10px', borderRadius: 8, border: '1px solid var(--kt-border)', background: 'var(--kt-surface)', color: 'var(--kt-text-primary)', fontFamily: 'inherit' }}
            />
            <button type="button" onClick={deleteAllNow} disabled={typed.trim() !== CONFIRM_WORD || deleting} style={{ ...btnDanger, opacity: typed.trim() !== CONFIRM_WORD || deleting ? 0.5 : 1, cursor: typed.trim() !== CONFIRM_WORD || deleting ? 'not-allowed' : 'pointer' }}>
              {deleting ? <Loader2 size={11} style={{ animation: 'spin 1s linear infinite' }} /> : <Trash2 size={11} />}
              {deleting ? 'Deleting…' : `Delete ${deletable.length} account${deletable.length > 1 ? 's' : ''}`}
            </button>
            <button type="button" onClick={() => { setConfirming(false); setTyped(''); }} disabled={deleting} style={btnSecondary}>Cancel</button>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        <span style={{ fontSize: 11, color: 'var(--kt-text-secondary)' }}>Deleting an account removes everything of it: data, chats, posts, files and login.</span>
        {!leftovers && (
          <button type="button" onClick={countLeftovers} disabled={leftBusy} style={{ ...btnSecondary, opacity: leftBusy ? 0.6 : 1 }} title="Find data still left by accounts deleted before the complete removal existed">
            {leftBusy ? <Loader2 size={11} style={{ animation: 'spin 1s linear infinite' }} /> : <Trash2 size={11} />} Clean up leftovers
          </button>
        )}
      </div>

      {leftovers && (
        <div role="alertdialog" aria-label="Confirm leftover cleanup" style={{ marginBottom: 14, padding: '12px 14px', borderRadius: 10, background: 'rgba(224,92,92,0.06)', border: '1px solid rgba(224,92,92,0.3)' }}>
          <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: '#c0392b' }}>
            {leftovers.found} deleted account{leftovers.found > 1 ? 's still have' : ' still has'} data left behind.
          </p>
          <p style={{ margin: '6px 0 0', fontSize: 11, color: 'var(--kt-text-secondary)', lineHeight: 1.5 }}>
            These accounts have no profile and no login any more, but their usage logs, usernames, chats, posts or files are still stored. Removing them cannot be undone.
          </p>
          <label style={{ display: 'block', margin: '10px 0 4px', fontSize: 11, fontWeight: 600, color: 'var(--kt-text-primary)' }} htmlFor="kt-leftover-confirm">Type {CONFIRM_WORD} to confirm</label>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <input id="kt-leftover-confirm" value={leftTyped} onChange={(e) => setLeftTyped(e.target.value)} autoComplete="off" disabled={leftBusy}
              style={{ flex: '1 1 160px', fontSize: 12, padding: '6px 10px', borderRadius: 8, border: '1px solid var(--kt-border)', background: 'var(--kt-surface)', color: 'var(--kt-text-primary)', fontFamily: 'inherit' }} />
            <button type="button" onClick={removeLeftovers} disabled={leftTyped.trim() !== CONFIRM_WORD || leftBusy} style={{ ...btnDanger, opacity: leftTyped.trim() !== CONFIRM_WORD || leftBusy ? 0.5 : 1, cursor: leftTyped.trim() !== CONFIRM_WORD || leftBusy ? 'not-allowed' : 'pointer' }}>
              {leftBusy ? <Loader2 size={11} style={{ animation: 'spin 1s linear infinite' }} /> : <Trash2 size={11} />} {leftBusy ? 'Removing…' : 'Remove leftovers'}
            </button>
            <button type="button" onClick={() => setLeftovers(null)} disabled={leftBusy} style={btnSecondary}>Cancel</button>
          </div>
        </div>
      )}

      {result && (
        <p role="status" style={{ margin: '0 0 12px', fontSize: 12, fontWeight: 600, color: result.ok ? '#2d6a4f' : '#c0392b' }}>{result.text}</p>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: 20 }}><Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} /></div>
      ) : pendingSorted.length === 0 ? (
        <p style={{ margin: 0, fontSize: 12, color: '#9bb8a5', textAlign: 'center', padding: 16 }}>No accounts currently deactivated for inactivity.</p>
      ) : (
        pendingSorted.map((t) => {
          const daysIn = daysSince(t.deactivatedForInactivityAt);
          const daysLeft = GRACE_DAYS - daysIn;
          return (
            <div key={t.id} style={{
              display: 'flex', gap: 10, alignItems: 'center',
              padding: '10px 12px', borderRadius: 8, marginBottom: 6,
              background: daysLeft <= 3 ? 'rgba(224,92,92,0.06)' : 'var(--kt-surface)',
              border: `1px solid ${daysLeft <= 3 ? 'rgba(224,92,92,0.2)' : 'var(--kt-border)'}`,
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: 'var(--kt-text-primary)' }}>{t.displayName || '(no name)'}</p>
                <p style={{ margin: '2px 0 0', fontSize: 11, color: 'var(--kt-text-secondary)' }}>{t.email} · {t.school}</p>
                <p style={{ margin: '2px 0 0', fontSize: 10, color: '#9bb8a5' }}>
                  Last active: {ts(t.lastActiveAt) || 'never'} · Deactivated: {ts(t.deactivatedForInactivityAt)}
                </p>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                {daysLeft <= 3 && <AlertTriangle size={13} color="#e05c5c" />}
                <span style={{ fontSize: 11, fontWeight: 700, color: daysLeft <= 3 ? '#e05c5c' : 'var(--kt-text-secondary)' }}>
                  {daysLeft > 0 ? `${daysLeft}d until deletion` : 'deleting soon'}
                </span>
                <button onClick={() => reactivate(t)} style={btnSecondary} title="Reactivate this account">
                  <RotateCcw size={11} /> Reactivate
                </button>
              </div>
            </div>
          );
        })
      )}

      {logs.length > 0 && (
        <>
          <h4 style={{ margin: '18px 0 8px', fontSize: 12, fontWeight: 700, color: 'var(--kt-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Trash2 size={12} /> Recent Deletions (audit log)
          </h4>
          {logs.map((l) => (
            <div key={l.id} style={{
              display: 'flex', gap: 10, alignItems: 'center',
              padding: '8px 12px', borderRadius: 8, marginBottom: 4,
              background: 'var(--kt-surface)', border: '1px solid var(--kt-border)',
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: 'var(--kt-text-primary)' }}>
                  {l.email || l.uid}
                  {String(l.reason || '').endsWith('_failed') && <span style={{ marginLeft: 6, fontSize: 10, color: '#e05c5c' }}>(failed: {l.error})</span>}
                  {l.reason === 'inactivity_deleted_by_admin' && <span style={{ marginLeft: 6, fontSize: 10, color: 'var(--kt-text-secondary)' }}>(inactive, deleted by an admin)</span>}
                  {l.reason === 'deleted_by_admin' && <span style={{ marginLeft: 6, fontSize: 10, color: 'var(--kt-text-secondary)' }}>(deleted by an admin)</span>}
                  {l.reason === 'leftovers_of_deleted_account' && <span style={{ marginLeft: 6, fontSize: 10, color: 'var(--kt-text-secondary)' }}>(leftovers removed)</span>}
                </p>
                <p style={{ margin: '2px 0 0', fontSize: 10, color: '#9bb8a5' }}>{ts(l.deletedAt)}</p>
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
