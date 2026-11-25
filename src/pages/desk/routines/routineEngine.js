/**
 * routineEngine.js — runs KaTuro Routines inside KaTuroDesk (services/desk/routines/runRoutine.js
 * does the card logic; this file connects it to the real agent, files, chat and notices).
 *
 * Every green card runs through runDeskAgentTurn with a confirmed plan (no AI call to plan, the
 * same tool code, path checks, backups, privacy masking and records rules as a chat request).
 * One thing at a time: routines share the scheduler's lock with scheduled tasks, never start
 * while the teacher's own request runs, and the chat waits (isGenerating) while a card runs.
 * A run belongs to the folder it started in: if another folder is opened, it stops.
 */
import { useEffect, useRef } from 'react';
import { useDeskStore, workspaceIdOf, folderIndex } from '../../../store/deskStore';
import { useRoutineStore, routinesFor } from '../../../store/routineStore';
import { runDeskAgentTurn } from '../../../services/deskAgentAI';
import { flattenFileTree, findEntryByPath, readDirectoryRecursively } from '../../../services/localFileSystem';
import { SYSTEM_DIRS } from '../../../services/desk/systemFolders';
import { advanceRun, createRun, decideRun, runSummary } from '../../../services/desk/routines/runRoutine';
import { dueNow, markSeen, watchedFolder } from '../../../services/desk/routines/triggers';
import { beginBackgroundWork, endBackgroundWork, notify, summarize } from '../deskScheduler';

const TICK_MS = 30000;

const tree = () => useDeskStore.getState().workspace?.files || [];

function fileExists(path) {
  try {
    return Boolean(findEntryByPath(tree(), path));
  } catch {
    return false; // a path with ".." is never "there"
  }
}

function findDir(list, want) {
  for (const e of list || []) {
    if (e.kind === 'directory' && String(e.path || '').toLowerCase() === want) return e;
    const hit = e.children ? findDir(e.children, want) : null;
    if (hit) return hit;
  }
  return null;
}

/** The files inside a folder of the open folder, or null when there is no such folder. */
function folderFiles(folder) {
  const want = String(folder || '').replace(/\/+$/, '').toLowerCase();
  const dir = want ? findDir(tree(), want) : null;
  if (!dir) return null;
  return flattenFileTree(dir.children || []).map((f) => f.path).filter((p) => !SYSTEM_DIRS.test(p));
}

/**
 * The files of a watched folder as they are on disk NOW (files copied in with Windows Explorer or
 * a scanner are seen, not only ones KaTuroDesk made). Only that folder is read.
 * → [{ path, size, lastModified }] (paths inside the open folder)
 */
async function listFolderNow(folder) {
  const ws = useDeskStore.getState().workspace;
  const handle = ws?.handle;
  if (handle?.kind === 'electron' && handle.rootPath) {
    const sub = await readDirectoryRecursively({ kind: 'electron', rootPath: `${handle.rootPath}/${folder}` });
    return flattenFileTree(sub).map((f) => ({ path: `${folder}/${f.path}`, size: f.size, lastModified: f.lastModified }));
  }
  if (handle?.isVirtual && handle.getFiles) return flattenFileTree(handle.getFiles());
  return flattenFileTree(tree()); // a browser folder: as last read
}

/** The real deps for runRoutine.js: one green card = one confirmed plan through the agent. */
export function deskDeps({ user, profile, workspaceId }) {
  let inflight = Promise.resolve();
  return {
    now: () => Date.now(),
    fileExists,
    folderFiles,
    stillHere: () => workspaceIdOf(useDeskStore.getState().workspace) === workspaceId,
    notify: (title, body) => notify(title, body),
    /** Resolves when the last card's work has really ended (also after a card timed out). */
    idle: () => inflight.catch(() => {}),
    runTasks: async (tasks, { label, outputFolder }) => {
      const store = useDeskStore.getState();
      const plan = {
        reply: '',
        tasks: tasks.map((t) => ({ id: t.id, tool: t.tool, label: t.label || label, args: { ...t.args, ...(outputFolder ? { outputFolder } : {}) }, dependsOn: t.dependsOn || [] })),
      };
      store.setIsGenerating(true); // the chat waits while a card runs
      const work = runDeskAgentTurn({
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
      }).finally(() => useDeskStore.getState().setIsGenerating(false));
      inflight = work;
      const result = await work;
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
const routineOf = (id) => useRoutineStore.getState().routines.find((x) => x.id === id) || null;
const currentWs = () => workspaceIdOf(useDeskStore.getState().workspace);

/**
 * Runs a routine until it finishes or waits; saves progress after every card. The caller holds
 * the lock; it is kept until the card's work has really ended (even after a time-out).
 */
async function drive(run, ctx) {
  const deps = deskDeps(ctx);
  useRoutineStore.getState().upsertRun(run);
  let out;
  try {
    out = await advanceRun(run, deps, (r) => useRoutineStore.getState().upsertRun(r));
  } finally {
    await deps.idle();
  }
  // Files this run made or changed never start a "new files" routine again.
  const r = routineOf(run.routineId);
  const watch = r ? watchedFolder(r).toLowerCase() : '';
  if (watch) {
    const made = Object.values(out.steps).flatMap((st) => st.files || []).filter((p) => p.toLowerCase().startsWith(`${watch}/`));
    if (made.length) useRoutineStore.getState().setMeta(r.id, markSeen(useRoutineStore.getState().meta[r.id] || {}, made));
  }
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
  const r = routineOf(routineId);
  if (!r || !user) return null;
  if (r.workspaceId !== currentWs()) throw new Error(`Open the folder "${r.workspaceName || 'of this routine'}" first.`);
  if (!beginBackgroundWork()) return null;
  try {
    if (meta) useRoutineStore.getState().setMeta(r.id, meta);
    // New files are read from disk first, so the agent finds them in the folder.
    if (trigger.files?.length) await useDeskStore.getState().refreshFiles();
    return await drive(createRun(r, trigger), { user, profile, workspaceId: r.workspaceId });
  } finally {
    endBackgroundWork();
  }
}

/** The run, checked: still waiting, its routine still there, its folder open. */
function waitingRun(runId) {
  const run = useRoutineStore.getState().runs.find((r) => r.id === runId);
  if (!run || run.status !== 'waiting') throw new Error('This routine is no longer waiting.');
  const r = routineOf(run.routineId);
  if (!r) throw new Error('This routine was deleted.');
  if (r.workspaceId !== currentWs()) throw new Error(`Open the folder "${r.workspaceName || 'of this routine'}" on KaTuroDesk first.`);
  return { run, routine: r };
}

/** The teacher's answer on KaTuroDesk: runs the rest now. → the run, or null when busy. */
export async function answerRun(runId, approve, { user, profile, by = 'KaTuroDesk' } = {}) {
  const { run, routine } = waitingRun(runId);
  if (!user) return null;
  if (!beginBackgroundWork()) return null;
  try {
    return await drive(decideRun(run, Boolean(approve), { by }), { user, profile, workspaceId: routine.workspaceId });
  } finally {
    endBackgroundWork();
  }
}

/**
 * The teacher's answer from the phone: recorded at once and answered right away (the phone does
 * not wait for the rest of the routine; KaTuroDesk goes on by itself and tells the chat).
 * → { status, summary }, or null when busy.
 */
export function answerRunFromPhone(runId, approve, { user, profile, by = 'KaTuro App' } = {}) {
  const { run, routine } = waitingRun(runId);
  if (!user) return null;
  if (!beginBackgroundWork()) return null;
  const decided = decideRun(run, Boolean(approve), { by });
  useRoutineStore.getState().upsertRun(decided); // no longer waiting: a second answer is refused
  drive(decided, { user, profile, workspaceId: routine.workspaceId })
    .catch((err) => console.warn('Routine failed:', err))
    .finally(() => endBackgroundWork());
  return { status: 'running', summary: approve ? 'Approved. KaTuroDesk is going on.' : 'Not approved: KaTuroDesk will do nothing after it.' };
}

/** Mount once (KaTuroDeskPage): starts routines when their When card fires. */
export function useRoutineScheduler({ user, profile }) {
  const ctx = useRef({ user, profile });
  useEffect(() => {
    ctx.current = { user, profile };
  });
  useEffect(() => {
    let cancelled = false;
    let ticking = false;
    const tick = async () => {
      if (cancelled || ticking) return;
      const { user: u, profile: p } = ctx.current;
      if (!u) return;
      ticking = true;
      try {
        const ws = currentWs();
        for (const r of routinesFor(useRoutineStore.getState().routines, ws)) {
          if (!r.enabled) continue;
          const folder = watchedFolder(r);
          let files = [];
          if (folder) {
            try {
              files = await listFolderNow(folder);
            } catch {
              continue; // the folder is gone or cannot be read: nothing new
            }
          }
          const due = dueNow(r, useRoutineStore.getState().meta[r.id] || {}, { now: Date.now(), flatFiles: files });
          if (!due) continue;
          if (!due.trigger) {
            useRoutineStore.getState().setMeta(r.id, due.meta); // new files still settling
            continue;
          }
          try {
            // Busy (a chat request or another task): the same files/time are due again next tick.
            await startRoutine(r.id, { user: u, profile: p, trigger: due.trigger, meta: due.meta });
          } catch (err) {
            console.warn('Routine failed:', err);
          }
          return; // one routine per tick
        }
      } finally {
        ticking = false;
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
