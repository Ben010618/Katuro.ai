import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Sparkles, Loader2, MessageSquare, BookOpen, ListChecks, Lightbulb, Heart, Trophy } from 'lucide-react';
import { useAuth }          from '../hooks/useAuth';
import { db }               from '../firebase';
import { doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { deductTokens, refundTokens } from '../services/db';
import { interpretFindings, THEME_LABELS } from '../services/actionResearchAI';
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

const fieldStyle = {
  width: '100%',
  boxSizing: 'border-box',
  padding: '12px 14px',
  border: '1px solid var(--kt-border, #DCD0AE)',
  borderRadius: 'var(--kt-radius-sm, 4px)',
  fontSize: 13.5,
  background: 'var(--kt-card-2, #F4EDDB)',
  color: 'var(--kt-text-primary, #262119)',
  outline: 'none',
  fontFamily: 'inherit',
  transition: 'border-color 0.15s, background 0.15s',
  lineHeight: 1.6,
  resize: 'vertical',
};

export default function ActionResearchPhase6() {
  const { docId }  = useParams();
  const { user, freeMode } = useAuth();
  const navigate   = useNavigate();

  const [docData,     setDocData]     = useState(null);
  const [pageLoading, setPageLoading] = useState(true);
  const [rawData,     setRawData]     = useState('');
  const [findings,    setFindings]    = useState(null);
  const [generating,  setGenerating]  = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error,       setError]       = useState('');
  const [completed,   setCompleted]   = useState(false);
  const [statusMsg,   setStatusMsg]   = useState('');

  useEffect(() => {
    if (!user?.uid || !docId) return;
    getDoc(doc(db, 'teachers', user.uid, 'actionResearch', docId)).then(snap => {
      if (snap.exists()) {
        const d = { id: snap.id, ...snap.data() };
        setDocData(d);
        if (d.rawData) setRawData(d.rawData);
        if (d.findings) { setFindings(d.findings); setCompleted(true); }
      }
      setPageLoading(false);
    });
  }, [user?.uid, docId]);

  async function handleGenerate() {
    if (!user?.uid || !docData || rawData.trim().length < 30 || generating) return;
    setGenerating(true); setError(''); setStatusMsg('Isinusulat ang kumpletong Chapter V (Results & Discussion) — maaaring tumagal nang 20–40 segundo…');
    let elapsedMs;
    let tokensDeducted = false;
    try {
      await deductTokens(user.uid, 'action-research-findings', 30);
      tokensDeducted = true;
      elapsedMs = startTimer();

      let result;
      let lastErr;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          result = await interpretFindings({
            title: docData.selectedTitle, selectedQuestions: docData.selectedQuestions,
            problemText: docData.problemText, beraTheme: docData.beraTheme,
            subjectArea: docData.subjectArea, gradeLevel: docData.gradeLevel,
            schoolName: docData.schoolName, schoolYear: docData.schoolYear, rawData,
            isRetry: attempt > 0,
          });
          break;
        } catch (err) {
          lastErr = err;
          console.warn(`interpretFindings attempt ${attempt + 1} failed:`, err);
          if (attempt < 2) {
            const wait = err.status === 429
              ? Math.min((err.retryAfter || 30) * 1000, 30_000)
              : 8000 + attempt * 4000;
            setStatusMsg(`May kaunting pagkaantala sa pagproseso — muling susubukan sa ${Math.round(wait / 1000)}s… (pagsubok ${attempt + 2}/3)`);
            await new Promise(r => setTimeout(r, wait));
            setStatusMsg('Muling isinusulat ang Chapter V…');
          }
        }
      }
      if (!result) throw lastErr || new Error('Failed to generate. Please try again.');

      setFindings(result);
      await updateDoc(doc(db, 'teachers', user.uid, 'actionResearch', docId), {
        rawData, findings: result, phase: 6, status:'complete', updatedAt: serverTimestamp(),
      });
      setCompleted(true);
      trackEvent(user.uid, 'action_research_phase6_generated', { subject: docData.subjectArea, grade: docData.gradeLevel });
      trackEvent(user.uid, 'action_research_completed', { subject: docData.subjectArea, grade: docData.gradeLevel });
      trackGeneration(user.uid, 'ar_phase6', { success: true, durationMs: elapsedMs() });
    } catch (err) {
      setError(
        err.status === 429
          ? 'Rate limit reached — wait a moment then try again.'
          : (err.message || 'Failed to generate. Please try again.')
      );
      if (tokensDeducted) {
        refundTokens(user.uid, 'action-research-findings', 30).catch(e => console.error('Token refund failed:', e));
      }
      if (elapsedMs) {
        trackGeneration(user.uid, 'ar_phase6', { success: false, durationMs: elapsedMs(), error: err.message });
      }
    } finally { setGenerating(false); }
  }

  async function handleDownload() {
    if (!docData) return;
    setDownloading(true);
    try {
      const { downloadResearchDocx } = await import('../services/actionResearchDocx');
      await downloadResearchDocx({ ...docData, rawData, findings }, user.displayName ?? '');
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
      phase={6}
      canNext={false}
      nextLabel=""
      onNext={() => {}}
      onDownload={findings ? handleDownload : undefined}
      downloadLoading={downloading}
      onBack={() => navigate(`/action-research/phase-5/${docId}`)}
      themeName={themeName}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* Completion banner */}
        {completed && (
          <div style={{
            background: 'var(--kt-chalkboard, #1F3A2E)',
            border: '1px solid var(--kt-chalkboard-hover, #2B4E3E)',
            borderRadius: 'var(--kt-radius-md, 6px)',
            padding: '20px 24px',
            display: 'flex',
            alignItems: 'center',
            gap: 16,
            boxShadow: '0 4px 14px rgba(31, 58, 46, 0.15)',
          }}>
            <div style={{
              width: 44,
              height: 44,
              borderRadius: 4,
              background: 'var(--kt-manila, #E4D5AC)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}>
              <Trophy size={22} color="var(--kt-chalkboard, #1F3A2E)" />
            </div>
            <div>
              <p style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#FBF7EC', fontFamily: 'var(--kt-font-heading, "Bitter", serif)' }}>
                Kumpleto na ang Action Research Manuscript!
              </p>
              <p style={{ margin: '3px 0 0', fontSize: 13, color: 'var(--kt-card-2, #F4EDDB)' }}>
                I-download ang opisyal na DepEd BERF-compliant A4 Word manuscript (.docx) gamit ang pindutan sa ibaba.
              </p>
            </div>
          </div>
        )}

        {/* Research title + data collection reference */}
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
          <h2 style={{ margin: '0 0 12px', fontSize: 16, fontWeight: 700, color: 'var(--kt-text-primary, #262119)', fontFamily: 'var(--kt-font-heading, "Bitter", serif)', lineHeight: 1.4 }}>
            {docData?.selectedTitle}
          </h2>
          {docData?.dataCollection?.primaryTool?.name && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 11, background: 'var(--kt-card-2, #F4EDDB)', border: '1px solid var(--kt-border, #DCD0AE)', color: 'var(--kt-chalkboard, #1F3A2E)', borderRadius: 3, padding: '2px 8px', fontWeight: 600, fontFamily: 'var(--kt-font-mono, monospace)' }}>
                Primary Tool: {docData.dataCollection.primaryTool.name}
              </span>
              {docData.dataCollection.secondaryTool?.name && (
                <span style={{ fontSize: 11, background: 'var(--kt-card-2, #F4EDDB)', border: '1px solid var(--kt-border, #DCD0AE)', color: 'var(--kt-chalkboard, #1F3A2E)', borderRadius: 3, padding: '2px 8px', fontWeight: 600, fontFamily: 'var(--kt-font-mono, monospace)' }}>
                  Secondary Tool: {docData.dataCollection.secondaryTool.name}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Raw data input */}
        <div style={{
          background: 'var(--kt-card, #FBF7EC)',
          borderRadius: 'var(--kt-radius-md, 6px)',
          border: '1px solid var(--kt-border, #DCD0AE)',
          padding: '24px',
          boxShadow: '0 2px 6px rgba(38, 33, 25, 0.04)',
        }}>
          <h2 style={{ margin: '0 0 4px', fontSize: 18, fontWeight: 700, color: 'var(--kt-text-primary, #262119)', fontFamily: 'var(--kt-font-heading, "Bitter", serif)' }}>
            Ipasok ang Nakalap na Datos (Input Collected Data)
          </h2>
          <p style={{ margin: '0 0 14px', fontSize: 13, color: 'var(--kt-text-secondary, #6E6455)', lineHeight: 1.5 }}>
            I-paste o i-type ang raw data — pre/post-test scores, observation notes, survey ratings, frequency percentages, o kahit anong nakalap na impormasyon mula sa inyong klase.
          </p>
          <textarea
            rows={8}
            value={rawData}
            onChange={e => setRawData(e.target.value)}
            placeholder={`Halimbawa:\nPre-test mean: 68.4 (SD: 8.2)\nPost-test mean: 81.7 (SD: 6.5)\nt-value: 4.23, p-value: 0.001\n\nObservation notes: 85% ng mga mag-aaral ay aktibong lumahok sa mga gawain...\nSurvey results: 90% ng klase ang nagsabing "Lubos na Epektibo" ang interbensyon...`}
            style={fieldStyle}
            onFocus={e => { e.target.style.borderColor = 'var(--kt-manila-border, #C9B583)'; e.target.style.background = '#ffffff'; }}
            onBlur={e => { e.target.style.borderColor = 'var(--kt-border, #DCD0AE)'; e.target.style.background = 'var(--kt-card-2, #F4EDDB)'; }}
          />
          <p style={{ margin: '6px 0 16px', fontSize: 11.5, color: 'var(--kt-text-secondary, #6E6455)', fontFamily: 'var(--kt-font-mono, monospace)' }}>
            Kailangan ng hindi bababa sa 30 characters. Mas detalyadong datos, mas komprehensibo ang pagsusuri ng AI.
          </p>

          <button
            onClick={handleGenerate}
            disabled={generating || rawData.trim().length < 30}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              background: (generating || rawData.trim().length < 30) ? 'var(--kt-border, #DCD0AE)' : 'var(--kt-chalkboard, #1F3A2E)',
              color: '#FBF7EC',
              border: 'none',
              borderRadius: 'var(--kt-radius-sm, 4px)',
              padding: '10px 18px',
              fontSize: 13,
              fontWeight: 700,
              cursor: (generating || rawData.trim().length < 30) ? 'not-allowed' : 'pointer',
              fontFamily: 'var(--kt-font-ui, "Inter", sans-serif)',
              transition: 'background 0.15s ease',
            }}
            onMouseEnter={e => { if (!generating && rawData.trim().length >= 30) e.currentTarget.style.background = 'var(--kt-chalkboard-hover, #2B4E3E)'; }}
            onMouseLeave={e => { if (!generating && rawData.trim().length >= 30) e.currentTarget.style.background = 'var(--kt-chalkboard, #1F3A2E)'; }}
          >
            {generating ? (
              <>
                <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> Isinusulat ang Chapter V…
              </>
            ) : (
              <>
                <Sparkles size={14} /> {findings ? 'Muling Isulat ang Findings' : 'Bumuo ng Findings & Full Report'}{!freeMode && ' (30 tokens)'}
              </>
            )}
          </button>
          {generating && statusMsg && (
            <p style={{ margin: '10px 0 0', fontSize: 12.5, color: 'var(--kt-text-secondary, #6E6455)' }}>
              {statusMsg}
            </p>
          )}
        </div>

        {/* Findings */}
        {findings && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

            {/* Findings per RQ */}
            <div style={{
              background: 'var(--kt-card, #FBF7EC)',
              borderRadius: 'var(--kt-radius-md, 6px)',
              border: '1px solid var(--kt-border, #DCD0AE)',
              padding: '20px 24px',
              boxShadow: '0 2px 6px rgba(38, 33, 25, 0.04)',
            }}>
              <p style={sectionHead}><span style={iconBox}><MessageSquare size={14} color="var(--kt-chalkboard, #1F3A2E)" /></span>Resulta at Pagsusuri Bawat Katanungan (Findings by RQ)</p>
              {(findings.findings ?? []).map((f, i) => (
                <div key={i} style={{ marginBottom: 16, paddingBottom: 16, borderBottom: i < findings.findings.length - 1 ? '1px solid var(--kt-border, #DCD0AE)' : 'none' }}>
                  <p style={{ margin: '0 0 6px', fontSize: 13.5, fontWeight: 700, color: 'var(--kt-chalkboard, #1F3A2E)', fontFamily: 'var(--kt-font-heading, "Bitter", serif)' }}>
                    RQ{f.questionNumber}. {f.question}
                  </p>
                  <p style={{ margin: '0 0 6px', fontSize: 13.5, color: 'var(--kt-text-primary, #262119)', lineHeight: 1.7 }}>{f.analysis}</p>
                  {f.significance && <p style={{ margin: 0, fontSize: 12.5, color: 'var(--kt-text-secondary, #6E6455)', lineHeight: 1.6, fontStyle: 'italic' }}>{f.significance}</p>}
                </div>
              ))}
            </div>

            {/* Discussion */}
            <div style={{
              background: 'var(--kt-card, #FBF7EC)',
              borderRadius: 'var(--kt-radius-md, 6px)',
              border: '1px solid var(--kt-border, #DCD0AE)',
              padding: '20px 24px',
              boxShadow: '0 2px 6px rgba(38, 33, 25, 0.04)',
            }}>
              <p style={sectionHead}><span style={iconBox}><BookOpen size={14} color="var(--kt-chalkboard, #1F3A2E)" /></span>Talakayan (Discussion)</p>
              {(findings.discussion ?? '').split('\n').filter(Boolean).map((p, i) => (
                <p key={i} style={{ margin: '0 0 12px', fontSize: 13.5, color: 'var(--kt-text-primary, #262119)', lineHeight: 1.75, textAlign: 'justify', textIndent: '2em' }}>{p}</p>
              ))}
            </div>

            {/* Conclusions */}
            <div style={{
              background: 'var(--kt-card, #FBF7EC)',
              borderRadius: 'var(--kt-radius-md, 6px)',
              border: '1px solid var(--kt-border, #DCD0AE)',
              padding: '20px 24px',
              boxShadow: '0 2px 6px rgba(38, 33, 25, 0.04)',
            }}>
              <p style={sectionHead}><span style={iconBox}><ListChecks size={14} color="var(--kt-chalkboard, #1F3A2E)" /></span>Konklusyon (Conclusions)</p>
              {(findings.conclusions ?? []).map((c, i) => (
                <div key={i} style={{ display: 'flex', gap: 10, marginBottom: 8 }}>
                  <span style={{ background: 'var(--kt-chalkboard, #1F3A2E)', color: '#FBF7EC', width: 22, height: 22, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10.5, fontWeight: 700, flexShrink: 0, marginTop: 2, fontFamily: 'var(--kt-font-mono, monospace)' }}>
                    {i + 1}
                  </span>
                  <p style={{ margin: 0, fontSize: 13.5, color: 'var(--kt-text-primary, #262119)', lineHeight: 1.6 }}>{c}</p>
                </div>
              ))}
            </div>

            {/* Recommendations */}
            <div style={{
              background: 'var(--kt-card, #FBF7EC)',
              borderRadius: 'var(--kt-radius-md, 6px)',
              border: '1px solid var(--kt-border, #DCD0AE)',
              padding: '20px 24px',
              boxShadow: '0 2px 6px rgba(38, 33, 25, 0.04)',
            }}>
              <p style={sectionHead}><span style={iconBox}><Lightbulb size={14} color="var(--kt-chalkboard, #1F3A2E)" /></span>Rekomendasyon (Recommendations)</p>
              {(findings.recommendations ?? []).map((r, i) => (
                <div key={i} style={{ marginBottom: 10, padding: '12px 16px', background: 'var(--kt-card-2, #F4EDDB)', borderRadius: 'var(--kt-radius-sm, 4px)', borderLeft: '3px solid var(--kt-chalkboard, #1F3A2E)' }}>
                  <p style={{ margin: '0 0 3px', fontSize: 11, fontWeight: 700, color: 'var(--kt-chalkboard, #1F3A2E)', textTransform: 'uppercase', fontFamily: 'var(--kt-font-mono, monospace)' }}>Para kay / sa: {r.for}</p>
                  <p style={{ margin: 0, fontSize: 13.5, color: 'var(--kt-text-primary, #262119)', lineHeight: 1.6 }}>{r.text}</p>
                </div>
              ))}
            </div>

            {/* Reflections */}
            {findings.reflections && (
              <div style={{
                background: 'var(--kt-card, #FBF7EC)',
                borderRadius: 'var(--kt-radius-md, 6px)',
                border: '1px solid var(--kt-border, #DCD0AE)',
                padding: '20px 24px',
                boxShadow: '0 2px 6px rgba(38, 33, 25, 0.04)',
              }}>
                <p style={sectionHead}><span style={iconBox}><Heart size={14} color="var(--kt-chalkboard, #1F3A2E)" /></span>Pagninilay ng Guro-Mananaliksik (Teacher-Researcher's Reflection)</p>
                {(findings.reflections ?? '').split('\n').filter(Boolean).map((p, i) => (
                  <p key={i} style={{ margin: '0 0 12px', fontSize: 13.5, color: 'var(--kt-text-primary, #262119)', lineHeight: 1.75, fontStyle: 'italic', textIndent: '2em' }}>{p}</p>
                ))}
              </div>
            )}

            {/* Download CTA */}
            <div style={{
              background: 'var(--kt-manila, #E4D5AC)',
              border: '1px solid var(--kt-manila-border, #C9B583)',
              borderRadius: 'var(--kt-radius-md, 6px)',
              padding: '22px 24px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 16,
              flexWrap: 'wrap',
              boxShadow: '0 4px 14px rgba(38, 33, 25, 0.06)',
            }}>
              <div>
                <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: 'var(--kt-text-primary, #262119)', fontFamily: 'var(--kt-font-heading, "Bitter", serif)' }}>
                  Handa na ang Kumpletong Action Research Manuscript!
                </p>
                <p style={{ margin: '4px 0 0', fontSize: 12.5, color: 'var(--kt-text-secondary, #6E6455)' }}>
                  A4 Word document (.docx) — Times New Roman 12pt, double-spaced, kumpleto mula Chapter I hanggang V alinsunod sa DepEd BERF standards.
                </p>
              </div>
              <button
                onClick={handleDownload}
                disabled={downloading}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  background: 'var(--kt-chalkboard, #1F3A2E)',
                  color: '#FBF7EC',
                  border: 'none',
                  borderRadius: 'var(--kt-radius-sm, 4px)',
                  padding: '12px 22px',
                  fontSize: 13.5,
                  fontWeight: 700,
                  cursor: downloading ? 'not-allowed' : 'pointer',
                  fontFamily: 'var(--kt-font-ui, "Inter", sans-serif)',
                  opacity: downloading ? 0.7 : 1,
                  flexShrink: 0,
                  transition: 'background 0.15s ease',
                }}
                onMouseEnter={e => { if (!downloading) e.currentTarget.style.background = 'var(--kt-chalkboard-hover, #2B4E3E)'; }}
                onMouseLeave={e => { if (!downloading) e.currentTarget.style.background = 'var(--kt-chalkboard, #1F3A2E)'; }}
              >
                {downloading ? (
                  <>
                    <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> Bumubuo ng Word file…
                  </>
                ) : (
                  'I-download ang Buong Papel (.docx)'
                )}
              </button>
            </div>
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

