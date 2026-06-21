import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useCotStore } from '../../store/cotStore';
import { Check, Lock } from 'lucide-react';

const STEPS = [
  { path: '/cot-gen/step-1', label: 'Lesson Info' },
  { path: '/cot-gen/step-2', label: 'COT Indicators' },
  { path: '/cot-gen/step-3', label: 'Generate' },
];

const NEXT_PATHS = {
  0: '/cot-gen/step-2',
  1: '/cot-gen/step-3',
};

export default function CotLayout() {
  const navigate = useNavigate();
  const loc      = useLocation();
  const store    = useCotStore();

  const currentIdx = STEPS.findIndex(s => loc.pathname === s.path);
  const stepNum    = currentIdx + 1;

  const step1Valid = !!(
    store.subject?.trim() &&
    store.grade?.trim() &&
    store.quarter?.trim() &&
    store.topic?.trim() &&
    store.melc?.trim()
  );

  const step2Valid = store.selectedIndicators?.length > 0;

  function isContinueEnabled() {
    if (currentIdx === 0) return step1Valid;
    if (currentIdx === 1) return step2Valid;
    return false;
  }

  function handleContinue() { navigate(NEXT_PATHS[currentIdx]); }

  function handleBack() {
    if (currentIdx === 0) navigate('/lesson-gen');
    else navigate(STEPS[currentIdx - 1].path);
  }

  const accentColor = '#7c3aed';
  const accentLight = 'rgba(124,58,237,0.1)';

  return (
    <div style={{ margin: '-24px', display: 'flex', flexDirection: 'column', minHeight: 'calc(100vh - 56px)' }}>

      {/* Progress bar — sticky top */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 30,
        background: 'var(--kt-card)', borderBottom: '1px solid rgba(124,58,237,0.12)',
        padding: '14px 24px 10px',
      }}>
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
                    background: done || active ? accentColor : accentLight,
                    color: done || active ? '#fff' : '#7c3aed',
                    fontSize: 12, fontWeight: 700,
                    transition: 'all 0.2s',
                  }}>
                    {done ? <Check size={14} strokeWidth={3} /> : i + 1}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                    <span style={{
                      fontSize: 11, fontWeight: active ? 700 : 500, whiteSpace: 'nowrap',
                      color: active ? '#1a0a3d' : done ? accentColor : '#6b7280',
                    }}>{step.label}</span>
                    {!done && !active && <Lock size={10} color="#6b7280" />}
                  </div>
                </div>
                {i < STEPS.length - 1 && (
                  <div style={{
                    flex: 1, height: 2, margin: '-12px 8px 0',
                    background: done ? accentColor : accentLight,
                    transition: 'background 0.3s',
                  }} />
                )}
              </div>
            );
          })}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 8, maxWidth: 600, margin: '8px auto 0' }}>
          <span style={{ fontSize: 11, color: '#6b7280', fontWeight: 500 }}>
            Step {stepNum} of 3 — {STEPS[currentIdx]?.label}
          </span>
          {currentIdx > 0 && store.subject && (
            <span style={{
              background: accentLight, borderRadius: 20, padding: '3px 10px',
              fontSize: 11, fontWeight: 600, color: accentColor,
            }}>
              {store.subject} {store.grade} · {store.quarter}
            </span>
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
        borderTop: '1px solid rgba(124,58,237,0.12)', padding: '14px 24px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: 12, zIndex: 30,
      }}>
        <div>
          {currentIdx > 0 && (
            <button onClick={handleBack} className="btn-outline" style={{ padding: '8px 16px', fontSize: 13 }}>
              ← Back
            </button>
          )}
        </div>

        {currentIdx < 2 ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {!isContinueEnabled() && currentIdx === 0 && (
              <span style={{ fontSize: 11, color: '#e8a320', fontWeight: 600 }}>
                ⚠ Fill in required fields to continue
              </span>
            )}
            {!isContinueEnabled() && currentIdx === 1 && (
              <span style={{ fontSize: 11, color: '#e8a320', fontWeight: 600 }}>
                ⚠ Select at least one indicator
              </span>
            )}
            <button
              onClick={handleContinue}
              disabled={!isContinueEnabled()}
              style={{
                background: isContinueEnabled() ? accentColor : accentLight,
                color:      isContinueEnabled() ? '#fff' : '#7c3aed',
                border: 'none', borderRadius: 10,
                cursor: isContinueEnabled() ? 'pointer' : 'not-allowed',
                padding: '10px 20px', fontSize: 13, fontWeight: 600,
                display: 'flex', alignItems: 'center', gap: 6,
                transition: 'all 0.15s',
              }}
              onMouseEnter={e => { if (isContinueEnabled()) e.currentTarget.style.background = '#6d28d9'; }}
              onMouseLeave={e => { if (isContinueEnabled()) e.currentTarget.style.background = accentColor; }}
            >
              {currentIdx === 1 ? 'Continue to Generate →' : 'Continue to COT Indicators →'}
            </button>
          </div>
        ) : <div />}
      </div>
    </div>
  );
}
