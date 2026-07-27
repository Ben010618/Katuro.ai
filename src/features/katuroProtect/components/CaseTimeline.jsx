// Horizontal, alternating-label timeline for a case's state history — a
// graphical alternative to a plain chronological list so a CPC member can
// track a case's progress at a glance. Color is used for meaning, not
// decoration: brand green marks an actual state transition, gray marks an
// administrative note (archive/restore) that isn't a step forward. Scrolls
// horizontally instead of compressing when a case has many entries, so
// labels never overlap or get cut off.
import { CASE_STATE_LABELS } from '../types';

const GREEN = '#2d6a4f';
const ITEM_W = 168;

function ts(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleString('en-PH', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function LabelBlock({ entry, align }) {
  return (
    <div style={{ textAlign: 'center', padding: align === 'top' ? '0 4px 8px' : '8px 4px 0' }}>
      <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--kt-text-primary)' }}>
        {entry.state ? (CASE_STATE_LABELS[entry.state] || entry.state) : (entry.note?.toLowerCase().includes('restor') ? 'Restored' : 'Archived')}
      </div>
      <div style={{ fontSize: 10, color: 'var(--kt-text-secondary)', marginTop: 2 }}>{ts(entry.at)}</div>
      {entry.note && entry.state && (
        <div style={{ fontSize: 10.5, color: 'var(--kt-text-secondary)', marginTop: 3, lineHeight: 1.4 }}>{entry.note}</div>
      )}
    </div>
  );
}

export default function CaseTimeline({ timeline }) {
  const entries = timeline || [];

  if (entries.length === 0) {
    return <p style={{ margin: 0, fontSize: 12, color: 'var(--kt-text-secondary)' }}>No timeline entries yet.</p>;
  }

  return (
    <div style={{ overflowX: 'auto', paddingBottom: 4 }}>
      <div style={{ position: 'relative', display: 'flex', minWidth: 'fit-content', padding: '0 24px' }}>
        {/* Connecting line, drawn behind the dots, spanning the full scrollable width */}
        <div style={{
          position: 'absolute', left: 24, right: 24, top: '50%', height: 2,
          background: 'var(--kt-border)', transform: 'translateY(-50%)', zIndex: 0,
        }} />

        {entries.map((entry, i) => {
          const above = i % 2 === 0;
          const isNote = !entry.state;
          const dotColor = isNote ? 'var(--kt-text-secondary)' : GREEN;
          return (
            <div key={i} style={{ flex: `0 0 ${ITEM_W}px`, position: 'relative', display: 'flex', flexDirection: 'column', justifyContent: 'center', zIndex: 1 }}>
              <div style={{ visibility: above ? 'visible' : 'hidden' }}>
                <LabelBlock entry={entry} align="top" />
              </div>

              <div style={{ display: 'flex', justifyContent: 'center' }}>
                <span
                  title={entry.note || (entry.state ? CASE_STATE_LABELS[entry.state] : '')}
                  style={{
                    width: 13, height: 13, borderRadius: '50%',
                    background: dotColor, border: '2.5px solid var(--kt-card)',
                    boxShadow: `0 0 0 1.5px ${dotColor}`,
                    flexShrink: 0,
                  }}
                />
              </div>

              <div style={{ visibility: above ? 'hidden' : 'visible' }}>
                <LabelBlock entry={entry} align="bottom" />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
