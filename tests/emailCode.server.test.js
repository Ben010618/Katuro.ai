import { describe, it, expect, beforeEach } from 'vitest';
import { createRequire } from 'module';
import path from 'path';

const require = createRequire(path.resolve(__dirname, '../functions/index.js'));
const { createEmailCodes, maskEmail, codeEmail, SIGNUP_ON_WEBSITE } = require('./emailCode.js');

class HttpsError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

function fakeDb() {
  const docs = new Map();
  const ref = (p) => ({
    path: p,
    async get() { const d = docs.get(p); return { exists: Boolean(d), data: () => d }; },
    async set(data, opts) { docs.set(p, opts?.merge ? { ...(docs.get(p) || {}), ...data } : { ...data }); },
    async delete() { docs.delete(p); },
  });
  return {
    docs,
    doc: ref,
    async runTransaction(fn) {
      return fn({ get: (r) => r.get(), set: (r, data, opts) => { r.set(data, opts); } });
    },
  };
}

let db; let sent; let clock; let mailFails; let codes;
const lastCode = () => sent.at(-1).text.match(/\b(\d{6})\b/)[1];
const signupReq = (email, ip = '1.2.3.4') => ({ data: { purpose: 'signup', email }, rawRequest: { ip } });
const signinReq = (data = {}) => ({ data: { purpose: 'signin', ...data }, auth: { uid: 'u1', token: { email: 'Ben@Gmail.com' } } });
const noAccount = { userExists: async () => false };

beforeEach(() => {
  db = fakeDb();
  sent = [];
  clock = Date.UTC(2026, 9, 6, 4, 0, 0);
  mailFails = null;
  const fetchFn = async (url, init) => {
    expect(url).toBe('https://api.resend.com/emails');
    expect(init.headers.Authorization).toBe('Bearer re_test');
    if (mailFails) return { ok: false, status: mailFails, json: async () => ({ message: 'nope' }) };
    const body = JSON.parse(init.body);
    sent.push({ to: body.to[0], from: body.from, subject: body.subject, text: body.text });
    return { ok: true, status: 200, json: async () => ({ id: 'x' }) };
  };
  codes = createEmailCodes({ db, fetchFn, HttpsError, now: () => clock });
  db.docs.set('adminConfig/emailCode', { enabled: true });
  db.docs.set('adminConfig/resend', { apiKey: 're_test' });
});

describe('email codes — switched off', () => {
  it('nothing changes for anyone until the admin turns codes on', async () => {
    db.docs.set('adminConfig/emailCode', { enabled: false });
    expect(await codes.sendCode(signupReq('a@b.co'), noAccount)).toEqual({ required: false });
    expect(await codes.sendCode(signinReq(), noAccount)).toEqual({ required: false });
    expect(await codes.checkSignup('a@b.co')).toEqual({ verified: false });
    expect(sent).toHaveLength(0);
  });
});

describe('email codes — website sign-up', () => {
  it('emails a 6-digit code and only a hash of it is stored', async () => {
    const r = await codes.sendCode(signupReq('  Teacher@Gmail.com '), noAccount);
    expect(r).toEqual({ required: true, sentTo: 't******@gmail.com', waitSec: 60 });
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe('teacher@gmail.com');
    expect(sent[0].from).toBe('KaTuro AI <no-reply@katuro.website>');
    const code = lastCode();
    const stored = [...db.docs.entries()].find(([k]) => k.startsWith('emailCodes/'))[1];
    expect(JSON.stringify(stored)).not.toContain(code);
  });

  it('the right code creates the account and is used up; a wrong code counts down', async () => {
    await codes.sendCode(signupReq('t@gmail.com'), noAccount);
    const code = lastCode();
    const wrong = code === '000000' ? '111111' : '000000';
    await expect(codes.checkSignup('t@gmail.com', wrong)).rejects.toThrow('4 tries left');
    expect(await codes.checkSignup('T@gmail.com', code)).toEqual({ verified: true });
    await codes.finishSignup('t@gmail.com', 'newUid', true);
    expect(db.docs.get('emailChecks/newUid')).toEqual({ verifiedAt: clock });
    await expect(codes.checkSignup('t@gmail.com', code)).rejects.toThrow('ask for a code first');
  });

  it('5 wrong tries lock the code; a new code is needed', async () => {
    await codes.sendCode(signupReq('t@gmail.com'), noAccount);
    const code = lastCode();
    const wrong = code === '000000' ? '111111' : '000000';
    for (let i = 0; i < 4; i++) await expect(codes.checkSignup('t@gmail.com', wrong)).rejects.toThrow(/left/);
    await expect(codes.checkSignup('t@gmail.com', wrong)).rejects.toThrow('Too many wrong tries');
    await expect(codes.checkSignup('t@gmail.com', code)).rejects.toThrow('Too many wrong tries');
  });

  it('codes expire after 10 minutes', async () => {
    await codes.sendCode(signupReq('t@gmail.com'), noAccount);
    const code = lastCode();
    clock += 10 * 60 * 1000;
    await expect(codes.checkSignup('t@gmail.com', code)).rejects.toThrow('expired');
  });

  it('no account without a code (KaTuroDesk and old apps are sent to the website)', async () => {
    await expect(codes.checkSignup('t@gmail.com')).rejects.toThrow(SIGNUP_ON_WEBSITE);
  });

  it('an email that already has an account gets no code', async () => {
    await expect(codes.sendCode(signupReq('t@gmail.com'), { userExists: async () => true })).rejects.toThrow('already exists');
    expect(sent).toHaveLength(0);
  });

  it('bad addresses are refused', async () => {
    for (const bad of ['', 'nope', 'a@b', 'a b@c.com']) {
      await expect(codes.sendCode(signupReq(bad), noAccount)).rejects.toThrow('not valid');
    }
  });

  it('resend waits 60 s; at most 5 codes per email per day', async () => {
    await codes.sendCode(signupReq('t@gmail.com'), noAccount);
    const again = await codes.sendCode(signupReq('t@gmail.com'), noAccount);
    expect(again.waitSec).toBe(60);
    expect(sent).toHaveLength(1); // same code still valid, no new email
    for (let i = 0; i < 4; i++) { clock += 61000; await codes.sendCode(signupReq('t@gmail.com'), noAccount); }
    expect(sent).toHaveLength(5);
    clock += 61000;
    await expect(codes.sendCode(signupReq('t@gmail.com'), noAccount)).rejects.toThrow('5 codes today');
    clock += 24 * 60 * 60 * 1000; // next day
    await codes.sendCode(signupReq('t@gmail.com'), noAccount);
    expect(sent).toHaveLength(6);
  });

  it('one network can ask for at most 20 sign-up codes a day', async () => {
    for (let i = 0; i < 20; i++) await codes.sendCode(signupReq(`t${i}@gmail.com`), noAccount);
    await expect(codes.sendCode(signupReq('t99@gmail.com'), noAccount)).rejects.toThrow('this network');
    await codes.sendCode(signupReq('t99@gmail.com', '5.6.7.8'), noAccount); // another network is fine
  });

  it('if the email service fails, sign-up still goes ahead (unverified, for 15 minutes)', async () => {
    mailFails = 500;
    expect(await codes.sendCode(signupReq('t@gmail.com'), noAccount)).toEqual({ required: false, providerDown: true });
    expect(await codes.checkSignup('t@gmail.com')).toEqual({ verified: false });
    await codes.finishSignup('t@gmail.com', 'newUid', false);
    expect(db.docs.has('emailChecks/newUid')).toBe(false); // next website sign-in asks for a code
    clock += 16 * 60 * 1000;
    await expect(codes.checkSignup('t@gmail.com')).rejects.toThrow(SIGNUP_ON_WEBSITE);
  });

  it('a missing Resend key counts as the email service failing (nobody is locked out)', async () => {
    db.docs.set('adminConfig/resend', {});
    expect(await codes.sendCode(signupReq('t@gmail.com'), noAccount)).toEqual({ required: false, providerDown: true });
  });
});

describe('email codes — website sign-in', () => {
  it('sends to the signed-in account and records the check', async () => {
    const r = await codes.sendCode(signinReq(), noAccount);
    expect(r.sentTo).toBe('b**@gmail.com');
    expect(sent[0].to).toBe('ben@gmail.com');
    await expect(codes.verifySignIn({ data: { code: '12' }, auth: { uid: 'u1' } })).rejects.toThrow('not right');
    await codes.verifySignIn({ data: { code: ` ${lastCode().slice(0, 3)} ${lastCode().slice(3)} ` }, auth: { uid: 'u1' } });
    expect(db.docs.get('emailChecks/u1')).toEqual({ verifiedAt: clock });
  });

  it('a code for one teacher does not work for another', async () => {
    await codes.sendCode(signinReq(), noAccount);
    await expect(codes.verifySignIn({ data: { code: lastCode() }, auth: { uid: 'u2' } })).rejects.toThrow('ask for a code first');
  });

  it('requires sign-in', async () => {
    await expect(codes.sendCode({ data: { purpose: 'signin' } }, noAccount)).rejects.toThrow('sign in');
    await expect(codes.verifySignIn({ data: { code: '123456' } })).rejects.toThrow('sign in');
  });
});

describe('email text', () => {
  it('is plain and professional', () => {
    const m = codeEmail('482913');
    expect(m.subject).toBe('Your KaTuro code: 482913');
    expect(m.text).toContain('expires in 10 minutes');
    expect(m.html).toContain('482913');
    expect(maskEmail('ab@x.com')).toBe('a*@x.com');
    expect(maskEmail('a@x.com')).toBe('a*@x.com');
  });
});
