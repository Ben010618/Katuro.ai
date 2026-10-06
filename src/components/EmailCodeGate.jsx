import { useEffect, useRef, useState } from 'react';
import { signOut } from 'firebase/auth';
import { LogOut as LogOutIcon, Mail } from 'lucide-react';
import ktLogo from '../assets/KT-Favicon.webp';
import { auth } from '../firebase';
import { useEmailCodeGate } from '../hooks/useEmailCodeGate';
import { sendSignInCode, verifySignInCode, cleanCode, giveVisitPass } from '../services/emailCode';

const S = {
  page: { display: 'flex', minHeight: '100vh', alignItems: 'center', justifyContent: 'center', background: '#f5faf7', padding: 24 },
  card: { width: '100%', maxWidth: 420, background: '#fff', border: '1px solid rgba(45,106,79,0.15)', borderRadius: 14, padding: '28px 26px', textAlign: 'center', boxShadow: '0 6px 24px rgba(13,34,24,0.06)' },
  icon: { width: 56, height: 56, borderRadius: 16, background: '#e3f1e8', display: 'grid', placeItems: 'center', margin: '0 auto 16px' },
  title: { margin: '0 0 8px', fontSize: 21, fontWeight: 700, color: '#0d2218', fontFamily: '"Playfair Display", serif' },
  text: { margin: '0 0 20px', fontSize: 14, color: '#4a6357', lineHeight: 1.6 },
  input: { width: '100%', boxSizing: 'border-box', fontSize: 26, letterSpacing: 10, textAlign: 'center', padding: '10px 12px', border: '1px solid rgba(45,106,79,0.3)', borderRadius: 10, outline: 'none', color: '#0d2218', fontWeight: 700 },
  primary: { width: '100%', marginTop: 14, background: '#2d6a4f', color: '#fff', border: 'none', borderRadius: 10, padding: '11px 16px', fontSize: 14, fontWeight: 700, cursor: 'pointer' },
  error: { margin: '12px 0 0', fontSize: 13, color: '#b42318', lineHeight: 1.5 },
  row: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 18, gap: 10 },
  link: { background: 'none', border: 'none', padding: 0, fontSize: 13, fontWeight: 600, color: '#2d6a4f', cursor: 'pointer' },
  muted: { fontSize: 13, color: '#7b8f84' },
  out: { display: 'inline-flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', padding: 0, fontSize: 13, fontWeight: 600, color: '#4a6357', cursor: 'pointer' },
};

/** The "check your email" screen shown on website sign-in (see useEmailCodeGate). */
export function EmailCodeScreen({ uid, onPass }) {
  const [phase, setPhase] = useState('sending'); // sending | ready | error
  const [sentTo, setSentTo] = useState('');
  const [wait, setWait] = useState(0);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const started = useRef(false);

  async function send() {
    setPhase('sending'); setError('');
    try {
      const r = await sendSignInCode();
      if (!r?.required) { giveVisitPass(uid); onPass(); return; } // codes off, or the email service is down
      setSentTo(r.sentTo || 'your email');
      setWait(r.waitSec || 60);
      setPhase('ready');
    } catch (err) {
      setError(err.message);
      setPhase('error');
    }
  }

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    send();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (wait <= 0) return undefined;
    const id = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(id);
  }, [wait]);

  async function verify(e) {
    e.preventDefault();
    if (code.length !== 6) { setError('Please type the 6-digit code.'); return; }
    setBusy(true); setError('');
    try {
      await verifySignInCode(code);
      onPass();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={S.page}>
      <div style={S.card}>
        <img src={ktLogo} alt="kaTuro AI" style={{ width: 34, height: 34, borderRadius: 9, margin: '0 auto 14px', display: 'block', objectFit: 'cover' }} />
        <div style={S.icon}><Mail size={26} color="#2d6a4f" /></div>
        <h2 style={S.title}>Check your email</h2>
        {phase === 'sending' && <p style={S.text}>Sending a 6-digit code to your email…</p>}
        {phase === 'error' && (
          <>
            <p style={S.text}>We could not send your code.</p>
            {error && <p style={{ ...S.error, margin: '0 0 16px' }}>{error}</p>}
            <button type="button" style={S.primary} onClick={send}>Try again</button>
          </>
        )}
        {phase === 'ready' && (
          <form onSubmit={verify}>
            <p style={S.text}>
              For your security, we sent a 6-digit code to <strong style={{ color: '#0d2218' }}>{sentTo}</strong>. It expires in 10 minutes.
              Check your spam folder if you do not see it.
            </p>
            <input
              aria-label="6-digit code"
              style={S.input}
              value={code}
              onChange={(e) => { setCode(cleanCode(e.target.value)); setError(''); }}
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="000000"
              autoFocus
            />
            {error && <p style={S.error}>{error}</p>}
            <button type="submit" style={{ ...S.primary, opacity: busy ? 0.7 : 1 }} disabled={busy}>
              {busy ? 'Checking…' : 'Continue'}
            </button>
          </form>
        )}
        <div style={S.row}>
          {phase === 'ready' ? (
            wait > 0
              ? <span style={S.muted}>Send a new code in {wait}s</span>
              : <button type="button" style={S.link} onClick={send}>Send a new code</button>
          ) : <span />}
          <button type="button" style={S.out} onClick={() => signOut(auth)}><LogOutIcon size={14} /> Sign out</button>
        </div>
      </div>
    </div>
  );
}

/** Website pages: shows the email-code screen when this teacher needs one, else the page. */
export default function EmailCodeGate({ uid, fallback = null, children }) {
  const status = useEmailCodeGate(uid);
  const [passedFor, setPassedFor] = useState(null);
  if (passedFor === uid || status === 'pass') return children;
  if (status === 'loading') return fallback;
  return <EmailCodeScreen key={uid} uid={uid} onPass={() => setPassedFor(uid)} />;
}
