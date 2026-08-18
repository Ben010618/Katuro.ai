import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Sparkles, Loader2, Globe, MapPin, School, BookOpen, Link2 } from 'lucide-react';
import { useAuth }          from '../hooks/useAuth';
import { db }               from '../firebase';
import { doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { deductTokens, refundTokens } from '../services/db';
import { generateLiteratureReview, THEME_LABELS } from '../services/actionResearchAI';
import { trackEvent, trackGeneration, startTimer } from '../services/usageTracker';
import ActionResearchShell  from '../components/ActionResearchShell';

const SECTIONS = [
  { key:'globalPerspective',    label:'Global Perspective (Pandaigdigang Konteksto)',    Icon:Globe },
  { key:'nationalPerspective',  label:'National Perspective (Pambansang Konteksto)',  Icon:MapPin },
  { key:'localPerspective',     label:'Local Perspective (Lokal at Pansangay na Konteksto)',     Icon:School },
  { key:'classroomPerspective', label:'Classroom Perspective (Konteksto ng Silid-Aralan)', Icon:BookOpen },
  { key:'synthesis',            label:'Synthesis (Sintesis at Kaugnayan ng Pag-aaral)',             Icon:Link2 },
];

export default function ActionResearchPhase3() {
  const { docId }  = useParams();
  const { user, freeMode } = useAuth();
  const navigate   = useNavigate();

  const [docData,     setDocData]     = useState(null);
  const [pageLoading, setPageLoading] = useState(true);
  const [litReview,   setLitReview]   = useState(null);
  const [generating,  setGenerating]  = useState(false);
  const [saving,      setSaving]      = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error,       setError]       = useState('');
  const [statusMsg,   setStatusMsg]   = useState('');

  useEffect(() => {
    if (!user?.uid || !docId) return;
    getDoc(doc(db, 'teachers', user.uid, 'actionResearch', docId)).then(snap => {
      if (snap.exists()) {
        const d = { id: snap.id, ...snap.data() };
        setDocData(d);
        if (d.literatureReview) setLitReview(d.literatureReview);
      }
      setPageLoading(false);
    });
  }, [user?.uid, docId]);

  async function handleGenerate() {
    if (!user?.uid || !docData || generating) return;
    const initialStatus = 'Maaaring tumagal ito nang 15–30 segundo. Nagsasagawa ng pagsasaliksik sa pandaigdigan, pambansa, at lokal na literatura…';
    setGenerating(true); setError(''); setStatusMsg(initialStatus);
    let elapsedMs;
    let tokensDeducted = false;
    try {
      await deductTokens(user.uid, 'action-research-literature', 5);
      tokensDeducted = true;
      elapsedMs = startTimer();

      let result;
      let lastErr;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          result = await generateLiteratureReview({
            title: docData.selectedTitle, selectedQuestions: docData.selectedQuestions,
            problemText: docData.problemText, beraTheme: docData.beraTheme,
            subjectArea: docData.subjectArea, gradeLevel: docData.gradeLevel,
            schoolName: docData.schoolName, schoolYear: docData.schoolYear,
            isRetry: attempt > 0,
          });
          break;
        } catch (err) {
          lastErr = err;
          console.warn(`generateLiteratureReview attempt ${attempt + 1} failed:`, err);
          if (err.dailyLimit) break;
          if (attempt < 2) {
            const wait = err.status === 429
              ? Math.min((err.retryAfter || 30) * 1000, 30_000)
              : 6000 + attempt * 3000;
            setStatusMsg(`May kaunting pagkaantala sa server — muling susubukan sa ${Math.round(wait / 1000)}s…`);
            await new Promise(r => setTimeout(r, wait));
            setStatusMsg('Muling sinasaliksik ang literature review…');
          }
        }
      }
      if (!result) throw lastErr || new Error('Failed to generate. Please try again.');

      setLitReview(result);
      trackEvent(user.uid, 'action_research_phase3_generated', { subject: docData.subjectArea, grade: docData.gradeLevel });
      trackGeneration(user.uid, 'ar_phase3', { success: true, durationMs: elapsedMs() });
    } catch (err) {
      setError(
        err.status === 429
          ? 'Rate limit reached — wait a moment then try again.'
          : (err.message || 'Failed to generate. Please try again.')
      );
      if (tokensDeducted) {
        refundTokens(user.uid, 'action-research-literature', 5).catch(e => console.error('Token refund failed:', e));
      }
      if (elapsedMs) {
        trackGeneration(user.uid, 'ar_phase3', { success: false, durationMs: elapsedMs(), error: err.message });
      }
    } finally { setGenerating(false); }
  }

  async function handleNext() {
    if (!user?.uid || !litReview) return;
    setSaving(true); setError('');
    try {
      await updateDoc(doc(db, 'teachers', user.uid, 'actionResearch', docId), {
        literatureReview: litReview, phase: 3, updatedAt: serverTimestamp(),
      });
      navigate(`/action-research/phase-4/${docId}`);
    } catch {
      setError('Failed to save. Please try again.');
    } finally { setSaving(false); }
  }

  async function handleDownload() {
    if (!docData) return;
    setDownloading(true);
    try {
      const { downloadResearchDocx } = await import('../services/actionResearchDocx');
      await downloadResearchDocx({ ...docData, literatureReview: litReview }, user.displayName ?? '');
    } finally { setDownloading(false); }
  }

  if (pageLoading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--kt-surface, #FBF7EC)' }}>
      <Loader2 size={24} color="var(--kt-chalkboard, #1F3A2E)" style={{ animation: 'spin 1s linear infinite' }} />
    </div>
  );

  const themeName = THEME_LABELS[docData?.beraTheme] ?? docData?.beraTheme;

  return (
    <ActionResearchShell
      phase={3}
      canNext={!!litReview}
      nextLabel="Susunod: Action Plan"
      onNext={handleNext}
      nextLoading={saving}
      onDownload={litReview ? handleDownload : undefined}
      downloadLoading={downloading}
      onBack={() => navigate(`/action-research/phase-2/${docId}`)}
      themeName={themeName}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* Context */}
        <div style={{
          background: 'var(--kt-card, #FBF7EC)',
          borderRadius: 'var(--kt-radius-md, 6px)',
          border: '1px solid var(--kt-border, #DCD0AE)',
          padding: '20px 24px',
          boxShadow: '0 2px 6px rgba(38, 33, 25, 0.04)',
        }}>
          <p style={{ margin: '0 0 4px', fontSize: 11, fontWeight: 700, color: 'var(--kt-text-secondary, #6E6455)', textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: 'var(--kt-font-mono, monospace)' }}>
            Pamagat ng Pananaliksik (Research Title)
          </p>
          <h2 style={{ margin: '0 0 12px', fontSize: 17, fontWeight: 700, color: 'var(--kt-text-primary, #262119)', fontFamily: 'var(--kt-font-heading, "Bitter", serif)', lineHeight: 1.4 }}>
            {docData?.selectedTitle}
          </h2>
          {docData?.selectedQuestions?.length > 0 && (
            <div style={{
              background: 'var(--kt-card-2, #F4EDDB)',
              border: '1px solid var(--kt-border, #DCD0AE)',
              borderRadius: 'var(--kt-radius-sm, 4px)',
              padding: '12px 14px',
              marginTop: 10,
            }}>
              <p style={{ margin: '0 0 8px', fontSize: 11, fontWeight: 700, color: 'var(--kt-text-secondary, #6E6455)', textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: 'var(--kt-font-mono, monospace)' }}>
                Mga Napiling Katanungan (Selected Research Questions)
              </p>
              {docData.selectedQuestions.map((q, i) => (
                <p key={i} style={{ margin: '0 0 6px', fontSize: 13, color: 'var(--kt-text-primary, #262119)', lineHeight: 1.55 }}>
                  <span style={{ fontWeight: 700, color: 'var(--kt-chalkboard, #1F3A2E)', marginRight: 6, fontFamily: 'var(--kt-font-mono, monospace)' }}>RQ{i + 1}.</span> {q}
                </p>
              ))}
            </div>
          )}
        </div>

        {/* Generate */}
        <div style={{
          background: 'var(--kt-card, #FBF7EC)',
          borderRadius: 'var(--kt-radius-md, 6px)',
          border: '1px solid var(--kt-border, #DCD0AE)',
          padding: '24px',
          boxShadow: '0 2px 6px rgba(38, 33, 25, 0.04)',
        }}>
          <h2 style={{ margin: '0 0 4px', fontSize: 18, fontWeight: 700, color: 'var(--kt-text-primary, #262119)', fontFamily: 'var(--kt-font-heading, "Bitter", serif)' }}>
            Review of Related Literature (RRL)
          </h2>
          <p style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--kt-text-secondary, #6E6455)', lineHeight: 1.5 }}>
            Bumubuo ang AI ng Funnel Format RRL — mula sa pandaigdigang pag-aaral, pambansang konteksto ng DepEd, hanggang sa lokal at silid-aralan.
          </p>

          <button
            onClick={handleGenerate}
            disabled={generating}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              background: generating ? 'var(--kt-border, #DCD0AE)' : 'var(--kt-chalkboard, #1F3A2E)',
              color: '#FBF7EC',
              border: 'none',
              borderRadius: 'var(--kt-radius-sm, 4px)',
              padding: '10px 18px',
              fontSize: 13,
              fontWeight: 700,
              cursor: generating ? 'not-allowed' : 'pointer',
              fontFamily: 'var(--kt-font-ui, "Inter", sans-serif)',
              transition: 'background 0.15s ease',
            }}
            onMouseEnter={e => { if (!generating) e.currentTarget.style.background = 'var(--kt-chalkboard-hover, #2B4E3E)'; }}
            onMouseLeave={e => { if (!generating) e.currentTarget.style.background = 'var(--kt-chalkboard, #1F3A2E)'; }}
          >
            {generating ? (
              <>
                <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> Bumubuo ng Literature Review…
              </>
            ) : (
              <>
                <Sparkles size={14} /> {litReview ? 'Muling Bumuo (Regenerate RRL)' : 'Bumuo ng Literature Review'}{!freeMode && ' (5 tokens)'}
              </>
            )}
          </button>
          {generating && (
            <p style={{ margin: '10px 0 0', fontSize: 12.5, color: 'var(--kt-text-secondary, #6E6455)' }}>
              {statusMsg}
            </p>
          )}
        </div>

        {/* Results */}
        {litReview && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {SECTIONS.map(({ key, label, Icon }) => (
              litReview[key] ? (
                <div
                  key={key}
                  style={{
                    background: 'var(--kt-card, #FBF7EC)',
                    borderRadius: 'var(--kt-radius-md, 6px)',
                    border: '1px solid var(--kt-border, #DCD0AE)',
                    padding: '20px 24px',
                    boxShadow: '0 2px 6px rgba(38, 33, 25, 0.04)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                    <div style={{
                      width: 32,
                      height: 32,
                      borderRadius: 4,
                      background: 'var(--kt-manila, #E4D5AC)',
                      border: '1px solid var(--kt-manila-border, #C9B583)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}>
                      <Icon size={16} color="var(--kt-chalkboard, #1F3A2E)" />
                    </div>
                    <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: 'var(--kt-text-primary, #262119)', fontFamily: 'var(--kt-font-heading, "Bitter", serif)' }}>
                      {label}
                    </p>
                  </div>
                  {litReview[key].split('\n').filter(Boolean).map((para, i) => (
                    <p key={i} style={{ margin: '0 0 12px', fontSize: 13.5, color: 'var(--kt-text-primary, #262119)', lineHeight: 1.75, textAlign: 'justify', textIndent: '2em' }}>
                      {para}
                    </p>
                  ))}
                </div>
              ) : null
            ))}
          </div>
        )}

        {error && (
          <div style={{
            background: 'var(--kt-danger-tint, #FBEAE8)',
            border: '1px solid rgba(162, 59, 46, 0.3)',
            borderRadius: 'var(--kt-radius-sm, 4px)',
            padding: '10px 14px',
            fontSize: 13,
            color: 'var(--kt-danger, #A23B2E)',
            fontWeight: 600,
            fontFamily: 'var(--kt-font-mono, monospace)',
          }}>
            {error}
          </div>
        )}
      </div>
    </ActionResearchShell>
  );
}

