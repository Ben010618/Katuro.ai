
/**
 * DeskAvatar.jsx
 * 
 * Provides distinct, professional avatars for KaTuro AI Assistant and Teachers.
 * Eliminates generic technical icons in favor of character/profile avatars.
 */

export function KaTuroAIAvatar({ size = 32, className = '' }) {
  return (
    <div
      style={{ width: size, height: size }}
      className={`rounded-full overflow-hidden flex-shrink-0 relative shadow-sm border border-emerald-500/40 bg-gradient-to-b from-emerald-600 to-teal-900 flex items-center justify-center ${className}`}
      title="KaTuro AI Co-Teacher"
    >
      <svg
        viewBox="0 0 40 40"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="w-full h-full"
      >
        {/* Background Radial Glow */}
        <circle cx="20" cy="20" r="18" fill="url(#aiBgGrad)" />
        
        {/* Soft Sparkle Background Ring */}
        <circle cx="20" cy="20" r="16.5" stroke="#34d399" strokeWidth="1" strokeOpacity="0.3" strokeDasharray="3 3" />

        {/* Educator Torso & Teacher Uniform Collar */}
        <path
          d="M8 36C8 30.5 13.5 27 20 27C26.5 27 32 30.5 32 36"
          fill="#064e3b"
        />
        <path
          d="M16 27L20 31L24 27V36H16V27Z"
          fill="#10b981"
        />
        {/* DepEd Yellow Lanyard / Accent */}
        <path
          d="M18.5 27L20 30L21.5 27"
          stroke="#fbbf24"
          strokeWidth="1.5"
          strokeLinecap="round"
        />

        {/* Educator Head / Face */}
        <ellipse cx="20" cy="18" rx="7.5" ry="8.5" fill="#fde68a" />

        {/* Neat Educator Haircut */}
        <path
          d="M12.5 17C12.5 12 15.5 10 20 10C24.5 10 27.5 12 27.5 17C27.5 15.5 26 12 20 12C14 12 12.5 15.5 12.5 17Z"
          fill="#1f2937"
        />

        {/* Smart Glasses */}
        <rect x="15" y="15.5" width="4.2" height="3.2" rx="1" fill="#ecfdf5" stroke="#065f46" strokeWidth="1" />
        <rect x="20.8" y="15.5" width="4.2" height="3.2" rx="1" fill="#ecfdf5" stroke="#065f46" strokeWidth="1" />
        <line x1="19.2" y1="17.1" x2="20.8" y2="17.1" stroke="#065f46" strokeWidth="1" />

        {/* Friendly Eyes behind glasses */}
        <circle cx="17.1" cy="17.1" r="0.9" fill="#047857" />
        <circle cx="22.9" cy="17.1" r="0.9" fill="#047857" />

        {/* Warm Smiling Mouth */}
        <path
          d="M18.2 21.8C18.8 22.6 21.2 22.6 21.8 21.8"
          stroke="#92400e"
          strokeWidth="1"
          strokeLinecap="round"
        />

        {/* Little AI Star / Sparkle on Lapel */}
        <path
          d="M27 8L27.6 9.4L29 10L27.6 10.6L27 12L26.4 10.6L25 10L26.4 9.4L27 8Z"
          fill="#34d399"
        />

        <defs>
          <radialGradient id="aiBgGrad" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(20 16) rotate(90) scale(20)">
            <stop stopColor="#047857" />
            <stop offset="1" stopColor="#022c22" />
          </radialGradient>
        </defs>
      </svg>
    </div>
  );
}

export function TeacherAvatar({ photoURL, name = 'Teacher', size = 32, className = '' }) {
  if (photoURL) {
    return (
      <img
        src={photoURL}
        alt={name}
        style={{ width: size, height: size }}
        className={`rounded-full object-cover flex-shrink-0 shadow-xs border border-emerald-600/40 ring-1 ring-emerald-500/20 ${className}`}
      />
    );
  }

  // Fallback: DepEd Teacher Character Avatar
  const initial = name.replace(/^(sir|ma'?am)\s+/i, '').charAt(0).toUpperCase() || 'T';

  return (
    <div
      style={{ width: size, height: size }}
      className={`rounded-full overflow-hidden flex-shrink-0 relative shadow-xs border border-emerald-700/30 bg-gradient-to-b from-[#1b4332] to-[#081c15] flex items-center justify-center text-white font-bold ${className}`}
      title={name}
    >
      <svg
        viewBox="0 0 40 40"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="w-full h-full"
      >
        <circle cx="20" cy="20" r="18" fill="#1b4332" />
        {/* Teacher Shirt & Lanyard */}
        <path d="M9 36C9 30 14 26 20 26C26 26 31 30 31 36" fill="#2d6a4f" />
        <path d="M17 26L20 31L23 26" stroke="#fbbf24" strokeWidth="1.6" strokeLinecap="round" />
        {/* Head */}
        <circle cx="20" cy="17" r="7" fill="#fde68a" />
        {/* Hair */}
        <path d="M13 16C13 11 16 9.5 20 9.5C24 9.5 27 11 27 16C27 13 24 11 20 11C16 11 13 13 13 16Z" fill="#374151" />
      </svg>
      {/* Subtle Initial Badge in Corner */}
      <span className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-emerald-600 text-white rounded-full text-[9px] font-bold flex items-center justify-center shadow-xs border border-white">
        {initial}
      </span>
    </div>
  );
}

export default function DeskAvatar({ role = 'assistant', photoURL, name = 'Teacher', size = 32, className = '' }) {
  if (role === 'assistant') {
    return <KaTuroAIAvatar size={size} className={className} />;
  }
  return <TeacherAvatar photoURL={photoURL} name={name} size={size} className={className} />;
}
