import { useState, useEffect, useCallback } from "react";
import { getAllScores, getScoresBySession, saveScores } from "../services/db";

export function useAllScores(uid) {
  const [scores, setScores] = useState([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!uid) { setLoading(false); return; }
    setLoading(true);
    try {
      const data = await getAllScores(uid);
      setScores(data);
    } finally {
      setLoading(false);
    }
  }, [uid]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { scores, loading, refresh };
}

export function useSessionScores(uid, sessionId) {
  const [scores, setScores] = useState([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!uid || !sessionId) { setLoading(false); return; }
    setLoading(true);
    try {
      const data = await getScoresBySession(uid, sessionId);
      setScores(data);
    } finally {
      setLoading(false);
    }
  }, [uid, sessionId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function submitScores(classId, scoreRows) {
    await saveScores(uid, sessionId, classId, scoreRows);
    await refresh();
  }

  return { scores, loading, submitScores, refresh };
}
