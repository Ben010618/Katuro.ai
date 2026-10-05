import { describe, it, expect } from 'vitest';
import { fastRoute, QUICK_PROMPTS } from './fastRoute';
import { extractPartialReply } from './planner';

const route = (prompt, attachedPaths = [], extra = {}) => fastRoute({ prompt, attachedPaths, persona: 'matt', teacherName: 'Sir Ben', ...extra });

describe('fastRoute', () => {
  it('answers greetings and thanks locally in each persona', () => {
    expect(route('hello')).toMatchObject({ local: true, tasks: [] });
    expect(route('Good morning po!').reply).toMatch(/^Yow Sir Ben!/);
    expect(route('Magandang umaga, Luna', [], { persona: 'luna', now: new Date(2026, 9, 3, 8) }).reply).toBe('A pleasant morning, Sir Ben. How may I help you with your classes today?');
    expect(route('salamat!').local).toBe(true);
    expect(route('hello, can you make me a DLL for Science 7?')).toBeNull();
  });

  it('routes every quick prompt when suitable files are attached', () => {
    const files = {
      item_analysis: ['a.xlsx'], remedial: ['a.xlsx'], class_record: ['a.xlsx'], attendance: ['sf2.xlsx'], voice_scores: ['Rizal.xlsx'],
      dll: ['Lesson.docx'], slides: ['Lesson.docx'], photo_table: ['photo.jpg'], merge_pdfs: ['a.pdf', 'b.pdf'],
    };
    for (const q of QUICK_PROMPTS) {
      const r = route(q.prompt, files[q.route]);
      expect(r, q.route).not.toBeNull();
      expect(r.tasks.length, q.route).toBeGreaterThan(0);
    }
  });

  it('voice encoding: opens the panel for one Excel/Word class record, with a spoken column', () => {
    expect(route('Encode scores by voice into column F', ['G7 Rizal.xlsx']).tasks).toEqual([
      { id: 't1', tool: 'voice_encode_scores', args: { targetPath: 'G7 Rizal.xlsx', column: 'F' }, label: 'Voice encoding – G7 Rizal.xlsx', dependsOn: [] },
    ]);
    expect(route('I will read the scores aloud for WW 3 in my class record', ['cr.xlsx']).tasks[0].args).toEqual({ targetPath: 'cr.xlsx', column: 'WW3' });
    expect(route('dictate grades', ['record.docx']).tasks[0].tool).toBe('voice_encode_scores');
    // Not an editable file, or two files: the planner decides / asks.
    expect(route('Encode scores by voice', ['scores.pdf'])).toBeNull();
    expect(route('Encode scores by voice', ['a.xlsx', 'b.xlsx'])).toBeNull();
    // Without voice words, the e-Class Record route is unchanged.
    expect(route('Encode the attached scores into an official DepEd e-Class Record with transmutation.', ['a.xlsx']).tasks[0].tool).toBe('make_class_record');
  });

  it('builds dependent remedial tasks per file', () => {
    const r = route(QUICK_PROMPTS.find((q) => q.route === 'remedial').prompt, ['A.xlsx', 'B.xlsx']);
    expect(r.tasks.map((t) => [t.id, t.tool, t.dependsOn])).toEqual([
      ['t1', 'analyze_scores', []], ['t2', 'make_remedial_package', ['t1']],
      ['t3', 'analyze_scores', []], ['t4', 'make_remedial_package', ['t3']],
    ]);
  });

  it('routes short single-intent free text, and defers anything uncertain to the planner', () => {
    expect(route('item analysis please', ['q.xlsx']).tasks[0].tool).toBe('analyze_scores');
    expect(route('compare these two', ['a.xlsx', 'b.docx']).tasks[0].tool).toBe('compare_files');
    expect(route('what is this file?', ['x.docx']).tasks[0].tool).toBe('understand_file');
    expect(route('merge these pdfs', ['a.pdf', 'b.pdf']).tasks[0].args.paths).toEqual(['a.pdf', 'b.pdf']);
    expect(route('item analysis please')).toBeNull(); // no file → planner asks which
    expect(route('item analysis please', ['lesson.docx'])).toBeNull(); // wrong file type
    expect(route('item analysis and then compare with last quarter', ['q.xlsx'])).toBeNull(); // multi-step
    expect(route('compare these', ['a.xlsx'])).toBeNull(); // needs exactly two
    expect(route('Make a 10-item quiz on fractions for Grade 5')).toBeNull();
    expect(route('x'.repeat(200), ['q.xlsx'])).toBeNull();
  });

  it('uses the active file when nothing is attached', () => {
    expect(route('item analysis please', [], { activePath: 'Scores/q.xlsx' }).tasks[0].args.path).toBe('Scores/q.xlsx');
  });
});

describe('extractPartialReply', () => {
  it('reads the reply string from streaming JSON', () => {
    expect(extractPartialReply('{"rep')).toBeNull();
    expect(extractPartialReply('{"reply": "Sige')).toBe('Sige');
    expect(extractPartialReply('{"reply": "Line 1\\nLine \\"2\\"", "tasks": [')).toBe('Line 1\nLine "2"');
    expect(extractPartialReply('{"reply": "Ma\\u00f1ana \\')).toBe('Mañana ');
    expect(extractPartialReply('{"tasks": [], "reply": "Done."}')).toBe('Done.');
  });
});
