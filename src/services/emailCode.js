/**
 * Email codes on the website: a 6-digit code before a new account is made, and
 * again on sign-in when the last code was typed more than 30 days ago.
 * KaTuroDesk never asks. Server side: functions/emailCode.js.
 */
import { doc, getDoc, setDoc } from 'firebase/firestore';
import app, { db } from '../firebase';

export const RECHECK_AFTER_MS = 30 * 24 * 60 * 60 * 1000;
export const SIGNUP_URL = 'https://katuro.website/login?mode=signup';

async function call(name, data) {
  const { getFunctions, httpsCallable } = await import('firebase/functions');
  try {
    const res = await httpsCallable(getFunctions(app, 'us-central1'), name, { timeout: 30000 })(data);
    return res.data;
  } catch (err) {
    const clean = String(err?.message || '')
      .replace(/^Firebase:\s*/i, '')
      .replace(/\s*\(functions\/[\w-]+\)\.?$/i, '')
      .trim();
    const friendly = !clean || /^(internal|INTERNAL|deadline-exceeded|unavailable)$/i.test(clean)
      ? 'Could not reach KaTuro. Check your internet connection and try again.'
      : clean;
    throw new Error(friendly, { cause: err });
  }
}

/** → { required:false } | { required:false, providerDown:true } | { required:true, sentTo, waitSec } */
export function sendSignupCode(email) {
  return call('sendEmailCode', { purpose: 'signup', email });
}

export function sendSignInCode() {
  return call('sendEmailCode', { purpose: 'signin' });
}

export function verifySignInCode(code) {
  return call('verifyEmailCode', { code });
}

/** Keeps only digits, at most 6 ("482 913" → "482913"). */
export function cleanCode(value) {
  return String(value || '').replace(/\D/g, '').slice(0, 6);
}

/**
 * Whether the website should ask this teacher for a code now.
 * config / check: the Firestore docs (undefined = still loading, null = missing).
 */
export function needsEmailCode(config, check, now = Date.now()) {
  if (config === undefined || check === undefined) return undefined;
  if (config?.enabled !== true) return false;
  const at = Number(check?.verifiedAt);
  return !(Number.isFinite(at) && at > 0 && now - at < RECHECK_AFTER_MS);
}

// When the email service is down the teacher is let in for this visit only.
const passKey = (uid) => `kt-email-pass:${uid}`;

export function hasVisitPass(uid) {
  try { return sessionStorage.getItem(passKey(uid)) === '1'; } catch { return false; }
}

export function giveVisitPass(uid) {
  try { sessionStorage.setItem(passKey(uid), '1'); } catch { /* storage blocked — the gate state still lets them in */ }
}

// ── Admin Dashboard: Resend key, on/off switch, test email ──────────────────

/** { enabled, hasKey, keyHint, from } — never returns the whole key. */
export async function getEmailCodeAdminStatus() {
  const [sw, resend] = await Promise.all([getDoc(doc(db, 'adminConfig', 'emailCode')), getDoc(doc(db, 'adminConfig', 'resend'))]);
  const key = String((resend.exists() && resend.data().apiKey) || '');
  return {
    enabled: sw.exists() && sw.data().enabled === true,
    hasKey: Boolean(key),
    keyHint: key ? `${key.slice(0, 3)}…${key.slice(-4)}` : '',
    from: (resend.exists() && resend.data().from) || '',
  };
}

/** apiKey: '' keeps the saved key. from: '' uses "KaTuro AI <no-reply@katuro.website>". */
export async function saveResendConfig({ apiKey, from }, adminUid) {
  const key = String(apiKey || '').trim();
  const sender = String(from || '').trim();
  if (key && !/^re_[A-Za-z0-9_-]{8,}$/.test(key)) throw new Error('A Resend API key starts with "re_". Please copy the whole key.');
  if (sender && !/^[^<>]*<[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+>$|^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(sender)) {
    throw new Error('Sender should look like: KaTuro AI <no-reply@katuro.website>');
  }
  await setDoc(doc(db, 'adminConfig', 'resend'), {
    ...(key ? { apiKey: key } : {}), from: sender, updatedAt: new Date(), updatedBy: adminUid,
  }, { merge: true });
}

export async function setEmailCodesEnabled(enabled, adminUid) {
  await setDoc(doc(db, 'adminConfig', 'emailCode'), { enabled: enabled === true, updatedAt: new Date(), updatedBy: adminUid }, { merge: true });
}

/** Sends a sample code email to the signed-in admin. → { ok, to?, error?, ip? } */
export function sendTestEmail() {
  return call('adminTestEmail', {});
}
