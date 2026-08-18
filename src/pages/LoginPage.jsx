import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../firebase';
import { Loader2, Eye, EyeOff, Gift, BookOpen, CheckCircle2, ShieldCheck, FileSpreadsheet, Award } from 'lucide-react';
import ktLogo from '../assets/KT-Favicon.webp';
import { selfSignUp } from '../services/db';

import bg1 from '../assets/1.webp';
import bg2 from '../assets/2.webp';
import bg3 from '../assets/3.webp';
import bg4 from '../assets/4.webp';
import bg5 from '../assets/5.webp';
import bg6 from '../assets/6.webp';
import bg7 from '../assets/7.webp';

const SLIDES = [bg1, bg2, bg3, bg4, bg5, bg6, bg7];

const CSS = `
  @keyframes kt-shake {
    0%, 100% { transform: translateX(0); }
    20%      { transform: translateX(-6px); }
    40%      { transform: translateX(6px); }
    60%      { transform: translateX(-4px); }
    80%      { transform: translateX(4px); }
  }

  .kt-login-page {
    position: relative;
    min-height: 100vh;
    background: var(--kt-chalkboard, #1F3A2E);
    font-family: var(--kt-font-ui, "Inter", sans-serif);
    color: var(--kt-text-primary, #262119);
    overflow-x: hidden;
  }

  .kt-login-container {
    position: relative;
    z-index: 10;
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    max-width: 1200px;
    margin: 0 auto;
    padding: 48px 24px;
    gap: 56px;
  }

  @media (max-width: 980px) {
    .kt-login-container {
      flex-direction: column;
      padding: 32px 16px 48px;
      gap: 36px;
    }
  }

  /* Left Column: Faculty Board */
  .kt-faculty-board {
    flex: 1;
    max-width: 540px;
    color: #FBF7EC;
  }

  @media (max-width: 980px) {
    .kt-faculty-board {
      max-width: 100%;
      text-align: center;
    }
  }

  .kt-board-brand {
    display: flex;
    align-items: center;
    gap: 14px;
    margin-bottom: 24px;
  }

  @media (max-width: 980px) {
    .kt-board-brand {
      justify-content: center;
    }
  }

  .kt-board-logo {
    width: 48px;
    height: 48px;
    border-radius: var(--kt-radius-sm, 4px);
    object-fit: cover;
    border: 1px solid var(--kt-manila-border, #C9B583);
    box-shadow: 0 2px 8px rgba(0,0,0,0.3);
  }

  .kt-board-title {
    font-family: var(--kt-font-heading, "Bitter", serif);
    font-size: 32px;
    font-weight: 700;
    color: #FBF7EC;
    line-height: 1;
  }

  .kt-board-badge {
    font-family: var(--kt-font-mono, "JetBrains Mono", monospace);
    font-size: 10.5px;
    font-weight: 700;
    color: var(--kt-manila, #E4D5AC);
    background: rgba(228, 213, 172, 0.15);
    border: 1px solid var(--kt-manila-border, #C9B583);
    border-radius: 4px;
    padding: 2px 8px;
    margin-top: 4px;
    display: inline-block;
    letter-spacing: 0.08em;
  }

  .kt-board-headline {
    font-family: var(--kt-font-heading, "Bitter", serif);
    font-size: 30px;
    font-weight: 700;
    line-height: 1.3;
    color: #FBF7EC;
    margin: 0 0 14px;
  }

  @media (max-width: 600px) {
    .kt-board-headline {
      font-size: 24px;
    }
  }

  .kt-board-subhead {
    font-size: 14.5px;
    line-height: 1.6;
    color: rgba(251, 247, 236, 0.85);
    margin: 0 0 28px;
  }

  /* Academic Feature Cards Grid */
  .kt-pillar-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
    margin-bottom: 28px;
  }

  @media (max-width: 600px) {
    .kt-pillar-grid {
      grid-template-columns: 1fr;
    }
  }

  .kt-pillar-card {
    background: rgba(251, 247, 236, 0.08);
    border: 1px solid rgba(201, 181, 131, 0.35);
    border-radius: var(--kt-radius-sm, 4px);
    padding: 12px 14px;
    display: flex;
    gap: 10px;
    align-items: flex-start;
    text-align: left;
    backdrop-filter: blur(4px);
  }

  .kt-pillar-icon {
    color: var(--kt-manila, #E4D5AC);
    flex-shrink: 0;
    margin-top: 2px;
  }

  .kt-pillar-title {
    font-family: var(--kt-font-heading, "Bitter", serif);
    font-size: 13px;
    font-weight: 700;
    color: #FBF7EC;
    margin: 0 0 2px;
  }

  .kt-pillar-desc {
    font-size: 11px;
    color: rgba(251, 247, 236, 0.75);
    line-height: 1.4;
    margin: 0;
  }

  .kt-seal-notice {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    font-family: var(--kt-font-mono, "JetBrains Mono", monospace);
    font-size: 11.5px;
    color: var(--kt-manila, #E4D5AC);
    background: rgba(0, 0, 0, 0.25);
    border: 1px solid rgba(201, 181, 131, 0.3);
    border-radius: 4px;
    padding: 6px 12px;
  }

  /* Right Column: Registry Card */
  .kt-registry-card {
    width: 100%;
    max-width: 450px;
    background: var(--kt-card, #FBF7EC);
    border: 1px solid var(--kt-border, #DCD0AE);
    border-radius: var(--kt-radius-md, 6px);
    box-shadow: 0 16px 48px rgba(0, 0, 0, 0.35);
    position: relative;
    overflow: hidden;
  }

  .kt-registry-card.kt-shake {
    animation: kt-shake 0.42s ease;
  }

  .kt-card-accent-line {
    height: 4px;
    background: var(--kt-manila-border, #C9B583);
    width: 100%;
  }

  .kt-card-content {
    padding: 28px 28px 24px;
  }

  @media (max-width: 480px) {
    .kt-card-content {
      padding: 22px 18px 20px;
    }
  }

  /* Tab switcher */
  .kt-folder-tabs {
    display: flex;
    gap: 6px;
    margin-bottom: 22px;
    border-bottom: 1px solid var(--kt-border, #DCD0AE);
    padding-bottom: 12px;
  }

  .kt-folder-tab {
    flex: 1;
    padding: 8px 12px;
    border-radius: var(--kt-radius-sm, 4px);
    font-size: 12.5px;
    font-weight: 600;
    font-family: var(--kt-font-ui, "Inter", sans-serif);
    cursor: pointer;
    text-align: center;
    border: 1px solid transparent;
    transition: all 0.15s ease;
  }

  .kt-folder-tab--active {
    background: var(--kt-manila, #E4D5AC);
    color: var(--kt-text-primary, #262119);
    border-color: var(--kt-manila-border, #C9B583);
    font-weight: 700;
    box-shadow: 0 1px 3px rgba(38, 33, 25, 0.08);
  }

  .kt-folder-tab--idle {
    background: var(--kt-card-2, #F4EDDB);
    color: var(--kt-text-secondary, #6E6455);
    border-color: var(--kt-border, #DCD0AE);
  }

  .kt-folder-tab--idle:hover {
    background: #ebe2cc;
    color: var(--kt-text-primary, #262119);
  }

  /* Voucher callout */
  .kt-voucher-banner {
    background: var(--kt-manila, #E4D5AC);
    border: 1px solid var(--kt-manila-border, #C9B583);
    border-radius: var(--kt-radius-sm, 4px);
    padding: 10px 12px;
    margin-bottom: 18px;
    display: flex;
    align-items: flex-start;
    gap: 10px;
  }

  .kt-voucher-icon {
    color: var(--kt-chalkboard, #1F3A2E);
    flex-shrink: 0;
    margin-top: 1px;
  }

  .kt-voucher-title {
    font-family: var(--kt-font-mono, "JetBrains Mono", monospace);
    font-size: 11.5px;
    font-weight: 700;
    color: var(--kt-chalkboard, #1F3A2E);
    margin: 0 0 2px;
    letter-spacing: 0.04em;
  }

  .kt-voucher-desc {
    font-size: 11.5px;
    color: var(--kt-text-primary, #262119);
    margin: 0;
    line-height: 1.4;
  }

  /* Form controls */
  .kt-form-field {
    margin-bottom: 13px;
  }

  .kt-input-label {
    display: block;
    font-family: var(--kt-font-mono, "JetBrains Mono", monospace);
    font-size: 11px;
    font-weight: 700;
    color: var(--kt-text-secondary, #6E6455);
    text-transform: uppercase;
    letter-spacing: 0.08em;
    margin-bottom: 5px;
  }

  .kt-text-input {
    width: 100%;
    box-sizing: border-box;
    height: 42px;
    padding: 0 12px;
    border: 1px solid var(--kt-border, #DCD0AE);
    border-radius: var(--kt-radius-sm, 4px);
    font-size: 13.5px;
    font-family: inherit;
    background: var(--kt-card-2, #F4EDDB);
    color: var(--kt-text-primary, #262119);
    outline: none;
    transition: border-color 0.15s, background 0.15s;
  }

  .kt-text-input:focus {
    border-color: var(--kt-manila-border, #C9B583);
    background: #ffffff;
  }

  .kt-text-input:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .kt-text-input::placeholder {
    color: var(--kt-muted, #A79C87);
  }

  .kt-input-pw {
    padding-right: 40px !important;
  }

  .kt-submit-btn {
    width: 100%;
    height: 44px;
    border: 1px solid var(--kt-chalkboard, #1F3A2E);
    border-radius: var(--kt-radius-md, 6px);
    font-size: 13.5px;
    font-weight: 700;
    font-family: inherit;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    background: var(--kt-chalkboard, #1F3A2E);
    color: #FBF7EC;
    transition: background 0.15s, opacity 0.15s;
    margin-top: 6px;
  }

  .kt-submit-btn:hover:not(:disabled) {
    background: var(--kt-chalkboard-hover, #2B4E3E);
  }

  .kt-submit-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .kt-auth-error {
    background: var(--kt-danger-tint, #FBEAE8);
    border: 1px solid rgba(162, 59, 46, 0.3);
    border-radius: var(--kt-radius-sm, 4px);
    padding: 8px 12px;
    font-size: 12.5px;
    color: var(--kt-danger, #A23B2E);
    font-weight: 600;
    margin-bottom: 12px;
    font-family: var(--kt-font-mono, "JetBrains Mono", monospace);
  }

  .kt-auth-divider {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 11px;
    color: var(--kt-text-secondary, #6E6455);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    font-family: var(--kt-font-mono, monospace);
    margin: 16px 0 10px;
  }

  .kt-auth-divider::before, .kt-auth-divider::after {
    content: '';
    flex: 1;
    height: 1px;
    background: var(--kt-border, #DCD0AE);
  }

  .kt-auth-footer-link {
    background: none;
    border: none;
    cursor: pointer;
    font-size: 12.5px;
    color: var(--kt-chalkboard, #1F3A2E);
    font-weight: 700;
    padding: 0;
    font-family: inherit;
    text-decoration: underline;
    text-decoration-color: var(--kt-manila-border);
  }

  .kt-auth-footer-link:hover {
    color: var(--kt-chalkboard-hover, #2B4E3E);
  }
`;

export default function LoginPage() {
  const [searchParams] = useSearchParams();
  const referredBy = searchParams.get('ref') || '';

  const [activeSlide, setActiveSlide] = useState(0);
  const [mode, setMode]         = useState(referredBy ? 'signup' : 'login');
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw]     = useState(false);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');
  const [shake, setShake]       = useState(false);

  const [surname,   setSurname]   = useState('');
  const [givenName, setGivenName] = useState('');
  const [mi,        setMi]        = useState('');
  const [school,    setSchool]    = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [showCPw,   setShowCPw]   = useState(false);
  const [signedUp,  setSignedUp]  = useState(false); // false | 'active' | 'pending'

  // Background subtle crossfade slideshow
  useEffect(() => {
    const id = setInterval(() => setActiveSlide(s => (s + 1) % SLIDES.length), 6000);
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
      setError((err?.message ?? 'Sign-in failed. Please try again.')
        .replace('Firebase: ', '').replace(/ \(auth\/[\w-]+\)\.?/g, '').trim());
      triggerShake();
    } finally {
      setLoading(false);
    }
  }

  async function handleSignup(e) {
    e.preventDefault();
    if (!surname.trim())   { setError('Last name (Apelyido) is required.'); triggerShake(); return; }
    if (!givenName.trim()) { setError('First name (Pangalan) is required.'); triggerShake(); return; }
    if (!school.trim())    { setError('School name is required.'); triggerShake(); return; }
    if (password.length < 6) { setError('Password must be at least 6 characters.'); triggerShake(); return; }
    if (password !== confirmPw) { setError('Passwords do not match.'); triggerShake(); return; }
    setError(''); setLoading(true);
    try {
      const { pendingApproval } = await selfSignUp({ email, password, surname, givenName, mi, school, referredBy });
      setSignedUp(pendingApproval ? 'pending' : 'active');
    } catch (err) {
      setError((err?.message ?? 'Registration failed. Please try again.')
        .replace('Firebase: ', '').replace(/ \(auth\/[\w-]+\)\.?/g, '').trim());
      triggerShake();
    } finally {
      setLoading(false);
    }
  }

  function switchMode(m) {
    setMode(m); setError(''); setSignedUp(false);
  }

  const signupReady = mode !== 'signup' || (
    surname.trim() !== '' &&
    givenName.trim() !== '' &&
    school.trim() !== '' &&
    email.trim() !== '' &&
    password.length >= 6 &&
    confirmPw.length > 0 &&
    password === confirmPw
  );

  const eyeBtnStyle = {
    position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
    background: 'none', border: 'none', cursor: 'pointer', color: 'var(--kt-text-secondary, #6E6455)', padding: 4, display: 'flex',
  };

  return (
    <>
      <style>{CSS}</style>

      <div className="kt-login-page">

        {/* ── Background Classroom Artwork Crossfade (Blended into Chalkboard Green) ── */}
        {SLIDES.map((src, i) => (
          <div key={i} style={{
            position: 'absolute', inset: 0,
            backgroundImage: `url(${src})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            opacity: i === activeSlide ? 0.18 : 0,
            transition: 'opacity 2s ease-in-out',
            zIndex: 0,
            pointerEvents: 'none',
          }} />
        ))}

        {/* ── Deep Chalkboard Overlay ── */}
        <div style={{
          position: 'absolute', inset: 0, zIndex: 1,
          background: `radial-gradient(ellipse at 30% 40%, rgba(31,58,46,0.85) 0%, rgba(18,36,28,0.96) 100%)`,
          pointerEvents: 'none',
        }} />

        {/* ── Split-Screen Content Layout ── */}
        <div className="kt-login-container">

          {/* ── Left Side: Faculty Board & DepEd Pillars ── */}
          <div className="kt-faculty-board">

            {/* Brand Header */}
            <div className="kt-board-brand">
              <img src={ktLogo} alt="kaTuro AI" className="kt-board-logo" />
              <div>
                <div className="kt-board-title">
                  kaTuro <span style={{ color: 'var(--kt-manila, #E4D5AC)' }}>AI</span>
                </div>
                <div className="kt-board-badge">
                  KAGAMITAN NG GURONG PILIPINO
                </div>
              </div>
            </div>

            {/* Hero Statement */}
            <h1 className="kt-board-headline">
              Matalinong Katuwang sa Paghahanda ng Bawat Aralin.
            </h1>
            <p className="kt-board-subhead">
              Dinisenyo alinsunod sa DepEd K–12 at MATATAG Curriculum — para sa mas mabilis, maayos, at de-kalidad na paghahanda ng klase.
            </p>

            {/* Academic Feature Cards */}
            <div className="kt-pillar-grid">
              <div className="kt-pillar-card">
                <BookOpen size={18} className="kt-pillar-icon" />
                <div>
                  <h3 className="kt-pillar-title">DepEd Order No. 42 (DLL / DLP)</h3>
                  <p className="kt-pillar-desc">Kumpletong Daily Lesson Log at ILAW Lesson Plan na handa sa klase.</p>
                </div>
              </div>

              <div className="kt-pillar-card">
                <Award size={18} className="kt-pillar-icon" />
                <div>
                  <h3 className="kt-pillar-title">COT-RPMS 4As Observation</h3>
                  <p className="kt-pillar-desc">Nakahanay sa PPST indicators at classroom observation rubrics.</p>
                </div>
              </div>

              <div className="kt-pillar-card">
                <FileSpreadsheet size={18} className="kt-pillar-icon" />
                <div>
                  <h3 className="kt-pillar-title">Automated TOS & Quiz Builder</h3>
                  <p className="kt-pillar-desc">Table of Specifications na may Bloom’s Taxonomy breakdown.</p>
                </div>
              </div>

              <div className="kt-pillar-card">
                <ShieldCheck size={18} className="kt-pillar-icon" />
                <div>
                  <h3 className="kt-pillar-title">kaTuro Protect & Community</h3>
                  <p className="kt-pillar-desc">Gabay legal at administratibo para sa kapakanan ng mga guro.</p>
                </div>
              </div>
            </div>

            {/* Teacher Trust Badge */}
            <div>
              <div className="kt-seal-notice">
                <span>🇵🇭</span>
                <span>Binuo para sa pampubliko at pribadong mga guro sa buong Pilipinas.</span>
              </div>
            </div>
          </div>

          {/* ── Right Side: Teacher Registry Card ("Ang Rehistro") ── */}
          <div className={`kt-registry-card${shake ? ' kt-shake' : ''}`}>
            <div className="kt-card-accent-line" />

            <div className="kt-card-content">

              {/* Folder tab switcher */}
              <div className="kt-folder-tabs">
                <button
                  type="button"
                  onClick={() => switchMode('login')}
                  className={`kt-folder-tab ${mode === 'login' ? 'kt-folder-tab--active' : 'kt-folder-tab--idle'}`}
                >
                  Sign In
                </button>
                <button
                  type="button"
                  onClick={() => switchMode('signup')}
                  className={`kt-folder-tab ${mode === 'signup' ? 'kt-folder-tab--active' : 'kt-folder-tab--idle'}`}
                >
                  Register (30 Free Tokens)
                </button>
              </div>

              {/* ── Signup Success: Active ── */}
              {signedUp === 'active' && (
                <div style={{
                  background: 'var(--kt-card-2, #F4EDDB)',
                  border: '1px solid var(--kt-manila-border, #C9B583)',
                  borderRadius: 4, padding: '20px 16px', textAlign: 'center',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'center', color: 'var(--kt-chalkboard)', marginBottom: 8 }}>
                    <CheckCircle2 size={36} />
                  </div>
                  <h2 style={{ margin: '0 0 6px', fontSize: 17, fontWeight: 700, fontFamily: 'var(--kt-font-heading, "Bitter", serif)', color: 'var(--kt-text-primary)' }}>
                    Maligayang Pagdating, Guro!
                  </h2>
                  <p style={{ margin: 0, fontSize: 13, color: 'var(--kt-text-secondary)', lineHeight: 1.5 }}>
                    Matagumpay na nagawa ang iyong account. Mayroon kang <strong>30 libreng tokens</strong>. I-sign in na ang iyong account…
                  </p>
                </div>
              )}

              {/* ── Signup Success: Pending Approval ── */}
              {signedUp === 'pending' && (
                <div style={{
                  background: 'var(--kt-card-2, #F4EDDB)',
                  border: '1px solid var(--kt-manila-border, #C9B583)',
                  borderRadius: 4, padding: '20px 16px', textAlign: 'center',
                }}>
                  <div style={{ fontSize: 32, marginBottom: 8 }}>⏳</div>
                  <h2 style={{ margin: '0 0 6px', fontSize: 17, fontWeight: 700, fontFamily: 'var(--kt-font-heading, "Bitter", serif)', color: 'var(--kt-text-primary)' }}>
                    Naghihintay ng Pag-apruba
                  </h2>
                  <p style={{ margin: '0 0 14px', fontSize: 13, color: 'var(--kt-text-secondary)', lineHeight: 1.5 }}>
                    Narehistro na ang iyong account at naghihintay ng pagsusuri ng administrator ng paaralan.
                  </p>
                  <button onClick={() => switchMode('login')} className="kt-auth-footer-link" type="button">
                    ← Bumalik sa Sign In
                  </button>
                </div>
              )}

              {/* ── Form Inputs ── */}
              {!signedUp && (
                <form onSubmit={mode === 'login' ? handleLogin : handleSignup}>

                  {/* Header info */}
                  <div style={{ marginBottom: 16 }}>
                    <h2 style={{
                      margin: 0, fontSize: 20, fontWeight: 700, color: 'var(--kt-text-primary)',
                      fontFamily: 'var(--kt-font-heading, "Bitter", serif)',
                    }}>
                      {mode === 'signup' ? 'Lumikha ng Account' : 'Welcome Back, Guro!'}
                    </h2>
                    <p style={{ margin: '4px 0 0', fontSize: 12.5, color: 'var(--kt-text-secondary)' }}>
                      {mode === 'signup'
                        ? 'Magrehistro upang simulan ang paggamit ng kaTuro.'
                        : 'Mag-sign in upang ma-access ang iyong mga aralin.'}
                    </p>
                  </div>

                  {/* Voucher callout for register mode */}
                  {mode === 'signup' && (
                    <div className="kt-voucher-banner">
                      <Gift size={18} className="kt-voucher-icon" />
                      <div>
                        <div className="kt-voucher-title">LIBRENG 30 TOKENS</div>
                        <p className="kt-voucher-desc">Sapat para sa 5 kumpletong Lesson Plans, DLL, o Test Papers.</p>
                      </div>
                    </div>
                  )}

                  {/* Signup-only: Surname + Given Name */}
                  {mode === 'signup' && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                      <div className="kt-form-field">
                        <label className="kt-input-label">Apelyido (Surname) *</label>
                        <input
                          className="kt-text-input"
                          type="text"
                          value={surname}
                          onChange={e => setSurname(e.target.value)}
                          placeholder="dela Cruz"
                          required
                          disabled={loading}
                        />
                      </div>
                      <div className="kt-form-field">
                        <label className="kt-input-label">Pangalan (Given Name) *</label>
                        <input
                          className="kt-text-input"
                          type="text"
                          value={givenName}
                          onChange={e => setGivenName(e.target.value)}
                          placeholder="Maria"
                          required
                          disabled={loading}
                        />
                      </div>
                    </div>
                  )}

                  {/* Signup-only: MI + School */}
                  {mode === 'signup' && (
                    <div style={{ display: 'grid', gridTemplateColumns: '70px 1fr', gap: 10 }}>
                      <div className="kt-form-field">
                        <label className="kt-input-label">M.I.</label>
                        <input
                          className="kt-text-input"
                          type="text"
                          value={mi}
                          onChange={e => setMi(e.target.value.slice(0, 3))}
                          placeholder="A"
                          maxLength={3}
                          disabled={loading}
                        />
                      </div>
                      <div className="kt-form-field">
                        <label className="kt-input-label">Paaralan (School) *</label>
                        <input
                          className="kt-text-input"
                          type="text"
                          value={school}
                          onChange={e => setSchool(e.target.value)}
                          placeholder="Mabini National High School"
                          required
                          disabled={loading}
                        />
                      </div>
                    </div>
                  )}

                  {/* Email */}
                  <div className="kt-form-field">
                    <label className="kt-input-label">
                      {mode === 'signup' ? 'Email (DepEd o Personal) *' : 'Email Address *'}
                    </label>
                    <input
                      className="kt-text-input"
                      type="email"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      placeholder="you@deped.gov.ph o personal email"
                      required
                      disabled={loading}
                    />
                  </div>

                  {/* Password */}
                  <div className="kt-form-field">
                    <label className="kt-input-label">
                      Password {mode === 'signup' ? <span style={{ fontWeight: 400, textTransform: 'none', color: 'var(--kt-text-secondary)' }}>(min. 6 characters)</span> : '*'}
                    </label>
                    <div style={{ position: 'relative' }}>
                      <input
                        className="kt-text-input kt-input-pw"
                        type={showPw ? 'text' : 'password'}
                        value={password}
                        onChange={e => setPassword(e.target.value)}
                        placeholder="••••••••"
                        required
                        disabled={loading}
                      />
                      <button type="button" onClick={() => setShowPw(v => !v)} style={eyeBtnStyle} aria-label="Toggle password visibility">
                        {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
                      </button>
                    </div>
                  </div>

                  {/* Confirm password — signup only */}
                  {mode === 'signup' && (
                    <div className="kt-form-field">
                      <label className="kt-input-label">Kumpirmahin ang Password *</label>
                      <div style={{ position: 'relative' }}>
                        <input
                          className="kt-text-input kt-input-pw"
                          type={showCPw ? 'text' : 'password'}
                          value={confirmPw}
                          onChange={e => setConfirmPw(e.target.value)}
                          placeholder="••••••••"
                          required
                          disabled={loading}
                        />
                        <button type="button" onClick={() => setShowCPw(v => !v)} style={eyeBtnStyle} aria-label="Toggle password visibility">
                          {showCPw ? <EyeOff size={15} /> : <Eye size={15} />}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Forgot password note in login mode */}
                  {mode === 'login' && (
                    <p style={{ margin: '-4px 0 10px', fontSize: 11.5, color: 'var(--kt-text-secondary)', textAlign: 'right', fontFamily: 'var(--kt-font-mono, monospace)' }}>
                      Nakalimutan ang password? Makipag-ugnayan sa inyong admin.
                    </p>
                  )}

                  {/* Error display */}
                  {error && <div className="kt-auth-error">{error}</div>}

                  {/* Submit Button */}
                  <button
                    type="submit"
                    className="kt-submit-btn"
                    disabled={loading || !signupReady}
                  >
                    {loading ? (
                      <>
                        <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} />
                        {mode === 'signup' ? 'Nililikha ang account…' : 'Pumapasok sa workspace…'}
                      </>
                    ) : mode === 'signup' ? (
                      <>
                        <Gift size={15} />
                        Lumikha ng Account — 30 Free Tokens
                      </>
                    ) : (
                      'Sign In to kaTuro'
                    )}
                  </button>

                  {/* Bottom switcher note */}
                  {mode === 'login' ? (
                    <>
                      <div className="kt-auth-divider">o kaya</div>
                      <p style={{ margin: 0, textAlign: 'center', fontSize: 12.5, color: 'var(--kt-text-secondary)' }}>
                        Wala pang account?{' '}
                        <button type="button" onClick={() => switchMode('signup')} className="kt-auth-footer-link">
                          Magrehistro nang libre (30 Tokens)
                        </button>
                      </p>
                    </>
                  ) : (
                    <>
                      <div className="kt-auth-divider">o kaya</div>
                      <p style={{ margin: 0, textAlign: 'center', fontSize: 12.5, color: 'var(--kt-text-secondary)' }}>
                        Mayroon nang account?{' '}
                        <button type="button" onClick={() => switchMode('login')} className="kt-auth-footer-link">
                          Mag-sign in dito
                        </button>
                      </p>
                    </>
                  )}
                </form>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

