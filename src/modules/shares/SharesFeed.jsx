import { useState, useEffect, useRef } from 'react';
import PropTypes from 'prop-types';
import { useNavigate } from 'react-router-dom';
import { useFeed } from './hooks/useFeed';
import { useAutoScroll } from './hooks/useAutoScroll';
import { ImageOff, ImagePlus } from 'lucide-react';
import { PostCard }    from './components/PostCard';
import { SkeletonCard } from './components/SkeletonCard';
import { TeacherCard }  from './components/TeacherCard';
import { AutoScrollToggle } from './components/AutoScrollToggle';
import {
  fetchSuggestions,
  fetchTrendingHashtags,
  fetchOnlineTeachers,
  avatarColor,
  getInitials,
} from './services/sharesService';

const FEED_MODES = [
  { key: 'global',    label: 'All' },
  { key: 'following', label: 'Following' },
];

export default function SharesFeed({ uid, displayName, initials, photoURL, school, gradeLevel, subject, onOpenComposer }) {
  const [mode,           setMode]           = useState('global');
  const [suggestions,    setSuggestions]    = useState([]);
  const [trending,       setTrending]       = useState([]);
  const [onlineTeachers, setOnlineTeachers] = useState([]);
  const [autoScroll,     setAutoScroll]     = useState(() => {
    const saved = localStorage.getItem('sh_autoscroll');
    return saved === null ? true : saved === '1'; // defaults ON
  });
  const navigate = useNavigate();
  const feedRef  = useRef(null);

  const { posts, loading, loadingMore, hasMore, load, loadMore, removePost } = useFeed(mode, uid);

  useAutoScroll(feedRef, autoScroll && !loading && posts.length > 0);

  function toggleAutoScroll(next) {
    setAutoScroll(next);
    localStorage.setItem('sh_autoscroll', next ? '1' : '0');
  }

  useEffect(() => { load(); }, [mode]);

  useEffect(() => {
    fetchSuggestions(uid, school, gradeLevel).then(setSuggestions).catch(() => {});
    fetchTrendingHashtags().then(setTrending).catch(() => {});
    fetchOnlineTeachers(uid).then(setOnlineTeachers).catch(() => {});
  }, [uid, school, gradeLevel]);

  const myBg = avatarColor(uid);

  return (
    <div className="sh-feed-layout">

      {/* Feed column */}
      <div className="sh-feed-col" ref={feedRef}>
        <div className="sh-feed">

          {/* Composer trigger — opens the full post composer */}
          <button type="button" className="sh-composer-trigger" onClick={onOpenComposer}>
            <div className="sh-avatar sh-avatar--md" style={{ background: myBg, color: '#fff', flexShrink: 0 }}>
              {photoURL ? <img src={photoURL} alt={displayName} /> : initials}
            </div>
            <span className="sh-composer-trigger-text">
              What&rsquo;s on your mind, {displayName.split(' ')[0]}?
            </span>
            <span className="sh-composer-trigger-icon">
              <ImagePlus size={17} />
            </span>
          </button>

          <div className="sh-filter-row">
            <div className="sh-filter-tabs">
              {FEED_MODES.map(m => (
                <button
                  key={m.key}
                  className={`sh-filter-tab ${mode === m.key ? 'active' : ''}`}
                  onClick={() => setMode(m.key)}
                  type="button"
                >
                  {m.label}
                </button>
              ))}
            </div>
            <AutoScrollToggle checked={autoScroll} onChange={toggleAutoScroll} label="Auto-scroll" />
          </div>

          {loading
            ? [...Array(3)].map((_, i) => <SkeletonCard key={i} />)
            : posts.length === 0
              ? (
                <div className="sh-empty">
                  <div className="sh-empty-icon" style={{ display: 'flex', justifyContent: 'center', opacity: 0.35 }}><ImageOff size={40} /></div>
                  <div className="sh-empty-title">No posts yet</div>
                  <p className="sh-empty-text">
                    {mode === 'following'
                      ? 'Follow some teachers to see their posts here.'
                      : 'Be the first to share a classroom moment!'}
                  </p>
                </div>
              )
              : posts.map(post => (
                <PostCard
                  key={post.id}
                  post={post}
                  uid={uid}
                  displayName={displayName}
                  initials={initials}
                  photoURL={photoURL}
                  onDelete={async (id) => { removePost(id); }}
                />
              ))
          }

          {!loading && hasMore && (
            <button className="sh-load-more-btn" onClick={loadMore} disabled={loadingMore} type="button">
              {loadingMore ? 'Loading…' : 'Load more posts'}
            </button>
          )}
        </div>
      </div>

      {/* Right panel — always visible at ≥ 1100px */}
      <div className="sh-right-panel">

        {/* My Profile mini card */}
        <div className="sh-widget sh-my-card">
          <div className="sh-my-card-inner">
            <div
              className="sh-avatar sh-avatar--md"
              style={{ background: myBg, color: '#fff', flexShrink: 0 }}
            >
              {photoURL ? <img src={photoURL} alt={displayName} /> : initials}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--sh-text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {displayName}
              </div>
              {school && (
                <div style={{ fontSize: 11, color: 'var(--sh-text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginTop: 1 }}>
                  {school}
                </div>
              )}
              {(gradeLevel || subject) && (
                <div style={{ fontSize: 11, color: 'var(--sh-text-muted)', marginTop: 1 }}>
                  {[gradeLevel, subject].filter(Boolean).join(' · ')}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* kaTuro Announcement */}
        <div className="sh-widget sh-announcement-card">
          <div className="sh-widget-title">kaTuro Update</div>
          <p style={{ fontSize: 13, color: 'var(--sh-text-secondary)', lineHeight: 1.55, margin: '0 0 10px' }}>
            Welcome to <strong>kaTuro Shares</strong> — share classroom moments, creative lessons, and student activities with fellow Filipino teachers. 🇵🇭
          </p>
          <button
            onClick={() => navigate('/dashboard')}
            style={{ background: 'none', border: 'none', color: 'var(--sh-primary)', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}
            type="button"
          >
            Go to Dashboard →
          </button>
        </div>

        {/* Online teachers */}
        {onlineTeachers.length > 0 && (
          <div className="sh-widget">
            <div className="sh-widget-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#23a55a', flexShrink: 0 }} />
              Online Now
            </div>
            {onlineTeachers.slice(0, 6).map(t => (
              <div key={t.id} className="sh-teacher-card">
                <div className="sh-avatar sh-avatar--sm" style={{ background: avatarColor(t.id), color: '#fff' }}>
                  {t.photoURL
                    ? <img src={t.photoURL} alt={t.displayName || 'T'} />
                    : getInitials(t.displayName || 'T')}
                </div>
                <div className="sh-teacher-card-info">
                  <div className="sh-teacher-card-name">{t.displayName || 'Teacher'}</div>
                  {t.school && <div className="sh-teacher-card-school">{t.school}</div>}
                </div>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#23a55a', flexShrink: 0, marginLeft: 4 }} />
              </div>
            ))}
          </div>
        )}

        {/* Trending hashtags */}
        {trending.length > 0 && (
          <div className="sh-widget">
            <div className="sh-widget-title">Trending this week</div>
            {trending.slice(0, 6).map(({ tag, count }) => (
              <div key={tag} className="sh-trending-tag" onClick={() => navigate(`/shares/explore?tag=${tag}`)}>
                <span className="sh-trending-tag-name">#{tag}</span>
                <span className="sh-trending-tag-count">{count} posts</span>
              </div>
            ))}
          </div>
        )}

        {/* Teacher suggestions */}
        {suggestions.length > 0 && (
          <div className="sh-widget">
            <div className="sh-widget-title">Teachers you may know</div>
            {suggestions.map(t => (
              <TeacherCard key={t.id} teacher={t} myUid={uid} myName={displayName} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

SharesFeed.propTypes = {
  uid:            PropTypes.string.isRequired,
  displayName:    PropTypes.string.isRequired,
  initials:       PropTypes.string.isRequired,
  photoURL:       PropTypes.string,
  school:         PropTypes.string,
  gradeLevel:     PropTypes.string,
  subject:        PropTypes.string,
  onOpenComposer: PropTypes.func,
};
