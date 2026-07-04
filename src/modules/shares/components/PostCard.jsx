import { useState, useMemo } from 'react';
import PropTypes from 'prop-types';
import { Link } from 'react-router-dom';
import { MoreHorizontal, Trash2, Pencil, Share2, MessageCircle, Check, X } from 'lucide-react';
import { PhotoGrid }    from './PhotoGrid';
import { PhotoLightbox } from './PhotoLightbox';
import { ReactionBar }  from './ReactionBar';
import { CommentThread } from './CommentThread';
import { RichTextEditor } from './RichTextEditor';
import { timeAgo, avatarColor, getInitials, deletePost, editPost } from '../services/sharesService';
import ShareModal from '../../../components/ShareModal';

const isHTMLCaption = str => /<[a-z][\s\S]*>/i.test(str);

function sanitizeHTML(html) {
  if (typeof window === 'undefined') return html;
  const el = document.createElement('div');
  el.innerHTML = html;
  el.querySelectorAll('script,style,iframe,object,embed,form').forEach(n => n.remove());
  el.querySelectorAll('*').forEach(n => {
    ['onclick','onerror','onload','onmouseover'].forEach(a => n.removeAttribute(a));
  });
  return el.innerHTML;
}

function renderPlainCaption(caption) {
  if (!caption) return null;
  const parts = caption.split(/(#\w+)/g);
  return parts.map((part, i) =>
    part.startsWith('#')
      ? <Link key={i} to={`/shares/explore?tag=${part.slice(1)}`} className="sh-hashtag">{part}</Link>
      : part
  );
}

export function PostCard({ post, uid, displayName, initials, photoURL, onDelete }) {
  const [lightbox,      setLightbox]      = useState(null);
  const [showMenu,      setShowMenu]      = useState(false);
  const [showComments,  setShowComments]  = useState(false);
  const [deleting,      setDeleting]      = useState(false);
  const [title,         setTitle]         = useState(post.title || '');
  const [caption,       setCaption]       = useState(post.caption || '');
  const [editedAt,      setEditedAt]      = useState(post.editedAt || null);
  const [editing,       setEditing]       = useState(false);
  const [editTitle,     setEditTitle]     = useState(post.title || '');
  const [editValue,     setEditValue]     = useState(post.caption || '');
  const [savingEdit,    setSavingEdit]    = useState(false);
  const [shareOpen,     setShareOpen]     = useState(false);

  const captionIsHTML = useMemo(() => isHTMLCaption(caption), [caption]);
  const safeHTML      = useMemo(() => captionIsHTML ? sanitizeHTML(caption) : '', [captionIsHTML, caption]);

  const isOwn = post.authorUid === uid;
  const bg    = post.avatarColor || avatarColor(post.authorUid);

  async function handleDelete() {
    setShowMenu(false);
    if (!window.confirm('Delete this post? This cannot be undone.')) return;
    setDeleting(true);
    try {
      await deletePost(post.id, uid);
      onDelete?.(post.id);
    } catch (e) {
      setDeleting(false);
      alert('Could not delete post. Please try again.');
    }
  }

  function startEdit() {
    setShowMenu(false);
    setEditTitle(title);
    setEditValue(caption);
    setEditing(true);
  }

  async function handleSaveEdit() {
    if (!editValue.trim() || savingEdit) return;
    setSavingEdit(true);
    try {
      await editPost(post.id, { title: editTitle, caption: editValue });
      setTitle(editTitle);
      setCaption(editValue);
      setEditedAt(true);
      setEditing(false);
    } catch {
      alert('Could not save changes. Please try again.');
    } finally {
      setSavingEdit(false);
    }
  }

  const captionPreview = (post.caption || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120);
  const shareUrl = `${window.location.origin}/shares/post/${post.id}`;

  return (
    <article className="sh-card" style={deleting ? { opacity: 0.4, pointerEvents: 'none' } : {}}>

      {/* Header */}
      <div className="sh-card-header">
        <div className="sh-avatar sh-avatar--md" style={{ background: bg, color: '#fff' }}>
          {post.authorPhotoURL
            ? <img src={post.authorPhotoURL} alt={post.authorName || 'Teacher'} />
            : post.authorInitials || getInitials(post.authorName)}
        </div>
        <div className="sh-card-header-info">
          <span className="sh-author-name">
            {post.authorName || 'Teacher'}
          </span>
          <div className="sh-author-meta">
            {post.school    && <span>{post.school}</span>}
            {post.school && post.gradeLevel && <span className="sh-author-meta-dot">·</span>}
            {post.gradeLevel && <span>{post.gradeLevel}</span>}
            {(post.school || post.gradeLevel) && post.createdAt && <span className="sh-author-meta-dot">·</span>}
            {post.createdAt && <span>{timeAgo(post.createdAt)}</span>}
            {editedAt && <span className="sh-author-meta-dot">·</span>}
            {editedAt && <span style={{ fontStyle: 'italic' }}>edited</span>}
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
                  onClick={startEdit}
                  style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', border: 'none', background: 'none', cursor: 'pointer', color: '#374151', fontSize: 13, fontWeight: 600, fontFamily: 'inherit', borderRadius: 7 }}
                  onMouseEnter={e => { e.currentTarget.style.background = '#f3f4f6'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'none'; }}
                  type="button"
                >
                  <Pencil size={14} /> Edit post
                </button>
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

      {/* Title */}
      {!editing && title && <h2 className="sh-post-title">{title}</h2>}

      {/* Caption */}
      {editing ? (
        <div style={{ padding: '0 16px 10px' }}>
          <input
            className="sh-composer-title-input"
            type="text"
            placeholder="Add a title (optional)…"
            value={editTitle}
            onChange={e => setEditTitle(e.target.value)}
            maxLength={120}
            style={{ marginBottom: 10 }}
          />
          <RichTextEditor onChange={setEditValue} initialValue={editValue} placeholder="Share your thoughts…" />
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
            <button
              onClick={() => setEditing(false)}
              disabled={savingEdit}
              type="button"
              style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 14px', borderRadius: 8, border: '1px solid #e5e7eb', background: 'white', color: '#374151', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
            >
              <X size={13} /> Cancel
            </button>
            <button
              onClick={handleSaveEdit}
              disabled={savingEdit || !editValue.trim()}
              type="button"
              style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 14px', borderRadius: 8, border: 'none', background: '#1D9E75', color: 'white', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', opacity: savingEdit || !editValue.trim() ? 0.6 : 1 }}
            >
              <Check size={13} /> {savingEdit ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      ) : caption && (
        captionIsHTML
          ? <div className="sh-caption sh-caption--rich" dangerouslySetInnerHTML={{ __html: safeHTML }} />
          : <p className="sh-caption">{renderPlainCaption(caption)}</p>
      )}

      {/* Reactions */}
      <ReactionBar
        postId={post.id}
        uid={uid}
        initialReactions={post.reactions}
        postAuthorUid={post.authorUid}
      />

      {/* Comments toggle + Share */}
      <div style={{ padding: '0 16px 4px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <button
          className="sh-expand-btn"
          onClick={() => setShowComments(v => !v)}
          type="button"
          style={{ display: 'flex', alignItems: 'center', gap: 5 }}
        >
          <MessageCircle size={13} />
          {showComments ? 'Hide comments' : `${post.commentCount || 0} comment${post.commentCount !== 1 ? 's' : ''}`}
        </button>
        <button
          className="sh-expand-btn"
          onClick={() => setShareOpen(true)}
          type="button"
          style={{ display: 'flex', alignItems: 'center', gap: 5 }}
        >
          <Share2 size={13} /> Share
        </button>
      </div>

      {showComments && (
        <CommentThread
          postId={post.id}
          uid={uid}
          postAuthorUid={post.authorUid}
          displayName={displayName}
          initials={initials}
          photoURL={photoURL}
          commentCount={post.commentCount}
        />
      )}

      {/* Lightbox */}
      {lightbox !== null && (
        <PhotoLightbox
          urls={post.photoUrls}
          initialIndex={lightbox}
          caption={caption}
          onClose={() => setLightbox(null)}
        />
      )}

      {/* Share modal */}
      {shareOpen && (
        <ShareModal
          url={shareUrl}
          title={captionPreview || `${post.authorName || 'A teacher'}'s post`}
          modalTitle="Share Post"
          shareText={`Check out this post by ${post.authorName || 'a teacher'} on kaTuro Shares${captionPreview ? `: "${captionPreview}"` : ''}`}
          onClose={() => setShareOpen(false)}
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
  photoURL:    PropTypes.string,
  onDelete:    PropTypes.func,
};
