
/**
 * DeskAvatar.jsx
 * 
 * Provides distinct, professional avatars for KaTuro AI Assistant and Teachers.
 * Eliminates generic technical icons in favor of character/profile avatars.
 */

import mattAvatar from '../../assets/avatars/matt.webp';
import lunaAvatar from '../../assets/avatars/luna.webp';
import { getPersona } from '../../services/desk/personas';

const PERSONA_AVATARS = { matt: mattAvatar, luna: lunaAvatar };

/** The assistant's face: Matt or Luna, per the persona chosen in Settings. */
export function KaTuroAIAvatar({ size = 32, className = '', persona = 'matt' }) {
  const p = getPersona(persona);
  return (
    <img
      src={PERSONA_AVATARS[p.id]}
      alt={p.name}
      title={`${p.name} · KaTuro Co-Teacher`}
      width={size}
      height={size}
      style={{ width: size, height: size }}
      className={`rounded-full object-cover flex-shrink-0 shadow-sm bg-white ${className}`}
    />
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

export default function DeskAvatar({ role = 'assistant', photoURL, name = 'Teacher', size = 32, className = '', persona }) {
  if (role === 'assistant') {
    return <KaTuroAIAvatar size={size} className={className} persona={persona} />;
  }
  return <TeacherAvatar photoURL={photoURL} name={name} size={size} className={className} />;
}
