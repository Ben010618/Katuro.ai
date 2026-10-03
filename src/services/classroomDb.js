import { transmute } from './desk/depedGrading';
import {
  collection, doc, addDoc, setDoc, getDoc, getDocs,
  updateDoc, deleteDoc, query, where, orderBy,
  onSnapshot, serverTimestamp, writeBatch, arrayUnion,
} from 'firebase/firestore';
import { db } from '../firebase';

// ── Default subjects ──────────────────────────────────────────────────────────

export const DEFAULT_SUBJECTS = [
  'Filipino',
  'English',
  'Mathematics',
  'Science',
  'Araling Panlipunan',
  'Edukasyon sa Pagpapakatao (EsP)',
  'Technology and Livelihood Education (TLE)',
  'MAPEH',
];

export const GRADE_LEVELS = ['Grade 7', 'Grade 8', 'Grade 9', 'Grade 10', 'Grade 11', 'Grade 12'];

export const TERMS = [
  { key: 'term1', label: 'Term 1' },
  { key: 'term2', label: 'Term 2' },
  { key: 'term3', label: 'Term 3' },
];

// ── Utilities ─────────────────────────────────────────────────────────────────

export function slugify(str) {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/, '');
}

function generateCode() {
  const c = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  return Array.from({ length: 8 }, () => c[Math.floor(Math.random() * c.length)]).join('');
}

export function computeFinalGrade({
  writtenWorks = [], performanceTask = [],
  summativeTests = [], quarterlyExam,          // quarterlyExam kept for backward compat
  writtenWorksWeight = 40, performanceTaskWeight = 40,
  summativeTestWeight, quarterlyExamWeight,    // support both field names
  wwMax = [], ptMax = [], stMax = [100, 100], qeMax = 100,
  wwCount, ptCount,
}) {
  const wwLen = wwCount || Math.max(writtenWorks.length, wwMax.length, 1);
  const ptLen = ptCount || Math.max(performanceTask.length, ptMax.length, 1);

  const percentScore = (scores, maxArr, len) => {
    if (!len) return 0;
    let totalRaw = 0, totalMax = 0;
    for (let i = 0; i < len; i++) {
      totalRaw += Number(scores[i]) || 0;
      totalMax += Number(maxArr[i]) || 100;
    }
    return totalMax > 0 ? Math.min(100, (totalRaw / totalMax) * 100) : 0;
  };

  const PS_WW = percentScore(writtenWorks, wwMax, wwLen);
  const PS_PT = percentScore(performanceTask, ptMax, ptLen);

  // Support new summativeTests array OR old single quarterlyExam value
  const effectiveST    = summativeTests?.length > 0 ? summativeTests : (quarterlyExam !== undefined ? [quarterlyExam] : []);
  const effectiveSTMax = stMax?.length > 0 ? stMax : [qeMax ?? 100];
  const PS_ST = percentScore(effectiveST, effectiveSTMax, Math.max(effectiveST.length, 1));

  const effectiveSTWeight = summativeTestWeight ?? quarterlyExamWeight ?? 20;

  // No score entered anywhere yet: there is no grade (it used to show and save as 60).
  const entered = (arr) => (arr || []).some((v) => v !== '' && v !== null && v !== undefined && Number.isFinite(Number(v)));
  if (!entered(writtenWorks.slice(0, wwLen)) && !entered(performanceTask.slice(0, ptLen)) && !entered(effectiveST)) return null;

  const IG =
    PS_WW * (writtenWorksWeight / 100) +
    PS_PT * (performanceTaskWeight / 100) +
    PS_ST * (effectiveSTWeight / 100);

  // DepEd Order No. 8, s. 2015 transmutation table (a whole number from 60 to 100).
  // The old straight-line formula (60 + IG x 0.4) turned failing initial grades
  // into passing ones: IG 50 showed as 80 instead of 72.
  return transmute(Math.min(100, IG));
}

export function sumComponentWeights({ writtenWorksWeight = 0, performanceTaskWeight = 0, summativeTestWeight = 0 } = {}) {
  return (writtenWorksWeight || 0) + (performanceTaskWeight || 0) + (summativeTestWeight || 0);
}

export function reshapeItemCount(weights, key, delta) {
  const newCount = Math.max(1, (weights[key] || 1) + delta);
  const updated = { ...weights, [key]: newCount };
  if (key === 'wwCount') {
    updated.wwMax = Array.from({ length: newCount }, (_, i) => weights.wwMax?.[i] ?? 100);
  } else if (key === 'ptCount') {
    updated.ptMax = Array.from({ length: newCount }, (_, i) => weights.ptMax?.[i] ?? 100);
  }
  return updated;
}

export function updateMaxScore(weights, field, idx, value) {
  const arr = [...(weights[field] || [])];
  arr[idx] = Math.max(1, Number(value) || 100);
  return { ...weights, [field]: arr };
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

export function subscribeSection(sectionId, cb, onError) {
  return onSnapshot(
    secDoc(sectionId),
    snap => cb(snap.exists() ? { id: snap.id, ...snap.data() } : null),
    err => (onError ? onError(err) : cb(null)),
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
  // No roster copy: any signed-in teacher can look up an invitation by code, so it
  // must not carry learner names. Subject teachers read the live roster once they
  // are members of the section.

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

const memberDoc = (sid, uid) => doc(db, 'sections', sid, 'members', uid);
const _memberships = new Set();

/**
 * Makes sure a subject teacher has their membership record for a section (needed by
 * the security rules to read the roster and write grades). Teachers who accepted an
 * invitation before memberships existed get theirs here, the first time they open
 * the class. Returns false when the teacher was never assigned to this section.
 */
export async function ensureMembership(sectionId, uid) {
  const key = `${sectionId}:${uid}`;
  if (!sectionId || !uid) return false;
  if (_memberships.has(key)) return true;
  try {
    if ((await getDoc(memberDoc(sectionId, uid))).exists()) {
      _memberships.add(key);
      return true;
    }
  } catch {
    // Not readable means not a member yet; fall through.
  }
  const accepted = await getDocs(query(invCol(), where('sectionId', '==', sectionId), where('teacherUid', '==', uid)));
  const invite = accepted.docs.find((d) => d.data().status === 'accepted');
  if (!invite) return false;
  await setDoc(memberDoc(sectionId, uid), { uid, invitationId: invite.id, subject: invite.data().subject || '', joinedAt: serverTimestamp() });
  _memberships.add(key);
  return true;
}

export async function acceptInvitation(inviteCode, teacherUid, teacherName) {
  const invite = await getInvitationByCode(inviteCode);
  if (!invite) throw new Error('Invitation not found or expired.');
  if (invite.status === 'accepted') {
    if (invite.teacherUid === teacherUid) {
      await ensureMembership(invite.sectionId, teacherUid);
      return invite; // idempotent for the same teacher
    }
    throw new Error('This invitation was already accepted by another teacher. Ask the adviser for a new link.');
  }
  const expires = invite.expiresAt?.toMillis ? invite.expiresAt.toMillis() : (invite.expiresAt ? new Date(invite.expiresAt).getTime() : null);
  if (expires && expires < Date.now()) {
    throw new Error('This invitation link has expired. Ask the adviser to send a new one.');
  }

  const students = invite.students || [];
  const DEFAULT_WEIGHTS = {
    writtenWorksWeight: 40, performanceTaskWeight: 40, quarterlyExamWeight: 20,
    wwCount: 3, ptCount: 2,
    wwMax: [100, 100, 100],
    ptMax: [100, 100],
    qeMax: 100,
  };
  const initGrades = {};
  students.forEach(s => {
    initGrades[s.id] = { writtenWorks: [], performanceTask: [], quarterlyExam: 0, finalGrade: 0 };
  });

  const batch = writeBatch(db);

  // Mark invitation accepted (the rules allow this only while it is pending and unexpired,
  // so two teachers can never both accept one link) and record the membership.
  batch.update(doc(db, 'invitations', invite.id), { teacherUid, teacherName, status: 'accepted' });
  batch.set(memberDoc(invite.sectionId, teacherUid), { uid: teacherUid, invitationId: invite.id, subject: invite.subject || '', joinedAt: serverTimestamp() });

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
  _memberships.add(`${invite.sectionId}:${teacherUid}`);
  return invite;
}

// ── Section delete (cascade) ──────────────────────────────────────────────────

async function batchedDelete(refs) {
  const CHUNK = 450;
  for (let i = 0; i < refs.length; i += CHUNK) {
    const b = writeBatch(db);
    refs.slice(i, i + CHUNK).forEach(r => b.delete(r));
    await b.commit();
  }
}

export async function deleteSection(sectionId, adviserUid) {
  const sectionSnap = await getDoc(secDoc(sectionId));
  const section = sectionSnap.exists() ? sectionSnap.data() : {};
  const owner = adviserUid || section.adviserUid;

  // 1. Teacher side first, while the section still exists. The adviser may only read
  //    teachers' assignments/gradeSheets that carry their adviserUid, so the queries
  //    must filter on it (without it the rules rejected the query and the delete
  //    stopped halfway, after the section was already gone).
  const invitesSnap = await getDocs(query(invCol(), where('sectionId', '==', sectionId)));
  const teacherRefs = [];
  const subjects = new Set([...(section.subjects || []), ...(section.specialSubjects || [])]);
  for (const inv of invitesSnap.docs) {
    const { teacherUid, subject } = inv.data();
    if (subject) subjects.add(subject);
    if (teacherUid) {
      const assignSnap = await getDocs(query(assCol(teacherUid), where('sectionId', '==', sectionId), where('adviserUid', '==', owner)));
      assignSnap.docs.forEach(d => teacherRefs.push(d.ref));
      const sheetsSnap = await getDocs(query(collection(db, 'teachers', teacherUid, 'gradeSheets'), where('sectionId', '==', sectionId), where('adviserUid', '==', owner)));
      sheetsSnap.docs.forEach(d => teacherRefs.push(d.ref));
    }
    teacherRefs.push(inv.ref);
  }
  if (teacherRefs.length) await batchedDelete(teacherRefs);

  // 2. Everything under the section.
  const refs = [];
  const students = await getDocs(stuCol(sectionId));
  students.docs.forEach(d => refs.push(d.ref));
  for (const sub of ['gradeWeights', 'studentComments', 'members']) {
    const snap = await getDocs(collection(db, 'sections', sectionId, sub));
    snap.docs.forEach(d => refs.push(d.ref));
  }
  // Grade docs live at grades/{term}_{subject}/students/{studentId}; the group docs
  // themselves are never created, so listing "grades" found nothing and every grade
  // survived the delete. Delete them by path instead (deleting a missing doc is a no-op).
  for (const subject of subjects) {
    for (const term of ['term1', 'term2', 'term3']) {
      students.docs.forEach(st => refs.push(grdDoc(sectionId, subject, st.id, term)));
    }
  }
  // 3. The section doc last: the rules check it to authorise the deletes above.
  refs.push(secDoc(sectionId));
  await batchedDelete(refs);
}

export function subscribeAssignments(uid, cb) {
  return onSnapshot(
    query(assCol(uid), orderBy('acceptedAt', 'desc')),
    snap => cb(snap.docs.map(d => ({ id: d.id, ...d.data() })))
  );
}

// ── Grade weights ─────────────────────────────────────────────────────────────

export function subscribeGradeWeights(sectionId, subject, cb, term = 'term1') {
  return onSnapshot(wtsDoc(sectionId, subject, term), snap =>
    cb(snap.exists()
      ? snap.data()
      : { writtenWorksWeight: 40, performanceTaskWeight: 40, summativeTestWeight: 20, wwCount: 3, ptCount: 2 }
    )
  );
}

// ── Student grades ────────────────────────────────────────────────────────────

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
    const finalGrade = computeFinalGrade({ ...g, ...w, wwCount: w.wwCount, ptCount: w.ptCount });
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

// ── Student comments ──────────────────────────────────────────────────────────
// Stored flat in sections/{sectionId}/studentComments/{commentId}

export async function addStudentComment(sectionId, { studentId, text, authorUid, authorName, authorRole, subject }) {
  await addDoc(collection(db, 'sections', sectionId, 'studentComments'), {
    studentId,
    text,
    authorUid,
    authorName,
    authorRole,           // 'adviser' | 'subject_teacher'
    subject:  subject || null,
    timestamp: serverTimestamp(),
    readBy:   [authorUid], // author has read their own comment
  });
}

export function subscribeStudentComments(sectionId, studentId, cb) {
  const q = query(
    collection(db, 'sections', sectionId, 'studentComments'),
    where('studentId', '==', studentId),
  );
  return onSnapshot(q, snap => {
    const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    docs.sort((a, b) => (a.timestamp?.seconds || 0) - (b.timestamp?.seconds || 0));
    cb(docs);
  });
}

export function subscribeSectionComments(sectionId, cb) {
  return onSnapshot(
    collection(db, 'sections', sectionId, 'studentComments'),
    snap => cb(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
  );
}

export async function markCommentRead(sectionId, commentId, uid) {
  await updateDoc(doc(db, 'sections', sectionId, 'studentComments', commentId), {
    readBy: arrayUnion(uid),
  });
}
