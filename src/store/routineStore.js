/**
 * routineStore.js — the teacher's KaTuro Routines and their runs, kept on this computer.
 *
 * Separate from deskStore so the two never break each other. Routines belong to the folder they
 * were made in (their files are paths inside it): the list shows the open folder's routines.
 *
 *   routines: [{ ...routine (routine.js), workspaceId, workspaceName, createdAt, updatedAt }]
 *   meta:     { [routineId]: { enabledAt, lastFireAt, fired, seen } }   (triggers.js)
 *   runs:     newest first: every run waiting for the teacher, plus the last MAX_RUNS others
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { checkRoutine, cleanRoutine } from '../services/desk/routines/routine.js';
import { initialSeen } from '../services/desk/routines/triggers.js';
import { recoverRun } from '../services/desk/routines/runRoutine.js';

export const MAX_RUNS = 60;
export const MAX_ROUTINES = 50;

export const MAX_WAITING_PER_ROUTINE = 3;

/**
 * The runs kept: newest first; waiting runs are kept (they are the teacher's to answer), but at
 * most MAX_WAITING_PER_ROUTINE per routine: an older one not answered is closed as "not answered"
 * (nothing after its Ask card is done) so unanswered runs never pile up. Then MAX_RUNS others.
 */
const keepRuns = (runs) => {
  const sorted = [...runs].sort((a, b) => (b.startedAt || 0) - (a.startedAt || 0));
  const perRoutine = new Map();
  const closed = sorted.map((r) => {
    if (r.status !== 'waiting') return r;
    const n = (perRoutine.get(r.routineId) || 0) + 1;
    perRoutine.set(r.routineId, n);
    return n > MAX_WAITING_PER_ROUTINE ? { ...r, status: 'error', waiting: null, finishedAt: r.finishedAt || Date.now(), problem: 'Not answered: a newer run of this routine is waiting instead.' } : r;
  });
  const waiting = closed.filter((r) => r.status === 'waiting');
  const others = closed.filter((r) => r.status !== 'waiting').slice(0, MAX_RUNS);
  return [...waiting, ...others].sort((a, b) => (b.startedAt || 0) - (a.startedAt || 0));
};

export const useRoutineStore = create(
  persist(
    (set, get) => ({
      routines: [],
      meta: {},
      runs: [],

      /**
       * Saves a routine (new or edited) for a folder. It is cleaned first; a routine with problems
       * is kept switched off. → { routine, dropped, problems }
       */
      saveRoutine: (raw, { workspaceId, workspaceName = '', flatFiles = [] } = {}, now = Date.now()) => {
        const { routine, dropped } = cleanRoutine(raw);
        const problems = checkRoutine(routine);
        const old = get().routines.find((r) => r.id === routine.id);
        if (!old && get().routines.length >= MAX_ROUTINES) throw new Error(`You can keep up to ${MAX_ROUTINES} routines. Delete one you no longer use.`);
        const saved = {
          ...routine,
          enabled: problems.length ? false : old ? old.enabled && routine.enabled : false,
          workspaceId: old?.workspaceId ?? workspaceId ?? null,
          workspaceName: old?.workspaceName ?? workspaceName,
          createdAt: old?.createdAt ?? now,
          updatedAt: now,
        };
        set((s) => ({ routines: old ? s.routines.map((r) => (r.id === saved.id ? saved : r)) : [saved, ...s.routines] }));
        // An edited routine that stays on starts counting again, as if switched on now: a changed
        // time from now, and a changed watched folder (or kind of file) starts from the files in it
        // NOW (none of them fire). DepEd dates already done stay done.
        if (old && saved.enabled) {
          set((s) => ({ meta: { ...s.meta, [saved.id]: { fired: s.meta[saved.id]?.fired || [], enabledAt: now, lastFireAt: null, seen: initialSeen(saved, flatFiles), pending: {} } } }));
        }
        return { routine: saved, dropped, problems };
      },

      /** Switches a routine on (only when it has no problems) or off. */
      setEnabled: (id, on, { flatFiles = [], now = Date.now() } = {}) => {
        const r = get().routines.find((x) => x.id === id);
        if (!r) throw new Error('That routine no longer exists.');
        if (on) {
          const problems = checkRoutine(r);
          if (problems.length) throw new Error(problems[0].text);
        }
        set((s) => ({
          routines: s.routines.map((x) => (x.id === id ? { ...x, enabled: Boolean(on), updatedAt: now } : x)),
          meta: on ? { ...s.meta, [id]: { enabledAt: now, lastFireAt: null, fired: [], seen: initialSeen({ ...r, enabled: true }, flatFiles), pending: {} } } : s.meta,
        }));
      },

      /** Deletes a routine with its runs (waiting ones too: nothing of it is kept). */
      deleteRoutine: (id) => set((s) => {
        const meta = { ...s.meta };
        delete meta[id];
        return { routines: s.routines.filter((r) => r.id !== id), meta, runs: s.runs.filter((r) => r.routineId !== id) };
      }),

      setMeta: (id, meta) => set((s) => ({ meta: { ...s.meta, [id]: meta } })),

      /** Adds or replaces a run (progress is saved after every card). */
      upsertRun: (run) => set((s) => ({ runs: keepRuns([run, ...s.runs.filter((r) => r.id !== run.id)]) })),

      clearHistory: () => set((s) => ({ runs: s.runs.filter((r) => r.status === 'waiting') })),
    }),
    {
      name: 'katuro-routines-v1',
      // A run cut off by closing the app is shown as stopped; everything is cleaned on load.
      merge: (persisted, current) => {
        const p = persisted && typeof persisted === 'object' ? persisted : {};
        const routines = (Array.isArray(p.routines) ? p.routines : []).slice(0, MAX_ROUTINES).map((r) => {
          const { routine } = cleanRoutine(r);
          return { ...routine, enabled: routine.enabled && !checkRoutine(routine).length, workspaceId: r?.workspaceId ?? null, workspaceName: String(r?.workspaceName || ''), createdAt: Number(r?.createdAt) || Date.now(), updatedAt: Number(r?.updatedAt) || Date.now() };
        });
        return {
          ...current,
          routines,
          meta: p.meta && typeof p.meta === 'object' && !Array.isArray(p.meta) ? p.meta : {},
          runs: keepRuns((Array.isArray(p.runs) ? p.runs : []).filter((r) => r && r.routine && r.steps && routines.some((x) => x.id === r.routineId)).map(recoverRun)),
        };
      },
      partialize: (s) => ({ routines: s.routines, meta: s.meta, runs: s.runs }),
    },
  ),
);

/** The open folder's routines. */
export const routinesFor = (routines, workspaceId) => routines.filter((r) => r.workspaceId === workspaceId);
