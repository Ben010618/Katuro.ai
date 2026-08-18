import { ChevronRight, ArrowLeft, Download, Loader2, Sparkles, Check } from 'lucide-react';
import ktLogo from '../assets/KT-Favicon.webp';

const STEPS = [
  'BERA theme & problem',
  'Research questions',
  'Literature review',
  'Action plan',
  'Data collection',
  'Findings & report',
];

const CSS = `
  .ar-shell-content {
    flex: 1;
    overflow-y: auto;
    padding: 32px 24px 120px;
  }
  .ar-bottom {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    flex-wrap: wrap;
  }
  .ar-bottom-right {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  @media (max-width: 680px) {
    .ar-shell-content { padding: 18px 16px 120px; }
    .ar-bottom { flex-direction: column; align-items: stretch; }
    .ar-bottom-right { flex-direction: column; }
    .ar-bottom-right button { width: 100%; justify-content: center; }
    .ar-center-badge { display: none !important; }
  }
`;

export default function ActionResearchShell({
  phase = 1,
  children,
  canNext = false,
  nextLabel = 'Susunod na Phase →',
  onNext,
  nextLoading = false,
  onDownload,
  downloadLoading = false,
  onBack,
  themeName,
}) {
  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--kt-surface, #FBF7EC)',
      display: 'flex',
      flexDirection: 'column',
      fontFamily: 'var(--kt-font-ui, "Inter", sans-serif)',
      color: 'var(--kt-text-primary, #262119)',
    }}>
      <style>{CSS}</style>

      {/* ── Top Bar ── */}
      <div style={{
        background: 'var(--kt-card, #FBF7EC)',
        borderBottom: '1px solid var(--kt-border, #DCD0AE)',
        padding: '12px 24px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 7,
            background: 'var(--kt-manila, #E4D5AC)',
            border: '1px solid var(--kt-manila-border, #C9B583)',
            borderRadius: 'var(--kt-radius-sm, 4px)',
            padding: '4px 8px',
          }}>
            <img src={ktLogo} alt="kaTuro" style={{ width: 20, height: 20, borderRadius: 3, objectFit: 'cover' }} />
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--kt-chalkboard, #1F3A2E)', fontFamily: 'var(--kt-font-heading, "Bitter", serif)' }}>
              kaTuro AI
            </span>
          </div>

          <div>
            <h1 style={{
              margin: 0,
              fontSize: 16,
              fontWeight: 700,
              color: 'var(--kt-text-primary, #262119)',
              fontFamily: 'var(--kt-font-heading, "Bitter", serif)',
              lineHeight: 1.2,
            }}>
              DepEd Action Research Partner
            </h1>
            <p style={{
              margin: 0,
              fontSize: 11,
              color: 'var(--kt-text-secondary, #6E6455)',
              fontFamily: 'var(--kt-font-mono, monospace)',
            }}>
              BERA THEMES · BERF COMPLIANT ACTION RESEARCH ENGINE
            </p>
          </div>
        </div>

        {themeName && (
          <div className="ar-center-badge" style={{
            background: 'var(--kt-card-2, #F4EDDB)',
            border: '1px solid var(--kt-border, #DCD0AE)',
            borderRadius: 'var(--kt-radius-sm, 4px)',
            padding: '5px 12px',
            fontSize: 11.5,
            fontWeight: 700,
            color: 'var(--kt-chalkboard, #1F3A2E)',
            fontFamily: 'var(--kt-font-mono, monospace)',
          }}>
            {themeName}
          </div>
        )}
      </div>

      {/* ── Step Stepper Breadcrumb ── */}
      <div style={{
        background: 'var(--kt-card-2, #F4EDDB)',
        borderBottom: '1px solid var(--kt-border, #DCD0AE)',
        padding: '10px 24px',
        overflowX: 'auto',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', minWidth: 'max-content', gap: 4 }}>
          {STEPS.map((step, i) => {
            const active   = i + 1 === phase;
            const complete = i + 1 < phase;
            return (
              <div key={i} style={{ display: 'flex', alignItems: 'center' }}>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 7,
                  background: active ? 'var(--kt-manila, #E4D5AC)' : 'transparent',
                  border: active ? '1px solid var(--kt-manila-border, #C9B583)' : '1px solid transparent',
                  borderRadius: 4,
                  padding: '4px 8px',
                }}>
                  <div style={{
                    width: 20,
                    height: 20,
                    borderRadius: '50%',
                    flexShrink: 0,
                    background: complete
                      ? 'var(--kt-sage, #5F7A54)'
                      : active
                      ? 'var(--kt-chalkboard, #1F3A2E)'
                      : 'var(--kt-border, #DCD0AE)',
                    color: '#FBF7EC',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 10.5,
                    fontWeight: 700,
                    fontFamily: 'var(--kt-font-mono, monospace)',
                  }}>
                    {complete ? <Check size={12} /> : i + 1}
                  </div>
                  <span style={{
                    fontSize: 12,
                    fontWeight: active ? 700 : 500,
                    color: active
                      ? 'var(--kt-chalkboard, #1F3A2E)'
                      : complete
                      ? 'var(--kt-sage, #5F7A54)'
                      : 'var(--kt-text-secondary, #6E6455)',
                    fontFamily: active ? 'var(--kt-font-heading, "Bitter", serif)' : 'inherit',
                    whiteSpace: 'nowrap',
                  }}>
                    Phase {i + 1}: {step}
                  </span>
                </div>

                {i < STEPS.length - 1 && (
                  <ChevronRight size={13} style={{ margin: '0 6px', color: 'var(--kt-border, #DCD0AE)', flexShrink: 0 }} />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Scrollable Content Area ── */}
      <div className="ar-shell-content">
        <div style={{ maxWidth: 880, margin: '0 auto' }}>
          {children}
        </div>
      </div>

      {/* ── Sticky Bottom Action Bar ── */}
      <div style={{
        position: 'sticky',
        bottom: 0,
        zIndex: 10,
        background: 'var(--kt-card, #FBF7EC)',
        borderTop: '1px solid var(--kt-border, #DCD0AE)',
        padding: '14px 24px',
        flexShrink: 0,
        boxShadow: '0 -4px 16px rgba(38, 33, 25, 0.05)',
      }}>
        <div className="ar-bottom" style={{ maxWidth: 880, margin: '0 auto' }}>

          {/* Left: Back */}
          {onBack ? (
            <button
              onClick={onBack}
              style={{
                background: 'var(--kt-card-2, #F4EDDB)',
                border: '1px solid var(--kt-border, #DCD0AE)',
                borderRadius: 'var(--kt-radius-sm, 4px)',
                padding: '8px 16px',
                fontSize: 12.5,
                fontWeight: 600,
                color: 'var(--kt-text-secondary, #6E6455)',
                cursor: 'pointer',
                fontFamily: 'inherit',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                transition: 'background 0.15s',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = '#ebe2cc'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'var(--kt-card-2, #F4EDDB)'; }}
            >
              <ArrowLeft size={13} /> Bumalik (Back)
            </button>
          ) : (
            <div />
          )}

          {/* Right: Download + Next */}
          <div className="ar-bottom-right">
            {onDownload && (
              <button
                onClick={onDownload}
                disabled={downloadLoading}
                style={{
                  background: 'var(--kt-card-2, #F4EDDB)',
                  border: '1px solid var(--kt-border, #DCD0AE)',
                  borderRadius: 'var(--kt-radius-sm, 4px)',
                  padding: '9px 16px',
                  fontSize: 12.5,
                  fontWeight: 600,
                  color: 'var(--kt-chalkboard, #1F3A2E)',
                  cursor: downloadLoading ? 'not-allowed' : 'pointer',
                  fontFamily: 'inherit',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  opacity: downloadLoading ? 0.6 : 1,
                  transition: 'background 0.15s',
                }}
                onMouseEnter={e => { if (!downloadLoading) e.currentTarget.style.background = '#ebe2cc'; }}
                onMouseLeave={e => { if (!downloadLoading) e.currentTarget.style.background = 'var(--kt-card-2, #F4EDDB)'; }}
              >
                {downloadLoading ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Download size={13} />}
                I-download ang Draft (.docx)
              </button>
            )}

            <button
              onClick={onNext}
              disabled={!canNext || nextLoading}
              style={{
                background: canNext && !nextLoading ? 'var(--kt-chalkboard, #1F3A2E)' : 'var(--kt-border, #DCD0AE)',
                color: '#FBF7EC',
                border: '1px solid transparent',
                borderRadius: 'var(--kt-radius-md, 6px)',
                padding: '9px 20px',
                fontSize: 13,
                fontWeight: 700,
                cursor: canNext && !nextLoading ? 'pointer' : 'not-allowed',
                fontFamily: 'inherit',
                display: 'flex',
                alignItems: 'center',
                gap: 7,
                transition: 'background 0.15s',
              }}
              onMouseEnter={e => { if (canNext && !nextLoading) e.currentTarget.style.background = 'var(--kt-chalkboard-hover, #2B4E3E)'; }}
              onMouseLeave={e => { if (canNext && !nextLoading) e.currentTarget.style.background = 'var(--kt-chalkboard, #1F3A2E)'; }}
            >
              {nextLoading ? (
                <>
                  <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> Isinusulat…
                </>
              ) : (
                <>
                  {nextLabel} <ChevronRight size={14} />
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

