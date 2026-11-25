import { describe, it, expect } from 'vitest';
import { addCard, arrange, canConnect, cardLine, cardSentence, connect, removeCard, setSettings, CARD_W } from './routineLayout';
import { checkRoutine, newRoutine, runOrder } from '../../../services/desk/routines/routine';

const types = (r) => runOrder(r).map((c) => c.type);

describe('Routine Builder rules', () => {
  it('tapping cards on the shelf builds the row: each new card joins the one before when it fits', () => {
    let r = newRoutine('Friday wrap-up');
    ({ routine: r } = addCard(r, 'when.schedule'));
    expect(r.cards).toHaveLength(1); // the new When card replaced "When I press Play"
    let joined;
    ({ routine: r, joined } = addCard(r, 'get.sheet'));
    expect(joined).toBe(true);
    ({ routine: r, joined } = addCard(r, 'do.attendance'));
    expect(joined).toBe(true);
    ({ routine: r } = addCard(r, 'save.notify'));
    expect(types(r)).toEqual(['when.schedule', 'get.sheet', 'do.attendance', 'save.notify']);
    // A card that does not fit is placed, not joined (the teacher is told why on the canvas).
    const last = runOrder(r).at(-1);
    const res = addCard(r, 'do.checkPapers', last.id);
    expect(res.joined).toBe(false);
    expect(res.routine.cards).toHaveLength(5);
  });

  it('only plugs that fit can join; one wire in; no loops; nothing before "When"', () => {
    let r = newRoutine();
    ({ routine: r } = addCard(r, 'get.folder'));
    const [when, folder] = runOrder(r);
    const { routine: r2, card: attendance } = addCard({ ...r, wires: [] }, 'do.attendance');
    expect(canConnect(r2, when.id, folder.id).ok).toBe(true);
    const r3 = connect(r2, when.id, folder.id);
    expect(canConnect(r3, folder.id, attendance.id)).toEqual({ ok: false, reason: '"Find frequent absences" needs a sheet; this card gives a folder of files.' });
    expect(canConnect(r3, folder.id, when.id).reason).toBe('Nothing can come before a purple "When" card.');
    const { routine: r4, card: pdf } = addCard(r3, 'do.toPdf', folder.id);
    expect(canConnect(r4, when.id, pdf.id).reason).toBe('"Turn into PDF" already has a card before it.');
    const { routine: r5, card: ask } = addCard(r4, 'ask.approve', pdf.id);
    expect(canConnect(r5, ask.id, folder.id).reason).toMatch(/already has a card before it|loop/);
    expect(connect(r5, ask.id, folder.id)).toBe(r5); // refused: unchanged
  });

  it('cards arrange themselves left to right, no overlaps', () => {
    let r = newRoutine();
    for (const t of ['get.sheet', 'do.attendance', 'save.notify']) ({ routine: r } = addCard(r, t));
    const xs = runOrder(arrange(r)).map((c) => c.x);
    for (let i = 1; i < xs.length; i++) expect(xs[i] - xs[i - 1]).toBeGreaterThanOrEqual(CARD_W);
  });

  it('removing a card removes its wires; the cards after it need joining again', () => {
    let r = newRoutine();
    for (const t of ['get.sheet', 'do.attendance', 'save.notify']) ({ routine: r } = addCard(r, t));
    const sheet = runOrder(r)[1];
    const out = removeCard(r, sheet.id);
    expect(out.cards).toHaveLength(3);
    expect(out.wires.some((w) => w.from === sheet.id || w.to === sheet.id)).toBe(false);
    expect(checkRoutine(out).map((p) => p.text)).toContain('"Find frequent absences" is not joined to anything. Join it to the card before it.');
  });

  it('settings: what the teacher types stays while they type; the card line says what it will do', () => {
    let r = newRoutine();
    ({ routine: r } = addCard(r, 'when.schedule'));
    const when = r.cards[0];
    expect(cardLine(when)).toBe('Fri 15:00');
    expect(cardLine(when, 'fil')).toBe('Biy 15:00');
    r = setSettings(r, when.id, { repeat: 'weekdays', time: '07:30' });
    expect(cardLine(r.cards[0])).toBe('Mon–Fri 07:30');
    ({ routine: r } = addCard(r, 'get.sheet'));
    ({ routine: r } = addCard(r, 'do.attendance'));
    const att = runOrder(r)[2];
    r = setSettings(r, att.id, { minConsecutive: '1' });
    expect(r.cards.find((c) => c.id === att.id).settings.minConsecutive).toBe('1');
    expect(checkRoutine(r).map((p) => p.text)).toEqual(expect.arrayContaining(['"Find frequent absences": Days in a row must be from 2 to 10.']));
    r = setSettings(r, att.id, { minConsecutive: '4' });
    expect(cardLine(r.cards.find((c) => c.id === att.id))).toBe('4+ days in a row');
    expect(cardSentence(r.cards.find((c) => c.id === att.id), 'fil')).toMatch(/^Hanapin ang madalas lumiban: 4\+ araw na sunod-sunod\. /);
  });
});
