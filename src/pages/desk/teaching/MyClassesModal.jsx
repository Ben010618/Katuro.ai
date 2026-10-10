import { useMemo, useState } from 'react';
import { X, Plus, Trash2, Pencil, RefreshCw, FileText, Presentation } from 'lucide-react';
import { useDeskStore, workspaceIdOf } from '../../../store/deskStore';
import { flattenFileTree, openInDefaultApp, readFileBytes } from '../../../services/localFileSystem';
import { readDocument } from '../../../services/desk/readers/index';
import { DEFAULT_SETTINGS, classProblems, className, clock, isoDay, addDays, weekday, lessonFor, periodsOn, toMin } from '../../../services/desk/teaching/teachingDay';
import { matatagTerms, matatagSequence, typedSequence, sequenceText } from '../../../services/desk/teaching/sequence';
import { extractGuideSequence } from '../../../services/desk/teaching/guideImport';
import { lessonFiles, lessonStatus } from '../../../services/desk/teaching/assistantMessages';
import { mondayOf } from '../../../services/desk/teaching/prepareLesson';
import { getPersona } from '../../../services/desk/personas';
import { requestPrepare } from './assistantEngine';

const DAYS = [[1, 'Mon'], [2, 'Tue'], [3, 'Wed'], [4, 'Thu'], [5, 'Fri'], [6, 'Sat']];
const GRADES = ['Kindergarten', ...Array.from({ length: 12 }, (_, i) => `Grade ${i + 1}`)];
const SUBJECTS = ['Mathematics', 'Science', 'English', 'Filipino', 'Araling Panlipunan', 'MAPEH', 'Music', 'Arts', 'Physical Education', 'Health', 'GMRC', 'Values Education', 'EPP', 'TLE', 'Makabansa', 'Language', 'Reading and Literacy'];
const btn = 'inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-gray-300 text-[11px] font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50';
const primary = 'inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold disabled:opacity-50';
const input = 'w-full rounded-lg border border-gray-300 bg-white px-2 py-1 text-xs text-gray-800';
const label = 'block text-[11px] font-semibold text-gray-700 mb-0.5';
const STATUS = { ready: ['Ready', 'text-emerald-700'], preparing: ['Preparing…', 'text-gray-600'], failed: ['Could not prepare', 'text-red-600'], missing: ['Not prepared yet', 'text-gray-500'] };
const prettyDay = (iso) => new Date(`${iso}T12:00:00`).toLocaleDateString('en-PH', { weekday: 'long', month: 'long', day: 'numeric' });

function useHere() {
  const s = useDeskStore();
  const wsId = workspaceIdOf(s.workspace);
  const prepared = useMemo(() => Object.fromEntries(Object.entries(s.preparedLessons).filter(([, r]) => r.workspaceId === wsId)), [s.preparedLessons, wsId]);
  return { s, prepared };
}

/* ── Today ─────────────────────────────────────────────────────────────── */
function TodayTab({ onError }) {
  const { s, prepared } = useHere();
  const [day, setDay] = useState(() => isoDay());
  const today = isoDay();
  const rows = s.myClasses
    .filter((c) => (c.days || []).includes(weekday(day)) && !classProblems(c).length)
    .map((c) => ({ cls: c, lesson: lessonFor(c, day, s.lessonSequences[c.id], s.teachingLog) }))
    .sort((a, b) => toMin(a.cls.start) - toMin(b.cls.start));
  const allOff = (s.teachingLog.noClass || []).includes(day);
  const realFolder = s.workspace?.handle?.kind === 'electron';

  const prepareWeek = () => {
    const monday = mondayOf(day);
    const jobs = new Map();
    for (let i = 0; i < 6; i += 1) {
      const d = addDays(monday, i);
      for (const p of periodsOn(s.myClasses, d, s.lessonSequences, s.teachingLog)) {
        if (p.lesson.kind !== 'lesson' || lessonStatus(prepared[p.lesson.key]) === 'ready') continue;
        if (jobs.has(p.lesson.key)) jobs.get(p.lesson.key).sections.push(p.cls);
        else jobs.set(p.lesson.key, { key: p.lesson.key, iso: d, cls: p.cls, sections: [p.cls], lesson: p.lesson, start: p.start });
      }
    }
    requestPrepare([...jobs.values()]);
    onError(jobs.size ? `Preparing ${jobs.size} lesson(s) for the week of ${monday} in the background. You can keep working.` : 'Every lesson of that week is already prepared.');
  };
  const open = async (f) => {
    try { await openInDefaultApp(s.workspace?.handle, f.path); } catch { onError('I could not open that file. It may have been moved or renamed.'); }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <div>
          <label className={label} htmlFor="kt-day">Day</label>
          <input id="kt-day" type="date" value={day} onChange={(e) => e.target.value && setDay(e.target.value)} className={input} />
        </div>
        <button type="button" className={btn} onClick={() => setDay(today)}>Today</button>
        <button type="button" className={btn} onClick={() => setDay(addDays(day, 1))}>Next day</button>
        <span className="flex-1" />
        <button type="button" className={btn} onClick={() => s.setNoClass(day, null, !allOff)}>{allOff ? 'Classes resume this day' : 'No classes this day'}</button>
        <button type="button" className={primary} disabled={!realFolder || !s.myClasses.length} onClick={prepareWeek}>Prepare this week</button>
      </div>
      <p className="text-xs font-bold text-gray-800">{prettyDay(day)}</p>
      {!realFolder && <p className="text-[11px] text-amber-700">Open your classroom folder so I can prepare lessons there.</p>}
      {!rows.length && <p className="text-[11px] text-gray-500">{s.myClasses.length ? 'No classes on this day.' : 'Add your classes in the Classes tab first.'}</p>}
      <ul className="space-y-2">
        {rows.map(({ cls, lesson }) => {
          const rec = lesson.kind === 'lesson' ? prepared[lesson.key] : null;
          const st = lessonStatus(rec);
          const files = lessonFiles(rec);
          const off = (s.teachingLog.noClassFor?.[cls.id] || []).includes(day);
          const repeated = (s.teachingLog.repeat?.[cls.id] || []).includes(day);
          return (
            <li key={cls.id} className="rounded-xl border border-gray-200 bg-white p-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-xs font-bold text-gray-900">{clock(cls.start)}–{clock(cls.end)} · {className(cls)}{cls.room ? ` · ${cls.room}` : ''}</p>
                {lesson.kind === 'lesson' && <span className={`text-[11px] font-semibold ${STATUS[st][1]}`}>{STATUS[st][0]}</span>}
              </div>
              {lesson.kind === 'lesson' && (
                <p className="mt-1 text-xs text-gray-800">{lesson.item.code ? <span className="font-semibold">{lesson.item.code} </span> : null}{lesson.item.text} <span className="text-gray-500">(meeting {lesson.session} of {lesson.sessions})</span></p>
              )}
              {lesson.kind === 'special' && <p className="mt-1 text-xs text-gray-700">{lesson.special.title}. No new lesson.</p>}
              {lesson.kind === 'none' && <p className="mt-1 text-xs text-gray-500">No class: {lesson.reason}.</p>}
              {lesson.kind === 'noSequence' && <p className="mt-1 text-xs text-amber-700">The next lesson is not known yet. Set this class's lessons in the Lessons tab.</p>}
              {lesson.kind === 'finished' && <p className="mt-1 text-xs text-amber-700">All the lessons you set are done. Add the next ones in the Lessons tab.</p>}
              {rec?.note && <p className="mt-1 text-[11px] text-gray-500">{rec.note}</p>}
              <div className="mt-2 flex flex-wrap gap-1.5">
                {files.slides && <button type="button" className={btn} onClick={() => open(files.slides)}><Presentation size={12} /> Open slides</button>}
                {files.plan && <button type="button" className={btn} onClick={() => open(files.plan)}><FileText size={12} /> Open lesson plan</button>}
                {lesson.kind === 'lesson' && st !== 'preparing' && (
                  <button type="button" className={btn} disabled={!realFolder} onClick={() => { requestPrepare([{ key: lesson.key, iso: day, cls, sections: [cls], lesson, start: toMin(cls.start) }]); onError(`Preparing ${className(cls)} in the background.`); }}>
                    <RefreshCw size={12} /> {st === 'ready' ? 'Make again' : 'Prepare now'}
                  </button>
                )}
                {(lesson.kind === 'lesson' || repeated) && day <= today && (
                  <button type="button" className={btn} onClick={() => s.setRepeat(cls.id, day, !repeated)}>{repeated ? 'Undo "not finished"' : 'Not finished'}</button>
                )}
                {!allOff && <button type="button" className={btn} onClick={() => s.setNoClass(day, cls.id, !off)}>{off ? 'Class resumes' : 'No class'}</button>}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/* ── Classes ───────────────────────────────────────────────────────────── */
const EMPTY = { subject: '', grade: '', section: '', room: '', days: [1, 2, 3, 4, 5], start: '', end: '', materialsFolder: '' };

function ClassesTab() {
  const { s } = useHere();
  const [form, setForm] = useState(null);
  const [problems, setProblems] = useState([]);
  const folders = useMemo(() => [...new Set(flattenFileTree(s.workspace?.files || []).map((f) => f.path.split('/').slice(0, -1).join('/')).filter((p) => p && !/^KaTuro (Backups|Outputs)|^Lesson Prep/.test(p)))].sort(), [s.workspace]);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const save = () => {
    const p = classProblems(form, s.myClasses);
    setProblems(p);
    if (p.length) return;
    s.saveClass(form);
    setForm(null);
  };

  if (form) {
    return (
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className={label} htmlFor="kt-subj">Learning area</label>
            <input id="kt-subj" list="kt-subjects" value={form.subject} onChange={(e) => set('subject', e.target.value)} className={input} placeholder="e.g. Science" />
            <datalist id="kt-subjects">{SUBJECTS.map((x) => <option key={x} value={x} />)}</datalist>
          </div>
          <div>
            <label className={label} htmlFor="kt-grade">Grade</label>
            <select id="kt-grade" value={form.grade} onChange={(e) => set('grade', e.target.value)} className={input}>
              <option value="">Choose…</option>
              {GRADES.map((g) => <option key={g} value={g}>{g}</option>)}
            </select>
          </div>
          <div>
            <label className={label} htmlFor="kt-sec">Section</label>
            <input id="kt-sec" value={form.section} onChange={(e) => set('section', e.target.value)} className={input} placeholder="e.g. Rizal" />
          </div>
          <div>
            <label className={label} htmlFor="kt-room">Room (optional)</label>
            <input id="kt-room" value={form.room} onChange={(e) => set('room', e.target.value)} className={input} />
          </div>
          <div>
            <label className={label} htmlFor="kt-start">Starts</label>
            <input id="kt-start" type="time" value={form.start} onChange={(e) => set('start', e.target.value)} className={input} />
          </div>
          <div>
            <label className={label} htmlFor="kt-end">Ends</label>
            <input id="kt-end" type="time" value={form.end} onChange={(e) => set('end', e.target.value)} className={input} />
          </div>
        </div>
        <fieldset>
          <legend className={label}>Days</legend>
          <div className="flex flex-wrap gap-1.5">
            {DAYS.map(([d, n]) => (
              <label key={d} className="flex items-center gap-1 text-xs text-gray-800">
                <input type="checkbox" className="accent-emerald-600" checked={form.days.includes(d)} onChange={(e) => set('days', e.target.checked ? [...form.days, d] : form.days.filter((x) => x !== d))} /> {n}
              </label>
            ))}
          </div>
        </fieldset>
        <div>
          <label className={label} htmlFor="kt-folder">Materials folder (optional)</label>
          <select id="kt-folder" value={form.materialsFolder} onChange={(e) => set('materialsFolder', e.target.value)} className={input}>
            <option value="">None</option>
            {folders.map((f) => <option key={f} value={f}>{f}</option>)}
          </select>
          <p className="mt-0.5 text-[11px] text-gray-500">Modules, books or your old lesson plans for this class. I only read them, never change them.</p>
        </div>
        {problems.length > 0 && <p className="text-[11px] text-red-600">Please fix: {problems.join('; ')}.</p>}
        <div className="flex gap-2">
          <button type="button" className={primary} onClick={save}>Save class</button>
          <button type="button" className={btn} onClick={() => { setForm(null); setProblems([]); }}>Cancel</button>
        </div>
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center">
        <p className="text-[11px] text-gray-500">Your weekly class schedule. Each class can have its own lessons and materials folder.</p>
        <button type="button" className={primary} onClick={() => setForm({ ...EMPTY })}><Plus size={13} /> Add class</button>
      </div>
      {!s.myClasses.length && <p className="text-xs text-gray-600">No classes yet. Add each class you teach (one per section).</p>}
      <ul className="space-y-1.5">
        {[...s.myClasses].sort((a, b) => toMin(a.start) - toMin(b.start)).map((c) => (
          <li key={c.id} className="flex items-center justify-between gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2">
            <div className="min-w-0">
              <p className="text-xs font-bold text-gray-900">{className(c)}</p>
              <p className="text-[11px] text-gray-500">{DAYS.filter(([d]) => c.days.includes(d)).map(([, n]) => n).join(', ')} · {clock(c.start)}–{clock(c.end)}{c.materialsFolder ? ` · ${c.materialsFolder}` : ''}</p>
            </div>
            <div className="flex gap-1.5">
              <button type="button" className={btn} onClick={() => setForm({ ...EMPTY, ...c })}><Pencil size={12} /> Edit</button>
              <button type="button" className={btn} onClick={() => { if (window.confirm(`Remove ${className(c)} and its lesson list?`)) s.removeClass(c.id); }}><Trash2 size={12} /> Remove</button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ── Lessons ───────────────────────────────────────────────────────────── */
function LessonsTab() {
  const { s } = useHere();
  const [classId, setClassId] = useState(() => s.myClasses[0]?.id || '');
  const cls = s.myClasses.find((c) => c.id === classId) || null;
  const seq = cls ? s.lessonSequences[cls.id] : null;
  const [source, setSource] = useState(() => (seq?.source === 'matatag' ? 'matatag' : 'typed'));
  const terms = cls ? matatagTerms(cls.subject, cls.grade) : [];
  const [term, setTerm] = useState(() => seq?.term || terms[0] || 1);
  const [text, setText] = useState(() => (seq && seq.source !== 'matatag' ? sequenceText(seq.items) : ''));
  const [startDate, setStartDate] = useState(() => seq?.startDate || isoDay());
  const [startIndex, setStartIndex] = useState(() => seq?.startIndex || 0);
  const [startMeeting, setStartMeeting] = useState(() => (seq?.startSession || 0) + 1);
  const [guidePath, setGuidePath] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const guides = useMemo(() => flattenFileTree(s.workspace?.files || []).map((f) => f.path).filter((p) => /\.(docx|pdf|txt|md)$/i.test(p) && !/^KaTuro (Backups|Outputs)|^Lesson Prep/.test(p)), [s.workspace]);

  const pick = (id) => {
    const c = s.myClasses.find((x) => x.id === id);
    const q = c ? s.lessonSequences[c.id] : null;
    setClassId(id);
    setSource(q?.source === 'matatag' ? 'matatag' : 'typed');
    setTerm(q?.term || (c ? matatagTerms(c.subject, c.grade)[0] : 1) || 1);
    setText(q && q.source !== 'matatag' ? sequenceText(q.items) : '');
    setStartDate(q?.startDate || isoDay());
    setStartIndex(q?.startIndex || 0);
    setStartMeeting((q?.startSession || 0) + 1);
    setNote('');
  };
  if (!cls) return <p className="text-xs text-gray-600">Add a class in the Classes tab first.</p>;

  const items = source === 'matatag' ? matatagSequence(cls.subject, cls.grade, term) || [] : typedSequence(text).items;
  const typedProblems = source === 'matatag' ? [] : typedSequence(text).problems;
  const maxMeeting = items[startIndex]?.sessions || 1;
  const save = () => {
    if (!items.length) { setNote('There are no lessons to save yet.'); return; }
    if (typedProblems.length) { setNote(`Please fix: ${typedProblems.join('; ')}.`); return; }
    const idx = Math.min(Number(startIndex) || 0, items.length - 1);
    const meeting = Math.min(Math.max(1, Number(startMeeting) || 1), items[idx].sessions);
    s.setLessonSequence(cls.id, { source, term: source === 'matatag' ? term : undefined, items, startDate, startIndex: idx, startSession: meeting - 1 });
    setNote(`Saved. From ${startDate}, ${className(cls)} starts at "${items[idx].text}", meeting ${meeting}.`);
  };
  const copyToSections = () => {
    const others = s.myClasses.filter((c) => c.id !== cls.id && c.subject.toLowerCase() === cls.subject.toLowerCase() && c.grade === cls.grade);
    if (!seq || !others.length) return;
    others.forEach((c) => s.setLessonSequence(c.id, { ...seq }));
    setNote(`The same lessons are now set for ${others.map(className).join(', ')}.`);
  };
  const readGuide = async () => {
    if (!guidePath) return;
    setBusy(true);
    setNote('Reading your curriculum guide…');
    try {
      const bytes = await readFileBytes(s.workspace?.handle, guidePath);
      const parsed = await readDocument({ bytes, name: guidePath.split('/').pop() });
      const res = await extractGuideSequence({ text: parsed.text, subject: cls.subject, grade: cls.grade, term });
      if (!res.items.length) setNote('I could not find competencies for this class in that file. Check the file, or type the topics.');
      else {
        setSource('guide');
        setText(sequenceText(res.items));
        setNote(`Found ${res.items.length} competencies in the guide${res.dropped ? ` (${res.dropped} left out because their exact words were not in the file)` : ''}. Check the list below, then Save.`);
      }
    } catch (err) {
      setNote(err?.message || 'Could not read that file.');
    } finally {
      setBusy(false);
    }
  };
  const nowLesson = seq ? lessonFor(cls, isoDay(), seq, s.teachingLog) : null;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-[180px]">
          <label className={label} htmlFor="kt-lclass">Class</label>
          <select id="kt-lclass" value={classId} onChange={(e) => pick(e.target.value)} className={input}>
            {s.myClasses.map((c) => <option key={c.id} value={c.id}>{className(c)}</option>)}
          </select>
        </div>
        {seq && <button type="button" className={btn} onClick={copyToSections}>Same lessons for the other sections</button>}
      </div>
      {seq && nowLesson && (
        <p className="text-[11px] text-gray-600">
          Now: {nowLesson.kind === 'lesson' ? `"${nowLesson.item.text}" (meeting ${nowLesson.session} of ${nowLesson.sessions}) today` : nowLesson.kind === 'finished' ? 'all saved lessons are done' : 'no lesson today'} · {seq.items.length} lessons saved.
        </p>
      )}
      <fieldset className="flex flex-wrap gap-3">
        <legend className={label}>Where the lessons come from</legend>
        <label className="flex items-center gap-1 text-xs"><input type="radio" className="accent-emerald-600" checked={source === 'matatag'} onChange={() => setSource('matatag')} /> DepEd curriculum (built in)</label>
        <label className="flex items-center gap-1 text-xs"><input type="radio" className="accent-emerald-600" checked={source !== 'matatag'} onChange={() => setSource('typed')} /> My own list / curriculum guide</label>
      </fieldset>
      {source === 'matatag' ? (
        terms.length ? (
          <div className="flex flex-wrap items-end gap-2">
            <div>
              <label className={label} htmlFor="kt-term">Term</label>
              <select id="kt-term" value={term} onChange={(e) => { setTerm(Number(e.target.value)); setStartIndex(0); }} className={input}>
                {terms.map((t) => <option key={t} value={t}>Term {t}</option>)}
              </select>
            </div>
            <p className="text-[11px] text-gray-500 flex-1">From the MATATAG data built into KaTuroDesk, for {cls.grade} {cls.subject} only.</p>
          </div>
        ) : (
          <p className="text-[11px] text-amber-700">The built-in DepEd data does not have {cls.grade} {cls.subject} yet. Use your own list or your curriculum guide instead.</p>
        )
      ) : (
        <div className="space-y-2">
          <div className="flex flex-wrap items-end gap-2">
            <div className="flex-1 min-w-[200px]">
              <label className={label} htmlFor="kt-guide">Read from my curriculum guide (optional)</label>
              <select id="kt-guide" value={guidePath} onChange={(e) => setGuidePath(e.target.value)} className={input}>
                <option value="">Choose a file…</option>
                {guides.map((g) => <option key={g} value={g}>{g}</option>)}
              </select>
            </div>
            <div>
              <label className={label} htmlFor="kt-gterm">Term</label>
              <select id="kt-gterm" value={term} onChange={(e) => setTerm(Number(e.target.value))} className={input}>
                {[1, 2, 3, 4].map((t) => <option key={t} value={t}>Term {t}</option>)}
              </select>
            </div>
            <button type="button" className={btn} disabled={!guidePath || busy} onClick={readGuide}>{busy ? 'Reading…' : 'Read the guide'}</button>
          </div>
          <div>
            <label className={label} htmlFor="kt-topics">Lessons in order, one per line: code | topic | meetings</label>
            <textarea id="kt-topics" rows={7} value={text} onChange={(e) => { setText(e.target.value); setSource((x) => (x === 'matatag' ? 'typed' : x)); }} className={`${input} font-mono`} placeholder={'S7MT-Ic-3 | Mixtures and solutions | 3\nSeparating mixtures (2)\nAcids and bases'} />
          </div>
        </div>
      )}
      {items.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          <div>
            <label className={label} htmlFor="kt-sdate">Starting on</label>
            <input id="kt-sdate" type="date" value={startDate} onChange={(e) => e.target.value && setStartDate(e.target.value)} className={input} />
          </div>
          <div>
            <label className={label} htmlFor="kt-sidx">With lesson</label>
            <select id="kt-sidx" value={startIndex} onChange={(e) => { setStartIndex(Number(e.target.value)); setStartMeeting(1); }} className={input}>
              {items.map((it, i) => <option key={`${i}-${it.text}`} value={i}>{i + 1}. {it.code ? `${it.code} ` : ''}{it.text.slice(0, 60)}</option>)}
            </select>
          </div>
          <div>
            <label className={label} htmlFor="kt-smeet">At meeting</label>
            <input id="kt-smeet" type="number" min={1} max={maxMeeting} value={startMeeting} onChange={(e) => setStartMeeting(e.target.value)} className={input} />
          </div>
        </div>
      )}
      {note && <p className="text-[11px] text-gray-700">{note}</p>}
      <button type="button" className={primary} onClick={save} disabled={!items.length}>Save lessons for {className(cls)}</button>
    </div>
  );
}

/* ── Assistant ─────────────────────────────────────────────────────────── */
function SettingCheck({ checked, onChange, title, detail }) {
  return (
    <label className="flex items-start gap-2">
      <input type="checkbox" className="mt-0.5 accent-emerald-600" checked={Boolean(checked)} onChange={(e) => onChange(e.target.checked)} />
      <span><span className="text-xs font-semibold text-gray-800">{title}</span>{detail && <span className="block text-[11px] text-gray-500">{detail}</span>}</span>
    </label>
  );
}

function AssistantTab() {
  const { s } = useHere();
  const st = { ...DEFAULT_SETTINGS, ...s.teachingSettings };
  const set = (patch) => s.setTeachingSettings(patch);
  const persona = getPersona(s.persona);
  const desktop = typeof window !== 'undefined' && Boolean(window.katuroDeskApi?.setBubble);
  const toggleRemind = (m) => set({ remind: st.remind.includes(m) ? st.remind.filter((x) => x !== m) : [...st.remind, m].sort((a, b) => b - a) });
  const testVoice = () => {
    try {
      const u = new SpeechSynthesisUtterance(`Hello! This is ${persona.name}. Your next class is in 10 minutes.`);
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(u);
    } catch {
      // no voice on this computer
    }
  };
  return (
    <div className="space-y-4">
      <section className="space-y-2">
        <h3 className="text-xs font-bold text-gray-800">{persona.name} as your teaching assistant</h3>
        <p className="text-[11px] text-gray-500">Change the persona in Settings &gt; Assistant. Reminders come while KaTuroDesk runs, including in the tray (Settings &gt; Notifications).</p>
        <SettingCheck checked={st.bubble} onChange={(v) => set({ bubble: v })} title="Show the floating bubble" detail={desktop ? `${persona.name}'s head floats on your screen with reminders and quick questions. It stays quiet during your classes and slideshows.` : 'Available in the KaTuroDesk desktop app.'} />
        <SettingCheck checked={st.voice} onChange={(v) => set({ voice: v })} title="Say reminders out loud" detail="Uses this computer's voice (English). The text is always shown too." />
        {st.voice && <button type="button" className={btn} onClick={testVoice}>Test the voice</button>}
      </section>
      <section className="space-y-2 border-t border-gray-100 pt-3">
        <h3 className="text-xs font-bold text-gray-800">Reminders</h3>
        <div className="flex flex-wrap gap-3">
          {[60, 30, 15, 10, 5].map((m) => (
            <label key={m} className="flex items-center gap-1 text-xs text-gray-800"><input type="checkbox" className="accent-emerald-600" checked={st.remind.includes(m)} onChange={() => toggleRemind(m)} /> {m} min before</label>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <SettingCheck checked={st.morningBrief} onChange={(v) => set({ morningBrief: v })} title="Morning brief" detail="Today's classes and whether the lessons are ready." />
          {st.morningBrief && <input type="time" aria-label="Morning brief time" value={st.morningTime} onChange={(e) => e.target.value && set({ morningTime: e.target.value })} className="rounded-lg border border-gray-300 bg-white px-2 py-1 text-xs" />}
        </div>
        <SettingCheck checked={st.afterClass} onChange={(v) => set({ afterClass: v })} title='Ask "Did you finish the lesson?" after class' detail="If you say no, the same lesson continues next meeting. No answer counts as finished." />
      </section>
      <section className="space-y-2 border-t border-gray-100 pt-3">
        <h3 className="text-xs font-bold text-gray-800">Lesson preparation</h3>
        <div className="flex flex-wrap items-center gap-2 text-xs text-gray-800">
          <span>Prepare the next school day's lessons from</span>
          <input type="time" aria-label="Preparation time" value={st.prepTime} onChange={(e) => e.target.value && set({ prepTime: e.target.value })} className="rounded-lg border border-gray-300 bg-white px-2 py-1 text-xs" />
        </div>
        <fieldset className="flex flex-wrap gap-3">
          <legend className={label}>Lesson plan</legend>
          <label className="flex items-center gap-1 text-xs"><input type="radio" className="accent-emerald-600" checked={st.planFormat === 'dlp'} onChange={() => set({ planFormat: 'dlp' })} /> A lesson plan (DLP) for each day</label>
          <label className="flex items-center gap-1 text-xs"><input type="radio" className="accent-emerald-600" checked={st.planFormat === 'dll'} onChange={() => set({ planFormat: 'dll' })} /> One Daily Lesson Log (DLL) per week</label>
        </fieldset>
        <div className="flex flex-wrap items-center gap-3">
          <SettingCheck checked={st.slides} onChange={(v) => set({ slides: v })} title="Slides for each lesson" />
          {st.slides && (
            <label className="flex items-center gap-1 text-xs text-gray-800">about
              <input type="number" min={5} max={25} value={st.slideCount} onChange={(e) => set({ slideCount: Math.min(25, Math.max(5, Number(e.target.value) || 10)) })} className="w-14 rounded-lg border border-gray-300 bg-white px-2 py-1 text-xs" /> slides
            </label>
          )}
        </div>
        <SettingCheck checked={st.worksheet} onChange={(v) => set({ worksheet: v })} title="A worksheet for each lesson" />
        <p className="text-[11px] text-gray-500">Files are saved in "Lesson Prep" in your classroom folder. The content is written by AI from the competency and your materials: please review it before class.</p>
      </section>
    </div>
  );
}

export default function MyClassesModal({ open, onClose }) {
  const [tab, setTab] = useState('today');
  const [notice, setNotice] = useState('');
  if (!open) return null;
  const tabs = [['today', 'Today'], ['classes', 'Classes'], ['lessons', 'Lessons'], ['assistant', 'Assistant']];
  return (
    <div className="fixed inset-0 z-[55] bg-black/40 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="My classes">
      <div className="w-full max-w-2xl max-h-[88vh] flex flex-col rounded-2xl border border-gray-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between px-5 pt-4">
          <h2 className="text-sm font-bold text-gray-900">My classes</h2>
          <button type="button" onClick={onClose} title="Close" aria-label="Close" className="p-1 rounded hover:bg-gray-200 text-gray-500"><X size={16} /></button>
        </div>
        <div className="px-5 pt-2 flex gap-1 border-b border-gray-200" role="tablist">
          {tabs.map(([id, name]) => (
            <button key={id} role="tab" type="button" aria-selected={tab === id} onClick={() => { setTab(id); setNotice(''); }}
              className={`px-3 py-2 text-xs font-semibold border-b-2 -mb-px transition ${tab === id ? 'border-emerald-600 text-emerald-800' : 'border-transparent text-gray-500 hover:text-gray-800'}`}>
              {name}
            </button>
          ))}
        </div>
        <div className="p-5 overflow-y-auto">
          {notice && <p className="mb-3 text-[11px] text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg px-2 py-1.5">{notice}</p>}
          {tab === 'today' && <TodayTab onError={setNotice} />}
          {tab === 'classes' && <ClassesTab />}
          {tab === 'lessons' && <LessonsTab />}
          {tab === 'assistant' && <AssistantTab />}
        </div>
      </div>
    </div>
  );
}
