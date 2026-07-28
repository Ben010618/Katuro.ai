import { useState } from 'react';
import { useTestBuilderStore } from '../../store/testBuilderStore';
import { useAuth } from '../../hooks/useAuth';
import { useToast } from '../../context/ToastContext';
import { COGNITIVE_LEVELS, deriveKeyStage, deriveHotsFloor } from '../../config/testBuilderConfig';
import { normalizeWeights, computeHotsPct, coerceWeightsTo100, equalDistributionWeights } from '../../utils/testBuilderCalc';
import { suggestCognitiveWeights } from '../../services/testBuilderAI';
import { deductTokens, refundTokens } from '../../services/db';
import { AI_ENABLED } from '../../services/ai';
import {
  Brain, TrendingUp, CheckCircle2, AlertTriangle,
  Sparkles, Loader2, AlertCircle, X, Check, Scale,
} from 'lucide-react';

const SUGGEST_COST = 0.5;

export default function StepBlooms() {
  const store = useTestBuilderStore();
  const { user } = useAuth();
  const { addToast } = useToast();
  const keyStage = deriveKeyStage(store.gradeLevel);
  const hotsFloor = keyStage ? deriveHotsFloor(keyStage) : 0;

  const weightArray = COGNITIVE_LEVELS.map((l) => store.cognitiveWeights[l.key]);
  const total = weightArray.reduce((a, b) => a + b, 0);
  const hotsPct = computeHotsPct(store.cognitiveWeights);
  const hotsOk = hotsPct >= hotsFloor;

  const [aiLoading,    setAiLoading]    = useState(false);
  const [aiError,      setAiError]      = useState('');
  const [aiStatus,     setAiStatus]     = useState('');
  const [aiSuggestion, setAiSuggestion] = useState(null); // { ...weights, rationale }

  const hasCompetencyText = store.competencies.some((c) => c.text?.trim());
  const canSuggest = AI_ENABLED && hasCompetencyText && !aiLoading;

  function handleSlider(index, value) {
    const next = normalizeWeights(weightArray, index, Number(value));
    const obj = {};
    COGNITIVE_LEVELS.forEach((l, i) => { obj[l.key] = next[i]; });
    store.setCognitiveWeights(obj);
  }

  async function handleSuggest() {
    if (!canSuggest || !user?.uid) return;
    setAiLoading(true);
    setAiError('');
    setAiStatus('');
    let tokensDeducted = false;
    try {
      await deductTokens(user.uid, 'test_builder_blooms_suggest', SUGGEST_COST);
      tokensDeducted = true;

      let result;
      let lastErr;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          result = await suggestCognitiveWeights({
            gradeLevel: store.gradeLevel,
            subject: store.subject,
            keyStage,
            hotsFloorPct: hotsFloor,
            competencies: store.competencies,
          }, { isRetry: attempt > 0 });
          break;
        } catch (err) {
          lastErr = err;
          console.warn(`suggestCognitiveWeights attempt ${attempt + 1} failed:`, err);
          if (err.dailyLimit) break;
          if (attempt < 2) {
            const wait = err.status === 429
              ? Math.min((err.retryAfter || 30) * 1000, 30_000)
              : 5000 + attempt * 3000;
            setAiStatus(`Due to high demand, this may be slow — retrying in ${Math.round(wait / 1000)}s…`);
            await new Promise(r => setTimeout(r, wait));
            setAiStatus('Retrying…');
          }
        }
      }
      if (!result) throw lastErr || new Error('AI suggestion failed. Please try again.');

      setAiSuggestion(result);
    } catch (err) {
      setAiError(err.message || 'AI suggestion failed. Please try again.');
      if (tokensDeducted) {
        refundTokens(user.uid, 'test_builder_blooms_suggest', SUGGEST_COST).catch(e => console.error('Token refund failed:', e));
      }
    } finally {
      setAiLoading(false);
      setAiStatus('');
    }
  }

  function handleApply() {
    if (!aiSuggestion) return;
    const coerced = coerceWeightsTo100(COGNITIVE_LEVELS.map((l) => aiSuggestion[l.key]));
    const obj = {};
    COGNITIVE_LEVELS.forEach((l, i) => { obj[l.key] = coerced[i]; });
    store.setCognitiveWeights(obj);
    setAiSuggestion(null);
    addToast('AI suggestion applied — feel free to fine-tune the sliders.', 'success');
  }

  function handleDismiss() {
    setAiSuggestion(null);
  }

  function handleEqualDistribution() {
    const equal = equalDistributionWeights(COGNITIVE_LEVELS.length);
    const obj = {};
    COGNITIVE_LEVELS.forEach((l, i) => { obj[l.key] = equal[i]; });
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

      {/* AI Assist */}
      {!aiSuggestion && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12,
          background: 'linear-gradient(135deg, rgba(124,58,237,0.06), rgba(45,106,79,0.05))',
          border: '1px solid rgba(124,58,237,0.18)', borderRadius: 12, padding: '12px 16px',
        }}>
          <div style={{
            width: 32, height: 32, borderRadius: 9, flexShrink: 0, display: 'grid', placeItems: 'center',
            background: 'linear-gradient(135deg, #7c3aed, #a78bfa)',
          }}>
            <Sparkles size={15} color="#fff" />
          </div>
          <div style={{ flex: 1 }}>
            <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: 'var(--kt-text-primary)' }}>Let AI suggest a starting distribution</p>
            <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--kt-text-secondary)' }}>
              {aiLoading && aiStatus
                ? aiStatus
                : hasCompetencyText
                  ? 'Based on your competencies — you always have the final say on the sliders.'
                  : 'Add competency text in Setup first so the AI has something to analyze.'}
            </p>
          </div>
          <button
            onClick={handleSuggest}
            disabled={!canSuggest}
            className="btn-outline"
            style={{ fontSize: 12, padding: '8px 14px', flexShrink: 0, opacity: canSuggest ? 1 : 0.5, borderColor: '#7c3aed', color: '#7c3aed' }}
          >
            {aiLoading
              ? <><Loader2 size={13} style={{ animation: 'spin 0.8s linear infinite' }} /> Analyzing…</>
              : <><Sparkles size={13} /> Suggest with AI</>}
          </button>
        </div>
      )}

      {aiError && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, background: '#fde8e8',
          borderRadius: 10, padding: '10px 14px',
        }}>
          <AlertCircle size={15} color="var(--kt-danger)" style={{ flexShrink: 0 }} />
          <span style={{ flex: 1, fontSize: 12, color: 'var(--kt-danger)', fontWeight: 600 }}>{aiError}</span>
          <button onClick={() => setAiError('')} aria-label="Dismiss error" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--kt-danger)', padding: 2 }}>
            <X size={14} />
          </button>
        </div>
      )}

      {aiSuggestion && (
        <div style={{
          background: 'linear-gradient(135deg, rgba(124,58,237,0.07), rgba(167,139,250,0.05))',
          border: '1px solid rgba(124,58,237,0.3)', borderRadius: 14, padding: '16px 18px',
        }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 12 }}>
            <div style={{
              width: 28, height: 28, borderRadius: 8, flexShrink: 0, display: 'grid', placeItems: 'center',
              background: 'linear-gradient(135deg, #7c3aed, #a78bfa)',
            }}>
              <Sparkles size={13} color="#fff" />
            </div>
            <div style={{ flex: 1 }}>
              <p style={{ margin: 0, fontSize: 12, fontWeight: 800, color: '#6d28d9', textTransform: 'uppercase', letterSpacing: '0.8px' }}>AI Suggestion</p>
              {aiSuggestion.rationale && (
                <p style={{ margin: '3px 0 0', fontSize: 13, color: 'var(--kt-text-primary)', lineHeight: 1.5 }}>{aiSuggestion.rationale}</p>
              )}
            </div>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
            {COGNITIVE_LEVELS.map((l) => (
              <div key={l.key} style={{
                display: 'flex', alignItems: 'center', gap: 6,
                background: 'var(--kt-card)', borderRadius: 9, padding: '6px 10px',
                border: l.hots ? '1px solid rgba(124,58,237,0.25)' : '1px solid var(--kt-border)',
              }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--kt-text-secondary)' }}>{l.short}</span>
                <span style={{ fontSize: 13, fontWeight: 800, fontFamily: '"DM Mono", monospace', color: l.hots ? '#6d28d9' : 'var(--kt-green-primary)' }}>
                  {aiSuggestion[l.key]}%
                </span>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={handleApply}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                background: 'linear-gradient(135deg, #7c3aed, #6d28d9)', color: '#fff',
                border: 'none', borderRadius: 9, padding: '9px 16px', fontSize: 12, fontWeight: 700,
                cursor: 'pointer', fontFamily: 'inherit',
              }}
            >
              <Check size={13} /> Apply suggestion
            </button>
            <button onClick={handleDismiss} className="btn-outline" style={{ fontSize: 12, padding: '9px 16px' }}>
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Sliders */}
      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: 'var(--kt-text-primary)' }}>Adjust levels</p>
            <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--kt-text-secondary)' }}>
              Or split all six levels evenly with Hamilton's Method (largest-remainder rounding).
            </p>
          </div>
          <button
            onClick={handleEqualDistribution}
            className="btn-outline"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, padding: '8px 14px', flexShrink: 0 }}
          >
            <Scale size={13} /> Equal Distribution
          </button>
        </div>
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
