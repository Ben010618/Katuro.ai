import { useState, useEffect, useCallback } from "react";
import { uploadFile, deleteFile } from "../services/storageService";
import { createUpload, getUploads, deleteUpload } from "../services/db";

export function useUploads(uid) {
  const [uploads, setUploads] = useState([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!uid) { setLoading(false); return; }
    setLoading(true);
    try {
      const data = await getUploads(uid);
      setUploads(data);
    } finally {
      setLoading(false);
    }
  }, [uid]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  /**
   * Upload a file, track progress, save Firestore record.
   * onProgress(pct) receives 0-100.
   */
  async function addUpload(file, onProgress) {
    const { storagePath, downloadURL } = await uploadFile(uid, file, onProgress);
    await createUpload(uid, {
      name: file.name,
      size: file.size,
      type: file.type,
      storagePath,
      downloadURL,
    });
    await refresh();
  }

  async function removeUpload(uploadId, storagePath) {
    try { await deleteFile(storagePath); } catch { /* file already gone */ }
    await deleteUpload(uid, uploadId);
    await refresh();
  }

  return { uploads, loading, addUpload, removeUpload, refresh };
}
