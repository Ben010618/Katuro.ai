// kaTuro Test Builder — Firestore read/write layer.
// Stored at teachers/{uid}/testSessions/{sessionId} (not a top-level collection)
// so it inherits the existing `teachers/{uid}/{document=**}` security rule.

import {
  collection,
  doc,
  addDoc,
  getDoc,
  getDocs,
  updateDoc,
  query,
  orderBy,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../firebase';
import {
  deriveKeyStage,
  deriveItemCeiling,
  deriveHotsFloor,
  derivePreset,
  makeEmptyCompetency,
  EMPTY_TOS,
  DAY_LIMIT,
} from '../config/testBuilderConfig';

export const testSessionsRef = (uid) => collection(db, 'teachers', uid, 'testSessions');
export const testSessionRef = (uid, sessionId) => doc(db, 'teachers', uid, 'testSessions', sessionId);

/**
 * Creates a fresh draft testSessions doc with sane defaults and returns its id.
 * itemCeiling/keyStage/hotsFloorPct are derived, never passed in directly.
 */
export async function createTestSession(uid, { gradeLevel = '', subject = '', testType = 'ST1' } = {}) {
  const keyStage = deriveKeyStage(gradeLevel);

  const data = {
    teacherId: uid,
    gradeLevel,
    keyStage,
    subject,
    testType,
    itemCeiling: keyStage ? deriveItemCeiling(keyStage, testType) : 0,
    terms: [],
    competencies: [makeEmptyCompetency(), makeEmptyCompetency(), makeEmptyCompetency()],
    dayLimit: DAY_LIMIT,
    cognitiveWeights: derivePreset(keyStage || 'KS2'),
    hotsFloorPct: keyStage ? deriveHotsFloor(keyStage) : 0,
    tos: EMPTY_TOS,
    status: 'draft',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  const ref = await addDoc(testSessionsRef(uid), data);
  return ref.id;
}

export async function getTestSession(uid, sessionId) {
  const snap = await getDoc(testSessionRef(uid, sessionId));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function updateTestSession(uid, sessionId, data) {
  return updateDoc(testSessionRef(uid, sessionId), { ...data, updatedAt: serverTimestamp() });
}

export async function getAllTestSessions(uid) {
  const q = query(testSessionsRef(uid), orderBy('createdAt', 'desc'));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}
