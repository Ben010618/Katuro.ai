/**
 * authError.js: a Firebase sign-in / sign-up error in plain words for the teacher.
 * Known codes get a short sentence; anything else is Firebase's message without the
 * "Firebase:" prefix and the "(auth/…)" code.
 */
const PLAIN = {
  'auth/invalid-credential': 'Wrong email or password.',
  'auth/invalid-login-credentials': 'Wrong email or password.',
  'auth/wrong-password': 'Wrong email or password.',
  'auth/user-not-found': 'Wrong email or password.',
  'auth/invalid-email': 'That email address does not look right.',
  'auth/too-many-requests': 'Too many tries. Wait a moment and try again.',
  'auth/network-request-failed': 'No internet connection.',
  'auth/user-disabled': 'This account is switched off. Contact your admin.',
};

export function authErrorText(err, fallback = 'Something went wrong. Please try again.') {
  if (err?.code && PLAIN[err.code]) return PLAIN[err.code];
  const text = String(err?.message ?? '').replace('Firebase: ', '').replace(/ \(auth\/[\w-]+\)\.?/g, '').trim();
  return text && text !== 'Error' && text !== 'Error.' ? text : fallback;
}
