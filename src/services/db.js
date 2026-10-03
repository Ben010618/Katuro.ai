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
} from "firebase/firestore";

import { updatePassword } from "firebase/auth";
import { db } from "../firebase";

// ─── Collection refs ──────────────────────────────────────────────────────────

export const teacherRef = (uid) => doc(db, "teachers", uid);

export const scansRef = (uid) => collection(db, "teachers", uid, "scans");
export const scanRef = (uid, scid) => doc(db, "teachers", uid, "scans", scid);

// ─── Teacher profile ──────────────────────────────────────────────────────────

export async function ensureTeacherProfile(uid, email) {
  const ref = teacherRef(uid);
  const snap = await getDoc(ref);
  if (snap.exists()) return { id: snap.id, ...snap.data() };
  const profile = {
    email,
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

// ─── Scans ────────────────────────────────────────────────────────────────────

export async function createScan(uid, data) {
  return addDoc(scansRef(uid), { ...data, createdAt: serverTimestamp() });
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

export async function getQuiz(uid, qid) {
  const snap = await getDoc(quizRef(uid, qid));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

// ─── Lesson Plans ─────────────────────────────────────────────────────────────

export const lessonPlansRef = (uid) => collection(db, "teachers", uid, "lessonPlans");

export async function updateLessonPlan(uid, planId, data) {
  return updateDoc(doc(db, "teachers", uid, "lessonPlans", planId), {
    ...data, updatedAt: serverTimestamp(),
  });
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
 * Upsert an in-progress ILAW draft.
 * Creates a new draft doc on first call; updates the same doc on subsequent
 * calls (keyed by status:'draft' + subject + gradeLevel + term + weekNumber).
 * Prevents duplicate draft docs for the same lesson session.
 * Returns the Firestore document ID.
 */
export async function saveIlawDraft(uid, draftData) {
  // Look for an existing draft with the same session key to avoid duplicates
  const { subject, gradeLevel, term, weekNumber } = draftData;
  const q = query(
    lessonPlansRef(uid),
    where("status", "==", "draft"),
    where("subject", "==", subject || ""),
    where("gradeLevel", "==", gradeLevel || ""),
    where("term", "==", term || ""),
    where("weekNumber", "==", weekNumber || ""),
  );
  const snap = await getDocs(q);
  if (!snap.empty) {
    // Update the existing draft
    const existingRef = snap.docs[0].ref;
    await updateDoc(existingRef, { ...draftData, status: "draft", updatedAt: serverTimestamp() });
    return snap.docs[0].id;
  }
  // Create a new draft
  const ref = await addDoc(lessonPlansRef(uid), {
    ...draftData,
    status: "draft",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
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
          melcList, contentList, dailyContent,
          objectives, procedure, resources } = dllData;
  const lessonName = `DLL – ${subject || 'Lesson'} (${gradeLevel || ''})`.trim();
  const ref = await addDoc(lessonPlansRef(uid), {
    type: 'dll',
    lessonName,
    subject, gradeLevel, term, section, teachingDates,
    contentStandards, performanceStandards, melc,
    melcList, contentList, dailyContent,
    objectives, procedure, resources,
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
  const { subject, grade, topic, melc } = planData;
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

// ─── Teacher profile (extended fields) ───────────────────────────────────────

/**
 * Update teacher profile fields (name, school, position, supervisorName, etc.)
 */
export async function updateTeacherProfile(uid, data) {
  return updateDoc(teacherRef(uid), { ...data, updatedAt: serverTimestamp() });
}

// ─── Admin: read all teachers ─────────────────────────────────────────────────
// Requires Firestore rule: allow read on /teachers/{uid} if isAdmin() == true

export async function getAllTeachers() {
  const snap = await getDocs(collection(db, "teachers"));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

// ─── Admin: create a new user account ────────────────────────────────────────
// Uses a secondary Firebase App instance so the admin stays logged in.

export async function adminCreateUser(email, password, { plan = 'free', subscriptionUntil = null } = {}) {
  const { getFunctions, httpsCallable } = await import('firebase/functions');
  const app = (await import('../firebase')).default;
  const fn = httpsCallable(getFunctions(app, 'us-central1'), 'adminCreateUserFn');
  try {
    const result = await fn({ email, password, plan, subscriptionUntil });
    return result.data; // { uid, email }
  } catch (err) {
    const raw   = err?.message ?? '';
    const clean = raw
      .replace(/^Firebase:\s*/i, '')
      .replace(/\s*\(functions\/[\w-]+\)\.?$/i, '')
      .trim();
    throw new Error(clean || 'Failed to create account.', { cause: err });
  }
}

// ─── Self sign-up: teacher creates their own account ─────────────────────────

export async function selfSignUp({ email, password, surname, givenName, mi, school }) {
  // Registration is handled by a Cloud Function — validation runs server-side so it
  // cannot be bypassed by any client version or cached bundle.
  const { getFunctions, httpsCallable } = await import('firebase/functions');
  const { default: app, auth } = await import('../firebase');

  const registerFn = httpsCallable(getFunctions(app, 'us-central1'), 'registerUser');
  let result;
  try {
    result = await registerFn({ email, password, surname, givenName, mi, school });
  } catch (err) {
    // Surface the Cloud Function's user-friendly message; hide opaque internal codes
    const raw = err?.message ?? '';
    const clean = raw
      .replace(/^Firebase:\s*/i, '')
      .replace(/\s*\(functions\/[\w-]+\)\.?$/i, '')
      .replace(/\s*\(auth\/[\w-]+\)\.?$/i, '')
      .trim();
    throw new Error(clean || 'Registration failed. Please try again.', { cause: err });
  }

  const { pendingApproval } = result.data;

  // Auth user was created server-side — sign in directly with the supplied credentials
  const { signInWithEmailAndPassword } = await import('firebase/auth');
  try {
    await signInWithEmailAndPassword(auth, email.trim().toLowerCase(), password);
  } catch (signInErr) {
    throw new Error('Account created! Sign-in failed due to a network issue. Please sign in manually.', { cause: signInErr });
  }

  return { pendingApproval };
}

// ─── Admin notifications ──────────────────────────────────────────────────────

export function subscribeAdminNotifications(cb) {
  return onSnapshot(
    query(collection(db, 'adminNotifications'), orderBy('createdAt', 'desc')),
    snap => cb(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
    () => {},
  );
}

export async function markAllNotificationsRead() {
  const snap = await getDocs(
    query(collection(db, 'adminNotifications'), where('read', '==', false))
  );
  await Promise.all(snap.docs.map(d => updateDoc(d.ref, { read: true })));
}

// ─── Admin: enable / disable a user ─────────────────────────────────────────

export async function adminSetDisabled(uid, disabled) {
  const update = { disabled, updatedAt: serverTimestamp() };
  if (!disabled) update.pendingApproval = false; // clear waitlist flag when enabling
  return updateDoc(teacherRef(uid), update);
}

// ─── Admin: permanently delete a user account and all their data ─────────────

export async function adminDeleteUser(targetUid) {
  const { getFunctions, httpsCallable } = await import('firebase/functions');
  const app = (await import('../firebase')).default;
  const fn = httpsCallable(getFunctions(app, 'us-central1'), 'adminDeleteUser');
  const result = await fn({ uid: targetUid });
  return result.data;
}

// ─── Admin: change a user's password ─────────────────────────────────────────
// Done on the server with the Firebase Auth admin API: it works at once for every
// account (self-registered too) and the password is never stored in Firestore.
// (The old client path queued self-registered passwords until the teacher signed
// in with the OLD password, and kept them as plain text on the teacher document.)
export async function adminChangePassword(targetUid, newPassword) {
  const { getFunctions, httpsCallable } = await import('firebase/functions');
  const app = (await import('../firebase')).default;
  await httpsCallable(getFunctions(app, 'us-central1'), 'adminChangePassword')({ uid: targetUid, password: newPassword });
}

// Called on login: if admin queued a new password, apply it now and clear the queue.
export async function applyPendingPassword(user) {
  const snap = await getDoc(teacherRef(user.uid));
  if (!snap.exists()) return;
  const pending = snap.data()?.pendingPassword;
  if (!pending) return;
  try {
    await updatePassword(user, pending);
    await updateDoc(teacherRef(user.uid), { pendingPassword: null, password: null });
  } catch {
    // Silent — will retry on next login
  }
}

export async function adminSetFreeMode(enabled, note = '') {
  const { getFunctions, httpsCallable } = await import('firebase/functions');
  const app = (await import('../firebase')).default;
  const fn = httpsCallable(getFunctions(app, 'us-central1'), 'adminSetFreeMode');
  const result = await fn({ enabled, note });
  return result.data;
}

/**
 * Admin: set a teacher's plan. plan = 'free' | 'subscription';
 * subscriptionUntil = 'YYYY-MM-DD' (end of that day, PH time) or null for no end date.
 */
export async function adminSetAccess(uid, plan, subscriptionUntil = null, note = '') {
  const { getFunctions, httpsCallable } = await import('firebase/functions');
  const app = (await import('../firebase')).default;
  const fn = httpsCallable(getFunctions(app, 'us-central1'), 'adminSetAccess');
  const result = await fn({ uid, plan, subscriptionUntil, note });
  return result.data;
}

export function subscribeFreeModeStatus(cb) {
  return onSnapshot(
    doc(db, 'adminConfig', 'billing'),
    (s) => cb(s.data()?.freeMode === true),
    ()  => cb(false),
  );
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

export async function listActionResearch(uid) {
  const q = query(actionResearchColRef(uid), orderBy('updatedAt', 'desc'));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function deleteActionResearch(uid, docId) {
  return deleteDoc(actionResearchDocRef(uid, docId));
}

// ─── AI error reporting ───────────────────────────────────────────────────────

export async function reportAIError({ uid, feature, errorMessage, inputContext }) {
  return addDoc(collection(db, 'aiErrorReports'), {
    uid:          uid   || null,
    feature:      feature       || 'unknown',
    errorMessage: errorMessage  || '',
    inputContext: inputContext  || {},
    resolved:     false,
    createdAt:    serverTimestamp(),
  });
}

// ─── MELC Validation ──────────────────────────────────────────────────────────

export async function validateMelcCode({ subject, gradeLevel, quarter, melcCodes }) {
  const { getFunctions, httpsCallable } = await import('firebase/functions');
  const app = (await import('../firebase')).default;
  const fn = httpsCallable(getFunctions(app, 'us-central1'), 'validateMelcCode');
  const result = await fn({ subject, gradeLevel, quarter, melcCodes });
  return result.data;
}

// ─── Shareable plan link ──────────────────────────────────────────────────────

export async function createSharedPlan({ planType, ownerName, school, subject, gradeLevel, term, melc, preview }) {
  const { getFunctions, httpsCallable } = await import('firebase/functions');
  const app = (await import('../firebase')).default;
  const fn = httpsCallable(getFunctions(app, 'us-central1'), 'createSharedPlan');
  const result = await fn({ planType, ownerName, school, subject, gradeLevel, term, melc, preview });
  return result.data; // { shareId }
}

export async function getSharedPlan(shareId) {
  const snap = await getDoc(doc(db, 'sharedPlans', shareId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() };
}
