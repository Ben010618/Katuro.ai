/**
 * routineEngine.js — runs KaTuro Routines inside KaTuroDesk (services/desk/routines/runRoutine.js
 * does the card logic; this file connects it to the real agent, files, chat and notices).
 *
 * Every green card runs through runDeskAgentTurn with a confirmed plan (no AI call to plan, the
 * same tool code, path checks, backups, privacy masking and records rules as a chat request).
 * Only one thing runs at a time: routines share the scheduler's lock with scheduled tasks and
 * never start while the teacher's own request is running.
 */
import { useEffect, useRef } from 'react';
import { useDeskStore, workspaceIdOf, folderIndex } from '../../../store/deskStore';
import { useRoutineStore, routinesFor } from '../../../store/routineStore';
import { runDeskAgentTurn } from '../../../services/deskAgentAI';
import { flattenFileTree, findEntryByPath } from '../../../services/localFileSystem';
import { advanceRun, createRun, decideRun, runSummary } from '../../../services/desk/routines/runRoutine';
import { dueNow } from '../../../services/desk/routines/triggers';
import { beginBackgroundWork, endBackgroundWork, notify, summarize } from '../deskScheduler';

const TICK_MS = 30000;

const flatFiles = () => flattenFileTree(useDeskStore.getState().workspace?.files || []);

function fileExists(path) {
  try {
    return Boolean(findEntryByPath(useDeskStore.getState().workspace?.files || [], path));
  } catch {
    return false; // a path with ".." is never "there"
  }
}

/** The files inside a folder of the open folder, or null when there is no such folder. */
function folderFiles(folder) {
  const want = String(folder || '').replace(/\/+$/, '').toLowerCase();
  if (!want) return null;
  const walk = (list) => {
    for (const e of list || []) {
      if (e.kind === 'directory' && String(e.path || '').toLowerCase() === want) return e;
      const hit = e.children ? walk(e.children) : null;
      if (hit) return hit;
    }
    return null;
  };
  const dir = walk(useDeskStore.getState().workspace?.files || []);
  if (!dir) return null;
  return flattenFileTree(dir.children || []).map((f) => f.path).filter((p) => !/(^|\/)(KaTuro Backups|KaTuro Outputs)(\/|$)/i.test(p));
}

/** The real deps for runRoutine.js: one green card = one confirmed plan through the agent. */
export function deskDeps({ user, profile }) {
  return {
    now: () => Date.now(),
    fileExists,
    folderFiles,
    notify: (title, body) => notify(title, body),
    runTasks: async (tasks, { label, outputFolder }) => {
      const store = useDeskStore.getState();
      const plan = {
        reply: '',
        tasks: tasks.map((t) => ({ id: t.id, tool: t.tool, label: t.label || label, args: { ...t.args, ...(outputFolder ? { outputFolder } : {}) }, dependsOn: t.dependsOn || [] })),
      };
      const result = await runDeskAgentTurn({
        prompt: label,
        workspace: store.workspace,
        activeFile: null,
        activeArtifact: null,
        attachedPaths: [],
        history: [],
        user,
        profile,
        privacyMode: store.privacyMode,
        persona: store.persona,
        eSignature: store.eSignature,
        fileIndex: folderIndex,
        confirmedPlan: plan,
        autoApprove: true,
      });
      const s = useDeskStore.getState();
      if (result.artifacts?.length) s.addArtifacts(result.artifacts);
      if (result.createdFiles?.length) await s.refreshFiles();
      const steps = (result.steps || []).filter((st) => st.id !== 'plan');
      const needsInfo = /\*\*Needs your input\*\*/.test(result.content || '');
      const done = steps.length === plan.tasks.length && steps.every((st) => st.status === 'done');
      return {
        status: needsInfo ? 'needs_info' : done ? 'done' : 'error',
        summary: summarize(result.content) || (done ? 'Done' : 'It could not finish'),
        files: (result.createdFiles || []).map((f) => f.path),
      };
    },
  };
}

const say = (content) => useDeskStore.getState().addMessage({ role: 'assistant', agentId: 'katuro_assistant', content });

/** Runs a routine until it finishes or waits; saves progress after every card. → the run, or null when busy. */
async function drive(run, ctx) {
  const store = useRoutineStore.getState();
  store.upsertRun(run);
  const out = await advanceRun(run, deskDeps(ctx), (r) => useRoutineStore.getState().upsertRun(r));
  const line = runSummary(out);
  say(`**Routine** — ${line}`);
  notify(out.status === 'waiting' ? 'A routine needs your OK' : out.status === 'error' ? 'A routine could not finish' : 'A routine finished', line);
  return out;
}

/**
 * Starts a routine now (the Play button, or its When card fired).
 * → the run, or null when something else is running (try again in a moment).
 */
export async function startRoutine(routineId, { user, profile, trigger = { kind: 'manual' }, meta = null } = {}) {
  const r = useRoutineStore.getState().routines.find((x) => x.id === routineId);
  if (!r || !user) return null;
  if (r.workspaceId !== workspaceIdOf(useDeskStore.getState().workspace)) throw new Error(`Open the folder "${r.workspaceName || 'of this routine'}" first.`);
  if (!beginBackgroundWork()) return null;
  try {
    if (meta) useRoutineStore.getState().setMeta(r.id, meta);
    return await drive(createRun(r, trigger), { user, profile });
  } finally {
    endBackgroundWork();
  }
}

/** The teacher's answer to a waiting routine (KaTuroDesk or the phone). → the run, or null when busy. */
export async function answerRun(runId, approve, { user, profile, by = 'KaTuroDesk' } = {}) {
  const run = useRoutineStore.getState().runs.find((r) => r.id === runId);
  if (!run || run.status !== 'waiting') throw new Error('This routine is no longer waiting.');
  if (!user) return null;
  if (!beginBackgroundWork()) return null;
  try {
    return await drive(decideRun(run, Boolean(approve), { by }), { user, profile });
  } finally {
    endBackgroundWork();
  }
}

/** Mount once (KaTuroDeskPage): starts routines when their When card fires. */
export function useRoutineScheduler({ user, profile }) {
  const ctx = useRef({ user, profile });
  useEffect(() => {
    ctx.current = { user, profile };
  });
  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      if (cancelled) return;
      const { user: u, profile: p } = ctx.current;
      if (!u) return;
      const ws = workspaceIdOf(useDeskStore.getState().workspace);
      const { routines, meta } = useRoutineStore.getState();
      const files = flatFiles();
      for (const r of routinesFor(routines, ws)) {
        if (!r.enabled) continue;
        const due = dueNow(r, meta[r.id] || {}, { now: Date.now(), flatFiles: files });
        if (!due) continue;
        try {
          // Busy (a chat request or another task): the same files/time are due again next tick.
          await startRoutine(r.id, { user: u, profile: p, trigger: due.trigger, meta: due.meta });
        } catch (err) {
          console.warn('Routine failed:', err);
        }
        return; // one routine per tick
      }
    };
    const first = setTimeout(tick, 6000);
    const id = setInterval(tick, TICK_MS);
    return () => {
      cancelled = true;
      clearTimeout(first);
      clearInterval(id);
    };
  }, []);
}
