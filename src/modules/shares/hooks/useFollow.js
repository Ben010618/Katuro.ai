import { useState, useEffect, useCallback } from 'react';
import { isFollowing, followTeacher, unfollowTeacher } from '../services/sharesService';
import { notifyFollow } from '../services/notificationService';
import { trackEvent } from '../../../services/usageTracker';

/**
 * Follow/unfollow state with optimistic UI.
 * @param {string} myUid
 * @param {string} targetUid
 * @param {string} myName
 */
export function useFollow(myUid, targetUid, myName = '') {
  const [following, setFollowing] = useState(false);
  const [loading,   setLoading]   = useState(true);
  const [working,   setWorking]   = useState(false);

  useEffect(() => {
    if (!myUid || !targetUid || myUid === targetUid) {
      setLoading(false);
      return;
    }
    isFollowing(myUid, targetUid)
      .then(setFollowing)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [myUid, targetUid]);

  const toggle = useCallback(async () => {
    if (!myUid || !targetUid || myUid === targetUid || working) return;
    setWorking(true);
    const wasFollowing = following;
    setFollowing(!wasFollowing);
    try {
      if (wasFollowing) {
        await unfollowTeacher(myUid, targetUid);
      } else {
        await followTeacher(myUid, targetUid);
        await notifyFollow(myUid, myName, targetUid).catch(() => {});
        trackEvent(myUid, 'shares_follow_added');
      }
    } catch (_) {
      setFollowing(wasFollowing);
    } finally {
      setWorking(false);
    }
  }, [myUid, targetUid, myName, following, working]);

  return { following, loading, working, toggle };
}
