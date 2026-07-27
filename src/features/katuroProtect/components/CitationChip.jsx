import { BookOpen } from 'lucide-react';

// Inline, clickable citation marker — e.g. renders "[A1]" for a
// "[BrainBank A1]" citation the AI produced. Clicking it asks the parent to
// open CitationPanel with this code so the user can read the real BrainBank
// text the claim is supposedly grounded in.
export default function CitationChip({ code, onClick }) {
  return (
    <button
      onClick={() => onClick(code)}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 3,
        background: 'rgba(45,106,79,0.12)', color: '#2d6a4f',
        border: 'none', borderRadius: 5, padding: '1px 6px',
        fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
        verticalAlign: 'middle', margin: '0 2px',
      }}
      title={`View BrainBank ${code}`}
    >
      <BookOpen size={9} /> {code}
    </button>
  );
}
