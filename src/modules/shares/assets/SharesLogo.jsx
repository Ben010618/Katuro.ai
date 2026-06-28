export function SharesLogo({ size = 32, className = '' }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <rect width="32" height="32" rx="8" fill="#534AB7" />
      <rect x="5" y="11" width="22" height="15" rx="3" fill="white" fillOpacity="0.92" />
      <rect x="11" y="7" width="7" height="5" rx="2" fill="white" fillOpacity="0.92" />
      <circle cx="16" cy="18.5" r="5" fill="#534AB7" />
      <circle cx="16" cy="18.5" r="3.2" fill="white" fillOpacity="0.35" />
      <circle cx="16" cy="18.5" r="1.6" fill="white" fillOpacity="0.7" />
      <circle cx="23.5" cy="14" r="1.5" fill="#1D9E75" />
    </svg>
  );
}

export function SharesLogoFull({ height = 28 }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <SharesLogo size={height} />
      <span style={{
        fontWeight: 800, fontSize: height * 0.55,
        background: 'linear-gradient(135deg, #534AB7 0%, #1D9E75 100%)',
        WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
        letterSpacing: '-0.02em', fontFamily: '"Plus Jakarta Sans", sans-serif',
      }}>
        kaTuro Shares
      </span>
    </div>
  );
}
