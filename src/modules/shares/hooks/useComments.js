import { useState, useEffect, useCallback } from 'react';
import {
  subscribeToComments,
  addComment as svcAddComment,
  addReply   as svcAddReply,
  deleteComment as svcDeleteComment,
  deleteReply   as svcDeleteReply,
  editComment   as svcEditComment,
} from '../services/sharesService';
import { notifyComment, notifyReply } from '../services/notificationService';
import { trackEvent } from '../../../services/usageTracker';

/**
 * Real-time comments and replies for a post.
 * @param {string} postId
 * @param {string} uid — current user uid
 * @param {string} postAuthorUid
 */
export function useComments(postId, uid, postAuthorUid, isAdmin = false) {
  const [comments, setComments] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState(null);

  useEffect(() => {
    if (!postId) return;
    setLoading(true);
    const unsub = subscribeToComments(postId, data => {
      setComments(data);
      setLoading(false);
    });
    return unsub;
  }, [postId]);

  const addComment = useCallback(async (displayName, initials, photoURL, text) => {
    if (!text.trim()) return;
    try {
      const commentId = await svcAddComment(postId, uid, { displayName, initials, photoURL, text: text.trim() });
      await notifyComment(uid, displayName, postId, postAuthorUid).catch(() => {});
      trackEvent(uid, 'shares_comment_added', { isReply: false });
      return commentId;
    } catch (e) {
      setError(e.message);
    }
  }, [postId, uid, postAuthorUid]);

  const addReply = useCallback(async (commentId, commentAuthorUid, displayName, initials, photoURL, text) => {
    if (!text.trim()) return;
    try {
      await svcAddReply(postId, commentId, uid, { displayName, initials, photoURL, text: text.trim() });
      await notifyReply(uid, displayName, postId, commentAuthorUid).catch(() => {});
      trackEvent(uid, 'shares_comment_added', { isReply: true });
    } catch (e) {
      setError(e.message);
    }
  }, [postId, uid]);

  const deleteComment = useCallback(async (commentId) => {
    try {
      await svcDeleteComment(postId, commentId, isAdmin);
    } catch (e) {
      setError(e.message);
    }
  }, [postId, isAdmin]);

  const deleteReply = useCallback(async (commentId, replyId) => {
    try {
      await svcDeleteReply(postId, commentId, replyId);
    } catch (e) {
      setError(e.message);
    }
  }, [postId]);

  const editComment = useCallback(async (commentId, text) => {
    if (!text.trim()) return;
    try {
      await svcEditComment(postId, commentId, text.trim());
    } catch (e) {
      setError(e.message);
    }
  }, [postId]);

  return { comments, loading, error, addComment, addReply, deleteComment, deleteReply, editComment };
}
