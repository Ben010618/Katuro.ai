import { ArrowRight, Users, FileText, BookOpen } from 'lucide-react';
import { NEXT_MOVE_ENGINE } from '../constants/nextMoveEngine';
import { REFERRAL_OFFICES } from '../constants/referralOffices';

// Renders the Part K Next-Move Engine entry for a case's current state,
// merging in the school's real saved contacts (referralContacts, from
// referralService) wherever the state's talk-to list references an office.
// No citation chips yet — those need Layer 2 verbatim text (Phase 3/4).
export default function NextMoveCard({ state, referralContacts = {} }) {
  const move = NEXT_MOVE_ENGINE[state];
  if (!move) return null;

  const mergedContacts = (move.talkToOffices || [])
    .map((id) => {
      const office = REFERRAL_OFFICES.find((o) => o.id === id);
      const contact = referralContacts[id];
      if (!office) return null;
      return { office: office.office, name: contact?.contactName, number: contact?.contactNumber };
    })
    .filter(Boolean);

  return (
    <div style={{
      background: 'var(--kt-card)', border: '1px solid rgba(45,106,79,0.2)',
      borderRadius: 14, padding: '18px 20px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <ArrowRight size={15} color="#2d6a4f" />
        <h4 style={{ margin: 0, fontSize: 13, fontWeight: 700, color: 'var(--kt-text-primary)' }}>Next Move</h4>
      </div>

      <p style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--kt-text-primary)', lineHeight: 1.5 }}>{move.action}</p>

      <div style={{ display: 'grid', gap: 10, fontSize: 12 }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <Users size={13} color="#9bb8a5" style={{ flexShrink: 0, marginTop: 1 }} />
          <div>
            <span style={{ fontWeight: 700, color: 'var(--kt-text-primary)' }}>{move.responsible}</span>
            <span style={{ color: 'var(--kt-text-secondary)' }}> → {move.talkTo}</span>
          </div>
        </div>

        {mergedContacts.length > 0 && (
          <div style={{ paddingLeft: 21, display: 'grid', gap: 4 }}>
            {mergedContacts.map((c) => (
              <p key={c.office} style={{ margin: 0, fontSize: 11, color: 'var(--kt-text-secondary)' }}>
                {c.office}: {c.name || c.number
                  ? `${c.name || ''}${c.name && c.number ? ' · ' : ''}${c.number || ''}`
                  : <span style={{ fontStyle: 'italic' }}>no contact saved — add in Settings</span>}
              </p>
            ))}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8 }}>
          <FileText size={13} color="#9bb8a5" style={{ flexShrink: 0, marginTop: 1 }} />
          <span style={{ color: 'var(--kt-text-secondary)' }}>{move.form}</span>
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <BookOpen size={13} color="#9bb8a5" style={{ flexShrink: 0, marginTop: 1 }} />
          <span style={{ color: 'var(--kt-text-secondary)', fontStyle: 'italic' }}>{move.governingSource}</span>
        </div>
      </div>
    </div>
  );
}
