import { useState, useEffect } from 'react';
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import { auth } from '../firebase';
import { useAuth } from '../hooks/useAuth';
import img1 from '../assets/1.png';
import img2 from '../assets/2.png';
import img3 from '../assets/3.png';
import img4 from '../assets/4.png';
import ktLogo from '../assets/KT Favicon.png';

const SLIDE_IMGS = [img1, img2, img3, img4];
import {
  LayoutDashboard, Sparkles, BookOpen, ClipboardList,
  LogOut, Menu, X, ChevronRight, Projector,
  ShieldCheck, Coins, Gamepad2,
} from 'lucide-react';

const NAV = [
  { to: '/dashboard',       label: 'Dashboard',             Icon: LayoutDashboard },
  { to: '/lesson-gen',      label: 'Lesson Gen',            Icon: Sparkles        },
  { to: '/my-lessons',      label: 'My Lessons',            Icon: BookOpen        },
  { to: '/quiz-builder',    label: 'Quiz Builder',          Icon: ClipboardList   },
  { to: '/presentations',   label: 'Presentation Builder',  Icon: Projector       },
  { to: '/gamification',    label: 'Gamification',          Icon: Gamepad2        },
];

const TITLES = {
  '/dashboard':       'Dashboard',
  '/lesson-gen':      'Lesson Gen',
  '/my-lessons':      'My Lessons',
  '/quiz-builder':    'Quiz Builder',
  '/presentations':   'Presentation Builder',
  '/gamification':    'Gamification',
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
      <nav style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
        {NAV.map(({ to, label, Icon }) => (
          <NavLink
            key={to}
            to={to}
            onClick={onClose}
            style={({ isActive }) => ({
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '8px 10px', borderRadius: 9, textDecoration: 'none',
              background: isActive ? '#d8f3dc' : 'transparent',
              color: isActive ? '#1a3d2b' : '#4a6357',
              fontWeight: isActive ? 600 : 500, fontSize: 13,
              transition: 'background 0.15s, color 0.15s',
            })}
            onMouseEnter={e => {
              if (!e.currentTarget.dataset.active) {
                e.currentTarget.style.background = '#f5faf7';
              }
            }}
            onMouseLeave={e => {
              if (!e.currentTarget.dataset.active) {
                e.currentTarget.style.background = 'transparent';
              }
            }}
          >
            <Icon size={15} style={{ flexShrink: 0 }} />
            {label}
          </NavLink>
        ))}
        {isAdmin && (
          <NavLink
            to="/admin"
            onClick={onClose}
            style={({ isActive }) => ({
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '8px 10px', borderRadius: 9, textDecoration: 'none',
              background: isActive ? 'rgba(232,163,32,0.15)' : 'transparent',
              color: isActive ? '#b47a10' : '#4a6357',
              fontWeight: isActive ? 600 : 500, fontSize: 13,
              transition: 'background 0.15s, color 0.15s',
            })}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(232,163,32,0.08)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
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
                fontSize: 10, fontWeight: 700, color: '#b47a10',
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
  const { user, tokenBalance, isAdmin } = useAuth();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [slideIdx, setSlideIdx] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setSlideIdx(i => (i + 1) % 4), 10000);
    return () => clearInterval(id);
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

            {/* Token balance badge */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 5,
              background: 'rgba(232,163,32,0.12)', borderRadius: 20, padding: '4px 12px',
              fontSize: 11, fontWeight: 700, color: '#b47a10',
            }}>
              <Coins size={12} />
              <span style={{ fontFamily: '"DM Mono", monospace' }}>{tokenBalance}</span>
              <span style={{ fontWeight: 500 }}>tokens</span>
            </div>
          </header>

          {/* Page content */}
          <main style={{ flex: 1, overflow: 'auto', padding: 24, position: 'relative', zIndex: 1 }}>
            <Outlet />
          </main>
        </div>
      </div>
    </>
  );
}
