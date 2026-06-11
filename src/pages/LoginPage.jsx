import { useState } from 'react';
import { signInWithEmailAndPassword, sendPasswordResetEmail } from 'firebase/auth';
import { auth } from '../firebase';
import { Loader2, Eye, EyeOff, FileText, BarChart3 } from 'lucide-react';
import ktLogo from '../assets/KT Favicon.png';

/* ── animations + overrides ─────────────────────────────────────────────── */
const CSS = `
  @keyframes kt-tile-in {
    from { opacity: 0; transform: scale(0.85); }
    to   { opacity: 1; transform: scale(1); }
  }
  @keyframes kt-slide-left {
    from { opacity: 0; transform: translateX(-32px); }
    to   { opacity: 1; transform: translateX(0); }
  }
  @keyframes kt-slide-right {
    from { opacity: 0; transform: translateX(32px); }
    to   { opacity: 1; transform: translateX(0); }
  }
  @keyframes kt-float-a {
    0%, 100% { transform: translateY(0px); }
    50%      { transform: translateY(-8px); }
  }
  @keyframes kt-float-b {
    0%, 100% { transform: translateY(0px); }
    50%      { transform: translateY(-6px); }
  }
  @keyframes kt-brand-in {
    from { opacity: 0; transform: translateY(20px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  @keyframes kt-form-in {
    from { opacity: 0; transform: translateY(28px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  @keyframes kt-field-in {
    from { opacity: 0; transform: translateY(14px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  @keyframes kt-shake {
    0%,100%{ transform:translateX(0); }
    20%    { transform:translateX(-7px); }
    40%    { transform:translateX(7px); }
    60%    { transform:translateX(-4px); }
    80%    { transform:translateX(4px); }
  }
  @keyframes kt-badge-in {
    from { opacity: 0; transform: translateY(10px); }
    to   { opacity: 1; transform: translateY(0); }
  }

  /* tile stagger */
  .kt-tile { opacity: 0; animation: kt-tile-in 0.5s ease forwards; }
  .kt-tile:nth-child(1){ animation-delay:0.04s }
  .kt-tile:nth-child(2){ animation-delay:0.08s }
  .kt-tile:nth-child(3){ animation-delay:0.12s }
  .kt-tile:nth-child(4){ animation-delay:0.16s }
  .kt-tile:nth-child(5){ animation-delay:0.20s }
  .kt-tile:nth-child(6){ animation-delay:0.24s }
  .kt-tile:nth-child(7){ animation-delay:0.28s }
  .kt-tile:nth-child(8){ animation-delay:0.32s }
  .kt-tile:nth-child(9){ animation-delay:0.36s }

  /* card entrance wrappers → float containers */
  .kt-card-wrap-1 { animation: kt-slide-left 0.65s cubic-bezier(0.16,1,0.3,1) 0.35s both; }
  .kt-card-wrap-2 { animation: kt-slide-right 0.65s cubic-bezier(0.16,1,0.3,1) 0.55s both; }
  .kt-float-1 { animation: kt-float-a 4.5s ease-in-out 1.2s infinite; }
  .kt-float-2 { animation: kt-float-b 5s ease-in-out 2s infinite; }

  .kt-brand-wrap { animation: kt-brand-in 0.7s ease 0.75s both; }

  .kt-form-wrap { animation: kt-form-in 0.65s cubic-bezier(0.16,1,0.3,1) 0.1s both; }

  .kt-f1 { opacity:0; animation: kt-field-in 0.45s ease 0.3s forwards; }
  .kt-f2 { opacity:0; animation: kt-field-in 0.45s ease 0.42s forwards; }
  .kt-f3 { opacity:0; animation: kt-field-in 0.45s ease 0.54s forwards; }
  .kt-f4 { opacity:0; animation: kt-field-in 0.45s ease 0.66s forwards; }
  .kt-f5 { opacity:0; animation: kt-badge-in 0.45s ease 0.82s forwards; }

  .kt-error-shake { animation: kt-shake 0.42s ease; }

  .kt-pw-input { padding-right: 42px !important; }

  /* right panel base + background image overlay */
  .kt-right {
    position: relative;
    overflow: hidden;
    background: #f5faf7;
  }
  .kt-right::before {
    content: '';
    position: absolute;
    inset: 0;
    background-image: url('/src/assets/WelcomePage.png');
    background-size: cover;
    background-position: center;
    opacity: 0.12;
    z-index: 0;
  }

  @media (max-width: 768px) {
    .kt-left { display: none !important; }
    .kt-right { padding: 24px 16px !important; }
  }
`;

export default function LoginPage() {
  const [mode,      setMode]      = useState('login'); // 'login' | 'reset'
  const [email,     setEmail]     = useState('');
  const [password,  setPassword]  = useState('');
  const [showPw,    setShowPw]    = useState(false);
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState('');
  const [resetSent, setResetSent] = useState(false);
  const [shake,     setShake]     = useState(false);

  function triggerShake() {
    setShake(true);
    setTimeout(() => setShake(false), 500);
  }

  async function handleLogin(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email, password);
      /* redirect handled by PublicRoute / App.jsx */
    } catch (err) {
      const msg = err.message.replace('Firebase: ', '').replace(/ \(auth.*\)\.?/, '');
      setError(msg);
      triggerShake();
    } finally {
      setLoading(false);
    }
  }

  async function handleReset(e) {
    e.preventDefault();
    if (!email.trim()) { setError('Enter your email address above first.'); triggerShake(); return; }
    setError('');
    setLoading(true);
    try {
      await sendPasswordResetEmail(auth, email.trim());
      setResetSent(true);
    } catch (err) {
      setError(err.message.replace('Firebase: ', '').replace(/ \(auth.*\)\.?/, ''));
      triggerShake();
    } finally {
      setLoading(false);
    }
  }

  function switchMode(m) {
    setMode(m);
    setError('');
    setResetSent(false);
  }

  /* ── render ─────────────────────────────────────────────────────────── */
  return (
    <>
      <style>{CSS}</style>

      <div style={{
        display: 'flex', minHeight: '100vh',
        fontFamily: '"Plus Jakarta Sans", "DM Sans", sans-serif',
        background: '#0d2218',
      }}>

        {/* ════════════ LEFT PANEL ════════════ */}
        <div className="kt-left" style={{
          width: '44%', flexShrink: 0, position: 'relative', overflow: 'hidden',
          background: 'linear-gradient(160deg, #0f2d1e 0%, #1a4d33 50%, #0d2218 100%)',
          display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
          padding: '40px',
        }}>

          {/* Grid tile texture */}
          <div style={{
            position: 'absolute', inset: 0,
            display: 'grid',
            gridTemplateColumns: '1fr 1fr 1fr',
            gridTemplateRows: '1fr 1fr 1fr',
            gap: 7, padding: 7,
            pointerEvents: 'none',
          }}>
            {Array.from({ length: 9 }).map((_, i) => (
              <div key={i} className="kt-tile" style={{
                borderRadius: 10,
                background: 'rgba(255,255,255,0.13)',
              }} />
            ))}
          </div>

          {/* Accent card 1 — Amber */}
          <div className="kt-card-wrap-1" style={{
            position: 'absolute', top: 72, left: 36,
          }}>
            <div className="kt-float-1" style={{
              background: '#e8a320', borderRadius: 14,
              padding: '22px 26px', maxWidth: 210,
              boxShadow: '0 16px 40px rgba(232,163,32,0.35)',
            }}>
              <div style={{
                fontFamily: '"Playfair Display", Georgia, serif',
                fontSize: 42, fontWeight: 700, color: '#fff', lineHeight: 1,
              }}>3–5 hrs</div>
              <div style={{
                fontSize: 11, color: 'rgba(255,255,255,0.88)', marginTop: 7,
                lineHeight: 1.5, fontWeight: 400,
              }}>saved per teacher, per week with AI lesson prep</div>
            </div>
          </div>

          {/* Accent card 2 — Green */}
          <div className="kt-card-wrap-2" style={{
            position: 'absolute', top: 248, right: 32,
          }}>
            <div className="kt-float-2" style={{
              background: '#2d6a4f', borderRadius: 14,
              padding: '20px 24px', maxWidth: 195,
              border: '1px solid rgba(255,255,255,0.14)',
              boxShadow: '0 12px 32px rgba(0,0,0,0.35)',
            }}>
              <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                <div style={{
                  width: 32, height: 32, borderRadius: 8,
                  background: 'rgba(82,183,136,0.2)',
                  display: 'grid', placeItems: 'center',
                }}>
                  <FileText size={14} color="#52b788" />
                </div>
                <div style={{
                  width: 32, height: 32, borderRadius: 8,
                  background: 'rgba(232,163,32,0.2)',
                  display: 'grid', placeItems: 'center',
                }}>
                  <BarChart3 size={14} color="#e8a320" />
                </div>
              </div>
              <div style={{
                fontFamily: '"Playfair Display", Georgia, serif',
                fontSize: 28, fontWeight: 700, color: '#52b788', lineHeight: 1,
              }}>AI-Powered</div>
              <div style={{
                fontSize: 11, color: 'rgba(255,255,255,0.7)', marginTop: 7,
                lineHeight: 1.5, fontWeight: 400,
              }}>DLL, quizzes &amp; slides — auto-generated from one upload</div>
            </div>
          </div>

          {/* Brand footer */}
          <div className="kt-brand-wrap" style={{ position: 'relative', zIndex: 2 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}>
              <img
                src={ktLogo}
                alt="kaTuro AI"
                style={{ width: 40, height: 40, borderRadius: 10, objectFit: 'cover', flexShrink: 0 }}
              />
              <div style={{
                fontFamily: '"Playfair Display", Georgia, serif',
                fontSize: 32, fontWeight: 700, color: '#fff', letterSpacing: '-0.5px',
              }}>kaTuro</div>
            </div>
            <div style={{
              fontSize: 11, color: 'rgba(255,255,255,0.5)', marginTop: 5,
              fontWeight: 300, letterSpacing: '0.8px', textTransform: 'uppercase',
              fontFamily: '"DM Sans", sans-serif',
            }}>AI Co-Teacher for Filipino Classrooms</div>
          </div>
        </div>

        {/* ════════════ RIGHT PANEL ════════════ */}
        <div className="kt-right" style={{
          flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '48px 32px',
          overflowY: 'auto',
        }}>
          {/* login card */}
          <div className="kt-form-wrap" style={{
            background: '#ffffff',
            borderRadius: 16,
            padding: '40px 44px',
            boxShadow: '0 8px 32px rgba(13,34,24,0.10), 0 2px 8px rgba(13,34,24,0.06), 0 0 0 1px rgba(45,106,79,0.08)',
            width: '100%',
            maxWidth: 420,
            position: 'relative',
            zIndex: 2,
          }}>

            {/* Top note */}
            <div className="kt-f1" style={{
              textAlign: 'right', fontSize: 13, color: '#4a6357',
              marginBottom: 40, fontFamily: '"DM Sans", sans-serif',
            }}>
              Need access?{' '}
              <span style={{ color: '#2d6a4f', fontWeight: 500 }}>Contact your administrator</span>
            </div>

            {/* Heading */}
            <div className="kt-f2">
              <h1 style={{
                fontFamily: '"Playfair Display", Georgia, serif',
                fontSize: 28, fontWeight: 600, color: '#0d2218', marginBottom: 6,
              }}>
                {mode === 'reset' ? 'Reset password' : <>Sign in to <span style={{ color: '#2d6a4f' }}>kaTuro</span></>}
              </h1>
              <p style={{
                fontSize: 13, color: '#4a6357', marginBottom: 30,
                fontWeight: 300, fontFamily: '"DM Sans", sans-serif',
              }}>
                {mode === 'reset'
                  ? "Enter your email — we'll send a reset link right away."
                  : 'Welcome back, Teacher. Enter your credentials to continue.'}
              </p>
            </div>

            {/* ── RESET SUCCESS ── */}
            {resetSent ? (
              <div style={{
                background: '#d8f3dc', border: '1px solid rgba(45,106,79,0.25)',
                borderRadius: 10, padding: '16px 18px', marginBottom: 20,
              }}>
                <p style={{ fontSize: 14, fontWeight: 600, color: '#1a3d2b', margin: 0 }}>
                  ✓ Reset link sent!
                </p>
                <p style={{ fontSize: 13, color: '#4a6357', margin: '4px 0 0' }}>
                  Check your inbox at <strong>{email}</strong>. Follow the link to set a new password.
                </p>
                <button
                  onClick={() => switchMode('login')}
                  style={{
                    marginTop: 12, background: 'none', border: 'none',
                    cursor: 'pointer', fontSize: 12, fontWeight: 600, color: '#2d6a4f',
                    padding: 0, fontFamily: 'inherit',
                  }}
                >
                  ← Back to sign in
                </button>
              </div>
            ) : (

              /* ── FORM ── */
              <form
                className={shake ? 'kt-error-shake' : ''}
                onSubmit={mode === 'login' ? handleLogin : handleReset}
                style={{ display: 'flex', flexDirection: 'column', gap: 0 }}
              >

                {/* Email */}
                <div className="kt-f3" style={{ marginBottom: 14 }}>
                  <label style={{
                    display: 'block', fontSize: 11, fontWeight: 500,
                    color: '#4a6357', marginBottom: 5,
                    textTransform: 'uppercase', letterSpacing: '0.7px',
                    fontFamily: '"DM Sans", sans-serif',
                  }}>Email Address</label>
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="you@deped.gov.ph"
                    required
                    disabled={loading}
                    style={{
                      width: '100%', height: 42,
                      border: '0.5px solid rgba(45,106,79,0.25)', borderRadius: 9,
                      padding: '0 14px', fontSize: 14,
                      fontFamily: '"DM Sans", sans-serif',
                      background: '#fff', color: '#0d2218',
                      outline: 'none', transition: 'border 0.15s, box-shadow 0.15s',
                    }}
                    onFocus={e => { e.target.style.borderColor = '#2d6a4f'; e.target.style.boxShadow = '0 0 0 3px rgba(45,106,79,0.12)'; }}
                    onBlur={e  => { e.target.style.borderColor = 'rgba(45,106,79,0.25)'; e.target.style.boxShadow = 'none'; }}
                  />
                </div>

                {/* Password — only in login mode */}
                {mode === 'login' && (
                  <div className="kt-f4" style={{ marginBottom: 6 }}>
                    <label style={{
                      display: 'block', fontSize: 11, fontWeight: 500,
                      color: '#4a6357', marginBottom: 5,
                      textTransform: 'uppercase', letterSpacing: '0.7px',
                      fontFamily: '"DM Sans", sans-serif',
                    }}>Password</label>
                    <div style={{ position: 'relative' }}>
                      <input
                        type={showPw ? 'text' : 'password'}
                        value={password}
                        onChange={e => setPassword(e.target.value)}
                        placeholder="••••••••"
                        required
                        disabled={loading}
                        style={{
                          width: '100%', height: 42,
                          border: '0.5px solid rgba(45,106,79,0.25)', borderRadius: 9,
                          padding: '0 42px 0 14px', fontSize: 14,
                          fontFamily: '"DM Sans", sans-serif',
                          background: '#fff', color: '#0d2218',
                          outline: 'none', transition: 'border 0.15s, box-shadow 0.15s',
                        }}
                        onFocus={e => { e.target.style.borderColor = '#2d6a4f'; e.target.style.boxShadow = '0 0 0 3px rgba(45,106,79,0.12)'; }}
                        onBlur={e  => { e.target.style.borderColor = 'rgba(45,106,79,0.25)'; e.target.style.boxShadow = 'none'; }}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPw(v => !v)}
                        tabIndex={-1}
                        style={{
                          position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
                          background: 'none', border: 'none', cursor: 'pointer',
                          color: '#4a6357', display: 'flex', padding: 2,
                        }}
                      >
                        {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
                      </button>
                    </div>
                  </div>
                )}

                {/* Forgot / Back row */}
                <div style={{ textAlign: 'right', marginBottom: 20 }}>
                  {mode === 'login' ? (
                    <button type="button" onClick={() => switchMode('reset')} style={{
                      background: 'none', border: 'none', cursor: 'pointer',
                      fontSize: 12, color: '#2d6a4f', fontWeight: 500,
                      fontFamily: '"DM Sans", sans-serif', padding: 0,
                    }}>
                      Forgot password?
                    </button>
                  ) : (
                    <button type="button" onClick={() => switchMode('login')} style={{
                      background: 'none', border: 'none', cursor: 'pointer',
                      fontSize: 12, color: '#2d6a4f', fontWeight: 500,
                      fontFamily: '"DM Sans", sans-serif', padding: 0,
                    }}>
                      ← Back to sign in
                    </button>
                  )}
                </div>

                {/* Error */}
                {error && (
                  <div style={{
                    background: '#fde8e8', border: '1px solid rgba(224,92,92,0.25)',
                    borderRadius: 8, padding: '9px 14px', marginBottom: 14,
                    fontSize: 13, color: '#e05c5c', fontWeight: 500,
                    fontFamily: '"DM Sans", sans-serif',
                  }}>
                    {error}
                  </div>
                )}

                {/* Submit button */}
                <button
                  type="submit"
                  disabled={loading || !email || (mode === 'login' && !password)}
                  style={{
                    width: '100%', height: 44,
                    background: loading || !email || (mode === 'login' && !password) ? 'rgba(45,106,79,0.45)' : '#2d6a4f',
                    color: '#fff', border: 'none', borderRadius: 9,
                    fontSize: 14, fontWeight: 500, cursor: loading ? 'not-allowed' : !email || (mode === 'login' && !password) ? 'not-allowed' : 'pointer',
                    fontFamily: '"DM Sans", sans-serif',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    letterSpacing: '0.3px',
                    transition: 'background 0.15s, transform 0.1s',
                  }}
                  onMouseEnter={e => { if (!loading && email && (mode === 'reset' || password)) e.currentTarget.style.background = '#1b4d37'; }}
                  onMouseLeave={e => { if (!loading && email && (mode === 'reset' || password)) e.currentTarget.style.background = '#2d6a4f'; }}
                  onMouseDown={e  => { if (!loading) e.currentTarget.style.transform = 'scale(0.99)'; }}
                  onMouseUp={e    => { e.currentTarget.style.transform = 'scale(1)'; }}
                >
                  {loading && <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} />}
                  {loading
                    ? (mode === 'reset' ? 'Sending…' : 'Signing in…')
                    : (mode === 'reset' ? 'Send Reset Link' : 'Login')}
                </button>
              </form>
            )}

            {/* Plan badge */}
            <div className="kt-f5" style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              fontSize: 11, background: '#e8f5ee', color: '#1b5e38',
              borderRadius: 20, padding: '4px 12px', marginTop: 18,
              fontWeight: 500, fontFamily: '"DM Sans", sans-serif',
            }}>
              ✦ Free Plan available — No credit card required
            </div>

          </div>
        </div>
      </div>
    </>
  );
}
