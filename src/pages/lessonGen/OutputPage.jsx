import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../hooks/useAuth';
import { useLessonGenStore } from '../../store/lessonGenStore';
import { useCotStore } from '../../store/cotStore';
import { getTeacherProfile, deductTokens } from '../../services/db';
import { downloadIlawDocx } from '../../services/docxExport';
import { generateOutline, expandSlides, toExportSlides } from '../../services/presentationAI';
import { exportToPptx } from '../../services/pptxExport';
import { ArrowLeft, Download, Pencil, ClipboardList, Loader2, Sparkles, X, Presentation, Printer } from 'lucide-react';

const baseTd = {
  padding: '10px 12px',
  verticalAlign: 'top',
  border: '1px solid #d1d5db',
  fontSize: 13,
  lineHeight: 1.65,
  fontFamily: 'Georgia, "Times New Roman", serif',
};

const labelTd = {
  ...baseTd,
  background: '#f9fafb',
  fontWeight: 700,
  width: 190,
  minWidth: 190,
};

function sub(text) {
  return (
    <div style={{ fontWeight: 400, fontStyle: 'italic', fontSize: 11, color: '#6b7280', marginTop: 3, lineHeight: 1.4 }}>
      {text}
    </div>
  );
}

function Label({ children, note }) {
  return <td style={labelTd}>{children}{note && sub(note)}</td>;
}

function Merged({ n, children, style = {} }) {
  return <td colSpan={n} style={{ ...baseTd, ...style }}>{children}</td>;
}

function PerSession({ sessions, get, amber, minHeight }) {
  return sessions.map((s, i) => (
    <td key={i} style={{
      ...baseTd,
      ...(amber    ? { background: '#fffbeb' } : {}),
      ...(minHeight ? { minHeight }            : {}),
    }}>
      <span style={{ whiteSpace: 'pre-line' }}>{get(s, i)}</span>
    </td>
  ));
}

function SectionBanner({ n, title, desc }) {
  return (
    <tr>
      <td colSpan={n + 1} style={{ ...baseTd, background: '#e5e7eb', padding: '12px 16px' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <tbody>
            <tr>
              <td style={{ width: '22%', fontWeight: 800, fontStyle: 'italic', fontSize: 20, fontFamily: 'Georgia, serif', verticalAlign: 'top', paddingRight: 16 }}>
                {title}
              </td>
              <td style={{ fontStyle: 'italic', fontSize: 12, color: '#4b5563', lineHeight: 1.65, verticalAlign: 'top' }}>
                {desc}
              </td>
            </tr>
          </tbody>
        </table>
      </td>
    </tr>
  );
}

function fmtObjectives(s) {
  return s.objective || '';
}

function fmtPrelesson(s) {
  if (s.prelesson) return s.prelesson;
  return (
    `Review: Briefly revisit prior knowledge that connects to today's ${s.bloomsLevel}-level objective.\n` +
    `Message: Orient learners on what they will accomplish this session.\n\n` +
    `(Generate full plan in Step 3 to fill this section)`
  );
}

function fmtFlow(s) {
  if (s.flow) return s.flow;
  return (
    `1. Meeting Time 1: Introduce the ${s.bloomsLevel}-level objective and activate prior knowledge.\n` +
    `2. Work Period 1: Guided activity aligned with the ${s.bloomsLevel} level.\n` +
    `3. Meeting Time 2: Discuss learner responses; address misconceptions.\n` +
    `4. Work Period 2: Independent / group practice task.\n` +
    `5. Indoor/Outdoor: Wrap-up, key takeaways, transition.\n\n` +
    `(Generate full plan in Step 3 to fill this section)`
  );
}

function fmtResources(s) {
  if (s.resources) return s.resources;
  return 'MATATAG Curriculum Guide\nLearner\'s Module\nPrinted worksheets\n(Generate full plan in Step 3 to fill this section)';
}

function fmtIntegration(s) { return s.integration || 'N/A'; }

function fmtFormative(s) {
  if (s.formativeAssessment) return s.formativeAssessment;
  return (
    `Monitor learner responses during the ${s.bloomsLevel}-level activity.\n` +
    `Exit check: one question aligned with the session objective.\n\n` +
    `(Generate full plan in Step 3 to fill this section)`
  );
}

function fmtExtended(s) {
  if (s.extendedLearning) return s.extendedLearning;
  return (
    `Assign a ${s.bloomsLevel}-level take-home task connected to today's competency.\n\n` +
    `(Generate full plan in Step 3 to fill this section)`
  );
}

function fmtReflection(s) {
  if (s.reflection) return s.reflection;
  return (
    '*(To be filled after the lesson)*\n' +
    'Reflection Prompt: What worked? What confused learners? What will you adjust next time?'
  );
}

function InfoRow({ label, value }) {
  if (!value) return null;
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 3 }}>
        {label}
      </div>
      <div style={{ fontSize: 13, color: '#0d2218', lineHeight: 1.6 }}>{value}</div>
    </div>
  );
}

export default function OutputPage() {
  const navigate      = useNavigate();
  const { addToast }  = useToast();
  const { user }      = useAuth();
  const store         = useLessonGenStore();
  const cotStore      = useCotStore();

  const sessions = store.generatedPlan?.sessions?.length > 0
    ? store.generatedPlan.sessions
    : store.unpackedSessions || [];
  const N = sessions.length;

  const [teacherProfile,   setTeacherProfile]  = useState(null);
  const [docxLoading,      setDocxLoading]     = useState(false);
  const [selectedSession,  setSelectedSession] = useState(null);
  const [pptLoading,       setPptLoading]      = useState(false);
  const [pptPhase,         setPptPhase]        = useState('');

  function handleGoToCOT() {
    if (selectedSession === null) return;
    const s = sessions[selectedSession];
    const sessionMelc = s.competencyText || store.competencyText || '';
    const topic = s.keyContentFocus || store.content || '';
    const rawRes = s.resources;
    const materials = typeof rawRes === 'string' && rawRes.trim()
      ? rawRes
      : "Learner's Module, Printed worksheets, Chalk and board";
    cotStore.reset();
    cotStore.setStep1({
      subject:              store.subject              || '',
      grade:                store.gradeLevel           || '',
      quarter:              store.term                 || '',
      topic,
      melc:                 sessionMelc,
      objectives:           s.objective               || '',
      teacherName:          teacherProfile?.name       || '',
      school:               teacherProfile?.school     || '',
      teachingDate:         s.date                    || '',
      materials,
      contentStandards:     store.contentStandards     || '',
      performanceStandards: '',
    });
    navigate('/cot-gen/step-2');
  }

  async function handleGeneratePresentation() {
    if (selectedSession === null) return;
    const s = sessions[selectedSession];
    const sessionMelc = s.competencyText || store.competencyText || '';
    const topic = s.keyContentFocus || store.content || '';
    const title = store.lessonName || topic || store.subject || 'Lesson';

    setPptLoading(true);
    try {
      setPptPhase('Checking tokens…');
      await deductTokens(user.uid, 'presentation_gen', 3);

      setPptPhase('Generating slide outline…');
      const { outline } = await generateOutline({
        subject:    store.subject    || '',
        gradeLevel: store.gradeLevel || '',
        melcCode:   sessionMelc,
        topic:      topic || title,
        slideCount: 14,
      });

      setPptPhase('Writing content with AI…');
      const { slides: expanded } = await expandSlides({
        subject:    store.subject    || '',
        gradeLevel: store.gradeLevel || '',
        melcCode:   sessionMelc,
        topic:      topic || title,
        slides:     outline,
        style:      'Academic',
      });

      setPptPhase('Building your PPTX…');
      await exportToPptx({
        title,
        subject:      store.subject    || '',
        gradeLevel:   store.gradeLevel || '',
        schoolName:   teacherProfile?.school || '',
        schoolEmail:  teacherProfile?.email  || user?.email || '',
        slides:       toExportSlides(expanded),
        includeNotes: true,
      });

      addToast('Presentation downloaded! (3 tokens used)', 'success');
      setSelectedSession(null);
    } catch (err) {
      addToast(err.message || 'Presentation generation failed.', 'error');
      console.error('PPT error:', err);
    } finally {
      setPptLoading(false);
      setPptPhase('');
    }
  }

  useEffect(() => {
    if (N === 0) navigate('/lesson-gen/step-2', { replace: true });
  }, [N]);

  useEffect(() => {
    if (!user?.uid) return;
    getTeacherProfile(user.uid).then(setTeacherProfile).catch(() => {});
  }, [user?.uid]);

  if (N === 0) return null;

  const teacherName = (
    teacherProfile?.name || user?.displayName || user?.email?.split('@')[0] || 'Teacher'
  ).toUpperCase();

  const gradeSection = `${store.gradeLevel || '—'} – ${teacherProfile?.section || '(Section)'}`;

  const references =
    `MATATAG Curriculum Guide · ${store.subject || ''} ${store.gradeLevel || ''} · ${store.term || ''}`.trim();

  return (
    <>
      <style>{`
        @media print {
          @page { size: A4 landscape; margin: 1.2cm 1.5cm; }
          .no-print { display: none !important; }
          .shell-sidebar { display: none !important; }
          body { background: white !important; margin: 0 !important; padding: 0 !important; }
          .ilaw-page-wrap {
            max-width: none !important;
            margin: 0 !important;
            padding: 0 !important;
          }
          .ilaw-wrap {
            box-shadow: none !important;
            border: none !important;
            border-radius: 0 !important;
            overflow: visible !important;
          }
          .ilaw-table {
            font-size: 9.5px !important;
            min-width: 0 !important;
            width: 100% !important;
          }
          .ilaw-table td { padding: 5px 7px !important; }
          tr { page-break-inside: avoid; }
        }
        .ilaw-session-hdr {
          cursor: pointer;
          transition: background 0.18s, color 0.18s, box-shadow 0.18s;
          user-select: none;
        }
        .ilaw-session-hdr:hover {
          background: #00c974 !important;
          color: #fff !important;
          box-shadow: inset 0 0 0 2px rgba(0,201,116,0.6), 0 0 16px rgba(0,201,116,0.45) !important;
        }
        .ilaw-session-hdr:hover .session-date-sub {
          color: rgba(255,255,255,0.75) !important;
        }
      `}</style>

      {/* Action bar */}
      <div className="no-print" style={{
        position: 'sticky', top: 0, zIndex: 40,
        background: '#fff', borderBottom: '1px solid rgba(45,106,79,0.12)',
        padding: '10px 20px', display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', gap: 10,
        margin: '-24px -24px 0',
      }}>
        <button
          onClick={() => navigate('/my-lessons')}
          style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, fontSize: 13, fontWeight: 600, color: '#1a3d2b' }}
        >
          <ArrowLeft size={14} /> My Lessons
        </button>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            className="btn-primary"
            style={{ fontSize: 12, padding: '7px 14px' }}
            disabled={docxLoading}
            onClick={async () => {
              setDocxLoading(true);
              try {
                await downloadIlawDocx({
                  lessonMeta: {
                    lessonName:         store.lessonName,
                    subject:            store.subject,
                    gradeLevel:         store.gradeLevel,
                    term:               store.term,
                    weekNumber:         store.weekNumber,
                    competencies:       store.competencies,
                    competencyText:     store.competencyText,
                    declarationOfAIUse: store.declarationOfAIUse,
                  },
                  sessions,
                  teacherProfile,
                  user,
                });
              } catch (err) {
                addToast('DOCX export failed. Try again.', 'error');
                console.error('DOCX error:', err);
              } finally {
                setDocxLoading(false);
              }
            }}
          >
            {docxLoading
              ? <><Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> Exporting…</>
              : <><Download size={13} /> Download DOCX</>}
          </button>
          <button className="btn-outline" style={{ fontSize: 12, padding: '7px 14px' }} onClick={() => window.print()}>
            <Printer size={13} /> Print / PDF
          </button>
          <button className="btn-outline" style={{ fontSize: 12, padding: '7px 14px' }} onClick={() => navigate('/lesson-gen/step-3')}>
            <Pencil size={13} /> Edit Plan
          </button>
          <button
            style={{
              background: '#e8a320', color: '#fff', border: 'none', borderRadius: 10,
              padding: '7px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 5, fontFamily: 'inherit',
            }}
            onClick={() => navigate('/quiz-builder')}
          >
            <ClipboardList size={13} /> Create Quiz
          </button>
        </div>
      </div>

      {/* Hint banner */}
      <div className="no-print" style={{
        maxWidth: 1100, margin: '14px auto 0',
        background: 'linear-gradient(90deg, rgba(0,201,116,0.08) 0%, rgba(26,61,43,0.06) 100%)',
        border: '1px solid rgba(0,201,116,0.25)',
        borderRadius: 10, padding: '9px 16px',
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <Sparkles size={14} color="#00c974" style={{ flexShrink: 0 }} />
        <span style={{ fontSize: 12, color: '#1a3d2b', fontWeight: 500 }}>
          Click any <strong>Session</strong> header to generate a <strong>COT 4As Lesson Plan</strong> for that session.
        </span>
      </div>

      {/* Document wrapper */}
      <div className="ilaw-page-wrap" style={{ maxWidth: 1100, margin: '12px auto 0', padding: '0 0 48px' }}>
        <p className="no-print" style={{ fontSize: 12, color: '#4a6357', marginBottom: 8 }}>
          ILAW Lesson Plan · {store.subject} {store.gradeLevel} · {store.term} · {store.weekNumber} · {N} session{N !== 1 ? 's' : ''}
        </p>

        <div className="ilaw-wrap" style={{ background: '#fff', borderRadius: 14, border: '1px solid rgba(45,106,79,0.12)', overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table className="ilaw-table" style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720 }}>
              <tbody>
                <tr>
                  <td colSpan={N + 1} style={{ ...baseTd, background: '#1a3d2b', color: '#fff', textAlign: 'center', fontWeight: 800, fontSize: 13, letterSpacing: '0.08em', padding: '10px 16px' }}>
                    ILAW LESSON PLAN · SY 2026–2027 · DepEd Order No. 16, s. 2026
                  </td>
                </tr>
                <tr><Label>Name of Lesson</Label><Merged n={N}>{store.lessonName || '—'}</Merged></tr>
                <tr><Label>Learning Area/s</Label><Merged n={N}>{store.subject || '—'}</Merged></tr>
                <tr><Label>Designed by Teacher/s</Label><Merged n={N}>{teacherName}</Merged></tr>
                <tr><Label>Designed for which Grade Level and Section</Label><Merged n={N}>{gradeSection}</Merged></tr>

                <tr style={{ background: '#f3f4f6' }}>
                  <td style={{ ...labelTd, background: '#f3f4f6' }}>No. of Sessions</td>
                  {sessions.map((s, i) => (
                    <td
                      key={i}
                      className="ilaw-session-hdr"
                      onClick={() => setSelectedSession(i)}
                      style={{ ...baseTd, textAlign: 'center', fontWeight: 700, background: '#f3f4f6' }}
                    >
                      <div style={{ fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
                        <Sparkles size={12} />
                        Session {s.day}
                      </div>
                      <div className="session-date-sub" style={{ fontSize: 11, fontWeight: 400, color: '#6b7280', marginTop: 2 }}>{s.date}</div>
                    </td>
                  ))}
                </tr>

                <tr><Label note="books, websites, toolkits, etc.">References</Label><Merged n={N}><span style={{ whiteSpace: 'pre-line' }}>{references}</span></Merged></tr>
                <tr><Label note="Cite how AI was used. See DO 16, s. 2026 Annex A.">Declaration of AI use</Label><Merged n={N}><span style={{ whiteSpace: 'pre-line' }}>{store.declarationOfAIUse}</span></Merged></tr>

                <SectionBanner n={N} title="Intentions." desc="Meaningful learning experiences are anchored in how we frame them. These intentions guide what learners will know, feel, and be able to do by the end of each session." />
                <tr>
                  <Label note="Write the competency/ies from the curriculum that we are targeting.">Learning Competency:</Label>
                  <Merged n={N}>
                    <span style={{ whiteSpace: 'pre-line' }}>
                      {store.competencies?.length > 0
                        ? store.competencies.map(c => `• ${c.text}`).join('\n')
                        : `• ${store.competencyText || '—'}`}
                    </span>
                  </Merged>
                </tr>
                <tr>
                  <Label note="Describe the strengths, interests, needs, and barriers to learning of this class/community.">Learner Context:</Label>
                  <Merged n={N}>
                    <span style={{ whiteSpace: 'pre-line', color: store.learningContext ? '#0d2218' : '#9ca3af', fontStyle: store.learningContext ? 'normal' : 'italic' }}>
                      {store.learningContext || '(No specific learner context provided)'}
                    </span>
                  </Merged>
                </tr>
                <tr><Label note="Write the smaller knowledge, skills, or tasks from the competency that learners will achieve in each session.">Learning Objectives:</Label><PerSession sessions={sessions} get={fmtObjectives} /></tr>

                <SectionBanner n={N} title="Learning Experience." desc="Learning experiences must be purposefully designed to develop learners' knowledge, skills, and values. The flow follows the ILAW design framework." />
                <tr><Label note="What the teacher and learners do before the formal lesson begins.">Pre-Lesson:</Label><PerSession sessions={sessions} get={fmtPrelesson} /></tr>
                <tr><Label note="Meeting Time 1 · Work Period 1 · Meeting Time 2 · Work Period 2 · Indoor/Outdoor">Flow:</Label><PerSession sessions={sessions} get={fmtFlow} minHeight={280} /></tr>
                <tr><Label note="Materials, references, manipulatives, technology, and community resources.">Learning Resources:</Label><PerSession sessions={sessions} get={fmtResources} /></tr>
                <tr><Label note="Meaningful anchors to other learning areas, special topics, or technology. Write N/A if none.">Opportunities for Integration:</Label><PerSession sessions={sessions} get={fmtIntegration} /></tr>

                <SectionBanner n={N} title="Assessment." desc="Formative assessment should be ongoing and embedded in the learning experience — not an add-on at the end." />
                <tr><Label note="Specific questions, tasks, or observations to check learning. Include accommodations for diverse learners.">Formative Assessment:</Label><PerSession sessions={sessions} get={fmtFormative} /></tr>

                <SectionBanner n={N} title="Ways Forward." desc="Extend learning beyond the classroom and give learners space to reflect, connect, and grow." />
                <tr><Label note="Meaningful activities learners can do independently beyond class time.">Extended Learning Opportunities:</Label><PerSession sessions={sessions} get={fmtExtended} /></tr>
                <tr><Label note="What worked? What confused learners? What will you adjust? Fill after teaching.">Reflections:</Label><PerSession sessions={sessions} get={fmtReflection} amber /></tr>
                <tr>
                  <Label note="To be filled by the school head, master teacher, or coach after observation.">Coaching Notes:</Label>
                  <Merged n={N} style={{ color: '#9ca3af', fontStyle: 'italic', background: '#fafafa' }}>
                    *(To be filled by observer/coach after the lesson)*
                  </Merged>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

      {/* Session → COT modal */}
      {selectedSession !== null && (() => {
        const s = sessions[selectedSession];
        const sessionMelc = s.competencyText || store.competencyText || '';
        const topic = s.keyContentFocus || store.content || '';
        return (
          <div
            onClick={() => setSelectedSession(null)}
            style={{
              position: 'fixed', inset: 0, zIndex: 200,
              background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(3px)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: 20,
            }}
          >
            <div
              onClick={e => e.stopPropagation()}
              style={{
                background: '#fff', borderRadius: 18,
                boxShadow: '0 24px 80px rgba(0,0,0,0.22)',
                width: '100%', maxWidth: 440, overflow: 'hidden',
              }}
            >
              {/* Modal header */}
              <div style={{
                background: 'linear-gradient(135deg, #1a3d2b 0%, #2d6a4f 100%)',
                padding: '18px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                    <Sparkles size={15} color="#00c974" />
                    <span style={{ fontSize: 11, fontWeight: 700, color: '#00c974', textTransform: 'uppercase', letterSpacing: '1.2px' }}>
                      Session {s.day}
                    </span>
                  </div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: '#fff', marginTop: 4 }}>
                    Generate COT 4As Lesson Plan
                  </div>
                  {s.date && (
                    <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', marginTop: 2 }}>{s.date}</div>
                  )}
                </div>
                <button
                  onClick={() => setSelectedSession(null)}
                  style={{ background: 'rgba(255,255,255,0.12)', border: 'none', borderRadius: 8, width: 32, height: 32, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}
                >
                  <X size={16} />
                </button>
              </div>

              {/* Preview */}
              <div style={{ padding: '18px 20px 10px' }}>
                <p style={{ margin: '0 0 14px', fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '1px' }}>
                  Session Preview
                </p>
                <InfoRow label="Subject / Grade" value={`${store.subject || ''} · ${store.gradeLevel || ''}`} />
                <InfoRow label="Bloom's Level" value={s.bloomsLevel} />
                {topic && <InfoRow label="Content Topic" value={topic} />}
                {sessionMelc && <InfoRow label="MELC / Competency" value={sessionMelc} />}
                {s.objective && <InfoRow label="Learning Objective" value={s.objective} />}
              </div>

              <div style={{ height: 1, background: '#f3f4f6', margin: '0 20px' }} />

              {/* Action buttons */}
              <div style={{ padding: '14px 20px 18px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                <button
                  onClick={handleGoToCOT}
                  style={{
                    width: '100%', background: '#1a3d2b', color: '#fff',
                    border: 'none', borderRadius: 10, padding: '13px 20px',
                    fontSize: 14, fontWeight: 600, cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    fontFamily: 'inherit', transition: 'background 0.15s',
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = '#2d6a4f'}
                  onMouseLeave={e => e.currentTarget.style.background = '#1a3d2b'}
                >
                  <Sparkles size={15} />
                  Continue to COT Indicators →
                </button>

                <button
                  onClick={handleGeneratePresentation}
                  disabled={pptLoading}
                  style={{
                    width: '100%',
                    background: pptLoading ? '#374151' : '#e8a320',
                    color: '#fff',
                    border: 'none', borderRadius: 10, padding: '11px 20px',
                    fontSize: 13, fontWeight: 600,
                    cursor: pptLoading ? 'not-allowed' : 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    fontFamily: 'inherit', transition: 'background 0.15s',
                    opacity: pptLoading ? 0.85 : 1,
                  }}
                >
                  {pptLoading
                    ? <><Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> {pptPhase || 'Generating…'}</>
                    : <><Presentation size={14} /> Generate Presentation <span style={{ fontSize: 10, background: 'rgba(0,0,0,0.18)', borderRadius: 5, padding: '2px 6px', fontWeight: 800 }}>3 tokens</span></>
                  }
                </button>
              </div>
            </div>
          </div>
        );
      })()}

        {/* Signature block */}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 28, padding: '0 4px' }}>
          <div>
            <p style={{ margin: '0 0 22px', fontSize: 13, fontWeight: 600, color: '#4a6357' }}>Prepared by:</p>
            <p style={{ margin: '0 0 2px', fontSize: 14, fontWeight: 700, color: '#0d2218', textDecoration: 'underline', textTransform: 'uppercase', letterSpacing: '0.02em' }}>
              {teacherName}
            </p>
            <p style={{ margin: 0, fontSize: 12, color: '#4a6357' }}>
              {teacherProfile?.designation || teacherProfile?.position || 'Teacher'}
            </p>
            {teacherProfile?.school && (
              <p style={{ margin: '2px 0 0', fontSize: 11, color: '#4a6357', fontStyle: 'italic' }}>
                {teacherProfile.school}
              </p>
            )}
          </div>
          <div style={{ textAlign: 'right' }}>
            <p style={{ margin: '0 0 22px', fontSize: 13, fontWeight: 600, color: '#4a6357' }}>Checked by:</p>
            <p style={{ margin: '0 0 2px', fontSize: 14, fontWeight: 700, color: '#0d2218', textDecoration: 'underline', textTransform: 'uppercase', letterSpacing: '0.02em' }}>
              {teacherProfile?.supervisorName
                ? teacherProfile.supervisorName.toUpperCase()
                : '(School Head / Supervisor)'}
            </p>
            <p style={{ margin: 0, fontSize: 12, color: '#4a6357' }}>
              {teacherProfile?.supervisorPosition || 'Master Teacher'}
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
