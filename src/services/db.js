/**
 * Firestore data models (all scoped under teachers/{uid}/...):
 *
 * teachers/{uid}
 *   sessions/{sessionId}     — teaching sessions
 *   classes/{classId}        — class groups
 *     learners/{learnerId}   — students in a class
 *   uploads/{uploadId}       — lesson source uploads
 *   sheets/{sheetId}         — generated bubble sheet configs
 *   scans/{scanId}           — bubble sheet scan results
 */

import {
  collection,
  doc,
  addDoc,
  setDoc,
  getDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
  where,
  onSnapshot,
  serverTimestamp,
  runTransaction,
} from "firebase/firestore";
import { initializeApp, deleteApp } from "firebase/app";
import { getAuth, createUserWithEmailAndPassword } from "firebase/auth";
import { db, firebaseConfig, functions } from "../firebase";
import { httpsCallable } from "firebase/functions";

// ─── Collection refs ──────────────────────────────────────────────────────────

export const teacherRef = (uid) => doc(db, "teachers", uid);

export const sessionsRef = (uid) => collection(db, "teachers", uid, "sessions");
export const sessionRef = (uid, sid) => doc(db, "teachers", uid, "sessions", sid);

export const classesRef = (uid) => collection(db, "teachers", uid, "classes");
export const classRef = (uid, cid) => doc(db, "teachers", uid, "classes", cid);

export const learnersRef = (uid, cid) => collection(db, "teachers", uid, "classes", cid, "learners");
export const learnerRef = (uid, cid, lid) => doc(db, "teachers", uid, "classes", cid, "learners", lid);

export const uploadsRef = (uid) => collection(db, "teachers", uid, "uploads");
export const uploadRef = (uid, upid) => doc(db, "teachers", uid, "uploads", upid);

export const sheetsRef = (uid) => collection(db, "teachers", uid, "sheets");
export const sheetRef = (uid, shid) => doc(db, "teachers", uid, "sheets", shid);

export const scansRef = (uid) => collection(db, "teachers", uid, "scans");
export const scanRef = (uid, scid) => doc(db, "teachers", uid, "scans", scid);

// ─── Teacher profile ──────────────────────────────────────────────────────────

export async function ensureTeacherProfile(uid, email) {
  const ref = teacherRef(uid);
  const snap = await getDoc(ref);
  if (snap.exists()) return { id: snap.id, ...snap.data() };
  const profile = {
    email,
    tokenBalance: 0,
    isAdmin: false,
    disabled: false,
    createdAt: serverTimestamp(),
  };
  await setDoc(ref, profile);
  return profile;
}

export async function getTeacherProfile(uid) {
  const snap = await getDoc(teacherRef(uid));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

// ─── Sessions ─────────────────────────────────────────────────────────────────

export async function createSession(uid, data) {
  return addDoc(sessionsRef(uid), { ...data, createdAt: serverTimestamp() });
}

export async function getSessions(uid) {
  const q = query(sessionsRef(uid), orderBy("createdAt", "desc"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function updateSession(uid, sid, data) {
  return updateDoc(sessionRef(uid, sid), data);
}

export async function deleteSession(uid, sid) {
  return deleteDoc(sessionRef(uid, sid));
}

// ─── Classes ──────────────────────────────────────────────────────────────────

export async function createClass(uid, data) {
  return addDoc(classesRef(uid), { ...data, createdAt: serverTimestamp() });
}

export async function getClasses(uid) {
  const q = query(classesRef(uid), orderBy("createdAt", "asc"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function updateClass(uid, cid, data) {
  return updateDoc(classRef(uid, cid), data);
}

export async function deleteClass(uid, cid) {
  return deleteDoc(classRef(uid, cid));
}

// ─── Learners ─────────────────────────────────────────────────────────────────

export async function createLearner(uid, cid, data) {
  return addDoc(learnersRef(uid, cid), { ...data, createdAt: serverTimestamp() });
}

export async function getLearners(uid, cid) {
  const q = query(learnersRef(uid, cid), orderBy("createdAt", "asc"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function updateLearner(uid, cid, lid, data) {
  return updateDoc(learnerRef(uid, cid, lid), data);
}

export async function deleteLearner(uid, cid, lid) {
  return deleteDoc(learnerRef(uid, cid, lid));
}

// ─── Uploads ──────────────────────────────────────────────────────────────────

export async function createUpload(uid, data) {
  return addDoc(uploadsRef(uid), { ...data, createdAt: serverTimestamp() });
}

export async function getUploads(uid) {
  const q = query(uploadsRef(uid), orderBy("createdAt", "desc"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function deleteUpload(uid, upid) {
  return deleteDoc(uploadRef(uid, upid));
}

// ─── Sheets (generated bubble sheet configs) ──────────────────────────────────

export async function createSheet(uid, data) {
  return addDoc(sheetsRef(uid), { ...data, createdAt: serverTimestamp() });
}

export async function getSheets(uid) {
  const q = query(sheetsRef(uid), orderBy("createdAt", "desc"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function deleteSheet(uid, shid) {
  return deleteDoc(sheetRef(uid, shid));
}

// ─── Scores ───────────────────────────────────────────────────────────────────

export const scoresRef = (uid) => collection(db, "teachers", uid, "scores");

/**
 * Replace all scores for a given session+class pair, then write the new set.
 * scores: [{ learnerId, learnerName, rawScore, numQuestions, percentage }]
 */
export async function saveScores(uid, sessionId, classId, scores) {
  const q = query(
    scoresRef(uid),
    where("sessionId", "==", sessionId),
    where("classId", "==", classId)
  );
  const snap = await getDocs(q);
  await Promise.all(snap.docs.map((d) => deleteDoc(d.ref)));
  await Promise.all(
    scores.map((s) =>
      addDoc(scoresRef(uid), { ...s, sessionId, classId, createdAt: serverTimestamp() })
    )
  );
}

export async function getAllScores(uid) {
  const q = query(scoresRef(uid), orderBy("createdAt", "desc"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function getScoresBySession(uid, sessionId) {
  const q = query(scoresRef(uid), where("sessionId", "==", sessionId));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

// ─── Quiz Scan Results ────────────────────────────────────────────────────────

export const quizResultsRef = (uid) => collection(db, "teachers", uid, "quizResults");
export const quizResultRef  = (uid, rid) => doc(db, "teachers", uid, "quizResults", rid);

export async function saveQuizResult(uid, data) {
  return addDoc(quizResultsRef(uid), { ...data, scannedAt: serverTimestamp() });
}

export async function getQuizResults(uid, quizId) {
  const q = query(quizResultsRef(uid), where("quizId", "==", quizId), orderBy("scannedAt", "desc"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

// ─── Scans ────────────────────────────────────────────────────────────────────

export async function createScan(uid, data) {
  return addDoc(scansRef(uid), { ...data, createdAt: serverTimestamp() });
}

export async function getScans(uid) {
  const q = query(scansRef(uid), orderBy("createdAt", "desc"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function updateScan(uid, scid, data) {
  return updateDoc(scanRef(uid, scid), data);
}

export async function deleteScan(uid, scid) {
  return deleteDoc(scanRef(uid, scid));
}

// ─── Quizzes ──────────────────────────────────────────────────────────────────

export const quizzesRef = (uid) => collection(db, "teachers", uid, "quizzes");
export const quizRef = (uid, qid) => doc(db, "teachers", uid, "quizzes", qid);

export async function createQuiz(uid, data) {
  return addDoc(quizzesRef(uid), { ...data, createdAt: serverTimestamp() });
}

export async function getQuizzes(uid) {
  const q = query(quizzesRef(uid), orderBy("createdAt", "desc"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function getQuizzesBySession(uid, sessionId) {
  const q = query(quizzesRef(uid), where("sessionId", "==", sessionId));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function getQuiz(uid, qid) {
  const snap = await getDoc(quizRef(uid, qid));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function updateQuiz(uid, qid, data) {
  return updateDoc(quizRef(uid, qid), data);
}

export async function deleteQuiz(uid, qid) {
  return deleteDoc(quizRef(uid, qid));
}

// ─── Lesson Contexts (AI-extracted) ──────────────────────────────────────────

export const contextsRef = (uid) => collection(db, "teachers", uid, "contexts");

export async function saveContext(uid, sessionId, data) {
  const q = query(contextsRef(uid), where("sessionId", "==", sessionId));
  const snap = await getDocs(q);
  if (!snap.empty) {
    await updateDoc(snap.docs[0].ref, { ...data, updatedAt: serverTimestamp() });
    return snap.docs[0].id;
  }
  const ref = await addDoc(contextsRef(uid), {
    ...data,
    sessionId,
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

export async function getContextBySession(uid, sessionId) {
  const q = query(contextsRef(uid), where("sessionId", "==", sessionId));
  const snap = await getDocs(q);
  return snap.empty ? null : { id: snap.docs[0].id, ...snap.docs[0].data() };
}

// ─── Lesson Plans ─────────────────────────────────────────────────────────────

export const lessonPlansRef = (uid) => collection(db, "teachers", uid, "lessonPlans");

// meta: { weekNumber, weekLabel, weekStartDate, weekEndDate, subject, topic, grade }
export async function saveLessonPlan(uid, sessionId, content, meta = {}) {
  if (sessionId) {
    const q = query(lessonPlansRef(uid), where("sessionId", "==", sessionId));
    const snap = await getDocs(q);
    if (!snap.empty) {
      await updateDoc(snap.docs[0].ref, { content, sessionId, ...meta, updatedAt: serverTimestamp() });
      return snap.docs[0].id;
    }
  }
  const ref = await addDoc(lessonPlansRef(uid), {
    content, sessionId: sessionId || null, ...meta, createdAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updateLessonPlan(uid, planId, data) {
  return updateDoc(doc(db, "teachers", uid, "lessonPlans", planId), {
    ...data, updatedAt: serverTimestamp(),
  });
}

export async function getLessonPlanBySession(uid, sessionId) {
  const q = query(lessonPlansRef(uid), where("sessionId", "==", sessionId));
  const snap = await getDocs(q);
  return snap.empty ? null : { id: snap.docs[0].id, ...snap.docs[0].data() };
}

export async function getAllLessonPlans(uid) {
  const q = query(lessonPlansRef(uid), orderBy("createdAt", "desc"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

// ─── ILAW Plan (new 3-step structure) ────────────────────────────────────────

/**
 * Save a fully generated ILAW lesson plan.
 * planData: { subject, gradeLevel, term, weekNumber, selectedDays,
 *             competency, lessonName, declarationOfAIUse, sessions[] }
 * Returns the new Firestore document ID.
 */
export async function saveIlawPlan(uid, planData) {
  const ref = await addDoc(lessonPlansRef(uid), {
    ...planData,
    status: "published",
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

/**
 * Fetch a single ILAW plan by ID.
 */
export async function getIlawPlan(uid, planId) {
  const snap = await getDoc(doc(db, "teachers", uid, "lessonPlans", planId));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

/**
 * Save a fully generated Daily Lesson Log.
 * Stored in the same lessonPlans collection with type: 'dll'.
 * Compatibility shims (lessonName, competencyText, sessions) let Quiz/PPT/Gamification
 * work without modification.
 */
export async function saveDLLPlan(uid, dllData) {
  const { subject, gradeLevel, term, section, teachingDates,
          contentStandards, performanceStandards, melc,
          dailyContent, procedure } = dllData;
  const lessonName = `DLL – ${subject || 'Lesson'} (${gradeLevel || ''})`.trim();
  const ref = await addDoc(lessonPlansRef(uid), {
    type: 'dll',
    lessonName,
    subject, gradeLevel, term, section, teachingDates,
    contentStandards, performanceStandards, melc,
    dailyContent, procedure,
    // Compatibility shims so Quiz/Presentation/Gamification AI works out-of-the-box
    competencyText: melc || '',
    sessions: [],
    status: 'published',
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

/**
 * Fetch a single DLL plan by ID (uses same collection as ILAW plans).
 */
export async function getDLLPlan(uid, planId) {
  const snap = await getDoc(doc(db, 'teachers', uid, 'lessonPlans', planId));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

/**
 * Fetch a single COT plan by ID (uses same collection as ILAW/DLL plans).
 */
export async function getCotPlan(uid, planId) {
  const snap = await getDoc(doc(db, 'teachers', uid, 'lessonPlans', planId));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

/**
 * Save a fully generated PPST-aligned COT lesson plan.
 * Stored in the same lessonPlans collection with type: 'cot'.
 */
export async function saveCotPlan(uid, planData) {
  const { subject, grade, quarter, topic, melc, plan } = planData;
  const lessonName = `COT – ${topic || subject || 'Lesson'} (${grade || ''})`.trim();
  const ref = await addDoc(lessonPlansRef(uid), {
    type: 'cot',
    lessonName,
    ...planData,
    competencyText: melc || '',
    sessions: [],
    status: 'published',
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

/**
 * Delete a lesson plan permanently.
 */
export async function deleteLessonPlan(uid, planId) {
  return deleteDoc(doc(db, "teachers", uid, "lessonPlans", planId));
}

/**
 * Real-time subscription to all lesson plans (ordered newest first).
 * Returns the unsubscribe function.
 * callback(plans[]) is called immediately and on every change.
 */
export function subscribeLessonPlans(uid, callback) {
  const q = query(lessonPlansRef(uid), orderBy("createdAt", "desc"));
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  });
}

// ─── Teacher profile (extended fields) ───────────────────────────────────────

/**
 * Update teacher profile fields (name, school, position, supervisorName, etc.)
 */
export async function updateTeacherProfile(uid, data) {
  return updateDoc(teacherRef(uid), { ...data, updatedAt: serverTimestamp() });
}

// ─── Scores (from scanner mobile app) ────────────────────────────────────────

/**
 * Real-time subscription to all scan scores for a teacher.
 */
export function subscribeScores(uid, callback) {
  const q = query(scoresRef(uid), orderBy("createdAt", "desc"));
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  });
}

// ─── Token logs ───────────────────────────────────────────────────────────────

export const tokenLogsRef = (uid) => collection(db, "teachers", uid, "tokenLogs");

// ─── Admin: read all teachers ─────────────────────────────────────────────────
// Requires Firestore rule: allow read on /teachers/{uid} if isAdmin() == true

export async function getAllTeachers() {
  const snap = await getDocs(collection(db, "teachers"));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

// ─── Admin: create a new user account ────────────────────────────────────────
// Uses a secondary Firebase App instance so the admin stays logged in.

export async function adminCreateUser(email, password, initialTokens, adminUid) {
  const tempApp  = initializeApp(firebaseConfig, "admin-tmp-" + Date.now());
  const tempAuth = getAuth(tempApp);
  let uid;
  try {
    const cred = await createUserWithEmailAndPassword(tempAuth, email, password);
    uid = cred.user.uid;
    await tempAuth.signOut();
  } finally {
    await deleteApp(tempApp);
  }

  await setDoc(teacherRef(uid), {
    email,
    password,
    tokenBalance: initialTokens,
    isAdmin:  false,
    disabled: false,
    createdAt: serverTimestamp(),
    createdBy: adminUid,
  });

  if (initialTokens > 0) {
    await addDoc(tokenLogsRef(uid), {
      uid, amount: initialTokens, note: "Initial balance",
      action: "top_up", addedBy: adminUid, createdAt: serverTimestamp(),
    });
  }

  return { uid, email };
}

// ─── Self sign-up: teacher creates their own account ─────────────────────────

const MAX_ACCOUNTS = 200;

export async function selfSignUp({ email, password, surname, givenName, mi, school }) {
  const { auth: firebaseAuth } = await import('../firebase');
  const { updateProfile } = await import('firebase/auth');

  const countSnap = await getDocs(collection(db, "teachers"));
  if (countSnap.size >= MAX_ACCOUNTS) {
    throw new Error(`Registration is currently closed — the platform has reached its ${MAX_ACCOUNTS}-account limit. Please contact your administrator.`);
  }

  const cred = await createUserWithEmailAndPassword(firebaseAuth, email.trim().toLowerCase(), password);
  const uid  = cred.user.uid;

  const displayName = [givenName.trim(), mi ? mi.trim() + '.' : '', surname.trim()]
    .filter(Boolean).join(' ');

  await updateProfile(cred.user, { displayName });

  await setDoc(teacherRef(uid), {
    email:        email.trim().toLowerCase(),
    displayName,
    surname:      surname.trim(),
    givenName:    givenName.trim(),
    mi:           mi?.trim() || '',
    school:       school.trim(),
    tokenBalance: 50,
    isAdmin:      false,
    disabled:     false,
    createdAt:    serverTimestamp(),
  });

  await addDoc(tokenLogsRef(uid), {
    uid, amount: 50, action: 'welcome_bonus',
    note: 'Welcome! 50 free tokens to get started.',
    createdAt: serverTimestamp(),
  });

  return cred.user;
}

// ─── Admin: enable / disable a user ─────────────────────────────────────────

export async function adminSetDisabled(uid, disabled) {
  return updateDoc(teacherRef(uid), { disabled, updatedAt: serverTimestamp() });
}

// ─── Admin: add tokens to a user ─────────────────────────────────────────────

export async function adminAddTokens(targetUid, amount, note, adminUid) {
  const ref = teacherRef(targetUid);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    const current = snap.exists() ? (snap.data().tokenBalance ?? 0) : 0;
    tx.update(ref, { tokenBalance: current + amount, updatedAt: serverTimestamp() });
  });
  await addDoc(tokenLogsRef(targetUid), {
    uid: targetUid, amount, note, action: "top_up",
    addedBy: adminUid, createdAt: serverTimestamp(),
  });
}

// ─── Admin: change a user's password ─────────────────────────────────────────

export async function adminChangePassword(targetUid, newPassword) {
  const fn = httpsCallable(functions, 'adminChangePassword');
  await fn({ uid: targetUid, password: newPassword });
}

// ─── Action Research helpers ─────────────────────────────────────────────────

export const actionResearchColRef = (uid) => collection(db, 'teachers', uid, 'actionResearch');
export const actionResearchDocRef = (uid, docId) => doc(db, 'teachers', uid, 'actionResearch', docId);

export async function getActionResearch(uid, docId) {
  const snap = await getDoc(actionResearchDocRef(uid, docId));
  if (!snap.exists()) throw new Error('Research document not found.');
  return { id: snap.id, ...snap.data() };
}

export async function updateActionResearch(uid, docId, data) {
  await updateDoc(actionResearchDocRef(uid, docId), {
    ...data,
    updatedAt: serverTimestamp(),
  });
}

// ─── Token deduction ──────────────────────────────────────────────────────────
// cost defaults to 3; pass a custom value for cheaper actions (e.g. 0.5 for gamification)

const TOKEN_COST = 3;

export async function deductTokens(uid, action, cost = TOKEN_COST) {
  const ref = teacherRef(uid);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error("User profile not found.");
    const balance = snap.data().tokenBalance ?? 0;
    if (balance < cost) {
      throw new Error("Not enough tokens. Contact your administrator to add tokens.");
    }
    tx.update(ref, { tokenBalance: balance - cost, updatedAt: serverTimestamp() });
  });
  await addDoc(tokenLogsRef(uid), {
    uid, amount: -cost, action, createdAt: serverTimestamp(),
  });
}
