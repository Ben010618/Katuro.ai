/**
 * deskRoutineRequests.js — the KaTuro App sees and answers "Ask me first" (Routines).
 *
 *   routineInbox                    → the routines waiting for the teacher's OK in the open folder
 *   routineDecide { id, approve }   → approves (the routine goes on, on KaTuroDesk) or says no
 *
 * Only a phone linked to this computer (paired, encrypted, same Wi-Fi, the same KaTuro account;
 * electron/linkService.cjs) can ask. The phone sends only an id and true/false: what the routine
 * then does is decided here, by the routine the teacher built.
 */

export const ROUTINE_OPS = new Set(['routineInbox', 'routineDecide']);
const RUN_ID = /^run[a-z0-9]{4,40}$/i;
const clip = (s, n) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);

class RoutineRequestError extends Error {
  constructor(message, code = 'ERROR') {
    super(message);
    this.code = code;
  }
}

/** What the phone is shown about one waiting run (no file contents). */
export function inboxItem(run) {
  const step = (c) => ({ label: clip(c.label, 80), status: c.status });
  return {
    id: run.id,
    routineName: clip(run.routineName, 80),
    note: clip(run.waiting?.note, 300),
    preview: (run.waiting?.preview || []).slice(0, 8).map((p) => clip(p, 200)),
    askedAt: Number(run.waiting?.askedAt) || null,
    steps: (run.stepsForPhone || []).slice(0, 20).map(step),
  };
}

/**
 * deps: { waitingRuns() → [run with stepsForPhone], decide(id, approve, deviceName) → Promise<{ status, summary } | null> }
 * → handle(op, args, device)
 */
export function createRoutineHandler({ waitingRuns, decide }) {
  return async function handleRoutineRequest(op, args = {}, device = null) {
    if (op === 'routineInbox') return { items: waitingRuns().map(inboxItem) };
    if (op === 'routineDecide') {
      const id = typeof args?.id === 'string' ? args.id : '';
      if (!RUN_ID.test(id)) throw new RoutineRequestError('That routine is not known.', 'BAD_REQUEST');
      if (typeof args.approve !== 'boolean') throw new RoutineRequestError('Say yes or no.', 'BAD_REQUEST');
      if (!waitingRuns().some((r) => r.id === id)) throw new RoutineRequestError('This routine is no longer waiting.', 'GONE');
      const out = await decide(id, args.approve, clip(device?.name || 'KaTuro App', 60));
      if (!out) throw new RoutineRequestError('KaTuroDesk is busy. Try again in a moment.', 'BUSY');
      return { ok: true, status: out.status, summary: clip(out.summary, 300) };
    }
    throw new RoutineRequestError('KaTuroDesk does not know that request. Update KaTuroDesk.', 'UNKNOWN_OP');
  };
}
