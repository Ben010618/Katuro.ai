import { useEffect } from 'react';
import {
  BookOpen, Plus, Sparkles, Download, ChevronLeft, ChevronRight,
  Loader2, Search, CheckCircle2, AlertCircle, X, RefreshCw,
  Projector, Trash2, FileText, Cpu,
} from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useLessonPlans } from '../hooks/useLessonPlans';
import { generateOutline, expandSlides, toExportSlides } from '../services/presentationAI';
import { exportToPptx } from '../services/pptxExport';
import { deductTokens } from '../services/db';
import { trackEvent } from '../services/usageTracker';
import { usePresentationStore } from '../store/presentationStore';
import { useToast } from '../context/ToastContext';
import { useState } from 'react';

const STYLES = ['Academic', 'Modern', 'Engaging'];
const STYLE_DESC = {
  Academic: 'Formal, structured — precise definitions and module examples',
  Modern:   'Concise bullets, bold key terms, professional tone',
  Engaging: 'Conversational, student-friendly, uses analogies and questions',
};

const SUBJECTS = [
  'Science','Mathematics','English','Filipino','Araling Panlipunan',
  'MAPEH','GMRC','Makabansa','Reading & Literacy','Language','TLE','EPP','ESP',
];
const GRADES = [
  'Kindergarten','Grade 1','Grade 2','Grade 3','Grade 4',
  'Grade 5','Grade 6','Grade 7','Grade 8','Grade 9',
  'Grade 10','Grade 11','Grade 12',
];

const TYPE_META = {
  title:        { bg: '#163828', fg: '#fff',    label: 'Title'        },
  objectives:   { bg: '#1565c0', fg: '#fff',    label: 'Objectives'   },
  concept:      { bg: '#7c3aed', fg: '#fff',    label: 'Concept'      },
  example:      { bg: '#d97706', fg: '#fff',    label: 'Example'      },
  illustration: { bg: '#0891b2', fg: '#fff',    label: 'Illustration' },
  activity:     { bg: '#059669', fg: '#fff',    label: 'Activity'     },
  assessment:   { bg: '#dc2626', fg: '#fff',    label: 'Assessment'   },
  summary:      { bg: '#374151', fg: '#fff',    label: 'Summary'      },
};
const typeMeta = t => TYPE_META[t] ?? { bg: '#9BB8A5', fg: '#fff', label: t };

const card = {
  background: 'var(--kt-card)', borderRadius: 14,
  border: '1px solid var(--kt-border)', padding: '18px 20px',
};
const labelStyle = {
  display: 'block', fontSize: 11, fontWeight: 700,
  color: 'var(--kt-text-secondary)', textTransform: 'uppercase',
  letterSpacing: '0.07em', marginBottom: 6,
};
const inputStyle = {
  width: '100%', boxSizing: 'border-box',
  padding: '10px 12px', border: '1.5px solid rgba(45,106,79,0.2)',
  borderRadius: 8, fontSize: 14, background: 'var(--kt-input-bg)',
  color: 'var(--kt-text-primary)', outline: 'none', fontFamily: '"Plus Jakarta Sans", sans-serif',
};
const selectStyle = { ...inputStyle, cursor: 'pointer', appearance: 'none' };

// ── Outline slide card ────────────────────────────────────────────────────────
function OutlineCard({ slide, index, total, onTitleChange, onRemove }) {
  const meta = typeMeta(slide.type);
  const canRemove = !['title', 'summary'].includes(slide.type);

  return (
    <div style={{
      ...card, padding: '12px 16px',
      display: 'flex', gap: 12, alignItems: 'flex-start',
      borderLeft: `3px solid ${meta.bg}`,
    }}>
      {/* Slide # + type */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, minWidth: 48, paddingTop: 2 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: '#9BB8A5' }}>#{index + 1}</span>
        <span style={{
          fontSize: 9, fontWeight: 700, textTransform: 'uppercase',
          background: meta.bg, color: meta.fg,
          borderRadius: 4, padding: '2px 5px', whiteSpace: 'nowrap',
        }}>{meta.label}</span>
        {slide.expand
          ? <Cpu size={11} color="#7c3aed" title="AI will expand" />
          : <FileText size={11} color="#9BB8A5" title="Template slide" />
        }
      </div>

      {/* Title + key points */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <input
          value={slide.title}
          onChange={e => onTitleChange(slide.id, e.target.value)}
          style={{
            ...inputStyle, padding: '6px 10px', fontSize: 13, fontWeight: 600,
            background: 'var(--kt-surface)', marginBottom: 6,
          }}
        />
        {slide.keyPoints?.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {slide.keyPoints.map((kp, i) => (
              <span key={i} style={{
                fontSize: 10, background: '#f0f4f2', color: 'var(--kt-text-secondary)',
                borderRadius: 4, padding: '2px 7px',
              }}>{kp}</span>
            ))}
          </div>
        )}
      </div>

      {/* Remove button */}
      {canRemove && (
        <button
          onClick={() => onRemove(slide.id)}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: '#e05c5c', padding: 4, borderRadius: 6, flexShrink: 0,
            display: 'flex', alignItems: 'center',
          }}
          title="Remove slide"
        >
          <Trash2 size={14} />
        </button>
      )}
    </div>
  );
}

// ── Preview slide card ────────────────────────────────────────────────────────
function PreviewCard({ slide, index, includeNotes }) {
  const meta      = typeMeta(slide.type);
  const isSection = ['title', 'objectives', 'summary'].includes(slide.type);

  return (
    <div style={{
      ...card, padding: '12px 16px',
      borderLeft: `3px solid ${meta.bg}`,
      display: 'flex', gap: 12, alignItems: 'flex-start',
    }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, minWidth: 48, paddingTop: 2 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: '#9BB8A5' }}>#{index + 1}</span>
        <span style={{
          fontSize: 9, fontWeight: 700, textTransform: 'uppercase',
          background: meta.bg, color: meta.fg,
          borderRadius: 4, padding: '2px 5px', whiteSpace: 'nowrap',
        }}>{meta.label}</span>
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ margin: '0 0 2px', fontSize: 14, fontWeight: 700, color: 'var(--kt-text-primary)' }}>{slide.title}</p>
        {slide.headline && (
          <p style={{ margin: '0 0 6px', fontSize: 12, color: 'var(--kt-text-secondary)', fontStyle: 'italic' }}>{slide.headline}</p>
        )}

        {isSection ? (
          slide.bullets?.length > 0 && slide.bullets.map((b, i) => (
            <p key={i} style={{ margin: '2px 0', fontSize: 12, color: 'var(--kt-text-secondary)' }}>• {b}</p>
          ))
        ) : (
          <>
            {slide.body && (
              <p style={{ margin: '0 0 6px', fontSize: 12, color: 'var(--kt-text-primary)', lineHeight: 1.5 }}>
                {slide.body.slice(0, 140)}{slide.body.length > 140 ? '…' : ''}
              </p>
            )}
            {slide.bullets?.slice(0, 3).map((b, i) => (
              <p key={i} style={{ margin: '2px 0', fontSize: 12, color: 'var(--kt-text-secondary)' }}>• {b.slice(0, 90)}{b.length > 90 ? '…' : ''}</p>
            ))}
            {slide.bullets?.length > 3 && (
              <p style={{ margin: '2px 0', fontSize: 11, color: '#9BB8A5' }}>+{slide.bullets.length - 3} more bullets</p>
            )}
          </>
        )}

        {includeNotes && slide.teacherNote && (
          <p style={{
            margin: '6px 0 0', fontSize: 11, color: '#9BB8A5', fontStyle: 'italic',
            borderTop: '1px solid rgba(45,106,79,0.1)', paddingTop: 6,
          }}>
            Teacher note: {slide.teacherNote.slice(0, 100)}{slide.teacherNote.length > 100 ? '…' : ''}
          </p>
        )}

        {slide.suggestedVisual && (
          <p style={{ margin: '4px 0 0', fontSize: 10, color: '#7c3aed' }}>
            Visual: {slide.suggestedVisual.slice(0, 80)}{slide.suggestedVisual.length > 80 ? '…' : ''}
          </p>
        )}
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function PresentationBuilderPage() {
  const { user }      = useAuth();
  const { addToast }  = useToast();
  const { lessonPlans, loading: plansLoading } = useLessonPlans(user?.uid);
  const store         = usePresentationStore();
  const [search, setSearch] = useState('');
  const [downloading, setDownloading] = useState(false);

  // Derive current step from store state
  const step =
    store.source === null                                                 ? 'source'
    : store.source === 'lesson' && !store.lesson                         ? 'pick'
    : store.status === 'idle' || store.status === 'generating-outline'
      || store.status === 'error'                                        ? 'input'
    : store.status === 'outline-ready' || store.status === 'expanding'   ? 'outline'
    : /* done */                                                           'preview';

  function goBack() {
    if (step === 'preview') { store.setStatus('outline-ready'); return; }
    if (step === 'outline') { store.setStatus('idle'); return; }
    if (step === 'input')   {
      store.source === 'lesson' ? store.setField('lesson', null) && store.setStatus('idle')
                                : store.reset();
      store.reset();
      return;
    }
    if (step === 'pick') { store.reset(); return; }
    store.reset();
  }

  // ── Stage 1: Generate outline ──────────────────────────────────────────────
  async function handleGenerateOutline() {
    if (!store.subject || !store.gradeLevel || !store.topic) {
      store.setError('Subject, Grade Level, and Topic are required.');
      return;
    }
    store.setStatus('generating-outline');
    try {
      const { outline, cached } = await generateOutline({
        subject:    store.subject,
        gradeLevel: store.gradeLevel,
        melcCode:   store.melcCode,
        topic:      store.topic,
        slideCount: store.slideCount,
      });
      store.setOutline(outline);
      if (cached) addToast('Outline loaded from cache — instant!', 'info');
    } catch (err) {
      store.setError(err.message ?? 'Could not generate outline. Please try again.');
    }
  }

  // ── Stage 2: Expand slides ─────────────────────────────────────────────────
  async function handleExpandSlides() {
    if (!store.outline?.length) return;
    store.setStatus('expanding');

    try {
      await deductTokens(user.uid, 'presentation', 3);
      trackEvent(user.uid, 'presentation_built', { subject: store.subject, grade: store.gradeLevel });
    } catch (err) {
      store.setError(err.message);
      return;
    }

    try {
      const { slides } = await expandSlides({
        subject:    store.subject,
        gradeLevel: store.gradeLevel,
        melcCode:   store.melcCode,
        topic:      store.topic,
        slides:     store.outline,
        style:      store.style,
      });
      store.setExpandedSlides(slides);
    } catch (err) {
      store.setError(err.message ?? 'Could not expand slides. Please try again.');
    }
  }

  // ── Download PPTX ──────────────────────────────────────────────────────────
  async function handleDownload() {
    if (!store.expandedSlides) return;
    setDownloading(true);
    try {
      await exportToPptx({
        title:        store.topic,
        subject:      store.subject,
        gradeLevel:   store.gradeLevel,
        schoolName:   store.schoolName,
        schoolEmail:  store.schoolEmail,
        slides:       toExportSlides(store.expandedSlides),
        references:   [],
        includeNotes: store.includeNotes,
      });
    } catch (e) {
      addToast('Download failed: ' + e.message, 'error');
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

  const isGeneratingOutline = store.status === 'generating-outline';
  const isExpanding         = store.status === 'expanding';
  const expandCount         = store.outline?.filter(s => s.expand).length ?? 0;

  return (
    <div style={{ padding: '20px 16px', maxWidth: 680, margin: '0 auto', fontFamily: '"Plus Jakarta Sans", sans-serif' }}>

      {/* Page header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
        {store.source && (
          <button onClick={goBack} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--kt-text-secondary)', display: 'flex', alignItems: 'center', gap: 4,
            fontSize: 13, fontWeight: 600, padding: '4px 0', flexShrink: 0,
          }}>
            <ChevronLeft size={16} /> Back
          </button>
        )}
        <div style={{ flex: 1 }}>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: 'var(--kt-text-primary)' }}>
            Presentation Builder
          </h1>
          <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--kt-text-secondary)' }}>
            {step === 'source'  && 'Create an AI-powered lesson presentation'}
            {step === 'pick'    && 'Select a lesson to use as the content base'}
            {step === 'input'   && 'Set lesson details — outline generation is free'}
            {step === 'outline' && `${store.outline?.length ?? 0} slides · review and edit before expanding`}
            {step === 'preview' && `${store.expandedSlides?.length ?? 0} slides ready — review and download`}
          </p>
        </div>
      </div>

      {/* Error banner */}
      {store.error && (
        <div style={{
          display: 'flex', gap: 10, background: '#fde8e8',
          border: '1px solid rgba(224,92,92,0.25)', borderRadius: 10,
          padding: '10px 14px', marginBottom: 14,
        }}>
          <AlertCircle size={15} color="#e05c5c" style={{ flexShrink: 0, marginTop: 1 }} />
          <p style={{ margin: 0, fontSize: 13, color: '#e05c5c', flex: 1 }}>{store.error}</p>
          <button onClick={() => store.setError(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#e05c5c' }}>
            <X size={14} />
          </button>
        </div>
      )}

      {/* ── STEP: source ─────────────────────────────────────────────────────── */}
      {step === 'source' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {[
            {
              icon: BookOpen, bg: '#d8f3dc', title: 'From My Lessons',
              desc: 'Use a saved ILAW or DLL — subject, grade, and MELC are pre-filled.',
              action: () => store.setSource('lesson'),
            },
            {
              icon: Plus, bg: '#e8f5e9', title: 'Start from Scratch',
              desc: 'Enter your own topic, grade, and MELC code to build a new presentation.',
              action: () => { store.setSource('scratch'); store.setStatus('idle'); },
            },
          ].map(({ icon: Icon, bg, title, desc, action }) => (
            <button
              key={title}
              onClick={action}
              style={{ ...card, cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 16 }}
              onMouseEnter={e => e.currentTarget.style.boxShadow = '0 4px 18px rgba(22,56,40,0.1)'}
              onMouseLeave={e => e.currentTarget.style.boxShadow = 'none'}
            >
              <div style={{ width: 50, height: 50, borderRadius: 12, background: bg, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                <Icon size={22} color="#163828" />
              </div>
              <div style={{ flex: 1 }}>
                <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: 'var(--kt-text-primary)' }}>{title}</p>
                <p style={{ margin: '3px 0 0', fontSize: 13, color: 'var(--kt-text-secondary)', lineHeight: 1.4 }}>{desc}</p>
              </div>
              <ChevronRight size={18} color="#9BB8A5" style={{ flexShrink: 0 }} />
            </button>
          ))}
        </div>
      )}

      {/* ── STEP: pick ───────────────────────────────────────────────────────── */}
      {step === 'pick' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
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
            <div style={{ ...card, display: 'flex', alignItems: 'center', gap: 10, color: 'var(--kt-text-secondary)', fontSize: 13 }}>
              <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> Loading your lessons…
            </div>
          ) : filteredPlans.length === 0 ? (
            <div style={{ ...card, textAlign: 'center', padding: '36px 20px' }}>
              <BookOpen size={30} color="#9BB8A5" style={{ marginBottom: 10 }} />
              <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: 'var(--kt-text-secondary)' }}>
                {lessonPlans.length === 0 ? 'No saved lessons yet.' : 'No lessons match your search.'}
              </p>
            </div>
          ) : filteredPlans.map(plan => (
            <button
              key={plan.id}
              onClick={() => { store.setLesson(plan); store.setStatus('idle'); }}
              style={{ ...card, cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 14 }}
              onMouseEnter={e => e.currentTarget.style.boxShadow = '0 4px 18px rgba(22,56,40,0.1)'}
              onMouseLeave={e => e.currentTarget.style.boxShadow = 'none'}
            >
              <div style={{ width: 40, height: 40, borderRadius: 10, background: '#d8f3dc', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                <Projector size={18} color="#163828" />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                  <span style={{ fontSize: 9, fontWeight: 700, borderRadius: 4, padding: '1px 5px', flexShrink: 0, background: plan.type === 'dll' ? '#dcfce7' : plan.type === 'cot' ? '#fef3c7' : '#dbeafe', color: plan.type === 'dll' ? '#14532d' : plan.type === 'cot' ? '#92400e' : '#1e3a8a' }}>
                    {plan.type === 'dll' ? 'DLL' : plan.type === 'cot' ? 'COT' : 'ILAW'}
                  </span>
                  <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--kt-text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {plan.lessonName || 'Untitled Lesson'}
                  </p>
                </div>
                <p style={{ margin: 0, fontSize: 12, color: 'var(--kt-text-secondary)' }}>
                  {[plan.gradeLevel, plan.subject].filter(Boolean).join(' · ')}
                </p>
              </div>
              <ChevronRight size={16} color="#9BB8A5" style={{ flexShrink: 0 }} />
            </button>
          ))}
        </div>
      )}

      {/* ── STEP: input ──────────────────────────────────────────────────────── */}
      {step === 'input' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

          {store.lesson && (
            <div style={{ background: '#d8f3dc', borderRadius: 10, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
              <CheckCircle2 size={15} color="#2d6a4f" style={{ flexShrink: 0 }} />
              <p style={{ margin: 0, fontSize: 13, color: 'var(--kt-text-primary)', fontWeight: 600 }}>
                Using: {store.lesson.lessonName}
              </p>
            </div>
          )}

          <div style={card}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

              {/* Topic */}
              <div>
                <label style={labelStyle}>Topic / Lesson Title</label>
                <input
                  value={store.topic}
                  onChange={e => store.setField('topic', e.target.value)}
                  placeholder="e.g. Photosynthesis and Cellular Respiration"
                  style={inputStyle}
                />
              </div>

              {/* Subject + Grade */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={labelStyle}>Subject</label>
                  <select
                    value={store.subject}
                    onChange={e => store.setField('subject', e.target.value)}
                    style={selectStyle}
                  >
                    <option value="">Select subject…</option>
                    {SUBJECTS.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Grade Level</label>
                  <select
                    value={store.gradeLevel}
                    onChange={e => store.setField('gradeLevel', e.target.value)}
                    style={selectStyle}
                  >
                    <option value="">Select grade…</option>
                    {GRADES.map(g => <option key={g} value={g}>{g}</option>)}
                  </select>
                </div>
              </div>

              {/* MELC Code */}
              <div>
                <label style={labelStyle}>
                  MELC Code / Learning Competency
                  <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0, marginLeft: 6, color: '#9BB8A5', fontSize: 10 }}>
                    — e.g. S8LT-Ia-b-26 or full competency statement
                  </span>
                </label>
                <textarea
                  value={store.melcCode}
                  onChange={e => store.setField('melcCode', e.target.value)}
                  placeholder="Paste the MELC code or full competency statement here…"
                  rows={2}
                  style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.5 }}
                />
              </div>

              {/* Slide count */}
              <div>
                <label style={labelStyle}>
                  Number of Slides —{' '}
                  <span style={{ color: 'var(--kt-text-primary)', fontWeight: 800 }}>{store.slideCount}</span>
                  <span style={{ color: '#9BB8A5', fontWeight: 600 }}> (+ auto title & closing)</span>
                </label>
                <input
                  type="range" min={6} max={20} value={store.slideCount}
                  onChange={e => store.setField('slideCount', Number(e.target.value))}
                  style={{ width: '100%', accentColor: '#163828', cursor: 'pointer' }}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#9BB8A5', marginTop: 2 }}>
                  <span>6 min</span><span>20 max</span>
                </div>
              </div>

              {/* Style */}
              <div>
                <label style={labelStyle}>Presentation Style</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  {STYLES.map(s => (
                    <button
                      key={s}
                      onClick={() => store.setField('style', s)}
                      title={STYLE_DESC[s]}
                      style={{
                        flex: 1, padding: '10px 0', borderRadius: 9, fontSize: 13, fontWeight: 600,
                        border: store.style === s ? '2px solid #163828' : '1.5px solid rgba(45,106,79,0.2)',
                        background: store.style === s ? '#163828' : '#f5faf7',
                        color: store.style === s ? '#fff' : '#4a6357',
                        cursor: 'pointer', fontFamily: '"Plus Jakarta Sans", sans-serif',
                      }}
                    >{s}</button>
                  ))}
                </div>
                <p style={{ margin: '6px 0 0', fontSize: 11, color: '#9BB8A5' }}>{STYLE_DESC[store.style]}</p>
              </div>

              {/* School footer */}
              <div style={{ borderTop: '1px solid rgba(45,106,79,0.1)', paddingTop: 14 }}>
                <p style={{ margin: '0 0 8px', fontSize: 11, fontWeight: 700, color: 'var(--kt-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                  Slide Footer (saved automatically)
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <div>
                    <label style={labelStyle}>School Name</label>
                    <input
                      value={store.schoolName}
                      onChange={e => store.setField('schoolName', e.target.value)}
                      placeholder="e.g. Dayap National High School"
                      style={inputStyle}
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>School Email</label>
                    <input
                      value={store.schoolEmail}
                      onChange={e => store.setField('schoolEmail', e.target.value)}
                      placeholder="e.g. 301238@deped.gov.ph"
                      style={inputStyle}
                    />
                  </div>
                </div>
              </div>

              {/* Speaker notes toggle */}
              <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={store.includeNotes}
                  onChange={e => store.setField('includeNotes', e.target.checked)}
                  style={{ width: 16, height: 16, accentColor: '#163828', cursor: 'pointer' }}
                />
                <div>
                  <span style={{ fontSize: 13, color: 'var(--kt-text-primary)', fontWeight: 600 }}>Include speaker notes</span>
                  <p style={{ margin: '1px 0 0', fontSize: 11, color: '#9BB8A5' }}>
                    kaTuro writes what the teacher says for each slide
                  </p>
                </div>
              </label>
            </div>
          </div>

          {/* Info chip */}
          <div style={{ background: '#f0f4ff', border: '1px solid rgba(99,102,241,0.2)', borderRadius: 10, padding: '10px 14px', display: 'flex', gap: 8 }}>
            <Sparkles size={14} color="#6366f1" style={{ flexShrink: 0, marginTop: 1 }} />
            <p style={{ margin: 0, fontSize: 12, color: '#4338ca' }}>
              Generating the outline is <strong>free</strong>. You&apos;ll spend <strong>3 tokens</strong> only when you confirm and expand the slides.
            </p>
          </div>

          {/* Generate Outline button */}
          <button
            onClick={handleGenerateOutline}
            disabled={isGeneratingOutline || !store.subject || !store.gradeLevel || !store.topic}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              width: '100%', padding: '15px 0', borderRadius: 12, border: 'none',
              background: (isGeneratingOutline || !store.subject || !store.gradeLevel || !store.topic)
                ? '#9BB8A5' : '#163828',
              color: '#fff', fontSize: 16, fontWeight: 700, cursor: 'pointer',
              fontFamily: '"Plus Jakarta Sans", sans-serif',
            }}
          >
            {isGeneratingOutline
              ? <><Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} /> Generating outline…</>
              : <><Sparkles size={18} /> Generate Slide Outline</>
            }
          </button>
        </div>
      )}

      {/* ── STEP: outline ────────────────────────────────────────────────────── */}
      {step === 'outline' && store.outline && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

          {/* Info bar */}
          <div style={{ ...card, padding: '12px 16px', background: 'var(--kt-surface)', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 160 }}>
              <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: 'var(--kt-text-primary)' }}>
                {store.topic} · {store.gradeLevel} · {store.subject}
              </p>
              <p style={{ margin: '2px 0 0', fontSize: 11, color: 'var(--kt-text-secondary)' }}>
                {store.outline.length} slides · {expandCount} need AI expansion · {store.outline.length - expandCount} template
              </p>
            </div>
            <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
              <span style={{ fontSize: 10, background: '#ede9fe', color: '#6d28d9', borderRadius: 6, padding: '3px 8px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4 }}>
                <Cpu size={10} /> {expandCount} AI slides
              </span>
              <span style={{ fontSize: 10, background: '#f0f4f2', color: 'var(--kt-text-secondary)', borderRadius: 6, padding: '3px 8px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4 }}>
                <FileText size={10} /> {store.outline.length - expandCount} template
              </span>
            </div>
          </div>

          {/* Outline cards */}
          {store.outline.map((slide, i) => (
            <OutlineCard
              key={slide.id}
              slide={slide}
              index={i}
              total={store.outline.length}
              onTitleChange={store.updateOutlineSlide}
              onRemove={store.removeOutlineSlide}
            />
          ))}

          {/* Cost notice */}
          <div style={{ background: '#fff8e1', border: '1px solid rgba(232,163,32,0.3)', borderRadius: 10, padding: '10px 14px', display: 'flex', gap: 8 }}>
            <AlertCircle size={14} color="#b47a10" style={{ flexShrink: 0, marginTop: 1 }} />
            <p style={{ margin: 0, fontSize: 12, color: '#7a5200' }}>
              Expanding {expandCount} AI slides will cost <strong>3 tokens</strong>. Template slides are free.
            </p>
          </div>

          {/* Expand button */}
          <button
            onClick={handleExpandSlides}
            disabled={isExpanding}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              width: '100%', padding: '15px 0', borderRadius: 12, border: 'none',
              background: isExpanding ? '#9BB8A5' : '#163828',
              color: '#fff', fontSize: 16, fontWeight: 700,
              cursor: isExpanding ? 'not-allowed' : 'pointer',
              fontFamily: '"Plus Jakarta Sans", sans-serif',
            }}
          >
            {isExpanding
              ? <><Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} /> Expanding slides in parallel…</>
              : <><Sparkles size={18} /> Expand All Slides · 3 tokens</>
            }
          </button>
          {isExpanding && (
            <p style={{ margin: 0, fontSize: 12, color: 'var(--kt-text-secondary)', textAlign: 'center' }}>
              kaTuro is expanding {expandCount} slides simultaneously — usually 15–30 seconds
            </p>
          )}

          {/* Regenerate outline */}
          <button
            onClick={handleGenerateOutline}
            disabled={isExpanding}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
              width: '100%', padding: '11px 0', borderRadius: 10,
              border: '1.5px solid rgba(45,106,79,0.22)', background: 'var(--kt-surface)',
              color: 'var(--kt-text-primary)', fontSize: 13, fontWeight: 700, cursor: 'pointer',
              fontFamily: '"Plus Jakarta Sans", sans-serif',
            }}
          >
            <RefreshCw size={14} /> Regenerate Outline
          </button>
        </div>
      )}

      {/* ── STEP: preview ────────────────────────────────────────────────────── */}
      {step === 'preview' && store.expandedSlides && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

          {/* Download CTA */}
          <div style={{ background: '#163828', borderRadius: 14, padding: '18px 20px', display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {store.topic}
              </p>
              <p style={{ margin: '4px 0 0', fontSize: 12, color: '#52b788' }}>
                {store.gradeLevel} · {store.subject} · {store.expandedSlides.length + 2} slides total
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

          {/* Slide previews */}
          {store.expandedSlides.map((sl, i) => (
            <PreviewCard
              key={sl.id}
              slide={sl}
              index={i}
              includeNotes={store.includeNotes}
            />
          ))}

          {/* Action buttons */}
          <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
            <button
              onClick={() => store.setStatus('outline-ready')}
              style={{
                flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
                padding: '12px 0', borderRadius: 10,
                border: '1.5px solid rgba(45,106,79,0.22)', background: 'var(--kt-surface)',
                color: 'var(--kt-text-primary)', fontSize: 13, fontWeight: 700, cursor: 'pointer',
                fontFamily: '"Plus Jakarta Sans", sans-serif',
              }}
            >
              <RefreshCw size={14} /> Regenerate
            </button>
            <button
              onClick={store.reset}
              style={{
                flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
                padding: '12px 0', borderRadius: 10,
                border: '1.5px solid rgba(45,106,79,0.22)', background: 'var(--kt-surface)',
                color: 'var(--kt-text-primary)', fontSize: 13, fontWeight: 700, cursor: 'pointer',
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
