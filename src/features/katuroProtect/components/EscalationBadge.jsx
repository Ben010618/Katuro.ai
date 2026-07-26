// Escalation tier lives on the CASE, never on a learner profile — BrainBank
// Part L1 is explicit that no badge/label may attach to a child ("delinquent",
// "repeat offender", etc.). This renders case.escalationTier only.

const TIER_STYLE = {
  T1_first:  { bg: '#d8f3dc', color: '#1a3d2b', label: 'T1 · First Incident' },
  T2_repeat: { bg: '#fef9e7', color: '#d97706', label: 'T2 · Repeat' },
  T3_pattern:{ bg: 'rgba(224,92,92,0.12)', color: '#c0392b', label: 'T3 · Pattern' },
  T_RED:     { bg: '#dc2626', color: '#fff', label: 'T-RED · Emergency Protocol' },
};

export default function EscalationBadge({ tier }) {
  const style = TIER_STYLE[tier] || TIER_STYLE.T1_first;
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, borderRadius: 20, padding: '2px 9px',
      background: style.bg, color: style.color, whiteSpace: 'nowrap',
    }}>
      {style.label}
    </span>
  );
}
