import { describe, it, expect } from 'vitest';
import { classDay, lessonFor, periodsOn, dueEvents, lessonsToPrepare, classProblems, nextSchoolDay, inClassNow, pruneFired, clock, className, DEFAULT_SETTINGS, at } from './teachingDay';
import { matatagSequence, matatagTerms, typedSequence, sequenceText, verifiedGuideItems } from './sequence';
import { assistantLine } from './assistantLines';
import { buildLessonTasks, lessonFolder, lessonInstructions, mondayOf, weekPlan } from './prepareLesson';

const rizal = { id: 'r', subject: 'Science', grade: 'Grade 7', section: 'Rizal', days: [1, 2, 3, 4, 5], start: '07:30', end: '08:20' };
const mabini = { ...rizal, id: 'm', section: 'Mabini', start: '08:30', end: '09:20' };
const seq = { items: [{ code: 'A1', text: 'Mixtures and solutions', sessions: 2 }, { code: 'A2', text: 'Separating mixtures', sessions: 1 }, { code: 'A3', text: 'Acids and bases', sessions: 3 }], startDate: '2026-10-26' };
const sequences = { r: seq, m: seq };

describe('which days a class meets (DO 9 calendar)', () => {
  it('weekdays of the class only; holidays, INSET and "no classes" days are off; test days and end-of-term have no new lesson', () => {
    expect(classDay(rizal, '2026-10-26')).toEqual({ meets: true });                                   // Monday
    expect(classDay(rizal, '2026-10-31').meets).toBe(false);                                          // Saturday
    expect(classDay(rizal, '2026-11-02')).toEqual({ meets: false, reason: "holiday: All Souls' Day" });
    expect(classDay(rizal, '2026-09-10').reason).toMatch(/^INSET/);
    expect(classDay(rizal, '2026-10-29').special).toMatchObject({ kind: 'assessment', title: 'Term 2: Second Teacher-made Summative Test' });
    expect(classDay(rizal, '2026-09-03').special.kind).toBe('endOfTerm');
    expect(classDay(rizal, '2026-10-27', { noClass: ['2026-10-27'] }).meets).toBe(false);
    expect(classDay(rizal, '2026-10-27', { noClassFor: { m: ['2026-10-27'] } }).meets).toBe(true);    // only Mabini off
  });

  it('class entries are checked: times, grade, days, overlaps', () => {
    expect(classProblems(rizal)).toEqual([]);
    expect(classProblems({ ...rizal, end: '07:00' })).toEqual(['the class must end after it starts']);
    expect(classProblems({ ...rizal, grade: '7', days: [] })).toEqual(['the grade is missing', 'pick at least one day']);
    expect(classProblems({ ...mabini, start: '08:00' }, [rizal])).toEqual(['it overlaps Science 7 – Rizal (7:30 AM–8:20 AM)']);
    expect([clock('13:05'), clock('07:30'), className(rizal)]).toEqual(['1:05 PM', '7:30 AM', 'Science 7 – Rizal']);
  });
});

describe('which lesson falls on each meeting', () => {
  it('one session per meeting; test days, holidays and "not finished" do not move the lessons', () => {
    const l = (iso, log) => { const r = lessonFor(rizal, iso, seq, log); return r.kind === 'lesson' ? `${r.item.code}:${r.session}/${r.sessions}` : r.kind; };
    // Mon 26, Tue 27, Wed 28, Thu 29 (test day), Fri 30, Mon Nov 2 (holiday), Tue Nov 3
    expect(['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-11-02', '2026-11-03'].map((d) => l(d))).toEqual(['A1:1/2', 'A1:2/2', 'A2:1/1', 'special', 'A3:1/3', 'none', 'A3:2/3']);
    // "Not finished" on Tuesday: Wednesday repeats meeting 2 of A1.
    expect(l('2026-10-28', { repeat: { r: ['2026-10-27'] } })).toBe('A1:2/2');
    expect(lessonFor(rizal, '2026-11-06', seq).kind).toBe('finished');
    expect(lessonFor(rizal, '2026-10-26', null).kind).toBe('noSequence');
    expect(lessonFor(rizal, '2026-10-20', seq).kind).toBe('noSequence');                               // before the start
  });

  it('a day\'s periods in time order; sections with the same lesson share one key', () => {
    const p = periodsOn([mabini, rizal], '2026-10-26', sequences);
    expect(p.map((x) => x.cls.section)).toEqual(['Rizal', 'Mabini']);
    expect(p[0].lesson.key).toBe(p[1].lesson.key);
    expect(nextSchoolDay([rizal], '2026-10-30', sequences)).toBe('2026-11-03');                     // skips the weekend and the holiday
  });
});

describe('reminders, brief, after-class and preparation timing', () => {
  const state = { classes: [rizal, mabini], sequences, log: {}, settings: DEFAULT_SETTINGS, fired: {} };
  const t = (hhmm, iso = '2026-10-26') => { const [h, m] = hhmm.split(':').map(Number); return at(iso, h * 60 + m); };

  it('morning brief before the first class only; 30 and 10 minute reminders; when the app opens late only the latest one', () => {
    expect(dueEvents(t('06:29'), state).events).toEqual([]);
    expect(dueEvents(t('06:31'), state).events.map((e) => e.type)).toEqual(['brief']);
    const at7 = dueEvents(t('07:00'), { ...state, fired: { 'brief|2026-10-26': 1 } }).events;
    expect(at7.map((e) => [e.type, e.key])).toEqual([['remind', 'remind|2026-10-26|r|30']]);
    const late = dueEvents(t('07:25'), state);                                                       // app opened at 7:25
    expect(late.events.map((e) => e.key)).toEqual(['remind|2026-10-26|r|10']);
    expect(late.skip).toEqual(['brief|2026-10-26', 'remind|2026-10-26|r|30']);
    expect(late.events[0].minutes).toBe(5);
  });

  it('after-class check within an hour after the end; quiet during class', () => {
    const e = dueEvents(t('08:21'), { ...state, fired: { 'brief|2026-10-26': 1, 'remind|2026-10-26|m|30': 1 } }).events;
    expect(e.map((x) => x.type)).toEqual(['remind', 'after']);                                       // Mabini soon, Rizal done
    expect(inClassNow(t('07:45'), state).cls.id).toBe('r');
    expect(inClassNow(t('12:00'), state)).toBe(null);
    expect(dueEvents(t('08:21'), { ...state, settings: { ...DEFAULT_SETTINGS, afterClass: false }, fired: { 'brief|2026-10-26': 1, 'remind|2026-10-26|m|30': 1 } }).events.map((x) => x.type)).toEqual(['remind']);
  });

  it('prepares today\'s coming lessons, and the next school day\'s after the prep time; shared lessons once', () => {
    const morning = lessonsToPrepare(t('06:00'), state);
    expect(morning).toHaveLength(1);                                                                 // Rizal and Mabini share the lesson
    expect(morning[0].sections.map((c) => c.section)).toEqual(['Rizal', 'Mabini']);
    expect(lessonsToPrepare(t('06:00'), { ...state, prepared: { [morning[0].key]: { status: 'ready' } } })).toEqual([]);
    const evening = lessonsToPrepare(t('19:30'), state);
    expect(evening.map((j) => j.iso)).toEqual(['2026-10-27']);                                      // today's are over
    const failedRecently = { [morning[0].key]: { status: 'failed', at: t('05:50') } };
    expect(lessonsToPrepare(t('06:00'), { ...state, prepared: failedRecently })).toEqual([]);
    expect(lessonsToPrepare(t('06:30'), { ...state, prepared: failedRecently })).toHaveLength(1);    // retried after 30 min
    const stuck = { [morning[0].key]: { status: 'preparing', at: t('05:30') } };
    expect(lessonsToPrepare(t('05:40'), { ...state, prepared: stuck })).toEqual([]);                  // still being made
    expect(lessonsToPrepare(t('06:00'), { ...state, prepared: stuck })).toHaveLength(1);              // stuck: made again
  });

  it('old fired keys are dropped', () => {
    expect(pruneFired({ 'brief|2026-10-20': 1, 'brief|2026-10-25': 1 }, t('06:00'))).toEqual({ 'brief|2026-10-25': 1 });
  });
});

describe('lesson sequences: built-in data (exact only), typed, curriculum guide', () => {
  it('exact subject, grade and term only; nothing for a grade the data does not have', () => {
    const terms = matatagTerms('Science', 'Grade 3');
    expect(terms[0]).toBe(1);
    const s = matatagSequence('science', 'Grade 3', 1);
    expect(s[0]).toMatchObject({ code: 'S3MT-Ia-b-1', sessions: 10 });
    expect(matatagSequence('Science', 'Grade 99', 1)).toBe(null);
    expect(matatagSequence('Sci', 'Grade 3', 1)).toBe(null);
  });

  it('typed topics, with codes and meetings; problems reported', () => {
    const r = typedSequence('S7MT-Ic-3 | Mixtures and solutions | 3\nSeparating mixtures (2)\n3. Acids and bases\nxx\nTopic | 99');
    expect(r.items).toEqual([{ code: 'S7MT-Ic-3', text: 'Mixtures and solutions', sessions: 3 }, { code: '', text: 'Separating mixtures', sessions: 2 }, { code: '', text: 'Acids and bases', sessions: 1 }]);
    expect(r.problems).toEqual(['line 4 has no topic', 'line 5: the number of meetings must be 1 to 40']);
    expect(typedSequence(sequenceText(r.items)).items).toEqual(r.items);
  });

  it('competencies from a curriculum guide are kept only when they are really in the file', () => {
    const guide = 'Quarter 2. S7MT-IIa-1 Describe the components of a scientific investigation. S7MT-IIb-2 Classify mixtures as homogeneous or heterogeneous.';
    const r = verifiedGuideItems(guide, [
      { code: 'S7MT-IIa-1', text: 'Describe the components of a scientific investigation', sessions: 2 },
      { code: 'S7MT-IIc-9', text: 'Explain photosynthesis in detail', sessions: 1 },
      { code: 'S7MT-IIb-2', text: 'Classify mixtures as homogeneous or heterogeneous', sessions: 99 },
    ]);
    expect(r.items).toEqual([{ code: 'S7MT-IIa-1', text: 'Describe the components of a scientific investigation', sessions: 2 }, { code: 'S7MT-IIb-2', text: 'Classify mixtures as homogeneous or heterogeneous', sessions: 1 }]);
    expect(r.dropped).toBe(1);
  });
});

describe('what the persona says', () => {
  const facts = { name: "Ma'am Ana", cls: 'Science 7 – Rizal', time: '7:30 AM', minutes: 10, topic: 'Mixtures and solutions', status: 'ready' };
  it('each persona, the same facts, no emoji, no "Sir" for a Ma\'am', () => {
    for (const p of ['matt', 'luna', 'grey', 'carmen']) {
      const { title, text } = assistantLine(p, 'remind', facts);
      expect(title).toBe('Science 7 – Rizal at 7:30 AM');
      expect(text).toContain("Ma'am Ana");
      expect(text).toContain('Science 7 – Rizal');
      expect(text).toContain('10 minutes');
      expect(text).toContain('Mixtures and solutions');
      expect(text).not.toMatch(/\bSir\b|[\u{1F300}-\u{1FAFF}]/u);
    }
    expect(assistantLine('luna', 'brief', { name: 'Sir Ben', count: 2, classes: ['Science 7 – Rizal', 'Science 7 – Mabini'], ready: 1, notReady: 1 }).text)
      .toBe('Good morning, Sir Ben. You have 2 classes today: Science 7 – Rizal and Science 7 – Mabini. 1 of 2 lessons are ready; I\'m preparing the rest.');
    expect(assistantLine('matt', 'remind', { ...facts, status: 'preparing' }).text).toMatch(/still preparing "Mixtures and solutions"/);
  });
});

describe('lesson preparation tasks', () => {
  const job = { key: 'k', iso: '2026-10-26', cls: rizal, sections: [rizal, mabini], lesson: lessonFor(rizal, '2026-10-26', seq), minutes: 50 };
  it('a lesson plan and slides, saved in the day\'s Lesson Prep folder; instructions carry the competency and the meeting number', () => {
    const tasks = buildLessonTasks(job, DEFAULT_SETTINGS, ['Science 7/Module 2.pdf']);
    expect(tasks.map((t) => t.tool)).toEqual(['write_document', 'make_slides']);
    expect(tasks[0].args).toMatchObject({ docType: 'dlp', outputFolder: 'Lesson Prep/2026-10-26 Monday/Science 7 - Mixtures and solutions', sourcePaths: ['Science 7/Module 2.pdf'], gradeLevel: 'Grade 7' });
    expect(tasks[1].args.slideCount).toBe(10);
    const ins = lessonInstructions(job);
    expect(ins).toMatch(/sections Rizal, Mabini/);
    expect(ins).toMatch(/Learning competency \(A1\): Mixtures and solutions/);
    expect(ins).toMatch(/meeting 1 of 2/);
    expect(buildLessonTasks(job, { ...DEFAULT_SETTINGS, planFormat: 'dll', worksheet: true }).map((t) => t.args.docType || 'slides')).toEqual(['slides', 'worksheet']);
  });

  it('the weekly DLL lists each day as it really is', () => {
    expect(mondayOf('2026-10-29')).toBe('2026-10-26');
    expect(weekPlan(rizal, '2026-10-26', { r: seq }, {})).toEqual([
      'Monday 2026-10-26: A1 Mixtures and solutions (meeting 1 of 2)',
      'Tuesday 2026-10-27: A1 Mixtures and solutions (meeting 2 of 2)',
      'Wednesday 2026-10-28: A2 Separating mixtures (meeting 1 of 1)',
      'Thursday 2026-10-29: Term 2: Second Teacher-made Summative Test (no new lesson)',
      'Friday 2026-10-30: A3 Acids and bases (meeting 1 of 3)',
    ]);
    expect(lessonFolder({ kind: 'dll', monday: '2026-10-26', cls: rizal })).toBe('Lesson Prep/Week of 2026-10-26/Science 7 - DLL');
  });
});
