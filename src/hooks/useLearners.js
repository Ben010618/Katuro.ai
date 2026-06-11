import { useState, useEffect, useCallback } from "react";
import { createLearner, getLearners, updateLearner, deleteLearner } from "../services/db";

export function useLearners(uid, classId) {
  const [learners, setLearners] = useState([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!uid || !classId) { setLoading(false); return; }
    setLoading(true);
    try {
      const data = await getLearners(uid, classId);
      setLearners(data);
    } finally {
      setLoading(false);
    }
  }, [uid, classId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function addLearner(firstName, lastName, gender, customStudentNumber) {
    const studentNumber = customStudentNumber?.trim()
      ? customStudentNumber.trim()
      : String(learners.length + 1).padStart(4, "0");
    await createLearner(uid, classId, {
      firstName,
      lastName,
      gender,
      studentNumber,
      scores: Array(12).fill(null),
    });
    await refresh();
  }

  async function editLearner(lid, firstName, lastName, gender, studentNumber) {
    const patch = { firstName, lastName, gender };
    if (studentNumber !== undefined) patch.studentNumber = studentNumber;
    await updateLearner(uid, classId, lid, patch);
    await refresh();
  }

  async function removeLearner(lid) {
    await deleteLearner(uid, classId, lid);
    await refresh();
  }

  async function saveAllScores(scorePatch) {
    await Promise.all(
      Object.entries(scorePatch).map(([lid, scores]) =>
        updateLearner(uid, classId, lid, { scores })
      )
    );
    await refresh();
  }

  return { learners, loading, addLearner, editLearner, removeLearner, saveAllScores, refresh };
}
