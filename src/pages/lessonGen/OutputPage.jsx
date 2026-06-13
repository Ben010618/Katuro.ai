import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../hooks/useAuth';
import { useLessonGenStore } from '../../store/lessonGenStore';
import { getTeacherProfile } from '../../services/db';
import { downloadIlawDocx } from '../../services/docxExport';
import { ArrowLeft, Download, Pencil, ClipboardList, Loader2 } from 'lucide-react';

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

export default function OutputPage() {
  const navigate      = useNavigate();
  const { addToast }  = useToast();
  const { user }      = useAuth();
  const store         = useLessonGenStore();

  const sessions = store.generatedPlan?.sessions?.length > 0
    ? store.generatedPlan.sessions
    : store.unpackedSessions || [];
  const N = sessions.length;

  const [teacherProfile, setTeacherProfile] = useState(null);
  const [docxLoading,    setDocxLoading]    = useState(false);

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
          .no-print { display: none !important; }
          .shell-sidebar { display: none !important; }
          body { background: white !important; }
          .ilaw-wrap { box-shadow: none !important; border: none !important; border-radius: 0 !important; }
          .ilaw-table { font-size: 11px !important; }
          tr { page-break-inside: avoid; }
          @page { margin: 1.5cm; size: landscape; }
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
          <button className="btn-outline" style={{ fontSize: 12, padding: '7px 14px' }} onClick={() => addToast('PDF export coming soon.', 'info')}>
            <Download size={13} /> Download PDF
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

      {/* Document wrapper */}
      <div style={{ maxWidth: 1100, margin: '20px auto 0', padding: '0 0 48px' }}>
        <p className="no-print" style={{ fontSize: 12, color: '#4a6357', marginBottom: 8 }}>
          ILAW Lesson Plan · {store.subject} {store.gradeLevel} · {store.term} · {store.weekNumber} · {N} session{N !== 1 ? 's' : ''}
        </p>

        <div className="ilaw-wrap" style={{ background: '#fff', borderRadius: 14, border: '1px solid rgba(45,106,79,0.12)', overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table className="ilaw-table" style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720 }}>
              <tbody>
                <tr><Label>Name of Lesson</Label><Merged n={N}>{store.lessonName || '—'}</Merged></tr>
                <tr><Label>Learning Area/s</Label><Merged n={N}>{store.subject || '—'}</Merged></tr>
                <tr><Label>Designed by Teacher/s</Label><Merged n={N}>{teacherName}</Merged></tr>
                <tr><Label>Designed for which Grade Level and Section</Label><Merged n={N}>{gradeSection}</Merged></tr>

                <tr style={{ background: '#f3f4f6' }}>
                  <td style={{ ...labelTd, background: '#f3f4f6' }}>No. of Sessions</td>
                  {sessions.map((s, i) => (
                    <td key={i} style={{ ...baseTd, textAlign: 'center', fontWeight: 700, background: '#f3f4f6' }}>
                      <div style={{ fontSize: 13 }}>Session {s.day}</div>
                      <div style={{ fontSize: 11, fontWeight: 400, color: '#6b7280', marginTop: 2 }}>{s.date}</div>
                    </td>
                  ))}
                </tr>

                <tr><Label note="books, websites, toolkits, etc.">References</Label><Merged n={N}><span style={{ whiteSpace: 'pre-line' }}>{references}</span></Merged></tr>
                <tr><Label note="Cite how AI was used. See DO 3, 2026 Annex A.">Declaration of AI use</Label><Merged n={N}><span style={{ whiteSpace: 'pre-line' }}>{store.declarationOfAIUse}</span></Merged></tr>

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
              </tbody>
            </table>
          </div>
        </div>

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
