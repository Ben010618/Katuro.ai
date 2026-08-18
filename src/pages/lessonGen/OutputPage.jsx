import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../hooks/useAuth';
import { useLessonGenStore } from '../../store/lessonGenStore';
import { useCotStore } from '../../store/cotStore';
import { getTeacherProfile, deductTokens, refundTokens, createSharedPlan, saveIlawPlan } from '../../services/db';
import { trackEvent } from '../../services/usageTracker';
import { retryAsync } from '../../utils/retry';
import { generateOutline, expandSlides, toExportSlides } from '../../services/presentationAI';
import { ArrowLeft, Download, Pencil, ClipboardList, Loader2, Sparkles, X, Presentation, Printer, Gamepad2, FileDown, Share2, CheckCircle2 } from 'lucide-react';
import { genMatching, genJumbled, genTrueFalse, genCrossword, genWordHunt, genFillBlanks } from '../../services/gamificationAI';
import { GAME_TYPES, gShuffle, gScramble, buildWordSearch, buildCrossword, GameWorksheetDisplay } from '../../components/GameWorksheet';
import AIOutputGuard from '../../components/AIOutputGuard';
import ShareModal from '../../components/ShareModal';

// ── Defensive Sanitization Loop for Clean Output ──────────────────────────────
function sanitizeLessonTitle(name, fallbackTopic, subject) {
  if (!name || typeof name !== 'string') return fallbackTopic || subject || 'Lesson Plan';
  const trimmed = name.trim();
  if (/paste the content standards|curriculum guide|optional but improves|e\.g\.|demonstrates understanding of/i.test(trimmed)) {
    return fallbackTopic || subject || 'Lesson Plan';
  }
  return trimmed;
}

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
      <td colSpan={n + 1} style={{ ...baseTd, background: '#f3f4f6', padding: '12px 16px', borderTop: '2px solid #e5e7eb' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <tbody>
            <tr>
              <td style={{ width: '22%', fontWeight: 800, fontStyle: 'italic', fontSize: 18, fontFamily: 'Georgia, serif', verticalAlign: 'top', paddingRight: 16, color: '#1f2937' }}>
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
      <div style={{ fontSize: 10, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 3 }}>
        {label}
      </div>
      <div style={{ fontSize: 13, color: '#111827', lineHeight: 1.5, fontWeight: 500 }}>{value}</div>
    </div>
  );
}

export default function OutputPage() {
  const navigate      = useNavigate();
  const { addToast }  = useToast();
  const { user, freeMode } = useAuth();
  const store         = useLessonGenStore();
  const cotStore      = useCotStore();

  const sessions = store.generatedPlan?.sessions?.length > 0
    ? store.generatedPlan.sessions
    : store.unpackedSessions || [];
  const N = sessions.length;

  const [teacherProfile,   setTeacherProfile]  = useState(null);
  const [docxLoading,      setDocxLoading]     = useState(false);
  const [sharing,          setSharing]          = useState(false);
  const [shareUrl,         setShareUrl]         = useState(null);
  const [selectedSession,  setSelectedSession] = useState(null);
  const [pptLoading,       setPptLoading]      = useState(false);
  const [pptPhase,         setPptPhase]        = useState('');
  const [gameModal,        setGameModal]       = useState(null); // null | 'pick' | 'loading' | 'result'
  const [selGameType,      setSelGameType]     = useState('matching');
  const [gameCount,        setGameCount]       = useState(10);
  const [gameLoading,      setGameLoading]     = useState(false);
  const [gameResult,       setGameResult]      = useState(null);
  const [gameDownloading,  setGameDownloading] = useState(false);
  const [retryingSave,     setRetryingSave]    = useState(false);

  // Sanitized lesson title guard
  const displayLessonTitle = sanitizeLessonTitle(
    store.lessonName,
    sessions[0]?.keyContentFocus || store.content || store.competencyText,
    store.subject
  );

  async function handleRetrySave() {
    if (!user?.uid) return;
    setRetryingSave(true);
    try {
      const docId = await retryAsync(() => saveIlawPlan(user.uid, {
        subject:            store.subject,
        gradeLevel:         store.gradeLevel,
        term:               store.term,
        weekNumber:         store.weekNumber,
        lessonName:         displayLessonTitle,
        competencyText:     store.competencyText,
        content:            store.content            || '',
        contentStandards:   store.contentStandards   || '',
        competencyCeiling:  store.competencyCeiling,
        fullLadder:         store.fullLadder,
        selectedDays:       store.selectedDays,
        declarationOfAIUse: store.declarationOfAIUse,
        sessions,
      }));
      store.setGeneratedPlan({ sessions, planId: docId });
      store.setSaveStatus('saved');
      addToast('Saved to cloud!', 'success');
    } catch (err) {
      console.error('Retry save failed:', err);
      addToast('Still could not save. Check your connection and try again.', 'error');
    } finally {
      setRetryingSave(false);
    }
  }

  function handleGoToCOT(targetIndex = null) {
    const idx = targetIndex !== null ? targetIndex : selectedSession;
    if (idx === null || !sessions[idx]) return;
    const s = sessions[idx];
    const sessionMelc = s.competencyText || store.competencyText || '';
    const topic = s.keyContentFocus || store.content || displayLessonTitle;
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

  async function handleGeneratePresentation(targetSessionIndex = null) {
    const sIdx = targetSessionIndex !== null ? targetSessionIndex : (selectedSession !== null ? selectedSession : 0);
    if (pptLoading || !sessions[sIdx]) return;
    const s = sessions[sIdx];
    const sessionMelc = s.competencyText || store.competencyText || '';
    const topic = s.keyContentFocus || store.content || displayLessonTitle;
    const title = displayLessonTitle;

    setPptLoading(true);
    try {
      setPptPhase('Generating pedagogical slide outline…');
      const { outline } = await generateOutline({
        subject:    store.subject    || '',
        gradeLevel: store.gradeLevel || '',
        melcCode:   sessionMelc,
        topic:      topic || title,
        slideCount: 14,
      });

      setPptPhase('Writing slide content & generating visuals…');
      const { slides: expanded, engine } = await expandSlides({
        subject:    store.subject    || '',
        gradeLevel: store.gradeLevel || '',
        melcCode:   sessionMelc,
        topic:      topic || title,
        slides:     outline,
        style:      'Academic',
        onProgress: (pct) => setPptPhase(`Writing slide content & visuals… (${pct}%)`),
      });

      setPptPhase('Building enhanced PPTX…');
      const { exportToPptx } = await import('../../services/pptxExport');
      await exportToPptx({
        title,
        subject:      store.subject    || '',
        gradeLevel:   store.gradeLevel || '',
        schoolName:   teacherProfile?.school || '',
        schoolEmail:  teacherProfile?.email  || user?.email || '',
        slides:       toExportSlides(expanded),
        includeNotes: true,
      });

      const engineBadge = engine === 'nvidia' ? ' (NVIDIA NIM)' : '';
      addToast(freeMode ? `Presentation downloaded!${engineBadge}` : `Presentation downloaded! (3 tokens used)${engineBadge}`, 'success');
      setSelectedSession(null);
    } catch (err) {
      addToast(err.message || 'Presentation generation failed. Please try again.', 'error');
      console.error('PPT error:', err);
    } finally {
      setPptLoading(false);
      setPptPhase('');
    }
  }

  async function handleGenerateGame() {
    if (selectedSession === null || gameLoading) return;
    const s = sessions[selectedSession];
    const lesson = {
      type: 'ilaw',
      subject: store.subject || '',
      gradeLevel: store.gradeLevel || '',
      lessonName: displayLessonTitle,
      competencyText: s.competencyText || store.competencyText || '',
      topic: s.keyContentFocus || store.content || displayLessonTitle,
      sessions: [s],
    };
    setGameLoading(true);
    setGameModal('loading');
    let tokensDeducted = false;
    try {
      await deductTokens(user.uid, 'game_gen', 0.5);
      tokensDeducted = true;
      let data;
      if (selGameType === 'matching') {
        const pairs = await genMatching(lesson, gameCount);
        data = { type: 'matching', pairs, shuffledDefs: gShuffle(pairs.map(p => ({ definition: p.definition }))) };
      } else if (selGameType === 'jumbled') {
        const raw = await genJumbled(lesson, gameCount);
        data = { type: 'jumbled', items: raw.map(r => ({ ...r, jumbled: gScramble(r.word) })) };
      } else if (selGameType === 'truefalse') {
        data = { type: 'truefalse', items: await genTrueFalse(lesson, gameCount) };
      } else if (selGameType === 'crossword') {
        const pairs = await genCrossword(lesson, gameCount);
        data = { type: 'crossword', pairs, layout: buildCrossword(pairs) };
      } else if (selGameType === 'wordhunt') {
        const words = await genWordHunt(lesson, gameCount);
        data = { type: 'wordhunt', words, wsGrid: buildWordSearch(words) };
      } else if (selGameType === 'fillblanks') {
        const raw = await genFillBlanks(lesson, gameCount);
        data = { type: 'fillblanks', items: raw.map(r => ({ ...r, shuffledChoices: gShuffle(r.choices) })) };
      }
      setGameResult(data);
      setGameModal('result');
      addToast(freeMode ? 'Game generated!' : 'Game generated! (0.5 tokens used)', 'success');
    } catch (err) {
      addToast(err.message || 'Game generation failed.', 'error');
      setGameModal('pick');
      if (tokensDeducted) {
        refundTokens(user.uid, 'game_gen', 0.5).catch(e => console.error('Token refund failed:', e));
      }
    } finally {
      setGameLoading(false);
    }
  }

  function handlePrintGame() {
    const el = document.getElementById('game-worksheet-content');
    if (!el) return;
    const w = window.open('', '_blank');
    w.document.write(`<!DOCTYPE html><html><head><title>Game Worksheet</title><style>body{font-family:Arial,sans-serif;padding:16px;color:#111;font-size:12px;}table{border-collapse:collapse;width:100%;}td,th{border:1px solid #ddd;padding:4px 7px;}h2{margin:5px 0 2px;}ol{padding-left:16px;}@page{size:A4;margin:12.7mm;}@media print{body{margin:0;padding:0;}}</style></head><body>${el.innerHTML}</body></html>`);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 400);
  }

  async function handleDownloadGame() {
    if (!gameResult) return;
    const s = selectedSession !== null ? sessions[selectedSession] : null;
    const lesson = {
      type: 'ilaw',
      subject: store.subject || '',
      gradeLevel: store.gradeLevel || '',
      lessonName: s?.keyContentFocus || displayLessonTitle,
      topic: s?.keyContentFocus || store.content || displayLessonTitle,
    };
    setGameDownloading(true);
    try {
      const { downloadGameDocx } = await import('../../services/gamificationDocx');
      await downloadGameDocx({ gameData: gameResult, lesson, inclKey: true, profile: teacherProfile });
      addToast('Game worksheet downloaded!', 'success');
    } catch (err) {
      addToast('Download failed: ' + err.message, 'error');
    } finally {
      setGameDownloading(false);
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
          @page { size: A4 landscape; margin: 1cm 1.5cm; }
          .shell-sidebar, header, .no-print { display: none !important; }
          html, body { background: white !important; margin: 0 !important; padding: 0 !important; }
          main { padding: 0 !important; overflow: visible !important; }
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
          .ilaw-wrap > div { overflow: visible !important; }
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
          transition: all 0.15s ease;
          user-select: none;
        }
        .ilaw-session-hdr:hover {
          background: #e5f7ed !important;
          color: #065f46 !important;
        }
        .action-btn-clean {
          transition: all 0.15s ease;
        }
        .action-btn-clean:hover {
          transform: translateY(-1px);
        }
      `}</style>

      <AIOutputGuard feature="ilaw" inputContext={{ subject: store.subject, gradeLevel: store.gradeLevel }} />

      {/* ── Professional SaaS Action Toolbar ────────────────────────────── */}
      <div className="no-print" style={{
        position: 'sticky', top: 0, zIndex: 40,
        background: '#ffffff', borderBottom: '1px solid #e5e7eb',
        padding: '10px 24px', display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', gap: 12,
        margin: '-24px -24px 0',
        boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
      }}>
        {/* Left: Navigation */}
        <button
          onClick={() => navigate('/my-lessons')}
          className="action-btn-clean"
          style={{
            background: 'transparent', border: '1px solid transparent',
            cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
            fontSize: 13, fontWeight: 600, color: '#374151',
            padding: '7px 12px', borderRadius: 8,
          }}
          onMouseEnter={e => { e.currentTarget.style.background = '#f3f4f6'; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
        >
          <ArrowLeft size={14} /> My Lessons
        </button>

        {/* Right: Cohesive Action Toolbar */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {/* Primary Action: Download DOCX */}
          <button
            className="action-btn-clean"
            title="Download Word Document formatted to official DepEd standards"
            disabled={docxLoading}
            style={{
              background: '#1b4332', color: '#ffffff',
              border: '1px solid #1b4332', borderRadius: 8,
              padding: '8px 16px', fontSize: 12.5, fontWeight: 600,
              cursor: docxLoading ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', gap: 6,
              boxShadow: '0 1px 2px rgba(0,0,0,0.08)',
            }}
            onMouseEnter={e => { if (!docxLoading) e.currentTarget.style.background = '#2d6a4f'; }}
            onMouseLeave={e => { if (!docxLoading) e.currentTarget.style.background = '#1b4332'; }}
            onClick={async () => {
              setDocxLoading(true);
              try {
                const { downloadIlawDocx } = await import('../../services/docxExport');
                await downloadIlawDocx({
                  lessonMeta: {
                    lessonName:         displayLessonTitle,
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
                trackEvent(user?.uid, 'lesson_exported_docx', { subject: store.subject });
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
              : <><Download size={14} /> Download DOCX</>}
          </button>

          {/* Presentation PPTX Action */}
          <button
            className="action-btn-clean"
            title="Generate structured PowerPoint presentation deck"
            disabled={pptLoading}
            style={{
              background: '#1e3a8a', color: '#ffffff',
              border: '1px solid #1e3a8a', borderRadius: 8,
              padding: '8px 15px', fontSize: 12.5, fontWeight: 600,
              cursor: pptLoading ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', gap: 6,
              boxShadow: '0 1px 2px rgba(0,0,0,0.08)',
            }}
            onMouseEnter={e => { if (!pptLoading) e.currentTarget.style.background = '#1d4ed8'; }}
            onMouseLeave={e => { if (!pptLoading) e.currentTarget.style.background = '#1e3a8a'; }}
            onClick={() => handleGeneratePresentation(0)}
          >
            {pptLoading
              ? <><Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> {pptPhase || 'Building PPT…'}</>
              : <><Presentation size={14} /> Presentation</>}
          </button>

          {/* Quiz Builder Action */}
          <button
            className="action-btn-clean"
            style={{
              background: '#d97706', color: '#ffffff',
              border: '1px solid #d97706', borderRadius: 8,
              padding: '8px 14px', fontSize: 12.5, fontWeight: 600,
              cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
              boxShadow: '0 1px 2px rgba(0,0,0,0.08)',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = '#b45309'; }}
            onMouseLeave={e => { e.currentTarget.style.background = '#d97706'; }}
            onClick={() => navigate('/quiz-builder')}
          >
            <ClipboardList size={14} /> Create Quiz
          </button>

          {/* Neutral Secondary Actions */}
          <button
            className="action-btn-clean"
            style={{
              background: '#ffffff', color: '#374151',
              border: '1px solid #d1d5db', borderRadius: 8,
              padding: '8px 13px', fontSize: 12.5, fontWeight: 500,
              cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5,
            }}
            onMouseEnter={e => { e.currentTarget.style.background = '#f9fafb'; }}
            onMouseLeave={e => { e.currentTarget.style.background = '#ffffff'; }}
            onClick={() => window.print()}
          >
            <Printer size={14} color="#4b5563" /> Print / PDF
          </button>

          <button
            className="action-btn-clean"
            style={{
              background: '#ffffff', color: '#374151',
              border: '1px solid #d1d5db', borderRadius: 8,
              padding: '8px 13px', fontSize: 12.5, fontWeight: 500,
              cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5,
            }}
            onMouseEnter={e => { e.currentTarget.style.background = '#f9fafb'; }}
            onMouseLeave={e => { e.currentTarget.style.background = '#ffffff'; }}
            onClick={() => navigate('/lesson-gen/step-3')}
          >
            <Pencil size={14} color="#4b5563" /> Edit Plan
          </button>

          <button
            className="action-btn-clean"
            disabled={sharing || N === 0}
            style={{
              background: '#ffffff', color: '#374151',
              border: '1px solid #d1d5db', borderRadius: 8,
              padding: '8px 13px', fontSize: 12.5, fontWeight: 500,
              cursor: sharing ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', gap: 5,
              opacity: sharing ? 0.7 : 1,
            }}
            onMouseEnter={e => { if (!sharing) e.currentTarget.style.background = '#f9fafb'; }}
            onMouseLeave={e => { if (!sharing) e.currentTarget.style.background = '#ffffff'; }}
            onClick={async () => {
              if (shareUrl) { return; }
              setSharing(true);
              try {
                const firstSession = sessions[0];
                const preview = { session_1_topic: firstSession?.keyContentFocus || store.content || displayLessonTitle };
                const { shareId } = await createSharedPlan({
                  planType: 'ilaw',
                  ownerName: teacherProfile?.displayName || teacherProfile?.name || user?.displayName || '',
                  school: teacherProfile?.school || '',
                  subject: store.subject,
                  gradeLevel: store.gradeLevel,
                  term: store.term,
                  melc: store.competencyText,
                  preview,
                });
                const url = `${window.location.origin}/shared/${shareId}?ref=${user?.uid || ''}`;
                trackEvent(user?.uid, 'lesson_shared', { subject: store.subject });
                setShareUrl(url);
              } catch {
                addToast('Could not create share link. Try again.', 'error');
              } finally {
                setSharing(false);
              }
            }}
          >
            {sharing ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Share2 size={14} color="#4b5563" />}
            {sharing ? 'Creating…' : 'Share'}
          </button>
        </div>
      </div>

      {/* Cloud Save Recovery Alert */}
      {store.saveStatus === 'failed' && (
        <div className="no-print" style={{
          maxWidth: 1100, margin: '14px auto 0',
          background: '#fffbeb', border: '1px solid #fde68a',
          borderRadius: 8, padding: '10px 16px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap',
        }}>
          <span style={{ fontSize: 13, color: '#92400e', fontWeight: 500 }}>
            ⚠ Notice: This plan is stored locally on this device. Retry cloud sync to save permanently to My Lessons.
          </span>
          <button
            onClick={handleRetrySave}
            disabled={retryingSave}
            style={{
              background: '#d97706', color: '#fff', border: 'none', borderRadius: 6,
              padding: '6px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0,
            }}
          >
            {retryingSave
              ? <><Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> Syncing…</>
              : 'Sync to Cloud'}
          </button>
        </div>
      )}

      {/* Clean Document Wrapper */}
      <div className="ilaw-page-wrap" style={{ maxWidth: 1100, margin: '16px auto 0', padding: '0 0 48px' }}>
        <div className="no-print" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <p style={{ fontSize: 12.5, color: '#4b5563', margin: 0, fontWeight: 500 }}>
            {store.subject} {store.gradeLevel} · {store.term} · {store.weekNumber} · {N} session{N !== 1 ? 's' : ''}
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#059669', fontWeight: 600 }}>
            <CheckCircle2 size={14} /> Ready for Submission & Review
          </div>
        </div>

        <div className="ilaw-wrap" style={{ background: '#fff', borderRadius: 8, border: '1px solid #e5e7eb', boxShadow: '0 1px 3px rgba(0,0,0,0.04)', overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table className="ilaw-table" style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720 }}>
              <tbody>
                <tr>
                  <td colSpan={N + 1} style={{ ...baseTd, background: '#1b4332', color: '#ffffff', textAlign: 'center', fontWeight: 700, fontSize: 13, letterSpacing: '0.04em', padding: '12px 16px' }}>
                    ILAW LESSON PLAN · SY 2026–2027 · DepEd Order No. 16, s. 2026
                  </td>
                </tr>
                <tr><Label>Name of Lesson</Label><Merged n={N} style={{ fontWeight: 600, color: '#111827' }}>{displayLessonTitle}</Merged></tr>
                <tr><Label>Learning Area/s</Label><Merged n={N}>{store.subject || '—'}</Merged></tr>
                <tr><Label>Designed by Teacher/s</Label><Merged n={N}>{teacherName}</Merged></tr>
                <tr><Label>Designed for which Grade Level and Section</Label><Merged n={N}>{gradeSection}</Merged></tr>

                <tr style={{ background: '#f9fafb' }}>
                  <td style={{ ...labelTd, background: '#f9fafb' }}>No. of Sessions</td>
                  {sessions.map((s, i) => (
                    <td
                      key={i}
                      className="ilaw-session-hdr"
                      onClick={() => setSelectedSession(i)}
                      title="Click to view session details or generate COT 4As / PPT"
                      style={{ ...baseTd, textAlign: 'center', fontWeight: 700, background: '#f9fafb' }}
                    >
                      <div style={{ fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, color: '#1b4332' }}>
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

      {/* Clean Session Details & Pedagogy Modal */}
      {selectedSession !== null && (() => {
        const s = sessions[selectedSession];
        const sessionMelc = s.competencyText || store.competencyText || '';
        const topic = s.keyContentFocus || store.content || displayLessonTitle;
        return (
          <div
            onClick={() => setSelectedSession(null)}
            style={{
              position: 'fixed', inset: 0, zIndex: 200,
              background: 'rgba(15, 23, 42, 0.5)', backdropFilter: 'blur(3px)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: '24px',
            }}
          >
            <div
              onClick={e => e.stopPropagation()}
              style={{
                background: '#ffffff', borderRadius: 12,
                boxShadow: '0 20px 40px rgba(0,0,0,0.18)',
                width: '100%', maxWidth: 500, overflow: 'hidden',
                maxHeight: 'calc(100vh - 64px)', overflowY: 'auto',
                border: '1px solid #e5e7eb',
              }}
            >
              {/* Clean Modal Header */}
              <div style={{
                background: '#1b4332',
                padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              }}>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#a7f3d0', textTransform: 'uppercase', letterSpacing: '0.8px' }}>
                    Session {s.day} · {s.date || 'Scheduled'}
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: '#ffffff', marginTop: 2 }}>
                    Session Actions & Content
                  </div>
                </div>
                <button
                  onClick={() => setSelectedSession(null)}
                  style={{ background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: 6, width: 28, height: 28, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}
                >
                  <X size={15} />
                </button>
              </div>

              {/* Preview Info */}
              <div style={{ padding: '16px 20px 12px' }}>
                <InfoRow label="Subject & Grade" value={`${store.subject || ''} · ${store.gradeLevel || ''}`} />
                <InfoRow label="Bloom's Taxonomy Level" value={s.bloomsLevel} />
                {topic && <InfoRow label="Specific Topic" value={topic} />}
                {sessionMelc && <InfoRow label="MELC Competency" value={sessionMelc} />}
                {s.objective && <InfoRow label="Session Objective" value={s.objective} />}
              </div>

              <div style={{ height: 1, background: '#f3f4f6', margin: '0 20px' }} />

              {/* Action Buttons */}
              <div style={{ padding: '14px 20px 18px', display: 'flex', flexDirection: 'column', gap: 9 }}>
                <button
                  onClick={() => handleGoToCOT(selectedSession)}
                  style={{
                    width: '100%', background: '#1b4332', color: '#fff',
                    border: 'none', borderRadius: 8, padding: '11px 16px',
                    fontSize: 13.5, fontWeight: 600, cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
                    fontFamily: 'inherit', transition: 'background 0.15s',
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = '#2d6a4f'}
                  onMouseLeave={e => e.currentTarget.style.background = '#1b4332'}
                >
                  <Sparkles size={14} /> Continue to COT 4As Lesson Plan →
                </button>

                <button
                  onClick={() => handleGeneratePresentation(selectedSession)}
                  disabled={pptLoading}
                  style={{
                    width: '100%',
                    background: pptLoading ? '#6b7280' : '#1e3a8a',
                    color: '#fff',
                    border: 'none', borderRadius: 8, padding: '11px 16px',
                    fontSize: 13, fontWeight: 600,
                    cursor: pptLoading ? 'not-allowed' : 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
                    fontFamily: 'inherit', transition: 'background 0.15s',
                  }}
                  onMouseEnter={e => { if (!pptLoading) e.currentTarget.style.background = '#1d4ed8'; }}
                  onMouseLeave={e => { if (!pptLoading) e.currentTarget.style.background = '#1e3a8a'; }}
                >
                  {pptLoading
                    ? <><Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> {pptPhase || 'Building PPT…'}</>
                    : <><Presentation size={14} /> Generate Presentation {!freeMode && <span style={{ fontSize: 10, background: 'rgba(255,255,255,0.2)', borderRadius: 4, padding: '2px 5px', fontWeight: 700 }}>3 tokens</span>}</>
                  }
                </button>

                <button
                  onClick={() => { setSelGameType('matching'); setGameCount(10); setGameModal('pick'); }}
                  style={{
                    width: '100%',
                    background: '#f3f4f6',
                    color: '#1f2937',
                    border: '1px solid #e5e7eb', borderRadius: 8, padding: '10px 16px',
                    fontSize: 13, fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
                    fontFamily: 'inherit', transition: 'background 0.15s',
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = '#e5e7eb'}
                  onMouseLeave={e => e.currentTarget.style.background = '#f3f4f6'}
                >
                  <Gamepad2 size={14} /> Generate Games / Worksheets {!freeMode && <span style={{ fontSize: 10, color: '#6b7280', fontWeight: 600 }}>(0.5 token)</span>}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Game Modal */}
      {gameModal && (
        <div
          onClick={() => { if (gameModal !== 'loading') setGameModal(null); }}
          style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(15, 23, 42, 0.5)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{ background: '#fff', borderRadius: 12, boxShadow: '0 20px 40px rgba(0,0,0,0.2)', width: '100%', maxWidth: gameModal === 'result' ? 720 : 480, maxHeight: '90vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', border: '1px solid #e5e7eb' }}
          >
            {/* Header */}
            <div style={{ background: '#1e3a8a', padding: '14px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                <Gamepad2 size={15} color="#93c5fd" />
                <span style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>
                  {gameModal === 'pick' ? 'Select Worksheet Game Type' : gameModal === 'loading' ? 'Generating Game Worksheet…' : 'Classroom Game Worksheet'}
                </span>
              </div>
              {gameModal !== 'loading' && (
                <button
                  onClick={() => setGameModal(null)}
                  style={{ background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: 6, width: 28, height: 28, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}
                >
                  <X size={15} />
                </button>
              )}
            </div>

            {/* Pick step */}
            {gameModal === 'pick' && (
              <div style={{ padding: 20, overflowY: 'auto', flex: 1 }}>
                <p style={{ margin: '0 0 14px', fontSize: 12.5, color: '#4b5563' }}>Select a classroom activity format and question count.{!freeMode && ' (0.5 token)'}</p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16 }}>
                  {GAME_TYPES.map(gt => (
                    <button
                      key={gt.id}
                      onClick={() => { setSelGameType(gt.id); setGameCount(gt.defaultCount); }}
                      style={{
                        background: selGameType === gt.id ? '#eff6ff' : '#f9fafb',
                        border: `1.5px solid ${selGameType === gt.id ? '#2563eb' : '#e5e7eb'}`,
                        borderRadius: 8, padding: '10px 12px', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit', transition: 'all 0.12s',
                      }}
                    >
                      <div style={{ fontSize: 13, fontWeight: 700, color: selGameType === gt.id ? '#1d4ed8' : '#1f2937' }}>{gt.label}</div>
                      <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>{gt.desc}</div>
                    </button>
                  ))}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                  <label style={{ fontSize: 12.5, fontWeight: 600, color: '#374151', whiteSpace: 'nowrap' }}>Item Count:</label>
                  <input
                    type="number" min={5} max={30} value={gameCount}
                    onChange={e => setGameCount(e.target.value === '' ? '' : Number(e.target.value))}
                    onBlur={e => setGameCount(Math.max(5, Math.min(30, Number(e.target.value) || 5)))}
                    style={{ width: 68, border: '1px solid #d1d5db', borderRadius: 6, padding: '6px 10px', fontSize: 13, fontFamily: 'inherit', textAlign: 'center', outline: 'none' }}
                  />
                </div>
                <button
                  onClick={handleGenerateGame}
                  disabled={gameLoading}
                  style={{ width: '100%', background: '#1e3a8a', color: '#fff', border: 'none', borderRadius: 8, padding: '11px 20px', fontSize: 13.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7 }}
                >
                  <Gamepad2 size={14} /> Generate Worksheet {!freeMode && <span style={{ fontSize: 10, background: 'rgba(255,255,255,0.2)', borderRadius: 4, padding: '2px 5px', fontWeight: 700 }}>0.5 token</span>}
                </button>
              </div>
            )}

            {/* Loading step */}
            {gameModal === 'loading' && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '48px 20px', gap: 12 }}>
                <Loader2 size={32} color="#1e3a8a" style={{ animation: 'spin 1s linear infinite' }} />
                <p style={{ margin: 0, fontSize: 13.5, fontWeight: 600, color: '#1e3a8a' }}>Formatting classroom game worksheet…</p>
                <p style={{ margin: 0, fontSize: 12, color: '#6b7280' }}>Please wait a moment</p>
              </div>
            )}

            {/* Result step */}
            {gameModal === 'result' && gameResult && (
              <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
                <div style={{ padding: '10px 18px', display: 'flex', gap: 8, borderBottom: '1px solid #e5e7eb', flexShrink: 0, background: '#f9fafb' }}>
                  <button
                    onClick={() => setGameModal('pick')}
                    style={{ background: '#ffffff', border: '1px solid #d1d5db', borderRadius: 6, padding: '6px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', color: '#374151' }}
                  >
                    ← New Game
                  </button>
                  <button
                    onClick={handlePrintGame}
                    style={{ background: '#ffffff', border: '1px solid #d1d5db', borderRadius: 6, padding: '6px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 5, color: '#1f2937' }}
                  >
                    <Printer size={13} /> Print / PDF
                  </button>
                  <button
                    onClick={handleDownloadGame}
                    disabled={gameDownloading}
                    style={{ background: '#1b4332', color: '#fff', border: 'none', borderRadius: 6, padding: '6px 12px', fontSize: 12, fontWeight: 600, cursor: gameDownloading ? 'not-allowed' : 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 5 }}
                  >
                    <FileDown size={13} /> {gameDownloading ? 'Downloading…' : 'Download DOCX'}
                  </button>
                </div>
                <div id="game-worksheet-content" style={{ overflowY: 'auto', flex: 1, padding: '16px 20px' }}>
                  <GameWorksheetDisplay
                    data={gameResult}
                    lesson={{ subject: store.subject || '', gradeLevel: store.gradeLevel || '', lessonName: displayLessonTitle }}
                    session={selectedSession !== null ? sessions[selectedSession] : null}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Signature block */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 28, padding: '0 4px' }}>
        <div>
          <p style={{ margin: '0 0 22px', fontSize: 13, fontWeight: 600, color: '#4b5563' }}>Prepared by:</p>
          <p style={{ margin: '0 0 2px', fontSize: 14, fontWeight: 700, color: '#111827', textDecoration: 'underline', textTransform: 'uppercase', letterSpacing: '0.02em' }}>
            {teacherName}
          </p>
          <p style={{ margin: 0, fontSize: 12, color: '#4b5563' }}>
            {teacherProfile?.designation || teacherProfile?.position || 'Teacher'}
          </p>
          {teacherProfile?.school && (
            <p style={{ margin: '2px 0 0', fontSize: 11, color: '#6b7280', fontStyle: 'italic' }}>
              {teacherProfile.school}
            </p>
          )}
        </div>
        <div style={{ textAlign: 'right' }}>
          <p style={{ margin: '0 0 22px', fontSize: 13, fontWeight: 600, color: '#4b5563' }}>Checked by:</p>
          <p style={{ margin: '0 0 2px', fontSize: 14, fontWeight: 700, color: '#111827', textDecoration: 'underline', textTransform: 'uppercase', letterSpacing: '0.02em' }}>
            {teacherProfile?.supervisorName
              ? teacherProfile.supervisorName.toUpperCase()
              : '(School Head / Supervisor)'}
          </p>
          <p style={{ margin: 0, fontSize: 12, color: '#4b5563' }}>
            {teacherProfile?.supervisorPosition || 'Master Teacher'}
          </p>
        </div>
      </div>
    </div>

      {shareUrl && (
        <ShareModal
          url={shareUrl}
          title={displayLessonTitle}
          subject={store.subject ? `kaTuro AI — ${store.subject} Lesson Plan` : 'kaTuro AI Lesson Plan'}
          onClose={() => setShareUrl(null)}
        />
      )}
    </>
  );
}
