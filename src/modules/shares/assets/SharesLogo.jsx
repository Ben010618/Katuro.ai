import ktLogo from '../../../assets/KT-Favicon.webp';

export function SharesLogo({ size = 40, className = '' }) {
  return (
    <img
      src={ktLogo}
      alt="kaTuro Shares"
      width={size}
      height={size}
      className={className}
      style={{
        borderRadius: 4,
        objectFit: 'cover',
        display: 'block',
        border: '1px solid rgba(201,181,131,0.3)',
        boxShadow: '0 1px 4px rgba(0,0,0,0.15)',
      }}
    />
  );
}

export function SharesLogoFull({ height = 40 }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <SharesLogo size={height} />
      <div>
        <span style={{
          display: 'block',
          fontWeight: 700,
          fontSize: Math.round(height * 0.55),
          color: '#FBF7EC',
          letterSpacing: '-0.01em',
          fontFamily: 'var(--kt-font-heading, "Bitter", serif)',
          lineHeight: 1,
        }}>
          kaTuro <span style={{ color: 'var(--kt-manila, #E4D5AC)' }}>Shares</span>
        </span>
        <span style={{
          display: 'block',
          fontSize: Math.round(height * 0.30),
          color: 'rgba(251,247,236,0.65)',
          fontWeight: 600,
          letterSpacing: '0.06em',
          fontFamily: 'var(--kt-font-mono, "JetBrains Mono", monospace)',
          lineHeight: 1.2,
          marginTop: 2,
          textTransform: 'uppercase',
        }}>
          Komunidad ng mga Guro
        </span>
      </div>
    </div>
  );
}
