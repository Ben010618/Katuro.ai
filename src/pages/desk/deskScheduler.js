/**
 * deskScheduler.js — runs scheduled tasks when their time comes.
 *
 * Every few seconds it looks for a due task of the folder that is open now and runs it
 * through the same chat turn a teacher would send (so outputs, privacy and persona are
 * identical). Only one task runs at a time, and never while the teacher's own request is
 * still running. Missed runs (app closed / PC asleep) happen once when KaTuroDesk is back.
 */
import { useEffect, useRef } from 'react';
import { useDeskStore, workspaceIdOf } from '../../store/deskStore';
import { findEntryByPath } from '../../services/localFileSystem';
import { dueTasks, startRun, finishRun } from '../../services/desk/schedule/schedule';
import { runChatTurn } from './runChatTurn';

const TICK_MS = 15000;
let running = false; // module-wide: the chat "Run now" button and the timer share one lock

export function isSchedulerBusy() {
  return running;
}

/** Plain-text one-liner of an agent reply for the task history and the notification. */
function summarize(content) {
  return String(content || '')
    .replace(/\*\*/g, '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 3)
    .join(' ')
    .slice(0, 300);
}

function notify(title, body) {
  try {
    const api = typeof window !== 'undefined' ? window.katuroDeskApi : undefined;
    if (api?.notify) {
      api.notify(title, body).catch(() => {});
      return;
    }
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      new Notification(title, { body });
    }
  } catch {
    // Notifications are a convenience; the result is always in the chat and task history.
  }
}

const STATUS_TITLE = {
  done: 'Scheduled task finished',
  needs_info: 'Scheduled task needs your input',
  error: 'Scheduled task could not finish',
};

/**
 * Runs one task now. `manual` = the teacher pressed "Run now" (the schedule is not moved).
 * Returns the finished task, or null when something else is already running.
 */
export async function runScheduledTask(taskId, { user, profile, manual = false, onOpenCanvas } = {}) {
  const store = useDeskStore.getState();
  const task = store.scheduledTasks.find((t) => t.id === taskId);
  if (!task || running || store.isGenerating || !user) return null;
  if (task.workspaceId !== workspaceIdOf(store.workspace)) {
    throw new Error(`Open the folder "${task.workspaceName || 'of this task'}" first.`);
  }
  running = true;
  const startedAt = Date.now();
  try {
    store.replaceScheduledTask(taskId, (t) => (manual ? { ...t, lastStatus: 'running', scheduledFor: null } : startRun(t, startedAt)));

    // Never run on assumptions: if a file the task needs is gone, stop and say which.
    const files = useDeskStore.getState().workspace?.files || [];
    const missing = task.attachedPaths.filter((p) => !findEntryByPath(files, p));
    let outcome;
    if (missing.length) {
      const content = `Scheduled task "${task.name}" did not run because ${missing.length === 1 ? 'this file was' : 'these files were'} not found in your folder: ${missing.join(', ')}. Please check the task's files.`;
      useDeskStore.getState().addMessage({ role: 'assistant', agentId: 'katuro_assistant', content });
      outcome = { status: 'error', content, files: [] };
    } else {
      outcome = await runChatTurn({
        text: task.prompt,
        attachments: task.attachedPaths,
        user,
        profile,
        scheduled: { id: task.id, name: task.name },
        onOpenCanvas,
      });
    }

    const summary = summarize(outcome.content);
    useDeskStore.getState().replaceScheduledTask(taskId, (t) => finishRun(t, { status: outcome.status, summary, startedAt, files: outcome.files }));
    notify(`${STATUS_TITLE[outcome.status] || STATUS_TITLE.done}: ${task.name}`, summary);
    return useDeskStore.getState().scheduledTasks.find((t) => t.id === taskId) || null;
  } catch (err) {
    useDeskStore.getState().replaceScheduledTask(taskId, (t) => finishRun(t, { status: 'error', summary: err.message || 'Unknown error', startedAt }));
    throw err;
  } finally {
    running = false;
  }
}

/** Mount once (KaTuroDeskPage). Checks for due tasks every 15 s and right after start-up. */
export function useDeskScheduler({ user, profile, onOpenCanvas }) {
  const ctx = useRef({ user, profile, onOpenCanvas });
  useEffect(() => {
    ctx.current = { user, profile, onOpenCanvas };
  });

  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      if (cancelled || running) return;
      const { user: u, profile: p, onOpenCanvas: open } = ctx.current;
      const s = useDeskStore.getState();
      if (!u || s.isGenerating) return;
      const [task] = dueTasks(s.scheduledTasks, Date.now(), workspaceIdOf(s.workspace));
      if (!task) return;
      try {
        await runScheduledTask(task.id, { user: u, profile: p, onOpenCanvas: open });
      } catch (err) {
        console.warn('Scheduled task failed:', err);
      }
    };
    const first = setTimeout(tick, 4000); // let the last folder reopen first
    const id = setInterval(tick, TICK_MS);
    return () => {
      cancelled = true;
      clearTimeout(first);
      clearInterval(id);
    };
  }, []);
}
