import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { ClipboardList, ClipboardCheck, ArrowRight, CheckCircle2, Sparkles, ScanLine, FileSpreadsheet } from 'lucide-react';

const TYPES = [
  {
    key: 'quiz',
    Icon: ClipboardList,
    badge: 'FORMATIVE QUIZ & SCANNER',
    format: 'PRINTABLE + SCANNER',
    title: 'Quiz Builder & Auto-Scanner',
    points: [
      'Mabilisang pagbuo ng pagsasanay mula sa anumang naitalang aralin',
      'Multiple Choice, Identification, at Tama o Mali na may Answer Key',
      'May kasamang AI Camera Answer Sheet Scanner para sa awtomatikong pag-grade',
    ],
    outputBadge: '📄 Ready-to-Print Quiz Sheet + Auto-Grading Scanner',
    btnText: 'Buksan ang Quiz Builder',
  },
  {
    key: 'test',
    Icon: FileSpreadsheet,
    badge: 'SUMMATIVE PERIODICAL EXAM',
    format: 'DEPED TOS MATRIX + DOCX',
    title: 'DepEd Test Builder (with TOS)',
    points: [
      'DepEd Table of Specifications (TOS) na may automated cognitive distribution',
      'Bloom’s Taxonomy breakdown (Remembering, Understanding, Applying, etc.)',
      'Ready-to-Print 2-Column Examination Paper at Teacher TOS Word Export',
    ],
    outputBadge: '📊 Complete TOS Matrix + Official Exam Paper (.docx)',
    btnText: 'Bumuo ng Test na may TOS',
  },
];

export default function AssessmentGateway() {
  const navigate = useNavigate();
  const { freeMode } = useAuth();

  const HANDLERS = {
    quiz: () => navigate('/quiz-builder'),
    test: () => navigate('/test-builder'),
  };

  return (
    <div style={{ maxWidth: 960, margin: '0 auto', paddingBottom: 40 }}>

      {/* ── Page Header ── */}
      <div style={{ marginBottom: 32 }}>
        <div style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          background: 'var(--kt-manila, #E4D5AC)',
          border: '1px solid var(--kt-manila-border, #C9B583)',
          borderRadius: 4,
          padding: '4px 10px',
          marginBottom: 12,
        }}>
          <Sparkles size={13} color="var(--kt-chalkboard, #1F3A2E)" />
          <span style={{
            fontSize: 11,
            fontWeight: 700,
            color: 'var(--kt-chalkboard, #1F3A2E)',
            fontFamily: 'var(--kt-font-mono, monospace)',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
          }}>
            PAGTATAYA AT PAGSUSULIT · AI ASSESSMENT TOOLS
          </span>
        </div>

        <h1 style={{
          margin: '0 0 8px',
          fontSize: 30,
          fontWeight: 700,
          color: 'var(--kt-text-primary, #262119)',
          fontFamily: 'var(--kt-font-heading, "Bitter", serif)',
          lineHeight: 1.2,
        }}>
          Anong uri ng pagsusulit ang iyong bubuuin?
        </h1>
        <p style={{ margin: 0, fontSize: 15, color: 'var(--kt-text-secondary, #6E6455)', lineHeight: 1.6 }}>
          Pumili sa pagitan ng mabilisang pagsasanay (Quiz na may AI Scanner) o pormal na quarterly exam na may DepEd Table of Specifications (TOS).
        </p>
      </div>

      {/* ── Assessment Dossier Cards Grid (2 Columns) ── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))',
        gap: 24,
        marginBottom: 28,
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
              <div style={{ padding: '22px 22px 20px', flex: 1, display: 'flex', flexDirection: 'column' }}>

                {/* Title */}
                <h2 style={{
                  margin: '0 0 14px',
                  fontSize: 21,
                  fontWeight: 700,
                  color: 'var(--kt-text-primary, #262119)',
                  fontFamily: 'var(--kt-font-heading, "Bitter", serif)',
                }}>
                  {title}
                </h2>

                {/* Feature checklist */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
                  {points.map((pt, idx) => (
                    <div key={idx} style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                      <CheckCircle2 size={14} color="var(--kt-sage, #5F7A54)" style={{ marginTop: 3, flexShrink: 0 }} />
                      <span style={{ fontSize: 13.5, color: 'var(--kt-text-secondary, #6E6455)', lineHeight: 1.5 }}>
                        {pt}
                      </span>
                    </div>
                  ))}
                </div>

                {/* Output Badge */}
                <div style={{ marginTop: 'auto', marginBottom: 18 }}>
                  <div style={{
                    background: 'var(--kt-card-2, #F4EDDB)',
                    border: '1px dashed var(--kt-border, #DCD0AE)',
                    borderRadius: 4,
                    padding: '8px 12px',
                    fontSize: 12,
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
                  paddingTop: 14,
                  borderTop: '1px solid var(--kt-border, #DCD0AE)',
                }}>
                  {!freeMode ? (
                    <span style={{
                      fontSize: 11.5,
                      fontWeight: 600,
                      color: 'var(--kt-text-secondary, #6E6455)',
                      fontFamily: 'var(--kt-font-mono, monospace)',
                    }}>
                      3 tokens per gen
                    </span>
                  ) : (
                    <span style={{
                      fontSize: 11.5,
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
                    padding: '9px 16px',
                    borderRadius: 'var(--kt-radius-sm, 4px)',
                    fontSize: 13,
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

      {/* ── DepEd Assessment Guideline Footer Note ── */}
      <div style={{
        background: 'var(--kt-card-2, #F4EDDB)',
        border: '1px solid var(--kt-border, #DCD0AE)',
        borderRadius: 'var(--kt-radius-md, 6px)',
        padding: '14px 18px',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
      }}>
        <div style={{
          width: 32, height: 32,
          borderRadius: 4,
          background: 'var(--kt-manila, #E4D5AC)',
          border: '1px solid var(--kt-manila-border, #C9B583)',
          display: 'grid',
          placeItems: 'center',
          flexShrink: 0,
        }}>
          <ClipboardCheck size={16} color="var(--kt-chalkboard, #1F3A2E)" />
        </div>
        <p style={{ margin: 0, fontSize: 12.5, color: 'var(--kt-text-secondary, #6E6455)', lineHeight: 1.5 }}>
          <strong>Paalala ng Kagawaran:</strong> Ang Quiz Builder ay mainam para sa <em>formative assessment</em> at daily drills. Para sa <em>quarterly / periodical examinations</em>, gamitin ang Test Builder upang awtomatikong mabuo ang DepEd Table of Specifications (TOS) matrix.
        </p>
      </div>

    </div>
  );
}

