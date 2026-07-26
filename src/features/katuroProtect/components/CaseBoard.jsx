import { useState, useEffect } from 'react';
import { AlertTriangle, Clock, Loader2, LayoutList } from 'lucide-react';
import { subscribeCases } from '../services/caseService';
import { subscribeReferralContacts } from '../services/referralService';
import { CASE_STATE_LABELS } from '../types';
import CaseDetail from './CaseDetail';
import EscalationBadge from './EscalationBadge';

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

export default function CaseBoard({ initialCaseId, onCaseOpened }) {
  const [cases, setCases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [referralContacts, setReferralContacts] = useState({});
  // CaseBoard is conditionally rendered by the parent tab switch (mounts
  // fresh each time the Cases tab is opened), so seeding selection from the
  // prop at mount time is enough — no effect needed to keep them in sync.
  const [selectedId, setSelectedId] = useState(initialCaseId || null);

  useEffect(() => {
    const unsub = subscribeCases(
      (data) => { setCases(data); setLoading(false); },
      () => setLoading(false),
    );
    return unsub;
  }, []);

  useEffect(() => subscribeReferralContacts(setReferralContacts, () => {}), []);

  const selected = cases.find((c) => c.id === selectedId);

  if (selected) {
    return (
      <CaseDetail
        caseData={selected}
        referralContacts={referralContacts}
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
        <LayoutList size={28} style={{ opacity: 0.3, marginBottom: 8 }} />
        <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--kt-text-primary)' }}>No cases yet</p>
        <p style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--kt-text-secondary)' }}>Start one from the Intake tab.</p>
      </div>
    );
  }

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      {cases.map((c) => {
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
