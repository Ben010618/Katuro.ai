import { useState } from 'react';
import PropTypes from 'prop-types';
import { Link } from 'react-router-dom';
import { MoreHorizontal, Trash2, MessageCircle } from 'lucide-react';
import { PhotoGrid }    from './PhotoGrid';
import { PhotoLightbox } from './PhotoLightbox';
import { ReactionBar }  from './ReactionBar';
import { CommentThread } from './CommentThread';
import { timeAgo, avatarColor, getInitials } from '../services/sharesService';

function renderCaption(caption) {
  if (!caption) return null;
  const parts = caption.split(/(#\w+)/g);
  return parts.map((part, i) =>
    part.startsWith('#')
      ? <Link key={i} to={`/shares/explore?tag=${part.slice(1)}`} className="sh-hashtag">{part}</Link>
      : part
  );
}

export function PostCard({ post, uid, displayName, initials, onDelete }) {
  const [lightbox,      setLightbox]      = useState(null);
  const [showMenu,      setShowMenu]      = useState(false);
  const [showComments,  setShowComments]  = useState(false);

  const isOwn = post.authorUid === uid;
  const bg    = post.avatarColor || avatarColor(post.authorUid);

  async function handleDelete() {
    setShowMenu(false);
    if (window.confirm('Delete this post?')) onDelete?.(post.id);
  }

  return (
    <article className="sh-card">

      {/* Header */}
      <div className="sh-card-header">
        <Link to={`/shares/profile/${post.authorUid}`} style={{ textDecoration: 'none' }}>
          <div className="sh-avatar sh-avatar--md" style={{ background: bg, color: '#fff' }}>
            {post.authorInitials || getInitials(post.authorName)}
          </div>
        </Link>
        <div className="sh-card-header-info">
          <Link to={`/shares/profile/${post.authorUid}`} className="sh-author-name">
            {post.authorName || 'Teacher'}
          </Link>
          <div className="sh-author-meta">
            {post.school    && <span>{post.school}</span>}
            {post.school && post.gradeLevel && <span className="sh-author-meta-dot">·</span>}
            {post.gradeLevel && <span>{post.gradeLevel}</span>}
            {(post.school || post.gradeLevel) && post.createdAt && <span className="sh-author-meta-dot">·</span>}
            {post.createdAt && <span>{timeAgo(post.createdAt)}</span>}
          </div>
        </div>
        {isOwn && (
          <div style={{ position: 'relative' }}>
            <button className="sh-card-menu-btn" onClick={() => setShowMenu(v => !v)} type="button" aria-label="Post options">
              <MoreHorizontal size={18} />
            </button>
            {showMenu && (
              <div style={{
                position: 'absolute', right: 0, top: '100%', zIndex: 50,
                background: 'white', border: '1px solid #e5e7eb',
                borderRadius: 10, boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
                minWidth: 140, padding: 6,
              }}>
                <button
                  onClick={handleDelete}
                  style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', border: 'none', background: 'none', cursor: 'pointer', color: '#ef4444', fontSize: 13, fontWeight: 600, fontFamily: 'inherit', borderRadius: 7 }}
                  onMouseEnter={e => { e.currentTarget.style.background = '#fff5f5'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'none'; }}
                  type="button"
                >
                  <Trash2 size={14} /> Delete post
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Photos */}
      {post.photoUrls?.length > 0 && (
        <PhotoGrid
          urls={post.photoUrls}
          onPhotoClick={i => setLightbox(i)}
        />
      )}

      {/* Tags */}
      {(post.subject || post.gradeLevel) && (
        <div className="sh-post-tags">
          {post.subject    && <span className="sh-tag-chip">{post.subject}</span>}
          {post.gradeLevel && <span className="sh-tag-chip">{post.gradeLevel}</span>}
        </div>
      )}

      {/* Caption */}
      {post.caption && (
        <p className="sh-caption">{renderCaption(post.caption)}</p>
      )}

      {/* Reactions */}
      <ReactionBar
        postId={post.id}
        uid={uid}
        initialReactions={post.reactions}
        postAuthorUid={post.authorUid}
      />

      {/* Comments toggle */}
      <div style={{ padding: '0 16px 4px' }}>
        <button
          className="sh-expand-btn"
          onClick={() => setShowComments(v => !v)}
          type="button"
          style={{ display: 'flex', alignItems: 'center', gap: 5 }}
        >
          <MessageCircle size={13} />
          {showComments ? 'Hide comments' : `${post.commentCount || 0} comment${post.commentCount !== 1 ? 's' : ''}`}
        </button>
      </div>

      {showComments && (
        <CommentThread
          postId={post.id}
          uid={uid}
          postAuthorUid={post.authorUid}
          displayName={displayName}
          initials={initials}
          commentCount={post.commentCount}
        />
      )}

      {/* Lightbox */}
      {lightbox !== null && (
        <PhotoLightbox
          urls={post.photoUrls}
          initialIndex={lightbox}
          caption={post.caption}
          onClose={() => setLightbox(null)}
        />
      )}
    </article>
  );
}

PostCard.propTypes = {
  post:        PropTypes.object.isRequired,
  uid:         PropTypes.string.isRequired,
  displayName: PropTypes.string.isRequired,
  initials:    PropTypes.string.isRequired,
  onDelete:    PropTypes.func,
};
