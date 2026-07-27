import { useState, useEffect } from 'react';
import { Clock, Loader2, FolderOpen } from 'lucide-react';
import { useAuth } from '../../../hooks/useAuth';
import { subscribeMyCases } from '../services/caseService';
import { subscribeReferralContacts } from '../services/referralService';
import { CASE_STATE_LABELS } from '../types';
import CaseDetail from './CaseDetail';
import EscalationBadge from './EscalationBadge';

// Personal view of cases the current user filed themselves — open to every
// teacher, not just admins (Firestore rules only let a non-admin read a case
// where createdBy matches their own uid, so this can never show anyone
// else's report). Read-only: state advancement and archiving stay
// admin/CPC actions, gated inside CaseDetail itself.
function daysInState(caseData) {
  const timeline = caseData.timeline || [];
  const last = timeline[timeline.length - 1];
  if (!last?.at) return 0;
  return Math.floor((Date.now() - new Date(last.at).getTime()) / 86400000);
}

export default function FiledCases({ initialCaseId, onCaseOpened }) {
  const { user } = useAuth();
  const [cases, setCases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [referralContacts, setReferralContacts] = useState({});
  const [selectedId, setSelectedId] = useState(initialCaseId || null);

  useEffect(() => {
    // The whole page sits behind ProtectedRoute, so user is always present
    // in practice by the time this renders — this guard just avoids
    // subscribing with an undefined uid during the very first tick.
    if (!user?.uid) return undefined;
    const unsub = subscribeMyCases(
      user.uid,
      (data) => { setCases(data); setLoading(false); },
      () => setLoading(false),
    );
    return unsub;
  }, [user?.uid]);

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

  if (loading) {
    return <div style={{ textAlign: 'center', padding: 40 }}><Loader2 size={20} style={{ animation: 'kt-spin 0.8s linear infinite' }} /></div>;
  }

  if (cases.length === 0) {
    return (
      <div style={{ background: 'var(--kt-card)', borderRadius: 14, border: '1px solid var(--kt-border)', padding: '48px 24px', textAlign: 'center' }}>
        <FolderOpen size={28} style={{ opacity: 0.3, marginBottom: 8 }} />
        <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--kt-text-primary)' }}>No filed cases yet</p>
        <p style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--kt-text-secondary)' }}>Reports you submit from the Intake tab will show up here so you can revisit them anytime.</p>
      </div>
    );
  }

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      {cases.map((c) => {
        const intake = c.intake || {};
        return (
          <button
            key={c.id}
            onClick={() => { setSelectedId(c.id); onCaseOpened?.(c.id); }}
            style={{
              textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit',
              background: 'var(--kt-card)', border: '1px solid var(--kt-border)',
              borderRadius: 14, padding: '14px 18px',
              opacity: c.archived ? 0.75 : 1,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--kt-text-primary)' }}>
                Case {c.id.slice(0, 8).toUpperCase()}
              </span>
              <span style={{ fontSize: 10, fontWeight: 700, background: '#e8f7ee', color: '#2d6a4f', borderRadius: 20, padding: '2px 9px' }}>
                {CASE_STATE_LABELS[c.state] || c.state}
              </span>
              <EscalationBadge tier={c.escalationTier} />
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
  );
}
