import { describe, it, expect, vi } from 'vitest';
import { apportion, allocateTos, buildDllParallel, buildTosParallel, BLOOM_LEVELS } from './docBuilders';
import { createNameMasker } from './privacy';

const ctxWith = (llm) => ({ llm, masker: createNameMasker(), docPersona: 'formal', teacher: { school: 'Rizal NHS', fullName: 'Ben Santos' } });

describe('apportion / allocateTos', () => {
  it('splits exactly with largest remainders', () => {
    expect(apportion(30, [1, 1, 1])).toEqual([10, 10, 10]);
    expect(apportion(10, [1, 1, 1])).toEqual([4, 3, 3]);
    expect(apportion(7, [0, 0])).toEqual([0, 0]);
    for (let total = 1; total < 60; total += 7) expect(apportion(total, [3, 5, 2, 9]).reduce((a, b) => a + b, 0)).toBe(total);
  });

  it('allocates items by days and Bloom levels that add up', () => {
    const plan = allocateTos([{ competency: 'A', days: 3 }, { competency: 'B', days: 2 }, { competency: 'C', days: 5 }], 40);
    expect(plan.map((r) => r.items)).toEqual([12, 8, 20]);
    expect(plan.map((r) => r.percent)).toEqual([30, 20, 50]);
    for (const r of plan) expect(r.levels.reduce((a, b) => a + b, 0)).toBe(r.items);
  });
});

describe('buildDllParallel', () => {
  it('plans the week once, writes every day in parallel, and assembles the DO 42 table', async () => {
    let inFlight = 0;
    let peak = 0;
    const llm = vi.fn(async ({ prompt }) => {
      if (prompt.startsWith('Plan one week')) {
        return { title: 'DLL Week 1', gradeLevel: 'Grade 7', learningArea: 'Science', quarter: 'Q2', contentStandard: 'CS', performanceStandard: 'PS',
          days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].map((d, i) => ({ day: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'][i], competency: `Comp ${d}`, topic: `Topic ${d}` })),
          resources: { teachersGuide: 'TG p.1' } };
      }
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 15));
      inFlight -= 1;
      const day = prompt.match(/Write (\w+) only/)[1];
      return { objectives: `Obj ${day}`, content: `Content ${day}`, procedures: Object.fromEntries('ABCDEFGHIJ'.split('').map((k) => [k, `${k}-${day}`])) };
    });
    const spec = await buildDllParallel({ ctx: ctxWith(llm), instructions: 'Cells', source: { text: '', visionParts: [] } });
    expect(llm).toHaveBeenCalledTimes(6);
    expect(peak).toBe(5); // all five days at once
    const table = spec.blocks[0];
    expect(table.columns).toEqual(['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']);
    const row = (label) => table.rows.find((r) => r[0].startsWith(label));
    expect(row('A. Reviewing previous lesson')).toEqual(['A. Reviewing previous lesson or presenting the new lesson', 'A-Monday', 'A-Tuesday', 'A-Wednesday', 'A-Thursday', 'A-Friday']);
    expect(row('C. Learning Competencies')[1]).toBe('Comp Mon\nObj Monday');
    expect(row('VI. REFLECTION')).toBeTruthy();
    expect(spec.orientation).toBe('landscape');
    expect(spec.meta.find((m) => m.label === 'Teacher').value).toBe('Ben Santos');
  });

  it('retries a failed day once, and throws (so the caller falls back) if it fails twice', async () => {
    const frame = { days: [{ day: 'Monday', topic: 'T' }], contentStandard: 'CS' };
    let fails = 1;
    const flaky = vi.fn(async ({ prompt }) => {
      if (prompt.startsWith('Plan one week')) return frame;
      if (fails-- > 0) throw new Error('blip');
      return { objectives: 'o', content: 'c', procedures: { A: 'a' } };
    });
    await expect(buildDllParallel({ ctx: ctxWith(flaky), instructions: '', source: { text: '' } })).resolves.toBeTruthy();
    const broken = vi.fn(async ({ prompt }) => (prompt.startsWith('Plan one week') ? frame : { nope: true }));
    await expect(buildDllParallel({ ctx: ctxWith(broken), instructions: '', source: { text: '' } })).rejects.toThrow(/incomplete/);
  });
});

describe('buildTosParallel', () => {
  it('computes the TOS in code from the items actually written, with continuous numbering', async () => {
    const llm = vi.fn(async ({ prompt }) => {
      if (prompt.includes('"competencies"')) {
        return { title: 'Q2 Summative Test', learningArea: 'Math', totalItems: 10, competencies: [{ competency: 'Fractions', days: 3 }, { competency: 'Decimals', days: 2 }] };
      }
      const wants = [...prompt.matchAll(/(\d+) (remembering|understanding|applying|analyzing|evaluating|creating)/g)];
      const items = wants.flatMap(([, n, level]) => Array.from({ length: Number(n) }, (_, i) => ({ level, question: `${level} q${i}`, choices: ['a', 'b', 'c', 'd'], answer: 'b' })));
      return { items };
    });
    const spec = await buildTosParallel({ ctx: ctxWith(llm), instructions: '10 items', source: { text: '' } });
    const table = spec.blocks.find((b) => b.type === 'table');
    expect(table.rows[0].slice(0, 4)).toEqual(['Fractions', '3', '60%', '6']);
    expect(table.rows[1].slice(0, 4)).toEqual(['Decimals', '2', '40%', '4']);
    expect(table.rows[0].at(-1)).toBe('1–6');
    expect(table.rows[1].at(-1)).toBe('7–10');
    const total = table.rows.at(-1);
    expect(total[3]).toBe('10');
    expect(total.slice(4, 10).map(Number).reduce((a, b) => a + b, 0)).toBe(10);
    const q = spec.blocks.find((b) => b.type === 'questions');
    expect(q.items).toHaveLength(10);
    expect(q.showAnswers).toBe(true);
    expect(BLOOM_LEVELS).toHaveLength(6);
  });
});
