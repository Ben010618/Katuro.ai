import { ChevronRight, ArrowLeft, Download, Loader2 } from 'lucide-react';
import ktLogo from '../assets/KT Favicon.png';

const STEPS = [
  'BERA theme & problem',
  'Research questions',
  'Literature review',
  'Action plan',
  'Data collection',
  'Findings & report',
];

const CSS = `
  .ar-shell-content { flex: 1; overflow-y: auto; padding: 28px 28px 120px; }
  .ar-bottom { display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap; }
  .ar-bottom-right { display: flex; align-items: center; gap: 10px; }
  @media (max-width: 600px) {
    .ar-shell-content { padding: 16px 16px 120px; }
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
  nextLabel = 'Next Phase →',
  onNext,
  nextLoading = false,
  onDownload,
  downloadLoading = false,
  onBack,
  themeName,
}) {
  return (
    <div style={{
      minHeight: '100vh', background: '#f5faf7',
      display: 'flex', flexDirection: 'column',
      fontFamily: '"Plus Jakarta Sans", sans-serif',
    }}>
      <style>{CSS}</style>

      {/* ── Top bar ── */}
      <div style={{
        background: '#fff', borderBottom: '1px solid rgba(45,106,79,0.12)',
        padding: '13px 24px', display: 'flex', alignItems: 'center', gap: 14, flexShrink: 0,
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 7,
          background: '#d8f3dc', borderRadius: 8, padding: '4px 10px',
        }}>
          <img src={ktLogo} alt="kaTuro" style={{ width: 18, height: 18, borderRadius: 4, objectFit: 'cover' }} />
          <span style={{ fontSize: 11, fontWeight: 700, color: '#1a3d2b' }}>kaTuro</span>
        </div>
        <div>
          <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#0d2218', lineHeight: 1.2 }}>
            KaAction Research
          </p>
          <p style={{ margin: 0, fontSize: 11, color: '#4a6357', marginTop: 1 }}>
            kaTuro Action Research Partner
          </p>
        </div>
      </div>

      {/* ── Step breadcrumb ── */}
      <div style={{
        background: '#fff', borderBottom: '1px solid rgba(45,106,79,0.07)',
        padding: '10px 24px', overflowX: 'auto', flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', minWidth: 'max-content' }}>
          {STEPS.map((step, i) => {
            const active   = i + 1 === phase;
            const complete = i + 1 < phase;
            return (
              <div key={i} style={{ display: 'flex', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <div style={{
                    width: 20, height: 20, borderRadius: '50%', flexShrink: 0,
                    background: complete ? '#52b788' : active ? '#2d6a4f' : 'rgba(45,106,79,0.1)',
                    color: (active || complete) ? '#fff' : '#9bb8ac',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 10, fontWeight: 700,
                  }}>
                    {complete ? '✓' : i + 1}
                  </div>
                  <span style={{
                    fontSize: 11, fontWeight: active ? 700 : 400,
                    color: active ? '#1a3d2b' : complete ? '#52b788' : '#9bb8ac',
                    whiteSpace: 'nowrap',
                  }}>
                    {step}
                  </span>
                </div>
                {i < STEPS.length - 1 && (
                  <ChevronRight size={12} style={{ margin: '0 7px', color: '#c8ddd4', flexShrink: 0 }} />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Scrollable content ── */}
      <div className="ar-shell-content">
        <div style={{ maxWidth: 860, margin: '0 auto' }}>
          {children}
        </div>
      </div>

      {/* ── Sticky bottom bar ── */}
      <div style={{
        position: 'sticky', bottom: 0, zIndex: 10,
        background: '#fff', borderTop: '1px solid rgba(45,106,79,0.12)',
        padding: '13px 24px', flexShrink: 0,
      }}>
        <div className="ar-bottom" style={{ maxWidth: 860, margin: '0 auto' }}>

          {/* Left: Back or Cancel */}
          {onBack ? (
            <button
              onClick={onBack}
              style={{ background: 'none', border: '1.5px solid rgba(45,106,79,0.2)', borderRadius: 8, padding: '8px 16px', fontSize: 12, fontWeight: 600, color: '#4a6357', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 6 }}
              onMouseEnter={e => e.currentTarget.style.background = '#f5faf7'}
              onMouseLeave={e => e.currentTarget.style.background = 'none'}
            >
              <ArrowLeft size={13} /> Back
            </button>
          ) : (
            <div />
          )}

          {/* Center: theme/phase info */}
          {themeName && (
            <div className="ar-center-badge" style={{
              background: '#d8f3dc', borderRadius: 8, padding: '6px 14px',
              fontSize: 11, fontWeight: 600, color: '#1a3d2b',
            }}>
              {themeName}
            </div>
          )}

          {/* Right: Download + Next */}
          <div className="ar-bottom-right">
            {onDownload && (
              <button
                onClick={onDownload}
                disabled={downloadLoading}
                style={{ background: '#f5faf7', border: '1.5px solid rgba(45,106,79,0.2)', borderRadius: 8, padding: '8px 16px', fontSize: 12, fontWeight: 600, color: '#2d6a4f', cursor: downloadLoading ? 'not-allowed' : 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 6, opacity: downloadLoading ? 0.6 : 1 }}
              >
                {downloadLoading ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Download size={13} />}
                Download (.docx)
              </button>
            )}

            <button
              onClick={onNext}
              disabled={!canNext || nextLoading}
              style={{ background: canNext && !nextLoading ? '#2d6a4f' : 'rgba(45,106,79,0.35)', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 20px', fontSize: 13, fontWeight: 600, cursor: canNext && !nextLoading ? 'pointer' : 'not-allowed', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 7, transition: 'background 0.15s' }}
              onMouseEnter={e => { if (canNext && !nextLoading) e.currentTarget.style.background = '#1b4d37'; }}
              onMouseLeave={e => { if (canNext && !nextLoading) e.currentTarget.style.background = '#2d6a4f'; }}
            >
              {nextLoading
                ? <><Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> Saving…</>
                : <>{nextLabel} <ChevronRight size={14} /></>}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
