import { useNavigate } from 'react-router-dom';
import { useLessonGenStore } from '../../store/lessonGenStore';
import { Sparkles, BookOpen, CheckSquare, ArrowRight, RotateCcw, ChevronRight } from 'lucide-react';

const STEPS = [
  {
    number: 1,
    label: 'Session Setup',
    Icon: BookOpen,
    color: '#0d9488',
    bg: '#ccfbf1',
    desc: 'Set subject, grade, term, week, and teaching days. Each day = one session.',
  },
  {
    number: 2,
    label: 'Competency',
    Icon: CheckSquare,
    color: '#7c3aed',
    bg: '#ede9fe',
    desc: 'Paste your competency from the Curriculum Guide. AI unpacks it into per-session objectives.',
  },
  {
    number: 3,
    label: 'Generate',
    Icon: Sparkles,
    color: '#e8a320',
    bg: 'rgba(232,163,32,0.12)',
    desc: 'Review and click Generate. kaTuro writes the full ILAW document per session.',
  },
];

export default function LessonGenGateway() {
  const navigate = useNavigate();
  const store    = useLessonGenStore();

  const hasDraft = !!(store.subject || store.selectedDays.length > 0);

  function handleNew() {
    store.reset();
    navigate('/lesson-gen/step-1');
  }

  function handleResume() {
    if (store.unpackedSessions?.length > 0)  navigate('/lesson-gen/step-3');
    else if (store.competencyText)            navigate('/lesson-gen/step-2');
    else                                      navigate('/lesson-gen/step-1');
  }

  return (
    <div style={{ maxWidth: 720, margin: '0 auto' }}>

      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <div style={{
            background: 'linear-gradient(135deg, #0d2218, #2d6a4f)',
            borderRadius: 10, padding: '6px 10px',
            display: 'flex', alignItems: 'center', gap: 6,
          }}>
            <Sparkles size={13} color="#52b788" />
            <span style={{ fontSize: 11, fontWeight: 700, color: '#52b788', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
              AI Lesson Generator
            </span>
          </div>
        </div>
        <h1 style={{ margin: 0, fontSize: 28, fontWeight: 700, color: '#0d2218', lineHeight: 1.2 }}>
          Build your ILAW lesson plan
        </h1>
        <p style={{ margin: '6px 0 0', fontSize: 15, color: '#4a6357', lineHeight: 1.65 }}>
          3 steps, ~5 minutes. Pick your days — kaTuro writes every session.
        </p>
      </div>

      {/* Step strip */}
      <div style={{
        background: '#fff', borderRadius: 14,
        border: '1px solid rgba(45,106,79,0.12)',
        overflow: 'hidden', marginBottom: 16,
      }}>
        {STEPS.map((step, i) => (
          <div key={step.number} style={{
            display: 'flex', alignItems: 'flex-start', gap: 16, padding: '18px 22px',
            borderBottom: i < STEPS.length - 1 ? '1px solid rgba(45,106,79,0.08)' : 'none',
          }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}>
              <div style={{
                width: 38, height: 38, borderRadius: '50%', flexShrink: 0,
                background: step.bg, display: 'grid', placeItems: 'center',
              }}>
                <step.Icon size={17} color={step.color} />
              </div>
              {i < STEPS.length - 1 && (
                <div style={{ width: 2, height: 16, background: 'rgba(45,106,79,0.1)' }} />
              )}
            </div>

            <div style={{ flex: 1, paddingTop: 5 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: step.color, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  Step {step.number}
                </span>
                <span style={{ fontSize: 14, fontWeight: 600, color: '#0d2218' }}>{step.label}</span>
              </div>
              <p style={{ margin: 0, fontSize: 13, color: '#4a6357', lineHeight: 1.55 }}>{step.desc}</p>
            </div>

            <ChevronRight size={15} color="rgba(45,106,79,0.2)" style={{ flexShrink: 0, marginTop: 10 }} />
          </div>
        ))}
      </div>

      {/* Callout */}
      <div style={{
        background: 'linear-gradient(135deg, #f5faf7 0%, #d8f3dc 100%)',
        border: '1px solid rgba(45,106,79,0.18)', borderRadius: 12, padding: '14px 18px',
        display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 24,
      }}>
        <Sparkles size={15} color="#2d6a4f" style={{ flexShrink: 0, marginTop: 2 }} />
        <div>
          <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: '#1a3d2b' }}>
            You provide 3 things — AI writes the rest
          </p>
          <p style={{ margin: '3px 0 0', fontSize: 13, color: '#4a6357' }}>
            Session setup · Learning competency · Your observation.
            kaTuro writes Pre-Lesson, Flow, Assessment, Extended Learning, and more.
          </p>
        </div>
      </div>

      {/* CTAs */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <button onClick={handleNew} className="btn-primary" style={{ fontSize: 15, padding: '12px 24px' }}>
          <Sparkles size={15} />
          Start New Lesson Plan
          <ArrowRight size={15} />
        </button>

        {hasDraft && (
          <button onClick={handleResume} className="btn-outline" style={{ fontSize: 15, padding: '12px 24px' }}>
            <RotateCcw size={14} />
            Resume Draft — {store.subject || 'Untitled'}
          </button>
        )}
      </div>

      <p style={{ marginTop: 16, fontSize: 12, color: '#4a6357', opacity: 0.55 }}>
        ILAW format · DepEd-aligned · 3 objectives per session (Cognitive · Affective · Psychomotor)
      </p>
    </div>
  );
}
