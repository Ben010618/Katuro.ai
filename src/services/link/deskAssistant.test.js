import { describe, it, expect } from 'vitest';
import { createAssistantHandler } from './deskAssistant.js';

const NOW = new Date('2026-11-16T08:00:00').getTime(); // a Monday

function setup({ events = [], turn } = {}) {
  const state = { calendarEvents: [...events], myClasses: [], lessonSequences: {}, teachingLog: {}, scheduledTasks: [], persona: 'luna', privacyMode: true, eSignature: null };
  const calls = [];
  const ask = createAssistantHandler({
    getState: () => state,
    calendar: {
      add: (ev) => state.calendarEvents.push({ id: `cal-${state.calendarEvents.length + 1}`, doneAt: null, ...ev }),
      update: (id, patch) => { state.calendarEvents = state.calendarEvents.map((e) => (e.id === id ? { ...e, ...patch } : e)); },
      remove: (id) => { state.calendarEvents = state.calendarEvents.filter((e) => e.id !== id); },
    },
    getWorkspace: async () => ({ name: 'KaTuro', files: [] }),
    getAccount: () => ({ user: { uid: 'u1' }, profile: { firstName: 'Ana' } }),
    runTurn: async (o) => { calls.push(o); return turn ? turn(o) : { content: 'Done.', createdFiles: [] }; },
    now: () => NOW,
  });
  return { ask, state, calls };
}

describe('the phone asks KaTuroDesk: schedule and calendar', () => {
  it('lists the teacher\'s own entries by day, in time order, for a week by default', async () => {
    const { ask } = setup({ events: [
      { id: 'a', title: 'Parent meeting', date: '2026-11-17', time: '15:00', remindMinutes: 30, note: '' },
      { id: 'b', title: 'Submit DLL', date: '2026-11-17', time: '08:00', remindMinutes: null, note: 'to the principal' },
      { id: 'c', title: 'Far away', date: '2026-12-20', time: '09:00', remindMinutes: 10, note: '' },
    ] });
    const r = await ask('schedule', {});
    expect(r.from).toBe('2026-11-16');
    expect(r.to).toBe('2026-11-22');
    const tue = r.days.find((d) => d.date === '2026-11-17');
    expect(tue.label).toMatch(/^Tomorrow/);
    const own = tue.items.filter((i) => i.kind === 'event');
    expect(own.map((i) => [i.time, i.title])).toEqual([['08:00', 'Submit DLL'], ['15:00', 'Parent meeting']]);
    expect(r.days.some((d) => d.date === '2026-12-20')).toBe(false);
  });

  it('gives the reminders for the next 30 days, so the phone rings them too', async () => {
    const { ask } = setup({ events: [
      { id: 'a', title: 'Parent meeting', date: '2026-11-17', time: '15:00', remindMinutes: 30 },
      { id: 'n', title: 'Note only', date: '2026-11-17', time: '', remindMinutes: null },
      { id: 'd', title: 'Done already', date: '2026-11-18', time: '10:00', remindMinutes: 10, doneAt: 1 },
      { id: 'old', title: 'Yesterday', date: '2026-11-15', time: '10:00', remindMinutes: 10 },
    ] });
    expect((await ask('reminders')).reminders.map((r) => r.id)).toEqual(['a']);
  });

  it('adds, marks done and removes an entry from the phone; checks what is typed', async () => {
    const { ask, state } = setup();
    const added = await ask('addEvent', { title: '  Faculty   meeting ', date: '2026-11-18', time: '14:00', remindMinutes: 15 });
    expect(added.event).toMatchObject({ title: 'Faculty meeting', date: '2026-11-18', time: '14:00', remindMinutes: 15 });
    await ask('doneEvent', { id: added.event.id });
    expect(state.calendarEvents[0].doneAt).toBe(NOW);
    await ask('removeEvent', { id: added.event.id });
    expect(state.calendarEvents).toEqual([]);
    await expect(ask('addEvent', { title: '', date: '2026-11-18' })).rejects.toMatchObject({ code: 'INVALID' });
    await expect(ask('addEvent', { title: 'X', date: '2026-11-18', time: '', remindMinutes: 10 })).rejects.toThrow(/reminder needs a time/);
    await expect(ask('removeEvent', { id: 'nope' })).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('the phone asks KaTuroDesk: the assistant', () => {
  it('runs one KaTuroDesk agent turn on the KaTuro folder, as the teacher on KaTuroDesk, and lists the files made', async () => {
    const { ask, calls } = setup({ turn: () => ({ content: 'Here is your lesson plan.', createdFiles: [{ path: 'Lessons/KaTuro Outputs/2026-11-16/Lesson Plan - Cells.docx', name: 'Lesson Plan - Cells.docx' }] }) });
    const r = await ask('ask', { prompt: 'Make a lesson plan on cells', persona: 'matt', history: [{ role: 'user', content: 'hi' }, { role: 'assistant', content: 'Yow!' }, { role: 'system', content: 'ignored' }] });
    expect(r).toEqual({ content: 'Here is your lesson plan.', files: [{ path: 'Lessons/KaTuro Outputs/2026-11-16/Lesson Plan - Cells.docx', name: 'Lesson Plan - Cells.docx' }], choices: [], pendingPlan: null });
    expect(calls[0]).toMatchObject({ prompt: 'Make a lesson plan on cells', persona: 'matt', privacyMode: true, user: { uid: 'u1' }, workspace: { name: 'KaTuro' } });
    expect(calls[0].history).toEqual([{ role: 'user', content: 'hi' }, { role: 'assistant', content: 'Yow!' }]);
  });

  it('a plan waiting for "Proceed" comes back, and the approved plan runs with no new question', async () => {
    const plan = { reply: 'I will make 3 files.', tasks: [{ id: 't1', tool: 'write_document', args: {} }] };
    const { ask, calls } = setup({ turn: (o) => (o.confirmedPlan ? { content: 'Done.', createdFiles: [] } : { content: 'Proceed?', createdFiles: [], pendingPlan: plan }) });
    expect((await ask('ask', { prompt: 'Make three worksheets' })).pendingPlan).toEqual(plan);
    await ask('ask', { prompt: 'Make three worksheets', confirmedPlan: plan });
    expect(calls[1].confirmedPlan).toEqual(plan);
  });

  it('needs a question, and a teacher signed in on KaTuroDesk', async () => {
    const { ask } = setup();
    await expect(ask('ask', { prompt: '  ' })).rejects.toMatchObject({ code: 'INVALID' });
  });
});
