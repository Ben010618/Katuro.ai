import ktLogo from '../../../assets/KT Favicon.png';

export function SharesLogo({ size = 32, className = '' }) {
  return (
    <img
      src={ktLogo}
      alt="kaTuro Shares"
      width={size}
      height={size}
      className={className}
      style={{ borderRadius: 9, objectFit: 'cover', display: 'block' }}
    />
  );
}

export function SharesLogoFull({ height = 28 }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <SharesLogo size={height} />
      <div>
        <span style={{
          display: 'block',
          fontWeight: 800, fontSize: height * 0.55,
          color: '#2d6a4f',
          letterSpacing: '-0.02em',
          fontFamily: '"Plus Jakarta Sans", sans-serif',
          lineHeight: 1,
        }}>
          kaTuro Shares
        </span>
        <span style={{
          display: 'block',
          fontSize: height * 0.32,
          color: '#52b788',
          fontWeight: 600,
          letterSpacing: '0.04em',
          lineHeight: 1.2,
          marginTop: 2,
        }}>
          Teacher Community
        </span>
      </div>
    </div>
  );
}
