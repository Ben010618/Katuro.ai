import { useState, useEffect, useCallback } from 'react';
import { getMyReaction, toggleReaction } from '../services/sharesService';
import { notifyReaction } from '../services/notificationService';
import { trackEvent } from '../../../services/usageTracker';

/**
 * Reaction state and toggle for a single post.
 * @param {string} postId
 * @param {string} uid — current user uid
 * @param {object} initialReactions — { love, clap, star, insight }
 * @param {string} postAuthorUid
 */
export function useReactions(postId, uid, initialReactions = {}, postAuthorUid = '') {
  const [reactions, setReactions] = useState({
    love: 0, clap: 0, star: 0, insight: 0, ...initialReactions,
  });
  const [myReaction, setMyReaction] = useState(null);
  const [loading,    setLoading]    = useState(true);

  useEffect(() => {
    setReactions({ love: 0, clap: 0, star: 0, insight: 0, ...initialReactions });
  }, [postId]);

  useEffect(() => {
    if (!postId || !uid) return;
    setLoading(true);
    getMyReaction(postId, uid)
      .then(setMyReaction)
      .catch(() => setMyReaction(null))
      .finally(() => setLoading(false));
  }, [postId, uid]);

  const toggle = useCallback(async (type) => {
    if (!uid) return;

    // Optimistic update
    setReactions(prev => {
      const next = { ...prev };
      if (myReaction === type) {
        next[type] = Math.max(0, next[type] - 1);
      } else {
        if (myReaction) next[myReaction] = Math.max(0, next[myReaction] - 1);
        next[type] = (next[type] || 0) + 1;
      }
      return next;
    });
    const prevReaction = myReaction;
    setMyReaction(prev => (prev === type ? null : type));

    try {
      await toggleReaction(postId, uid, type);
      // Only send notification/track when adding (not removing)
      if (prevReaction !== type) {
        await notifyReaction(uid, '', postId, postAuthorUid, type).catch(() => {});
        trackEvent(uid, 'shares_reaction_added', { type });
      }
    } catch (_) {
      // Rollback on failure
      setReactions(prev => {
        const next = { ...prev };
        if (prevReaction === type) {
          next[type] = (next[type] || 0) + 1;
        } else {
          if (prevReaction) next[prevReaction] = (next[prevReaction] || 0) + 1;
          next[type] = Math.max(0, next[type] - 1);
        }
        return next;
      });
      setMyReaction(prevReaction);
    }
  }, [postId, uid, myReaction, postAuthorUid]);

  return { reactions, myReaction, toggle, loading };
}
