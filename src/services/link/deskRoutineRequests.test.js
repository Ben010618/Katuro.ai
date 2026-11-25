import { describe, it, expect, vi } from 'vitest';
import { createRoutineHandler, inboxItem, ROUTINE_OPS } from './deskRoutineRequests';

const run = {
  id: 'runabc123',
  routineName: 'Answer-sheet photos',
  waiting: { cardId: 'c2', note: 'Check the scores first', askedAt: 5, preview: ['24 sheets checked', 'Records/Quiz 1 scores.xlsx'] },
  stepsForPhone: [{ label: 'When new files arrive in a folder', status: 'done' }, { label: 'Check answer sheets', status: 'done' }, { label: 'Ask me first', status: 'waiting' }],
};

describe('routine approvals from the KaTuro App', () => {
  it('the phone sees what waits (names of steps and files, no file contents)', async () => {
    const handle = createRoutineHandler({ waitingRuns: () => [run], decide: vi.fn() });
    const { items } = await handle('routineInbox', {});
    expect(items).toEqual([inboxItem(run)]);
    expect(items[0]).toEqual({
      id: 'runabc123', routineName: 'Answer-sheet photos', note: 'Check the scores first', askedAt: 5,
      preview: ['24 sheets checked', 'Records/Quiz 1 scores.xlsx'],
      steps: [{ label: 'When new files arrive in a folder', status: 'done' }, { label: 'Check answer sheets', status: 'done' }, { label: 'Ask me first', status: 'waiting' }],
    });
    expect(ROUTINE_OPS.has('routineInbox') && ROUTINE_OPS.has('routineDecide')).toBe(true);
  });

  it('yes / no goes to KaTuroDesk with the phone\'s name; only a real waiting run, only true/false', async () => {
    const decide = vi.fn(async () => ({ status: 'done', summary: '"Answer-sheet photos" finished.' }));
    const handle = createRoutineHandler({ waitingRuns: () => [run], decide });
    expect(await handle('routineDecide', { id: 'runabc123', approve: true }, { name: 'Ana\'s phone' })).toEqual({ ok: true, status: 'done', summary: '"Answer-sheet photos" finished.' });
    expect(decide).toHaveBeenCalledWith('runabc123', true, 'Ana\'s phone');
    await expect(handle('routineDecide', { id: 'runabc123', approve: 'yes' })).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    await expect(handle('routineDecide', { id: '../../x', approve: true })).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    await expect(handle('routineDecide', { id: { $gt: '' }, approve: true })).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    await expect(handle('routineDecide', { id: 'runzzz999', approve: true })).rejects.toMatchObject({ code: 'GONE' });
    expect(decide).toHaveBeenCalledTimes(1);
  });

  it('KaTuroDesk busy: said plainly (the phone can try again); unknown requests refused', async () => {
    const handle = createRoutineHandler({ waitingRuns: () => [run], decide: async () => null });
    await expect(handle('routineDecide', { id: 'runabc123', approve: false })).rejects.toMatchObject({ code: 'BUSY' });
    await expect(handle('routineDelete', {})).rejects.toMatchObject({ code: 'UNKNOWN_OP' });
  });
});
