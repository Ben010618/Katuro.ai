import {
  collection, doc, addDoc, setDoc, getDoc, getDocs,
  updateDoc, deleteDoc, query, where, orderBy,
  onSnapshot, serverTimestamp, writeBatch,
} from 'firebase/firestore';
import { db } from '../firebase';

// ── Default subjects ──────────────────────────────────────────────────────────

export const DEFAULT_SUBJECTS = [
  'Science',
  'Mathematics',
  'English',
  'Filipino',
  'Araling Panlipunan',
  'MAPEH',
  'Technology and Livelihood Education (TLE)',
  'Edukasyon sa Pagpapakatao (EsP)',
];

export const GRADE_LEVELS = ['Grade 7', 'Grade 8', 'Grade 9', 'Grade 10', 'Grade 11', 'Grade 12'];

// ── Utilities ─────────────────────────────────────────────────────────────────

export function slugify(str) {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/, '');
}

function generateCode() {
  const c = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  return Array.from({ length: 8 }, () => c[Math.floor(Math.random() * c.length)]).join('');
}

export function computeFinalGrade({
  writtenWorks = [], performanceTask = [], quarterlyExam = 0,
  writtenWorksWeight = 40, performanceTaskWeight = 40, quarterlyExamWeight = 20,
}) {
  const avg = arr => arr.length
    ? arr.reduce((s, v) => s + (Number(v) || 0), 0) / arr.length
    : 0;
  const raw =
    avg(writtenWorks)     * (Number(writtenWorksWeight)     || 0) / 100 +
    avg(performanceTask)  * (Number(performanceTaskWeight)  || 0) / 100 +
    (Number(quarterlyExam) || 0) * (Number(quarterlyExamWeight) || 0) / 100;
  return Math.round(raw * 100) / 100;
}

// ── Collection helpers ────────────────────────────────────────────────────────

const secCol  = ()              => collection(db, 'sections');
const secDoc  = id              => doc(db, 'sections', id);
const stuCol  = sid             => collection(db, 'sections', sid, 'students');
const stuDoc  = (sid, stid)     => doc(db, 'sections', sid, 'students', stid);
const invCol  = ()              => collection(db, 'invitations');
const assCol  = uid             => collection(db, 'teachers', uid, 'assignments');
const wtsDoc  = (sid, subj, term = 'term1') => doc(db, 'sections', sid, 'gradeWeights', `${term}_${slugify(subj)}`);
const grdCol  = (sid, subj, term = 'term1') => collection(db, 'sections', sid, 'grades', `${term}_${slugify(subj)}`, 'students');
const grdDoc  = (sid, subj, stid, term = 'term1') => doc(db, 'sections', sid, 'grades', `${term}_${slugify(subj)}`, 'students', stid);

// ── Sections ──────────────────────────────────────────────────────────────────

export async function createSection(adviserUid, { academicYear, gradeLevel, sectionName }) {
  const ref = await addDoc(secCol(), {
    adviserUid, academicYear, gradeLevel, sectionName,
    subjects: DEFAULT_SUBJECTS,
    specialSubjects: [],
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

export function subscribeAdviserSections(adviserUid, cb) {
  return onSnapshot(query(secCol(), where('adviserUid', '==', adviserUid)), snap => {
    const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    docs.sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
    cb(docs);
  });
}

export function subscribeSection(sectionId, cb) {
  return onSnapshot(secDoc(sectionId), snap =>
    cb(snap.exists() ? { id: snap.id, ...snap.data() } : null)
  );
}

export async function addSpecialSubject(sectionId, subject, current) {
  await updateDoc(secDoc(sectionId), { specialSubjects: [...current, subject] });
}

export async function removeSpecialSubject(sectionId, subject, current) {
  await updateDoc(secDoc(sectionId), { specialSubjects: current.filter(s => s !== subject) });
}

// ── Students ──────────────────────────────────────────────────────────────────

export async function addStudent(sectionId, data) {
  return (await addDoc(stuCol(sectionId), { ...data, enrolledAt: serverTimestamp() })).id;
}

export async function updateStudent(sectionId, studentId, data) {
  await updateDoc(stuDoc(sectionId, studentId), data);
}

export async function removeStudent(sectionId, studentId) {
  await deleteDoc(stuDoc(sectionId, studentId));
}

export function subscribeStudents(sectionId, cb) {
  return onSnapshot(
    query(stuCol(sectionId), orderBy('surname', 'asc')),
    snap => cb(snap.docs.map(d => ({ id: d.id, ...d.data() })))
  );
}

// ── Invitations ───────────────────────────────────────────────────────────────

export async function createInvitation(adviserUid, { sectionId, sectionName, gradeLevel, subject }) {
  // Snapshot the current student roster so it travels with the invitation
  const studentsSnap = await getDocs(query(stuCol(sectionId), orderBy('surname', 'asc')));
  const students = studentsSnap.docs.map(d => ({
    id: d.id,
    surname:       d.data().surname       || '',
    givenName:     d.data().givenName     || '',
    middleInitial: d.data().middleInitial || '',
  }));

  // Delete all existing invites for this section+subject before creating a new one
  const existing = await getDocs(
    query(invCol(), where('sectionId', '==', sectionId), where('subject', '==', subject))
  );
  const batch = writeBatch(db);
  existing.docs.forEach(d => batch.delete(d.ref));

  const inviteCode = generateCode();
  const inviteLink = `${window.location.origin}/invite/${inviteCode}`;
  const ref = doc(invCol());
  batch.set(ref, {
    inviteCode, inviteLink,
    sectionId, sectionName, gradeLevel, subject, adviserUid,
    students,                          // ← roster snapshot
    teacherUid: null, teacherName: null,
    status: 'pending',
    createdAt: serverTimestamp(),
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  });
  await batch.commit();
  return { id: ref.id, inviteCode, inviteLink };
}

export function subscribeSubjectInvitation(sectionId, subject, cb) {
  return onSnapshot(
    query(invCol(), where('sectionId', '==', sectionId), where('subject', '==', subject)),
    snap => {
      const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      docs.sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
      cb(docs[0] || null);
    }
  );
}

export async function getInvitationByCode(inviteCode) {
  const snap = await getDocs(query(invCol(), where('inviteCode', '==', inviteCode)));
  if (snap.empty) return null;
  return { id: snap.docs[0].id, ...snap.docs[0].data() };
}

export async function acceptInvitation(inviteCode, teacherUid, teacherName) {
  const invite = await getInvitationByCode(inviteCode);
  if (!invite) throw new Error('Invitation not found or expired.');
  if (invite.status === 'accepted') return invite; // idempotent

  const students = invite.students || [];
  const DEFAULT_WEIGHTS = {
    writtenWorksWeight: 40, performanceTaskWeight: 40, quarterlyExamWeight: 20,
    wwCount: 3, ptCount: 2,
  };
  const initGrades = {};
  students.forEach(s => {
    initGrades[s.id] = { writtenWorks: [], performanceTask: [], quarterlyExam: 0, finalGrade: 0 };
  });

  const batch = writeBatch(db);

  // Mark invitation accepted
  batch.update(doc(db, 'invitations', invite.id), { teacherUid, teacherName, status: 'accepted' });

  // Assignment record (drives ClassesITeachPage card list)
  batch.set(doc(assCol(teacherUid)), {
    sectionId:   invite.sectionId,
    subject:     invite.subject,
    gradeLevel:  invite.gradeLevel,
    sectionName: invite.sectionName,
    adviserUid:  invite.adviserUid,
    role:        'subject_teacher',
    acceptedAt:  serverTimestamp(),
  });

  // Auto-create one gradesheet doc per term inside the teacher's own space
  for (const term of ['term1', 'term2', 'term3']) {
    const sheetId = `${invite.sectionId}_${slugify(invite.subject)}_${term}`;
    batch.set(doc(db, 'teachers', teacherUid, 'gradeSheets', sheetId), {
      sectionId:   invite.sectionId,
      subject:     invite.subject,
      term,
      gradeLevel:  invite.gradeLevel,
      sectionName: invite.sectionName,
      adviserUid:  invite.adviserUid,
      status:      'draft',
      weights:     DEFAULT_WEIGHTS,
      students,
      grades:      initGrades,
      createdAt:   serverTimestamp(),
    });
  }

  await batch.commit();
  return invite;
}

// ── Assignments (Classes I Teach) ─────────────────────────────────────────────

export function subscribeAssignments(uid, cb) {
  return onSnapshot(
    query(assCol(uid), orderBy('acceptedAt', 'desc')),
    snap => cb(snap.docs.map(d => ({ id: d.id, ...d.data() })))
  );
}

// ── Grade weights ─────────────────────────────────────────────────────────────

export async function saveGradeWeights(sectionId, subject, weights, term = 'term1') {
  await setDoc(wtsDoc(sectionId, subject, term), { ...weights, updatedAt: serverTimestamp() }, { merge: true });
}

export function subscribeGradeWeights(sectionId, subject, cb, term = 'term1') {
  return onSnapshot(wtsDoc(sectionId, subject, term), snap =>
    cb(snap.exists()
      ? snap.data()
      : { writtenWorksWeight: 40, performanceTaskWeight: 40, quarterlyExamWeight: 20, wwCount: 3, ptCount: 2 }
    )
  );
}

// ── Student grades ────────────────────────────────────────────────────────────

export async function saveStudentGrades(sectionId, subject, studentId, data, weights, term = 'term1') {
  const finalGrade = computeFinalGrade({ ...data, ...weights });
  await setDoc(grdDoc(sectionId, subject, studentId, term), {
    studentId, ...data, finalGrade, updatedAt: serverTimestamp(),
  }, { merge: true });
}

export function subscribeSubjectGrades(sectionId, subject, cb, term = 'term1') {
  return onSnapshot(grdCol(sectionId, subject, term), snap => {
    const map = {};
    snap.docs.forEach(d => { map[d.id] = d.data(); });
    cb(map);
  });
}

// ── Teacher grade sheets (live in teacher's own space) ────────────────────────

export function subscribeGradeSheet(teacherUid, sectionId, subject, term, cb) {
  const sheetId = `${sectionId}_${slugify(subject)}_${term}`;
  return onSnapshot(
    doc(db, 'teachers', teacherUid, 'gradeSheets', sheetId),
    snap => cb(snap.exists() ? { id: snap.id, ...snap.data() } : null)
  );
}

export async function saveGradeSheet(teacherUid, sectionId, subject, term, { weights, grades }) {
  const sheetId = `${sectionId}_${slugify(subject)}_${term}`;
  await setDoc(
    doc(db, 'teachers', teacherUid, 'gradeSheets', sheetId),
    { weights, grades, updatedAt: serverTimestamp() },
    { merge: true }
  );
}

export async function submitGradeSheet(teacherUid, sectionId, subject, term) {
  const sheetId = `${sectionId}_${slugify(subject)}_${term}`;
  const sheetSnap = await getDoc(doc(db, 'teachers', teacherUid, 'gradeSheets', sheetId));
  if (!sheetSnap.exists()) throw new Error('Grade sheet not found.');

  const sheet = sheetSnap.data();
  const w = sheet.weights;
  const batch = writeBatch(db);

  // Push weights to adviser's consolidated section path
  batch.set(wtsDoc(sectionId, subject, term), { ...w, updatedAt: serverTimestamp() }, { merge: true });

  // Push each student's computed final grade to adviser's section
  Object.entries(sheet.grades || {}).forEach(([studentId, g]) => {
    const finalGrade = computeFinalGrade({ ...g, ...w });
    batch.set(grdDoc(sectionId, subject, studentId, term), {
      studentId, ...g, finalGrade, updatedAt: serverTimestamp(),
    }, { merge: true });
  });

  // Mark the sheet as submitted in teacher's space
  batch.update(doc(db, 'teachers', teacherUid, 'gradeSheets', sheetId), {
    status: 'submitted', submittedAt: serverTimestamp(),
  });

  await batch.commit();
}
