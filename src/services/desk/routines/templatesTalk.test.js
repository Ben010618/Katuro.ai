import { describe, it, expect, vi } from 'vitest';
import { TEMPLATES, fromTemplate } from './templates.js';
import { checkRoutine, describeRoutine, runOrder } from './routine.js';
import { TALK_SYSTEM, talkPrompt, talkToRoutine } from './talk.js';
import { cardDef } from './catalog.js';

describe('ready-made routines', () => {
  it('each one: English and Filipino, switched off, only known cards, joined in a row that fits', () => {
    expect(TEMPLATES.length).toBeGreaterThanOrEqual(8);
    for (const t of TEMPLATES) {
      expect(t.name.en && t.name.fil && t.about.en && t.about.fil && t.choose.en && t.choose.fil, t.id).toBeTruthy();
      const r = fromTemplate(t.id);
      expect(r.enabled).toBe(false);
      expect(runOrder(r)).toHaveLength(r.cards.length); // every card joined
      // The only problems left are the files/settings the teacher must choose (never wrong plugs).
      for (const p of checkRoutine(r)) expect(p.text, `${t.id}: ${p.text}`).toMatch(/ is needed\.$/);
      expect(fromTemplate(t.id, 'fil').name).toBe(t.name.fil);
    }
  });

  it('a card that changes a record always has "Ask me first" before it', () => {
    for (const t of TEMPLATES) {
      const order = runOrder(fromTemplate(t.id));
      order.forEach((c, i) => {
        if (cardDef(c.type).changesRecords) expect(order.slice(0, i).some((x) => x.type === 'ask.approve'), t.id).toBe(true);
      });
    }
  });

  it('two copies of one ready-made routine are separate routines', () => {
    const a = fromTemplate('friday-attendance');
    const b = fromTemplate('friday-attendance');
    expect(a.id).not.toBe(b.id);
    expect(a.cards[0].id).not.toBe(b.cards[0].id);
    expect(describeRoutine(a)).toBe('On a schedule → A sheet → Find frequent absences → Tell me when done');
    expect(() => fromTemplate('nope')).toThrow();
  });
});

describe('talk to build', () => {
  const files = ['Records/SF2 October.xlsx', 'Records/Grade 7 - Rizal - Science.xlsx', 'Lessons/photo.jpg', 'Lessons/Tests/G7/Quiz 1/KaTuro bubble quiz.json'];
  const folders = ['Records', 'Lessons/Tests/G7/Quiz 1/Photos'];

  it('the AI is told the cards, the rules and only the file names (no contents)', () => {
    expect(TALK_SYSTEM).toMatch(/do\.attendance \[do\] takes sheet gives docs/);
    expect(TALK_SYSTEM).toMatch(/do\.typeScores .*CHANGES A RECORD/);
    expect(TALK_SYSTEM).toMatch(/Never invent a path/);
    const p = talkPrompt('every friday check attendance', null, { files, folders });
    expect(p).toContain('- Records/SF2 October.xlsx');
    expect(p).not.toContain('photo.jpg'); // only sheets and documents are listed
    expect(p).not.toContain('KaTuro bubble quiz.json');
    expect(p).toContain('- Lessons/Tests/G7/Quiz 1/Photos');
  });

  it('a sentence becomes cards; nothing is switched on', async () => {
    const ask = vi.fn(async () => ({
      name: 'Friday attendance',
      cards: [
        { id: 'c1', type: 'when.schedule', settings: { repeat: 'weekly', weekdays: [5], time: '15:00' } },
        { id: 'c2', type: 'get.sheet', settings: { path: 'Records/SF2 October.xlsx' } },
        { id: 'c3', type: 'do.attendance', settings: { minConsecutive: 3 } },
        { id: 'c4', type: 'save.notify', settings: {} },
      ],
      wires: [{ from: 'c1', to: 'c2' }, { from: 'c2', to: 'c3' }, { from: 'c3', to: 'c4' }],
      message: 'Gagawin ko ito tuwing Biyernes, 3 PM.',
    }));
    const out = await talkToRoutine('Tuwing Biyernes, i-check ang attendance', null, ask, { files, folders });
    expect(out.routine.enabled).toBe(false);
    expect(out.problems).toEqual([]);
    expect(describeRoutine(out.routine)).toBe('On a schedule → A sheet → Find frequent absences → Tell me when done');
    expect(out.message).toBe('Gagawin ko ito tuwing Biyernes, 3 PM.');
  });

  it('what the AI makes up is dropped or flagged, never run: unknown cards, code, paths outside, a record change with no OK', async () => {
    const ask = async () => ({
      name: 'x',
      cards: [
        { id: 'c1', type: 'when.manual', settings: {} },
        { id: 'c2', type: 'do.runShell', settings: { cmd: 'format c:' } },
        { id: 'c3', type: 'get.sheet', settings: { path: '../../Windows/win.ini' } },
        { id: 'c4', type: 'do.typeScores', settings: { targetPath: 'Records/Grade 7 - Rizal - Science.xlsx', targetColumn: 'WW1', script: 'eval(1)' } },
      ],
      wires: [{ from: 'c1', to: 'c3' }, { from: 'c3', to: 'c4' }],
      message: 'Done',
    });
    const out = await talkToRoutine('do it', null, ask, { files, folders });
    expect(out.routine.cards.map((c) => c.type)).toEqual(['when.manual', 'get.sheet', 'do.typeScores']);
    expect(out.routine.cards[1].settings.path).toBe('');
    expect(out.routine.cards[2].settings).toEqual({ targetPath: 'Records/Grade 7 - Rizal - Science.xlsx', targetColumn: 'WW1' });
    expect(out.problems.map((p) => p.text)).toEqual(expect.arrayContaining(['"Type scores into my class record" changes your class record, so put a yellow "Ask me first" card right before it.']));
    expect(out.message).toMatch(/Left out: an unknown card "do\.runShell"/);
  });

  it('changing a routine keeps its id; a reply that is not a routine is said plainly', async () => {
    const current = fromTemplate('friday-attendance');
    const ask = vi.fn(async () => ({ name: current.name, cards: current.cards.map((c) => (c.type === 'when.schedule' ? { ...c, settings: { ...c.settings, weekdays: [4] } } : c)), wires: current.wires, message: 'Ginawa kong Huwebes.' }));
    const out = await talkToRoutine('gawing Huwebes', current, ask, { files, folders });
    expect(out.routine.id).toBe(current.id);
    expect(out.routine.cards[0].settings.weekdays).toEqual([4]);
    expect(ask.mock.calls[0][1]).toContain('CURRENT ROUTINE');
    await expect(talkToRoutine('x', null, async () => 'nope', {})).rejects.toThrow(/could not draw/);
    await expect(talkToRoutine('x', null, async () => ({ cards: [{ type: 'do.hack' }] }), {})).rejects.toThrow(/could not draw/);
    await expect(talkToRoutine('  ', null, ask, {})).rejects.toThrow(/Say what/);
  });
});
