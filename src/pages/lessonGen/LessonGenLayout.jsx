import { useState, useEffect } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useLessonGenStore } from '../../store/lessonGenStore';
import { useAuth } from '../../hooks/useAuth';
import { useToast } from '../../context/ToastContext';
import { trackEvent } from '../../services/usageTracker';
import { saveIlawDraft } from '../../services/db';
import { Check, Lock, Pencil, Save } from 'lucide-react';

const STEPS = [
  { path: '/lesson-gen/step-1', label: 'Session Setup' },
  { path: '/lesson-gen/step-2', label: 'Competency' },
  { path: '/lesson-gen/step-3', label: 'Generate' },
];

const NEXT_PATHS = {
  0: '/lesson-gen/step-2',
  1: '/lesson-gen/step-3',
};

export default function LessonGenLayout() {
  const navigate  = useNavigate();
  const loc       = useLocation();
  const store     = useLessonGenStore();
  const { user }  = useAuth();
  const { addToast } = useToast();

  // 'idle' | 'saving' | 'saved' | 'error'
  const [saveState, setSaveState] = useState('idle');

  const currentIdx = STEPS.findIndex(s => loc.pathname === s.path);
  const stepNum    = currentIdx + 1;

  // Funnel tracking — which step teachers actually reach vs. where they drop off.
  useEffect(() => {
    if (!user?.uid || currentIdx < 0) return;
    trackEvent(user.uid, 'lessongen_step_viewed', { step: `step${stepNum}` });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid, currentIdx]);

  const step1Valid = !!(store.subject && store.gradeLevel && store.term && store.weekNumber && store.selectedDays.length > 0);
  const step2Valid = !!(store.unpackedSessions?.length > 0 && store.lessonName?.trim());

  function missingCount(idx) {
    if (idx === 0) {
      const fields = [store.subject, store.gradeLevel, store.term, store.weekNumber];
      let n = fields.filter(f => !f).length;
      if (store.selectedDays.length === 0) n++;
      return n;
    }
    // Bug 3 fix: Step 2 also has required fields — unpackedSessions AND lessonName
    if (idx === 1) {
      let n = 0;
      if (!store.unpackedSessions?.length) n++;
      if (!store.lessonName?.trim()) n++;
      return n;
    }
    return 0;
  }

  function isContinueEnabled() {
    if (currentIdx === 0) return step1Valid;
    if (currentIdx === 1) return step2Valid;
    return false;
  }

  // Bug 1 fix: actually save the draft to Firestore (status: 'draft').
  // Falls back gracefully — localStorage draft (Zustand persist) is still
  // intact so no data is lost even if the cloud save fails.
  async function handleSaveDraft() {
    if (!user?.uid) return;
    // Only save if there's something worth saving (at minimum a subject)
    if (!store.subject) {
      addToast('Nothing to save yet — fill in Step 1 first.', 'info');
      return;
    }
    setSaveState('saving');
    try {
      await saveIlawDraft(user.uid, {
        subject:          store.subject,
        gradeLevel:       store.gradeLevel,
        term:             store.term,
        weekNumber:       store.weekNumber,
        selectedDays:     store.selectedDays,
        competencies:     store.competencies,
        competencyText:   store.competencyText,
        content:          store.content,
        contentStandards: store.contentStandards,
        learningContext:  store.learningContext,
        lessonName:       store.lessonName,
        unpackedSessions: store.unpackedSessions,
      });
      setSaveState('saved');
      addToast('Draft saved to cloud ✓', 'success');
    } catch (err) {
      console.error('Draft save failed:', err);
      setSaveState('error');
      addToast('Cloud save failed — your draft is still saved on this device.', 'warning');
    } finally {
      setTimeout(() => setSaveState('idle'), 3000);
    }
  }

  async function handleContinue() { navigate(NEXT_PATHS[currentIdx]); }

  function handleBack() {
    if (currentIdx === 0) navigate('/lesson-gen');
    else navigate(STEPS[currentIdx - 1].path);
  }

  const showContextChip = currentIdx > 0 && store.subject;

  return (
    <div style={{ margin: '-24px', display: 'flex', flexDirection: 'column', minHeight: 'calc(100vh - 56px)' }}>

      {/* Progress bar — sticky */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 30,
        background: 'var(--kt-topbar-bg)', borderBottom: '1px solid var(--kt-border)',
        padding: '14px 24px 10px',
        boxShadow: '0 1px 2px rgba(38,33,25,0.03)',
      }}>
        {/* 3-step nodes */}
        <div style={{ display: 'flex', alignItems: 'center', maxWidth: 600, margin: '0 auto' }}>
          {STEPS.map((step, i) => {
            const done   = i < currentIdx;
            const active = i === currentIdx;
            return (
              <div key={i} style={{ display: 'flex', alignItems: 'center', flex: i < STEPS.length - 1 ? 1 : 'none' }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                  <div style={{
                    width: 30, height: 30, borderRadius: 4, flexShrink: 0,
                    display: 'grid', placeItems: 'center',
                    background: active ? 'var(--kt-manila)' : done ? 'var(--kt-chalkboard)' : 'var(--kt-card-2)',
                    color: active ? 'var(--kt-text-primary)' : done ? '#ffffff' : 'var(--kt-text-secondary)',
                    border: active ? '1px solid var(--kt-manila-border)' : done ? '1px solid var(--kt-chalkboard)' : '1px solid var(--kt-border)',
                    fontSize: 12, fontWeight: 700,
                    transition: 'all 0.2s',
                    fontFamily: 'var(--kt-font-mono)',
                  }}>
                    {done ? <Check size={14} strokeWidth={3} /> : i + 1}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                    <span style={{
                      fontSize: 11.5, fontWeight: active ? 700 : 500, whiteSpace: 'nowrap',
                      color: active ? 'var(--kt-text-primary)' : done ? 'var(--kt-chalkboard)' : 'var(--kt-text-secondary)',
                      fontFamily: active ? 'var(--kt-font-heading)' : 'var(--kt-font-ui)',
                    }}>{step.label}</span>
                    {!done && !active && <Lock size={10} color="var(--kt-muted)" />}
                  </div>
                </div>
                {i < STEPS.length - 1 && (
                  <div style={{
                    flex: 1, height: 2, margin: '-12px 8px 0',
                    background: done ? 'var(--kt-chalkboard)' : 'var(--kt-border)',
                    transition: 'background 0.3s',
                  }} />
                )}
              </div>
            );
          })}
        </div>

        {/* Step label + context chip row */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 8, maxWidth: 600, margin: '8px auto 0' }}>
          <span style={{ fontSize: 11, color: 'var(--kt-text-secondary)', fontWeight: 500 }}>
            Step {stepNum} of 3 — {STEPS[currentIdx]?.label}
          </span>

          {showContextChip && (
            <button
              onClick={() => navigate('/lesson-gen/step-1')}
              title="Edit session details"
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                background: 'var(--kt-manila)', border: '1px solid var(--kt-manila-border)', borderRadius: 'var(--kt-radius-sm)',
                padding: '3px 10px', cursor: 'pointer',
                fontSize: 11, fontWeight: 600, color: 'var(--kt-text-primary)',
                fontFamily: 'var(--kt-font-mono)',
              }}
            >
              {store.subject} {store.gradeLevel} · {store.term} · {store.weekNumber} · {store.selectedDays.length} day(s)
              <Pencil size={10} color="var(--kt-text-primary)" />
            </button>
          )}
        </div>
      </div>

      {/* Content area */}
      <div style={{ flex: 1, padding: '32px 24px 0' }}>
        <Outlet />
      </div>

      {/* Bottom sticky nav */}
      <div style={{
        position: 'sticky', bottom: 0, background: 'var(--kt-topbar-bg)',
        borderTop: '1px solid var(--kt-border)', padding: '14px 24px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: 12, zIndex: 30,
        boxShadow: '0 -1px 3px rgba(38,33,25,0.03)',
      }}>
        {/* Left */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {currentIdx > 0 && (
            <button onClick={handleBack} className="btn-outline" style={{ padding: '8px 16px', fontSize: 13 }}>
              ← Back
            </button>
          )}
          <button
            onClick={handleSaveDraft}
            disabled={saveState === 'saving'}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              background: 'none', border: 'none',
              cursor: saveState === 'saving' ? 'default' : 'pointer',
              fontSize: 12, fontWeight: 600,
              color: saveState === 'saved'
                ? 'var(--kt-success)'
                : saveState === 'error'
                  ? 'var(--kt-danger)'
                  : 'var(--kt-text-secondary)',
              transition: 'color 0.2s',
            }}
          >
            <Save size={12} />
            {saveState === 'saving' ? 'Saving…'
              : saveState === 'saved' ? 'Saved to cloud ✓'
              : saveState === 'error' ? 'Save failed'
              : 'Save draft'}
          </button>
        </div>

        {/* Center: auto-save status */}
        <div style={{ fontSize: 11, color: saveState === 'saved' ? 'var(--kt-success)' : 'var(--kt-text-secondary)', fontWeight: 600 }}>
          {saveState === 'saving' && '○ Saving…'}
          {saveState === 'saved'  && '✓ Saved'}
        </div>

        {/* Right */}
        {currentIdx < 2 ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {!isContinueEnabled() && (() => {
              const missing = missingCount(currentIdx);
              if (missing <= 0) return null;
              // Step 2: give specific hints instead of a generic count
              if (currentIdx === 1) {
                const needsUnpack = !store.unpackedSessions?.length;
                const needsName   = !store.lessonName?.trim();
                const hint = needsUnpack && needsName
                  ? 'Unpack competency and add a lesson name to continue'
                  : needsUnpack
                    ? 'Run Unpack first to continue'
                    : 'Add a lesson name to continue';
                return (
                  <span style={{ fontSize: 11, color: 'var(--kt-warning)', fontWeight: 600 }}>
                    ⚠ {hint}
                  </span>
                );
              }
              return (
                <span style={{ fontSize: 11, color: 'var(--kt-warning)', fontWeight: 600 }}>
                  ⚠ {missing} required field{missing > 1 ? 's' : ''} remaining
                </span>
              );
            })()}
            <button
              onClick={handleContinue}
              disabled={!isContinueEnabled()}
              style={{
                background: isContinueEnabled() ? 'var(--kt-chalkboard)' : 'var(--kt-card-2)',
                color: isContinueEnabled() ? '#ffffff' : 'var(--kt-muted)',
                border: isContinueEnabled() ? '1px solid var(--kt-chalkboard)' : '1px solid var(--kt-border)',
                borderRadius: 'var(--kt-radius-md)',
                cursor: isContinueEnabled() ? 'pointer' : 'not-allowed',
                padding: '10px 20px', fontSize: 13, fontWeight: 600,
                display: 'flex', alignItems: 'center', gap: 6,
                transition: 'all 0.15s',
                boxShadow: isContinueEnabled() ? '0 1px 2px rgba(31,58,46,0.15)' : 'none',
              }}
              onMouseEnter={e => { if (isContinueEnabled()) e.currentTarget.style.background = 'var(--kt-chalkboard-hover)'; }}
              onMouseLeave={e => { if (isContinueEnabled()) e.currentTarget.style.background = 'var(--kt-chalkboard)'; }}
            >
              {currentIdx === 1
                ? (isContinueEnabled() ? 'Generate Lesson Plan →' : 'Unpack your competency first')
                : 'Continue to Competency →'}
            </button>
          </div>
        ) : (
          <div />
        )}
      </div>
    </div>
  );
}
