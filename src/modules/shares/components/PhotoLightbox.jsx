import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import PropTypes from 'prop-types';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';
import { isHTMLCaption, sanitizeHTML, renderPlainCaption } from '../utils/captionUtils';
import { avatarColor, getInitials, timeAgo } from '../services/sharesService';
import { ReactionBar } from './ReactionBar';
import { CommentThread } from './CommentThread';
import AvatarImage from '../../../components/AvatarImage';

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

  // Zoom: click the photo to look closer (the zoom follows the mouse); click again to fit.
  const [zoom, setZoom] = useState(null); // null | { x, y } in % of the photo
  const swipe = useRef({ x: 0, y: 0, moved: false });

  const prev = useCallback(() => { setZoom(null); setIdx(i => (i - 1 + urls.length) % urls.length); }, [urls.length]);
  const next = useCallback(() => { setZoom(null); setIdx(i => (i + 1) % urls.length); }, [urls.length]);
  const show = (i) => { setZoom(null); setIdx(i); };

  // Load the photos on either side so arrows and swipes feel instant.
  useEffect(() => {
    if (urls.length < 2) return;
    [urls[(idx + 1) % urls.length], urls[(idx - 1 + urls.length) % urls.length]].forEach((u) => { const im = new Image(); im.src = u; });
  }, [idx, urls]);

  const zoomAt = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * 100, y: ((e.clientY - r.top) / r.height) * 100 };
  };
  const onImageClick = (e) => {
    e.stopPropagation();
    if (swipe.current.moved) { swipe.current.moved = false; return; }
    const at = zoomAt(e); // read now: React clears the event before a state updater runs
    setZoom(z => (z ? null : at));
  };
  const onImageMove = (e) => { if (zoom) setZoom(zoomAt(e)); };

  // Swipe left/right on touch screens (not while zoomed in).
  const onPointerDown = (e) => { swipe.current = { x: e.clientX, y: e.clientY, moved: false }; };
  const onPointerUp = (e) => {
    const dx = e.clientX - swipe.current.x;
    const dy = e.clientY - swipe.current.y;
    if (!zoom && urls.length > 1 && Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      swipe.current.moved = true;
      if (dx < 0) next(); else prev();
    }
  };
  // A swipe ends with a click on the stage: that click must not close the viewer.
  const onStageClick = () => {
    if (swipe.current.moved) { swipe.current.moved = false; return; }
    onClose();
  };

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

  // Rendered on <body>: a post card's animation transform would otherwise trap the
  // full-screen viewer inside the card (photo shrunk, part of it off screen).
  return createPortal(
    <div className="sh-lightbox" onClick={onClose} role="dialog" aria-modal="true">
      <div className="sh-theater-container" onClick={e => e.stopPropagation()}>
        
        {/* Left / Center Photo Stage */}
        <div
          className={`sh-theater-stage${urls.length > 1 ? ' sh-theater-stage--multi' : ''}`}
          onClick={onStageClick}
          onPointerDown={onPointerDown}
          onPointerUp={onPointerUp}
        >
          {/* Soft, blurred copy of the photo fills the empty space around any photo shape */}
          <div className="sh-theater-backdrop" style={{ backgroundImage: `url("${urls[idx]}")` }} aria-hidden="true" />

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
              className={`sh-theater-img${zoom ? ' sh-theater-img--zoomed' : ''}`}
              style={zoom ? { transformOrigin: `${zoom.x}% ${zoom.y}%` } : undefined}
              onClick={onImageClick}
              onMouseMove={onImageMove}
              title={zoom ? 'Click to fit the screen' : 'Click to zoom in'}
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

          {/* Thumbnails (posts with several photos) */}
          {urls.length > 1 && (
            <div className="sh-theater-thumbs" onClick={e => e.stopPropagation()}>
              {urls.map((u, i) => (
                <button
                  key={`${u}-${i}`}
                  type="button"
                  className={`sh-theater-thumb${i === idx ? ' active' : ''}`}
                  onClick={() => show(i)}
                  aria-label={`Show photo ${i + 1} of ${urls.length}`}
                  aria-current={i === idx ? 'true' : undefined}
                >
                  <img src={u} alt="" draggable={false} />
                </button>
              ))}
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
                <AvatarImage photoURL={authorPhotoURL} alt={authorName || authorInitials || 'Teacher'} />
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
    </div>,
    document.body,
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
