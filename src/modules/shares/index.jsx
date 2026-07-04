import { useState, useEffect } from 'react';
import { Routes, Route, NavLink, useNavigate, useLocation } from 'react-router-dom';
import {
  Images, Compass, PlusSquare, Bell, User, Home,
} from 'lucide-react';
// Images kept for mobile feed nav; Compass used for renamed "Explore" (main feed)
import { useAuth } from '../../hooks/useAuth';
import { ensureSharesProfile, getInitials } from './services/sharesService';
import { useNotifications } from './hooks/useNotifications';
import { PostComposer }     from './components/PostComposer';
import { SharesLogoFull }   from './assets/SharesLogo';
import SharesFeed           from './SharesFeed';
import SharesExplore        from './SharesExplore';
import SharesProfile        from './SharesProfile';
import SharesNotifications  from './SharesNotifications';
import SharePostPage        from './SharePostPage';
import './shares.css';

function NavItem({ to, icon: Icon, label, badge }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) => `sh-nav-link ${isActive ? 'active' : ''}`}
      end={to === '/shares'}
    >
      <Icon size={18} />
      {label}
      {badge > 0 && <span className="sh-nav-badge">{badge}</span>}
    </NavLink>
  );
}

export default function SharesModule() {
  const { user, photoURL } = useAuth();
  const navigate           = useNavigate();
  const location           = useLocation();
  const [profile,  setProfile]  = useState(null);
  const [composer, setComposer] = useState(false);

  const uid         = user?.uid || '';
  const displayName = profile?.displayName || user?.displayName || user?.email?.split('@')[0] || 'Teacher';
  const initials    = profile?.initials || getInitials(displayName);
  const school      = profile?.school      || '';
  const gradeLevel  = profile?.gradeLevel  || '';
  const subject     = profile?.subject     || '';

  const { unreadCount } = useNotifications(uid);

  useEffect(() => {
    if (!user?.uid) return;
    ensureSharesProfile(user.uid, {
      displayName: user.displayName || '',
      email:       user.email || '',
    }).then(setProfile).catch(() => {});
  }, [user?.uid]);

  const pageProps = { uid, displayName, initials, photoURL, school, gradeLevel, subject };

  return (
    <div className="sh-root">

      {/* ── Desktop left sidebar ──────────────────────────────────────── */}
      <aside className="sh-sidebar">
        <div className="sh-logo-row">
          <SharesLogoFull height={40} />
        </div>

        <nav className="sh-nav">
          <NavItem to="/shares"              icon={Compass} label="Explore" />
          <NavItem to="/shares/notifications" icon={Bell}   label="Notifications" badge={unreadCount} />
          <button className="sh-nav-link" onClick={() => navigate('/dashboard')} type="button" style={{ background: 'none', border: 'none', width: '100%', cursor: 'pointer', fontFamily: 'inherit' }}>
            <Home size={18} />
            Home / Dashboard
          </button>
        </nav>

        <button className="sh-nav-post-btn" onClick={() => setComposer(true)} type="button">
          <PlusSquare size={16} /> New Post
        </button>
      </aside>

      {/* ── Page content ─────────────────────────────────────────────── */}
      <main style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        {/* Mobile top bar */}
        <header style={{
          display: 'none',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 16px',
          background: 'white',
          borderBottom: '1px solid var(--sh-border-neutral)',
          position: 'sticky', top: 0, zIndex: 40,
        }} className="sh-mobile-topbar">
          <SharesLogoFull height={30} />
          <button className="sh-nav-post-btn" style={{ width: 'auto', padding: '8px 14px' }} onClick={() => setComposer(true)} type="button">
            <PlusSquare size={14} /> Post
          </button>
        </header>

        <div className="sh-main" style={{ maxWidth: '100%', padding: 0 }}>
          <Routes>
            <Route index element={<SharesFeed {...pageProps} />} />
            <Route path="explore" element={<SharesExplore uid={uid} displayName={displayName} initials={initials} />} />
            <Route path="post/:postId" element={<SharePostPage uid={uid} displayName={displayName} initials={initials} />} />
            <Route path="notifications" element={<SharesNotifications uid={uid} />} />
            <Route path="profile/:uid" element={<SharesProfile myUid={uid} myDisplayName={displayName} myInitials={initials} />} />
            <Route path="profile" element={<SharesProfile myUid={uid} myDisplayName={displayName} myInitials={initials} />} />
          </Routes>
        </div>
      </main>

      {/* ── Mobile bottom nav ─────────────────────────────────────────── */}
      <nav className="sh-mobile-nav">
        <div className="sh-mobile-nav-inner">
          <NavLink to="/shares" end className={({ isActive }) => `sh-mobile-nav-btn ${isActive ? 'active' : ''}`}>
            <Compass size={22} /><span>Explore</span>
          </NavLink>
          <button className="sh-mobile-fab" onClick={() => setComposer(true)} type="button" aria-label="New Post">
            <PlusSquare size={24} />
          </button>
          <NavLink to="/shares/notifications" className={({ isActive }) => `sh-mobile-nav-btn ${isActive ? 'active' : ''}`}>
            <Bell size={22} />
            {unreadCount > 0 && (
              <span style={{ position: 'absolute', top: 4, right: 8, background: '#ef4444', color: '#fff', borderRadius: 10, fontSize: 9, padding: '1px 5px', fontWeight: 700 }}>
                {unreadCount}
              </span>
            )}
            <span>Notifs</span>
          </NavLink>
          <NavLink to={`/shares/profile/${uid}`} className={({ isActive }) => `sh-mobile-nav-btn ${isActive ? 'active' : ''}`}>
            <User size={22} /><span>Me</span>
          </NavLink>
        </div>
      </nav>

      {/* ── Post composer modal ───────────────────────────────────────── */}
      {composer && (
        <PostComposer
          uid={uid}
          school={school}
          gradeLevel={gradeLevel}
          subject={subject}
          onSuccess={() => {}}
          onClose={() => setComposer(false)}
        />
      )}
    </div>
  );
}
