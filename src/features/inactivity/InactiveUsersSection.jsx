import { useState, useEffect } from 'react';
import {
  collection, query, where, orderBy, limit, onSnapshot,
  updateDoc, deleteField, doc, Timestamp,
} from 'firebase/firestore';
import { UserX, RotateCcw, Trash2, Loader2, AlertTriangle } from 'lucide-react';
import { db } from '../../firebase';

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

const GRACE_DAYS = 30;

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
      </div>

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
                  {l.displayName || l.email || l.uid}
                  {l.reason === 'inactivity_delete_failed' && <span style={{ marginLeft: 6, fontSize: 10, color: '#e05c5c' }}>(failed: {l.error})</span>}
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
