import { useState, useEffect, useRef } from 'react';
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import { auth } from '../firebase';
import { useAuth } from '../hooks/useAuth';
import img1 from '../assets/1.png';
import img2 from '../assets/2.png';
import img3 from '../assets/3.png';
import img4 from '../assets/4.png';
import ktLogo from '../assets/KT Favicon.png';
import TokenBundleModal from './TokenBundleModal';

const SLIDE_IMGS = [img1, img2, img3, img4];
import {
  LayoutDashboard, Sparkles, BookOpen, ClipboardList,
  LogOut, Menu, X, ChevronRight, Projector,
  ShieldCheck, Coins, Gamepad2, FlaskConical, Zap,
  School, GraduationCap,
} from 'lucide-react';


const MAIN_NAV = [
  { to: '/dashboard',              label: 'Dashboard',             Icon: LayoutDashboard },
  { to: '/lesson-gen',             label: 'Lesson Gen',            Icon: Sparkles        },
  { to: '/my-lessons',             label: 'My Lessons',            Icon: BookOpen        },
  { to: '/quiz-builder',           label: 'Quiz Builder',          Icon: ClipboardList   },
  { to: '/presentations',          label: 'Presentation Builder',  Icon: Projector       },
  { to: '/gamification',           label: 'Gamification',          Icon: Gamepad2        },
  { to: '/action-research/phase-1',label: 'Action Research',       Icon: FlaskConical    },
];

const CLASSROOM_NAV = [
  { to: '/classroom-management',   label: 'Classroom Management',  Icon: School          },
  { to: '/classes-i-teach',        label: 'Classes I Teach',       Icon: GraduationCap   },
];

const NAV = [...MAIN_NAV, ...CLASSROOM_NAV];

const TITLES = {
  '/dashboard':               'Dashboard',
  '/lesson-gen':              'Lesson Gen',
  '/dll-gen':                 'Daily Lesson Log',
  '/my-lessons':              'My Lessons',
  '/quiz-builder':            'Quiz Builder',
  '/presentations':           'Presentation Builder',
  '/gamification':            'Gamification',
  '/action-research/phase-1': 'Action Research',
  '/classroom-management':    'Classroom Management',
  '/classes-i-teach':         'Classes I Teach',
};

function SidebarContent({ user, tokenBalance, isAdmin, onClose }) {
  const navigate = useNavigate();

  const initials = user?.displayName
    ? user.displayName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
    : (user?.email?.[0] || 'T').toUpperCase();

  const displayName = user?.displayName || user?.email?.split('@')[0] || 'Teacher';

  async function handleLogout() {
    await signOut(auth);
    navigate('/login', { replace: true });
  }

  return (
    <div style={{
      width: 220, height: '100%', display: 'flex', flexDirection: 'column',
      background: '#ffffff',
      borderRight: '1px solid rgba(45,106,79,0.12)',
      padding: '18px 10px',
    }}>
      {/* Logo */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 8px 18px' }}>
        <img
          src={ktLogo}
          alt="kaTuro AI"
          style={{ width: 34, height: 34, borderRadius: 9, flexShrink: 0, objectFit: 'cover' }}
        />
        <div>
          <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#1a3d2b', lineHeight: 1 }}>kaTuro AI</p>
          <p style={{ margin: 0, marginTop: 3, fontSize: 10, color: '#4a6357', lineHeight: 1 }}>Teacher Co-pilot</p>
        </div>
        {onClose && (
          <button onClick={onClose} style={{
            marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer',
            color: '#4a6357', padding: 4,
          }}>
            <X size={16} />
          </button>
        )}
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 1, overflowY: 'auto' }}>
        {/* Main nav items */}
        {MAIN_NAV.map(({ to, label, Icon }) => (
          <NavLink
            key={to}
            to={to}
            onClick={onClose}
            style={({ isActive }) => ({
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '8px 10px', borderRadius: 9, textDecoration: 'none',
              background: isActive ? '#bbf7d0' : 'transparent',
              color: isActive ? '#14532d' : '#4a6357',
              fontWeight: isActive ? 700 : 500, fontSize: 13,
              transition: 'background 0.14s, color 0.14s',
              borderLeft: isActive ? '3px solid #22c55e' : '3px solid transparent',
            })}
            onMouseEnter={e => {
              if (e.currentTarget.getAttribute('aria-current') !== 'page')
                Object.assign(e.currentTarget.style, { background: '#dcfce7', color: '#14532d' });
            }}
            onMouseLeave={e => {
              if (e.currentTarget.getAttribute('aria-current') !== 'page')
                Object.assign(e.currentTarget.style, { background: 'transparent', color: '#4a6357' });
            }}
          >
            <Icon size={15} style={{ flexShrink: 0 }} />
            {label}
          </NavLink>
        ))}

        {/* ── Classroom Box ────────────────────────────────── */}
        <div style={{
          marginTop: 10,
          borderRadius: 13,
          background: 'linear-gradient(160deg, #082212 0%, #0d2e1a 55%, #143d25 100%)',
          border: '1px solid rgba(74,222,128,0.18)',
          padding: '10px 8px 8px',
          boxShadow: '0 4px 16px rgba(0,0,0,0.18), inset 0 1px 0 rgba(74,222,128,0.08)',
        }}>
          <p style={{
            margin: '0 0 7px 7px', fontSize: 9, fontWeight: 800,
            color: 'rgba(74,222,128,0.55)', textTransform: 'uppercase', letterSpacing: '1.6px',
          }}>
            Classroom
          </p>
          {CLASSROOM_NAV.map(({ to, label, Icon }) => (
            <NavLink
              key={to}
              to={to}
              onClick={onClose}
              style={({ isActive }) => ({
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '9px 10px', borderRadius: 9, textDecoration: 'none', marginBottom: 2,
                background: isActive ? 'rgba(74,222,128,0.22)' : 'transparent',
                color: isActive ? '#4ade80' : 'rgba(187,247,208,0.72)',
                fontWeight: isActive ? 700 : 500, fontSize: 13,
                transition: 'background 0.14s, color 0.14s',
                borderLeft: isActive ? '3px solid #4ade80' : '3px solid transparent',
              })}
              onMouseEnter={e => {
                if (e.currentTarget.getAttribute('aria-current') !== 'page')
                  Object.assign(e.currentTarget.style, { background: 'rgba(74,222,128,0.16)', color: '#86efac' });
              }}
              onMouseLeave={e => {
                if (e.currentTarget.getAttribute('aria-current') !== 'page')
                  Object.assign(e.currentTarget.style, { background: 'transparent', color: 'rgba(187,247,208,0.72)' });
              }}
            >
              <Icon size={15} style={{ flexShrink: 0 }} />
              {label}
            </NavLink>
          ))}
        </div>

        {isAdmin && (
          <NavLink
            to="/admin"
            onClick={onClose}
            style={({ isActive }) => ({
              display: 'flex', alignItems: 'center', gap: 10, marginTop: 4,
              padding: '8px 10px', borderRadius: 9, textDecoration: 'none',
              background: isActive ? 'rgba(232,163,32,0.18)' : 'transparent',
              color: isActive ? '#b47a10' : '#4a6357',
              fontWeight: isActive ? 700 : 500, fontSize: 13,
              transition: 'background 0.14s, color 0.14s',
            })}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(232,163,32,0.12)'; e.currentTarget.style.color = '#92400e'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#4a6357'; }}
          >
            <ShieldCheck size={15} style={{ flexShrink: 0 }} />
            Admin
          </NavLink>
        )}
      </nav>

      {/* Teacher + logout */}
      <div style={{ borderTop: '1px solid rgba(45,106,79,0.12)', paddingTop: 10, marginTop: 4 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '6px 10px', marginBottom: 2 }}>
          <div style={{
            width: 30, height: 30, borderRadius: '50%', flexShrink: 0,
            background: 'linear-gradient(135deg, #2d6a4f 0%, #52b788 100%)',
            display: 'grid', placeItems: 'center',
            fontWeight: 700, fontSize: 11, color: '#fff',
          }}>{initials}</div>
          <div style={{ overflow: 'hidden', flex: 1 }}>
            <p style={{
              margin: 0, fontSize: 12, fontWeight: 700, color: '#0d2218',
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}>{displayName}</p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
              <Coins size={10} color="#b47a10" />
              <span style={{
                fontSize: 10, fontWeight: 700, color: tokenBalance === 0 ? '#c0392b' : '#b47a10',
                fontFamily: '"DM Mono", monospace',
              }}>{tokenBalance} tokens</span>
            </div>
          </div>
        </div>
        <button
          onClick={handleLogout}
          style={{
            width: '100%', display: 'flex', alignItems: 'center', gap: 8,
            padding: '7px 10px', borderRadius: 9, border: 'none', cursor: 'pointer',
            background: 'transparent', color: '#4a6357',
            fontSize: 12, fontWeight: 600, transition: 'all 0.15s',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = '#f5faf7'; e.currentTarget.style.color = '#0d2218'; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#4a6357'; }}
        >
          <LogOut size={13} />
          Sign Out
        </button>
      </div>
    </div>
  );
}

export default function AppShell() {
  const { user, tokenBalance, isAdmin, loading } = useAuth();
  const location = useLocation();
  const [mobileOpen,   setMobileOpen]   = useState(false);
  const [slideIdx,     setSlideIdx]     = useState(0);
  const [showBundle,   setShowBundle]   = useState(false);
  const shownOnLogin = useRef(false);

  useEffect(() => {
    const id = setInterval(() => setSlideIdx(i => (i + 1) % 4), 10000);
    return () => clearInterval(id);
  }, []);

  // Auto-show once per session — only after profile is fully loaded AND balance is truly zero
  useEffect(() => {
    if (!loading && tokenBalance === 0 && !shownOnLogin.current) {
      shownOnLogin.current = true;
      setShowBundle(true);
    }
  }, [loading, tokenBalance]);

  // Show bundle when a generate action fails due to zero tokens
  useEffect(() => {
    const handler = () => setShowBundle(true);
    window.addEventListener('kt-zero-tokens', handler);
    return () => window.removeEventListener('kt-zero-tokens', handler);
  }, []);


  const pageTitle = Object.keys(TITLES).find(k => location.pathname.startsWith(k))
    ? TITLES[Object.keys(TITLES).find(k => location.pathname.startsWith(k))]
    : 'kaTuro AI';

  return (
    <>
      <style>{`
        @media (max-width: 768px) {
          .shell-sidebar { display: none !important; }
          .shell-menu-btn { display: flex !important; }
        }
      `}</style>

      <div style={{ display: 'flex', minHeight: '100vh', background: '#f5faf7' }}>

        {/* Sidebar — desktop */}
        <div className="shell-sidebar" style={{
          width: 220, flexShrink: 0, position: 'sticky', top: 0,
          height: '100vh', overflow: 'hidden',
        }}>
          <SidebarContent user={user} tokenBalance={tokenBalance} isAdmin={isAdmin} />
        </div>

        {/* Mobile sidebar overlay */}
        {mobileOpen && (
          <div style={{ position: 'fixed', inset: 0, zIndex: 60, display: 'flex' }}>
            <div
              style={{ position: 'absolute', inset: 0, background: 'rgba(13,34,24,0.45)' }}
              onClick={() => setMobileOpen(false)}
            />
            <div style={{ position: 'relative', zIndex: 1, height: '100%' }}>
              <SidebarContent user={user} tokenBalance={tokenBalance} isAdmin={isAdmin} onClose={() => setMobileOpen(false)} />
            </div>
          </div>
        )}

        {/* Right: topbar + content */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden', position: 'relative' }}>

          {/* background slideshow — sits behind topbar and page content */}
          {SLIDE_IMGS.map((src, i) => (
            <div key={i} style={{
              position: 'absolute', inset: 0,
              backgroundImage: `url(${src})`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
              opacity: i === slideIdx ? 0.07 : 0,
              transition: 'opacity 1.8s ease-in-out',
              pointerEvents: 'none',
              zIndex: 0,
            }} />
          ))}

          {/* Topbar */}
          <header style={{
            height: 56, background: '#fff',
            borderBottom: '1px solid rgba(45,106,79,0.12)',
            display: 'flex', alignItems: 'center',
            padding: '0 20px', gap: 12,
            position: 'sticky', top: 0, zIndex: 40, flexShrink: 0,
          }}>
            <button
              className="shell-menu-btn"
              onClick={() => setMobileOpen(true)}
              style={{
                display: 'none', background: 'none', border: 'none', cursor: 'pointer',
                padding: 4, color: '#1a3d2b', alignItems: 'center',
              }}
            >
              <Menu size={20} />
            </button>

            {/* Breadcrumb */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, flex: 1 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#4a6357', textTransform: 'uppercase', letterSpacing: '0.08em' }}>kaTuro AI</span>
              <ChevronRight size={11} color="rgba(45,106,79,0.3)" />
              <span style={{ fontSize: 13, fontWeight: 700, color: '#0d2218' }}>{pageTitle}</span>
            </div>

            {/* Token balance badge / zero-token CTA */}
            {tokenBalance === 0 ? (
              <button
                onClick={() => setShowBundle(true)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  background: '#1877f2', color: '#fff', border: 'none',
                  borderRadius: 20, padding: '5px 13px',
                  fontSize: 11, fontWeight: 700, cursor: 'pointer',
                  fontFamily: 'inherit', transition: 'opacity 0.15s',
                }}
                onMouseEnter={e => { e.currentTarget.style.opacity = '0.88'; }}
                onMouseLeave={e => { e.currentTarget.style.opacity = '1'; }}
              >
                <Zap size={12} />
                Get Tokens
              </button>
            ) : (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 5,
                background: 'rgba(232,163,32,0.12)', borderRadius: 20, padding: '4px 12px',
                fontSize: 11, fontWeight: 700, color: '#b47a10',
              }}>
                <Coins size={12} />
                <span style={{ fontFamily: '"DM Mono", monospace' }}>{tokenBalance}</span>
                <span style={{ fontWeight: 500 }}>tokens</span>
              </div>
            )}
          </header>

          {/* Page content */}
          <main style={{ flex: 1, overflow: 'auto', padding: 24, position: 'relative', zIndex: 1 }}>
            <Outlet />
          </main>
        </div>
      </div>

      {showBundle && <TokenBundleModal onClose={() => setShowBundle(false)} />}
    </>
  );
}
