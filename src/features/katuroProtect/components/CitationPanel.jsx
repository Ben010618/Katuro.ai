import { X, BookOpen, AlertTriangle } from 'lucide-react';
import { lookupCitation } from '../services/citationLookup';

// Shows the REAL reference text behind a citation — sourced directly from
// the bundled reference document, never from the model's own words, and
// never naming that document to the user. If the citation doesn't actually
// match anything in it, that's surfaced as "could not verify" rather than
// hidden — an unverifiable citation is a signal worth showing, not
// smoothing over.
export default function CitationPanel({ citation, onClose }) {
  const result = lookupCitation(citation);

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 700,
        background: 'rgba(13,34,24,0.5)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--kt-card)', borderRadius: 14, border: '1px solid var(--kt-border)',
          width: '100%', maxWidth: 560, maxHeight: '80vh', overflowY: 'auto',
          padding: '20px 22px', boxShadow: '0 20px 60px rgba(13,34,24,0.25)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <BookOpen size={16} color="#2d6a4f" />
            <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--kt-text-primary)' }}>
              {result ? result.heading : citation}
            </h3>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--kt-text-secondary)', padding: 4, flexShrink: 0 }}>
            <X size={16} />
          </button>
        </div>

        {result ? (
          <p style={{ margin: 0, fontSize: 13, color: 'var(--kt-text-primary)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
            {result.body}
          </p>
        ) : (
          <div style={{ display: 'flex', gap: 8, background: 'rgba(224,92,92,0.08)', border: '1px solid rgba(224,92,92,0.25)', borderRadius: 8, padding: '10px 12px' }}>
            <AlertTriangle size={14} color="#e05c5c" style={{ flexShrink: 0, marginTop: 1 }} />
            <p style={{ margin: 0, fontSize: 12, color: '#c0392b' }}>
              Could not verify "{citation}" against the reference material. Treat the claim it was attached to with caution.
            </p>
          </div>
        )}

        <p style={{ margin: '14px 0 0', fontSize: 10, color: 'var(--kt-text-secondary)', fontStyle: 'italic' }}>
          Internal summary reference — not the verbatim law. Verify against the official source before acting.
        </p>
      </div>
    </div>
  );
}
