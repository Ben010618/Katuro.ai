import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Sparkles, Loader2, CheckSquare, Square } from 'lucide-react';
import { useAuth }          from '../hooks/useAuth';
import { db }               from '../firebase';
import { doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { deductTokens, refundTokens } from '../services/db';
import { generateResearchQuestions, THEME_LABELS } from '../services/actionResearchAI';
import { trackEvent, trackGeneration, startTimer } from '../services/usageTracker';
import ActionResearchShell  from '../components/ActionResearchShell';

const cardStyle = (active) => ({
  display: 'flex',
  alignItems: 'flex-start',
  gap: 12,
  textAlign: 'left',
  cursor: 'pointer',
  fontFamily: 'inherit',
  background: active ? 'var(--kt-manila, #E4D5AC)' : 'var(--kt-card-2, #F4EDDB)',
  border: active ? '1px solid var(--kt-manila-border, #C9B583)' : '1px solid var(--kt-border, #DCD0AE)',
  borderRadius: 'var(--kt-radius-sm, 4px)',
  padding: '14px 16px',
  transition: 'border-color 0.15s, background 0.15s',
  width: '100%',
  boxShadow: active ? '0 2px 6px rgba(38, 33, 25, 0.08)' : 'none',
});

export default function ActionResearchPhase2() {
  const { docId }  = useParams();
  const { user, freeMode } = useAuth();
  const navigate   = useNavigate();

  const [docData,          setDocData]          = useState(null);
  const [pageLoading,      setPageLoading]      = useState(true);
  const [questions,        setQuestions]        = useState([]);
  const [selectedQs,       setSelectedQs]       = useState([]);
  const [generating,       setGenerating]       = useState(false);
  const [saving,           setSaving]           = useState(false);
  const [downloading,      setDownloading]      = useState(false);
  const [error,            setError]            = useState('');
  const [statusMsg,        setStatusMsg]        = useState('');

  useEffect(() => {
    if (!user?.uid || !docId) return;
    getDoc(doc(db, 'teachers', user.uid, 'actionResearch', docId)).then(snap => {
      if (snap.exists()) {
        const d = { id: snap.id, ...snap.data() };
        setDocData(d);
        if (d.researchQuestions?.length) { setQuestions(d.researchQuestions); setSelectedQs(d.selectedQuestions ?? []); }
      }
      setPageLoading(false);
    });
  }, [user?.uid, docId]);

  async function handleGenerate() {
    if (!user?.uid || !docData || generating) return;
    setGenerating(true); setError(''); setStatusMsg('');
    let elapsedMs;
    let tokensDeducted = false;
    try {
      await deductTokens(user.uid, 'action-research-questions', 5);
      tokensDeducted = true;
      elapsedMs = startTimer();

      let result;
      let lastErr;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          result = await generateResearchQuestions({
            title: docData.selectedTitle, problemText: docData.problemText,
            beraTheme: docData.beraTheme, subjectArea: docData.subjectArea,
            gradeLevel: docData.gradeLevel,
            isRetry: attempt > 0,
          });
          break;
        } catch (err) {
          lastErr = err;
          console.warn(`generateResearchQuestions attempt ${attempt + 1} failed:`, err);
          if (err.dailyLimit) break;
          if (attempt < 2) {
            const wait = err.status === 429
              ? Math.min((err.retryAfter || 30) * 1000, 30_000)
              : 6000 + attempt * 3000;
            setStatusMsg(`May kaunting pagkaantala sa server — muling susubukan sa ${Math.round(wait / 1000)}s…`);
            await new Promise(r => setTimeout(r, wait));
            setStatusMsg('Muling bumubuo ng mga katanungan…');
          }
        }
      }
      if (!result) throw lastErr || new Error('Failed to generate. Please try again.');

      setQuestions(result.questions ?? []);
      setSelectedQs([]);
      trackEvent(user.uid, 'action_research_phase2_generated', { subject: docData.subjectArea, grade: docData.gradeLevel });
      trackGeneration(user.uid, 'ar_phase2', { success: true, durationMs: elapsedMs() });
    } catch (err) {
      setError(
        err.status === 429
          ? 'Rate limit reached — wait a moment then try again.'
          : (err.message || 'Failed to generate. Please try again.')
      );
      if (tokensDeducted) {
        refundTokens(user.uid, 'action-research-questions', 5).catch(e => console.error('Token refund failed:', e));
      }
      if (elapsedMs) {
        trackGeneration(user.uid, 'ar_phase2', { success: false, durationMs: elapsedMs(), error: err.message });
      }
    } finally {
      setGenerating(false); setStatusMsg('');
    }
  }

  function toggleQ(q) {
    setSelectedQs(prev => prev.includes(q) ? prev.filter(x => x !== q) : [...prev, q]);
  }

  async function handleNext() {
    if (!user?.uid || selectedQs.length === 0) return;
    setSaving(true); setError('');
    try {
      await updateDoc(doc(db, 'teachers', user.uid, 'actionResearch', docId), {
        researchQuestions: questions, selectedQuestions: selectedQs,
        phase: 2, updatedAt: serverTimestamp(),
      });
      navigate(`/action-research/phase-3/${docId}`);
    } catch {
      setError('Failed to save. Please try again.');
    } finally { setSaving(false); }
  }

  async function handleDownload() {
    if (!docData) return;
    setDownloading(true);
    try {
      const { downloadResearchDocx } = await import('../services/actionResearchDocx');
      await downloadResearchDocx({ ...docData, selectedQuestions: selectedQs }, user.displayName ?? '');
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
      phase={2}
      canNext={selectedQs.length > 0}
      nextLabel="Susunod: Literature Review"
      onNext={handleNext}
      nextLoading={saving}
      onDownload={questions.length > 0 ? handleDownload : undefined}
      downloadLoading={downloading}
      onBack={() => navigate(`/action-research/phase-1/${docId}`)}
      themeName={themeName}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* Context card */}
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
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {docData?.gradeLevel && (
              <span style={{ fontSize: 11, background: 'var(--kt-card-2, #F4EDDB)', border: '1px solid var(--kt-border, #DCD0AE)', color: 'var(--kt-text-primary, #262119)', borderRadius: 3, padding: '2px 8px', fontWeight: 600, fontFamily: 'var(--kt-font-mono, monospace)' }}>
                {docData.gradeLevel}
              </span>
            )}
            {docData?.subjectArea && (
              <span style={{ fontSize: 11, background: 'var(--kt-card-2, #F4EDDB)', border: '1px solid var(--kt-border, #DCD0AE)', color: 'var(--kt-text-primary, #262119)', borderRadius: 3, padding: '2px 8px', fontWeight: 600, fontFamily: 'var(--kt-font-mono, monospace)' }}>
                {docData.subjectArea}
              </span>
            )}
            {themeName && (
              <span style={{ fontSize: 11, background: 'var(--kt-manila, #E4D5AC)', border: '1px solid var(--kt-manila-border, #C9B583)', color: 'var(--kt-chalkboard, #1F3A2E)', borderRadius: 3, padding: '2px 8px', fontWeight: 700, fontFamily: 'var(--kt-font-mono, monospace)' }}>
                {themeName}
              </span>
            )}
          </div>
        </div>

        {/* Generate section */}
        <div style={{
          background: 'var(--kt-card, #FBF7EC)',
          borderRadius: 'var(--kt-radius-md, 6px)',
          border: '1px solid var(--kt-border, #DCD0AE)',
          padding: '24px',
          boxShadow: '0 2px 6px rgba(38, 33, 25, 0.04)',
        }}>
          <h2 style={{ margin: '0 0 4px', fontSize: 18, fontWeight: 700, color: 'var(--kt-text-primary, #262119)', fontFamily: 'var(--kt-font-heading, "Bitter", serif)' }}>
            Mga Katanungan sa Pananaliksik (Research Questions)
          </h2>
          <p style={{ margin: '0 0 18px', fontSize: 13, color: 'var(--kt-text-secondary, #6E6455)', lineHeight: 1.5 }}>
            Bumuo ng 5 AI-suggested research questions na nakahanay sa iyong pamagat at suliranin. Pumili ng 1 hanggang 5 upang isama sa iyong papel.
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
              marginBottom: questions.length ? 20 : 0,
              transition: 'background 0.15s ease',
            }}
            onMouseEnter={e => { if (!generating) e.currentTarget.style.background = 'var(--kt-chalkboard-hover, #2B4E3E)'; }}
            onMouseLeave={e => { if (!generating) e.currentTarget.style.background = 'var(--kt-chalkboard, #1F3A2E)'; }}
          >
            {generating ? (
              <>
                <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> Bumubuo ng mga katanungan…
              </>
            ) : (
              <>
                <Sparkles size={14} /> {questions.length ? 'Muling Bumuo (Regenerate)' : 'Bumuo ng Research Questions'}{!freeMode && ' (5 tokens)'}
              </>
            )}
          </button>
          {generating && statusMsg && (
            <p style={{ margin: '10px 0 0', fontSize: 12.5, color: 'var(--kt-text-secondary, #6E6455)' }}>
              {statusMsg}
            </p>
          )}

          {questions.length > 0 && (
            <>
              <p style={{ margin: '0 0 10px', fontSize: 11, fontWeight: 700, color: 'var(--kt-text-secondary, #6E6455)', textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: 'var(--kt-font-mono, monospace)' }}>
                Piliin ang mga katanungang isasama ({selectedQs.length} ang napili)
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {questions.map((q, i) => {
                  const active = selectedQs.includes(q);
                  return (
                    <button
                      key={i}
                      onClick={() => toggleQ(q)}
                      style={cardStyle(active)}
                      onMouseEnter={e => {
                        if (!active) {
                          e.currentTarget.style.borderColor = 'var(--kt-manila-border, #C9B583)';
                          e.currentTarget.style.background = '#ebe2cc';
                        }
                      }}
                      onMouseLeave={e => {
                        if (!active) {
                          e.currentTarget.style.borderColor = 'var(--kt-border, #DCD0AE)';
                          e.currentTarget.style.background = 'var(--kt-card-2, #F4EDDB)';
                        }
                      }}
                    >
                      <div style={{ marginTop: 2, flexShrink: 0, color: active ? 'var(--kt-chalkboard, #1F3A2E)' : 'var(--kt-text-secondary, #6E6455)' }}>
                        {active ? <CheckSquare size={17} /> : <Square size={17} />}
                      </div>
                      <p style={{ margin: 0, fontSize: 13.5, color: 'var(--kt-text-primary, #262119)', lineHeight: 1.6, fontWeight: active ? 600 : 400 }}>
                        <span style={{ fontWeight: 700, color: 'var(--kt-chalkboard, #1F3A2E)', marginRight: 6, fontFamily: 'var(--kt-font-mono, monospace)' }}>
                          RQ{i + 1}.
                        </span>
                        {q}
                      </p>
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>

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

