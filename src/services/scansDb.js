// Scanned answer-sheet records — Firestore read/write layer.
// Stored at teachers/{uid}/quizzes/{qid}/scans/{scanId} so each scan travels
// with the quiz it grades against and inherits the existing
// `teachers/{uid}/{document=**}` security rule.

import {
  collection,
  doc,
  addDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../firebase';

export const scansRef = (uid, qid) => collection(db, 'teachers', uid, 'quizzes', qid, 'scans');
export const scanRef  = (uid, qid, scanId) => doc(db, 'teachers', uid, 'quizzes', qid, 'scans', scanId);

/**
 * Creates a scan record right after upload + AI extraction.
 * data: { studentName, imagePath, imageURL, detectedAnswers, uncertainItems, score, total }
 * Always starts life as 'pending_review' — nothing is auto-finalized.
 */
export async function createScan(uid, qid, data) {
  const ref = await addDoc(scansRef(uid, qid), {
    ...data,
    reviewedAnswers: null,
    status: 'pending_review',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function getScansForQuiz(uid, qid) {
  const q = query(scansRef(uid, qid), orderBy('createdAt', 'desc'));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function updateScan(uid, qid, scanId, data) {
  return updateDoc(scanRef(uid, qid, scanId), { ...data, updatedAt: serverTimestamp() });
}

/** Locks in the teacher-reviewed answers/score and marks the scan confirmed. */
export async function confirmScan(uid, qid, scanId, { reviewedAnswers, score, total }) {
  return updateDoc(scanRef(uid, qid, scanId), {
    reviewedAnswers,
    score,
    total,
    status: 'confirmed',
    updatedAt: serverTimestamp(),
  });
}

export async function deleteScan(uid, qid, scanId) {
  return deleteDoc(scanRef(uid, qid, scanId));
}
