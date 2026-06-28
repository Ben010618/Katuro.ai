import { useState } from 'react';
import PropTypes from 'prop-types';
import { Send, Heart, Trash2, Pencil, X, CornerDownRight } from 'lucide-react';
import { useComments } from '../hooks/useComments';
import { timeAgo, avatarColor } from '../services/sharesService';

const PREVIEW_COUNT = 2;

function Avatar({ uid, initials, size = 'sm' }) {
  return (
    <div
      className={`sh-avatar sh-avatar--${size}`}
      style={{ background: avatarColor(uid), color: '#fff', flexShrink: 0 }}
    >
      {initials || 'T'}
    </div>
  );
}

function CommentRow({ c, uid, postId, onReply, addReply, deleteComment, editComment }) {
  const [editing,   setEditing]   = useState(false);
  const [editText,  setEditText]  = useState(c.text);
  const [replyOpen, setReplyOpen] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [liked,     setLiked]     = useState(false);

  const isOwn = c.authorUid === uid;

  async function submitEdit() {
    if (!editText.trim() || editText === c.text) { setEditing(false); return; }
    await editComment(c.id, editText);
    setEditing(false);
  }

  async function submitReply() {
    if (!replyText.trim()) return;
    await addReply(c.id, c.authorUid, '', '', replyText);
    setReplyText('');
    setReplyOpen(false);
  }

  return (
    <div className="sh-comment">
      <Avatar uid={c.authorUid} initials={c.authorInitials} />
      <div className="sh-comment-body">
        <div className="sh-comment-bubble">
          <div className="sh-comment-author">{c.authorName}</div>
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
          <button
            className={`sh-comment-action-btn ${liked ? 'liked' : ''}`}
            onClick={() => setLiked(l => !l)}
            type="button"
          >
            {liked ? '❤️' : '♡'} {(c.likes || 0) + (liked ? 1 : 0) > 0 && ((c.likes || 0) + (liked ? 1 : 0))}
          </button>
          <button className="sh-comment-action-btn" onClick={() => setReplyOpen(v => !v)} type="button">
            Reply
          </button>
          {isOwn && (
            <>
              <button className="sh-comment-action-btn" onClick={() => { setEditing(true); setEditText(c.text); }} type="button">
                <Pencil size={10} />
              </button>
              <button className="sh-comment-action-btn" style={{ color: '#ef4444' }} onClick={() => deleteComment(c.id)} type="button">
                <Trash2 size={10} />
              </button>
            </>
          )}
        </div>
        {replyOpen && (
          <div className="sh-comment-input-row" style={{ marginLeft: 0, marginTop: 6 }}>
            <textarea
              className="sh-comment-input"
              placeholder={`Reply to ${c.authorName}…`}
              value={replyText}
              onChange={e => setReplyText(e.target.value)}
              rows={1}
              autoFocus
            />
            <button className="sh-comment-send-btn" onClick={submitReply} disabled={!replyText.trim()} type="button">
              <Send size={13} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export function CommentThread({ postId, uid, postAuthorUid, displayName, initials, commentCount }) {
  const { comments, loading, addComment, addReply, deleteComment, editComment } = useComments(postId, uid, postAuthorUid);
  const [expanded,  setExpanded]  = useState(false);
  const [text, setText] = useState('');

  const visible = expanded ? comments : comments.slice(0, PREVIEW_COUNT);

  async function submitComment() {
    if (!text.trim()) return;
    await addComment(displayName, initials, text);
    setText('');
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
          addReply={addReply}
          deleteComment={deleteComment}
          editComment={editComment}
        />
      ))}

      <div className="sh-comment-input-row">
        <Avatar uid={uid} initials={initials} />
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
          disabled={!text.trim()}
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
  commentCount:  PropTypes.number,
};
