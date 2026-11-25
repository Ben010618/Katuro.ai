import { describe, it, expect, vi } from 'vitest';
import { CARDS, KINDS, PLUGS, MAX_CARDS, cardDef } from './catalog.js';
import { checkRoutine, cleanPath, cleanRoutine, describeRoutine, exportRoutineText, importRoutineText, newCard, newRoutine, plugsOf, runOrder, MAX_IMPORT_BYTES } from './routine.js';
import { depedDates, depedFireAt, dueNow, initialSeen, nextFireAt, SETTLE_MS, MAX_FILES_PER_RUN } from './triggers.js';
import { advanceRun, createRun, decideRun, recoverRun, runSummary } from './runRoutine.js';
import { TOOLS } from '../agent/registry.js';

/** A routine from a list of [type, settings] in a row (each card wired to the one before). */
function chain(items, name = 'Test routine') {
  const cards = items.map(([type, settings = {}], i) => ({ id: `c${i}`, type, settings }));
  const wires = cards.slice(1).map((c, i) => ({ from: cards[i].id, to: c.id }));
  return cleanRoutine({ id: 'r1', name, enabled: true, cards, wires }).routine;
}

describe('the card catalog', () => {
  it('every card: a kind, English and Filipino words, plugs that exist', () => {
    const types = new Set();
    for (const c of CARDS) {
      expect(types.has(c.type)).toBe(false);
      types.add(c.type);
      expect(KINDS).toContain(c.kind);
      expect(c.label.en && c.label.fil && c.help.en && c.help.fil).toBeTruthy();
      for (const a of c.accepts) expect([...PLUGS, 'any']).toContain(a);
      if (c.gives && c.gives !== 'same') expect(PLUGS).toContain(c.gives);
      for (const f of c.fields) expect(f.label.en && f.label.fil).toBeTruthy();
      if (c.kind === 'when') expect(c.accepts).toEqual([]);
    }
  });

  it('every green card runs real KaTuroDesk tools, with only argument names those tools take', () => {
    const input = { plug: 'sheet', paths: ['Records/x.xlsx'], folder: 'Lessons/Photos' };
    for (const c of CARDS.filter((x) => x.kind === 'do')) {
      const settings = Object.fromEntries(c.fields.map((f) => [f.key, f.default ?? (f.kind === 'number' ? f.min : 'x')]));
      for (const t of c.toTasks({ ...settings, remedial: 'yes' }, input)) {
        expect(TOOLS[t.tool], `${c.type} → ${t.tool}`).toBeTruthy();
        for (const key of Object.keys(t.args)) expect(TOOLS[t.tool].args, `${c.type}: ${t.tool} has no "${key}"`).toContain(`"${key}"`);
      }
    }
  });

  it('no card can run a program, call the internet, or run typed code', () => {
    const tools = CARDS.filter((x) => x.kind === 'do').flatMap((c) => c.toTasks({}, { paths: ['a.xlsx'] }).map((t) => t.tool));
    for (const t of tools) expect(t).not.toMatch(/exec|shell|command|http|fetch|webhook|script|eval|run_code|^code/i);
    for (const c of CARDS) for (const f of c.fields) expect(['text', 'number', 'choice', 'days', 'time', 'file', 'folder', 'offset']).toContain(f.kind);
  });
});

describe('cleaning a routine (saved, imported or drawn by the AI)', () => {
  it('paths stay inside the KaTuro folder', () => {
    expect(cleanPath('Records/Grade 7 - Rizal - Science.xlsx')).toBe('Records/Grade 7 - Rizal - Science.xlsx');
    expect(cleanPath('Lessons/Tests/')).toBe('Lessons/Tests');
    for (const bad of ['../secret.txt', 'Records/../../Windows', 'C:/Windows/system.ini', 'C:Windows', '/etc/passwd', '\\\\server\\share', 'Records\\x.xlsx', './x', '', 'a/ b', 'x\u0000y'.replace('\u0000', '\u0007')]) {
      expect(cleanPath(bad), bad).toBe('');
    }
  });

  it('unknown cards, code and extra keys are dropped; settings rebuilt from the card\'s fields only', () => {
    const raw = JSON.parse(`{
      "id": "r1", "name": "x", "enabled": true, "__proto__": { "polluted": true },
      "cards": [
        { "id": "c1", "type": "when.manual", "run": "require('child_process')" },
        { "id": "c2", "type": "do.shell", "settings": { "cmd": "del /s" } },
        { "id": "c3", "type": "get.sheet", "settings": { "path": "../../x.xlsx", "eval": "1+1", "__proto__": { "a": 1 } } },
        { "id": "c3", "type": "get.sheet", "settings": { "path": "Records/a.xlsx" } }
      ],
      "wires": [{ "from": "c1", "to": "c3" }, { "from": "c1", "to": "nope" }, { "from": "c1", "to": "c1" }]
    }`);
    const { routine, dropped } = cleanRoutine(raw);
    expect({}.polluted).toBeUndefined();
    expect(routine.cards.map((c) => c.type)).toEqual(['when.manual', 'get.sheet', 'get.sheet']);
    expect(routine.cards[0]).toEqual({ id: 'c1', type: 'when.manual', settings: {}, x: 0, y: 0 });
    expect(routine.cards[1].settings).toEqual({ path: '' });
    expect(routine.cards[2].id).not.toBe('c3'); // duplicate id renamed
    expect(routine.wires).toEqual([{ from: 'c1', to: 'c3' }]);
    expect(dropped).toEqual(expect.arrayContaining(['an unknown card "do.shell"', 'a wire to a card that is not there']));
    expect(Object.keys(routine).sort()).toEqual(['cards', 'enabled', 'id', 'name', 'version', 'wires']);
  });

  it('numbers, choices, times and texts are checked; wrong values are listed, never changed quietly', () => {
    const raw = { id: 'r1', name: 'x', enabled: true, cards: [
      { id: 'c0', type: 'when.schedule', settings: { repeat: 'hourly', time: '25:00', weekdays: [5, 5, 9, 'x'] } },
      { id: 'c1', type: 'get.sheet', settings: { path: 'Records/SF2.xlsx' } },
      { id: 'c2', type: 'do.attendance', settings: { minConsecutive: 99, gradeSection: `G7\u0007 ${'x'.repeat(500)}` } },
    ], wires: [{ from: 'c0', to: 'c1' }, { from: 'c1', to: 'c2' }] };
    // A draft being edited: every wrong value is a problem (the routine cannot run).
    expect(checkRoutine(raw).map((p) => p.text)).toEqual(expect.arrayContaining(['"On a schedule": How often is not one of the choices.', '"On a schedule": Time is not a time (HH:MM).', '"Find frequent absences": Days in a row must be from 2 to 10.']));
    // Saved or imported: the usual values, and the teacher is told what was set back.
    const { routine, dropped } = cleanRoutine(raw);
    expect(routine.cards[0].settings).toMatchObject({ repeat: 'weekly', weekdays: [5], time: '15:00' });
    expect(routine.cards[2].settings.minConsecutive).toBe(3);
    expect(routine.cards[2].settings.gradeSection.length).toBe(300);
    expect(routine.cards[2].settings.gradeSection.includes(String.fromCharCode(7))).toBe(false);
    expect(dropped).toEqual(['On a schedule: How often is not one of the choices (set back to the usual value)', 'On a schedule: Time is not a time (HH:MM) (set back to the usual value)', 'Find frequent absences: Days in a row must be from 2 to 10 (set back to the usual value)']);
  });

  it('an imported file: size limit, not JSON, always switched off', () => {
    expect(() => importRoutineText('x'.repeat(MAX_IMPORT_BYTES + 1))).toThrow(/too big/);
    expect(() => importRoutineText('not json')).toThrow(/not a KaTuro routine/);
    expect(() => importRoutineText('[1,2]')).toThrow(/not a KaTuro routine/);
    const r = chain([['when.manual'], ['get.sheet', { path: 'Records/a.xlsx' }]]);
    const back = importRoutineText(exportRoutineText(r)).routine;
    expect(back.enabled).toBe(false);
    expect(back.cards.map((c) => c.type)).toEqual(['when.manual', 'get.sheet']);
  });
});

describe('checking a routine', () => {
  it('a good routine has no problems and reads in plain words', () => {
    const r = chain([['when.schedule', { repeat: 'weekly', weekdays: [5], time: '15:00' }], ['get.sheet', { path: 'Records/SF2.xlsx' }], ['do.attendance', {}], ['save.notify', {}]]);
    expect(checkRoutine(r)).toEqual([]);
    expect(describeRoutine(r)).toBe('On a schedule → A sheet → Find frequent absences → Tell me when done');
    expect(describeRoutine(r, 'fil')).toBe('Ayon sa iskedyul → Isang sheet → Hanapin ang madalas lumiban → Sabihan ako kapag tapos na');
  });

  it('plugs must fit', () => {
    const r = chain([['when.manual'], ['get.folder', { folder: 'Lessons/Photos' }], ['do.attendance', {}]]);
    expect(checkRoutine(r).map((p) => p.text)).toEqual(['"Find frequent absences" needs a sheet, but "A folder" gives a folder of files.']);
  });

  it('a card that changes a record needs "Ask me first" before it (anywhere before it)', () => {
    const steps = [['when.manual'], ['get.sheet', { path: 'Records/scores.xlsx' }], ['do.typeScores', { targetPath: 'Records/Grade 7 - Rizal - Science.xlsx', targetColumn: 'WW3' }]];
    expect(checkRoutine(chain(steps)).map((p) => p.text)).toEqual(['"Type scores into my class record" changes your class record, so put a yellow "Ask me first" card before it.']);
    const asked = chain([steps[0], steps[1], ['ask.approve', {}], steps[2]]);
    expect(checkRoutine(asked)).toEqual([]);
    expect(plugsOf(asked).get('c2')).toBe('sheet'); // Ask passes on what came in
  });

  it('one When card; no loose cards, loops or two wires into one card', () => {
    const two = cleanRoutine({ cards: [{ id: 'a', type: 'when.manual' }, { id: 'b', type: 'when.manual' }], wires: [] }).routine;
    expect(checkRoutine(two).map((p) => p.text)).toContain('A routine starts in one way only: keep one purple "When" card.');
    const none = cleanRoutine({ cards: [{ id: 'a', type: 'get.sheet', settings: { path: 'a.xlsx' } }], wires: [] }).routine;
    expect(checkRoutine(none).map((p) => p.text)).toContain('Add a purple "When" card to say when the routine starts.');
    const loose = cleanRoutine({ cards: [{ id: 'w', type: 'when.manual' }, { id: 'a', type: 'get.sheet', settings: { path: 'a.xlsx' } }], wires: [] }).routine;
    expect(checkRoutine(loose).map((p) => p.text)).toEqual(['"A sheet" is not joined to anything. Join it to the card before it.']);
    const loop = cleanRoutine({ cards: [{ id: 'w', type: 'when.manual' }, { id: 'a', type: 'ask.approve' }, { id: 'b', type: 'ask.approve' }], wires: [{ from: 'a', to: 'b' }, { from: 'b', to: 'a' }] }).routine;
    expect(checkRoutine(loop).map((p) => p.text)).toEqual(expect.arrayContaining(['"Ask me first" is in a loop or not reached from the "When" card.']));
    const twoIn = cleanRoutine({ cards: [{ id: 'w', type: 'when.manual' }, { id: 'a', type: 'get.sheet', settings: { path: 'a.xlsx' } }, { id: 'b', type: 'get.sheet', settings: { path: 'b.xlsx' } }, { id: 'n', type: 'save.notify' }], wires: [{ from: 'w', to: 'a' }, { from: 'w', to: 'b' }, { from: 'a', to: 'n' }, { from: 'b', to: 'n' }] }).routine;
    expect(checkRoutine(twoIn).map((p) => p.text)).toContain('"Tell me when done" can take only one wire coming in.');
    const big = newRoutine();
    for (let i = 0; i < MAX_CARDS; i++) big.cards.push(newCard('save.notify'));
    expect(checkRoutine(big).map((p) => p.text)).toContain(`A routine can have at most ${MAX_CARDS} cards.`);
  });

  it('runs in order from the When card, branches included', () => {
    const r = cleanRoutine({ cards: [{ id: 'w', type: 'when.manual' }, { id: 's', type: 'get.sheet', settings: { path: 'a.xlsx' } }, { id: 'n1', type: 'save.notify' }, { id: 'n2', type: 'do.attendance' }], wires: [{ from: 'w', to: 's' }, { from: 's', to: 'n1' }, { from: 's', to: 'n2' }] }).routine;
    expect(runOrder(r).map((c) => c.id)).toEqual(['w', 's', 'n1', 'n2']);
  });
});

describe('when a routine starts', () => {
  const day = (y, m, d, h = 0, mi = 0) => new Date(y, m - 1, d, h, mi).getTime();

  it('on a schedule: at the time, and a missed time only once', () => {
    const r = chain([['when.schedule', { repeat: 'weekly', weekdays: [5], time: '15:00' }]]);
    const enabledAt = day(2026, 11, 23, 8); // Monday
    expect(dueNow(r, { enabledAt }, { now: day(2026, 11, 27, 14, 59) })).toBeNull();
    const due = dueNow(r, { enabledAt }, { now: day(2026, 11, 27, 15, 0) });
    expect(due.trigger.kind).toBe('schedule');
    // The PC was off for three Fridays: it runs once, then waits for the next Friday.
    const late = dueNow(r, { enabledAt }, { now: day(2026, 12, 14, 9) });
    expect(late).toBeTruthy();
    expect(dueNow(r, late.meta, { now: day(2026, 12, 14, 9, 1) })).toBeNull();
    expect(nextFireAt(r, late.meta, day(2026, 12, 14, 9, 1))).toBe(day(2026, 12, 18, 15, 0));
    expect(dueNow({ ...r, enabled: false }, { enabledAt }, { now: day(2026, 11, 27, 15) })).toBeNull();
  });

  it('on a DepEd date: the calendar\'s dates, the offset, once per date, nothing from before it was switched on', () => {
    expect(depedDates('termEnd').map((d) => d.date)).toEqual(['2026-09-15', '2026-12-18', '2027-04-08']);
    expect(depedDates('termExam').map((d) => d.date)).toEqual(['2026-08-28', '2026-12-03', '2027-03-15']);
    expect(depedDates('bosyStart').map((d) => d.date)).toEqual(['2026-06-08']);
    expect(depedFireAt('2026-12-18', { offsetDays: -3, time: '07:00' })).toBe(day(2026, 12, 15, 7));
    const r = chain([['when.deped', { event: 'termEnd', offsetDays: -3, time: '07:00' }]]);
    const meta = { enabledAt: day(2026, 11, 25) };
    expect(dueNow(r, meta, { now: day(2026, 12, 15, 6, 59) })).toBeNull();
    const due = dueNow(r, meta, { now: day(2026, 12, 15, 7) });
    expect(due.trigger).toMatchObject({ kind: 'deped', title: 'End of Term 2' });
    expect(dueNow(r, due.meta, { now: day(2026, 12, 16) })).toBeNull();
    expect(nextFireAt(r, due.meta, day(2026, 12, 16))).toBe(day(2027, 4, 5, 7));
  });

  it('new files: only ones that came after it was switched on, after they stop changing, 40 per run', () => {
    const r = chain([['when.newFiles', { folder: 'Lessons/Tests/G7/Quiz 1/Photos', what: 'photos' }]]);
    const t0 = day(2026, 11, 25, 8);
    const old = [{ path: 'Lessons/Tests/G7/Quiz 1/Photos/a.jpg', size: 10, lastModified: t0 - 1e6 }];
    const meta = { enabledAt: t0, seen: initialSeen(r, old) };
    expect(dueNow(r, meta, { now: t0 + 60_000, flatFiles: old })).toBeNull();
    const fresh = [...old, { path: 'Lessons/Tests/G7/Quiz 1/Photos/b.jpg', size: 9, lastModified: t0 + 50_000 }, { path: 'Lessons/Tests/G7/Quiz 1/Photos/notes.txt', size: 1, lastModified: t0 }];
    expect(dueNow(r, meta, { now: t0 + 50_000 + SETTLE_MS - 1, flatFiles: fresh })).toBeNull(); // still being copied
    const due = dueNow(r, meta, { now: t0 + 50_000 + SETTLE_MS, flatFiles: fresh });
    expect(due.trigger.files).toEqual(['Lessons/Tests/G7/Quiz 1/Photos/b.jpg']);
    expect(dueNow(r, due.meta, { now: t0 + 200_000, flatFiles: fresh })).toBeNull();
    const many = Array.from({ length: 45 }, (_, i) => ({ path: `Lessons/Tests/G7/Quiz 1/Photos/p${i}.jpg`, size: 1, lastModified: t0 }));
    const first = dueNow(r, { enabledAt: t0, seen: [] }, { now: t0 + 1e6, flatFiles: many });
    expect(first.trigger.files).toHaveLength(MAX_FILES_PER_RUN);
    expect(dueNow(r, first.meta, { now: t0 + 1e6, flatFiles: many }).trigger.files).toHaveLength(5);
  });
});

describe('running a routine', () => {
  const fake = (results = {}) => {
    const calls = [];
    return {
      calls,
      deps: {
        now: () => 1000,
        fileExists: (p) => !/missing/.test(p),
        folderFiles: (f) => (f === 'Gone' ? null : [`${f}/1.jpg`, `${f}/2.jpg`]),
        notify: vi.fn(),
        runTasks: vi.fn(async (tasks, opts) => {
          calls.push({ tasks, opts });
          const r = results[tasks[0].tool] || { status: 'done', summary: `${tasks[0].tool} ok`, files: [`KaTuro Outputs/${tasks[0].tool}.docx`, `KaTuro Outputs/${tasks[0].tool}.xlsx`] };
          return r;
        }),
      },
    };
  };

  it('card by card: a sheet flows into a tool, the tool\'s files flow on, the notice says what was done', async () => {
    const r = chain([['when.manual'], ['get.sheet', { path: 'Records/SF2 October.xlsx' }], ['do.attendance', { minConsecutive: 3 }], ['save.folder', { folder: 'Records/Notices' }]]);
    const { deps, calls } = fake();
    const run = await advanceRun(createRun(r), deps);
    expect(run.status).toBe('done');
    expect(calls).toHaveLength(1);
    expect(calls[0].tasks[0]).toMatchObject({ tool: 'check_attendance', args: { path: 'Records/SF2 October.xlsx', minConsecutive: 3 } });
    expect(calls[0].opts.outputFolder).toBe('Records/Notices');
    expect(run.steps.c2).toMatchObject({ status: 'done', files: ['KaTuro Outputs/check_attendance.docx', 'KaTuro Outputs/check_attendance.xlsx'] });
    expect(run.outputs.c2).toEqual({ plug: 'docs', paths: ['KaTuro Outputs/check_attendance.docx', 'KaTuro Outputs/check_attendance.xlsx'] });
    expect(runSummary(run)).toBe('"Test routine" finished: 2 file(s) made or updated.');
  });

  it('"Ask me first" stops the run; yes goes on, no skips everything after it', async () => {
    const r = chain([['when.manual'], ['get.sheet', { path: 'Records/scores.xlsx' }], ['ask.approve', { note: 'Check the scores first' }], ['do.typeScores', { targetPath: 'Records/Grade 7 - Rizal - Science.xlsx', targetColumn: 'WW3' }], ['save.notify', {}]]);
    const { deps, calls } = fake();
    const waiting = await advanceRun(createRun(r), deps);
    expect(waiting.status).toBe('waiting');
    expect(waiting.waiting).toMatchObject({ cardId: 'c2', note: 'Check the scores first', preview: ['scores.xlsx', 'Records/scores.xlsx'] });
    expect(calls).toHaveLength(0); // nothing changed yet
    expect(runSummary(waiting)).toBe('"Test routine" is waiting for your OK: Check the scores first.');

    const yes = await advanceRun(decideRun(waiting, true, { now: 2000, by: 'phone' }), deps);
    expect(yes.status).toBe('done');
    expect(yes.steps.c2).toMatchObject({ status: 'approved', summary: 'Approved (phone)' });
    expect(calls[0].tasks[0]).toMatchObject({ tool: 'encode_scores', args: { sourcePath: 'Records/scores.xlsx', targetPath: 'Records/Grade 7 - Rizal - Science.xlsx', targetColumn: 'WW3' } });
    expect(yes.outputs.c3).toEqual({ plug: 'record', paths: ['Records/Grade 7 - Rizal - Science.xlsx'] });
    expect(deps.notify).toHaveBeenCalledTimes(1);

    const { deps: d2, calls: c2 } = fake();
    const no = await advanceRun(decideRun(await advanceRun(createRun(r), d2), false), d2);
    expect(no.status).toBe('done');
    expect(no.steps.c2.status).toBe('rejected');
    expect(no.steps.c3.status).toBe('skipped');
    expect(no.steps.c4.status).toBe('skipped');
    expect(c2).toHaveLength(0);
    expect(runSummary(no)).toMatch(/you did not approve one step/);
    expect(decideRun(no, true)).toBe(no); // nothing waits any more
  });

  it('a failed card skips only what comes after it; a missing file or folder is said plainly', async () => {
    const r = cleanRoutine({ id: 'r', name: 'R', enabled: true, cards: [
      { id: 'w', type: 'when.manual' },
      { id: 'a', type: 'get.sheet', settings: { path: 'Records/missing.xlsx' } },
      { id: 'b', type: 'do.attendance' },
      { id: 'f', type: 'get.folder', settings: { folder: 'Lessons/Photos' } },
      { id: 'p', type: 'do.toPdf' },
    ], wires: [{ from: 'w', to: 'a' }, { from: 'a', to: 'b' }, { from: 'w', to: 'f' }, { from: 'f', to: 'p' }] }).routine;
    const { deps, calls } = fake();
    const run = await advanceRun(createRun(r), deps);
    expect(run.status).toBe('error');
    expect(run.steps.a).toMatchObject({ status: 'error', summary: '"Records/missing.xlsx" is not in your KaTuro folder any more.' });
    expect(run.steps.b.status).toBe('skipped');
    expect(run.steps.p.status).toBe('done');
    expect(calls.map((c) => c.tasks[0])).toEqual([expect.objectContaining({ tool: 'convert_to_pdf', args: { folder: 'Lessons/Photos' } })]);
    expect(runSummary(run)).toBe('"R" stopped at "A sheet": "Records/missing.xlsx" is not in your KaTuro folder any more.');
  });

  it('a tool that needs the teacher\'s input stops that branch; item analysis can add remedial slips in the same plan', async () => {
    const r = chain([['when.manual'], ['get.sheet', { path: 'Records/Quiz 1.xlsx' }], ['do.itemAnalysis', { remedial: 'yes' }], ['save.notify', {}]]);
    const { deps, calls } = fake({ analyze_scores: { status: 'needs_info', summary: 'How many items?', files: [] } });
    const run = await advanceRun(createRun(r), deps);
    expect(calls[0].tasks.map((t) => [t.tool, t.dependsOn])).toEqual([['analyze_scores', []], ['make_remedial_package', ['a']]]);
    expect(run.steps.c2.status).toBe('needs_info');
    expect(run.steps.c3.status).toBe('skipped');
    expect(run.status).toBe('error');
  });

  it('new files from the When card flow into the next card; a broken routine never runs', async () => {
    const r = chain([['when.newFiles', { folder: 'Lessons/Photos', what: 'photos' }], ['do.toPdf']]);
    const { deps, calls } = fake();
    const run = await advanceRun(createRun(r, { kind: 'newFiles', files: ['Lessons/Photos/1.jpg'] }), deps);
    expect(run.status).toBe('done');
    expect(calls[0].tasks[0].args).toEqual({ paths: ['Lessons/Photos/1.jpg'] });

    const broken = chain([['when.manual'], ['get.sheet', { path: 'Records/a.xlsx' }], ['do.typeScores', { targetPath: 'Records/b.xlsx', targetColumn: 'F' }]]);
    const { deps: d2, calls: c2 } = fake();
    const no = await advanceRun(createRun(broken), d2);
    expect(no.status).toBe('error');
    expect(no.problem).toMatch(/Ask me first/);
    expect(c2).toHaveLength(0);
  });

  it('a run keeps its own copy of the routine; a run cut off by closing the app is shown stopped', async () => {
    const r = chain([['when.manual'], ['get.sheet', { path: 'Records/a.xlsx' }]]);
    const run = createRun(r);
    r.cards[1].settings.path = 'Records/changed.xlsx';
    expect(run.routine.cards[1].settings.path).toBe('Records/a.xlsx');
    const cut = recoverRun({ ...run, steps: { ...run.steps, c1: { status: 'running' } } });
    expect(cut.status).toBe('error');
    expect(cut.steps.c1.status).toBe('error');
    expect(recoverRun({ ...run, status: 'waiting' }).status).toBe('waiting');
  });
});

describe('every card in the catalog is reachable from some routine shape', () => {
  it('each non-When card can follow at least one other card', () => {
    const gives = new Set(CARDS.map((c) => c.gives).filter((g) => g && g !== 'same'));
    for (const c of CARDS.filter((x) => x.kind !== 'when')) {
      expect(c.accepts.some((a) => a === 'any' || gives.has(a)), c.type).toBe(true);
      expect(cardDef(c.type)).toBe(c);
    }
    expect(cardDef('__proto__')).toBeNull();
    expect(cardDef('constructor')).toBeNull();
  });
});
