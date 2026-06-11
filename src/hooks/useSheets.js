import { useState, useEffect, useCallback } from "react";
import { createSheet, getSheets, deleteSheet } from "../services/db";

export function useSheets(uid) {
  const [sheets, setSheets] = useState([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!uid) { setLoading(false); return; }
    setLoading(true);
    try {
      const data = await getSheets(uid);
      setSheets(data);
    } finally {
      setLoading(false);
    }
  }, [uid]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function addSheet(config) {
    const sheetId = "KT-" + Date.now().toString(36).toUpperCase();
    await createSheet(uid, { ...config, sheetId });
    await refresh();
    return sheetId;
  }

  async function removeSheet(docId) {
    await deleteSheet(uid, docId);
    await refresh();
  }

  return { sheets, loading, addSheet, removeSheet, refresh };
}
