// Horizontal, alternating-label timeline for a case's state history — a
// graphical alternative to a plain chronological list so a CPC member can
// track a case's progress at a glance. Every entry gets an equal, shrinking
// share of the available width (flex: 1 1 0, min-width: 0) instead of a
// fixed per-item width — so the whole history always fits in one screen
// without a horizontal scrollbar, no matter how many states a case has
// passed through. Detail density (font size, date format, note visibility)
// scales down automatically as more entries are packed in. Color is used
// for meaning, not decoration: brand green marks an actual state
// transition, gray marks an administrative note (archive/restore).
import { CASE_STATE_LABELS } from '../types';

const GREEN = '#2d6a4f';

function scaleFor(count) {
  if (count <= 4) return { label: 11.5, date: 10, note: 10.5, showNote: true, shortDate: false };
  if (count <= 6) return { label: 10.5, date: 9.5, note: 9.5, showNote: true, shortDate: true };
  if (count <= 8) return { label: 9.5, date: 8.5, note: 0, showNote: false, shortDate: true };
  return { label: 8.5, date: 8, note: 0, showNote: false, shortDate: true };
}

function ts(iso, short) {
  if (!iso) return '';
  const d = new Date(iso);
  return short
    ? d.toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    : d.toLocaleString('en-PH', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function LabelBlock({ entry, align, scale }) {
  const label = entry.state ? (CASE_STATE_LABELS[entry.state] || entry.state)
    : (entry.note?.toLowerCase().includes('restor') ? 'Restored' : 'Archived');
  return (
    <div
      title={entry.note || label}
      style={{ textAlign: 'center', padding: align === 'top' ? '0 2px 8px' : '8px 2px 0' }}
    >
      <div style={{ fontSize: scale.label, fontWeight: 700, color: 'var(--kt-text-primary)', lineHeight: 1.25 }}>{label}</div>
      <div style={{ fontSize: scale.date, color: 'var(--kt-text-secondary)', marginTop: 2 }}>{ts(entry.at, scale.shortDate)}</div>
      {scale.showNote && entry.note && entry.state && (
        <div style={{ fontSize: scale.note, color: 'var(--kt-text-secondary)', marginTop: 3, lineHeight: 1.35 }}>{entry.note}</div>
      )}
    </div>
  );
}

export default function CaseTimeline({ timeline }) {
  const entries = timeline || [];

  if (entries.length === 0) {
    return <p style={{ margin: 0, fontSize: 12, color: 'var(--kt-text-secondary)' }}>No timeline entries yet.</p>;
  }

  const scale = scaleFor(entries.length);

  return (
    <div style={{ position: 'relative', display: 'flex', width: '100%', minWidth: 0, padding: '0 8px', boxSizing: 'border-box' }}>
      {/* Connecting line, drawn behind the dots, spanning the row */}
      <div style={{
        position: 'absolute', left: 8, right: 8, top: '50%', height: 2,
        background: 'var(--kt-border)', transform: 'translateY(-50%)', zIndex: 0,
      }} />

      {entries.map((entry, i) => {
        const above = i % 2 === 0;
        const isNote = !entry.state;
        const dotColor = isNote ? 'var(--kt-text-secondary)' : GREEN;
        return (
          <div key={i} style={{ flex: '1 1 0', minWidth: 0, position: 'relative', display: 'flex', flexDirection: 'column', justifyContent: 'center', zIndex: 1 }}>
            <div style={{ visibility: above ? 'visible' : 'hidden' }}>
              <LabelBlock entry={entry} align="top" scale={scale} />
            </div>

            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <span
                style={{
                  width: 12, height: 12, borderRadius: '50%',
                  background: dotColor, border: '2.5px solid var(--kt-card)',
                  boxShadow: `0 0 0 1.5px ${dotColor}`,
                  flexShrink: 0,
                }}
              />
            </div>

            <div style={{ visibility: above ? 'hidden' : 'visible' }}>
              <LabelBlock entry={entry} align="bottom" scale={scale} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
