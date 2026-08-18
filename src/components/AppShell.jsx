import { useState, useEffect, useRef } from 'react';
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { uploadProfilePhoto, getTeacherProfile } from '../services/collabService';
import { signOut } from 'firebase/auth';
import { auth } from '../firebase';
import { useAuth } from '../hooks/useAuth';
import { useTheme } from '../context/ThemeContext';
import img1 from '../assets/1.webp';
import img2 from '../assets/2.webp';
import img3 from '../assets/3.webp';
import img4 from '../assets/4.webp';
import ktLogo from '../assets/KT-Favicon.webp';
import TokenBundleModal from './TokenBundleModal';
import FloatingSuggestButton from '../features/feedback/FloatingSuggestButton';
import InactivityAnnouncementModal from './InactivityAnnouncementModal';

const SLIDE_IMGS = [img1, img2, img3, img4];
import {
  LayoutDashboard, Sparkles, BookOpen,
  LogOut, Menu, X, ChevronRight, ChevronDown,
  ShieldCheck, Coins, FlaskConical, Zap, ClipboardCheck,
  School, GraduationCap, Moon, Sun,
  Settings, Camera, Loader2, Images, Lightbulb,
} from 'lucide-react';

const MAIN_NAV = [
  { to: '/shares',                   label: 'kaTuro Shares',        Icon: Images, highlight: true },
  { to: '/protect',                  label: 'kaTuro Protect',       Icon: ShieldCheck, highlight: 'red' },
  { to: '/dashboard',               label: 'Dashboard',            Icon: LayoutDashboard },
  { to: '/lesson-gen',              label: 'Lesson Gen',           Icon: Sparkles        },
  { to: '/my-lessons',              label: 'My Lessons',           Icon: BookOpen        },
  { to: '/assessment',              label: 'Assessment',           Icon: ClipboardCheck, isNew: true },
  { to: '/action-research/phase-1', label: 'Action Research',      Icon: FlaskConical    },
];

const CLASSROOM_NAV = [
  { to: '/classroom-management', label: 'Classroom Management', Icon: School       },
  { to: '/classes-i-teach',      label: 'Classes I Teach',      Icon: GraduationCap },
];

const TITLES = {
  '/shares':                  'kaTuro Shares',
  '/protect':                 'kaTuro Protect',
  '/dashboard':               'Dashboard',
  '/lesson-gen':              'Lesson Gen',
  '/dll-gen':                 'Daily Lesson Log',
  '/my-lessons':              'My Lessons',
  '/assessment':              'Assessment',
  '/quiz-builder':            'Quiz Builder',
  '/test-builder':            'Test Builder',
  '/action-research/phase-1': 'Action Research',
  '/classroom-management':    'Classroom Management',
  '/classes-i-teach':         'Classes I Teach',
};

// ── Sidebar (no profile card rendered here — lifted to AppShell root) ─────────
function SidebarContent({ user, photoURL, tokenBalance, isAdmin, freeMode, onClose, dark, toggle, onProfileOpen }) {
  const navigate = useNavigate();
  const [gearOpen, setGearOpen] = useState(false);
  const gearRef = useRef(null);

  const initials    = user?.displayName
    ? user.displayName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
    : (user?.email?.[0] || 'T').toUpperCase();
  const displayName = user?.displayName || user?.email?.split('@')[0] || 'Teacher';

  async function handleLogout() { await signOut(auth); navigate('/login', { replace: true }); }

  async function openProfile() {
    try {
      const prof = await getTeacherProfile(user.uid);
      onProfileOpen({
        displayName: prof?.displayName || displayName,
        email:    user.email || prof?.email || '',
        photoURL: prof?.photoURL || user.photoURL || null,
        school:   prof?.school || '',
      });
    } catch (_) {
      onProfileOpen({ displayName, email: user.email || '', photoURL: user.photoURL || null, school: '' });
    }
  }

  useEffect(() => {
    if (!gearOpen) return;
    const h = e => { if (!gearRef.current?.contains(e.target)) setGearOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [gearOpen]);

  const btn = {
    width: '100%', display: 'flex', alignItems: 'center', gap: 8,
    padding: '7px 10px', borderRadius: 6, border: 'none', cursor: 'pointer',
    background: 'transparent', fontSize: 12, fontWeight: 600, fontFamily: 'inherit',
    transition: 'background 0.14s',
  };

  return (
    <div style={{ width: 220, height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--kt-sidebar-bg)', borderRight: '1px solid rgba(220,208,174,0.25)', padding: '18px 10px' }}>

      {/* Logo */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 8px 18px', borderBottom: '1px solid rgba(220,208,174,0.12)', marginBottom: 12 }}>
        <img src={ktLogo} alt="kaTuro AI" style={{ width: 32, height: 32, borderRadius: 6, flexShrink: 0, objectFit: 'cover' }} />
        <div>
          <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#FBF7EC', lineHeight: 1.1, fontFamily: 'var(--kt-font-heading)' }}>kaTuro AI</p>
          <p style={{ margin: 0, marginTop: 3, fontSize: 10.5, color: '#E4D5AC', lineHeight: 1, letterSpacing: '0.04em' }}>Teacher's Desk</p>
        </div>
        {onClose && (
          <button onClick={onClose} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: '#DCD0AE', padding: 4 }}>
            <X size={16} />
          </button>
        )}
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2, overflowY: 'auto' }}>
        {MAIN_NAV.filter(item => !item.adminOnly || isAdmin).map(({ to, label, Icon, isNew, highlight }) => (
          <NavLink key={to} to={to} onClick={onClose}
            style={({ isActive }) => highlight ? {
              display: 'flex', alignItems: 'center', gap: 9,
              padding: '8px 10px', borderRadius: 6, textDecoration: 'none',
              background: highlight === 'red'
                ? '#A23B2E'
                : (isActive ? '#E4D5AC' : 'rgba(0,0,0,0.2)'),
              border: highlight === 'red'
                ? '1px solid rgba(255,255,255,0.15)'
                : (isActive ? '1px solid #C9B583' : '1px solid rgba(220,208,174,0.15)'),
              color: highlight === 'red'
                ? '#ffffff'
                : (isActive ? '#262119' : '#FBF7EC'),
              fontWeight: isActive ? 700 : 600, fontSize: 13,
              marginBottom: 4,
              transition: 'all 0.15s ease',
            } : {
              display: 'flex', alignItems: 'center', gap: 9,
              padding: '8px 10px', borderRadius: 6, textDecoration: 'none',
              background: isActive
                ? '#E4D5AC'
                : 'transparent',
              color: isActive
                ? '#262119'
                : 'rgba(251,247,236,0.85)',
              fontWeight: isActive ? 700 : 500, fontSize: 13,
              border: isActive ? '1px solid #C9B583' : '1px solid transparent',
              transition: 'background 0.14s, color 0.14s',
            }}
            onMouseEnter={e => {
              if (highlight) {
                if (highlight === 'red') e.currentTarget.style.background = '#8A3226';
                return;
              }
              if (e.currentTarget.getAttribute('aria-current') !== 'page') {
                Object.assign(e.currentTarget.style, {
                  background: 'rgba(228,213,172,0.12)',
                  color: '#FBF7EC',
                });
              }
            }}
            onMouseLeave={e => {
              if (highlight) {
                if (highlight === 'red') e.currentTarget.style.background = '#A23B2E';
                return;
              }
              if (e.currentTarget.getAttribute('aria-current') !== 'page') {
                Object.assign(e.currentTarget.style, {
                  background: 'transparent',
                  color: 'rgba(251,247,236,0.85)',
                });
              }
            }}
          >
            <Icon size={15} style={{ flexShrink: 0 }} />
            <span style={{ flex: 1 }}>{label}</span>
            {isNew && (
              <span style={{
                background: '#E4D5AC',
                color: '#262119', borderRadius: 4, fontSize: 9, padding: '1px 5px',
                fontWeight: 700, letterSpacing: '0.04em', lineHeight: '14px',
                textTransform: 'uppercase', border: '1px solid #C9B583',
              }}>NEW</span>
            )}
          </NavLink>
        ))}

        {/* Classroom box */}
        <div style={{ marginTop: 10, borderRadius: 6, background: 'rgba(0,0,0,0.18)', border: '1px solid rgba(220,208,174,0.15)', padding: '10px 8px 8px' }}>
          <p style={{ margin: '0 0 7px 7px', fontSize: 9.5, fontWeight: 700, color: '#E4D5AC', textTransform: 'uppercase', letterSpacing: '1.2px', fontFamily: 'var(--kt-font-mono)' }}>Classroom</p>
          {CLASSROOM_NAV.map(({ to, label, Icon }) => (
            <NavLink key={to} to={to} onClick={onClose}
              style={({ isActive }) => ({
                display: 'flex', alignItems: 'center', gap: 9,
                padding: '8px 10px', borderRadius: 6, textDecoration: 'none', marginBottom: 2,
                background: isActive ? '#E4D5AC' : 'transparent',
                color: isActive ? '#262119' : 'rgba(251,247,236,0.85)',
                fontWeight: isActive ? 700 : 500, fontSize: 13,
                border: isActive ? '1px solid #C9B583' : '1px solid transparent',
                transition: 'background 0.14s, color 0.14s',
              })}
              onMouseEnter={e => { if (e.currentTarget.getAttribute('aria-current') !== 'page') Object.assign(e.currentTarget.style, { background: 'rgba(228,213,172,0.12)', color: '#FBF7EC' }); }}
              onMouseLeave={e => { if (e.currentTarget.getAttribute('aria-current') !== 'page') Object.assign(e.currentTarget.style, { background: 'transparent', color: 'rgba(251,247,236,0.85)' }); }}
            >
              <Icon size={15} style={{ flexShrink: 0 }} />
              {label}
            </NavLink>
          ))}
        </div>

        {isAdmin && (
          <NavLink to="/admin" onClick={onClose}
            style={({ isActive }) => ({ display: 'flex', alignItems: 'center', gap: 9, marginTop: 6, padding: '8px 10px', borderRadius: 6, textDecoration: 'none', background: isActive ? '#E4D5AC' : 'transparent', color: isActive ? '#262119' : '#DCD0AE', border: isActive ? '1px solid #C9B583' : '1px solid transparent', fontWeight: isActive ? 700 : 500, fontSize: 13, transition: 'background 0.14s, color 0.14s' })}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(228,213,172,0.12)'; e.currentTarget.style.color = '#FBF7EC'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#DCD0AE'; }}
          >
            <ShieldCheck size={15} style={{ flexShrink: 0 }} /> Admin
          </NavLink>
        )}
      </nav>

      {/* ── Bottom panel ─────────────────────────────────────────────────────── */}
      <div style={{ borderTop: '1px solid rgba(220,208,174,0.18)', paddingTop: 10, marginTop: 4 }}>

        {/* Avatar + name — click to open profile card */}
        <button onClick={openProfile}
          style={{ ...btn, gap: 9, padding: '8px 10px', marginBottom: 6, borderRadius: 6, background: 'rgba(0,0,0,0.22)', border: '1px solid rgba(220,208,174,0.18)', color: '#FBF7EC' }}
          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(0,0,0,0.35)'; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'rgba(0,0,0,0.22)'; }}
        >
          <div style={{
            width: 30, height: 30, borderRadius: 4, flexShrink: 0,
            background: photoURL ? 'transparent' : '#2B4E3E',
            backgroundImage: photoURL ? `url(${photoURL})` : undefined,
            backgroundSize: 'cover', backgroundPosition: 'center',
            display: 'grid', placeItems: 'center', fontWeight: 700, fontSize: 11, color: '#E4D5AC',
            border: '1px solid #C9B583',
          }}>{!photoURL && initials}</div>
          <div style={{ overflow: 'hidden', flex: 1, textAlign: 'left' }}>
            <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: '#FBF7EC', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{displayName}</p>
            {!freeMode
              ? <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}><Coins size={10} color="#E4D5AC" /><span style={{ fontSize: 10, fontWeight: 700, color: tokenBalance === 0 ? '#E06D5E' : '#E4D5AC', fontFamily: 'var(--kt-font-mono)' }}>{tokenBalance} tokens</span></div>
              : <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}><span style={{ fontSize: 10, fontWeight: 700, color: '#5F7A54' }}>✦ Free Mode ON</span></div>
            }
          </div>
        </button>

        {/* Gear — roll-up dropdown */}
        <div ref={gearRef} style={{ position: 'relative' }}>
          {gearOpen && (
            <div style={{
              position: 'absolute', bottom: '100%', left: 0, right: 0, marginBottom: 4,
              background: '#16251E',
              borderRadius: 6, boxShadow: '0 -6px 24px rgba(0,0,0,0.35)',
              border: '1px solid rgba(220,208,174,0.22)', padding: 6, zIndex: 50,
            }}>
              <button onClick={() => { toggle(); setGearOpen(false); }}
                style={{ ...btn, color: '#FBF7EC' }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(228,213,172,0.12)'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
              >
                {dark ? <Sun size={13} /> : <Moon size={13} />}
                {dark ? 'Light Mode' : 'Dark Mode'}
              </button>
              <button onClick={handleLogout}
                style={{ ...btn, color: '#c0392b' }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(220,38,38,0.08)'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
              >
                <LogOut size={13} /> Sign Out
              </button>
            </div>
          )}
          <button onClick={() => setGearOpen(v => !v)}
            style={{ ...btn, color: 'var(--kt-text-secondary)', background: gearOpen ? (dark ? 'rgba(82,183,136,0.1)' : '#f0faf4') : 'transparent' }}
            onMouseEnter={e => { if (!gearOpen) e.currentTarget.style.background = dark ? 'rgba(82,183,136,0.1)' : '#f5faf7'; }}
            onMouseLeave={e => { if (!gearOpen) e.currentTarget.style.background = 'transparent'; }}
          >
            <Settings size={13} />
            <ChevronDown size={11} style={{ marginLeft: 'auto', transform: gearOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
          </button>
        </div>
      </div>
    </div>
  );
}

// ── AppShell ──────────────────────────────────────────────────────────────────
export default function AppShell() {
  const { user, tokenBalance, isAdmin, freeMode, loading, photoURL } = useAuth();
  const { dark, toggle } = useTheme();
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileOpen,     setMobileOpen]     = useState(false);
  const [slideIdx,       setSlideIdx]       = useState(0);
  const [showBundle,     setShowBundle]     = useState(false);
  const [profileData,    setProfileData]    = useState(null); // lifted out of sidebar
  const [photoUploading, setPhotoUploading] = useState(false);
  const shownOnLogin = useRef(false);
  const photoRef     = useRef(null);

  useEffect(() => {
    const id = setInterval(() => setSlideIdx(i => (i + 1) % 4), 10000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!loading && !freeMode && tokenBalance === 0 && !shownOnLogin.current) {
      shownOnLogin.current = true;
      setShowBundle(true);
    }
  }, [loading, freeMode, tokenBalance]);

  useEffect(() => {
    const handler = () => setShowBundle(true);
    window.addEventListener('kt-zero-tokens', handler);
    return () => window.removeEventListener('kt-zero-tokens', handler);
  }, []);

  async function handlePhotoUpload(e) {
    const file = e.target.files?.[0];
    if (!file || !user?.uid) return;
    setPhotoUploading(true);
    try {
      await uploadProfilePhoto(user.uid, file);
      const prof = await getTeacherProfile(user.uid);
      if (prof) setProfileData(prev => prev ? { ...prev, photoURL: prof.photoURL } : prev);
    } catch (_) {}
    finally { setPhotoUploading(false); }
  }

  const initials    = user?.displayName
    ? user.displayName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
    : (user?.email?.[0] || 'T').toUpperCase();

  const pageTitle = Object.keys(TITLES).find(k => location.pathname.startsWith(k))
    ? TITLES[Object.keys(TITLES).find(k => location.pathname.startsWith(k))]
    : 'kaTuro AI';

  // kaTuro Shares manages its own edge-to-edge feed layout — skip the
  // standard page padding so its feed/right-panel columns sit flush.
  const isShares = location.pathname.startsWith('/shares');

  return (
    <>
      <style>{`
        @keyframes kt-spin { to { transform: rotate(360deg); } }
        @media (max-width: 768px) {
          .shell-sidebar { display: none !important; }
          .shell-menu-btn { display: flex !important; }
        }
      `}</style>

      <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--kt-surface)' }}>

        {/* Sidebar — desktop */}
        <div className="shell-sidebar" style={{ width: 220, flexShrink: 0, position: 'sticky', top: 0, height: '100vh', overflow: 'hidden' }}>
          <SidebarContent
            user={user} photoURL={photoURL} tokenBalance={tokenBalance} isAdmin={isAdmin}
            freeMode={freeMode} dark={dark} toggle={toggle}
            onProfileOpen={setProfileData}
          />
        </div>

        {/* Mobile sidebar overlay */}
        {mobileOpen && (
          <div style={{ position: 'fixed', inset: 0, zIndex: 60, display: 'flex' }}>
            <div style={{ position: 'absolute', inset: 0, background: 'rgba(13,34,24,0.45)' }} onClick={() => setMobileOpen(false)} />
            <div style={{ position: 'relative', zIndex: 1, height: '100%' }}>
              <SidebarContent
                user={user} tokenBalance={tokenBalance} isAdmin={isAdmin}
                freeMode={freeMode} dark={dark} toggle={toggle}
                onProfileOpen={setProfileData}
                onClose={() => setMobileOpen(false)}
              />
            </div>
          </div>
        )}

        {/* Right: topbar + content */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden', position: 'relative' }}>
          {SLIDE_IMGS.map((src, i) => (
            <div key={i} style={{ position: 'absolute', inset: 0, backgroundImage: `url(${src})`, backgroundSize: 'cover', backgroundPosition: 'center', opacity: i === slideIdx ? 0.07 : 0, transition: 'opacity 1.8s ease-in-out', pointerEvents: 'none', zIndex: 0 }} />
          ))}

          <header style={{ height: 56, background: 'var(--kt-topbar-bg)', borderBottom: '1px solid var(--kt-border)', boxShadow: '0 1px 2px rgba(38,33,25,0.04)', display: 'flex', alignItems: 'center', padding: '0 20px', gap: 12, position: 'sticky', top: 0, zIndex: 40, flexShrink: 0 }}>
            <button className="shell-menu-btn" onClick={() => setMobileOpen(true)} style={{ display: 'none', background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: '#1F3A2E', alignItems: 'center' }}>
              <Menu size={20} />
            </button>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--kt-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: 'var(--kt-font-mono)' }}>kaTuro AI</span>
              <ChevronRight size={11} color="var(--kt-border)" />
              <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--kt-text-primary)', fontFamily: 'var(--kt-font-heading)' }}>{pageTitle}</span>
            </div>
            <button onClick={() => navigate('/feature-requests')} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--kt-card-2)', color: 'var(--kt-text-secondary)', border: '1px solid var(--kt-border)', borderRadius: 'var(--kt-radius-md)', padding: '5px 12px', fontSize: 11.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', transition: 'background 0.15s' }}
              onMouseEnter={e => { e.currentTarget.style.background = '#E4D5AC'; e.currentTarget.style.color = '#262119'; }} onMouseLeave={e => { e.currentTarget.style.background = 'var(--kt-card-2)'; e.currentTarget.style.color = 'var(--kt-text-secondary)'; }}>
              <Lightbulb size={12} /> Request Feature
            </button>
            {freeMode ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'var(--kt-success-tint)', border: '1px solid rgba(95,122,84,0.3)', borderRadius: 'var(--kt-radius-md)', padding: '4px 10px', fontSize: 11, fontWeight: 700, color: 'var(--kt-success)' }}>✦ Free Mode</div>
            ) : tokenBalance === 0 ? (
              <button onClick={() => setShowBundle(true)} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--kt-chalkboard)', color: '#fff', border: 'none', borderRadius: 'var(--kt-radius-md)', padding: '5px 12px', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', transition: 'opacity 0.15s' }}
                onMouseEnter={e => { e.currentTarget.style.opacity = '0.88'; }} onMouseLeave={e => { e.currentTarget.style.opacity = '1'; }}>
                <Zap size={12} color="#E4D5AC" /> Get Tokens
              </button>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'var(--kt-card-2)', border: '1px solid var(--kt-border)', borderRadius: 'var(--kt-radius-md)', padding: '4px 10px', fontSize: 11, fontWeight: 700, color: 'var(--kt-text-primary)' }}>
                <Coins size={12} color="#8C7847" />
                <span style={{ fontFamily: 'var(--kt-font-mono)', color: '#8C7847' }}>{tokenBalance}</span>
                <span style={{ fontWeight: 500, color: 'var(--kt-text-secondary)' }}>tokens</span>
              </div>
            )}
          </header>

          <main style={{ flex: 1, overflow: 'auto', padding: isShares ? 0 : 24, position: 'relative', zIndex: 1 }}>
            <Outlet />
          </main>
        </div>
      </div>

      {showBundle && <TokenBundleModal onClose={() => setShowBundle(false)} />}

      <FloatingSuggestButton />
      <InactivityAnnouncementModal />

      {/* ── Profile card — rendered at root level, never clipped ─────────────── */}
      {profileData && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.4)' }}
          onClick={() => setProfileData(null)}
        >
          <div
            style={{ background: dark ? '#1c2e22' : '#fff', borderRadius: 18, width: 300, overflow: 'hidden', boxShadow: '0 16px 56px rgba(0,0,0,0.28)', border: '1px solid var(--kt-border)' }}
            onClick={e => e.stopPropagation()}
          >
            {/* Banner */}
            <div style={{ height: 60, background: 'linear-gradient(135deg, #2d6a4f 0%, #00c974 100%)', position: 'relative' }}>
              <button onClick={() => setProfileData(null)} style={{ position: 'absolute', top: 10, right: 10, background: 'rgba(0,0,0,0.25)', border: 'none', borderRadius: '50%', width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#fff' }}>
                <X size={14} />
              </button>
            </div>

            {/* Avatar */}
            <div style={{ padding: '0 16px', marginTop: -44 }}>
              <div style={{ position: 'relative', display: 'inline-block' }}>
                <div style={{
                  width: 80, height: 80, borderRadius: '50%',
                  border: `4px solid ${dark ? '#1c2e22' : '#fff'}`,
                  background: profileData.photoURL ? 'transparent' : 'linear-gradient(135deg, #2d6a4f 0%, #52b788 100%)',
                  backgroundImage: profileData.photoURL ? `url(${profileData.photoURL})` : undefined,
                  backgroundSize: 'cover', backgroundPosition: 'center',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontWeight: 700, fontSize: 28, color: '#fff', boxSizing: 'border-box',
                }}>{!profileData.photoURL && initials}</div>
                <button
                  onClick={() => photoRef.current?.click()}
                  title="Change profile photo"
                  style={{ position: 'absolute', bottom: 4, right: 0, background: '#2d6a4f', border: `2px solid ${dark ? '#1c2e22' : '#fff'}`, borderRadius: '50%', width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#fff' }}
                >
                  {photoUploading ? <Loader2 size={12} style={{ animation: 'kt-spin 0.8s linear infinite' }} /> : <Camera size={13} />}
                </button>
                <input ref={photoRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handlePhotoUpload} />
              </div>
            </div>

            {/* Info */}
            <div style={{ padding: '10px 16px 20px' }}>
              <p style={{ fontSize: 20, fontWeight: 800, color: 'var(--kt-text-primary)', margin: '0 0 4px', fontFamily: '"Plus Jakarta Sans", sans-serif' }}>{profileData.displayName}</p>
              {isAdmin && <span style={{ fontSize: 10, fontWeight: 700, background: 'rgba(232,163,32,0.15)', color: '#b47a10', borderRadius: 6, padding: '2px 8px', display: 'inline-block', marginBottom: 8 }}>Admin</span>}

              <div style={{ background: dark ? 'rgba(255,255,255,0.05)' : '#f9fafb', borderRadius: 10, padding: '12px', marginTop: 10 }}>
                {profileData.school && (
                  <div style={{ marginBottom: profileData.email ? 10 : 0 }}>
                    <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--kt-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.07em', margin: '0 0 2px' }}>School</p>
                    <p style={{ fontSize: 13, color: 'var(--kt-text-primary)', margin: 0 }}>{profileData.school}</p>
                  </div>
                )}
                {profileData.email && (
                  <div>
                    <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--kt-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.07em', margin: '0 0 2px' }}>Email</p>
                    <p style={{ fontSize: 13, color: 'var(--kt-text-primary)', margin: 0 }}>{profileData.email}</p>
                  </div>
                )}
                {!profileData.school && !profileData.email && (
                  <p style={{ fontSize: 13, color: 'var(--kt-text-secondary)', margin: 0, textAlign: 'center' }}>No profile info available</p>
                )}
              </div>
              <p style={{ fontSize: 11, color: 'var(--kt-text-secondary)', margin: '10px 0 0', textAlign: 'center' }}>
                Click the camera icon to update your profile photo
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
