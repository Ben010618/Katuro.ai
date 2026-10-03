import { useState, useEffect } from "react";
import { onSnapshot, query, orderBy } from "firebase/firestore";
import { lessonPlansRef } from "../services/db";

export function useLessonPlans(uid) {
  const [lessonPlans, setLessonPlans] = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState("");

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- resets loading/error state before subscribing to Firestore snapshot
    if (!uid) { setLoading(false); return; }
    setLoading(true);
    setError("");

    const q = query(lessonPlansRef(uid), orderBy("createdAt", "desc"));
    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        setLessonPlans(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setLoading(false);
      },
      (e) => {
        setError(e.message);
        setLoading(false);
      }
    );

    return unsubscribe;
  }, [uid]);

  // kept for call-site compatibility — no-op since onSnapshot keeps data live
  const refresh = () => {};

  return { lessonPlans, loading, error, refresh };
}
