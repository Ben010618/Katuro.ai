import { useState, useEffect } from 'react';
import { Routes, Route, NavLink } from 'react-router-dom';
import { Compass, Bell } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { ensureSharesProfile, getInitials } from './services/sharesService';
import { useNotifications } from './hooks/useNotifications';
import { PostComposer }     from './components/PostComposer';
import { SharesLogoFull }   from './assets/SharesLogo';
import SharesFeed           from './SharesFeed';
import SharesExplore        from './SharesExplore';
import SharesNotifications  from './SharesNotifications';
import SharePostPage        from './SharePostPage';
import './shares.css';

// kaTuro Shares now lives inside AppShell as the app's landing page — this
// layout only supplies the feed-specific chrome (brand strip, Explore/
// Notifications shortcuts, composer modal). Page-level nav (Dashboard,
// Lesson Gen, etc.) comes from AppShell's own sidebar.
export default function SharesModule() {
  const { user, photoURL, isAdmin } = useAuth();
  const [profile,  setProfile]  = useState(null);
  // Deep link from the daily reminder popup (/shares?compose=1) opens the
  // composer immediately on mount.
  const [composer, setComposer] = useState(() => new URLSearchParams(window.location.search).get('compose') === '1');

  // Strip the ?compose=1 param from the address bar so back/refresh doesn't reopen it.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('compose') === '1') {
      window.history.replaceState(null, '', '/shares');
    }
  }, []);

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
      photoURL,
    }).then(setProfile).catch(() => {});
  }, [user?.uid, photoURL]);

  const pageProps = { uid, displayName, initials, photoURL, school, gradeLevel, subject, isAdmin };

  return (
    <div className="sh-root">
      <div className="sh-page">

        {/* ── Brand strip + Explore/Notifications shortcuts ─────────────── */}
        <div className="sh-subheader">
          <NavLink to="/shares" end className="sh-subheader-logo">
            <SharesLogoFull height={26} />
          </NavLink>
          <div className="sh-subheader-actions">
            <NavLink to="/shares/explore" className={({ isActive }) => `sh-subheader-link ${isActive ? 'active' : ''}`}>
              <Compass size={17} />
              <span>Explore</span>
            </NavLink>
            <NavLink to="/shares/notifications" className={({ isActive }) => `sh-subheader-link ${isActive ? 'active' : ''}`}>
              <Bell size={17} />
              <span>Notifications</span>
              {unreadCount > 0 && <span className="sh-subheader-badge">{unreadCount}</span>}
            </NavLink>
          </div>
        </div>

        {/* ── Page content ───────────────────────────────────────────────── */}
        <main className="sh-main">
          <Routes>
            <Route index element={<SharesFeed {...pageProps} onOpenComposer={() => setComposer(true)} />} />
            <Route path="explore" element={<SharesExplore uid={uid} displayName={displayName} initials={initials} photoURL={photoURL} isAdmin={isAdmin} />} />
            <Route path="post/:postId" element={<SharePostPage uid={uid} displayName={displayName} initials={initials} photoURL={photoURL} isAdmin={isAdmin} />} />
            <Route path="notifications" element={<SharesNotifications uid={uid} />} />
          </Routes>
        </main>
      </div>

      {/* ── Post composer modal ───────────────────────────────────────── */}
      {composer && (
        <PostComposer
          uid={uid}
          displayName={displayName}
          initials={initials}
          photoURL={photoURL}
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
