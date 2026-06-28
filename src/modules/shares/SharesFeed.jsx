import { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import { useFeed } from './hooks/useFeed';
import { PostCard }    from './components/PostCard';
import { SkeletonCard } from './components/SkeletonCard';
import { TeacherCard }  from './components/TeacherCard';
import { fetchSuggestions, fetchTrendingHashtags } from './services/sharesService';
import { useNavigate } from 'react-router-dom';

const FEED_MODES = [
  { key: 'global',    label: 'All' },
  { key: 'following', label: 'Following' },
];

export default function SharesFeed({ uid, displayName, initials, school, gradeLevel, subject }) {
  const [mode,       setMode]       = useState('global');
  const [suggestions, setSuggestions] = useState([]);
  const [trending,   setTrending]   = useState([]);
  const navigate = useNavigate();

  const { posts, loading, loadingMore, hasMore, load, loadMore, removePost } = useFeed(mode, uid);

  useEffect(() => { load(); }, [mode]);

  useEffect(() => {
    fetchSuggestions(uid, school, gradeLevel).then(setSuggestions).catch(() => {});
    fetchTrendingHashtags().then(setTrending).catch(() => {});
  }, [uid, school, gradeLevel]);

  return (
    <div style={{ display: 'flex', gap: 0 }}>

      {/* Feed */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="sh-feed">
          {/* Filter tabs */}
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

          {/* Posts */}
          {loading
            ? [...Array(3)].map((_, i) => <SkeletonCard key={i} />)
            : posts.length === 0
              ? (
                <div className="sh-empty">
                  <div className="sh-empty-icon" style={{ fontSize: 48 }}>📷</div>
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

      {/* Right panel */}
      <div className="sh-right-panel">
        {trending.length > 0 && (
          <div className="sh-widget">
            <div className="sh-widget-title">Trending this week</div>
            {trending.slice(0, 8).map(({ tag, count }) => (
              <div key={tag} className="sh-trending-tag" onClick={() => navigate(`/shares/explore?tag=${tag}`)}>
                <span className="sh-trending-tag-name">#{tag}</span>
                <span className="sh-trending-tag-count">{count} posts</span>
              </div>
            ))}
          </div>
        )}

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
  uid:         PropTypes.string.isRequired,
  displayName: PropTypes.string.isRequired,
  initials:    PropTypes.string.isRequired,
  school:      PropTypes.string,
  gradeLevel:  PropTypes.string,
  subject:     PropTypes.string,
};
