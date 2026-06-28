import { useState, useCallback, useRef } from 'react';
import { searchTeachers, fetchTrendingHashtags } from '../services/sharesService';

/**
 * Search and trending hashtag utilities.
 */
export function useSearch() {
  const [results,   setResults]   = useState([]);
  const [trending,  setTrending]  = useState([]);
  const [searching, setSearching] = useState(false);
  const debounceRef = useRef(null);

  const search = useCallback((q) => {
    clearTimeout(debounceRef.current);
    if (!q.trim()) { setResults([]); return; }
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const teachers = await searchTeachers(q);
        setResults(teachers);
      } catch (_) {}
      finally { setSearching(false); }
    }, 320);
  }, []);

  const loadTrending = useCallback(async () => {
    try {
      const tags = await fetchTrendingHashtags();
      setTrending(tags);
    } catch (_) {}
  }, []);

  return { results, trending, searching, search, loadTrending };
}
