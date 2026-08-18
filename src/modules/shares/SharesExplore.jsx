import { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import { useSearchParams } from 'react-router-dom';
import { Search } from 'lucide-react';
import { useFeed }    from './hooks/useFeed';
import { useSearch }  from './hooks/useSearch';
import { PostCard }   from './components/PostCard';
import { SkeletonCard } from './components/SkeletonCard';
import { TeacherCard }  from './components/TeacherCard';
import { HashtagPill }  from './components/HashtagPill';
import { useNavigate }  from 'react-router-dom';

export default function SharesExplore({ uid, displayName, initials, photoURL, isAdmin }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [query, setQuery] = useState('');
  const navigate = useNavigate();

  const activeTag = searchParams.get('tag') || '';

  const { results, trending, searching, search, loadTrending } = useSearch();
  const { posts, loading, loadingMore, hasMore, load, loadMore, removePost } = useFeed(
    activeTag ? 'hashtag' : 'global',
    uid,
    activeTag || null
  );

  useEffect(() => { loadTrending(); }, []);
  useEffect(() => { load(); }, [activeTag]);
  useEffect(() => { search(query); }, [query]);

  function selectTag(tag) {
    setQuery('');
    setSearchParams({ tag });
  }

  return (
    <div style={{ padding: '0 16px' }}>

      {/* Search box */}
      <div className="sh-search-box" style={{ marginBottom: 16 }}>
        <Search size={16} color="var(--sh-text-muted)" />
        <input
          className="sh-search-input"
          placeholder="Search teachers by name…"
          value={query}
          onChange={e => setQuery(e.target.value)}
          type="search"
        />
      </div>

      {/* Search results */}
      {query.trim() ? (
        searching
          ? <p style={{ color: 'var(--sh-text-muted)', fontSize: 13, padding: '8px 0' }}>Searching…</p>
          : results.length === 0
            ? <p style={{ color: 'var(--sh-text-muted)', fontSize: 13, padding: '8px 0' }}>No teachers found for "{query}"</p>
            : (
              <div className="sh-widget" style={{ marginBottom: 16 }}>
                {results.map(t => (
                  <TeacherCard key={t.id} teacher={t} myUid={uid} myName={displayName} />
                ))}
              </div>
            )
      ) : (
        <>
          {/* Trending hashtags row */}
          {trending.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <div className="sh-explore-section-title">Trending hashtags</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {trending.map(({ tag }) => (
                  <HashtagPill
                    key={tag}
                    tag={tag}
                    onClick={selectTag}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Active hashtag header */}
          {activeTag && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: 'var(--sh-teal)' }}>
                #{activeTag}
              </h2>
              <button
                onClick={() => setSearchParams({})}
                style={{ fontSize: 12, color: 'var(--sh-text-muted)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}
                type="button"
              >
                ✕ Clear
              </button>
            </div>
          )}

          {/* Posts */}
          {loading
            ? [...Array(3)].map((_, i) => <SkeletonCard key={i} />)
            : posts.length === 0
              ? (
                <div className="sh-empty">
                  <div className="sh-empty-icon" style={{ display: 'flex', justifyContent: 'center', opacity: 0.35 }}><Search size={36} /></div>
                  <div className="sh-empty-title">
                    {activeTag ? `No posts tagged #${activeTag} yet` : 'Nothing here yet'}
                  </div>
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
                  isAdmin={isAdmin}
                  onDelete={removePost}
                />
              ))
          }

          {!loading && hasMore && (
            <button className="sh-load-more-btn" onClick={loadMore} disabled={loadingMore} type="button">
              {loadingMore ? 'Loading…' : 'Load more'}
            </button>
          )}
        </>
      )}
    </div>
  );
}

SharesExplore.propTypes = {
  uid:         PropTypes.string.isRequired,
  displayName: PropTypes.string.isRequired,
  initials:    PropTypes.string.isRequired,
  photoURL:    PropTypes.string,
  isAdmin:     PropTypes.bool,
};
