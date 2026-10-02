/**
 * runner.js — executes a planned task graph.
 * Independent tasks run in parallel (capped), dependents wait for their inputs,
 * and a failed task skips only the tasks that depend on it.
 */

export const TASK_CONCURRENCY = 3;

/**
 * tasks: [{ id, tool, args, dependsOn?: string[], label? }]
 * execute(task, depResults) → Promise<result>
 * onChange(statusList) — called on every status change with [{ id, label, status, detail?, error? }]
 * Returns Map(id → { status: 'done'|'error'|'skipped', result?, error? })
 */
export async function runTaskGraph(tasks, execute, { concurrency = TASK_CONCURRENCY, onChange } = {}) {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const state = new Map(tasks.map((t) => [t.id, { status: 'pending' }]));
  const results = new Map();

  const emit = () => {
    onChange?.(tasks.map((t) => ({ id: t.id, label: t.label || t.tool, ...state.get(t.id) })));
  };

  // Unknown dependencies are dropped rather than deadlocking the run.
  for (const t of tasks) {
    t.dependsOn = (t.dependsOn || []).filter((d) => byId.has(d) && d !== t.id);
  }

  return new Promise((resolve) => {
    let running = 0;

    const settle = (id, entry) => {
      state.set(id, entry);
      results.set(id, entry);
    };

    const pump = () => {
      // Skip anything whose dependency failed or was skipped.
      let changed = true;
      while (changed) {
        changed = false;
        for (const t of tasks) {
          if (state.get(t.id).status !== 'pending') continue;
          const failedDep = t.dependsOn.find((d) => ['error', 'skipped'].includes(state.get(d).status));
          if (failedDep) {
            settle(t.id, { status: 'skipped', error: `Skipped because "${byId.get(failedDep).label || failedDep}" did not finish.` });
            changed = true;
          }
        }
      }

      for (const t of tasks) {
        if (running >= concurrency) break;
        if (state.get(t.id).status !== 'pending') continue;
        if (!t.dependsOn.every((d) => state.get(d).status === 'done')) continue;

        running += 1;
        state.set(t.id, { status: 'running' });
        emit();
        const depResults = Object.fromEntries(t.dependsOn.map((d) => [d, results.get(d)?.result]));
        Promise.resolve()
          .then(() => execute(t, depResults, (detail) => {
            state.set(t.id, { status: 'running', detail });
            emit();
          }))
          .then(
            (result) => settle(t.id, { status: 'done', result, detail: result?.summary }),
            (error) => settle(t.id, { status: 'error', error: error?.message || String(error) }),
          )
          .finally(() => {
            running -= 1;
            emit();
            pump();
          });
      }

      const allSettled = tasks.every((t) => !['pending', 'running'].includes(state.get(t.id).status));
      if (allSettled && running === 0) {
        emit();
        resolve(results);
      } else if (running === 0) {
        // Remaining tasks are blocked by a cycle — mark them skipped.
        for (const t of tasks) {
          if (state.get(t.id).status === 'pending') settle(t.id, { status: 'skipped', error: 'Circular task dependency.' });
        }
        emit();
        resolve(results);
      }
    };

    emit();
    if (!tasks.length) resolve(results);
    else pump();
  });
}
