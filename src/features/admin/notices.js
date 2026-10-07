/**
 * Admin notifications (adminNotifications) come in two kinds: sign-ups written by
 * registerUser (type 'new_user', always with the teacher's email, name and school)
 * and system notices such as the nightly inactivity cleanup (type + message only).
 */

/** A sign-up notice: type 'new_user'; older ones have no type but carry the teacher's email or name. */
export function isSignupNotice(n) {
  return n?.type === 'new_user' || (!n?.type && Boolean(n?.email || n?.givenName || n?.displayName));
}
