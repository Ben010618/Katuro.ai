/**
 * defaultAvatar.js — the grey "no photo yet" picture, used everywhere a teacher has not
 * uploaded a profile photo (web and KaTuroDesk), and when a photo link no longer loads.
 */
import defaultAvatarUrl from '../assets/default-avatar.svg';

export const DEFAULT_AVATAR = defaultAvatarUrl;

/** The photo to show: the teacher's own, or the default picture. */
export function avatarSrc(photoURL) {
  return typeof photoURL === 'string' && photoURL.trim() ? photoURL : DEFAULT_AVATAR;
}

/** <img onError>: a deleted or broken photo link shows the default picture instead. */
export function onAvatarError(e) {
  const img = e.currentTarget;
  if (img.dataset.defaultAvatar === '1') return;
  img.dataset.defaultAvatar = '1';
  img.src = DEFAULT_AVATAR;
}
