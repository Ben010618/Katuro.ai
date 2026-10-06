import { avatarSrc, onAvatarError } from '../utils/defaultAvatar';

/**
 * A teacher's profile picture, or the default "no photo" picture when there is none
 * (or the photo link is broken). data-default-avatar lets containers drop their
 * coloured background behind the round default picture.
 */
export default function AvatarImage({ photoURL, alt = '', ...props }) {
  const isDefault = !(typeof photoURL === 'string' && photoURL.trim());
  return (
    <img
      src={avatarSrc(photoURL)}
      alt={alt}
      onError={onAvatarError}
      {...(isDefault ? { 'data-default-avatar': '1' } : {})}
      {...props}
    />
  );
}
