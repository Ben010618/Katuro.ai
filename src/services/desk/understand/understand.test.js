import { describe, it, expect, vi } from 'vitest';
import { mapFromGrids } from './gridMap';
import { validateLayout, recognizeMap, harvestNames } from './recognize';
import { extractData, attendanceDays } from './extract';
import { planTransfer, compareTables, matchLearners } from './transfer';
import { labelSet, similarity } from './fingerprint';
import { createTemplateMemory } from './templateMemory';
import { createNameMasker } from '../agent/privacy';

// A school's own SF2-like attendance sheet (custom layout: names in C, days from E).
function sf2Rows(learners) {
  return [
    ['', 'RIZAL NATIONAL HIGH SCHOOL'],
    ['', 'School Form 2 Daily Attendance Report of Learners'],
    ['', 'School ID:', '301234', '', 'Month:', 'October'],
    ['', 'Grade & Section:', 'Grade 7 - Sampaguita'],
    ['No.', '', "LEARNER'S NAME", 'LRN', 1, 2, 3, 6, 7, 'Absent'],
    ['', '', 'MALE'],
    ...learners.filter((l) => l.sex === 'M').map((l, i) => [i + 1, '', l.name, l.lrn, ...l.days, '']),
    ['', '', 'FEMALE'],
    ...learners.filter((l) => l.sex === 'F').map((l, i) => [i + 1, '', l.name, l.lrn, ...l.days, '']),
    ['', '', 'TOTAL'],
    ['', 'Prepared by:', 'Ben Santos'],
  ];
}

const SF2_LAYOUT = {
  docType: 'attendance',
  title: 'SF2 October',
  confidence: 0.9,
  fields: [
    { key: 'school_id', label: 'School ID', location: { sheet: 'SF2', cell: 'C3' } },
    { key: 'month', label: 'Month', location: { sheet: 'SF2', cell: 'F3' } },
    { key: 'bogus', label: 'x', location: { sheet: 'Nope', cell: 'A1' } },
  ],
  tables: [{
    id: 'att', purpose: 'attendance',
    location: { sheet: 'SF2', firstRow: 6, lastRow: 10 },
    nameColumn: 'C',
    columns: [
      { key: 'name', column: 'C', header: "LEARNER'S NAME", meaning: 'learner_name' },
      { key: 'lrn', column: 'D', header: 'LRN', meaning: 'lrn' },
      { key: 'd1', column: 'E', header: '1', meaning: 'day', day: 1 },
      { key: 'd2', column: 'F', header: '2', meaning: 'day', day: 2 },
      { key: 'd3', column: 'G', header: '3', meaning: 'day', day: 3 },
      { key: 'd6', column: 'H', header: '6', meaning: 'day', day: 6 },
      { key: 'd7', column: 'I', header: '7', meaning: 'day', day: 7 },
      { key: 'abs', column: 'J', header: 'Absent', meaning: 'absences' },
      { key: 'bad', column: 'not-a-col', header: '?', meaning: 'score' },
    ],
    marks: { absent: ['x'], present: [''], tardy: [] },
  }],
};

const LEARNERS = [
  { name: 'Dela Cruz, Juan P.', lrn: '100000000001', sex: 'M', days: ['', '', '', '', ''] },
  { name: 'Reyes, Pedro A.', lrn: '100000000002', sex: 'M', days: ['', '', '', '', ''] },
  { name: 'Santos, Maria L.', lrn: '100000000003', sex: 'F', days: ['', '', '', '', ''] },
];

function sf2Map(learners = LEARNERS) {
  return mapFromGrids([{ name: 'SF2', rows: sf2Rows(learners) }]);
}

// Attendance typed by a teacher in a Word table (different layout + marks).
const WORD_ATTENDANCE = {
  kind: 'docx',
  blocks: [
    { id: 'p0', type: 'paragraph', text: 'Attendance – Grade 7 Sampaguita – October' },
    {
      id: 't0', type: 'table', rows: [
        ['Name', 'Oct 1', 'Oct 2', 'Oct 3', 'Oct 6', 'Oct 7'],
        ['JUAN DELA CRUZ', '/', 'A', '/', '/', 'A'],
        ['Maria Santos', '/', '/', '/', '/', '/'],
        ['Ana Lopez', 'A', '/', '/', '/', '/'],
      ].map((row, r) => row.map((text, c) => ({ id: `t0.r${r}.c${c}`, text, paragraphs: [{ id: `t0.r${r}.c${c}.p0`, text }] }))),
    },
  ],
};
const WORD_LAYOUT = {
  docType: 'attendance', confidence: 0.9, fields: [],
  tables: [{
    id: 'w', purpose: 'attendance', location: { table: 't0', firstRow: 1, lastRow: 3 }, nameColumn: 0,
    columns: [
      { key: 'n', column: 0, header: 'Name', meaning: 'learner_name' },
      ...[1, 2, 3, 6, 7].map((d, i) => ({ key: `oct${d}`, column: i + 1, header: `Oct ${d}`, meaning: 'day', day: d })),
    ],
    marks: { absent: ['A'], present: ['/'], tardy: [] },
  }],
};

describe('validateLayout', () => {
  it('drops addresses the document cannot back up', () => {
    const v = validateLayout(SF2_LAYOUT, sf2Map());
    expect(v.fields.map((f) => f.key)).toEqual(['school_id', 'month']);
    expect(v.tables[0].columns.map((c) => c.key)).not.toContain('bad');
    expect(validateLayout({ tables: [{ location: { sheet: 'SF2', firstRow: 9, lastRow: 2 }, nameColumn: 'C' }] }, sf2Map()).tables).toHaveLength(0);
  });
});

describe('extractData', () => {
  it('reads fields, skips MALE/FEMALE/TOTAL rows and records sex', () => {
    const data = extractData(sf2Map(), validateLayout(SF2_LAYOUT, sf2Map()));
    expect(data.fields.school_id.value).toBe('301234');
    expect(data.fields.month.value).toBe('October');
    const t = data.tables[0];
    expect(t.learners.map((l) => [l.name, l.sex, l.lrn])).toEqual([
      ['Dela Cruz, Juan P.', 'M', '100000000001'],
      ['Reyes, Pedro A.', 'M', '100000000002'],
      ['Santos, Maria L.', 'F', '100000000003'],
    ]);
    expect(t.learners[2].cells.d2).toEqual({ sheet: 'SF2', cell: 'F10' });
  });

  it('keeps reading past lastRow when a remembered template meets a bigger section', () => {
    const more = [...LEARNERS, { name: 'Garcia, Ana R.', lrn: '100000000004', sex: 'F', days: ['', '', '', '', ''] }, { name: 'Lopez, Carla D.', lrn: '100000000005', sex: 'F', days: ['', '', '', '', ''] }];
    const data = extractData(sf2Map(more), validateLayout(SF2_LAYOUT, sf2Map(more)));
    expect(data.tables[0].learners.map((l) => l.name)).toContain('Lopez, Carla D.');
    expect(data.tables[0].learners.some((l) => /Prepared|TOTAL/i.test(l.name))).toBe(false);
  });

  it('reads a Word table and attendance statuses with its own marks', () => {
    const data = extractData(WORD_ATTENDANCE, validateLayout(WORD_LAYOUT, WORD_ATTENDANCE));
    const t = data.tables[0];
    expect(t.learners).toHaveLength(3);
    expect(attendanceDays(t, t.learners[0]).filter((d) => d.status === 'A').map((d) => d.day)).toEqual([2, 7]);
  });
});

describe('planTransfer: Word attendance → school SF2 Excel', () => {
  const src = extractData(WORD_ATTENDANCE, validateLayout(WORD_LAYOUT, WORD_ATTENDANCE)).tables[0];
  const tgt = extractData(sf2Map(), validateLayout(SF2_LAYOUT, sf2Map())).tables[0];

  it('matches names despite order/case/initials, maps days, and translates marks', () => {
    const plan = planTransfer(src, tgt, { targetKind: 'xlsx' });
    expect(plan.stats.matched).toBe(2);
    expect(plan.unmatched.map((u) => u.name)).toEqual(['Ana Lopez']);
    expect(plan.unmatchedTarget).toEqual(['Reyes, Pedro A.']);
    // Juan absent Oct 2 and Oct 7 → "x" in F7 and I7; "/" (present) leaves cells blank.
    expect(plan.edits).toEqual([
      { sheet: 'SF2', cell: 'F7', value: 'x' },
      { sheet: 'SF2', cell: 'I7', value: 'x' },
    ]);
    expect(plan.nameFixes.map((n) => n.target)).toContain('Dela Cruz, Juan P.');
    expect(plan.changes[0]).toMatchObject({ targetName: 'Dela Cruz, Juan P.', location: 'SF2!F7', after: 'x' });
  });

  it('keeps already-filled target cells unless overwrite is requested', () => {
    const filled = LEARNERS.map((l, i) => (i === 0 ? { ...l, days: ['', 'L', '', '', ''] } : l));
    const tgt2 = extractData(sf2Map(filled), validateLayout(SF2_LAYOUT, sf2Map(filled))).tables[0];
    const plan = planTransfer(src, tgt2, { targetKind: 'xlsx' });
    expect(plan.conflicts.map((c) => c.location)).toEqual(['SF2!F7']);
    expect(planTransfer(src, tgt2, { targetKind: 'xlsx', overwrite: true }).edits.map((e) => e.cell)).toContain('F7');
  });

  it('produces docx cell edits when the target is a Word table', () => {
    const plan = planTransfer(tgt, src, { targetKind: 'docx' });
    expect(plan.edits.every((e) => /^t0\.r\d+\.c\d+$/.test(e.id) && typeof e.text === 'string')).toBe(true);
  });
});

describe('matchLearners', () => {
  it('prefers LRN and refuses ambiguous names', () => {
    const r = matchLearners(
      [{ name: 'Santos, M.', lrn: '100000000003' }, { name: 'Cruz, J.' }],
      [{ name: 'Santos, Maria L.', lrn: '100000000003' }, { name: 'Cruz, Jose' }, { name: 'Cruz, Juan' }],
    );
    expect(r.pairs[0].by).toBe('lrn');
    expect(r.unmatched.map((u) => u.learner.name)).toEqual(['Cruz, J.']);
  });
});

describe('compareTables', () => {
  it('reports roster gaps, spelling variants and value mismatches', () => {
    const a = { columns: [{ key: 'g', header: 'Grade', meaning: 'grade' }], learners: [
      { name: 'Dela Cruz, Juan P.', values: { g: 88 }, cells: { g: { sheet: 'S', cell: 'D5' } } },
      { name: 'Santos, Maria', values: { g: 92 }, cells: { g: { sheet: 'S', cell: 'D6' } } },
      { name: 'Reyes, Pedro', values: { g: 80 }, cells: { g: { sheet: 'S', cell: 'D7' } } },
    ] };
    const b = { columns: [{ key: 'fg', header: 'Final Grade', meaning: 'grade' }], learners: [
      { name: 'JUAN DELA CRUZ', values: { fg: 88 }, cells: { fg: { sheet: 'T', cell: 'H9' } } },
      { name: 'Maria Santos', values: { fg: 90 }, cells: { fg: { sheet: 'T', cell: 'H10' } } },
      { name: 'Lopez, Ana', values: { fg: 85 }, cells: { fg: { sheet: 'T', cell: 'H11' } } },
    ] };
    const c = compareTables(a, b);
    expect(c.onlyInA.map((x) => x.name)).toEqual(['Reyes, Pedro']);
    expect(c.onlyInB).toEqual(['Lopez, Ana']);
    expect(c.mismatches).toEqual([expect.objectContaining({ learner: 'Santos, Maria', a: 92, b: 90, aLocation: 'S!D6', bLocation: 'T!H10' })]);
    expect(c.nameVariants).toEqual([expect.objectContaining({ a: 'Dela Cruz, Juan P.', b: 'JUAN DELA CRUZ' })]); // 'Santos, Maria' = 'Maria Santos'
  });
});

describe('template memory + recognition', () => {
  const renderMapForAI = () => 'MAP';

  it('fingerprints the same template across sections regardless of learner names', () => {
    const other = [{ name: 'Bautista, Leo', lrn: '1', sex: 'M', days: ['x', '', '', '', ''] }];
    expect(similarity(labelSet(sf2Map()), labelSet(sf2Map(other)))).toBeGreaterThan(0.9);
    expect([...labelSet(sf2Map())].some((l) => /dela cruz/.test(l))).toBe(false);
  });

  it('asks the AI once, then recognizes the next copy from memory with no AI call', async () => {
    const memory = createTemplateMemory({ initial: [] });
    const llm = vi.fn().mockResolvedValue(SF2_LAYOUT);
    const ctx = { llm, masker: createNameMasker() };
    const first = await recognizeMap(sf2Map(), { name: 'SF2_Sampaguita.xlsx', ctx, memory, renderMapForAI });
    expect(first.source).toBe('ai');
    const second = await recognizeMap(sf2Map([{ name: 'Bautista, Leo', lrn: '9', sex: 'M', days: ['', '', '', '', ''] }]), { name: 'SF2_Rosal.xlsx', ctx, memory, renderMapForAI });
    expect(second.source).toBe('memory');
    expect(llm).toHaveBeenCalledTimes(1);
  });

  it('masks learner names before the map goes to the AI', async () => {
    const llm = vi.fn().mockResolvedValue(SF2_LAYOUT);
    const ctx = { llm, masker: createNameMasker() };
    await recognizeMap(sf2Map(), { name: 'x.xlsx', ctx, memory: createTemplateMemory({ initial: [] }), renderMapForAI: (m) => JSON.stringify(m) });
    expect(llm.mock.calls[0][0].prompt).not.toContain('Dela Cruz');
    expect(harvestNames(sf2Map())).toContain('Santos, Maria L.');
  });
});
