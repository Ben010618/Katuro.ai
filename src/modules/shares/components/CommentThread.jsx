import { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import { Send, Trash2, Pencil, X, ChevronDown, ChevronUp } from 'lucide-react';
import { useComments } from '../hooks/useComments';
import { timeAgo, avatarColor, getInitials } from '../services/sharesService';
import { subscribeToReplies } from '../services/sharesService';

const PREVIEW_COUNT = 3;

function Avatar({ uid, photoURL, initials, size = 'sm' }) {
  return (
    <div
      className={`sh-avatar sh-avatar--${size}`}
      style={{ background: avatarColor(uid), color: '#fff', flexShrink: 0 }}
    >
      {photoURL ? <img src={photoURL} alt={initials || 'T'} /> : (initials || 'T')}
    </div>
  );
}

function ReplyRow({ r, uid, onDelete, isAdmin }) {
  const isOwn = r.authorUid === uid;
  const canDelete = isOwn || Boolean(isAdmin);
  return (
    <div className="sh-comment" style={{ marginBottom: 6 }}>
      <Avatar uid={r.authorUid} photoURL={r.authorPhotoURL} initials={r.authorInitials || getInitials(r.authorName)} size="sm" />
      <div className="sh-comment-body">
        <div className="sh-comment-bubble">
          <div className="sh-comment-author">{r.authorName || 'Teacher'}</div>
          <div className="sh-comment-text">{r.text}</div>
        </div>
        <div className="sh-comment-actions">
          <span className="sh-comment-time">{timeAgo(r.createdAt)}</span>
          {canDelete && (
            <button
              className="sh-comment-action-btn"
              style={{ color: '#ef4444' }}
              onClick={() => onDelete(r.id)}
              type="button"
              title={isAdmin && !isOwn ? 'Delete reply as Admin' : 'Delete reply'}
            >
              <Trash2 size={10} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function CommentRow({ c, uid, postId, myDisplayName, myInitials, myPhotoURL, isAdmin, addReply, deleteComment, deleteReply, editComment }) {
  const [editing,     setEditing]     = useState(false);
  const [editText,    setEditText]    = useState(c.text);
  const [replyOpen,   setReplyOpen]   = useState(false);
  const [replyText,   setReplyText]   = useState('');
  const [replies,     setReplies]     = useState([]);
  const [showReplies, setShowReplies] = useState(false);

  const isOwn      = c.authorUid === uid;
  const canDelete  = isOwn || Boolean(isAdmin);
  const replyCount = c.replyCount || 0;

  // Subscribe to replies only when the user expands them
  useEffect(() => {
    if (!showReplies) return;
    const unsub = subscribeToReplies(postId, c.id, setReplies);
    return unsub;
  }, [showReplies, postId, c.id]);

  async function submitEdit() {
    if (!editText.trim() || editText === c.text) { setEditing(false); return; }
    await editComment(c.id, editText);
    setEditing(false);
  }

  async function submitReply() {
    if (!replyText.trim()) return;
    await addReply(c.id, c.authorUid, myDisplayName, myInitials, myPhotoURL, replyText);
    setReplyText('');
    setReplyOpen(false);
    setShowReplies(true);
  }

  return (
    <div className="sh-comment">
      <Avatar uid={c.authorUid} photoURL={c.authorPhotoURL} initials={c.authorInitials || getInitials(c.authorName)} size="sm" />
      <div className="sh-comment-body">
        <div className="sh-comment-bubble">
          <div className="sh-comment-author">{c.authorName || 'Teacher'}</div>
          {editing ? (
            <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end', marginTop: 4 }}>
              <textarea
                className="sh-comment-input"
                value={editText}
                onChange={e => setEditText(e.target.value)}
                rows={2}
                autoFocus
                style={{ borderRadius: 8 }}
              />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <button className="sh-comment-send-btn" style={{ width: 28, height: 28 }} onClick={submitEdit} type="button">
                  <Send size={12} />
                </button>
                <button className="sh-comment-send-btn" style={{ width: 28, height: 28, background: '#9ca3af' }} onClick={() => setEditing(false)} type="button">
                  <X size={12} />
                </button>
              </div>
            </div>
          ) : (
            <div className="sh-comment-text">{c.text}</div>
          )}
        </div>

        <div className="sh-comment-actions">
          <span className="sh-comment-time">{timeAgo(c.createdAt)}</span>
          <button className="sh-comment-action-btn" onClick={() => setReplyOpen(v => !v)} type="button">
            Reply
          </button>
          {replyCount > 0 && (
            <button
              className="sh-comment-action-btn"
              onClick={() => setShowReplies(v => !v)}
              type="button"
              style={{ display: 'flex', alignItems: 'center', gap: 3 }}
            >
              {showReplies ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
              {replyCount} {replyCount === 1 ? 'reply' : 'replies'}
            </button>
          )}
          {isOwn && (
            <button className="sh-comment-action-btn" onClick={() => { setEditing(true); setEditText(c.text); }} type="button">
              <Pencil size={10} />
            </button>
          )}
          {canDelete && (
            <button
              className="sh-comment-action-btn"
              style={{ color: '#ef4444' }}
              onClick={() => deleteComment(c.id)}
              type="button"
              title={isAdmin && !isOwn ? 'Delete comment as Admin' : 'Delete comment'}
            >
              <Trash2 size={10} />
            </button>
          )}
        </div>

        {/* Reply input */}
        {replyOpen && (
          <div className="sh-comment-input-row" style={{ marginLeft: 0, marginTop: 6 }}>
            <textarea
              className="sh-comment-input"
              placeholder={`Reply to ${c.authorName || 'Teacher'}…`}
              value={replyText}
              onChange={e => setReplyText(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitReply(); } }}
              rows={1}
              autoFocus
            />
            <button className="sh-comment-send-btn" onClick={submitReply} disabled={!replyText.trim()} type="button">
              <Send size={13} />
            </button>
          </div>
        )}

        {/* Replies */}
        {showReplies && replies.length > 0 && (
          <div className="sh-replies">
            {replies.map(r => (
              <ReplyRow
                key={r.id}
                r={r}
                uid={uid}
                isAdmin={isAdmin}
                onDelete={(replyId) => deleteReply(c.id, replyId)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function CommentThread({ postId, uid, postAuthorUid, displayName, initials, photoURL, isAdmin, commentCount }) {
  const { comments, loading, addComment, addReply, deleteComment, deleteReply, editComment } = useComments(postId, uid, postAuthorUid, isAdmin);
  const [expanded, setExpanded] = useState(false);
  const [text,     setText]     = useState('');
  const [sending,  setSending]  = useState(false);

  const visible = expanded ? comments : comments.slice(0, PREVIEW_COUNT);

  async function submitComment() {
    if (!text.trim() || sending) return;
    setSending(true);
    await addComment(displayName, initials, photoURL, text);
    setText('');
    setSending(false);
  }

  return (
    <div className="sh-comments">
      {!loading && comments.length > PREVIEW_COUNT && !expanded && (
        <button className="sh-expand-btn" onClick={() => setExpanded(true)} type="button">
          View all {comments.length} comments
        </button>
      )}
      {expanded && comments.length > PREVIEW_COUNT && (
        <button className="sh-expand-btn" onClick={() => setExpanded(false)} type="button">
          Show less
        </button>
      )}

      {visible.map(c => (
        <CommentRow
          key={c.id}
          c={c}
          uid={uid}
          postId={postId}
          myDisplayName={displayName}
          myInitials={initials}
          myPhotoURL={photoURL}
          isAdmin={isAdmin}
          addReply={addReply}
          deleteComment={deleteComment}
          deleteReply={deleteReply}
          editComment={editComment}
        />
      ))}

      {/* New comment input */}
      <div className="sh-comment-input-row">
        <Avatar uid={uid} photoURL={photoURL} initials={initials} size="sm" />
        <textarea
          className="sh-comment-input"
          placeholder="Add a comment…"
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitComment(); } }}
          rows={1}
        />
        <button
          className="sh-comment-send-btn"
          onClick={submitComment}
          disabled={!text.trim() || sending}
          type="button"
          aria-label="Send comment"
        >
          <Send size={14} />
        </button>
      </div>
    </div>
  );
}

CommentThread.propTypes = {
  postId:        PropTypes.string.isRequired,
  uid:           PropTypes.string.isRequired,
  postAuthorUid: PropTypes.string.isRequired,
  displayName:   PropTypes.string.isRequired,
  initials:      PropTypes.string.isRequired,
  photoURL:      PropTypes.string,
  isAdmin:       PropTypes.bool,
  commentCount:  PropTypes.number,
};
