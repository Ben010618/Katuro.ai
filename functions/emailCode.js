/**
 * Email codes: a 6-digit code sent by email (Resend) before a teacher can
 * create an account on the website, and again on website sign-in every 30 days.
 * KaTuroDesk never asks — a teacher who got in on the website gets in on Desk.
 *
 * Firestore (all server-only unless noted):
 *   adminConfig/emailCode   { enabled }        on/off switch; signed-in users may read it
 *   adminConfig/resend      { apiKey, from }   admin only
 *   emailCodes/{id}         the pending code (only a salted hash of it is stored)
 *   emailCodeIps/{day_ip}   sign-up codes sent per network per day
 *   emailChecks/{uid}       { verifiedAt }     the teacher may read their own
 *
 * If the email service fails, nobody is locked out: website sign-in lets the
 * teacher in for that visit, and sign-up goes ahead without a code (the account
 * then has no emailChecks entry, so the next website sign-in asks for a code).
 */
const crypto = require('crypto');

const CODE_TTL_MS = 10 * 60 * 1000;
const RESEND_WAIT_MS = 60 * 1000;
const MAX_SENDS_PER_DAY = 5;
const MAX_WRONG_TRIES = 5;
const MAX_SIGNUP_CODES_PER_IP = 20;
const PROVIDER_DOWN_PASS_MS = 15 * 60 * 1000;
const RECHECK_AFTER_MS = 30 * 24 * 60 * 60 * 1000;
const DEFAULT_FROM = 'KaTuro AI <no-reply@katuro.website>';
const SIGNUP_ON_WEBSITE = 'Please create your account on the KaTuro website (katuro.website). It will email you a code to confirm your address. Then sign in here.';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
const normalizeEmail = (email) => String(email || '').trim().toLowerCase();
const manilaDay = (now) => new Date(now).toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });

/** "benmark@gmail.com" → "b******@gmail.com" */
function maskEmail(email) {
  const [name, domain] = String(email || '').split('@');
  if (!domain) return '';
  return `${name.slice(0, 1)}${'*'.repeat(Math.max(name.length - 1, 1))}@${domain}`;
}

function hashCode(code, salt) {
  return sha256(`${salt}:${code}`);
}

function sameHash(a, b) {
  const x = Buffer.from(String(a || ''), 'hex');
  const y = Buffer.from(String(b || ''), 'hex');
  return x.length === y.length && x.length > 0 && crypto.timingSafeEqual(x, y);
}

function newCode() {
  return String(crypto.randomInt(0, 1000000)).padStart(6, '0');
}

function codeEmail(code) {
  const text = [
    `Your KaTuro code is ${code}.`,
    '',
    'Type it on the KaTuro website to continue. It expires in 10 minutes.',
    '',
    'If you did not ask for this code, you can ignore this email. Nobody can sign in with your email address without it.',
    '',
    'KaTuro AI',
  ].join('\n');
  const html = `<!doctype html><html><body style="margin:0;padding:24px;background:#f5faf7;font-family:Arial,Helvetica,sans-serif;color:#0d2218">
<div style="max-width:440px;margin:0 auto;background:#ffffff;border:1px solid #d7e5dc;border-radius:10px;padding:28px">
<p style="margin:0 0 6px;font-size:13px;font-weight:bold;color:#2d6a4f;letter-spacing:.5px">KATURO AI</p>
<p style="margin:0 0 18px;font-size:15px">Your code is</p>
<p style="margin:0 0 18px;font-size:32px;font-weight:bold;letter-spacing:8px;color:#0d2218">${code}</p>
<p style="margin:0 0 14px;font-size:14px;line-height:1.5">Type it on the KaTuro website to continue. It expires in 10 minutes.</p>
<p style="margin:0;font-size:12px;line-height:1.5;color:#4a6357">If you did not ask for this code, you can ignore this email. Nobody can sign in with your email address without it.</p>
</div></body></html>`;
  return { subject: `Your KaTuro code: ${code}`, text, html };
}

/**
 * @param {object} deps
 * @param {object} deps.db        Firestore (admin SDK)
 * @param {Function} deps.fetchFn fetch
 * @param {Function} deps.HttpsError
 * @param {Function} [deps.now]
 */
function createEmailCodes({ db, fetchFn, HttpsError, now = () => Date.now() }) {
  async function isEnabled() {
    const snap = await db.doc('adminConfig/emailCode').get();
    return Boolean(snap.exists && snap.data()?.enabled === true);
  }

  async function resendConfig() {
    const snap = await db.doc('adminConfig/resend').get();
    const d = snap.exists ? snap.data() || {} : {};
    return { apiKey: String(d.apiKey || '').trim(), from: String(d.from || '').trim() || DEFAULT_FROM };
  }

  /** Sends one email through Resend. Throws with a short reason when it does not go out. */
  async function sendMail(to, { subject, text, html }) {
    const { apiKey, from } = await resendConfig();
    if (!apiKey) throw new Error('No Resend API key is saved.');
    // KATURO_RESEND_URL: emulator tests only (functions/.env.demo-katuro) — a local fake mail server.
    const res = await fetchFn(process.env.KATURO_RESEND_URL || 'https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: [to], subject, text, html }),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) {
      let detail = '';
      try { detail = (await res.json())?.message || ''; } catch { /* no body */ }
      throw new Error(`Resend answered ${res.status}${detail ? `: ${detail}` : ''}`);
    }
  }

  const codeRef = (purpose, key) => db.doc(`emailCodes/${sha256(`${purpose}:${key}`)}`);

  /**
   * Makes a new code for (purpose, key) unless one was sent in the last minute.
   * → { code } for a new code, or { waitMs } when the last code is still fresh.
   */
  async function issueCode(purpose, key, email) {
    const ref = codeRef(purpose, key);
    return db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const prev = snap.exists ? snap.data() : null;
      const t = now();
      const day = manilaDay(t);
      if (prev && t - (prev.lastSentAt || 0) < RESEND_WAIT_MS && prev.expiresAt > t && !prev.providerDownUntil) {
        return { waitMs: RESEND_WAIT_MS - (t - prev.lastSentAt) };
      }
      const sentToday = prev?.day === day ? prev.sentToday || 0 : 0;
      if (sentToday >= MAX_SENDS_PER_DAY) {
        throw new HttpsError('resource-exhausted', 'You have asked for 5 codes today. Please try again tomorrow, or use the last code we sent.');
      }
      const code = newCode();
      const salt = crypto.randomBytes(16).toString('hex');
      tx.set(ref, {
        email, purpose, salt, codeHash: hashCode(code, salt),
        expiresAt: t + CODE_TTL_MS, attempts: 0, lastSentAt: t,
        day, sentToday: sentToday + 1, providerDownUntil: 0,
      });
      return { code };
    });
  }

  /** Sign-up codes per network per day (stops one person spamming many inboxes). */
  async function takeIpAllowance(ip) {
    if (!ip) return;
    const ref = db.doc(`emailCodeIps/${manilaDay(now())}_${sha256(String(ip)).slice(0, 32)}`);
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const count = snap.exists ? snap.data()?.count || 0 : 0;
      if (count >= MAX_SIGNUP_CODES_PER_IP) {
        throw new HttpsError('resource-exhausted', 'Too many codes were asked for from this network today. Please try again tomorrow.');
      }
      tx.set(ref, { count: count + 1, at: now() });
    });
  }

  async function markProviderDown(purpose, key) {
    await codeRef(purpose, key).set({ providerDownUntil: now() + PROVIDER_DOWN_PASS_MS, expiresAt: 0 }, { merge: true });
  }

  /**
   * Sends (or re-uses) a code. → { required:false } when codes are off,
   * { required:false, providerDown:true } when the email could not be sent,
   * { required:true, sentTo, waitSec } otherwise.
   */
  async function send(purpose, key, email) {
    const issued = await issueCode(purpose, key, email);
    if (issued.waitMs !== undefined) {
      return { required: true, sentTo: maskEmail(email), waitSec: Math.ceil(issued.waitMs / 1000) };
    }
    try {
      await sendMail(email, codeEmail(issued.code));
    } catch (err) {
      // Log text is matched by a Cloud Monitoring alert — keep "[emailCode] email not sent".
      console.error(`[emailCode] email not sent (${purpose}): ${err?.message || err}`);
      await markProviderDown(purpose, key);
      return { required: false, providerDown: true };
    }
    return { required: true, sentTo: maskEmail(email), waitSec: Math.ceil(RESEND_WAIT_MS / 1000) };
  }

  /** Throws a friendly HttpsError unless `code` is the live code. Does not use it up. */
  async function checkCode(purpose, key, code) {
    const ref = codeRef(purpose, key);
    const clean = String(code || '').replace(/\D/g, '');
    const outcome = await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const d = snap.exists ? snap.data() : null;
      const t = now();
      if (!d || !d.codeHash) return { error: 'Please ask for a code first.' };
      if (d.expiresAt <= t) return { error: 'This code has expired. Please ask for a new one.' };
      if ((d.attempts || 0) >= MAX_WRONG_TRIES) return { error: 'Too many wrong tries. Please ask for a new code.' };
      if (clean.length === 6 && sameHash(hashCode(clean, d.salt), d.codeHash)) return { ok: true };
      const attempts = (d.attempts || 0) + 1;
      tx.set(ref, { attempts }, { merge: true });
      const left = MAX_WRONG_TRIES - attempts;
      return { error: left > 0 ? `That code is not right. ${left} ${left === 1 ? 'try' : 'tries'} left.` : 'Too many wrong tries. Please ask for a new code.' };
    });
    if (outcome.error) throw new HttpsError('invalid-argument', outcome.error);
  }

  async function discardCode(purpose, key) {
    await codeRef(purpose, key).delete().catch(() => {});
  }

  /** True when the email service failed for this sign-up in the last 15 minutes. */
  async function providerDownPass(purpose, key) {
    const snap = await codeRef(purpose, key).get();
    return Boolean(snap.exists && (snap.data()?.providerDownUntil || 0) > now());
  }

  async function markVerified(uid) {
    await db.doc(`emailChecks/${uid}`).set({ verifiedAt: now() });
  }

  return {
    isEnabled, sendMail, send, checkCode, discardCode, providerDownPass, markVerified, takeIpAllowance,

    /** Callable body: { purpose: 'signup', email } or { purpose: 'signin' } (signed in). */
    async sendCode(req, { userExists }) {
      const purpose = req.data?.purpose;
      if (purpose !== 'signup' && purpose !== 'signin') throw new HttpsError('invalid-argument', 'Unknown code request.');
      if (!(await isEnabled())) return { required: false };
      if (purpose === 'signin') {
        if (!req.auth) throw new HttpsError('unauthenticated', 'Please sign in first.');
        const email = normalizeEmail(req.auth.token?.email);
        if (!email) throw new HttpsError('failed-precondition', 'This account has no email address.');
        return send('signin', req.auth.uid, email);
      }
      const email = normalizeEmail(req.data?.email);
      if (!EMAIL_RE.test(email) || email.length > 254) throw new HttpsError('invalid-argument', 'The email address is not valid.');
      if (await userExists(email)) throw new HttpsError('already-exists', 'An account with this email already exists.');
      await takeIpAllowance(req.rawRequest?.ip);
      return send('signup', email, email);
    },

    /** Callable body: { code } — website sign-in check. */
    async verifySignIn(req) {
      if (!req.auth) throw new HttpsError('unauthenticated', 'Please sign in first.');
      await checkCode('signin', req.auth.uid, req.data?.code);
      await markVerified(req.auth.uid);
      await discardCode('signin', req.auth.uid);
      return { ok: true };
    },

    /**
     * Inside registerUser, before the account is made. → { verified } where
     * verified=false means codes are off or the email service was down.
     */
    async checkSignup(email, code) {
      if (!(await isEnabled())) return { verified: false };
      const key = normalizeEmail(email);
      if (code) {
        await checkCode('signup', key, code);
        return { verified: true };
      }
      if (await providerDownPass('signup', key)) return { verified: false };
      throw new HttpsError('failed-precondition', SIGNUP_ON_WEBSITE);
    },

    /** After registerUser made the account. */
    async finishSignup(email, uid, verified) {
      if (!verified) return;
      await markVerified(uid).catch(() => {});
      await discardCode('signup', normalizeEmail(email));
    },
  };
}

module.exports = {
  createEmailCodes, maskEmail, codeEmail, normalizeEmail,
  CODE_TTL_MS, RESEND_WAIT_MS, MAX_SENDS_PER_DAY, MAX_WRONG_TRIES, RECHECK_AFTER_MS, SIGNUP_ON_WEBSITE,
};
