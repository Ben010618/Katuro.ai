import { useState, useEffect } from 'react';
import { AlertTriangle, Clock, Loader2, FolderOpen, Archive } from 'lucide-react';
import { useAuth } from '../../../hooks/useAuth';
import { subscribeCases, subscribeMyCases } from '../services/caseService';
import { subscribeReferralContacts } from '../services/referralService';
import { CASE_STATE_LABELS } from '../types';
import CaseDetail from './CaseDetail';
import EscalationBadge from './EscalationBadge';

// Single case list for everyone — admins see every school case (with the
// Active/Archived filter and red-flag highlight the old admin-only "Cases"
// tab had); everyone else sees only cases they personally filed. Firestore
// rules enforce the same split server-side (a non-admin can only read a
// protect_cases doc where createdBy matches their own uid), so this is UI
// convenience layered on a restriction that already exists underneath.
const RED_FLAG_MODALITIES = ['weapon', 'sexual'];

function daysInState(caseData) {
  const timeline = caseData.timeline || [];
  const last = timeline[timeline.length - 1];
  if (!last?.at) return 0;
  return Math.floor((Date.now() - new Date(last.at).getTime()) / 86400000);
}

function isRedFlag(caseData) {
  return caseData.escalationTier === 'T_RED'
    || (caseData.intake?.modality || []).some((m) => RED_FLAG_MODALITIES.includes(m));
}

export default function FiledCases({ initialCaseId, onCaseOpened }) {
  const { user, isAdmin } = useAuth();
  const [cases, setCases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [referralContacts, setReferralContacts] = useState({});
  const [view, setView] = useState('active'); // 'active' | 'archived' — admin view only
  const [selectedId, setSelectedId] = useState(initialCaseId || null);

  useEffect(() => {
    // The whole page sits behind ProtectedRoute, so user is always present
    // in practice by the time this renders — this guard just avoids
    // subscribing with an undefined uid during the very first tick.
    if (!user?.uid) return undefined;
    const onData = (data) => { setCases(data); setLoading(false); };
    const onErr = () => setLoading(false);
    return isAdmin ? subscribeCases(onData, onErr) : subscribeMyCases(user.uid, onData, onErr);
  }, [user?.uid, isAdmin]);

  useEffect(() => subscribeReferralContacts(setReferralContacts, () => {}), []);

  const selected = cases.find((c) => c.id === selectedId);

  if (selected) {
    return (
      <CaseDetail
        caseData={selected}
        referralContacts={referralContacts}
        backLabel="Back to Filed Cases"
        onBack={() => { setSelectedId(null); onCaseOpened?.(null); }}
      />
    );
  }

  const filtered = isAdmin ? cases.filter((c) => (view === 'archived' ? !!c.archived : !c.archived)) : cases;
  const archivedCount = cases.filter((c) => c.archived).length;

  if (loading) {
    return <div style={{ textAlign: 'center', padding: 40 }}><Loader2 size={20} style={{ animation: 'kt-spin 0.8s linear infinite' }} /></div>;
  }

  return (
    <div>
      {isAdmin && (
        <div style={{ display: 'flex', gap: 4, marginBottom: 14, background: 'var(--kt-card)', borderRadius: 12, padding: 4, border: '1px solid var(--kt-border)', width: 'fit-content' }}>
          {[
            { id: 'active', label: 'Active' },
            { id: 'archived', label: `Archived${archivedCount > 0 ? ` (${archivedCount})` : ''}` },
          ].map(({ id, label }) => (
            <button
              key={id}
              onClick={() => setView(id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '7px 14px', borderRadius: 9, border: 'none', cursor: 'pointer',
                fontSize: 12, fontWeight: view === id ? 700 : 500, fontFamily: 'inherit',
                background: view === id ? '#2d6a4f' : 'transparent',
                color: view === id ? '#fff' : 'var(--kt-text-secondary)',
                transition: 'background 0.15s, color 0.15s',
              }}
            >
              {id === 'archived' && <Archive size={12} />} {label}
            </button>
          ))}
        </div>
      )}

      {filtered.length === 0 ? (
        <div style={{ background: 'var(--kt-card)', borderRadius: 14, border: '1px solid var(--kt-border)', padding: '48px 24px', textAlign: 'center' }}>
          <FolderOpen size={28} style={{ opacity: 0.3, marginBottom: 8 }} />
          <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--kt-text-primary)' }}>
            {isAdmin && view === 'archived' ? 'No archived cases' : 'No filed cases yet'}
          </p>
          <p style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--kt-text-secondary)' }}>
            {isAdmin && view === 'archived' ? 'Cases you archive show up here.' : 'Reports filed from the Intake tab will show up here so you can revisit them anytime.'}
          </p>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 10 }}>
          {filtered.map((c) => {
            const redFlag = isRedFlag(c);
            const intake = c.intake || {};
            return (
              <button
                key={c.id}
                onClick={() => { setSelectedId(c.id); onCaseOpened?.(c.id); }}
                style={{
                  textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit',
                  background: redFlag ? 'rgba(220,38,38,0.06)' : 'var(--kt-card)',
                  border: `1px solid ${redFlag ? 'rgba(220,38,38,0.35)' : 'var(--kt-border)'}`,
                  borderRadius: 14, padding: '14px 18px',
                  opacity: c.archived ? 0.75 : 1,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
                  {redFlag && <AlertTriangle size={14} color="#dc2626" />}
                  <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--kt-text-primary)' }}>
                    Case {c.id.slice(0, 8).toUpperCase()}
                  </span>
                  <span style={{ fontSize: 10, fontWeight: 700, background: '#e8f7ee', color: '#2d6a4f', borderRadius: 20, padding: '2px 9px' }}>
                    {CASE_STATE_LABELS[c.state] || c.state}
                  </span>
                  <EscalationBadge tier={c.escalationTier} />
                  {c.archived && (
                    <span style={{ fontSize: 10, fontWeight: 700, background: 'var(--kt-surface)', color: 'var(--kt-text-secondary)', borderRadius: 20, padding: '2px 9px', display: 'flex', alignItems: 'center', gap: 3 }}>
                      <Archive size={9} /> Archived
                    </span>
                  )}
                  <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--kt-text-secondary)' }}>
                    <Clock size={11} /> {daysInState(c)}d in state
                  </span>
                </div>
                <p style={{ margin: 0, fontSize: 12, color: 'var(--kt-text-secondary)' }}>
                  {intake.date_of_incident} · {intake.location} · {intake.complainant?.code_name} / {intake.respondent?.code_name}
                </p>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
