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

const keepRuns = (runs) => {
  const waiting = runs.filter((r) => r.status === 'waiting');
  const others = runs.filter((r) => r.status !== 'waiting').slice(0, MAX_RUNS);
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
      saveRoutine: (raw, { workspaceId, workspaceName = '' } = {}, now = Date.now()) => {
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
        // An edited routine starts counting again (a changed folder or time).
        if (old && saved.enabled) set((s) => ({ meta: { ...s.meta, [saved.id]: { ...(s.meta[saved.id] || {}), enabledAt: now, lastFireAt: null } } }));
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
          meta: on ? { ...s.meta, [id]: { enabledAt: now, lastFireAt: null, fired: [], seen: initialSeen({ ...r, enabled: true }, flatFiles) } } : s.meta,
        }));
      },

      deleteRoutine: (id) => set((s) => {
        const meta = { ...s.meta };
        delete meta[id];
        return { routines: s.routines.filter((r) => r.id !== id), meta };
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
          runs: keepRuns((Array.isArray(p.runs) ? p.runs : []).filter((r) => r && r.routine && r.steps).map(recoverRun)),
        };
      },
      partialize: (s) => ({ routines: s.routines, meta: s.meta, runs: s.runs }),
    },
  ),
);

/** The open folder's routines. */
export const routinesFor = (routines, workspaceId) => routines.filter((r) => r.workspaceId === workspaceId);
