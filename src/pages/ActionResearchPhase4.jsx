import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Sparkles, Loader2, Target, Calendar, Package, CheckCircle2, ShieldCheck } from 'lucide-react';
import { useAuth }          from '../hooks/useAuth';
import { db }               from '../firebase';
import { doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { deductTokens, refundTokens } from '../services/db';
import { generateActionPlan, THEME_LABELS } from '../services/actionResearchAI';
import { trackEvent, trackGeneration, startTimer } from '../services/usageTracker';
import ActionResearchShell  from '../components/ActionResearchShell';

const sectionHead = {
  margin: '0 0 14px',
  fontSize: 15,
  fontWeight: 700,
  color: 'var(--kt-text-primary, #262119)',
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  fontFamily: 'var(--kt-font-heading, "Bitter", serif)',
};

const iconBox = {
  width: 28,
  height: 28,
  borderRadius: 4,
  background: 'var(--kt-manila, #E4D5AC)',
  border: '1px solid var(--kt-manila-border, #C9B583)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
};

export default function ActionResearchPhase4() {
  const { docId }  = useParams();
  const { user, freeMode } = useAuth();
  const navigate   = useNavigate();

  const [docData,     setDocData]     = useState(null);
  const [pageLoading, setPageLoading] = useState(true);
  const [actionPlan,  setActionPlan]  = useState(null);
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
        if (d.actionPlan) setActionPlan(d.actionPlan);
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
      await deductTokens(user.uid, 'action-research-plan', 5);
      tokensDeducted = true;
      elapsedMs = startTimer();

      let result;
      let lastErr;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          result = await generateActionPlan({
            title: docData.selectedTitle, selectedQuestions: docData.selectedQuestions,
            problemText: docData.problemText, beraTheme: docData.beraTheme,
            subjectArea: docData.subjectArea, gradeLevel: docData.gradeLevel,
            schoolName: docData.schoolName, schoolYear: docData.schoolYear,
            isRetry: attempt > 0,
          });
          break;
        } catch (err) {
          lastErr = err;
          console.warn(`generateActionPlan attempt ${attempt + 1} failed:`, err);
          if (err.dailyLimit) break;
          if (attempt < 2) {
            const wait = err.status === 429
              ? Math.min((err.retryAfter || 30) * 1000, 30_000)
              : 6000 + attempt * 3000;
            setStatusMsg(`May kaunting pagkaantala sa server — muling susubukan sa ${Math.round(wait / 1000)}s…`);
            await new Promise(r => setTimeout(r, wait));
            setStatusMsg('Muling binubuo ang Action Plan…');
          }
        }
      }
      if (!result) throw lastErr || new Error('Failed to generate. Please try again.');

      setActionPlan(result);
      trackEvent(user.uid, 'action_research_phase4_generated', { subject: docData.subjectArea, grade: docData.gradeLevel });
      trackGeneration(user.uid, 'ar_phase4', { success: true, durationMs: elapsedMs() });
    } catch (err) {
      setError(
        err.status === 429
          ? 'Rate limit reached — wait a moment then try again.'
          : (err.message || 'Failed to generate. Please try again.')
      );
      if (tokensDeducted) {
        refundTokens(user.uid, 'action-research-plan', 5).catch(e => console.error('Token refund failed:', e));
      }
      if (elapsedMs) {
        trackGeneration(user.uid, 'ar_phase4', { success: false, durationMs: elapsedMs(), error: err.message });
      }
    } finally { setGenerating(false); }
  }

  async function handleNext() {
    if (!user?.uid || !actionPlan) return;
    setSaving(true); setError('');
    try {
      await updateDoc(doc(db, 'teachers', user.uid, 'actionResearch', docId), {
        actionPlan, phase: 4, updatedAt: serverTimestamp(),
      });
      navigate(`/action-research/phase-5/${docId}`);
    } catch {
      setError('Failed to save. Please try again.');
    } finally { setSaving(false); }
  }

  async function handleDownload() {
    if (!docData) return;
    setDownloading(true);
    try {
      const { downloadResearchDocx } = await import('../services/actionResearchDocx');
      await downloadResearchDocx({ ...docData, actionPlan }, user.displayName ?? '');
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
      phase={4}
      canNext={!!actionPlan}
      nextLabel="Susunod: Data Collection"
      onNext={handleNext}
      nextLoading={saving}
      onDownload={actionPlan ? handleDownload : undefined}
      downloadLoading={downloading}
      onBack={() => navigate(`/action-research/phase-3/${docId}`)}
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
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--kt-text-primary, #262119)', fontFamily: 'var(--kt-font-heading, "Bitter", serif)', lineHeight: 1.4 }}>
            {docData?.selectedTitle}
          </h2>
        </div>

        {/* Generate button */}
        <div style={{
          background: 'var(--kt-card, #FBF7EC)',
          borderRadius: 'var(--kt-radius-md, 6px)',
          border: '1px solid var(--kt-border, #DCD0AE)',
          padding: '24px',
          boxShadow: '0 2px 6px rgba(38, 33, 25, 0.04)',
        }}>
          <h2 style={{ margin: '0 0 4px', fontSize: 18, fontWeight: 700, color: 'var(--kt-text-primary, #262119)', fontFamily: 'var(--kt-font-heading, "Bitter", serif)' }}>
            Plano ng Aksyon at Interbensyon (Action Plan)
          </h2>
          <p style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--kt-text-secondary, #6E6455)', lineHeight: 1.5 }}>
            Bumubuo ang AI ng SMART objectives, deskripsyon ng interbensyon, timeline/Gantt, resources needed, at ethical considerations alinsunod sa DepEd BERF standards.
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
                <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> Bumubuo ng Action Plan…
              </>
            ) : (
              <>
                <Sparkles size={14} /> {actionPlan ? 'Muling Bumuo (Regenerate Action Plan)' : 'Bumuo ng Action Plan'}{!freeMode && ' (5 tokens)'}
              </>
            )}
          </button>
          {generating && statusMsg && (
            <p style={{ margin: '10px 0 0', fontSize: 12.5, color: 'var(--kt-text-secondary, #6E6455)' }}>
              {statusMsg}
            </p>
          )}
        </div>

        {/* Results */}
        {actionPlan && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

            {/* Objectives */}
            <div style={{
              background: 'var(--kt-card, #FBF7EC)',
              borderRadius: 'var(--kt-radius-md, 6px)',
              border: '1px solid var(--kt-border, #DCD0AE)',
              padding: '20px 24px',
              boxShadow: '0 2px 6px rgba(38, 33, 25, 0.04)',
            }}>
              <p style={sectionHead}><span style={iconBox}><Target size={14} color="var(--kt-chalkboard, #1F3A2E)" /></span>SMART Objectives</p>
              {(actionPlan.objectives ?? []).map((o, i) => (
                <div key={i} style={{ display: 'flex', gap: 10, marginBottom: 8 }}>
                  <span style={{ background: 'var(--kt-chalkboard, #1F3A2E)', color: '#FBF7EC', width: 22, height: 22, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10.5, fontWeight: 700, flexShrink: 0, marginTop: 2, fontFamily: 'var(--kt-font-mono, monospace)' }}>
                    {i + 1}
                  </span>
                  <p style={{ margin: 0, fontSize: 13.5, color: 'var(--kt-text-primary, #262119)', lineHeight: 1.6 }}>{o}</p>
                </div>
              ))}
            </div>

            {/* Intervention */}
            <div style={{
              background: 'var(--kt-card, #FBF7EC)',
              borderRadius: 'var(--kt-radius-md, 6px)',
              border: '1px solid var(--kt-border, #DCD0AE)',
              padding: '20px 24px',
              boxShadow: '0 2px 6px rgba(38, 33, 25, 0.04)',
            }}>
              <p style={sectionHead}><span style={iconBox}><Sparkles size={14} color="var(--kt-chalkboard, #1F3A2E)" /></span>Deskripsyon ng Interbensyon (Intervention Details)</p>
              <p style={{ margin: 0, fontSize: 13.5, color: 'var(--kt-text-primary, #262119)', lineHeight: 1.75, textAlign: 'justify' }}>{actionPlan.interventionDescription}</p>
            </div>

            {/* Timeline */}
            <div style={{
              background: 'var(--kt-card, #FBF7EC)',
              borderRadius: 'var(--kt-radius-md, 6px)',
              border: '1px solid var(--kt-border, #DCD0AE)',
              padding: '20px 24px',
              boxShadow: '0 2px 6px rgba(38, 33, 25, 0.04)',
            }}>
              <p style={sectionHead}><span style={iconBox}><Calendar size={14} color="var(--kt-chalkboard, #1F3A2E)" /></span>Gantt Chart & Timeline ng Implementasyon</p>
              <div style={{ overflowX: 'auto', border: '1px solid var(--kt-border, #DCD0AE)', borderRadius: 'var(--kt-radius-sm, 4px)' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                  <thead>
                    <tr style={{ background: 'var(--kt-manila, #E4D5AC)', borderBottom: '1px solid var(--kt-manila-border, #C9B583)' }}>
                      {['Yugto (Phase)', 'Tagal (Duration)', 'Mga Gawain (Activities)', 'Mga Output'].map(h => (
                        <th key={h} style={{ padding: '9px 12px', textAlign: 'left', fontWeight: 700, color: 'var(--kt-chalkboard, #1F3A2E)', fontSize: 11, fontFamily: 'var(--kt-font-mono, monospace)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(actionPlan.timeline ?? []).map((row, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid var(--kt-border, #DCD0AE)', background: i % 2 === 0 ? 'var(--kt-card, #FBF7EC)' : 'var(--kt-card-2, #F4EDDB)' }}>
                        <td style={{ padding: '9px 12px', fontWeight: 700, color: 'var(--kt-chalkboard, #1F3A2E)', verticalAlign: 'top', whiteSpace: 'nowrap' }}>{row.phase}</td>
                        <td style={{ padding: '9px 12px', color: 'var(--kt-text-secondary, #6E6455)', verticalAlign: 'top', whiteSpace: 'nowrap', fontFamily: 'var(--kt-font-mono, monospace)' }}>{row.duration}</td>
                        <td style={{ padding: '9px 12px', color: 'var(--kt-text-primary, #262119)', verticalAlign: 'top' }}>{(row.activities ?? []).join(' • ')}</td>
                        <td style={{ padding: '9px 12px', color: 'var(--kt-text-secondary, #6E6455)', verticalAlign: 'top' }}>{row.outputs}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Resources */}
            <div style={{
              background: 'var(--kt-card, #FBF7EC)',
              borderRadius: 'var(--kt-radius-md, 6px)',
              border: '1px solid var(--kt-border, #DCD0AE)',
              padding: '20px 24px',
              boxShadow: '0 2px 6px rgba(38, 33, 25, 0.04)',
            }}>
              <p style={sectionHead}><span style={iconBox}><Package size={14} color="var(--kt-chalkboard, #1F3A2E)" /></span>Mga Kinakailangang Kagamitan at Materyales (Resources Needed)</p>
              {(actionPlan.resources ?? []).map((r, i) => (
                <p key={i} style={{ margin: '0 0 6px', fontSize: 13.5, color: 'var(--kt-text-primary, #262119)', lineHeight: 1.55 }}>• {r}</p>
              ))}
            </div>

            {/* Success Indicators */}
            <div style={{
              background: 'var(--kt-card, #FBF7EC)',
              borderRadius: 'var(--kt-radius-md, 6px)',
              border: '1px solid var(--kt-border, #DCD0AE)',
              padding: '20px 24px',
              boxShadow: '0 2px 6px rgba(38, 33, 25, 0.04)',
            }}>
              <p style={sectionHead}><span style={iconBox}><CheckCircle2 size={14} color="var(--kt-chalkboard, #1F3A2E)" /></span>Mga Pamantayan sa Tagumpay (Success Indicators)</p>
              {(actionPlan.successIndicators ?? []).map((s, i) => (
                <p key={i} style={{ margin: '0 0 6px', fontSize: 13.5, color: 'var(--kt-text-primary, #262119)', lineHeight: 1.55 }}>✓ {s}</p>
              ))}
            </div>

            {/* Ethical */}
            {actionPlan.ethicalConsiderations && (
              <div style={{
                background: 'var(--kt-card, #FBF7EC)',
                borderRadius: 'var(--kt-radius-md, 6px)',
                border: '1px solid var(--kt-border, #DCD0AE)',
                padding: '20px 24px',
                boxShadow: '0 2px 6px rgba(38, 33, 25, 0.04)',
              }}>
                <p style={sectionHead}><span style={iconBox}><ShieldCheck size={14} color="var(--kt-chalkboard, #1F3A2E)" /></span>Etikal na Pagsasaalang-alang (Ethical Considerations)</p>
                <p style={{ margin: 0, fontSize: 13.5, color: 'var(--kt-text-primary, #262119)', lineHeight: 1.75 }}>{actionPlan.ethicalConsiderations}</p>
              </div>
            )}
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

