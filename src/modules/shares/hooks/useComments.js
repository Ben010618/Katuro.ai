import { useState, useEffect, useCallback } from 'react';
import {
  subscribeToComments,
  addComment as svcAddComment,
  addReply   as svcAddReply,
  deleteComment as svcDeleteComment,
  editComment   as svcEditComment,
} from '../services/sharesService';
import { notifyComment, notifyReply } from '../services/notificationService';

/**
 * Real-time comments and replies for a post.
 * @param {string} postId
 * @param {string} uid — current user uid
 * @param {string} postAuthorUid
 */
export function useComments(postId, uid, postAuthorUid) {
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

  const addComment = useCallback(async (displayName, initials, text) => {
    if (!text.trim()) return;
    try {
      const commentId = await svcAddComment(postId, uid, { displayName, initials, text: text.trim() });
      await notifyComment(uid, displayName, postId, postAuthorUid).catch(() => {});
      return commentId;
    } catch (e) {
      setError(e.message);
    }
  }, [postId, uid, postAuthorUid]);

  const addReply = useCallback(async (commentId, commentAuthorUid, displayName, initials, text) => {
    if (!text.trim()) return;
    try {
      await svcAddReply(postId, commentId, uid, { displayName, initials, text: text.trim() });
      await notifyReply(uid, displayName, postId, commentAuthorUid).catch(() => {});
    } catch (e) {
      setError(e.message);
    }
  }, [postId, uid]);

  const deleteComment = useCallback(async (commentId) => {
    try {
      await svcDeleteComment(postId, commentId);
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

  return { comments, loading, error, addComment, addReply, deleteComment, editComment };
}
