/**
 * runRoutine.js — runs a KaTuro Routine card by card (no UI; the Desk passes in `deps`).
 *
 * A run keeps a COPY of the routine it started with, so editing the routine never changes a run
 * that is waiting for the teacher. Cards run in order from the When card; what a card makes
 * (its files) flows to the cards after it. A green card runs its KaTuroDesk tool(s) exactly as a
 * chat request does (deps.runTasks → the agent's confirmed-plan path: the same path checks,
 * backups, privacy masking and records rules). "Ask me first" stops the run until the teacher
 * decides (decide()); a "no" skips everything after that card. A failed card skips only the
 * cards after it.
 *
 * deps: {
 *   runTasks(tasks, { label, outputFolder }) → Promise<{ status: 'done'|'error'|'needs_info', summary, files: [path] }>
 *   fileExists(path) → boolean
 *   folderFiles(folder) → [path] | null (null: no such folder)
 *   notify(title, body)
 *   now() → ms
 * }
 */

import { cardDef, say } from './catalog.js';
import { checkRoutine, cleanRoutine, downstreamOf, newId, runOrder } from './routine.js';

export const CARD_TIMEOUT_MS = 20 * 60 * 1000; // one card never keeps a routine busy longer
const OK = new Set(['done', 'approved']);
const STOPPED = new Set(['error', 'needs_info', 'skipped', 'rejected']);

const clip = (s, n = 300) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);

function withTimeout(promise, ms) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('This card took too long and was stopped.')), ms); }),
  ]).finally(() => clearTimeout(timer));
}

/** A new run of a routine (not started yet). trigger: { kind, at?, files?, title? } */
export function createRun(routine, trigger = { kind: 'manual' }, now = Date.now()) {
  const { routine: copy } = cleanRoutine(routine);
  return {
    id: newId('run'),
    routineId: copy.id,
    routineName: copy.name,
    routine: copy,
    trigger: {
      kind: String(trigger.kind || 'manual'),
      ...(trigger.title ? { title: clip(trigger.title, 120) } : {}),
      ...(Array.isArray(trigger.files) ? { files: trigger.files.slice(0, 40).map(String) } : {}),
    },
    status: 'running',
    startedAt: now,
    finishedAt: null,
    steps: Object.fromEntries(copy.cards.map((c) => [c.id, { status: 'pending' }])),
    outputs: {},
    waiting: null,
  };
}

const parentOf = (routine, cardId) => routine.wires.find((w) => w.to === cardId)?.from || null;

/** The folder a "Save in a folder" card right after this card asks for, or ''. */
function saveFolderAfter(routine, cardId) {
  const byId = new Map(routine.cards.map((c) => [c.id, c]));
  for (const w of routine.wires) {
    const next = w.from === cardId ? byId.get(w.to) : null;
    if (next?.type === 'save.folder' && next.settings?.folder) return next.settings.folder;
  }
  return '';
}

/** One card's step → the run with it updated (immutable). */
const setStep = (run, cardId, step) => ({ ...run, steps: { ...run.steps, [cardId]: step } });

/**
 * Runs the routine from where it is until it finishes or waits for the teacher.
 * onChange(run) is called after every card (to show the lights and save progress).
 * → the run (status 'done' | 'waiting' | 'error')
 */
export async function advanceRun(input, deps, onChange = () => {}) {
  let run = { ...input, status: 'running' };
  const routine = run.routine;
  const now = () => (deps.now ? deps.now() : Date.now());

  const problems = checkRoutine(routine);
  if (problems.length) {
    run = { ...run, status: 'error', finishedAt: now(), problem: problems.map((p) => p.text).join(' ') };
    onChange(run);
    return run;
  }

  for (const card of runOrder(routine)) {
    const step = run.steps[card.id] || { status: 'pending' };
    if (step.status !== 'pending') continue;
    const def = cardDef(card.type);
    const parent = parentOf(routine, card.id);
    const parentStep = parent ? run.steps[parent] : null;

    if (parent && (!parentStep || STOPPED.has(parentStep.status))) {
      run = setStep(run, card.id, { status: 'skipped', summary: 'Skipped because the card before it did not finish.' });
      onChange(run);
      continue;
    }
    if (parent && !OK.has(parentStep.status)) continue; // still waiting (cannot happen: we stop at Ask)

    const input = parent ? run.outputs[parent] || null : null;
    run = setStep(run, card.id, { status: 'running', startedAt: now() });
    onChange(run);

    let result;
    try {
      result = await runCard(card, def, input, run, deps);
    } catch (err) {
      result = { status: 'error', summary: clip(err?.message || err) || 'This card could not finish.' };
    }

    if (result.status === 'waiting') {
      run = setStep(run, card.id, { status: 'waiting', summary: result.summary, startedAt: run.steps[card.id].startedAt });
      run = { ...run, status: 'waiting', waiting: { cardId: card.id, note: result.note || '', askedAt: now(), preview: result.preview || [] } };
      onChange(run);
      return run;
    }
    run = setStep(run, card.id, { status: result.status, summary: clip(result.summary), files: (result.files || []).slice(0, 40), startedAt: run.steps[card.id].startedAt, finishedAt: now() });
    if (result.output) run = { ...run, outputs: { ...run.outputs, [card.id]: result.output } };
    onChange(run);
  }

  const failed = Object.values(run.steps).some((s) => s.status === 'error' || s.status === 'needs_info');
  run = { ...run, status: failed ? 'error' : 'done', finishedAt: now(), waiting: null };
  onChange(run);
  return run;
}

/** Runs one card. → { status, summary, files?, output?, note?, preview? } */
async function runCard(card, def, input, run, deps) {
  const s = card.settings || {};
  switch (def.kind) {
    case 'when':
      return run.trigger.files?.length
        ? { status: 'done', summary: `${run.trigger.files.length} new file(s)`, output: { plug: 'folder', paths: run.trigger.files } }
        : { status: 'done', summary: run.trigger.title ? `Started for ${run.trigger.title}` : 'Started', output: { plug: def.gives } };

    case 'get': {
      if (card.type === 'get.folder') {
        const files = deps.folderFiles(s.folder);
        if (!files) return { status: 'error', summary: `The folder "${s.folder}" is not in your KaTuro folder any more.` };
        return { status: 'done', summary: `${files.length} file(s) in ${s.folder}`, output: { plug: 'folder', folder: s.folder, paths: files.slice(0, 200) } };
      }
      if (!deps.fileExists(s.path)) return { status: 'error', summary: `"${s.path}" is not in your KaTuro folder any more.` };
      return { status: 'done', summary: s.path.split('/').pop(), output: { plug: def.gives, paths: [s.path] } };
    }

    case 'do': {
      if (def.needsFiles && !(input?.paths || []).length) return { status: 'error', summary: 'There were no files to work on.' };
      // Every green card except one that starts from nothing (a DLL) needs a file or folder.
      if (!def.accepts.includes('start') && !input?.paths?.length && !input?.folder) return { status: 'error', summary: 'The card before it gave no file to work on.' };
      const tasks = def.toTasks(s, input).map((t, i) => ({ id: t.id || `t${i + 1}`, tool: t.tool, args: t.args, dependsOn: t.dependsOn || [], label: say(def.label) }));
      const outputFolder = saveFolderAfter(run.routine, card.id);
      const res = await withTimeout(deps.runTasks(tasks, { label: say(def.label), outputFolder }), CARD_TIMEOUT_MS);
      const files = res.files || [];
      if (res.status !== 'done') return { status: res.status === 'needs_info' ? 'needs_info' : 'error', summary: res.summary, files };
      let output;
      if (def.passThrough) output = input;
      else if (def.outputPaths) output = { plug: def.gives, paths: def.outputPaths(s).filter(Boolean) };
      else output = { plug: def.gives, paths: files.filter((p) => (def.keep ? def.keep.test(p) : true)) };
      return { status: 'done', summary: res.summary, files, output };
    }

    case 'ask': {
      const before = parentOf(run.routine, card.id);
      const step = before ? run.steps[before] : null;
      const preview = [
        ...(step?.summary ? [clip(step.summary, 400)] : []),
        ...((input?.paths || []).slice(0, 8)),
      ];
      return { status: 'waiting', summary: 'Waiting for your OK', note: clip(s.note, 300), preview };
    }

    case 'save': {
      if (card.type === 'save.folder') return { status: 'done', summary: `Saved in ${s.folder}` };
      if (card.type === 'save.notify') {
        const done = Object.values(run.steps).filter((x) => x.status === 'done' && x.summary).map((x) => x.summary);
        const body = clip(s.message || done.slice(-2).join(' · ') || 'Done', 280);
        try { deps.notify?.(`Routine: ${run.routineName}`, body); } catch { /* a notice is a convenience */ }
        return { status: 'done', summary: 'You were told on this computer' };
      }
      return { status: 'error', summary: 'Unknown card.' };
    }
    default:
      return { status: 'error', summary: 'Unknown card.' };
  }
}

/**
 * The teacher's answer to "Ask me first". approve=true lets the run go on (advanceRun again);
 * false ends that branch: every card after the Ask card is skipped.
 * → the run (status 'running', ready for advanceRun), or the same run when nothing waits.
 */
export function decideRun(run, approve, { now = Date.now(), by = 'desk' } = {}) {
  const cardId = run?.waiting?.cardId;
  if (!cardId || run.status !== 'waiting') return run;
  const parent = parentOf(run.routine, cardId);
  let next = setStep(run, cardId, { ...run.steps[cardId], status: approve ? 'approved' : 'rejected', summary: approve ? `Approved (${by})` : `Not approved (${by})`, finishedAt: now });
  if (approve) next = { ...next, outputs: { ...next.outputs, [cardId]: parent ? next.outputs[parent] : null } };
  else {
    for (const id of downstreamOf(run.routine, cardId)) {
      if (next.steps[id]?.status === 'pending') next = setStep(next, id, { status: 'skipped', summary: 'Skipped: you did not approve.' });
    }
  }
  return { ...next, status: 'running', waiting: null };
}

/** A run that was running when KaTuroDesk closed is shown as stopped (never stuck "running"). */
export function recoverRun(run) {
  if (run?.status !== 'running') return run;
  const steps = Object.fromEntries(Object.entries(run.steps || {}).map(([id, s]) => [id, s.status === 'running' ? { ...s, status: 'error', summary: 'KaTuroDesk was closed while this card ran. Run the routine again.' } : s]));
  return { ...run, steps, status: 'error', finishedAt: run.finishedAt || Date.now() };
}

/** One plain line about a finished or waiting run (chat message, notification). */
export function runSummary(run, lang = 'en') {
  const steps = run.routine.cards.map((c) => ({ c, s: run.steps[c.id] })).filter((x) => x.s);
  const count = (st) => steps.filter((x) => x.s.status === st).length;
  if (run.status === 'waiting') {
    const c = run.routine.cards.find((x) => x.id === run.waiting?.cardId);
    return `"${run.routineName}" is waiting for your OK${c?.settings?.note ? `: ${c.settings.note}` : ''}.`;
  }
  const bad = steps.find((x) => x.s.status === 'error' || x.s.status === 'needs_info');
  if (bad) return `"${run.routineName}" stopped at "${say(cardDef(bad.c.type)?.label, lang)}": ${String(bad.s.summary || 'it could not finish').replace(/[.\s]+$/, '')}.`;
  const rejected = count('rejected');
  const files = steps.flatMap((x) => x.s.files || []);
  return `"${run.routineName}" finished${rejected ? ' (you did not approve one step, so the steps after it were skipped)' : ''}${files.length ? `: ${files.length} file(s) made or updated` : ''}.`;
}
