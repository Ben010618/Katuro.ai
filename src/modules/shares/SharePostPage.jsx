import { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { PostCard }    from './components/PostCard';
import { SkeletonCard } from './components/SkeletonCard';
import { getPost }     from './services/sharesService';

export default function SharePostPage({ uid, displayName, initials }) {
  const { postId } = useParams();
  const navigate    = useNavigate();
  const [post,     setPost]     = useState(null);
  const [loading,  setLoading]  = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    let active = true;
    getPost(postId)
      .then(p => {
        if (!active) return;
        if (p) setPost(p); else setNotFound(true);
      })
      .catch(() => { if (active) setNotFound(true); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [postId]);

  return (
    <div style={{ padding: '0 16px', maxWidth: 620, margin: '0 auto' }}>
      <button
        onClick={() => navigate('/shares')}
        type="button"
        style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--sh-text-secondary)', fontSize: 13, fontWeight: 600, fontFamily: 'inherit', padding: '14px 0 6px' }}
      >
        <ArrowLeft size={15} /> Back to Explore
      </button>

      {loading && <SkeletonCard />}

      {!loading && notFound && (
        <div className="sh-empty">
          <div className="sh-empty-icon" style={{ fontSize: 48 }}>🔍</div>
          <div className="sh-empty-title">Post not found</div>
          <p className="sh-empty-text">This post may have been deleted or the link is incorrect.</p>
        </div>
      )}

      {!loading && post && (
        <PostCard
          post={post}
          uid={uid}
          displayName={displayName}
          initials={initials}
          onDelete={() => navigate('/shares')}
        />
      )}
    </div>
  );
}

SharePostPage.propTypes = {
  uid:         PropTypes.string.isRequired,
  displayName: PropTypes.string.isRequired,
  initials:    PropTypes.string.isRequired,
};
