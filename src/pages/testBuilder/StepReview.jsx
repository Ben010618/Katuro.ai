import { useTestBuilderStore } from '../../store/testBuilderStore';
import { COGNITIVE_LEVELS, deriveKeyStage, deriveItemCeiling, deriveHotsFloor, KEY_STAGE_LABELS } from '../../config/testBuilderConfig';
import { totalDays } from '../../utils/testBuilderCalc';
import { ClipboardCheck, CheckCircle2, AlertTriangle, BadgeCheck } from 'lucide-react';

const sectionLabel = {
  margin: '0 0 12px', fontSize: 11, fontWeight: 700, color: 'var(--kt-text-secondary)',
  textTransform: 'uppercase', letterSpacing: '1.2px',
};

export default function StepReview() {
  const store = useTestBuilderStore();
  const keyStage = deriveKeyStage(store.gradeLevel);
  const itemCeiling = keyStage ? deriveItemCeiling(keyStage, store.testType) : 0;
  const hotsFloor = keyStage ? deriveHotsFloor(keyStage) : 0;
  const hotsOk = store.tos.hotsPct >= hotsFloor;
  const grandTotal = store.tos.columnTotals.reduce((a, b) => a + b, 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 22, paddingBottom: 32 }}>

      <div>
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          background: 'var(--kt-green-tint)', color: 'var(--kt-green-dark)',
          borderRadius: 20, padding: '4px 12px',
          fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px',
        }}>
          <ClipboardCheck size={12} /> Review
        </span>
        <h2 style={{ margin: '10px 0 6px', fontSize: 22, fontWeight: 700, color: 'var(--kt-text-primary)' }}>
          Review before confirming
        </h2>
        <p style={{ margin: 0, fontSize: 14, color: 'var(--kt-text-secondary)', lineHeight: 1.65, maxWidth: 560 }}>
          Everything below is traceable back to what you entered — nothing here is a black box.
        </p>
      </div>

      {/* Overview card */}
      <div className="card card-accent">
        <p style={sectionLabel}>Overview</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
          <ReviewField label="Grade Level" value={store.gradeLevel || '—'} />
          <ReviewField label="Subject" value={store.subject || '—'} />
          <ReviewField label="Test Type" value={store.testType} />
          <ReviewField label="Key Stage" value={keyStage ? KEY_STAGE_LABELS[keyStage] : '—'} />
        </div>
        <div style={{ marginTop: 14 }}>
          <ReviewField label="Terms" value={store.terms.length ? store.terms.join(', ') : '—'} />
        </div>
      </div>

      {/* Competencies card */}
      <div className="card">
        <p style={sectionLabel}>Competencies ({totalDays(store.competencies.map((c) => c.days))} / 50 days)</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {store.competencies.map((c, i) => (
            <div key={c.id} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '9px 12px', borderRadius: 9, background: 'var(--kt-card-2)',
            }}>
              <span style={{ fontSize: 13, color: 'var(--kt-text-primary)' }}>
                {c.text?.trim() || <span style={{ fontStyle: 'italic', color: 'var(--kt-muted)' }}>Untitled competency {i + 1}</span>}
              </span>
              <span style={{ fontSize: 12, fontWeight: 700, fontFamily: '"DM Mono", monospace', color: 'var(--kt-green-primary)', flexShrink: 0, marginLeft: 12 }}>
                {c.days}d
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Cognitive weights card */}
      <div className="card">
        <p style={sectionLabel}>Cognitive Weight Breakdown</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
          {COGNITIVE_LEVELS.map((l) => {
            const pct = store.cognitiveWeights[l.key] || 0;
            return (
              <div key={l.key} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--kt-text-primary)', width: 110, flexShrink: 0 }}>{l.label}</span>
                <div className="progress-track" style={{ flex: 1, height: 7 }}>
                  <div className="progress-fill" style={{
                    height: '100%', width: `${pct}%`,
                    background: l.hots ? 'linear-gradient(90deg, #7c3aed, #a78bfa)' : 'linear-gradient(90deg, #2d6a4f, #52b788)',
                  }} />
                </div>
                <span style={{ fontSize: 12, fontWeight: 800, fontFamily: '"DM Mono", monospace', color: 'var(--kt-text-secondary)', width: 34, textAlign: 'right' }}>{pct}%</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* TOS summary */}
      <div className="card">
        <p style={sectionLabel}>Table of Specifications</p>
        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ flex: 1, textAlign: 'center', background: 'var(--kt-card-2)', borderRadius: 10, padding: '12px 8px' }}>
            <p style={{ margin: 0, fontSize: 20, fontWeight: 800, fontFamily: '"DM Mono", monospace', color: 'var(--kt-green-primary)' }}>{grandTotal}</p>
            <p style={{ margin: '2px 0 0', fontSize: 10, fontWeight: 700, color: 'var(--kt-text-secondary)', textTransform: 'uppercase', letterSpacing: '1px' }}>of {itemCeiling} items</p>
          </div>
          <div style={{
            flex: 2, display: 'flex', alignItems: 'center', gap: 8, borderRadius: 10, padding: '12px 14px',
            background: hotsOk ? 'var(--kt-green-tint)' : 'rgba(232,163,32,0.14)',
          }}>
            {hotsOk ? <CheckCircle2 size={16} color="var(--kt-green-dark)" /> : <AlertTriangle size={16} color="#b47a10" />}
            <span style={{ fontSize: 12, fontWeight: 600, color: hotsOk ? 'var(--kt-green-dark)' : '#92400e' }}>
              {store.tos.hotsCount} HOTS items · {Math.round(store.tos.hotsPct)}% (floor {hotsFloor}%)
            </span>
          </div>
        </div>
      </div>

      {store.status === 'tos_generated' && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, background: 'var(--kt-green-tint)',
          borderRadius: 10, padding: '10px 16px',
        }}>
          <BadgeCheck size={16} color="var(--kt-green-dark)" />
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--kt-green-dark)' }}>
            This TOS has been saved. You can confirm again to re-save any later edits.
          </span>
        </div>
      )}
    </div>
  );
}

function ReviewField({ label, value }) {
  return (
    <div>
      <p style={{ margin: '0 0 3px', fontSize: 10, fontWeight: 700, color: 'var(--kt-text-secondary)', textTransform: 'uppercase', letterSpacing: '1px' }}>{label}</p>
      <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: 'var(--kt-text-primary)' }}>{value}</p>
    </div>
  );
}
