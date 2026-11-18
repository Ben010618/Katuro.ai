/**
 * phoneIntro.js — the welcome animation is shown once, right after the teacher signs in on
 * the phone (PhoneSignIn marks it; PhoneApp shows PhoneIntro and clears it). Per app session.
 */
const INTRO_FLAG = 'katuro-phone-intro';

export function markJustSignedIn() {
  try { sessionStorage.setItem(INTRO_FLAG, '1'); } catch { /* storage blocked: no intro */ }
}
export function justSignedIn() {
  try { return sessionStorage.getItem(INTRO_FLAG) === '1'; } catch { return false; }
}
export function clearJustSignedIn() {
  try { sessionStorage.removeItem(INTRO_FLAG); } catch { /* storage blocked */ }
}
