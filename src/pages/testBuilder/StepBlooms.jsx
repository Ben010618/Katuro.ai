import { useTestBuilderStore } from '../../store/testBuilderStore';
import { COGNITIVE_LEVELS, deriveKeyStage, deriveHotsFloor } from '../../config/testBuilderConfig';
import { normalizeWeights, computeHotsPct } from '../../utils/testBuilderCalc';
import { Brain, TrendingUp, CheckCircle2, AlertTriangle } from 'lucide-react';

export default function StepBlooms() {
  const store = useTestBuilderStore();
  const keyStage = deriveKeyStage(store.gradeLevel);
  const hotsFloor = keyStage ? deriveHotsFloor(keyStage) : 0;

  const weightArray = COGNITIVE_LEVELS.map((l) => store.cognitiveWeights[l.key]);
  const total = weightArray.reduce((a, b) => a + b, 0);
  const hotsPct = computeHotsPct(store.cognitiveWeights);
  const hotsOk = hotsPct >= hotsFloor;

  function handleSlider(index, value) {
    const next = normalizeWeights(weightArray, index, Number(value));
    const obj = {};
    COGNITIVE_LEVELS.forEach((l, i) => { obj[l.key] = next[i]; });
    store.setCognitiveWeights(obj);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 22, paddingBottom: 32 }}>

      <div>
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          background: 'var(--kt-green-tint)', color: 'var(--kt-green-dark)',
          borderRadius: 20, padding: '4px 12px',
          fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px',
        }}>
          <Brain size={12} /> Bloom's Taxonomy
        </span>
        <h2 style={{ margin: '10px 0 6px', fontSize: 22, fontWeight: 700, color: 'var(--kt-text-primary)' }}>
          Cognitive level distribution
        </h2>
        <p style={{ margin: 0, fontSize: 14, color: 'var(--kt-text-secondary)', lineHeight: 1.65, maxWidth: 560 }}>
          Adjust how items are weighted across the six cognitive levels. The sliders always rebalance to sum to 100%.
        </p>
      </div>

      {/* Total + HOTS badges */}
      <div style={{ display: 'flex', gap: 10 }}>
        <div style={{
          flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          background: 'var(--kt-card)', border: '1px solid var(--kt-border)', borderRadius: 12, padding: '12px 16px',
        }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--kt-text-secondary)', textTransform: 'uppercase', letterSpacing: '1px' }}>Total</span>
          <span style={{ fontSize: 20, fontWeight: 800, fontFamily: '"DM Mono", monospace', color: 'var(--kt-green-primary)' }}>{total}%</span>
        </div>

        <div style={{
          flex: 2, display: 'flex', alignItems: 'center', gap: 10,
          background: hotsOk ? 'var(--kt-green-tint)' : 'rgba(232,163,32,0.14)',
          border: `1px solid ${hotsOk ? 'rgba(45,106,79,0.25)' : 'rgba(232,163,32,0.35)'}`,
          borderRadius: 12, padding: '12px 16px',
        }}>
          {hotsOk ? <CheckCircle2 size={18} color="var(--kt-green-dark)" /> : <AlertTriangle size={18} color="#b47a10" />}
          <div style={{ flex: 1 }}>
            <p style={{ margin: 0, fontSize: 11, fontWeight: 700, color: hotsOk ? 'var(--kt-green-dark)' : '#b47a10', textTransform: 'uppercase', letterSpacing: '1px' }}>
              HOTS (Analyzing + Evaluating + Creating)
            </p>
            <p style={{ margin: '2px 0 0', fontSize: 13, fontWeight: 600, color: hotsOk ? 'var(--kt-green-dark)' : '#92400e' }}>
              {hotsPct}% {keyStage ? `· floor ${hotsFloor}%` : '· select a grade level in Setup'}
            </p>
          </div>
        </div>
      </div>

      {/* Sliders */}
      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {COGNITIVE_LEVELS.map((level, i) => (
          <div key={level.key}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--kt-text-primary)' }}>{level.label}</span>
                {level.hots && (
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', gap: 3,
                    fontSize: 9, fontWeight: 800, color: '#7c3aed', background: 'rgba(124,58,237,0.1)',
                    borderRadius: 8, padding: '2px 6px', textTransform: 'uppercase', letterSpacing: '0.5px',
                  }}>
                    <TrendingUp size={9} /> HOTS
                  </span>
                )}
              </div>
              <span style={{
                fontSize: 13, fontWeight: 800, fontFamily: '"DM Mono", monospace',
                color: 'var(--kt-green-primary)', minWidth: 40, textAlign: 'right',
              }}>
                {weightArray[i]}%
              </span>
            </div>
            <input
              type="range" min={0} max={100} step={1}
              value={weightArray[i]}
              onChange={(e) => handleSlider(i, e.target.value)}
              aria-label={`${level.label} weight`}
              style={{ width: '100%', accentColor: 'var(--kt-green-primary)', cursor: 'pointer' }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
