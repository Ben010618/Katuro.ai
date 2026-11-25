import { describe, it, expect, beforeEach } from 'vitest';
import { useRoutineStore, isWaiting } from './routineStore';
import { cleanRoutine } from '../services/desk/routines/routine';
import { createRun } from '../services/desk/routines/runRoutine';
import { dueNow } from '../services/desk/routines/triggers';

const watching = (folder) => cleanRoutine({
  id: 'r1', name: 'Photos', cards: [{ id: 'w', type: 'when.newFiles', settings: { folder, what: 'photos' } }, { id: 'p', type: 'do.toPdf' }], wires: [{ from: 'w', to: 'p' }],
}).routine;
const files = (paths) => paths.map((path) => ({ path, size: 1, lastModified: 1 }));

describe('saved routines and runs', () => {
  beforeEach(() => useRoutineStore.setState({ routines: [], meta: {}, runs: [] }));

  it('editing a switched-on "new files" routine starts from the files in its folder NOW (none fire)', () => {
    const st = useRoutineStore.getState();
    const all = files(['Lessons/A/a1.jpg', 'Lessons/B/b1.jpg', 'Lessons/B/b2.jpg']);
    st.saveRoutine(watching('Lessons/A'), { workspaceId: 'ws', flatFiles: all }, 1000);
    st.setEnabled('r1', true, { flatFiles: all, now: 1000 });
    expect(useRoutineStore.getState().meta.r1.seen).toEqual(['lessons/a/a1.jpg']);
    // The folder is changed to B and saved: B's old photos must not fire.
    const { routine } = useRoutineStore.getState().saveRoutine({ ...useRoutineStore.getState().routines[0], cards: watching('Lessons/B').cards }, { workspaceId: 'ws', flatFiles: all }, 2000);
    expect(routine.enabled).toBe(true);
    const meta = useRoutineStore.getState().meta.r1;
    expect(meta).toMatchObject({ enabledAt: 2000, seen: ['lessons/b/b1.jpg', 'lessons/b/b2.jpg'], pending: {} });
    expect(dueNow(routine, meta, { now: 9e9, flatFiles: all })).toBeNull();
  });

  it('deleting a routine deletes its runs, waiting ones too', () => {
    const st = useRoutineStore.getState();
    st.saveRoutine(watching('Lessons/A'), { workspaceId: 'ws' });
    const r = useRoutineStore.getState().routines[0];
    st.upsertRun({ ...createRun(r), status: 'waiting', waiting: { cardId: 'p' } });
    st.upsertRun({ ...createRun(r), status: 'done' });
    expect(useRoutineStore.getState().runs).toHaveLength(2);
    st.deleteRoutine(r.id);
    expect(useRoutineStore.getState().runs).toEqual([]);
    expect(useRoutineStore.getState().meta[r.id]).toBeUndefined();
  });

  it('waiting runs are kept (never closed for the teacher); isWaiting tells the engine not to start again', () => {
    const st = useRoutineStore.getState();
    st.saveRoutine(watching('Lessons/A'), { workspaceId: 'ws' });
    const r = useRoutineStore.getState().routines[0];
    expect(isWaiting(useRoutineStore.getState().runs, r.id)).toBe(false);
    st.upsertRun({ ...createRun(r, { kind: 'manual' }, 1000), status: 'waiting', waiting: { cardId: 'p' } });
    for (let i = 0; i < 70; i++) st.upsertRun({ ...createRun(r, { kind: 'manual' }, 2000 + i), status: 'done' });
    const runs = useRoutineStore.getState().runs;
    expect(runs.filter((x) => x.status === 'waiting')).toHaveLength(1);
    expect(runs.length).toBe(61); // the waiting one + the last 60 others
    expect(isWaiting(runs, r.id)).toBe(true);
  });
});
