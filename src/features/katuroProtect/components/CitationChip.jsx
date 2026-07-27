import { BookOpen } from 'lucide-react';

// Inline, clickable citation marker — e.g. renders "RA 7610" for a
// "[[RA 7610]]" citation the AI produced. Clicking it asks the parent to
// open CitationPanel with this citation so the user can see the real
// reference text it's supposedly grounded in. Shows the real law/issuance
// name only — never an internal reference-document label.
export default function CitationChip({ text, onClick }) {
  return (
    <button
      onClick={() => onClick(text)}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 3, maxWidth: 220,
        background: 'rgba(45,106,79,0.12)', color: '#2d6a4f',
        border: 'none', borderRadius: 5, padding: '1px 6px',
        fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
        verticalAlign: 'middle', margin: '0 2px',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}
      title={`View: ${text}`}
    >
      <BookOpen size={9} style={{ flexShrink: 0 }} /> {text}
    </button>
  );
}
