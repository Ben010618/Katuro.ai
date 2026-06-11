import { useState, useEffect, useCallback } from "react";
import { createClass, getClasses, updateClass, deleteClass } from "../services/db";

const DEFAULT_SCORE_COLUMNS = Array.from({ length: 12 }, (_, i) => ({ index: i, type: "Quiz" }));

export function useClasses(uid) {
  const [classes, setClasses] = useState([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!uid) { setLoading(false); return; }
    setLoading(true);
    try {
      const data = await getClasses(uid);
      setClasses(data);
    } finally {
      setLoading(false);
    }
  }, [uid]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function addClass(name, subject, grade, sectionCode) {
    const sectionNumber = String(classes.length + 1).padStart(3, "0");
    await createClass(uid, {
      name,
      subject,
      grade,
      sectionCode: sectionCode?.trim() || sectionNumber,
      sectionNumber,
      scoreColumns: DEFAULT_SCORE_COLUMNS,
    });
    await refresh();
  }

  async function editClass(cid, name, subject, grade, sectionCode) {
    await updateClass(uid, cid, { name, subject, grade, sectionCode: sectionCode?.trim() || "" });
    await refresh();
  }

  async function removeClass(cid) {
    await deleteClass(uid, cid);
    await refresh();
  }

  async function updateScoreColumns(cid, columns) {
    await updateClass(uid, cid, { scoreColumns: columns });
    await refresh();
  }

  return { classes, loading, addClass, editClass, removeClass, updateScoreColumns, refresh };
}
