import { useState, useEffect, useCallback } from "react";
import {
  createQuiz,
  getQuizzes,
  getQuizzesBySession,
  updateQuiz,
  deleteQuiz,
} from "../services/db";

export function useQuiz(uid, sessionId) {
  const [quizzes, setQuizzes] = useState([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!uid) { setLoading(false); return; }
    setLoading(true);
    try {
      const data = sessionId
        ? await getQuizzesBySession(uid, sessionId)
        : await getQuizzes(uid);
      setQuizzes(data);
    } finally {
      setLoading(false);
    }
  }, [uid, sessionId]);

  useEffect(() => { refresh(); }, [refresh]);

  async function addQuiz(data) {
    await createQuiz(uid, data);
    await refresh();
  }

  async function editQuiz(qid, data) {
    await updateQuiz(uid, qid, data);
    await refresh();
  }

  async function removeQuiz(qid) {
    await deleteQuiz(uid, qid);
    await refresh();
  }

  return { quizzes, loading, addQuiz, editQuiz, removeQuiz, refresh };
}

export function useAllQuizzes(uid) {
  return useQuiz(uid, null);
}
