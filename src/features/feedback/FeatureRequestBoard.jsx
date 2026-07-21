import { useState, useEffect } from 'react';
import { collection, query, orderBy, onSnapshot } from 'firebase/firestore';
import { Lightbulb, Loader2 } from 'lucide-react';
import { db } from '../../firebase';

const FILTERS = ['All', 'Approved', 'In Progress', 'Added'];

const STATUS_COLORS = {
  Approved:      { bg: 'rgba(45,106,79,0.1)',   text: '#2d6a4f' },
  'In Progress': { bg: 'rgba(217,119,6,0.1)',   text: '#d97706' },
  Added:         { bg: 'rgba(23,119,242,0.1)',  text: '#1877f2' },
};

function ts(t) {
  if (!t) return '';
  const d = t.toDate ? t.toDate() : new Date(t);
  return d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function FeatureRequestBoard() {
  const [items,   setItems]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter,  setFilter]  = useState('All');

  useEffect(() => {
    const unsub = onSnapshot(
      query(collection(db, 'feature_requests'), orderBy('createdAt', 'desc')),
      (snap) => {
        setItems(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setLoading(false);
      },
      () => setLoading(false),
    );
    return unsub;
  }, []);

  const sorted = [...items].sort((a, b) => {
    const aHas = a.order !== null && a.order !== undefined;
    const bHas = b.order !== null && b.order !== undefined;
    if (aHas && bHas) return a.order - b.order;
    if (aHas) return -1;
    if (bHas) return 1;
    return 0; // already newest-first from the query
  });

  const filtered = filter === 'All' ? sorted : sorted.filter((i) => i.status === filter);

  return (
    <div style={{ maxWidth: 720, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
        <Lightbulb size={20} color="#2d6a4f" />
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: 'var(--kt-text-primary)' }}>Request Feature</h1>
      </div>
      <p style={{ margin: '0 0 18px', fontSize: 13, color: 'var(--kt-text-secondary)' }}>
        Revisions and features approved by the kaTuro team, curated from teacher suggestions.
      </p>

      <div style={{ display: 'flex', gap: 4, marginBottom: 18, background: 'var(--kt-card)', borderRadius: 12, padding: 4, border: '1px solid var(--kt-border)', width: 'fit-content' }}>
        {FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={{
              padding: '7px 14px', borderRadius: 9, border: 'none', cursor: 'pointer',
              fontSize: 12, fontWeight: filter === f ? 700 : 500, fontFamily: 'inherit',
              background: filter === f ? '#2d6a4f' : 'transparent',
              color: filter === f ? '#fff' : 'var(--kt-text-secondary)',
              transition: 'background 0.15s, color 0.15s',
            }}
          >
            {f}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40 }}><Loader2 size={20} style={{ animation: 'kt-spin 0.8s linear infinite' }} /></div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--kt-text-secondary)' }}>
          <Lightbulb size={28} style={{ opacity: 0.3, marginBottom: 8 }} />
          <p style={{ margin: 0, fontSize: 13 }}>No feature requests here yet. Got an idea? Use the suggestion button!</p>
        </div>
      ) : (
        filtered.map((item) => {
          const colors = STATUS_COLORS[item.status] || STATUS_COLORS.Approved;
          return (
            <div key={item.id} style={{
              background: 'var(--kt-card)', border: '1px solid var(--kt-border)',
              borderRadius: 14, padding: '16px 18px', marginBottom: 10,
            }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 11, fontWeight: 700, background: colors.bg, color: colors.text, borderRadius: 20, padding: '2px 10px' }}>{item.status}</span>
                {item.version && <span style={{ fontSize: 11, color: '#9bb8a5', fontFamily: '"DM Mono", monospace' }}>{item.version}</span>}
                <span style={{ fontSize: 11, color: '#9bb8a5', marginLeft: 'auto' }}>{ts(item.createdAt)}</span>
              </div>
              <h3 style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 700, color: 'var(--kt-text-primary)' }}>{item.title}</h3>
              <p style={{ margin: '0 0 8px', fontSize: 13, color: 'var(--kt-text-secondary)', lineHeight: 1.5 }}>{item.description}</p>
              <p style={{ margin: 0, fontSize: 11, color: '#9bb8a5' }}>Requested by: {item.requestedBy}</p>
            </div>
          );
        })
      )}
    </div>
  );
}
