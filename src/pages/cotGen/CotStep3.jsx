import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCotStore, ALL_INDICATORS } from '../../store/cotStore';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../hooks/useAuth';
import { generateCotLesson } from '../../services/cotAI';
import { deductTokens, refundTokens, saveCotPlan } from '../../services/db';
import { trackEvent, trackGeneration, startTimer } from '../../services/usageTracker';
import { retryAsync } from '../../utils/retry';
import { ArrowRight, AlertCircle, CheckCircle2 } from 'lucide-react';

const KRA_COLOR = {
  'KRA 1': '#0369a1',
  'KRA 2': '#15803d',
  'KRA 3': '#9333ea',
  'KRA 4': '#b45309',
  'KRA 5': '#be123c',
};

export default function CotStep3() {
  const navigate     = useNavigate();
  const store        = useCotStore();
  const { addToast } = useToast();
  const { user, freeMode } = useAuth();

  const [generating, setGenerating] = useState(false);
  const [progress,   setProgress]   = useState(0);
  const [statusMsg,  setStatusMsg]  = useState('');
  const [genError,   setGenError]   = useState(null);
  const activeRef    = useRef(0);

  const selectedIndicators = ALL_INDICATORS.filter(ind =>
    (store.selectedIndicators || []).includes(ind.id)
  );

  async function handleGenerate() {
    if (!user?.uid || generating) return;

    setGenerating(true);
    setGenError(null);
    setProgress(5);
    setStatusMsg(freeMode ? 'Preparing…' : 'Checking tokens…');

    try {
      await deductTokens(user.uid, 'cot-lesson');
    } catch (err) {
      setGenerating(false);
      setGenError(err.message);
      return;
    }

    const genId = ++activeRef.current;
    const elapsedMs = startTimer();
    setProgress(15);
    setStatusMsg('Building your COT-optimized lesson plan…');

    let plan;
    let lastErr;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        plan = await generateCotLesson({
          teacherName:          store.teacherName,
          school:               store.school,
          subject:              store.subject,
          grade:                store.grade,
          quarter:              store.quarter,
          topic:                store.topic,
          melc:                 store.melc,
          materials:            store.materials,
          objectives:           store.objectives,
          contentStandards:     store.contentStandards     || '',
          performanceStandards: store.performanceStandards || '',
          selectedIndicators,
          isRetry: attempt > 0,
        });
        break;
      } catch (err) {
        lastErr = err;
        if (err.dailyLimit) break; // won't clear up by retrying — surface immediately
        if (attempt < 2) {
          const wait = err.status === 429
            ? Math.min((err.retryAfter || 30) * 1000, 30_000)
            : 8000 + attempt * 4000;
          setStatusMsg(`Due to high demand, generation may be slow — retrying in ${Math.round(wait / 1000)}s…`);
          await new Promise(r => setTimeout(r, wait));
          setStatusMsg('Re-generating your lesson plan…');
        }
      }
    }

    if (activeRef.current !== genId) return;

    if (!plan) {
      setGenerating(false);
      setGenError(
        lastErr?.status === 429
          ? 'Rate limit reached — wait a moment then try again.'
          : (lastErr?.message || 'Generation failed. Check your connection and try again.')
      );
      trackGeneration(user.uid, 'cot', { success: false, durationMs: elapsedMs(), error: lastErr?.message });
      refundTokens(user.uid, 'cot-lesson').catch(e => console.error('Token refund failed:', e));
      return;
    }

    setProgress(85);
    setStatusMsg('Formatting COT document…');
    await new Promise(r => setTimeout(r, 400));

    store.setGeneratedPlan({ plan, planId: null });

    setStatusMsg('✓ Lesson plan generated!');
    setProgress(100);
    await new Promise(r => setTimeout(r, 500));

    navigate('/cot-gen/output');
    trackEvent(user.uid, 'cot_generated', { subject: store.subject, grade: store.grade });
    trackGeneration(user.uid, 'cot', { success: true, durationMs: elapsedMs() });

    if (user?.uid) {
      const planData = {
        teacherName:        store.teacherName,
        school:             store.school,
        subject:            store.subject,
        grade:              store.grade,
        quarter:            store.quarter,
        topic:              store.topic,
        melc:               store.melc,
        materials:          store.materials,
        teachingDate:       store.teachingDate,
        selectedIndicators: store.selectedIndicators,
        plan,
      };
      // Retried with backoff -- a dropped hotspot connection right after
      // generation is the #1 cause of COT plans that "disappear": the plan
      // never reaches Firestore, so it never shows up in My Lessons later,
      // even though generation itself succeeded.
      retryAsync(() => saveCotPlan(user.uid, planData))
        .then(docId => {
          store.setGeneratedPlan({ plan, planId: docId });
          store.setSaveStatus('saved');
        })
        .catch(err => {
          console.error('Firestore save failed after retries:', err);
          store.setSaveStatus('failed');
          addToast('Plan generated but not saved to cloud yet — download it now, then retry saving from this page.', 'warning', 6000);
        });
    }
  }

  const isDone = statusMsg.startsWith('✓');
  const accentColor = '#7c3aed';

  return (
    <div style={{ maxWidth: 680, margin: '0 auto' }}>

      {/* Phase badge */}
      <div style={{ marginBottom: 24 }}>
        <span style={{
          background: 'rgba(124,58,237,0.1)', color: accentColor,
          borderRadius: 20, padding: '4px 12px',
          fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px',
        }}>
          Step 3 — Generate
        </span>
        <h2 style={{ margin: '10px 0 6px', fontSize: 22, fontWeight: 600, color: 'var(--kt-text-primary)' }}>
          Ready to generate your PPST-aligned lesson plan
        </h2>
        <p style={{ margin: 0, fontSize: 14, color: 'var(--kt-text-secondary)', lineHeight: 1.65 }}>
          Review your selections below, then click Generate. kaTuro will build a complete PIVOT 4A lesson plan with a COT Indicator Evidence Map embedded.
        </p>
      </div>

      {/* Review cards */}
      <div className="kt-grid-2" style={{ gap: 14, marginBottom: 16 }}>

        {/* Lesson info card */}
        <div style={{ background: 'var(--kt-card)', borderRadius: 14, border: '1px solid rgba(124,58,237,0.12)', padding: '16px 18px' }}>
          <p style={{ margin: '0 0 10px', fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '1.2px' }}>
            Lesson Details
          </p>
          <p style={{ margin: '0 0 4px', fontSize: 14, fontWeight: 600, color: 'var(--kt-text-primary)' }}>
            {store.subject} · {store.grade}
          </p>
          <p style={{ margin: '0 0 4px', fontSize: 12, color: 'var(--kt-text-secondary)' }}>{store.quarter}</p>
          <p style={{ margin: '0 0 8px', fontSize: 12, color: 'var(--kt-text-secondary)', lineHeight: 1.55, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
            {store.topic}
          </p>
          {store.teacherName && (
            <span style={{ fontSize: 11, background: '#f3e8ff', color: '#7c3aed', borderRadius: 6, padding: '2px 8px', fontWeight: 600 }}>
              {store.teacherName}
            </span>
          )}
        </div>

        {/* Indicators card */}
        <div style={{ background: 'var(--kt-card)', borderRadius: 14, border: '1px solid rgba(124,58,237,0.12)', padding: '16px 18px' }}>
          <p style={{ margin: '0 0 10px', fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '1.2px' }}>
            COT Indicators
          </p>
          <div style={{ marginBottom: 8 }}>
            <span style={{ fontSize: 22, fontWeight: 700, color: accentColor }}>{selectedIndicators.length}</span>
            <span style={{ fontSize: 13, color: 'var(--kt-text-secondary)', marginLeft: 4 }}>/ 12 selected</span>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {selectedIndicators.map(ind => (
              <span key={ind.id} style={{
                fontSize: 10, fontWeight: 700,
                background: `${KRA_COLOR[ind.kra] || '#7c3aed'}18`,
                color: KRA_COLOR[ind.kra] || '#7c3aed',
                borderRadius: 6, padding: '2px 7px',
              }}>
                {ind.code}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* MELC preview */}
      {store.melc && (
        <div style={{
          background: '#fff', borderRadius: 14,
          border: '1px solid rgba(124,58,237,0.12)', padding: '14px 18px', marginBottom: 16,
        }}>
          <p style={{ margin: '0 0 4px', fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '1.2px' }}>
            MELC Competency
          </p>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--kt-text-primary)', lineHeight: 1.65 }}>
            {store.melc}
          </p>
        </div>
      )}

      {/* Generate CTA card */}
      <div style={{
        background: 'linear-gradient(135deg, #2e1065 0%, #4c1d95 50%, #6d28d9 100%)',
        borderRadius: 16, padding: '36px 32px', textAlign: 'center',
      }}>
        {!generating ? (
          <>
            {genError && (
              <div style={{
                background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.4)',
                borderRadius: 10, padding: '12px 16px', marginBottom: 20,
                display: 'flex', alignItems: 'flex-start', gap: 8, textAlign: 'left',
              }}>
                <AlertCircle size={15} color="rgba(239,68,68,0.8)" style={{ flexShrink: 0, marginTop: 1 }} />
                <p style={{ margin: 0, fontSize: 13, color: 'rgba(239,68,68,0.9)', fontWeight: 600, lineHeight: 1.65 }}>
                  {genError}
                </p>
              </div>
            )}

            <h3 style={{ margin: '0 0 8px', fontSize: 17, fontWeight: 600, color: '#fff' }}>
              Generate your COT-optimized lesson plan?
            </h3>
            <p style={{ margin: '0 0 24px', fontSize: 14, color: 'rgba(255,255,255,0.65)', lineHeight: 1.65 }}>
              kaTuro AI will generate a complete{' '}
              <strong style={{ color: '#c4b5fd' }}>PIVOT 4A / 4As lesson plan</strong> —
              Introduction, Activity, Analysis, Abstraction, Application, Assessment Rubric, Reflection, Homework,
              and a <strong style={{ color: '#c4b5fd' }}>COT Indicator Evidence Map</strong> for your IPCRF defense.
            </p>
            <button
              onClick={handleGenerate}
              style={{
                width: '100%', background: '#fff', color: '#4c1d95',
                border: 'none', borderRadius: 10, padding: '14px 32px',
                fontSize: 15, fontWeight: 600, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                transition: 'background 0.15s', fontFamily: 'inherit',
              }}
              onMouseEnter={e => e.currentTarget.style.background = '#ede9fe'}
              onMouseLeave={e => e.currentTarget.style.background = '#fff'}
            >
              Generate Now <ArrowRight size={18} />
            </button>
            <p style={{ margin: '12px 0 0', fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>
              {freeMode ? 'Generation takes 15–30 seconds' : 'Costs 3 tokens · Generation takes 15–30 seconds'}
            </p>
          </>
        ) : (
          <>
            <div style={{ height: 8, background: 'rgba(255,255,255,0.15)', borderRadius: 100, overflow: 'hidden', marginBottom: 20 }}>
              <div style={{
                height: '100%', width: `${progress}%`, borderRadius: 100,
                background: 'linear-gradient(90deg, #c4b5fd, #a78bfa)',
                transition: 'width 0.5s ease',
              }} />
            </div>
            <p style={{
              margin: '0 0 6px', fontSize: 15, fontWeight: 600, minHeight: 28,
              color: isDone ? '#c4b5fd' : '#fff', transition: 'color 0.2s',
            }}>
              {isDone && <CheckCircle2 size={16} style={{ display: 'inline', marginRight: 6 }} />}
              {statusMsg}
            </p>
            <p style={{ margin: 0, fontSize: 11, color: 'rgba(255,255,255,0.4)', fontFamily: '"DM Mono", monospace' }}>
              {progress}% complete — please wait…
            </p>
          </>
        )}
      </div>

      <div style={{ height: 24 }} />
    </div>
  );
}
