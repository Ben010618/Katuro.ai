import { useEffect, useMemo, useState } from 'react';
import { X, CalendarClock, Plus, Play, Pause, Pencil, Trash2, Paperclip, ChevronDown, ChevronRight, Loader2 } from 'lucide-react';
import { useDeskStore, workspaceIdOf } from '../../store/deskStore';
import {
  computeNextRun,
  describeSchedule,
  formatWhen,
  toDateInput,
  toTimeInput,
  validateSchedule,
  DAY_NAMES,
} from '../../services/desk/schedule/schedule';
import { runScheduledTask, isSchedulerBusy } from './deskScheduler';

const isElectron = typeof window !== 'undefined' && Boolean(window.katuroDeskApi?.setBackground);

const REPEAT_OPTIONS = [
  ['once', 'Once'],
  ['daily', 'Every day'],
  ['weekdays', 'Every weekday (Mon–Fri)'],
  ['weekly', 'Weekly on chosen days'],
  ['monthly', 'Monthly'],
];

const STATUS_PILL = {
  done: ['Done', 'bg-emerald-50 text-emerald-800 border-emerald-200'],
  needs_info: ['Needs your input', 'bg-amber-50 text-amber-800 border-amber-200'],
  error: ['Not finished', 'bg-red-50 text-red-700 border-red-200'],
  running: ['Running', 'bg-blue-50 text-blue-700 border-blue-200'],
};

function emptyDraft(prefill = {}) {
  const inAnHour = new Date(Date.now() + 60 * 60 * 1000);
  inAnHour.setMinutes(0, 0, 0);
  return {
    id: null,
    name: '',
    prompt: prefill.prompt || '',
    attachedPaths: prefill.attachedPaths || [],
    repeat: 'once',
    date: toDateInput(inAnHour),
    time: toTimeInput(inAnHour),
    weekdays: [inAnHour.getDay()],
    dayOfMonth: inAnHour.getDate(),
  };
}

function draftFromTask(t) {
  return {
    id: t.id,
    name: t.name,
    prompt: t.prompt,
    attachedPaths: t.attachedPaths,
    repeat: t.schedule.repeat,
    date: t.schedule.date,
    time: t.schedule.time,
    weekdays: t.schedule.weekdays || [new Date().getDay()],
    dayOfMonth: t.schedule.dayOfMonth || new Date().getDate(),
  };
}

function scheduleOf(d) {
  return {
    repeat: d.repeat,
    date: d.date,
    time: d.time,
    ...(d.repeat === 'weekly' ? { weekdays: d.weekdays } : {}),
    ...(d.repeat === 'monthly' ? { dayOfMonth: Number(d.dayOfMonth) } : {}),
  };
}

function StatusPill({ status }) {
  const [label, cls] = STATUS_PILL[status] || [];
  if (!label) return null;
  return <span className={`px-1.5 py-0.5 rounded border text-[10px] font-semibold whitespace-nowrap ${cls}`}>{label}</span>;
}

/** Where tasks run: the background options themselves are in Settings > Notifications. */
function BackgroundNote() {
  return (
    <p className="text-[11px] text-gray-500">
      {isElectron
        ? 'Tasks run while KaTuroDesk is open or running in the tray. Whether it keeps running after you close the window, and whether it starts with Windows, is set in Settings > Notifications. Tasks cannot run while the computer is off or asleep; a missed task runs once when KaTuroDesk is back.'
        : 'Tasks run while this KaTuroDesk page is open. A task that was missed while it was closed runs once when you come back.'}
    </p>
  );
}

function TaskEditor({ draft, setDraft, onCancel, onSaved, attachedNow }) {
  const { addScheduledTask, updateScheduledTask, workspace } = useDeskStore();
  const [error, setError] = useState('');
  const schedule = scheduleOf(draft);
  const problems = validateSchedule(schedule, { isNew: !draft.id });
  const next = problems.length ? null : computeNextRun(schedule);
  const patch = (p) => setDraft((d) => ({ ...d, ...p }));

  const save = () => {
    setError('');
    try {
      const input = { name: draft.name, prompt: draft.prompt, attachedPaths: draft.attachedPaths, schedule };
      if (draft.id) updateScheduledTask(draft.id, input);
      else {
        addScheduledTask(input);
        if (!isElectron && typeof Notification !== 'undefined' && Notification.permission === 'default') {
          Notification.requestPermission().catch(() => {});
        }
      }
      onSaved();
    } catch (e) {
      setError(e.message);
    }
  };

  const inputCls = 'w-full px-2.5 py-1.5 text-xs border border-gray-300 rounded-lg focus:outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 bg-white';
  const labelCls = 'block text-[11px] font-semibold text-gray-700 mb-1';
  const addable = attachedNow.filter((p) => !draft.attachedPaths.includes(p));

  return (
    <div className="space-y-3">
      <div>
        <label className={labelCls} htmlFor="task-prompt">What should KaTuro do?</label>
        <textarea
          id="task-prompt"
          rows={3}
          value={draft.prompt}
          onChange={(e) => patch({ prompt: e.target.value })}
          placeholder="e.g. Check the attached SF2 for learners with 3 or more consecutive absences and prepare home visitation notices."
          className={`${inputCls} resize-none`}
        />
      </div>
      <div>
        <label className={labelCls} htmlFor="task-name">Task name <span className="font-normal text-gray-400">(optional)</span></label>
        <input id="task-name" value={draft.name} onChange={(e) => patch({ name: e.target.value })} placeholder="e.g. Friday attendance check" className={inputCls} />
      </div>

      <div>
        <span className={labelCls}>Files <span className="font-normal text-gray-400">(from {workspace?.name || 'your folder'})</span></span>
        <div className="flex flex-wrap gap-1.5">
          {draft.attachedPaths.map((p) => (
            <span key={p} title={p} className="pl-2 pr-1 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-[11px] text-emerald-900 flex items-center gap-1 max-w-[260px]">
              <Paperclip size={10} className="flex-shrink-0" />
              <span className="truncate">{p.split('/').pop()}</span>
              <button onClick={() => patch({ attachedPaths: draft.attachedPaths.filter((x) => x !== p) })} className="p-0.5 hover:bg-emerald-100 rounded-full" title="Remove">
                <X size={10} />
              </button>
            </span>
          ))}
          {addable.length > 0 && (
            <button onClick={() => patch({ attachedPaths: [...draft.attachedPaths, ...addable] })} className="px-2 py-0.5 rounded-full border border-dashed border-gray-300 text-[11px] text-gray-600 hover:border-emerald-400 hover:text-emerald-800">
              Add the {addable.length} file{addable.length > 1 ? 's' : ''} ticked in the explorer
            </button>
          )}
          {!draft.attachedPaths.length && !addable.length && (
            <span className="text-[11px] text-gray-400">No files. Tick files in the explorer first if the task needs them.</span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <label className={labelCls} htmlFor="task-repeat">Repeat</label>
          <select id="task-repeat" value={draft.repeat} onChange={(e) => patch({ repeat: e.target.value })} className={inputCls}>
            {REPEAT_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
        <div>
          <label className={labelCls} htmlFor="task-date">{draft.repeat === 'once' ? 'Date' : 'Starting'}</label>
          <input id="task-date" type="date" value={draft.date} onChange={(e) => patch({ date: e.target.value })} className={inputCls} />
        </div>
        <div>
          <label className={labelCls} htmlFor="task-time">Time</label>
          <input id="task-time" type="time" value={draft.time} onChange={(e) => patch({ time: e.target.value })} className={inputCls} />
        </div>
      </div>

      {draft.repeat === 'weekly' && (
        <div>
          <span className={labelCls}>On these days</span>
          <div className="flex flex-wrap gap-1">
            {DAY_NAMES.map((n, i) => {
              const on = draft.weekdays.includes(i);
              return (
                <button
                  key={n}
                  aria-pressed={on}
                  onClick={() => patch({ weekdays: on ? draft.weekdays.filter((d) => d !== i) : [...draft.weekdays, i] })}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-semibold border transition ${on ? 'bg-[#2d6a4f] text-white border-[#2d6a4f]' : 'bg-white text-gray-600 border-gray-300 hover:border-emerald-400'}`}
                >
                  {n.slice(0, 3)}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {draft.repeat === 'monthly' && (
        <div className="max-w-[200px]">
          <label className={labelCls} htmlFor="task-dom">Day of the month</label>
          <input id="task-dom" type="number" min={1} max={31} value={draft.dayOfMonth} onChange={(e) => patch({ dayOfMonth: Number(e.target.value) })} className={inputCls} />
          <p className="text-[10px] text-gray-400 mt-0.5">Short months use their last day.</p>
        </div>
      )}

      <div className="rounded-lg bg-[#f6f8f7] border border-gray-200 px-3 py-2 text-[11px]">
        {problems.length ? (
          <span className="text-amber-800">{problems[0]}</span>
        ) : (
          <span className="text-gray-700">
            <span className="font-semibold">{describeSchedule(schedule)}</span>
            {next ? <> · Next run: {formatWhen(next)}</> : ' · No upcoming run'}
          </span>
        )}
      </div>

      {error && <p className="text-[11px] text-red-600">{error}</p>}
      <div className="flex justify-end gap-2">
        <button onClick={onCancel} className="px-3 py-1.5 rounded-lg border border-gray-300 text-xs font-semibold text-gray-700 hover:bg-gray-50">Cancel</button>
        <button onClick={save} disabled={!draft.prompt.trim() || problems.length > 0} className="px-4 py-1.5 rounded-lg bg-[#2d6a4f] hover:bg-[#235841] text-white text-xs font-semibold disabled:opacity-40 disabled:cursor-not-allowed">
          {draft.id ? 'Save changes' : 'Schedule task'}
        </button>
      </div>
    </div>
  );
}

function TaskRow({ task, folderOpen, onEdit, user, profile, onOpenCanvas, now }) {
  const { updateScheduledTask, deleteScheduledTask, isGenerating } = useDeskStore();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [error, setError] = useState('');
  const isRunning = task.lastStatus === 'running';
  const waiting = task.enabled && task.nextRunAt && task.nextRunAt <= now && !folderOpen;

  const runNow = async () => {
    setError('');
    try {
      const res = await runScheduledTask(task.id, { user, profile, manual: true, onOpenCanvas });
      if (!res) setError('Another request is still running. Try again when it finishes.');
    } catch (e) {
      setError(e.message);
    }
  };

  const toggle = () => {
    setError('');
    try {
      updateScheduledTask(task.id, { enabled: !task.enabled });
    } catch (e) {
      setError(e.message);
    }
  };

  let nextText;
  if (isRunning) nextText = 'Running now…';
  else if (waiting) nextText = `Waiting: open the folder "${task.workspaceName}" to run it`;
  else if (task.enabled && task.nextRunAt) nextText = `Next run: ${formatWhen(task.nextRunAt)}`;
  else if (!task.nextRunAt) nextText = 'Finished. Edit it to set a new time.';
  else nextText = 'Paused';

  return (
    <li className={`rounded-xl border p-3 ${task.enabled ? 'border-gray-200 bg-white' : 'border-gray-200 bg-gray-50'}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <p className={`text-xs font-bold truncate ${task.enabled ? 'text-gray-900' : 'text-gray-500'}`}>{task.name}</p>
            <StatusPill status={task.lastStatus} />
          </div>
          <p className="text-[11px] text-gray-600">{describeSchedule(task.schedule)}{!folderOpen && task.workspaceName ? ` · Folder: ${task.workspaceName}` : ''}</p>
          <p className={`text-[11px] ${waiting ? 'text-amber-700' : 'text-gray-500'}`}>{nextText}</p>
          {task.attachedPaths.length > 0 && (
            <p className="text-[10px] text-gray-400 truncate" title={task.attachedPaths.join('\n')}>
              Files: {task.attachedPaths.map((p) => p.split('/').pop()).join(', ')}
            </p>
          )}
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <button onClick={runNow} disabled={!folderOpen || isRunning || isGenerating || isSchedulerBusy()} title={folderOpen ? 'Run now' : `Open the folder "${task.workspaceName}" to run it`} className="p-1.5 rounded-md text-gray-500 hover:text-emerald-700 hover:bg-emerald-50 disabled:opacity-30 disabled:hover:bg-transparent">
            {isRunning ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
          </button>
          <button onClick={toggle} disabled={isRunning} title={task.enabled ? 'Pause' : 'Resume'} className="p-1.5 rounded-md text-gray-500 hover:text-gray-800 hover:bg-gray-100 disabled:opacity-30">
            {task.enabled ? <Pause size={14} /> : <CalendarClock size={14} />}
          </button>
          <button onClick={onEdit} disabled={isRunning} title="Edit" className="p-1.5 rounded-md text-gray-500 hover:text-gray-800 hover:bg-gray-100 disabled:opacity-30">
            <Pencil size={14} />
          </button>
          {confirmDelete ? (
            <span className="flex items-center gap-1 ml-1">
              <button onClick={() => deleteScheduledTask(task.id)} className="px-2 py-1 rounded-md bg-red-600 text-white text-[10px] font-semibold">Delete</button>
              <button onClick={() => setConfirmDelete(false)} className="px-2 py-1 rounded-md border border-gray-300 text-[10px] font-semibold text-gray-600">Keep</button>
            </span>
          ) : (
            <button onClick={() => setConfirmDelete(true)} disabled={isRunning} title="Delete" className="p-1.5 rounded-md text-gray-500 hover:text-red-600 hover:bg-red-50 disabled:opacity-30">
              <Trash2 size={14} />
            </button>
          )}
        </div>
      </div>
      {error && <p className="mt-1 text-[11px] text-red-600">{error}</p>}
      {task.runs?.length > 0 && (
        <div className="mt-2 border-t border-gray-100 pt-1.5">
          <button onClick={() => setShowHistory(!showHistory)} className="flex items-center gap-1 text-[11px] font-semibold text-gray-500 hover:text-gray-800">
            {showHistory ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            Last run: {formatWhen(task.runs[0].at)}
          </button>
          {showHistory && (
            <ul className="mt-1.5 space-y-1.5">
              {task.runs.map((r) => (
                <li key={r.at} className="text-[11px] text-gray-600">
                  <div className="flex items-center gap-1.5">
                    <StatusPill status={r.status} />
                    <span className="text-gray-500">{formatWhen(r.at)}{r.late ? ` (missed ${formatWhen(r.scheduledFor)}; ran when KaTuroDesk was back)` : ''}</span>
                  </div>
                  {r.summary && <p className="mt-0.5 text-gray-600 line-clamp-3">{r.summary}</p>}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </li>
  );
}

/** Scheduled tasks: list, create/edit, run now, pause, delete, background mode. */
// Rendered only while open, so every opening starts fresh.
export default function DeskScheduleModal({ onClose, prefill = null, user, profile, onOpenCanvas }) {
  const { scheduledTasks, workspace, attachedPaths } = useDeskStore();
  // Opening from the chat's "Schedule" button starts a new task with that request and files.
  const [draft, setDraft] = useState(() => (prefill ? emptyDraft(prefill) : null));
  const currentId = workspaceIdOf(workspace);
  // Re-render twice a minute so "next run" and "waiting" texts stay current.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose?.();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const sorted = useMemo(
    () => [...scheduledTasks].sort((a, b) => (b.enabled - a.enabled) || ((a.nextRunAt || Infinity) - (b.nextRunAt || Infinity))),
    [scheduledTasks],
  );

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="desk-schedule-title"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-2xl bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
      >
        <div className="px-5 py-3 border-b border-gray-200 flex items-center justify-between bg-[#f6f8f7]">
          <h2 id="desk-schedule-title" className="text-sm font-bold text-gray-900 flex items-center gap-2">
            <CalendarClock size={15} className="text-emerald-700" /> Scheduled tasks
          </h2>
          <button onClick={onClose} title="Close" className="p-1 rounded hover:bg-gray-200 text-gray-500">
            <X size={16} />
          </button>
        </div>

        <div className="p-5 overflow-y-auto space-y-4">
          {draft ? (
            <TaskEditor
              draft={draft}
              setDraft={setDraft}
              attachedNow={attachedPaths}
              onCancel={() => setDraft(null)}
              onSaved={() => {
                if (!draft.id) prefill?.onSaved?.();
                setDraft(null);
              }}
            />
          ) : (
            <>
              <div className="flex items-start justify-between gap-3">
                <p className="text-[11px] text-gray-500">
                  Set a request to run automatically at a date and time, once or on repeat. Results are saved to KaTuro Outputs and appear in the chat, and you get a notification.
                </p>
                <button
                  onClick={() => setDraft(emptyDraft())}
                  disabled={!workspace?.handle}
                  title={workspace?.handle ? 'New scheduled task' : 'Open your classroom folder first'}
                  className="px-3 py-1.5 rounded-lg bg-[#2d6a4f] hover:bg-[#235841] text-white text-xs font-semibold flex items-center gap-1 flex-shrink-0 disabled:opacity-40"
                >
                  <Plus size={13} /> New task
                </button>
              </div>

              {sorted.length ? (
                <ul className="space-y-2">
                  {sorted.map((t) => (
                    <TaskRow
                      key={t.id}
                      task={t}
                      folderOpen={t.workspaceId === currentId}
                      onEdit={() => setDraft(draftFromTask(t))}
                      user={user}
                      profile={profile}
                      onOpenCanvas={onOpenCanvas}
                      now={now}
                    />
                  ))}
                </ul>
              ) : (
                <div className="rounded-xl border border-dashed border-gray-300 p-6 text-center">
                  <p className="text-xs font-semibold text-gray-700">No scheduled tasks yet</p>
                  <p className="text-[11px] text-gray-500 mt-1">Examples: every Friday 4:00 PM, check attendance and prepare SARDO notices; on the 1st of each month, summarize last month's scores.</p>
                </div>
              )}

              <section className="border-t border-gray-100 pt-4">
                <h3 className="text-xs font-bold text-gray-800 mb-2">When tasks run</h3>
                <BackgroundNote />
              </section>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
