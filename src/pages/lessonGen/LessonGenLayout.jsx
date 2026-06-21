import { useState, useCallback } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useLessonGenStore } from '../../store/lessonGenStore';
import { Check, Lock, Pencil } from 'lucide-react';

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

  const [saveState, setSaveState] = useState('idle');

  const currentIdx = STEPS.findIndex(s => loc.pathname === s.path);
  const stepNum    = currentIdx + 1;

  const step1Valid = !!(store.subject && store.gradeLevel && store.term && store.weekNumber && store.selectedDays.length > 0);
  const step2Valid = !!(store.unpackedSessions?.length > 0 && store.lessonName?.trim());

  function missingCount(idx) {
    if (idx === 0) {
      const fields = [store.subject, store.gradeLevel, store.term, store.weekNumber];
      let n = fields.filter(f => !f).length;
      if (store.selectedDays.length === 0) n++;
      return n;
    }
    return 0;
  }

  function isContinueEnabled() {
    if (currentIdx === 0) return step1Valid;
    if (currentIdx === 1) return step2Valid;
    return false;
  }

  async function handleSaveDraft() {
    setSaveState('saving');
    await new Promise(r => setTimeout(r, 700));
    setSaveState('saved');
    setTimeout(() => setSaveState('idle'), 3000);
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
        background: 'var(--kt-card)', borderBottom: '1px solid var(--kt-border)',
        padding: '14px 24px 10px',
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
                    width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
                    display: 'grid', placeItems: 'center',
                    background: done || active ? '#1a3d2b' : 'rgba(45,106,79,0.1)',
                    color: done || active ? '#fff' : '#4a6357',
                    fontSize: 12, fontWeight: 700,
                    transition: 'all 0.2s',
                  }}>
                    {done ? <Check size={14} strokeWidth={3} /> : i + 1}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                    <span style={{
                      fontSize: 11, fontWeight: active ? 700 : 500, whiteSpace: 'nowrap',
                      color: active ? '#0d2218' : done ? '#2d6a4f' : '#4a6357',
                    }}>{step.label}</span>
                    {!done && !active && <Lock size={10} color="#4a6357" />}
                  </div>
                </div>
                {i < STEPS.length - 1 && (
                  <div style={{
                    flex: 1, height: 2, margin: '-12px 8px 0',
                    background: done ? '#1a3d2b' : 'rgba(45,106,79,0.12)',
                    transition: 'background 0.3s',
                  }} />
                )}
              </div>
            );
          })}
        </div>

        {/* Step label + context chip row */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 8, maxWidth: 600, margin: '8px auto 0' }}>
          <span style={{ fontSize: 11, color: '#4a6357', fontWeight: 500 }}>
            Step {stepNum} of 3 — {STEPS[currentIdx]?.label}
          </span>

          {showContextChip && (
            <button
              onClick={() => navigate('/lesson-gen/step-1')}
              title="Edit session details"
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                background: '#d8f3dc', border: 'none', borderRadius: 20,
                padding: '3px 10px 3px 12px', cursor: 'pointer',
                fontSize: 11, fontWeight: 600, color: '#1a3d2b',
              }}
            >
              {store.subject} {store.gradeLevel} · {store.term} · {store.weekNumber} · {store.selectedDays.length} day(s)
              <Pencil size={10} color="#2d6a4f" />
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
        position: 'sticky', bottom: 0, background: 'var(--kt-card)',
        borderTop: '1px solid var(--kt-border)', padding: '14px 24px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: 12, zIndex: 30,
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
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              fontSize: 12, color: '#4a6357', fontWeight: 600,
            }}
          >
            Save draft
          </button>
        </div>

        {/* Center: auto-save status */}
        <div style={{ fontSize: 11, color: saveState === 'saved' ? '#2d6a4f' : '#4a6357', fontWeight: 600 }}>
          {saveState === 'saving' && '○ Saving…'}
          {saveState === 'saved'  && '✓ Saved'}
        </div>

        {/* Right */}
        {currentIdx < 2 ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {!isContinueEnabled() && missingCount(currentIdx) > 0 && (
              <span style={{ fontSize: 11, color: '#e8a320', fontWeight: 600 }}>
                ⚠ {missingCount(currentIdx)} required field{missingCount(currentIdx) > 1 ? 's' : ''} remaining
              </span>
            )}
            <button
              onClick={handleContinue}
              disabled={!isContinueEnabled()}
              style={{
                background: isContinueEnabled() ? '#1a3d2b' : 'rgba(45,106,79,0.1)',
                color: isContinueEnabled() ? '#fff' : '#4a6357',
                border: 'none', borderRadius: 10,
                cursor: isContinueEnabled() ? 'pointer' : 'not-allowed',
                padding: '10px 20px', fontSize: 13, fontWeight: 600,
                display: 'flex', alignItems: 'center', gap: 6,
                transition: 'all 0.15s',
              }}
              onMouseEnter={e => { if (isContinueEnabled()) e.currentTarget.style.background = '#2d6a4f'; }}
              onMouseLeave={e => { if (isContinueEnabled()) e.currentTarget.style.background = '#1a3d2b'; }}
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
