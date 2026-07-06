import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useLessonPlans } from '../hooks/useLessonPlans';
import { generateQuizAI } from '../services/ai';
import { createQuiz, deductTokens } from '../services/db';
import { trackEvent, trackGeneration, startTimer } from '../services/usageTracker';
import { useToast } from '../context/ToastContext';
import {
  Search, ChevronRight, Loader2, RefreshCw,
  Printer, CheckCircle, Eye, EyeOff, AlertCircle,
  BookOpen, Plus, ArrowRight, Scissors, FileDown,
} from 'lucide-react';
import BubbleSheetPrint, { BubbleSheetPreview, A4_PX_W } from '../components/BubbleSheetPrint';

const STEPS = ['Select Lesson', 'Quiz Settings', 'Preview & Print'];
const NUM_Q_OPTS = [5, 10, 15, 20, 30];

const SHEETS_PER_PAGE = { 5: 6, 10: 4, 15: 4, 20: 4 };

/* ── helpers ──────────────────────────────────────────────────────────── */
function normalizeTitle(doc) {
  return doc.lessonName || doc.title || 'Untitled';
}
function normalizeMeta(doc) {
  return {
    subject:   doc.subject     || '—',
    grade:     doc.gradeLevel  || doc.grade || '—',
    term:      doc.term        || doc.quarter || '—',
    week:      doc.weekNumber  || doc.week   || '—',
    sessions:  Array.isArray(doc.sessions) ? doc.sessions.length : (doc.sessions || 0),
  };
}

/* ── StepIndicator ────────────────────────────────────────────────────── */
function StepIndicator({ current }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', marginBottom: 28 }}>
      {STEPS.map((label, i) => {
        const done   = i < current;
        const active = i === current;
        return (
          <div key={i} style={{ display: 'flex', alignItems: 'center', flex: i < STEPS.length - 1 ? 1 : 'none' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{
                width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                display: 'grid', placeItems: 'center',
                background: done ? '#2d6a4f' : active ? '#d8f3dc' : 'var(--kt-surface)',
                border: `2px solid ${done ? '#2d6a4f' : active ? '#40916c' : 'rgba(45,106,79,0.18)'}`,
                fontSize: 12, fontWeight: 700,
                color: done ? '#fff' : active ? '#2d6a4f' : '#4a6357',
              }}>
                {done ? <CheckCircle size={13} color="#fff" /> : i + 1}
              </div>
              <span style={{
                fontSize: 12, fontWeight: active ? 700 : 500, whiteSpace: 'nowrap',
                color: active ? '#0d2218' : done ? '#2d6a4f' : '#4a6357',
              }}>{label}</span>
            </div>
            {i < STEPS.length - 1 && (
              <div style={{
                flex: 1, height: 2, margin: '0 10px',
                background: done ? '#d8f3dc' : 'rgba(45,106,79,0.12)',
                minWidth: 16,
              }} />
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ── Main component ───────────────────────────────────────────────────── */
export default function QuizBuilderPage() {
  const { user }     = useAuth();
  const navigate     = useNavigate();
  const { addToast } = useToast();
  const { lessonPlans, loading: lessonsLoading } = useLessonPlans(user?.uid);

  /* step state */
  const [step,           setStep]           = useState(0);
  const [selectedLesson, setSelectedLesson] = useState(null);
  const [search,         setSearch]         = useState('');

  /* quiz settings */
  const [numQuestions, setNumQ]       = useState(20);
  const [numChoices,   setNumC]       = useState(4);
  const [quizTitle,    setQuizTitle]  = useState('');

  /* generation state */
  const [generating,   setGenerating]  = useState(false);
  const [genError,     setGenError]    = useState(null);
  const [questions,    setQuestions]   = useState([]);
  const [showAnswers,  setShowAnswers] = useState(true);
  const [printModal,   setPrintModal]  = useState(false);
  const [pdfMode,      setPdfMode]     = useState(false);
  const [savedQuizId,  setSavedQuizId] = useState(null);
  const [saving,       setSaving]      = useState(false);

  /* ── derived ── */
  const activeLessons = lessonPlans.filter(l => l.status !== 'archived');
  const filteredLessons = activeLessons.filter(l => {
    if (!search.trim()) return true;
    const s = search.toLowerCase();
    return (
      normalizeTitle(l).toLowerCase().includes(s) ||
      (l.subject || '').toLowerCase().includes(s) ||
      (l.gradeLevel || l.grade || '').toLowerCase().includes(s) ||
      (l.term || '').toLowerCase().includes(s)
    );
  });

  /* ── handlers ── */
  function handleSelectLesson(lesson) {
    setSelectedLesson(lesson);
    setQuizTitle(`${normalizeTitle(lesson)} — Quiz`);
    setGenError(null);
    setStep(1);
  }

  async function handleGenerate() {
    if (!selectedLesson || !quizTitle.trim()) return;

    setGenerating(true);
    setGenError(null);

    let elapsedMs;
    try {
      await deductTokens(user.uid, 'quiz');
      trackEvent(user.uid, 'quiz_generated', { subject: selectedLesson?.subject });
      elapsedMs = startTimer();
    } catch (err) {
      setGenError(err.message);
      setGenerating(false);
      return;
    }

    /* build AI context from the selected plan */
    const isDLL = selectedLesson.type === 'dll';

    const objectives = (selectedLesson.sessions || [])
      .map(s => s.objective)
      .filter(Boolean);

    const sessionSummary = (selectedLesson.sessions || [])
      .slice(0, 4)
      .map(s => `Session ${s.day} [${s.bloomsLevel || ''}]: ${s.objective || ''}`)
      .filter(s => s.trim().length > 20)
      .join('\n');

    const dllHint = isDLL && selectedLesson.dailyContent
      ? 'Daily topics:\n' + Object.entries(selectedLesson.dailyContent)
          .filter(([, v]) => v)
          .map(([k, v]) => `${k.charAt(0).toUpperCase() + k.slice(1)}: ${v}`)
          .join('\n')
      : '';

    const context = {
      subject:       selectedLesson.subject     || 'Science',
      gradeLevel:    selectedLesson.gradeLevel   || selectedLesson.grade || 'Grade 7',
      topic:         normalizeTitle(selectedLesson),
      objectives,
      competencies:  selectedLesson.competencyText ? [selectedLesson.competencyText] : [],
    };

    if (objectives.length === 0 && !selectedLesson.competencyText) {
      addToast('Limited lesson content — quiz may be generic.', 'warning');
    }

    const customHint = sessionSummary || dllHint;

    /* attempt 1 */
    try {
      const result = await generateQuizAI(context, numQuestions, numChoices, customHint);
      if (!result?.questions?.length) throw new Error('AI returned no questions — try a lower question count.');
      setQuestions(result.questions);
      setStep(2);
      setGenerating(false);
      trackGeneration(user.uid, 'quiz', { success: true, durationMs: elapsedMs() });
      await saveQuizToFirebase(result.questions);
      return;
    } catch (err1) {
      console.warn('Quiz gen attempt 1 failed:', err1.message);
    }

    /* attempt 2 — retry after 2 s */
    try {
      await new Promise(r => setTimeout(r, 2000));
      const result = await generateQuizAI(context, numQuestions, numChoices, customHint);
      if (!result?.questions?.length) throw new Error('AI returned no questions — try a lower question count.');
      setQuestions(result.questions);
      setStep(2);
      setGenerating(false);
      trackGeneration(user.uid, 'quiz', { success: true, durationMs: elapsedMs() });
      await saveQuizToFirebase(result.questions);
    } catch (err2) {
      setGenError(err2.message || 'Generation failed. Check your connection and try again.');
      trackGeneration(user.uid, 'quiz', { success: false, durationMs: elapsedMs(), error: err2.message });
    } finally {
      setGenerating(false);
    }
  }

  async function saveQuizToFirebase(qs) {
    if (!user?.uid || saving) return;
    setSaving(true);
    try {
      const answerKey = qs.map(q => q.answer || '');
      const ref = await createQuiz(user.uid, {
        title:        quizTitle,
        numQuestions,
        numChoices,
        questions:    qs,
        answerKey,
        lessonId:     selectedLesson?.id  || '',
        lessonTitle:  normalizeTitle(selectedLesson),
        status:       'saved',
      });
      setSavedQuizId(ref.id);
    } catch (e) {
      console.warn('Quiz auto-save failed:', e.message);
    } finally {
      setSaving(false);
    }
  }

  function handleReset() {
    setStep(0);
    setSelectedLesson(null);
    setSearch('');
    setNumQ(20);
    setNumC(4);
    setQuizTitle('');
    setQuestions([]);
    setGenError(null);
    setShowAnswers(true);
    setSavedQuizId(null);
  }

  /* ── derived for preview ────────────────────────────────────────────── */
  const previewNumQ     = numQuestions <= 20 ? numQuestions : 20;
  const sheetsPerPage   = SHEETS_PER_PAGE[previewNumQ] ?? 4;
  const printQuizObj    = { numQuestions, numChoices, title: quizTitle || 'Quiz', id: savedQuizId };
  const teacherUid      = user?.uid;

  /* ── render ─────────────────────────────────────────────────────────── */
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* Page heading */}
      <div>
        <h1 style={{ margin: 0, fontSize: 28, fontWeight: 700, color: 'var(--kt-text-primary)' }}>Quiz Builder</h1>
        <p style={{ margin: '4px 0 0', fontSize: 14, color: 'var(--kt-text-secondary)' }}>
          AI generates quiz questions directly from your saved lesson plans
        </p>
      </div>

      {/* ── Two-column layout: wizard left, bubble preview right ── */}
      <div className="kt-split-sidebar" style={{ gap: 20, alignItems: 'start' }}>

      {/* ── LEFT: wizard card ── */}
      <div style={{
        background: 'var(--kt-card)', borderRadius: 14,
        border: '1px solid var(--kt-border)',
        padding: '28px',
      }}>
        <StepIndicator current={step} />

        {/* ══════════ STEP 0 — Select Lesson ══════════ */}
        {step === 0 && (
          <div>
            <h2 style={{ margin: '0 0 4px', fontSize: 17, fontWeight: 600, color: 'var(--kt-text-primary)' }}>
              Choose a Lesson Plan
            </h2>
            <p style={{ margin: '0 0 18px', fontSize: 14, color: 'var(--kt-text-secondary)' }}>
              The quiz will be generated from the selected lesson's competency and objectives.
            </p>

            {/* Search */}
            <div style={{ position: 'relative', marginBottom: 14 }}>
              <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--kt-text-secondary)', pointerEvents: 'none' }} />
              <input
                type="text"
                placeholder="Search by title, subject, or grade…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="input"
                style={{ paddingLeft: 34 }}
              />
            </div>

            {/* Lesson list */}
            {lessonsLoading ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '28px 0', color: 'var(--kt-text-secondary)' }}>
                <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
                <span style={{ fontSize: 13 }}>Loading your lessons…</span>
              </div>
            ) : filteredLessons.length === 0 ? (
              <div style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                padding: '48px 24px', background: 'var(--kt-surface)', borderRadius: 12,
                border: '2px dashed rgba(45,106,79,0.18)', gap: 12, textAlign: 'center',
              }}>
                <div style={{ width: 48, height: 48, borderRadius: 12, background: '#d8f3dc', display: 'grid', placeItems: 'center' }}>
                  <BookOpen size={24} color="#2d6a4f" />
                </div>
                <div>
                  <p style={{ margin: 0, fontSize: 15, fontWeight: 600, color: 'var(--kt-text-primary)' }}>
                    {search ? 'No lessons match your search' : 'No lesson plans yet'}
                  </p>
                  <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--kt-text-secondary)' }}>
                    {search ? 'Try a different search term.' : 'Create a lesson plan in Lesson Gen first.'}
                  </p>
                </div>
                {!search && (
                  <button
                    onClick={() => navigate('/lesson-gen')}
                    className="btn-primary"
                    style={{ marginTop: 4 }}
                  >
                    <Plus size={14} /> Create Lesson Plan
                  </button>
                )}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {filteredLessons.map(lesson => {
                  const meta  = normalizeMeta(lesson);
                  const title = normalizeTitle(lesson);
                  const hasAI = (lesson.sessions || []).some(s => s.objective);
                  return (
                    <button
                      key={lesson.id}
                      onClick={() => handleSelectLesson(lesson)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 14,
                        padding: '14px 16px', borderRadius: 12, textAlign: 'left',
                        border: '1.5px solid rgba(45,106,79,0.14)',
                        background: 'var(--kt-card)', cursor: 'pointer',
                        transition: 'all 0.15s',
                      }}
                      onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(45,106,79,0.35)'; e.currentTarget.style.background = 'var(--kt-surface)'; }}
                      onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(45,106,79,0.14)'; e.currentTarget.style.background = 'var(--kt-card)'; }}
                    >
                      {/* Icon */}
                      <div style={{
                        width: 42, height: 42, borderRadius: 10, flexShrink: 0, display: 'grid', placeItems: 'center',
                        background: lesson.type === 'dll' ? 'linear-gradient(135deg,#dcfce7,#bbf7d0)' : lesson.type === 'cot' ? 'linear-gradient(135deg,#fef3c7,#fde68a)' : 'linear-gradient(135deg,#dbeafe,#bfdbfe)',
                      }}>
                        <BookOpen size={18} color={lesson.type === 'dll' ? '#16a34a' : lesson.type === 'cot' ? '#d97706' : '#1d4ed8'} />
                      </div>

                      {/* Info */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                          <span style={{
                            fontSize: 10, fontWeight: 700, borderRadius: 4, padding: '1px 6px',
                            background: lesson.type === 'dll' ? '#dcfce7' : lesson.type === 'cot' ? '#fef3c7' : '#dbeafe',
                            color:      lesson.type === 'dll' ? '#14532d' : lesson.type === 'cot' ? '#92400e' : '#1e3a8a',
                          }}>
                            {lesson.type === 'dll' ? 'DLL' : lesson.type === 'cot' ? 'COT' : 'ILAW'}
                          </span>
                          <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: 'var(--kt-text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {title}
                          </p>
                        </div>
                        <p style={{ margin: 0, fontSize: 12, color: 'var(--kt-text-secondary)' }}>
                          {meta.subject} {meta.grade} · {meta.term}
                          {lesson.type === 'dll' ? (lesson.teachingDates ? ` · ${lesson.teachingDates}` : '') : ` · Wk ${meta.week}`}
                        </p>
                      </div>

                      {/* AI badge */}
                      <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                        {hasAI && (
                          <span style={{
                            fontSize: 10, fontWeight: 700, background: '#d8f3dc', color: '#1a3d2b',
                            borderRadius: 20, padding: '2px 8px',
                          }}>
                            AI content
                          </span>
                        )}
                        <ChevronRight size={15} color="rgba(45,106,79,0.3)" />
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ══════════ STEP 1 — Quiz Settings ══════════ */}
        {step === 1 && selectedLesson && (
          <div>
            {/* Selected lesson chip */}
            <div style={{
              background: 'var(--kt-surface)', borderRadius: 10, padding: '10px 14px',
              marginBottom: 22, display: 'flex', alignItems: 'center', gap: 10,
              border: '1px solid var(--kt-border)',
            }}>
              <BookOpen size={14} color="#2d6a4f" style={{ flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: '#1a3d2b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {normalizeTitle(selectedLesson)}
                </p>
                <p style={{ margin: 0, fontSize: 11, color: 'var(--kt-text-secondary)' }}>
                  {normalizeMeta(selectedLesson).subject} {normalizeMeta(selectedLesson).grade} · {normalizeMeta(selectedLesson).term}
                </p>
              </div>
              <button
                onClick={() => { setStep(0); setGenError(null); }}
                style={{ fontSize: 11, fontWeight: 600, color: '#2d6a4f', background: 'none', border: 'none', cursor: 'pointer', flexShrink: 0 }}
              >
                Change
              </button>
            </div>

            <h2 style={{ margin: '0 0 18px', fontSize: 17, fontWeight: 600, color: 'var(--kt-text-primary)' }}>Quiz Settings</h2>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>

              {/* Quiz title */}
              <div>
                <label style={{ display: 'block', marginBottom: 6, fontSize: 11, fontWeight: 700, color: 'var(--kt-text-secondary)', textTransform: 'uppercase', letterSpacing: '1.2px' }}>
                  Quiz Title
                </label>
                <input
                  type="text"
                  value={quizTitle}
                  onChange={e => setQuizTitle(e.target.value)}
                  className="input"
                  placeholder="e.g. Cells and Their Functions — Quiz 1"
                />
              </div>

              {/* Number of questions */}
              <div>
                <label style={{ display: 'block', marginBottom: 8, fontSize: 11, fontWeight: 700, color: 'var(--kt-text-secondary)', textTransform: 'uppercase', letterSpacing: '1.2px' }}>
                  Number of Questions
                </label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {NUM_Q_OPTS.map(n => (
                    <button
                      key={n}
                      onClick={() => setNumQ(n)}
                      style={{
                        padding: '7px 16px', borderRadius: 9, border: '1.5px solid',
                        borderColor: numQuestions === n ? '#2d6a4f' : 'rgba(45,106,79,0.2)',
                        background: numQuestions === n ? '#2d6a4f' : 'var(--kt-card)',
                        color: numQuestions === n ? '#fff' : 'var(--kt-text-secondary)',
                        fontSize: 13, fontWeight: 600, cursor: 'pointer', transition: 'all 0.12s',
                      }}
                    >
                      {n}
                    </button>
                  ))}
                </div>
                <p style={{ margin: '6px 0 0', fontSize: 11, color: 'var(--kt-text-secondary)', opacity: 0.7 }}>
                  Recommended: 20–25 for a 1-period quiz
                </p>
              </div>

              {/* Number of choices */}
              <div>
                <label style={{ display: 'block', marginBottom: 8, fontSize: 11, fontWeight: 700, color: 'var(--kt-text-secondary)', textTransform: 'uppercase', letterSpacing: '1.2px' }}>
                  Choices per Question
                </label>
                <div style={{ display: 'flex', gap: 8 }}>
                  {[4, 5].map(n => (
                    <button
                      key={n}
                      onClick={() => setNumC(n)}
                      style={{
                        padding: '8px 22px', borderRadius: 9, border: '1.5px solid',
                        borderColor: numChoices === n ? '#2d6a4f' : 'rgba(45,106,79,0.2)',
                        background: numChoices === n ? '#2d6a4f' : 'var(--kt-card)',
                        color: numChoices === n ? '#fff' : 'var(--kt-text-secondary)',
                        fontSize: 13, fontWeight: 600, cursor: 'pointer', transition: 'all 0.12s',
                      }}
                    >
                      {n} choices
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Error */}
            {genError && (
              <div style={{
                display: 'flex', alignItems: 'flex-start', gap: 8, marginTop: 16,
                background: '#fde8e8', border: '1px solid rgba(224,92,92,0.25)',
                borderRadius: 10, padding: '10px 14px',
              }}>
                <AlertCircle size={15} color="#e05c5c" style={{ flexShrink: 0, marginTop: 1 }} />
                <div>
                  <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: '#e05c5c' }}>{genError}</p>
                  <p style={{ margin: '3px 0 0', fontSize: 12, color: '#e05c5c', opacity: 0.8 }}>
                    Try reducing the number of questions (10–15) or check your connection.
                  </p>
                </div>
              </div>
            )}

            {/* Actions */}
            <div style={{ display: 'flex', gap: 10, marginTop: 24 }}>
              <button className="btn-outline" onClick={() => { setStep(0); setGenError(null); }}>
                ← Back
              </button>
              <button
                className="btn-primary"
                onClick={handleGenerate}
                disabled={generating || !quizTitle.trim()}
                style={{ flex: 1, justifyContent: 'center' }}
              >
                {generating ? (
                  <>
                    <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />
                    Generating {numQuestions} questions…
                  </>
                ) : (
                  <>Generate Quiz with AI <ArrowRight size={14} /></>
                )}
              </button>
            </div>

            {!generating && (
              <p style={{ margin: '10px 0 0', fontSize: 12, color: 'var(--kt-text-secondary)', textAlign: 'center', opacity: 0.7 }}>
                Takes ~15–30 seconds · Uses Gemini AI
              </p>
            )}
          </div>
        )}

        {/* ══════════ STEP 2 — Preview & Print ══════════ */}
        {step === 2 && (
          <div>
            {/* Quiz header */}
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: 'var(--kt-text-primary)' }}>{quizTitle}</h2>
                <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--kt-text-secondary)' }}>
                  {questions.length} questions · {numChoices} choices each ·{' '}
                  <span style={{ fontFamily: '"DM Mono", monospace', fontSize: 12 }}>
                    {normalizeMeta(selectedLesson).subject} {normalizeMeta(selectedLesson).grade}
                  </span>
                </p>
              </div>

              {/* Toolbar */}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button
                  onClick={() => setShowAnswers(v => !v)}
                  className="btn-outline"
                  style={{ fontSize: 12, padding: '7px 14px' }}
                >
                  {showAnswers ? <EyeOff size={13} /> : <Eye size={13} />}
                  {showAnswers ? 'Hide Answers' : 'Show Answers'}
                </button>
                <button
                  onClick={() => window.print()}
                  className="btn-outline"
                  style={{ fontSize: 12, padding: '7px 14px' }}
                >
                  <Printer size={13} /> Print
                </button>
                <button
                  onClick={() => { setStep(1); setQuestions([]); setGenError(null); }}
                  className="btn-outline"
                  style={{ fontSize: 12, padding: '7px 14px' }}
                >
                  <RefreshCw size={13} /> Regenerate
                </button>
              </div>
            </div>

            {/* Question cards */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {questions.map((q, idx) => (
                <div
                  key={idx}
                  style={{
                    background: 'var(--kt-card)', borderRadius: 12,
                    border: '1px solid var(--kt-border)',
                    padding: '16px 18px',
                  }}
                >
                  {/* Question text */}
                  <p style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 600, color: 'var(--kt-text-primary)', lineHeight: 1.55 }}>
                    <span style={{ fontFamily: '"DM Mono", monospace', color: '#2d6a4f', marginRight: 6 }}>
                      {q.num || idx + 1}.
                    </span>
                    {q.text}
                  </p>

                  {/* Choices */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {Object.entries(q.choices || {}).map(([letter, choiceText]) => {
                      const isCorrect  = showAnswers && q.answer === letter;
                      const isWrong    = showAnswers && q.answer !== letter;
                      return (
                        <div
                          key={letter}
                          style={{
                            display: 'flex', alignItems: 'flex-start', gap: 10,
                            padding: '8px 12px', borderRadius: 8,
                            background: isCorrect ? '#d8f3dc' : 'var(--kt-surface)',
                            border: `1px solid ${isCorrect ? 'rgba(45,106,79,0.3)' : 'transparent'}`,
                            transition: 'background 0.15s',
                          }}
                        >
                          <span style={{
                            fontFamily: '"DM Mono", monospace',
                            fontSize: 12, fontWeight: 700, flexShrink: 0,
                            color: isCorrect ? '#1a3d2b' : '#4a6357',
                            minWidth: 18,
                          }}>
                            {letter}
                          </span>
                          <span style={{
                            fontSize: 13, lineHeight: 1.5,
                            color: isCorrect ? '#0d2218' : isWrong ? '#4a6357' : '#0d2218',
                            fontWeight: isCorrect ? 600 : 400,
                          }}>
                            {choiceText}
                          </span>
                          {isCorrect && (
                            <CheckCircle size={14} color="#2d6a4f" style={{ flexShrink: 0, marginLeft: 'auto', marginTop: 1 }} />
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Competency tag */}
                  {q.competency && (
                    <p style={{ margin: '10px 0 0', fontSize: 11, color: 'var(--kt-text-secondary)', fontStyle: 'italic', opacity: 0.8 }}>
                      Competency: {q.competency}
                    </p>
                  )}
                </div>
              ))}
            </div>

            {/* Bottom actions */}
            <div style={{ display: 'flex', gap: 10, marginTop: 20, borderTop: '1px solid rgba(45,106,79,0.08)', paddingTop: 16 }}>
              <button className="btn-outline" onClick={() => { setStep(1); setQuestions([]); }}>
                ← Back to Settings
              </button>
              <button className="btn-outline" onClick={handleReset}>
                Start Over
              </button>
            </div>
          </div>
        )}
      </div>
      {/* ── end wizard card ── */}

      {/* ── RIGHT: sticky bubble sheet preview panel ── */}
      <div style={{ position: 'sticky', top: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>

        {/* Panel header */}
        <div style={{
          background: 'var(--kt-card)', borderRadius: 14,
          border: '1px solid var(--kt-border)',
          padding: '16px 18px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
            <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: 'var(--kt-text-primary)' }}>Bubble Sheet Preview</p>
            <span style={{
              fontSize: 10, fontWeight: 700, background: '#d8f3dc', color: '#1a3d2b',
              borderRadius: 20, padding: '2px 8px', whiteSpace: 'nowrap',
            }}>
              {sheetsPerPage} per A4
            </span>
          </div>
          <p style={{ margin: '0 0 8px', fontSize: 11, color: 'var(--kt-text-secondary)' }}>
            {numQuestions}Q · {numChoices} choices · Print and cut
          </p>
          {/* QR / save status */}
          {saving ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10, fontSize: 11, color: 'var(--kt-text-secondary)' }}>
              <Loader2 size={11} style={{ animation: 'spin 1s linear infinite' }} /> Saving quiz for QR…
            </div>
          ) : savedQuizId ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10, fontSize: 11, color: '#2d6a4f', fontWeight: 600 }}>
              <CheckCircle size={11} color="#2d6a4f" /> QR linked — auto-grade ready
            </div>
          ) : step < 2 ? null : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10, fontSize: 11, color: '#e8a320' }}>
              <AlertCircle size={11} /> QR not saved — scanning won't auto-grade
            </div>
          )}

          {/* Scaled A4 preview */}
          <div style={{
            border: '1px solid rgba(45,106,79,0.14)',
            borderRadius: 8,
            overflow: 'hidden',
            background: 'var(--kt-surface)',
            padding: 4,
          }}>
            <BubbleSheetPreview numQ={previewNumQ} numChoices={numChoices} width={260} uid={teacherUid} />
          </div>

          {numQuestions > 20 && (
            <p style={{ margin: '8px 0 0', fontSize: 10, color: 'var(--kt-text-secondary)', fontStyle: 'italic' }}>
              Preview shows 20 items · actual sheet will have {numQuestions}
            </p>
          )}
        </div>

        {/* Print + Download PDF buttons */}
        <button
          onClick={() => setPrintModal(true)}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            background: '#1a3d2b', color: '#fff', border: 'none',
            borderRadius: 12, padding: '12px 0', cursor: 'pointer',
            fontFamily: '"Plus Jakarta Sans", sans-serif',
            fontSize: 14, fontWeight: 700, width: '100%',
            transition: 'background 0.15s',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = '#0d2218'; }}
          onMouseLeave={e => { e.currentTarget.style.background = '#1a3d2b'; }}
        >
          <Printer size={16} /> Print Bubble Sheets
        </button>

        <button
          onClick={() => setPdfMode(true)}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            background: '#d8f3dc', color: '#1a3d2b', border: 'none',
            borderRadius: 12, padding: '11px 0', cursor: 'pointer',
            fontFamily: '"Plus Jakarta Sans", sans-serif',
            fontSize: 13, fontWeight: 700, width: '100%',
            transition: 'background 0.15s',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = '#b7e4c7'; }}
          onMouseLeave={e => { e.currentTarget.style.background = '#d8f3dc'; }}
        >
          <FileDown size={15} /> Download PDF
        </button>

        {/* Hint */}
        <div style={{
          display: 'flex', alignItems: 'flex-start', gap: 8,
          background: 'var(--kt-surface)', borderRadius: 10, padding: '10px 12px',
          border: '1px solid rgba(45,106,79,0.1)',
        }}>
          <Scissors size={13} style={{ color: 'var(--kt-text-secondary)', marginTop: 1, flexShrink: 0 }} />
          <p style={{ margin: 0, fontSize: 11, color: 'var(--kt-text-secondary)', lineHeight: 1.5 }}>
            Print on A4 bond paper, then cut along the sheet borders to distribute.
          </p>
        </div>
      </div>
      {/* ── end right panel ── */}

      </div>
      {/* ── end two-column grid ── */}

      {/* ── Print modal ── */}
      {printModal && (
        <BubbleSheetPrint
          quiz={printQuizObj}
          uid={teacherUid}
          onClose={() => setPrintModal(false)}
        />
      )}

      {/* ── PDF direct download (skips modal, fires print dialog immediately) ── */}
      {pdfMode && (
        <BubbleSheetPrint
          quiz={printQuizObj}
          uid={teacherUid}
          autoprint
          onClose={() => setPdfMode(false)}
        />
      )}
    </div>
  );
}
