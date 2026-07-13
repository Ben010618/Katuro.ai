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
        borderRadius: 11,
        objectFit: 'cover',
        display: 'block',
        boxShadow: '0 2px 14px rgba(34,197,94,0.40)',
      }}
    />
  );
}

export function SharesLogoFull({ height = 40 }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <SharesLogo size={height} />
      <div>
        <span style={{
          display: 'block',
          fontWeight: 800,
          fontSize: Math.round(height * 0.52),
          color: '#4ade80',
          letterSpacing: '-0.02em',
          fontFamily: '"Plus Jakarta Sans", sans-serif',
          lineHeight: 1,
        }}>
          kaTuro Shares
        </span>
        <span style={{
          display: 'block',
          fontSize: Math.round(height * 0.30),
          color: 'rgba(255,255,255,0.40)',
          fontWeight: 600,
          letterSpacing: '0.05em',
          lineHeight: 1.2,
          marginTop: 3,
        }}>
          Teacher Community
        </span>
      </div>
    </div>
  );
}
