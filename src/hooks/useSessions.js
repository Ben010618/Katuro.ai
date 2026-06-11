import { useState, useEffect, useCallback } from "react";
import {
  createSession,
  getSessions,
  updateSession,
  deleteSession,
} from "../services/db";

export function useSessions(uid) {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!uid) { setLoading(false); return; }
    setLoading(true);
    try {
      const data = await getSessions(uid);
      setSessions(data);
    } finally {
      setLoading(false);
    }
  }, [uid]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function addSession(title, topic = "") {
    await createSession(uid, { title, topic, status: "active" });
    await refresh();
  }

  async function endSession(sid) {
    await updateSession(uid, sid, { status: "completed", endedAt: new Date().toISOString() });
    await refresh();
  }

  async function removeSession(sid) {
    await deleteSession(uid, sid);
    await refresh();
  }

  const activeSessions = sessions.filter((s) => s.status === "active");

  return { sessions, activeSessions, loading, addSession, endSession, removeSession, refresh };
}
