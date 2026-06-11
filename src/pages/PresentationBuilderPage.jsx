import { useState, useEffect } from 'react';
import {
  BookOpen, Plus, Sparkles, Download, ChevronLeft, ChevronRight,
  Loader2, Search, CheckCircle2, AlertCircle, X, RefreshCw, Projector,
} from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useLessonPlans } from '../hooks/useLessonPlans';
import { generateSlides } from '../services/presentationAI';
import { exportToPptx } from '../services/pptxExport';
import { deductTokens } from '../services/db';

const STYLES = ['Academic', 'Modern', 'Engaging'];

const STYLE_DESC = {
  Academic:  'Formal, structured language suited for academic review',
  Modern:    'Concise bullets, minimal text, professional tone',
  Engaging:  'Conversational, student-friendly, includes questions',
};

// ── Shared style tokens ────────────────────────────────────────────────────────
const card = {
  background: '#fff', borderRadius: 14,
  border: '1px solid rgba(45,106,79,0.12)', padding: '18px 20px',
};

const labelStyle = {
  display: 'block', fontSize: 11, fontWeight: 700,
  color: '#4a6357', textTransform: 'uppercase',
  letterSpacing: '0.07em', marginBottom: 6,
};

const inputStyle = {
  width: '100%', boxSizing: 'border-box',
  padding: '10px 12px', border: '1.5px solid rgba(45,106,79,0.2)',
  borderRadius: 8, fontSize: 14, background: '#f5faf7',
  color: '#163828', outline: 'none', fontFamily: '"Plus Jakarta Sans", sans-serif',
};

// ── Slide type badge ──────────────────────────────────────────────────────────
function LayoutBadge({ layout }) {
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
      letterSpacing: '0.07em', padding: '2px 7px', borderRadius: 20,
      background: layout === 'section' ? '#d8f3dc' : '#f0f4f2',
      color:      layout === 'section' ? '#163828' : '#4a6357',
    }}>
      {layout === 'section' ? 'Section' : 'Content'}
    </span>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function PresentationBuilderPage() {
  const { user } = useAuth();
  const { lessonPlans, loading: plansLoading } = useLessonPlans(user?.uid);

  const [source,      setSource]      = useState(null);   // 'lesson' | 'scratch'
  const [lesson,      setLesson]      = useState(null);   // selected lesson plan
  const [search,      setSearch]      = useState('');
  const [config,      setConfig]      = useState(() => ({
    title: '', subject: '', gradeLevel: '', competencyText: '',
    numSlides: 10, style: 'Academic', includeNotes: true,
    schoolName:  localStorage.getItem('pptSchoolName')  ?? '',
    schoolEmail: localStorage.getItem('pptSchoolEmail') ?? '',
  }));
  const [generating,  setGenerating]  = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [slides,      setSlides]      = useState(null);
  const [references,  setReferences]  = useState([]);
  const [error,       setError]       = useState('');

  // Persist school info so teachers don't re-type it every time
  useEffect(() => {
    localStorage.setItem('pptSchoolName',  config.schoolName);
    localStorage.setItem('pptSchoolEmail', config.schoolEmail);
  }, [config.schoolName, config.schoolEmail]);

  // Derived step
  const step = !source                          ? 'source'
    : source === 'lesson' && !lesson            ? 'pick'
    : !slides                                   ? 'config'
    : 'preview';

  function pickLesson(plan) {
    setLesson(plan);
    setConfig(c => ({
      ...c,
      title:          plan.lessonName     || '',
      subject:        plan.subject        || '',
      gradeLevel:     plan.gradeLevel     || '',
      competencyText: plan.competencyText || '',
    }));
  }

  function reset() {
    setSource(null); setLesson(null); setSlides(null); setReferences([]);
    setSearch(''); setError('');
    setConfig(c => ({ title: '', subject: '', gradeLevel: '', competencyText: '', numSlides: 10, style: 'Academic', includeNotes: true, schoolName: c.schoolName, schoolEmail: c.schoolEmail }));
  }

  function goBack() {
    setError('');
    if (step === 'preview') { setSlides(null); setReferences([]); return; }
    if (step === 'config')  { source === 'lesson' ? setLesson(null) : reset(); return; }
    if (step === 'pick')    { reset(); return; }
    reset();
  }

  async function handleGenerate() {
    if (!config.title.trim()) { setError('Please enter a presentation title.'); return; }
    setGenerating(true);
    setError('');

    try {
      await deductTokens(user.uid, 'presentation');
    } catch (err) {
      setError(err.message);
      setGenerating(false);
      return;
    }

    try {
      const { slides: generated, references: refs } = await generateSlides({
        title:          config.title,
        subject:        config.subject,
        gradeLevel:     config.gradeLevel,
        competencyText: config.competencyText,
        numSlides:      config.numSlides,
        style:          config.style,
        sessions:       lesson?.sessions ?? [],
        objectives:     lesson?.sessions?.map(s => s.objective).filter(Boolean).join('; ') ?? '',
      });
      setSlides(generated);
      setReferences(refs ?? []);
    } catch (e) {
      setError(e.message);
    } finally {
      setGenerating(false);
    }
  }

  async function handleDownload() {
    if (!slides) return;
    setDownloading(true);
    setError('');
    try {
      await exportToPptx({
        title:        config.title,
        subject:      config.subject,
        gradeLevel:   config.gradeLevel,
        schoolName:   config.schoolName,
        schoolEmail:  config.schoolEmail,
        slides,
        references,
        includeNotes: config.includeNotes,
      });
    } catch (e) {
      setError('Download failed: ' + e.message);
    } finally {
      setDownloading(false);
    }
  }

  const filteredPlans = lessonPlans.filter(p =>
    !search ||
    (p.lessonName || '').toLowerCase().includes(search.toLowerCase()) ||
    (p.subject    || '').toLowerCase().includes(search.toLowerCase()) ||
    (p.gradeLevel || '').toLowerCase().includes(search.toLowerCase())
  );

  const totalSlides = slides ? slides.length + 2 + (references.length ? 1 : 0) : 0;

  return (
    <div style={{ padding: '20px 16px', maxWidth: 680, margin: '0 auto', fontFamily: '"Plus Jakarta Sans", sans-serif' }}>

      {/* ── Page header ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
        {source && (
          <button onClick={goBack} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: '#4a6357', display: 'flex', alignItems: 'center', gap: 4,
            fontSize: 13, fontWeight: 600, padding: '4px 0', flexShrink: 0,
          }}>
            <ChevronLeft size={16} /> Back
          </button>
        )}
        <div style={{ flex: 1 }}>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: '#0d2218' }}>
            Presentation Builder
          </h1>
          <p style={{ margin: '2px 0 0', fontSize: 12, color: '#4a6357' }}>
            {step === 'source'  && 'Create an AI-powered lesson presentation'}
            {step === 'pick'    && 'Select a lesson to use as the content base'}
            {step === 'config'  && 'Configure your presentation'}
            {step === 'preview' && `${totalSlides} slides ready — review and download`}
          </p>
        </div>
      </div>

      {/* ── Error banner ── */}
      {error && (
        <div style={{
          display: 'flex', gap: 10, background: '#fde8e8',
          border: '1px solid rgba(224,92,92,0.25)', borderRadius: 10,
          padding: '10px 14px', marginBottom: 14,
        }}>
          <AlertCircle size={15} color="#e05c5c" style={{ flexShrink: 0, marginTop: 1 }} />
          <p style={{ margin: 0, fontSize: 13, color: '#e05c5c', flex: 1 }}>{error}</p>
          <button onClick={() => setError('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#e05c5c' }}>
            <X size={14} />
          </button>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════
          STEP 1 — Source picker
      ════════════════════════════════════════════════════════════════ */}
      {step === 'source' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* From My Lessons */}
          <button
            onClick={() => setSource('lesson')}
            style={{ ...card, cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 16, border: '1px solid rgba(45,106,79,0.12)' }}
            onMouseEnter={e => e.currentTarget.style.boxShadow = '0 4px 18px rgba(22,56,40,0.1)'}
            onMouseLeave={e => e.currentTarget.style.boxShadow = 'none'}
          >
            <div style={{ width: 50, height: 50, borderRadius: 12, background: '#d8f3dc', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
              <BookOpen size={22} color="#163828" />
            </div>
            <div style={{ flex: 1 }}>
              <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#0d2218' }}>From My Lessons</p>
              <p style={{ margin: '3px 0 0', fontSize: 13, color: '#4a6357', lineHeight: 1.4 }}>
                Use a saved lesson plan — objectives, activities, and flow are loaded automatically.
              </p>
            </div>
            <ChevronRight size={18} color="#9BB8A5" style={{ flexShrink: 0 }} />
          </button>

          {/* Start from scratch */}
          <button
            onClick={() => setSource('scratch')}
            style={{ ...card, cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 16, border: '1px solid rgba(45,106,79,0.12)' }}
            onMouseEnter={e => e.currentTarget.style.boxShadow = '0 4px 18px rgba(22,56,40,0.1)'}
            onMouseLeave={e => e.currentTarget.style.boxShadow = 'none'}
          >
            <div style={{ width: 50, height: 50, borderRadius: 12, background: '#e8f5e9', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
              <Plus size={22} color="#163828" />
            </div>
            <div style={{ flex: 1 }}>
              <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#0d2218' }}>Start from Scratch</p>
              <p style={{ margin: '3px 0 0', fontSize: 13, color: '#4a6357', lineHeight: 1.4 }}>
                Enter topic, grade level, and subject — AI builds the full slide deck for you.
              </p>
            </div>
            <ChevronRight size={18} color="#9BB8A5" style={{ flexShrink: 0 }} />
          </button>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════
          STEP 2 — Lesson picker
      ════════════════════════════════════════════════════════════════ */}
      {step === 'pick' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {/* Search box */}
          <div style={{ position: 'relative' }}>
            <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#9BB8A5', pointerEvents: 'none' }} />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by lesson name, subject, or grade…"
              style={{ ...inputStyle, paddingLeft: 34 }}
            />
          </div>

          {plansLoading ? (
            <div style={{ ...card, display: 'flex', alignItems: 'center', gap: 10, color: '#4a6357', fontSize: 13 }}>
              <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> Loading your lessons…
            </div>
          ) : filteredPlans.length === 0 ? (
            <div style={{ ...card, textAlign: 'center', padding: '36px 20px' }}>
              <BookOpen size={30} color="#9BB8A5" style={{ marginBottom: 10 }} />
              <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: '#4a6357' }}>
                {lessonPlans.length === 0
                  ? 'No saved lessons yet.'
                  : 'No lessons match your search.'}
              </p>
              {lessonPlans.length === 0 && (
                <p style={{ margin: '6px 0 0', fontSize: 12, color: '#9BB8A5' }}>
                  Build one in Lesson Gen first, then come back here.
                </p>
              )}
            </div>
          ) : (
            filteredPlans.map(plan => (
              <button
                key={plan.id}
                onClick={() => pickLesson(plan)}
                style={{ ...card, cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 14 }}
                onMouseEnter={e => e.currentTarget.style.boxShadow = '0 4px 18px rgba(22,56,40,0.1)'}
                onMouseLeave={e => e.currentTarget.style.boxShadow = 'none'}
              >
                <div style={{ width: 40, height: 40, borderRadius: 10, background: '#d8f3dc', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                  <Projector size={18} color="#163828" />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#0d2218', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {plan.lessonName || 'Untitled Lesson'}
                  </p>
                  <p style={{ margin: '3px 0 0', fontSize: 12, color: '#4a6357' }}>
                    {[plan.gradeLevel, plan.subject, plan.sessions?.length && `${plan.sessions.length} sessions`].filter(Boolean).join(' · ')}
                  </p>
                </div>
                <ChevronRight size={16} color="#9BB8A5" style={{ flexShrink: 0 }} />
              </button>
            ))
          )}
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════
          STEP 3 — Configure
      ════════════════════════════════════════════════════════════════ */}
      {step === 'config' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* Lesson source banner */}
          {lesson && (
            <div style={{ background: '#d8f3dc', borderRadius: 10, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
              <CheckCircle2 size={15} color="#2d6a4f" style={{ flexShrink: 0 }} />
              <p style={{ margin: 0, fontSize: 13, color: '#163828', fontWeight: 600 }}>
                Using: {lesson.lessonName}
              </p>
              <span style={{ marginLeft: 'auto', fontSize: 11, color: '#4a6357' }}>
                {lesson.sessions?.length ?? 0} sessions
              </span>
            </div>
          )}

          <div style={card}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

              {/* Title */}
              <div>
                <label style={labelStyle}>Presentation Title</label>
                <input
                  value={config.title}
                  onChange={e => setConfig(c => ({ ...c, title: e.target.value }))}
                  placeholder="e.g. Photosynthesis"
                  style={inputStyle}
                />
              </div>

              {/* Grade + Subject */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={labelStyle}>Grade Level</label>
                  <input
                    value={config.gradeLevel}
                    onChange={e => setConfig(c => ({ ...c, gradeLevel: e.target.value }))}
                    placeholder="e.g. Grade 7"
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label style={labelStyle}>Subject</label>
                  <input
                    value={config.subject}
                    onChange={e => setConfig(c => ({ ...c, subject: e.target.value }))}
                    placeholder="e.g. Science"
                    style={inputStyle}
                  />
                </div>
              </div>

              {/* Learning Competency */}
              <div>
                <label style={labelStyle}>
                  Learning Competency
                  <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0, marginLeft: 6, color: '#9BB8A5', fontSize: 10 }}>
                    — DepEd MELC · AI will search the web for aligned module content
                  </span>
                </label>
                <textarea
                  value={config.competencyText}
                  onChange={e => setConfig(c => ({ ...c, competencyText: e.target.value }))}
                  placeholder="e.g. Describe the structure and function of the cell membrane…"
                  rows={2}
                  style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.5 }}
                />
              </div>

              {/* School branding (footer on every slide) */}
              <div style={{ borderTop: '1px solid rgba(45,106,79,0.1)', paddingTop: 14 }}>
                <p style={{ margin: '0 0 10px', fontSize: 11, fontWeight: 700, color: '#4a6357', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                  Slide Footer
                </p>
                <p style={{ margin: '0 0 10px', fontSize: 11, color: '#9BB8A5' }}>
                  Appears on every slide — set it once and it's saved automatically.
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <div>
                    <label style={labelStyle}>School Name</label>
                    <input
                      value={config.schoolName}
                      onChange={e => setConfig(c => ({ ...c, schoolName: e.target.value }))}
                      placeholder="e.g. Dayap National High School"
                      style={inputStyle}
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>School Email</label>
                    <input
                      value={config.schoolEmail}
                      onChange={e => setConfig(c => ({ ...c, schoolEmail: e.target.value }))}
                      placeholder="e.g. 301238@deped.gov.ph"
                      style={inputStyle}
                    />
                  </div>
                </div>
              </div>

              {/* Slide count slider */}
              <div>
                <label style={labelStyle}>
                  Number of Slides —{' '}
                  <span style={{ color: '#163828', fontWeight: 800 }}>{config.numSlides}</span>
                  <span style={{ color: '#9BB8A5', fontWeight: 600 }}> (+ title & closing)</span>
                </label>
                <input
                  type="range" min={6} max={20} value={config.numSlides}
                  onChange={e => setConfig(c => ({ ...c, numSlides: Number(e.target.value) }))}
                  style={{ width: '100%', accentColor: '#163828', cursor: 'pointer' }}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#9BB8A5', marginTop: 2 }}>
                  <span>6 min</span>
                  <span>20 max</span>
                </div>
              </div>

              {/* Style selector */}
              <div>
                <label style={labelStyle}>Presentation Style</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  {STYLES.map(s => (
                    <button
                      key={s}
                      onClick={() => setConfig(c => ({ ...c, style: s }))}
                      title={STYLE_DESC[s]}
                      style={{
                        flex: 1, padding: '10px 0', borderRadius: 9, fontSize: 13, fontWeight: 600,
                        border: config.style === s ? '2px solid #163828' : '1.5px solid rgba(45,106,79,0.2)',
                        background: config.style === s ? '#163828' : '#f5faf7',
                        color: config.style === s ? '#fff' : '#4a6357',
                        cursor: 'pointer', fontFamily: '"Plus Jakarta Sans", sans-serif',
                        transition: 'background 0.15s, color 0.15s',
                      }}
                    >
                      {s}
                    </button>
                  ))}
                </div>
                <p style={{ margin: '6px 0 0', fontSize: 11, color: '#9BB8A5' }}>
                  {STYLE_DESC[config.style]}
                </p>
              </div>

              {/* Speaker notes toggle */}
              <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={config.includeNotes}
                  onChange={e => setConfig(c => ({ ...c, includeNotes: e.target.checked }))}
                  style={{ width: 16, height: 16, accentColor: '#163828', cursor: 'pointer' }}
                />
                <div>
                  <span style={{ fontSize: 13, color: '#163828', fontWeight: 600 }}>Include speaker notes</span>
                  <p style={{ margin: '1px 0 0', fontSize: 11, color: '#9BB8A5' }}>
                    AI writes what the teacher says for each slide
                  </p>
                </div>
              </label>
            </div>
          </div>

          {/* Generate button */}
          <button
            onClick={handleGenerate}
            disabled={generating || !config.title.trim()}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              width: '100%', padding: '15px 0', borderRadius: 12, border: 'none',
              background: (!config.title.trim() || generating) ? '#9BB8A5' : '#163828',
              color: '#fff', fontSize: 16, fontWeight: 700,
              cursor: (!config.title.trim() || generating) ? 'not-allowed' : 'pointer',
              fontFamily: '"Plus Jakarta Sans", sans-serif',
            }}
          >
            {generating
              ? <><Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} /> Generating slides…</>
              : <><Sparkles size={18} /> Generate Presentation</>
            }
          </button>
          {generating && (
            <p style={{ margin: 0, fontSize: 12, color: '#4a6357', textAlign: 'center' }}>
              Gemini is building {config.numSlides} slides — usually takes 10–20 seconds
            </p>
          )}
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════
          STEP 4 — Preview + Download
      ════════════════════════════════════════════════════════════════ */}
      {step === 'preview' && slides && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

          {/* Summary + Download CTA */}
          <div style={{ background: '#163828', borderRadius: 14, padding: '18px 20px', display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {config.title}
              </p>
              <p style={{ margin: '4px 0 0', fontSize: 12, color: '#52b788' }}>
                {config.gradeLevel} · {config.subject} · {totalSlides} slides total
              </p>
            </div>
            <button
              onClick={handleDownload}
              disabled={downloading}
              style={{
                display: 'flex', alignItems: 'center', gap: 7,
                padding: '11px 18px', borderRadius: 10, border: 'none',
                background: downloading ? 'rgba(255,255,255,0.2)' : '#52b788',
                color: '#fff', fontSize: 14, fontWeight: 700,
                cursor: downloading ? 'not-allowed' : 'pointer', flexShrink: 0,
                fontFamily: '"Plus Jakarta Sans", sans-serif',
              }}
            >
              {downloading
                ? <><Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> Downloading…</>
                : <><Download size={15} /> Download .pptx</>
              }
            </button>
          </div>

          {/* Slide preview list */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>

            {/* Title slide preview */}
            <div style={{ background: '#163828', borderRadius: 10, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#52b788', minWidth: 52 }}>Slide 1</span>
              <div style={{ flex: 1 }}>
                <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: '#fff' }}>{config.title}</p>
                <p style={{ margin: '2px 0 0', fontSize: 11, color: '#52b788' }}>Title Slide</p>
              </div>
            </div>

            {/* Generated content slides */}
            {slides.map((sl, i) => (
              <div key={i} style={{
                ...card,
                borderLeft: `3px solid ${sl.layout === 'section' ? '#52b788' : 'rgba(45,106,79,0.15)'}`,
                padding: '12px 16px',
                display: 'flex', gap: 12, alignItems: 'flex-start',
              }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#9BB8A5', minWidth: 52, paddingTop: 2 }}>
                  Slide {i + 2}
                </span>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#0d2218' }}>{sl.title}</p>
                    <LayoutBadge layout={sl.layout} />
                  </div>
                  {sl.bullets?.slice(0, 3).map((b, bi) => (
                    <p key={bi} style={{ margin: '2px 0 0', fontSize: 12, color: '#4a6357' }}>• {b}</p>
                  ))}
                  {sl.bullets?.length > 3 && (
                    <p style={{ margin: '2px 0 0', fontSize: 11, color: '#9BB8A5' }}>
                      +{sl.bullets.length - 3} more bullets
                    </p>
                  )}
                  {config.includeNotes && sl.notes && (
                    <p style={{ margin: '6px 0 0', fontSize: 11, color: '#9BB8A5', fontStyle: 'italic', borderTop: '1px solid rgba(45,106,79,0.1)', paddingTop: 6 }}>
                      Note: {sl.notes.slice(0, 100)}{sl.notes.length > 100 ? '…' : ''}
                    </p>
                  )}
                </div>
              </div>
            ))}

            {/* References slide preview */}
            {references.length > 0 && (
              <div style={{ ...card, borderLeft: '3px solid #1565c0', padding: '12px 16px' }}>
                <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#9BB8A5', minWidth: 52, paddingTop: 2 }}>
                    Slide {slides.length + 2}
                  </span>
                  <div style={{ flex: 1 }}>
                    <p style={{ margin: '0 0 6px', fontSize: 14, fontWeight: 700, color: '#0d2218' }}>
                      References &amp; Sources
                      <span style={{ marginLeft: 8, fontSize: 10, fontWeight: 600, color: '#1565c0', background: '#e8f0fe', borderRadius: 10, padding: '2px 7px' }}>
                        DepEd Sources
                      </span>
                    </p>
                    {references.map((ref, ri) => (
                      <p key={ri} style={{ margin: '2px 0 0', fontSize: 11, color: '#4a6357' }}>
                        {ri + 1}. {ref}
                      </p>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Closing slide preview */}
            <div style={{ background: '#163828', borderRadius: 10, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#52b788', minWidth: 52 }}>Slide {totalSlides}</span>
              <div style={{ flex: 1 }}>
                <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: '#fff' }}>Thank You!</p>
                <p style={{ margin: '2px 0 0', fontSize: 11, color: '#52b788' }}>Closing Slide</p>
              </div>
            </div>
          </div>

          {/* Regenerate + New buttons */}
          <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
            <button
              onClick={() => { setSlides(null); setReferences([]); }}
              style={{
                flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
                padding: '12px 0', borderRadius: 10,
                border: '1.5px solid rgba(45,106,79,0.22)', background: '#f5faf7',
                color: '#163828', fontSize: 13, fontWeight: 700, cursor: 'pointer',
                fontFamily: '"Plus Jakarta Sans", sans-serif',
              }}
            >
              <RefreshCw size={14} /> Regenerate
            </button>
            <button
              onClick={reset}
              style={{
                flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
                padding: '12px 0', borderRadius: 10,
                border: '1.5px solid rgba(45,106,79,0.22)', background: '#f5faf7',
                color: '#163828', fontSize: 13, fontWeight: 700, cursor: 'pointer',
                fontFamily: '"Plus Jakarta Sans", sans-serif',
              }}
            >
              <Plus size={14} /> New Presentation
            </button>
          </div>
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
