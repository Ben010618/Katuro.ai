
/**
 * DeskAvatar.jsx
 * 
 * Provides distinct, professional avatars for KaTuro AI Assistant and Teachers.
 * Eliminates generic technical icons in favor of character/profile avatars.
 */

import mattAvatar from '../../assets/avatars/matt.webp';
import lunaAvatar from '../../assets/avatars/luna.webp';
import greyAvatar from '../../assets/avatars/grey.webp';
import carmenAvatar from '../../assets/avatars/carmen.webp';
import { getPersona } from '../../services/desk/personas';
import AvatarImage from '../../components/AvatarImage';

const PERSONA_AVATARS = { matt: mattAvatar, luna: lunaAvatar, grey: greyAvatar, carmen: carmenAvatar };

/** The assistant's face: Matt, Luna, Grey or Lola Carmen, per the persona chosen in Settings. */
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
  // The teacher's photo, or the default "no photo" picture (also when the link is broken).
  return (
    <AvatarImage
      photoURL={photoURL}
      alt={name}
      title={name}
      style={{ width: size, height: size }}
      className={`rounded-full object-cover flex-shrink-0 shadow-xs ${photoURL ? 'border border-emerald-600/40 ring-1 ring-emerald-500/20' : ''} ${className}`}
    />
  );
}

export default function DeskAvatar({ role = 'assistant', photoURL, name = 'Teacher', size = 32, className = '', persona }) {
  if (role === 'assistant') {
    return <KaTuroAIAvatar size={size} className={className} persona={persona} />;
  }
  return <TeacherAvatar photoURL={photoURL} name={name} size={size} className={className} />;
}
