import { useNavigate } from 'react-router-dom';
import { useLessonGenStore } from '../../store/lessonGenStore';
import { useAuth } from '../../hooks/useAuth';
import { BookOpen, CalendarDays, ArrowRight, RotateCcw, Award, CheckCircle2, Sparkles } from 'lucide-react';

const TYPES = [
  {
    key: 'ilaw',
    Icon: BookOpen,
    badge: 'DETAILED LESSON PLAN (DLP)',
    format: 'DOCX + PPTX',
    title: 'ILAW Lesson Plan',
    points: [
      '3-Step Guided Wizard (~3–5 mins)',
      'Kumpletong Pre-lesson, Lesson Flow & Pagtataya',
      'AI-Powered Unpacking ng DepEd MELCs',
    ],
    outputBadge: '📄 Vertical Multi-Step DLP Format',
    btnText: 'Gumawa ng ILAW Plan',
  },
  {
    key: 'dll',
    Icon: CalendarDays,
    badge: 'DEPED ORDER NO. 42, S. 2016',
    format: 'LANDSCAPE A4',
    title: 'Daily Lesson Log (DLL)',
    points: [
      '5-Day Weekly Matrix (Lunes–Biyernes)',
      'Kumpletong 10 Pamamaraan (Steps A hanggang J)',
      'A4 Landscape Word Document Export',
    ],
    outputBadge: '📊 5-Column DepEd Weekly Grid',
    btnText: 'Bumuo ng DLL Matrix',
  },
  {
    key: 'cot',
    Icon: Award,
    badge: 'RPMS-PPST OBSERVER RATED',
    format: '4AS FRAMEWORK',
    title: 'COT 4As Lesson Plan',
    points: [
      '4As Framework (Activity, Analysis, Abstraction, App)',
      'Built-in COT Indicator Evidence Map',
      'PIVOT 4A / IDEA Format Alignment',
    ],
    outputBadge: '🎯 Observation Rubric & Indicator Mapped',
    btnText: 'Ihanda ang COT Plan',
  },
];

export default function LessonGenGateway() {
  const navigate = useNavigate();
  const store    = useLessonGenStore();
  const { freeMode } = useAuth();

  const hasDraft = !!(store.subject || store.selectedDays?.length > 0);

  function handleILAW() {
    store.reset();
    navigate('/lesson-gen/step-1');
  }

  function handleResume() {
    if (store.unpackedSessions?.length > 0)  navigate('/lesson-gen/step-3');
    else if (store.competencyText)            navigate('/lesson-gen/step-2');
    else                                      navigate('/lesson-gen/step-1');
  }

  const HANDLERS = {
    ilaw: handleILAW,
    dll:  () => navigate('/dll-gen/step-1'),
    cot:  () => navigate('/cot-gen/step-1'),
  };

  return (
    <div style={{ maxWidth: 1060, margin: '0 auto', paddingBottom: 40 }}>

      {/* ── Page Header ── */}
      <div style={{ marginBottom: 32 }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'var(--kt-manila, #E4D5AC)', border: '1px solid var(--kt-manila-border, #C9B583)', borderRadius: 4, padding: '4px 10px', marginBottom: 12 }}>
          <Sparkles size={13} color="var(--kt-chalkboard, #1F3A2E)" />
          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--kt-chalkboard, #1F3A2E)', fontFamily: 'var(--kt-font-mono, monospace)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            KAGAMITAN SA PAGTUTURO · AI LESSON GENERATOR
          </span>
        </div>

        <h1 style={{ margin: '0 0 8px', fontSize: 30, fontWeight: 700, color: 'var(--kt-text-primary, #262119)', fontFamily: 'var(--kt-font-heading, "Bitter", serif)', lineHeight: 1.2 }}>
          Anong uri ng aralin ang iyong ihahanda?
        </h1>
        <p style={{ margin: 0, fontSize: 15, color: 'var(--kt-text-secondary, #6E6455)', lineHeight: 1.6 }}>
          Pumili ng format na angkop sa iyong pangangailangan — para sa araw-araw na klase, lingguhang submission, o pormal na observation.
        </p>
      </div>

      {/* ── Document Dossier Cards Grid (3 Columns) ── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(310px, 1fr))',
        gap: 22,
        marginBottom: 32,
      }}>
        {TYPES.map(type => {
          const { key, Icon, badge, format, title, points, outputBadge, btnText } = type;
          return (
            <div
              key={key}
              onClick={HANDLERS[key]}
              role="button"
              tabIndex={0}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') HANDLERS[key](); }}
              style={{
                background: 'var(--kt-card, #FBF7EC)',
                border: '1px solid var(--kt-border, #DCD0AE)',
                borderRadius: 'var(--kt-radius-md, 6px)',
                display: 'flex',
                flexDirection: 'column',
                boxShadow: '0 2px 8px rgba(38, 33, 25, 0.06)',
                cursor: 'pointer',
                transition: 'transform 0.18s ease, box-shadow 0.18s ease, border-color 0.18s ease',
                position: 'relative',
                overflow: 'hidden',
                textAlign: 'left',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.transform = 'translateY(-4px)';
                e.currentTarget.style.borderColor = 'var(--kt-manila-border, #C9B583)';
                e.currentTarget.style.boxShadow = '0 12px 28px rgba(38, 33, 25, 0.12)';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.borderColor = 'var(--kt-border, #DCD0AE)';
                e.currentTarget.style.boxShadow = '0 2px 8px rgba(38, 33, 25, 0.06)';
              }}
            >
              {/* Card Docket Header Bar */}
              <div style={{
                background: 'var(--kt-card-2, #F4EDDB)',
                borderBottom: '1px solid var(--kt-border, #DCD0AE)',
                padding: '12px 18px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{
                    width: 32, height: 32,
                    borderRadius: 4,
                    background: 'var(--kt-chalkboard, #1F3A2E)',
                    color: '#FBF7EC',
                    display: 'grid',
                    placeItems: 'center',
                    flexShrink: 0,
                  }}>
                    <Icon size={17} />
                  </div>
                  <span style={{
                    fontFamily: 'var(--kt-font-mono, monospace)',
                    fontSize: 10.5,
                    fontWeight: 700,
                    color: 'var(--kt-chalkboard, #1F3A2E)',
                    letterSpacing: '0.06em',
                  }}>
                    {badge}
                  </span>
                </div>

                <span style={{
                  fontFamily: 'var(--kt-font-mono, monospace)',
                  fontSize: 10,
                  fontWeight: 700,
                  color: 'var(--kt-text-secondary, #6E6455)',
                  background: 'rgba(38, 33, 25, 0.06)',
                  border: '1px solid var(--kt-border, #DCD0AE)',
                  borderRadius: 3,
                  padding: '2px 6px',
                }}>
                  {format}
                </span>
              </div>

              {/* Card Body */}
              <div style={{ padding: '20px 20px 18px', flex: 1, display: 'flex', flexDirection: 'column' }}>

                {/* Title */}
                <h2 style={{
                  margin: '0 0 14px',
                  fontSize: 20,
                  fontWeight: 700,
                  color: 'var(--kt-text-primary, #262119)',
                  fontFamily: 'var(--kt-font-heading, "Bitter", serif)',
                }}>
                  {title}
                </h2>

                {/* Feature checklist */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 9, marginBottom: 18 }}>
                  {points.map((pt, idx) => (
                    <div key={idx} style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                      <CheckCircle2 size={14} color="var(--kt-sage, #5F7A54)" style={{ marginTop: 2, flexShrink: 0 }} />
                      <span style={{ fontSize: 13, color: 'var(--kt-text-secondary, #6E6455)', lineHeight: 1.45 }}>
                        {pt}
                      </span>
                    </div>
                  ))}
                </div>

                {/* Output Badge */}
                <div style={{ marginTop: 'auto', marginBottom: 16 }}>
                  <div style={{
                    background: 'var(--kt-card-2, #F4EDDB)',
                    border: '1px dashed var(--kt-border, #DCD0AE)',
                    borderRadius: 4,
                    padding: '6px 10px',
                    fontSize: 11.5,
                    fontWeight: 600,
                    color: 'var(--kt-text-secondary, #6E6455)',
                    fontFamily: 'var(--kt-font-mono, monospace)',
                  }}>
                    {outputBadge}
                  </div>
                </div>

                {/* Action CTA Button */}
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  paddingTop: 12,
                  borderTop: '1px solid var(--kt-border, #DCD0AE)',
                }}>
                  {!freeMode ? (
                    <span style={{
                      fontSize: 11,
                      fontWeight: 600,
                      color: 'var(--kt-text-secondary, #6E6455)',
                      fontFamily: 'var(--kt-font-mono, monospace)',
                    }}>
                      3 tokens
                    </span>
                  ) : (
                    <span style={{
                      fontSize: 11,
                      fontWeight: 700,
                      color: 'var(--kt-sage, #5F7A54)',
                      fontFamily: 'var(--kt-font-mono, monospace)',
                    }}>
                      FREE MODE
                    </span>
                  )}

                  <div style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    background: 'var(--kt-chalkboard, #1F3A2E)',
                    color: '#FBF7EC',
                    padding: '8px 14px',
                    borderRadius: 'var(--kt-radius-sm, 4px)',
                    fontSize: 12.5,
                    fontWeight: 700,
                    fontFamily: 'var(--kt-font-ui, "Inter", sans-serif)',
                  }}>
                    {btnText} <ArrowRight size={14} />
                  </div>
                </div>

              </div>
            </div>
          );
        })}
      </div>

      {/* ── Resume In-Progress Draft Banner ── */}
      {hasDraft && (
        <div style={{
          background: 'var(--kt-manila, #E4D5AC)',
          border: '1px solid var(--kt-manila-border, #C9B583)',
          borderRadius: 'var(--kt-radius-md, 6px)',
          padding: '16px 20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 14,
          boxShadow: '0 2px 6px rgba(38, 33, 25, 0.06)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 36, height: 36,
              borderRadius: 4,
              background: 'var(--kt-chalkboard, #1F3A2E)',
              color: '#FBF7EC',
              display: 'grid',
              placeItems: 'center',
              flexShrink: 0,
            }}>
              <RotateCcw size={18} />
            </div>
            <div>
              <p style={{ margin: '0 0 2px', fontSize: 14, fontWeight: 700, color: 'var(--kt-text-primary, #262119)', fontFamily: 'var(--kt-font-heading, "Bitter", serif)' }}>
                Mayroon kang ILAW draft na kasalukuyang ginagawa
              </p>
              <p style={{ margin: 0, fontSize: 12.5, color: 'var(--kt-text-secondary, #6E6455)' }}>
                Paksa: <strong>{store.subject || 'Hindi pinangalanang aralin'}</strong> — Ipagpatuloy kung saan ka huminto
              </p>
            </div>
          </div>

          <button
            onClick={handleResume}
            style={{
              background: 'var(--kt-chalkboard, #1F3A2E)',
              color: '#FBF7EC',
              border: '1px solid var(--kt-chalkboard, #1F3A2E)',
              borderRadius: 'var(--kt-radius-sm, 4px)',
              padding: '9px 18px',
              fontSize: 13,
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              fontFamily: 'var(--kt-font-ui, "Inter", sans-serif)',
              transition: 'background 0.15s ease',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--kt-chalkboard-hover, #2B4E3E)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'var(--kt-chalkboard, #1F3A2E)'; }}
          >
            <RotateCcw size={14} />
            Ipagpatuloy ang Aralin (Resume)
          </button>
        </div>
      )}
    </div>
  );
}

