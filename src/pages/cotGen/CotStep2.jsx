import { useCotStore, ALL_INDICATORS } from '../../store/cotStore';
import { Check } from 'lucide-react';

const KRA_META = {
  'KRA 1': { label: 'KRA 1 — Content Knowledge & Pedagogy', color: '#0369a1', bg: '#e0f2fe' },
  'KRA 2': { label: 'KRA 2 — Learning Environment',          color: '#15803d', bg: '#dcfce7' },
  'KRA 3': { label: 'KRA 3 — Diversity of Learners',         color: '#9333ea', bg: '#f3e8ff' },
  'KRA 4': { label: 'KRA 4 — Curriculum & Planning',         color: '#b45309', bg: '#fef3c7' },
  'KRA 5': { label: 'KRA 5 — Assessment & Reporting',        color: '#be123c', bg: '#ffe4e6' },
};

const GROUPED = Object.entries(
  ALL_INDICATORS.reduce((acc, ind) => {
    if (!acc[ind.kra]) acc[ind.kra] = [];
    acc[ind.kra].push(ind);
    return acc;
  }, {})
);

export default function CotStep2() {
  const store    = useCotStore();
  const selected = new Set(store.selectedIndicators);

  function toggle(id) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    store.setSelectedIndicators([...next]);
  }

  function selectAll()   { store.setSelectedIndicators(ALL_INDICATORS.map(i => i.id)); }
  function deselectAll() { store.setSelectedIndicators([]); }

  const count = selected.size;

  return (
    <div style={{ maxWidth: 760, margin: '0 auto' }}>

      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <span style={{
          background: 'rgba(124,58,237,0.1)', color: '#7c3aed',
          borderRadius: 20, padding: '4px 12px',
          fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px',
        }}>
          Step 2 — COT Indicators
        </span>
        <h2 style={{ margin: '10px 0 4px', fontSize: 22, fontWeight: 600, color: 'var(--kt-text-primary)' }}>
          Which PPST indicators should this lesson address?
        </h2>
        <p style={{ margin: 0, fontSize: 14, color: 'var(--kt-text-secondary)', lineHeight: 1.65 }}>
          All 12 standard observable indicators are pre-selected. Deselect any that don't apply to your observation context. The AI will embed visible evidence of each selected indicator into the lesson.
        </p>
      </div>

      {/* Selection controls + counter */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 20, background: 'var(--kt-card)',
        border: '1px solid rgba(124,58,237,0.15)', borderRadius: 12, padding: '12px 18px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            background: count === 12 ? '#7c3aed' : 'rgba(124,58,237,0.1)',
            color: count === 12 ? '#fff' : '#7c3aed',
            borderRadius: 20, padding: '4px 14px',
            fontSize: 13, fontWeight: 700,
          }}>
            {count} / 12 selected
          </div>
          {count < 12 && (
            <span style={{ fontSize: 12, color: '#9ca3af' }}>
              ({12 - count} indicator{12 - count !== 1 ? 's' : ''} deselected)
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={selectAll}
            style={{
              background: 'none', border: '1px solid rgba(124,58,237,0.3)',
              borderRadius: 8, padding: '6px 14px', cursor: 'pointer',
              fontSize: 12, fontWeight: 600, color: '#7c3aed',
            }}
          >
            Select All
          </button>
          <button
            onClick={deselectAll}
            style={{
              background: 'none', border: '1px solid rgba(0,0,0,0.1)',
              borderRadius: 8, padding: '6px 14px', cursor: 'pointer',
              fontSize: 12, fontWeight: 600, color: '#6b7280',
            }}
          >
            Clear All
          </button>
        </div>
      </div>

      {/* Indicators by KRA */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {GROUPED.map(([kra, indicators]) => {
          const meta = KRA_META[kra] || { label: kra, color: '#4a6357', bg: '#f0fdf4' };
          return (
            <div key={kra}>
              {/* KRA header */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8,
                marginBottom: 12,
              }}>
                <div style={{
                  background: meta.bg, color: meta.color,
                  borderRadius: 8, padding: '4px 12px',
                  fontSize: 12, fontWeight: 700,
                }}>
                  {meta.label}
                </div>
                <div style={{ flex: 1, height: 1, background: 'rgba(0,0,0,0.06)' }} />
              </div>

              {/* Indicator chips */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {indicators.map(ind => {
                  const on = selected.has(ind.id);
                  return (
                    <button
                      key={ind.id}
                      onClick={() => toggle(ind.id)}
                      style={{
                        display: 'flex', alignItems: 'flex-start', gap: 12,
                        textAlign: 'left',
                        background: on ? meta.bg : 'var(--kt-card)',
                        border: `2px solid ${on ? meta.color : 'rgba(0,0,0,0.08)'}`,
                        borderRadius: 12, padding: '12px 14px',
                        cursor: 'pointer', transition: 'all 0.15s',
                      }}
                    >
                      {/* Checkbox */}
                      <div style={{
                        width: 20, height: 20, borderRadius: 6, flexShrink: 0, marginTop: 1,
                        background: on ? meta.color : 'var(--kt-card)',
                        border: `2px solid ${on ? meta.color : 'rgba(0,0,0,0.2)'}`,
                        display: 'grid', placeItems: 'center',
                        transition: 'all 0.15s',
                      }}>
                        {on && <Check size={12} color="#fff" strokeWidth={3} />}
                      </div>

                      {/* Label + desc */}
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                          <span style={{
                            background: on ? meta.color : 'rgba(0,0,0,0.08)',
                            color: on ? '#fff' : '#374151',
                            borderRadius: 6, padding: '2px 8px',
                            fontSize: 11, fontWeight: 700,
                          }}>
                            {ind.code}
                          </span>
                          <span style={{ fontSize: 11, color: '#9ca3af', fontWeight: 500 }}>
                            Indicator {ind.num}
                          </span>
                        </div>
                        <p style={{
                          margin: 0, fontSize: 13, lineHeight: 1.55,
                          color: on ? '#1a0a3d' : '#374151',
                          fontWeight: on ? 500 : 400,
                        }}>
                          {ind.description}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Bottom summary */}
      {count > 0 && (
        <div style={{
          marginTop: 24, background: 'rgba(124,58,237,0.04)',
          border: '1px solid rgba(124,58,237,0.15)',
          borderRadius: 12, padding: '14px 18px',
        }}>
          <p style={{ margin: 0, fontSize: 13, color: '#5b21b6', lineHeight: 1.65 }}>
            <strong>✓ {count} indicator{count !== 1 ? 's' : ''} selected</strong> — The AI will embed visible evidence of each into the lesson plan and generate a COT Indicator Evidence Map for your IPCRF defense.
          </p>
        </div>
      )}

      <div style={{ height: 24 }} />
    </div>
  );
}
