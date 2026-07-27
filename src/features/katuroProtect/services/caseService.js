// CRUD + state-machine transitions for protect_cases (BrainBank Part K).
// No AI/classification here on purpose — see katuroProtect/index.jsx for why
// Chat and auto-classification are deferred until the Layer 2 corpus exists.

import {
  collection, doc, addDoc, updateDoc, onSnapshot, serverTimestamp, arrayUnion, query, where,
} from 'firebase/firestore';
import { db } from '../../../firebase';
import { CASE_STATES } from '../types';

// Which states a case may move to FROM its current state. Mostly the linear
// K1 order, plus REFERRED_OUT as a branch (red-flag/external referral can
// happen right after classification, or after a decision is issued — BrainBank
// K2's "red-flag override... at ANY state" is intentionally not fully open-
// ended here; this keeps the board honest about the two points a referral
// realistically branches from without letting any state jump anywhere).
const NEXT_ALLOWED = {
  REPORTED:         ['INTAKE_DONE'],
  INTAKE_DONE:      ['CLASSIFIED'],
  CLASSIFIED:       ['PARENTS_NOTIFIED', 'REFERRED_OUT'],
  PARENTS_NOTIFIED: ['FACTFINDING'],
  FACTFINDING:      ['CPC_DELIBERATION'],
  CPC_DELIBERATION: ['DECISION_ISSUED'],
  DECISION_ISSUED:  ['REFERRED_OUT', 'MONITORING'],
  REFERRED_OUT:     ['MONITORING'],
  MONITORING:       ['REPORTING'],
  REPORTING:        ['CLOSED'],
  CLOSED:           [],
};

export function canAdvanceTo(currentState, nextState) {
  return (NEXT_ALLOWED[currentState] || []).includes(nextState);
}
export function allowedNextStates(currentState) {
  return NEXT_ALLOWED[currentState] || [];
}

/** Real-time subscription to all cases, newest first. */
export function subscribeCases(onData, onError) {
  return onSnapshot(
    collection(db, 'protect_cases'),
    (snap) => {
      const cases = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      cases.sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0));
      onData(cases);
    },
    onError,
  );
}

/** Real-time subscription to cases filed BY this user only — the Filed Cases
 * tab, open to every teacher (not just admins). Firestore rules only allow a
 * non-admin to read a case where createdBy matches their own uid, so this is
 * the client-side counterpart of that same restriction, not just a filter. */
export function subscribeMyCases(uid, onData, onError) {
  return onSnapshot(
    query(collection(db, 'protect_cases'), where('createdBy', '==', uid)),
    (snap) => {
      const cases = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      cases.sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0));
      onData(cases);
    },
    onError,
  );
}

/** Creates a case from a completed IntakeForm (Part G1), starting in REPORTED. */
export async function createCase(intake, createdBy) {
  const ref = await addDoc(collection(db, 'protect_cases'), {
    state: 'REPORTED',
    classification: null,          // set once real classification exists (needs Layer 2 corpus)
    escalationTier: 'T1_first',    // manual until incident_registry tier computation is built
    intake,
    timeline: [{
      at: new Date().toISOString(), // client timestamp for the embedded array (serverTimestamp() isn't allowed inside arrayUnion)
      state: 'REPORTED',
      note: 'Case reported and logged.',
      by: createdBy || null,
    }],
    createdBy: createdBy || null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

/** Advances a case to the next state, validating the transition and appending to the timeline. */
export async function advanceCaseState(caseId, currentState, nextState, note, by) {
  if (!canAdvanceTo(currentState, nextState)) {
    throw new Error(`Cannot move a case from ${currentState} to ${nextState} — invalid transition.`);
  }
  await updateDoc(doc(db, 'protect_cases', caseId), {
    state: nextState,
    updatedAt: serverTimestamp(),
    timeline: arrayUnion({
      at: new Date().toISOString(),
      state: nextState,
      note: note || '',
      by: by || null,
    }),
  });
}

/** Manual escalation-tier override (auto-computation from incident_registry is a later phase). */
export async function setEscalationTier(caseId, tier) {
  await updateDoc(doc(db, 'protect_cases', caseId), {
    escalationTier: tier,
    updatedAt: serverTimestamp(),
  });
}

// ── Archiving ─────────────────────────────────────────────────────────────
// Every case is already permanently stored in Firestore (protect_cases) —
// nothing is ever deleted by the app itself. Archiving is purely a display
// concern: it keeps closed/old cases out of the default Case Board view
// without losing them, and they stay one click away via the Archived filter.
// Available at any state, not just CLOSED, so an admin can declutter the
// board without being forced through the whole state machine first.
export async function archiveCase(caseId, by) {
  await updateDoc(doc(db, 'protect_cases', caseId), {
    archived: true,
    archivedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    timeline: arrayUnion({
      at: new Date().toISOString(),
      state: null,
      note: 'Case archived.',
      by: by || null,
    }),
  });
}

export async function unarchiveCase(caseId, by) {
  await updateDoc(doc(db, 'protect_cases', caseId), {
    archived: false,
    updatedAt: serverTimestamp(),
    timeline: arrayUnion({
      at: new Date().toISOString(),
      state: null,
      note: 'Case restored from archive.',
      by: by || null,
    }),
  });
}

export { CASE_STATES };
