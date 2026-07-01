import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { useToast } from '../../context/ToastContext';
import { useTestBuilderStore } from '../../store/testBuilderStore';
import { useDebouncedEffect } from '../../hooks/useDebouncedEffect';
import { createTestSession, getTestSession, updateTestSession } from '../../services/testBuilderDb';
import { deriveKeyStage, deriveItemCeiling, deriveHotsFloor, DAY_LIMIT } from '../../config/testBuilderConfig';
import { Check, Lock, Loader2, Save, ClipboardList } from 'lucide-react';

import StepSetup from './StepSetup';
import StepBlooms from './StepBlooms';
import StepTOS from './StepTOS';
import StepReview from './StepReview';

// ── Step registry ──────────────────────────────────────────────────────────
// Adding a step later = append an entry here. The shell below never branches
// on step id — it only calls whatever each entry provides.
const STEPS = [
  {
    id: 'setup', label: 'Setup', component: StepSetup,
    isValid: (s) => !!(
      s.gradeLevel && s.subject?.trim() && s.testType && s.terms?.length > 0 &&
      s.competencies?.length > 0 && s.competencies.every((c) => c.text?.trim())
    ),
    primaryLabel: () => "Continue to Bloom's Levels →",
    onPrimary: ({ goNext }) => goNext(),
  },
  {
    id: 'blooms', label: "Bloom's levels", component: StepBlooms,
    isValid: () => true,
    primaryLabel: () => 'Continue to TOS →',
    onPrimary: ({ goNext }) => goNext(),
  },
  {
    id: 'tos', label: 'TOS', component: StepTOS,
    isValid: () => true,
    primaryLabel: () => 'Continue to Review →',
    onPrimary: ({ goNext }) => goNext(),
  },
  {
    id: 'review', label: 'Review', component: StepReview,
    isValid: () => true,
    primaryLabel: () => 'Confirm and Save',
    onPrimary: async ({ store, uid, sessionId, onSessionFinalized, addToast }) => {
      await updateTestSession(uid, sessionId, {
        ...pickSessionFields(store),
        status: 'tos_generated',
      });
      store.setField('status', 'tos_generated');
      addToast('Table of Specifications saved!', 'success');
      // Phase 2 hook point — AI item generation against this TOS attaches here.
      onSessionFinalized?.(sessionId);
    },
  },
];

function pickSessionFields(store) {
  const keyStage = deriveKeyStage(store.gradeLevel);
  return {
    gradeLevel:   store.gradeLevel,
    keyStage,
    subject:      store.subject,
    testType:     store.testType,
    itemCeiling:  keyStage ? deriveItemCeiling(keyStage, store.testType) : 0,
    terms:        store.terms,
    competencies: store.competencies,
    dayLimit:     DAY_LIMIT,
    cognitiveWeights: store.cognitiveWeights,
    hotsFloorPct: keyStage ? deriveHotsFloor(keyStage) : 0,
    tos:          store.tos,
  };
}

// Phase 2 (AI item generation) will receive the finalized sessionId here —
// default is a no-op until that phase is built.
export default function TestBuilderWizard({ onSessionFinalized }) {
  const navigate     = useNavigate();
  const { user }      = useAuth();
  const { addToast }  = useToast();
  const store         = useTestBuilderStore();

  const [activeStep,   setActiveStep]   = useState(0);
  const [furthestStep, setFurthestStep] = useState(0);
  const [ready,        setReady]        = useState(false);
  const [saveState,    setSaveState]    = useState('idle'); // idle | saving | saved
  const initRef = useRef(false);

  // ── Resolve / create the Firestore session on mount ──────────────────────
  useEffect(() => {
    if (initRef.current || !user?.uid) return;
    initRef.current = true;

    (async () => {
      if (store.sessionId) {
        const existing = await getTestSession(user.uid, store.sessionId);
        if (existing) {
          store.loadSession(existing);
          setReady(true);
          return;
        }
      }
      const id = await createTestSession(user.uid, {});
      store.setField('sessionId', id);
      setReady(true);
    })();
  }, [user?.uid]);

  // ── Autosave (debounced 500ms) ────────────────────────────────────────────
  useDebouncedEffect(() => {
    if (!ready || !user?.uid || !store.sessionId) return;
    setSaveState('saving');
    updateTestSession(user.uid, store.sessionId, pickSessionFields(store))
      .then(() => setSaveState('saved'))
      .catch(() => setSaveState('idle'));
  }, [
    ready, store.gradeLevel, store.subject, store.testType, store.terms,
    JSON.stringify(store.competencies), JSON.stringify(store.cognitiveWeights), JSON.stringify(store.tos),
  ], 500);

  const step = STEPS[activeStep];
  const ActiveComponent = step.component;
  const isValid = step.isValid(store);

  function goNext() {
    const next = Math.min(activeStep + 1, STEPS.length - 1);
    setFurthestStep((f) => Math.max(f, next));
    setActiveStep(next);
  }
  function goBack() {
    if (activeStep === 0) { navigate('/dashboard'); return; }
    setActiveStep((s) => s - 1);
  }
  function goToStep(i) {
    if (i <= furthestStep) setActiveStep(i);
  }

  async function handlePrimary() {
    await step.onPrimary({
      store, goNext, goBack, uid: user?.uid, sessionId: store.sessionId,
      onSessionFinalized, addToast,
    });
  }

  if (!ready) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '50vh', gap: 12 }}>
        <Loader2 size={26} color="var(--kt-green-primary)" style={{ animation: 'spin 0.8s linear infinite' }} />
        <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: 'var(--kt-text-secondary)' }}>Preparing your Test Builder session…</p>
      </div>
    );
  }

  return (
    <div style={{ margin: '-24px', display: 'flex', flexDirection: 'column', minHeight: 'calc(100vh - 56px)' }}>

      {/* ── Progress rail — kaTuro gradient, sticky top ───────────────────── */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 30,
        background: 'linear-gradient(135deg, #0d2218 0%, #1a3d2b 55%, #2d6a4f 100%)',
        padding: '16px 24px 14px', boxShadow: '0 4px 24px rgba(13,34,24,0.22)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', maxWidth: 720, margin: '0 auto 12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{
              width: 26, height: 26, borderRadius: 8, flexShrink: 0, display: 'grid', placeItems: 'center',
              background: 'linear-gradient(135deg, #52b788, #2d6a4f)',
            }}>
              <ClipboardList size={14} color="#fff" />
            </div>
            <span style={{ fontSize: 13, fontWeight: 800, color: '#fff', letterSpacing: '0.01em' }}>Test Builder</span>
          </div>

          <div style={{
            display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 600,
            color: saveState === 'saving' ? '#e8d9a8' : 'rgba(216,243,220,0.75)',
            transition: 'color 0.2s',
          }}>
            {saveState === 'saving'
              ? <><Loader2 size={12} style={{ animation: 'spin 0.8s linear infinite' }} /> Saving…</>
              : <><Save size={12} /> Saved</>}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', maxWidth: 720, margin: '0 auto' }}>
          {STEPS.map((s, i) => {
            const done   = i < furthestStep;
            const active = i === activeStep;
            const locked = i > furthestStep;
            return (
              <div key={s.id} style={{ display: 'flex', alignItems: 'center', flex: i < STEPS.length - 1 ? 1 : 'none' }}>
                <button
                  onClick={() => goToStep(i)}
                  disabled={locked}
                  aria-label={`Go to step ${i + 1}: ${s.label}`}
                  aria-current={active ? 'step' : undefined}
                  style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5,
                    background: 'none', border: 'none', padding: 0,
                    cursor: locked ? 'default' : 'pointer', fontFamily: 'inherit',
                  }}
                >
                  <div
                    className={active ? 'animate-glow' : undefined}
                    style={{
                      width: 34, height: 34, borderRadius: '50%', flexShrink: 0,
                      display: 'grid', placeItems: 'center', fontSize: 13, fontWeight: 800,
                      background: done
                        ? 'linear-gradient(135deg, #52b788, #2d6a4f)'
                        : active
                          ? 'linear-gradient(135deg, #52b788, #2d6a4f)'
                          : 'rgba(255,255,255,0.08)',
                      color: done || active ? '#fff' : 'rgba(255,255,255,0.45)',
                      border: active ? '2px solid rgba(82,183,136,0.6)' : '2px solid transparent',
                      transition: 'all 0.25s ease',
                    }}
                  >
                    {done ? <Check size={15} strokeWidth={3} /> : locked ? <Lock size={12} /> : i + 1}
                  </div>
                  <span style={{
                    fontSize: 11, fontWeight: active ? 700 : 500, whiteSpace: 'nowrap',
                    color: active ? '#fff' : done ? 'rgba(216,243,220,0.85)' : 'rgba(255,255,255,0.4)',
                  }}>
                    {s.label}
                  </span>
                </button>
                {i < STEPS.length - 1 && (
                  <div style={{
                    flex: 1, height: 2, margin: '-16px 6px 0', borderRadius: 2,
                    background: i < furthestStep ? 'linear-gradient(90deg, #52b788, #2d6a4f)' : 'rgba(255,255,255,0.12)',
                    transition: 'background 0.3s',
                  }} />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Active step panel ─────────────────────────────────────────────── */}
      <div key={activeStep} className="animate-fade-up" style={{ flex: 1, padding: '28px 24px 0' }}>
        <div style={{ maxWidth: 720, margin: '0 auto' }}>
          <ActiveComponent />
        </div>
      </div>

      {/* ── Bottom nav — sticky ────────────────────────────────────────────── */}
      <div style={{
        position: 'sticky', bottom: 0, background: 'var(--kt-card)',
        borderTop: '1px solid var(--kt-border)', padding: '14px 24px', marginTop: 24,
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, zIndex: 30,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', maxWidth: 720 }}>
          <button onClick={goBack} className="btn-outline" style={{ padding: '9px 18px', fontSize: 13 }}>
            ← {activeStep === 0 ? 'Exit' : 'Back'}
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {!isValid && (
              <span style={{ fontSize: 11, color: 'var(--kt-accent-amber)', fontWeight: 600 }}>
                ⚠ Fill in required fields to continue
              </span>
            )}
            <button
              onClick={handlePrimary}
              disabled={!isValid}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 7,
                background: isValid ? 'linear-gradient(135deg, #2d6a4f 0%, #52b788 100%)' : 'var(--kt-green-tint)',
                color: isValid ? '#fff' : 'var(--kt-green-dark)',
                border: 'none', borderRadius: 10, padding: '10px 20px',
                fontSize: 13, fontWeight: 700, fontFamily: 'inherit',
                cursor: isValid ? 'pointer' : 'not-allowed',
                boxShadow: isValid ? '0 4px 14px rgba(45,106,79,0.35)' : 'none',
                transition: 'all 0.18s ease',
              }}
              onMouseEnter={(e) => { if (isValid) e.currentTarget.style.transform = 'translateY(-1px)'; }}
              onMouseLeave={(e) => { if (isValid) e.currentTarget.style.transform = 'translateY(0)'; }}
            >
              {step.primaryLabel(store)}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
