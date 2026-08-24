import { useState, useEffect, useCallback, useMemo } from 'react';
import PropTypes from 'prop-types';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';
import { isHTMLCaption, sanitizeHTML, renderPlainCaption } from '../utils/captionUtils';
import { avatarColor, getInitials, timeAgo } from '../services/sharesService';
import { ReactionBar } from './ReactionBar';
import { CommentThread } from './CommentThread';

/**
 * Facebook & Instagram style Theater Photo Modal / Lightbox.
 * Displays the full unobstructed photo on the left/stage,
 * and a scrollable sidebar with author info, full rich caption,
 * reactions, and comment thread on the right.
 */
export function PhotoLightbox({
  post,
  urls = [],
  initialIndex = 0,
  caption = '',
  title = '',
  uid = '',
  displayName = '',
  initials = '',
  photoURL = null,
  isAdmin = false,
  onClose,
}) {
  const [idx, setIdx] = useState(initialIndex ?? 0);

  const activeCaption = caption || post?.caption || '';
  const activeTitle = title || post?.title || '';
  const captionIsHTML = useMemo(() => isHTMLCaption(activeCaption), [activeCaption]);
  const safeHTML = useMemo(() => (captionIsHTML ? sanitizeHTML(activeCaption) : ''), [captionIsHTML, activeCaption]);

  const authorName = post?.authorName || 'Teacher';
  const authorInitials = post?.authorInitials || getInitials(authorName);
  const authorPhotoURL = post?.authorPhotoURL;
  const authorBg = post?.avatarColor || avatarColor(post?.authorUid || '');

  const prev = useCallback(() => setIdx(i => (i - 1 + urls.length) % urls.length), [urls.length]);
  const next = useCallback(() => setIdx(i => (i + 1) % urls.length), [urls.length]);

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape')     onClose();
      if (e.key === 'ArrowLeft')  prev();
      if (e.key === 'ArrowRight') next();
    }
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onClose, prev, next]);

  return (
    <div className="sh-lightbox" onClick={onClose} role="dialog" aria-modal="true">
      <div className="sh-theater-container" onClick={e => e.stopPropagation()}>
        
        {/* Left / Center Photo Stage */}
        <div className="sh-theater-stage" onClick={onClose}>
          {/* Close button (top-left on desktop) */}
          <button
            className="sh-theater-close"
            onClick={onClose}
            aria-label="Close"
            title="Close (Esc)"
          >
            <X size={20} />
          </button>

          {/* Left Arrow */}
          {urls.length > 1 && (
            <button
              className="sh-theater-nav sh-theater-nav--prev"
              onClick={e => { e.stopPropagation(); prev(); }}
              aria-label="Previous photo"
            >
              <ChevronLeft size={24} />
            </button>
          )}

          {/* Photo display area (unobstructed full view) */}
          <div className="sh-theater-img-wrap" onClick={onClose}>
            <img
              src={urls[idx]}
              alt={`Photo ${idx + 1} of ${urls.length}`}
              className="sh-theater-img"
              onClick={e => e.stopPropagation()}
              draggable={false}
            />
          </div>

          {/* Right Arrow */}
          {urls.length > 1 && (
            <button
              className="sh-theater-nav sh-theater-nav--next"
              onClick={e => { e.stopPropagation(); next(); }}
              aria-label="Next photo"
            >
              <ChevronRight size={24} />
            </button>
          )}

          {/* Counter badge if multiple photos */}
          {urls.length > 1 && (
            <div className="sh-theater-counter">
              {idx + 1} / {urls.length}
            </div>
          )}
        </div>

        {/* Right Sidebar: Author, Rich Story/Caption, Reactions, Comments */}
        <div className="sh-theater-sidebar">
          {/* Header */}
          <div className="sh-theater-sidebar-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 }}>
              <div
                className="sh-avatar sh-avatar--md"
                style={{ background: authorBg, color: '#fff', flexShrink: 0 }}
              >
                {authorPhotoURL ? (
                  <img src={authorPhotoURL} alt={authorName} />
                ) : (
                  authorInitials
                )}
              </div>
              <div className="sh-card-header-info" style={{ minWidth: 0 }}>
                <span className="sh-author-name" style={{ fontSize: 13.5 }}>
                  {authorName}
                </span>
                <div className="sh-author-meta">
                  {post?.school && <span>{post.school}</span>}
                  {post?.school && post?.gradeLevel && <span className="sh-author-meta-dot">·</span>}
                  {post?.gradeLevel && <span>{post.gradeLevel}</span>}
                  {(post?.school || post?.gradeLevel) && post?.createdAt && <span className="sh-author-meta-dot">·</span>}
                  {post?.createdAt && <span>{timeAgo(post.createdAt)}</span>}
                </div>
              </div>
            </div>

            {/* Sidebar close button */}
            <button
              className="sh-theater-sidebar-close"
              onClick={onClose}
              aria-label="Close"
              title="Close (Esc)"
            >
              <X size={18} />
            </button>
          </div>

          {/* Scrollable Content Body */}
          <div className="sh-theater-sidebar-body">
            {/* Tags */}
            {(post?.subject || post?.gradeLevel) && (
              <div className="sh-post-tags" style={{ padding: '0 16px 8px' }}>
                {post?.subject && <span className="sh-tag-chip">{post.subject}</span>}
                {post?.gradeLevel && <span className="sh-tag-chip">{post.gradeLevel}</span>}
              </div>
            )}

            {/* Title */}
            {activeTitle && (
              <div style={{ padding: '0 16px 6px' }}>
                <h2 className="sh-theater-title">{activeTitle}</h2>
              </div>
            )}

            {/* Full Story / Caption */}
            {activeCaption && (
              <div className="sh-theater-caption-wrap">
                {captionIsHTML ? (
                  <div
                    className="sh-caption sh-caption--rich"
                    style={{ padding: 0 }}
                    dangerouslySetInnerHTML={{ __html: safeHTML }}
                  />
                ) : (
                  <p className="sh-caption" style={{ padding: 0 }}>
                    {renderPlainCaption(activeCaption)}
                  </p>
                )}
              </div>
            )}

            {/* Reactions */}
            {post?.id && uid && (
              <div style={{ borderTop: '1px solid var(--kt-border, #DCD0AE)', paddingTop: 6 }}>
                <ReactionBar
                  postId={post.id}
                  uid={uid}
                  initialReactions={post.reactions}
                  postAuthorUid={post.authorUid}
                />
              </div>
            )}

            {/* Comments Thread */}
            {post?.id && uid && (
              <div style={{ borderTop: '1px solid var(--kt-border, #DCD0AE)', paddingTop: 10 }}>
                <CommentThread
                  postId={post.id}
                  uid={uid}
                  postAuthorUid={post.authorUid}
                  displayName={displayName}
                  initials={initials}
                  photoURL={photoURL}
                  isAdmin={isAdmin}
                  commentCount={post.commentCount}
                />
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}

PhotoLightbox.propTypes = {
  post:         PropTypes.object,
  urls:         PropTypes.arrayOf(PropTypes.string).isRequired,
  initialIndex: PropTypes.number,
  caption:      PropTypes.string,
  title:        PropTypes.string,
  uid:          PropTypes.string,
  displayName:  PropTypes.string,
  initials:     PropTypes.string,
  photoURL:     PropTypes.string,
  isAdmin:      PropTypes.bool,
  onClose:      PropTypes.func.isRequired,
};

PhotoLightbox.defaultProps = {
  initialIndex: 0,
  urls: [],
};
