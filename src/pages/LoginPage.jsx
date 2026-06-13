import { useState, useEffect } from 'react';
import { signInWithEmailAndPassword, sendPasswordResetEmail } from 'firebase/auth';
import { auth } from '../firebase';
import { Loader2, Eye, EyeOff, Gift, GraduationCap } from 'lucide-react';
import ktLogo from '../assets/KT Favicon.png';
import { selfSignUp } from '../services/db';

import bg1 from '../assets/1.png';
import bg2 from '../assets/2.png';
import bg3 from '../assets/3.png';
import bg4 from '../assets/4.png';
import bg5 from '../assets/5.png';
import bg6 from '../assets/6.png';
import bg7 from '../assets/7.png';

const SLIDES = [bg1, bg2, bg3, bg4, bg5, bg6, bg7];

const PARTICLES = [
  { top: '8%',  left: '6%',  size: 3, delay: '0s',   dur: '7s',   color: '#52b788' },
  { top: '20%', left: '92%', size: 4, delay: '1.2s', dur: '6s',   color: '#e8a320' },
  { top: '58%', left: '3%',  size: 2, delay: '0.6s', dur: '8.5s', color: '#b7e4c7' },
  { top: '82%', left: '90%', size: 3, delay: '2.1s', dur: '5.5s', color: '#52b788' },
  { top: '42%', left: '14%', size: 2, delay: '3.3s', dur: '9s',   color: '#e8a320' },
  { top: '70%', left: '80%', size: 4, delay: '1.8s', dur: '7.5s', color: '#b7e4c7' },
  { top: '14%', left: '62%', size: 2, delay: '4.2s', dur: '6.5s', color: '#52b788' },
  { top: '91%', left: '38%', size: 3, delay: '2.8s', dur: '8s',   color: '#e8a320' },
  { top: '33%', left: '97%', size: 2, delay: '0.4s', dur: '10s',  color: '#b7e4c7' },
  { top: '75%', left: '20%', size: 3, delay: '3.6s', dur: '7s',   color: '#52b788' },
  { top: '50%', left: '50%', size: 2, delay: '5s',   dur: '11s',  color: '#e8a320' },
  { top: '28%', left: '45%', size: 3, delay: '1s',   dur: '8s',   color: '#b7e4c7' },
];

const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;700&family=Plus+Jakarta+Sans:wght@300;400;500;600;700&display=swap');

  @keyframes spin        { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
  @keyframes kt-spin-cw  { from { transform: rotate(0deg);   } to { transform: rotate(360deg);  } }
  @keyframes kt-spin-ccw { from { transform: rotate(360deg); } to { transform: rotate(0deg);    } }

  @keyframes kt-float {
    0%, 100% { transform: translateY(0)    opacity: 0.55; }
    50%       { transform: translateY(-16px); opacity: 0.9; }
  }
  @keyframes kt-blob {
    0%,100% { transform: translate(0,0)       scale(1);    }
    33%      { transform: translate(28px,-18px) scale(1.04); }
    66%      { transform: translate(-14px,22px) scale(0.97); }
  }
  @keyframes kt-card-in {
    from { opacity:0; transform: translateY(30px) scale(0.97); }
    to   { opacity:1; transform: translateY(0)    scale(1);    }
  }
  @keyframes kt-brand-in {
    from { opacity:0; transform: translateY(-16px); }
    to   { opacity:1; transform: translateY(0);     }
  }
  @keyframes kt-shake {
    0%,100%{ transform:translateX(0); }
    20%    { transform:translateX(-8px); }
    40%    { transform:translateX(8px); }
    60%    { transform:translateX(-5px); }
    80%    { transform:translateX(5px); }
  }
  @keyframes kt-pulse-ring {
    0%   { transform: scale(1);    opacity: 0.4; }
    100% { transform: scale(1.35); opacity: 0;   }
  }

  .kt-brand-wrap  { animation: kt-brand-in 0.8s cubic-bezier(0.16,1,0.3,1) 0.1s both; }
  .kt-card        { animation: kt-card-in  0.8s cubic-bezier(0.16,1,0.3,1) 0.3s both; }
  .kt-shake       { animation: kt-shake 0.42s ease; }

  .kt-input {
    width: 100%;
    box-sizing: border-box;
    height: 48px;
    padding: 0 16px;
    border: 1.5px solid #e4ede9;
    border-radius: 12px;
    font-size: 14px;
    font-family: "Plus Jakarta Sans", sans-serif;
    background: #f6faf8;
    color: #0d2218;
    outline: none;
    transition: border-color 0.2s, box-shadow 0.2s, background 0.2s;
  }
  .kt-input:focus {
    border-color: #2d6a4f;
    background: #fff;
    box-shadow: 0 0 0 4px rgba(45,106,79,0.1);
  }
  .kt-input:disabled { opacity: 0.6; cursor: not-allowed; }
  .kt-input::placeholder { color: #b4cbbf; }
  .kt-input-pw { padding-right: 48px !important; }

  .kt-label {
    display: block;
    font-size: 11px;
    font-weight: 700;
    color: #3d6254;
    text-transform: uppercase;
    letter-spacing: 0.09em;
    margin-bottom: 6px;
  }

  .kt-btn {
    width: 100%;
    height: 50px;
    border: none;
    border-radius: 13px;
    font-size: 14px;
    font-weight: 600;
    font-family: "Plus Jakarta Sans", sans-serif;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    letter-spacing: 0.2px;
    transition: transform 0.15s, box-shadow 0.2s, opacity 0.2s;
  }
  .kt-btn:disabled { opacity: 0.6; cursor: not-allowed; }
  .kt-btn-primary {
    background: linear-gradient(135deg, #1b4d37 0%, #2d6a4f 55%, #40916c 100%);
    color: #fff;
    box-shadow: 0 4px 20px rgba(45,106,79,0.38);
  }
  .kt-btn-primary:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 8px 28px rgba(45,106,79,0.45); }
  .kt-btn-primary:active:not(:disabled) { transform: translateY(0); }

  .kt-tab {
    padding: 6px 14px;
    border-radius: 8px;
    font-size: 12px;
    font-weight: 600;
    border: none;
    cursor: pointer;
    font-family: "Plus Jakarta Sans", sans-serif;
    transition: all 0.2s;
  }
  .kt-tab-active { background: #0d2218; color: #fff; }
  .kt-tab-idle   { background: transparent; color: #6b8478; }
  .kt-tab-idle:hover { background: rgba(45,106,79,0.07); color: #2d6a4f; }

  .kt-link {
    background: none; border: none; cursor: pointer;
    font-size: 12px; color: #2d6a4f; font-weight: 600;
    padding: 0; font-family: "Plus Jakarta Sans", sans-serif;
    text-decoration: none; transition: color 0.15s;
  }
  .kt-link:hover { color: #1b4d37; text-decoration: underline; }

  .kt-alert-success {
    background: #e8f7ee; border: 1px solid rgba(45,106,79,0.2);
    border-radius: 12px; padding: 16px 18px;
  }
  .kt-alert-warn {
    background: #fef9e7; border: 1px solid rgba(217,119,6,0.25);
    border-radius: 12px; padding: 16px 18px;
  }
  .kt-alert-error {
    background: #fef0f0; border: 1px solid rgba(224,92,92,0.2);
    border-radius: 10px; padding: 10px 14px;
    font-size: 13px; color: #d93025; font-weight: 500;
  }

  .kt-divider {
    display: flex; align-items: center; gap: 12px;
    font-size: 11px; color: #b4cbbf; font-weight: 500; text-transform: uppercase; letter-spacing: 0.08em;
  }
  .kt-divider::before, .kt-divider::after {
    content: ''; flex: 1; height: 1px; background: #e4ede9;
  }

  @media (max-width: 520px) {
    .kt-card { padding: 28px 24px 24px !important; }
  }
`;

export default function LoginPage() {
  const [activeSlide, setActiveSlide] = useState(0);
  const [mode, setMode]       = useState('login');
  const [email, setEmail]     = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw]   = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');
  const [resetSent, setResetSent] = useState(false);
  const [shake, setShake]     = useState(false);

  const [surname,   setSurname]   = useState('');
  const [givenName, setGivenName] = useState('');
  const [mi,        setMi]        = useState('');
  const [school,    setSchool]    = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [showCPw,   setShowCPw]   = useState(false);
  const [signedUp,  setSignedUp]  = useState(false); // false | 'active' | 'pending'

  // Slideshow
  useEffect(() => {
    const id = setInterval(() => setActiveSlide(s => (s + 1) % SLIDES.length), 5000);
    return () => clearInterval(id);
  }, []);

  function triggerShake() {
    setShake(true);
    setTimeout(() => setShake(false), 500);
  }

  async function handleLogin(e) {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (err) {
      setError(err.message.replace('Firebase: ', '').replace(/ \(auth.*\)\.?/, ''));
      triggerShake();
    } finally {
      setLoading(false);
    }
  }

  async function handleReset(e) {
    e.preventDefault();
    if (!email.trim()) { setError('Enter your email address first.'); triggerShake(); return; }
    setError(''); setLoading(true);
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

  async function handleSignup(e) {
    e.preventDefault();
    if (!surname.trim() || !givenName.trim()) { setError('Surname and Given Name are required.'); triggerShake(); return; }
    if (!school.trim()) { setError('School name is required.'); triggerShake(); return; }
    if (password.length < 6) { setError('Password must be at least 6 characters.'); triggerShake(); return; }
    if (password !== confirmPw) { setError('Passwords do not match.'); triggerShake(); return; }
    setError(''); setLoading(true);
    try {
      const { pendingApproval } = await selfSignUp({ email, password, surname, givenName, mi, school });
      setSignedUp(pendingApproval ? 'pending' : 'active');
    } catch (err) {
      setError(err.message.replace('Firebase: ', '').replace(/ \(auth.*\)\.?/, ''));
      triggerShake();
    } finally {
      setLoading(false);
    }
  }

  function switchMode(m) {
    setMode(m); setError(''); setResetSent(false); setSignedUp(false);
  }

  const eyeStyle = {
    position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)',
    background: 'none', border: 'none', cursor: 'pointer', color: '#7aa392', padding: 2, zIndex: 1,
  };

  return (
    <>
      <style>{CSS}</style>

      <div style={{ position: 'relative', minHeight: '100vh', overflow: 'hidden', fontFamily: '"Plus Jakarta Sans", sans-serif' }}>

        {/* ── Crossfading background images ── */}
        {SLIDES.map((src, i) => (
          <div key={i} style={{
            position: 'absolute', inset: 0,
            backgroundImage: `url(${src})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            opacity: i === activeSlide ? 0.63 : 0,
            transition: 'opacity 1.6s ease-in-out',
            zIndex: 0,
          }} />
        ))}

        {/* ── Deep gradient overlay ── */}
        <div style={{
          position: 'absolute', inset: 0, zIndex: 1,
          background: `
            radial-gradient(ellipse 80% 60% at 50% 40%, rgba(13,34,24,0.72) 0%, transparent 100%),
            linear-gradient(170deg,
              rgba(4,12,7,0.96)  0%,
              rgba(8,22,13,0.88) 30%,
              rgba(11,28,17,0.82) 60%,
              rgba(5,16,9,0.94)  100%
            )
          `,
        }} />

        {/* ── Decorative blob — top right ── */}
        <div style={{
          position: 'absolute', top: -160, right: -120, zIndex: 2,
          animation: 'kt-blob 20s ease-in-out infinite',
          pointerEvents: 'none',
        }}>
          <svg width="700" height="700" viewBox="0 0 700 700" fill="none">
            <path
              d="M560,80 C630,20 700,100 685,220 C670,350 580,420 480,470 C360,530 210,530 150,430 C70,310 90,160 190,90 C290,20 450,160 560,80 Z"
              fill="rgba(82,183,136,0.06)"
            />
            <path
              d="M520,120 C580,70 640,140 628,240 C614,340 540,400 450,445 C345,500 215,498 162,408 C90,298 108,170 196,106 C282,42 430,178 520,120 Z"
              fill="rgba(82,183,136,0.04)"
            />
          </svg>
        </div>

        {/* ── Decorative blob — bottom left ── */}
        <div style={{
          position: 'absolute', bottom: -100, left: -80, zIndex: 2,
          animation: 'kt-blob 26s ease-in-out 6s infinite reverse',
          pointerEvents: 'none',
        }}>
          <svg width="560" height="560" viewBox="0 0 560 560" fill="none">
            <path
              d="M120,440 C50,400 15,290 70,200 C130,100 260,60 375,110 C500,168 545,310 500,420 C455,520 330,570 220,535 C158,512 158,468 120,440 Z"
              fill="rgba(45,106,79,0.07)"
            />
          </svg>
        </div>

        {/* ── Rotating ring accent — top left ── */}
        <div style={{ position: 'absolute', top: 48, left: 48, zIndex: 2, pointerEvents: 'none' }}>
          <svg width="160" height="160" viewBox="0 0 160 160" fill="none" style={{ animation: 'kt-spin-cw 70s linear infinite', opacity: 0.14 }}>
            <circle cx="80" cy="80" r="68" stroke="#52b788" strokeWidth="1.5" strokeDasharray="10 7" />
          </svg>
          <svg width="100" height="100" viewBox="0 0 100 100" fill="none" style={{ position: 'absolute', top: 30, left: 30, animation: 'kt-spin-ccw 50s linear infinite', opacity: 0.09 }}>
            <circle cx="50" cy="50" r="38" stroke="#e8a320" strokeWidth="1" strokeDasharray="5 9" />
          </svg>
        </div>

        {/* ── Rotating ring accent — bottom right ── */}
        <div style={{ position: 'absolute', bottom: 60, right: 60, zIndex: 2, pointerEvents: 'none' }}>
          <svg width="120" height="120" viewBox="0 0 120 120" fill="none" style={{ animation: 'kt-spin-ccw 80s linear infinite', opacity: 0.11 }}>
            <circle cx="60" cy="60" r="50" stroke="#52b788" strokeWidth="1" strokeDasharray="8 6" />
          </svg>
        </div>

        {/* ── Dot grid — top right corner ── */}
        <div style={{ position: 'absolute', top: 0, right: 0, zIndex: 2, opacity: 0.08, pointerEvents: 'none' }}>
          <svg width="320" height="240" viewBox="0 0 320 240">
            {Array.from({ length: 8 }).flatMap((_, row) =>
              Array.from({ length: 10 }).map((_, col) => (
                <circle key={`${row}-${col}`} cx={col * 32 + 16} cy={row * 28 + 16} r="1.5" fill="#52b788" />
              ))
            )}
          </svg>
        </div>

        {/* ── Dot grid — bottom left corner ── */}
        <div style={{ position: 'absolute', bottom: 0, left: 0, zIndex: 2, opacity: 0.07, pointerEvents: 'none' }}>
          <svg width="280" height="200" viewBox="0 0 280 200">
            {Array.from({ length: 6 }).flatMap((_, row) =>
              Array.from({ length: 8 }).map((_, col) => (
                <circle key={`${row}-${col}`} cx={col * 34 + 16} cy={row * 30 + 16} r="1.5" fill="#b7e4c7" />
              ))
            )}
          </svg>
        </div>

        {/* ── Floating particles ── */}
        {PARTICLES.map((p, i) => (
          <div key={i} style={{
            position: 'absolute',
            top: p.top, left: p.left,
            width: p.size, height: p.size,
            borderRadius: '50%',
            background: p.color,
            opacity: 0.55,
            zIndex: 2,
            animation: `kt-float ${p.dur} ${p.delay} ease-in-out infinite`,
            pointerEvents: 'none',
          }} />
        ))}

        {/* ── Bottom wave ── */}
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 3, pointerEvents: 'none' }}>
          <svg viewBox="0 0 1440 100" preserveAspectRatio="none" style={{ width: '100%', height: 70, display: 'block' }}>
            <path d="M0,70 C200,20 440,100 720,55 C1000,10 1240,80 1440,45 L1440,100 L0,100 Z"
              fill="rgba(82,183,136,0.08)" />
            <path d="M0,85 C320,35 680,110 1020,65 C1220,42 1360,80 1440,60 L1440,100 L0,100 Z"
              fill="rgba(13,34,24,0.35)" />
          </svg>
        </div>

        {/* ── Slide indicator dots ── */}
        <div style={{
          position: 'absolute', bottom: 80, left: '50%', transform: 'translateX(-50%)',
          display: 'flex', gap: 6, zIndex: 10,
        }}>
          {SLIDES.map((_, i) => (
            <button key={i} onClick={() => setActiveSlide(i)} style={{
              width: i === activeSlide ? 22 : 6,
              height: 6, borderRadius: 3,
              background: i === activeSlide ? '#52b788' : 'rgba(255,255,255,0.3)',
              border: 'none', cursor: 'pointer', padding: 0,
              transition: 'all 0.4s ease',
            }} />
          ))}
        </div>

        {/* ── Main content ── */}
        <div style={{
          position: 'relative', zIndex: 10,
          minHeight: '100vh',
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          padding: '48px 20px 100px',
        }}>

          {/* ── Brand ── */}
          <div className="kt-brand-wrap" style={{ textAlign: 'center', marginBottom: 36 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, justifyContent: 'center', marginBottom: 12 }}>
              <div style={{ position: 'relative' }}>
                <div style={{
                  position: 'absolute', inset: -6, borderRadius: 18,
                  background: 'rgba(82,183,136,0.2)',
                  animation: 'kt-pulse-ring 2.4s ease-out infinite',
                }} />
                <img src={ktLogo} alt="kaTuro AI" style={{
                  width: 54, height: 54, borderRadius: 15, objectFit: 'cover',
                  boxShadow: '0 6px 24px rgba(0,0,0,0.5), 0 0 0 1px rgba(82,183,136,0.3)',
                  position: 'relative', zIndex: 1,
                }} />
              </div>
              <div>
                <span style={{
                  fontFamily: '"Playfair Display", Georgia, serif',
                  fontSize: 40, fontWeight: 700, color: '#fff',
                  letterSpacing: '-0.5px', lineHeight: 1,
                }}>kaTuro</span>
                <span style={{
                  display: 'inline-block', marginLeft: 8,
                  fontSize: 11, fontWeight: 700, color: '#52b788',
                  background: 'rgba(82,183,136,0.15)',
                  border: '1px solid rgba(82,183,136,0.25)',
                  borderRadius: 6, padding: '2px 7px', verticalAlign: 'middle',
                  letterSpacing: '0.05em',
                }}>AI</span>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center' }}>
              <GraduationCap size={13} color="rgba(183,228,199,0.6)" />
              <p style={{ margin: 0, fontSize: 12, color: 'rgba(183,228,199,0.65)', fontWeight: 400, letterSpacing: '1.8px', textTransform: 'uppercase' }}>
                AI Co-Teacher for Filipino Classrooms
              </p>
              <GraduationCap size={13} color="rgba(183,228,199,0.6)" />
            </div>
          </div>

          {/* ── Form card ── */}
          <div className={`kt-card${shake ? ' kt-shake' : ''}`} style={{
            width: '100%', maxWidth: 440,
            background: '#ffffff',
            borderRadius: 24,
            padding: '38px 40px 34px',
            boxShadow: '0 40px 100px rgba(0,0,0,0.55), 0 12px 32px rgba(0,0,0,0.25), 0 0 0 1px rgba(255,255,255,0.06)',
            position: 'relative',
          }}>

            {/* Subtle top accent line */}
            <div style={{
              position: 'absolute', top: 0, left: 40, right: 40, height: 3,
              background: 'linear-gradient(90deg, #40916c, #52b788, #e8a320, #52b788, #40916c)',
              borderRadius: '0 0 4px 4px',
              opacity: 0.7,
            }} />

            {/* Card header: title + tab switcher */}
            <div style={{ marginBottom: 26 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 8 }}>
                <div>
                  <h2 style={{
                    margin: 0, fontSize: 22, fontWeight: 700, color: '#0d2218',
                    fontFamily: '"Plus Jakarta Sans", sans-serif', letterSpacing: '-0.3px',
                  }}>
                    {mode === 'reset'  ? 'Reset Password' :
                     mode === 'signup' ? 'Create Account'  :
                                         'Welcome back'}
                  </h2>
                  <p style={{ margin: '5px 0 0', fontSize: 13, color: '#6b8a7a', lineHeight: 1.5, fontWeight: 400 }}>
                    {mode === 'reset'  ? "We'll send a reset link to your email." :
                     mode === 'signup' ? 'Join kaTuro — get 50 free tokens to start.' :
                                         'Sign in to your teaching workspace.'}
                  </p>
                </div>
                {mode !== 'reset' && (
                  <div style={{ display: 'flex', gap: 3, flexShrink: 0, marginLeft: 12 }}>
                    {['login', 'signup'].map(m => (
                      <button key={m} onClick={() => switchMode(m)}
                        className={`kt-tab ${mode === m ? 'kt-tab-active' : 'kt-tab-idle'}`}>
                        {m === 'login' ? 'Sign in' : 'Register'}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* ── Reset success ── */}
            {resetSent && (
              <div className="kt-alert-success" style={{ marginBottom: 16 }}>
                <p style={{ fontSize: 14, fontWeight: 700, color: '#1a3d2b', margin: '0 0 4px' }}>Reset link sent!</p>
                <p style={{ fontSize: 13, color: '#4a6357', margin: '0 0 10px' }}>
                  Check your inbox at <strong>{email}</strong>.
                </p>
                <button onClick={() => switchMode('login')} className="kt-link">← Back to sign in</button>
              </div>
            )}

            {/* ── Signup success — active ── */}
            {signedUp === 'active' && (
              <div className="kt-alert-success" style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 36, marginBottom: 8 }}>🎉</div>
                <p style={{ fontSize: 15, fontWeight: 700, color: '#1a3d2b', margin: '0 0 6px' }}>Account created!</p>
                <p style={{ fontSize: 13, color: '#4a6357', margin: 0, lineHeight: 1.5 }}>
                  Welcome to kaTuro! You have <strong>50 free tokens</strong>. Signing you in…
                </p>
              </div>
            )}

            {/* ── Signup success — pending ── */}
            {signedUp === 'pending' && (
              <div className="kt-alert-warn" style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 36, marginBottom: 8 }}>⏳</div>
                <p style={{ fontSize: 15, fontWeight: 700, color: '#92400e', margin: '0 0 6px' }}>Pending Approval</p>
                <p style={{ fontSize: 13, color: '#78350f', margin: '0 0 14px', lineHeight: 1.5 }}>
                  Your account is registered and awaiting administrator approval.
                </p>
                <button onClick={() => switchMode('login')} className="kt-link" style={{ color: '#d97706' }}>
                  ← Back to sign in
                </button>
              </div>
            )}

            {/* ── Form ── */}
            {!resetSent && !signedUp && (
              <form
                onSubmit={mode === 'login' ? handleLogin : mode === 'reset' ? handleReset : handleSignup}
                style={{ display: 'flex', flexDirection: 'column', gap: 14 }}
              >
                {/* Signup-only: name row */}
                {mode === 'signup' && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <div>
                      <label className="kt-label">Surname *</label>
                      <input className="kt-input" type="text" value={surname}
                        onChange={e => setSurname(e.target.value)}
                        placeholder="dela Cruz" required disabled={loading} />
                    </div>
                    <div>
                      <label className="kt-label">Given Name *</label>
                      <input className="kt-input" type="text" value={givenName}
                        onChange={e => setGivenName(e.target.value)}
                        placeholder="Maria" required disabled={loading} />
                    </div>
                  </div>
                )}

                {/* Signup-only: MI + School row */}
                {mode === 'signup' && (
                  <div style={{ display: 'grid', gridTemplateColumns: '76px 1fr', gap: 10 }}>
                    <div>
                      <label className="kt-label">M.I.</label>
                      <input className="kt-input" type="text" value={mi}
                        onChange={e => setMi(e.target.value.slice(0, 3))}
                        placeholder="A" maxLength={3} disabled={loading} />
                    </div>
                    <div>
                      <label className="kt-label">School *</label>
                      <input className="kt-input" type="text" value={school}
                        onChange={e => setSchool(e.target.value)}
                        placeholder="Mabini National High School" required disabled={loading} />
                    </div>
                  </div>
                )}

                {/* Email */}
                <div>
                  <label className="kt-label">Email Address</label>
                  <input className="kt-input" type="email" value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="you@deped.gov.ph" required disabled={loading} />
                </div>

                {/* Password */}
                {mode !== 'reset' && (
                  <div>
                    <label className="kt-label">
                      Password {mode === 'signup' ? <span style={{ fontWeight: 400, textTransform: 'none', color: '#9bb8a5' }}>(min 6 chars)</span> : ''}
                    </label>
                    <div style={{ position: 'relative' }}>
                      <input className="kt-input kt-input-pw" type={showPw ? 'text' : 'password'}
                        value={password} onChange={e => setPassword(e.target.value)}
                        placeholder="••••••••" required disabled={loading} />
                      <button type="button" onClick={() => setShowPw(v => !v)} style={eyeStyle}>
                        {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
                      </button>
                    </div>
                  </div>
                )}

                {/* Confirm password — signup only */}
                {mode === 'signup' && (
                  <div>
                    <label className="kt-label">Confirm Password</label>
                    <div style={{ position: 'relative' }}>
                      <input className="kt-input kt-input-pw" type={showCPw ? 'text' : 'password'}
                        value={confirmPw} onChange={e => setConfirmPw(e.target.value)}
                        placeholder="••••••••" required disabled={loading} />
                      <button type="button" onClick={() => setShowCPw(v => !v)} style={eyeStyle}>
                        {showCPw ? <EyeOff size={15} /> : <Eye size={15} />}
                      </button>
                    </div>
                  </div>
                )}

                {/* Forgot / Back links */}
                <div style={{ display: 'flex', justifyContent: mode === 'reset' ? 'center' : 'flex-end', marginTop: -2 }}>
                  {mode === 'login' && (
                    <button type="button" onClick={() => switchMode('reset')} className="kt-link">
                      Forgot password?
                    </button>
                  )}
                  {mode === 'reset' && (
                    <button type="button" onClick={() => switchMode('login')} className="kt-link">
                      ← Back to sign in
                    </button>
                  )}
                </div>

                {/* Error */}
                {error && <div className="kt-alert-error">{error}</div>}

                {/* Submit */}
                <button type="submit" className="kt-btn kt-btn-primary" disabled={loading} style={{ marginTop: 4 }}>
                  {loading
                    ? <><Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} />
                        {mode === 'reset' ? 'Sending…' : mode === 'signup' ? 'Creating account…' : 'Signing in…'}
                      </>
                    : mode === 'reset'  ? 'Send Reset Link'
                    : mode === 'signup' ? <><Gift size={15} /> Create Account — 50 Free Tokens</>
                    :                     'Sign In to kaTuro'
                  }
                </button>

                {/* Footer note for login */}
                {mode === 'login' && (
                  <>
                    <div className="kt-divider">or</div>
                    <p style={{ margin: 0, textAlign: 'center', fontSize: 12, color: '#9bb8a5' }}>
                      New to kaTuro?{' '}
                      <button type="button" onClick={() => switchMode('signup')} className="kt-link">
                        Create a free account
                      </button>
                    </p>
                  </>
                )}
              </form>
            )}
          </div>

          {/* Footer */}
          <p style={{ marginTop: 28, fontSize: 11, color: 'rgba(183,228,199,0.4)', textAlign: 'center', letterSpacing: '0.5px', lineHeight: 1.8 }}>
            kaTuro AI · Filipino DepEd K–12 Curriculum · Powered by Gemini<br />
            <span style={{ opacity: 0.6 }}>© 2026 kaTuro · All rights reserved</span>
          </p>
        </div>
      </div>
    </>
  );
}
