import { useState, useCallback, useRef } from 'react';
import {
  fetchFeedPage,
  fetchFollowingFeedPage,
  fetchHashtagPostsPage,
  fetchUserPostsPage,
  getSharesProfile,
  avatarColor,
} from '../services/sharesService';

const PAGE_SIZE = 10;

/**
 * Paginated feed hook.
 * @param {'global'|'following'|'hashtag'|'user'} mode
 * @param {string} uid — current user uid
 * @param {string} [extra] — hashtag (mode=hashtag) or authorUid (mode=user)
 */
export function useFeed(mode, uid, extra = null) {
  const [posts,       setPosts]       = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore,     setHasMore]     = useState(true);
  const [error,       setError]       = useState(null);
  const lastDocRef = useRef(null);
  const profileCache = useRef({});

  const enrichPost = useCallback(async post => {
    if (!profileCache.current[post.authorUid]) {
      profileCache.current[post.authorUid] = await getSharesProfile(post.authorUid).catch(() => null);
    }
    const prof = profileCache.current[post.authorUid];
    return {
      ...post,
      authorName:     prof?.displayName || post.authorName || 'Teacher',
      authorInitials: prof?.initials    || post.authorInitials || 'T',
      school:         prof?.school      || post.school  || '',
      gradeLevel:     prof?.gradeLevel  || post.gradeLevel || '',
      subject:        prof?.subject     || post.subject  || '',
      avatarColor:    avatarColor(post.authorUid),
    };
  }, []);

  const fetchPage = useCallback(async (lastDoc) => {
    let result;
    if      (mode === 'following') result = await fetchFollowingFeedPage(uid, lastDoc, PAGE_SIZE);
    else if (mode === 'hashtag')   result = await fetchHashtagPostsPage(extra, lastDoc, PAGE_SIZE);
    else if (mode === 'user')      result = await fetchUserPostsPage(extra, lastDoc, PAGE_SIZE);
    else                           result = await fetchFeedPage(lastDoc, PAGE_SIZE);
    return result;
  }, [mode, uid, extra]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    lastDocRef.current = null;
    try {
      const { posts: raw, lastDoc } = await fetchPage(null);
      const enriched = await Promise.all(raw.map(enrichPost));
      setPosts(enriched);
      lastDocRef.current = lastDoc;
      setHasMore(raw.length === PAGE_SIZE);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [fetchPage, enrichPost]);

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore || !lastDocRef.current) return;
    setLoadingMore(true);
    try {
      const { posts: raw, lastDoc } = await fetchPage(lastDocRef.current);
      const enriched = await Promise.all(raw.map(enrichPost));
      setPosts(prev => [...prev, ...enriched]);
      lastDocRef.current = lastDoc;
      setHasMore(raw.length === PAGE_SIZE);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, hasMore, fetchPage, enrichPost]);

  const prependPost = useCallback(post => {
    setPosts(prev => [{ ...post, avatarColor: avatarColor(post.authorUid) }, ...prev]);
  }, []);

  const removePost = useCallback(postId => {
    setPosts(prev => prev.filter(p => p.id !== postId));
  }, []);

  return { posts, loading, loadingMore, hasMore, error, load, loadMore, prependPost, removePost };
}
