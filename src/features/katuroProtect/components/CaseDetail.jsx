import { useState } from 'react';
import { ArrowLeft, Clock, AlertCircle, Loader2, Archive, ArchiveRestore } from 'lucide-react';
import { useAuth } from '../../../hooks/useAuth';
import { advanceCaseState, allowedNextStates, archiveCase, unarchiveCase } from '../services/caseService';
import { CASE_STATE_LABELS } from '../types';
import NextMoveCard from './NextMoveCard';
import EscalationBadge from './EscalationBadge';

const btnSecondary = { background: 'var(--kt-surface)', color: '#1a3d2b', border: '1px solid rgba(45,106,79,0.2)', borderRadius: 8, padding: '8px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 5 };

function ts(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function CaseDetail({ caseData, referralContacts, onBack, backLabel = 'Back to Case Board' }) {
  const { user, isAdmin } = useAuth();
  const [advancing, setAdvancing] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [error, setError] = useState('');

  const nextStates = allowedNextStates(caseData.state);

  async function handleAdvance(nextState) {
    setAdvancing(true);
    setError('');
    try {
      await advanceCaseState(caseData.id, caseData.state, nextState, '', user?.uid);
    } catch (e) {
      setError(e.message || 'Could not update the case state.');
    } finally {
      setAdvancing(false);
    }
  }

  async function handleArchiveToggle() {
    setArchiving(true);
    setError('');
    try {
      if (caseData.archived) await unarchiveCase(caseData.id, user?.uid);
      else await archiveCase(caseData.id, user?.uid);
    } catch (e) {
      setError(e.message || 'Could not update the archive status.');
    } finally {
      setArchiving(false);
    }
  }

  const intake = caseData.intake || {};

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <button onClick={onBack} style={btnSecondary}>
          <ArrowLeft size={13} /> {backLabel}
        </button>
        {isAdmin && (
          <button onClick={handleArchiveToggle} disabled={archiving} style={{ ...btnSecondary, opacity: archiving ? 0.6 : 1 }}>
            {archiving
              ? <Loader2 size={13} style={{ animation: 'kt-spin 0.8s linear infinite' }} />
              : caseData.archived ? <ArchiveRestore size={13} /> : <Archive size={13} />}
            {caseData.archived ? 'Restore from Archive' : 'Archive Case'}
          </button>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4, flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: 'var(--kt-text-primary)' }}>
          Case {caseData.id.slice(0, 8).toUpperCase()}
        </h2>
        <span style={{ fontSize: 11, fontWeight: 700, background: '#e8f7ee', color: '#2d6a4f', borderRadius: 20, padding: '2px 9px' }}>
          {CASE_STATE_LABELS[caseData.state] || caseData.state}
        </span>
        <EscalationBadge tier={caseData.escalationTier} />
        {caseData.archived && (
          <span style={{ fontSize: 11, fontWeight: 700, background: 'var(--kt-surface)', color: 'var(--kt-text-secondary)', borderRadius: 20, padding: '2px 9px', display: 'flex', alignItems: 'center', gap: 4 }}>
            <Archive size={10} /> Archived
          </span>
        )}
      </div>
      <p style={{ margin: '0 0 20px', fontSize: 12, color: 'var(--kt-text-secondary)' }}>
        {intake.date_of_incident} · {intake.location} · Complainant {intake.complainant?.code_name} / Respondent {intake.respondent?.code_name}
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 18, alignItems: 'start' }}>
        <div style={{ display: 'grid', gap: 14 }}>
          <div style={{ background: 'var(--kt-card)', border: '1px solid var(--kt-border)', borderRadius: 14, padding: '16px 18px' }}>
            <h4 style={{ margin: '0 0 8px', fontSize: 12, fontWeight: 700, color: 'var(--kt-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Narrative</h4>
            <p style={{ margin: 0, fontSize: 13, color: 'var(--kt-text-primary)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{intake.incident_narrative || '—'}</p>
            <p style={{ margin: '10px 0 0', fontSize: 11, color: 'var(--kt-text-secondary)' }}>
              Modality: {(intake.modality || []).join(', ') || '—'} · Evidence: {(intake.evidence || []).join(', ') || 'none listed'}
            </p>
          </div>

          <div style={{ background: 'var(--kt-card)', border: '1px solid var(--kt-border)', borderRadius: 14, padding: '16px 18px' }}>
            <h4 style={{ margin: '0 0 10px', fontSize: 12, fontWeight: 700, color: 'var(--kt-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'flex', alignItems: 'center', gap: 6 }}>
              <Clock size={12} /> Timeline
            </h4>
            {(caseData.timeline || []).map((entry, i) => (
              <div key={i} style={{ display: 'flex', gap: 10, marginBottom: 8, fontSize: 12 }}>
                <span style={{ color: 'var(--kt-text-secondary)', flexShrink: 0, width: 110 }}>{ts(entry.at)}</span>
                <span style={{ color: 'var(--kt-text-primary)' }}>
                  {entry.state && <strong>{CASE_STATE_LABELS[entry.state] || entry.state}</strong>}
                  {entry.state && entry.note ? ' — ' : ''}{!entry.state ? entry.note : ''}
                </span>
              </div>
            ))}
          </div>

          {isAdmin && nextStates.length > 0 && (
            <div style={{ background: 'var(--kt-card)', border: '1px solid var(--kt-border)', borderRadius: 14, padding: '16px 18px' }}>
              <h4 style={{ margin: '0 0 10px', fontSize: 12, fontWeight: 700, color: 'var(--kt-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Advance State</h4>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {nextStates.map((s) => (
                  <button key={s} onClick={() => handleAdvance(s)} disabled={advancing} style={{ ...btnSecondary, opacity: advancing ? 0.6 : 1 }}>
                    {advancing ? <Loader2 size={12} style={{ animation: 'kt-spin 0.8s linear infinite' }} /> : null}
                    Move to {CASE_STATE_LABELS[s] || s}
                  </button>
                ))}
              </div>
              {error && (
                <div style={{ marginTop: 10, display: 'flex', gap: 7 }}>
                  <AlertCircle size={13} color="#e05c5c" style={{ flexShrink: 0, marginTop: 1 }} />
                  <p style={{ margin: 0, fontSize: 11, color: '#c0392b' }}>{error}</p>
                </div>
              )}
            </div>
          )}
        </div>

        <NextMoveCard state={caseData.state} referralContacts={referralContacts} />
      </div>
    </div>
  );
}
