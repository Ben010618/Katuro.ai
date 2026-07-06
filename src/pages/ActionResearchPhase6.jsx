import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Sparkles, Loader2, MessageSquare, BookOpen, ListChecks, Lightbulb, Heart, Trophy } from 'lucide-react';
import { useAuth }          from '../hooks/useAuth';
import { db }               from '../firebase';
import { doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { deductTokens }     from '../services/db';
import { interpretFindings, THEME_LABELS } from '../services/actionResearchAI';
import { trackEvent, trackGeneration, startTimer } from '../services/usageTracker';
import { downloadResearchDocx } from '../services/actionResearchDocx';
import ActionResearchShell  from '../components/ActionResearchShell';

const sectionHead = { margin:'0 0 12px', fontSize:13, fontWeight:700, color:'#1a3d2b', display:'flex', alignItems:'center', gap:7 };
const iconBox = { width:26, height:26, borderRadius:7, background:'#d8f3dc', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 };
const fieldStyle = {
  width:'100%', boxSizing:'border-box', padding:'10px 12px',
  border:'1.5px solid rgba(45,106,79,0.2)', borderRadius:8,
  fontSize:13, background:'var(--kt-input-bg)', color:'var(--kt-text-primary)',
  outline:'none', fontFamily:'inherit', transition:'border 0.15s', lineHeight:1.6, resize:'vertical',
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
  const [saving,      setSaving]      = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error,       setError]       = useState('');
  const [completed,   setCompleted]   = useState(false);

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
    if (!user?.uid || !docData || rawData.trim().length < 30) return;
    setGenerating(true); setError('');
    let elapsedMs;
    try {
      await deductTokens(user.uid, 'action-research-findings', 30);
      elapsedMs = startTimer();
      const result = await interpretFindings({
        title: docData.selectedTitle, selectedQuestions: docData.selectedQuestions,
        problemText: docData.problemText, beraTheme: docData.beraTheme,
        subjectArea: docData.subjectArea, gradeLevel: docData.gradeLevel,
        schoolName: docData.schoolName, schoolYear: docData.schoolYear, rawData,
      });
      setFindings(result);
      await updateDoc(doc(db, 'teachers', user.uid, 'actionResearch', docId), {
        rawData, findings: result, phase: 6, status:'complete', updatedAt: serverTimestamp(),
      });
      setCompleted(true);
      trackEvent(user.uid, 'action_research_phase6_generated', { subject: docData.subjectArea, grade: docData.gradeLevel });
      trackEvent(user.uid, 'action_research_completed', { subject: docData.subjectArea, grade: docData.gradeLevel });
      trackGeneration(user.uid, 'ar_phase6', { success: true, durationMs: elapsedMs() });
    } catch (err) {
      setError(err.message || 'Failed to generate. Please try again.');
      if (elapsedMs) {
        trackGeneration(user.uid, 'ar_phase6', { success: false, durationMs: elapsedMs(), error: err.message });
      }
    } finally { setGenerating(false); }
  }

  async function handleDownload() {
    if (!docData) return;
    setDownloading(true);
    try {
      await downloadResearchDocx({ ...docData, rawData, findings }, user.displayName ?? '');
    } finally { setDownloading(false); }
  }

  if (pageLoading) return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'var(--kt-surface)' }}>
      <Loader2 size={24} color="#2d6a4f" style={{ animation:'spin 1s linear infinite' }} />
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
      <div style={{ display:'flex', flexDirection:'column', gap:20 }}>

        {/* Completion banner */}
        {completed && (
          <div style={{ background:'linear-gradient(135deg,#2d6a4f,#52b788)', borderRadius:14, padding:'20px 24px', display:'flex', alignItems:'center', gap:14 }}>
            <div style={{ width:44, height:44, borderRadius:'50%', background:'rgba(255,255,255,0.2)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
              <Trophy size={22} color="#fff" />
            </div>
            <div>
              <p style={{ margin:0, fontSize:16, fontWeight:700, color:'#fff' }}>Research paper complete!</p>
              <p style={{ margin:'2px 0 0', fontSize:13, color:'rgba(255,255,255,0.85)' }}>Download your full A4 Word document below — formatted to DepEd standards.</p>
            </div>
          </div>
        )}

        {/* Research title + data collection reference */}
        <div style={{ background:'var(--kt-card)', borderRadius:14, border:'1px solid var(--kt-border)', padding:'20px 24px' }}>
          <p style={{ margin:'0 0 2px', fontSize:11, fontWeight:700, color:'var(--kt-text-secondary)', textTransform:'uppercase', letterSpacing:'0.06em' }}>Research title</p>
          <p style={{ margin:'0 0 12px', fontSize:14, fontWeight:600, color:'#1a3d2b', lineHeight:1.5 }}>{docData?.selectedTitle}</p>
          {docData?.dataCollection?.primaryTool?.name && (
            <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
              <span style={{ fontSize:11, background:'#f0f9f4', color:'#2d6a4f', borderRadius:20, padding:'2px 10px', fontWeight:600 }}>
                Primary tool: {docData.dataCollection.primaryTool.name}
              </span>
              {docData.dataCollection.secondaryTool?.name && (
                <span style={{ fontSize:11, background:'#f0f9f4', color:'#2d6a4f', borderRadius:20, padding:'2px 10px', fontWeight:600 }}>
                  Secondary: {docData.dataCollection.secondaryTool.name}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Raw data input */}
        <div style={{ background:'var(--kt-card)', borderRadius:14, border:'1px solid var(--kt-border)', padding:'22px 24px' }}>
          <p style={{ margin:'0 0 4px', fontSize:15, fontWeight:700, color:'var(--kt-text-primary)' }}>Input Your Collected Data</p>
          <p style={{ margin:'0 0 14px', fontSize:13, color:'var(--kt-text-secondary)', lineHeight:1.5 }}>
            Paste or type your raw data — pre/post-test scores, observation notes, survey results, percentages, or any other collected data.
          </p>
          <textarea
            rows={8}
            value={rawData}
            onChange={e => setRawData(e.target.value)}
            placeholder={`Example:\nPre-test mean: 68.4 (SD: 8.2)\nPost-test mean: 81.7 (SD: 6.5)\nt-value: 4.23, p-value: 0.001\n\nObservation notes: 85% of learners actively participated...\nSurvey results: 90% rated the intervention as "very effective"...`}
            style={fieldStyle}
            onFocus={e => { e.target.style.borderColor='#2d6a4f'; e.target.style.boxShadow='0 0 0 3px rgba(45,106,79,0.1)'; }}
            onBlur={e => { e.target.style.borderColor='rgba(45,106,79,0.2)'; e.target.style.boxShadow='none'; }}
          />
          <p style={{ margin:'6px 0 16px', fontSize:11, color:'#9bb8ac' }}>Minimum 30 characters required. The more data you provide, the richer the AI interpretation.</p>

          <button
            onClick={handleGenerate}
            disabled={generating || rawData.trim().length < 30}
            style={{
              display:'flex', alignItems:'center', gap:7,
              background:(generating || rawData.trim().length < 30)?'rgba(45,106,79,0.35)':'#2d6a4f', color:'#fff',
              border:'none', borderRadius:8, padding:'10px 18px', fontSize:13, fontWeight:600,
              cursor:(generating || rawData.trim().length < 30)?'not-allowed':'pointer', fontFamily:'inherit',
            }}
          >
            {generating
              ? <><Loader2 size={13} style={{animation:'spin 1s linear infinite'}} /> Interpreting findings…</>
              : <><Sparkles size={13} /> {findings ? 'Regenerate' : 'Generate'} findings & report{!freeMode && ' (30 tokens)'}</>}
          </button>
          {generating && <p style={{ margin:'10px 0 0', fontSize:12, color:'#4a6357' }}>Writing your complete Chapter V — this may take 20–40 seconds…</p>}
        </div>

        {/* Findings */}
        {findings && (
          <div style={{ display:'flex', flexDirection:'column', gap:14 }}>

            {/* Findings per RQ */}
            <div style={{ background:'var(--kt-card)', borderRadius:12, border:'1px solid var(--kt-border)', padding:'18px 22px' }}>
              <p style={sectionHead}><span style={iconBox}><MessageSquare size={13} color="#2d6a4f" /></span>Findings by Research Question</p>
              {(findings.findings ?? []).map((f, i) => (
                <div key={i} style={{ marginBottom:16, paddingBottom:16, borderBottom:i<findings.findings.length-1?'1px solid rgba(45,106,79,0.08)':'none' }}>
                  <p style={{ margin:'0 0 6px', fontSize:13, fontWeight:700, color:'#2d6a4f' }}>RQ{f.questionNumber}. {f.question}</p>
                  <p style={{ margin:'0 0 4px', fontSize:13, color:'var(--kt-text-primary)', lineHeight:1.7 }}>{f.analysis}</p>
                  {f.significance && <p style={{ margin:0, fontSize:12, color:'var(--kt-text-secondary)', lineHeight:1.6, fontStyle:'italic' }}>{f.significance}</p>}
                </div>
              ))}
            </div>

            {/* Discussion */}
            <div style={{ background:'var(--kt-card)', borderRadius:12, border:'1px solid var(--kt-border)', padding:'18px 22px' }}>
              <p style={sectionHead}><span style={iconBox}><BookOpen size={13} color="#2d6a4f" /></span>Discussion</p>
              {(findings.discussion ?? '').split('\n').filter(Boolean).map((p, i) => (
                <p key={i} style={{ margin:'0 0 10px', fontSize:13, color:'var(--kt-text-primary)', lineHeight:1.7, textAlign:'justify', textIndent:'2em' }}>{p}</p>
              ))}
            </div>

            {/* Conclusions */}
            <div style={{ background:'var(--kt-card)', borderRadius:12, border:'1px solid var(--kt-border)', padding:'18px 22px' }}>
              <p style={sectionHead}><span style={iconBox}><ListChecks size={13} color="#2d6a4f" /></span>Conclusions</p>
              {(findings.conclusions ?? []).map((c, i) => (
                <div key={i} style={{ display:'flex', gap:10, marginBottom:8 }}>
                  <span style={{ background:'#2d6a4f', color:'#fff', width:20, height:20, borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center', fontSize:10, fontWeight:700, flexShrink:0, marginTop:2 }}>{i+1}</span>
                  <p style={{ margin:0, fontSize:13, color:'var(--kt-text-primary)', lineHeight:1.6 }}>{c}</p>
                </div>
              ))}
            </div>

            {/* Recommendations */}
            <div style={{ background:'var(--kt-card)', borderRadius:12, border:'1px solid var(--kt-border)', padding:'18px 22px' }}>
              <p style={sectionHead}><span style={iconBox}><Lightbulb size={13} color="#2d6a4f" /></span>Recommendations</p>
              {(findings.recommendations ?? []).map((r, i) => (
                <div key={i} style={{ marginBottom:10, padding:'10px 14px', background:'var(--kt-surface)', borderRadius:8, borderLeft:'3px solid #2d6a4f' }}>
                  <p style={{ margin:'0 0 3px', fontSize:11, fontWeight:700, color:'#2d6a4f', textTransform:'uppercase' }}>For {r.for}</p>
                  <p style={{ margin:0, fontSize:13, color:'var(--kt-text-primary)', lineHeight:1.6 }}>{r.text}</p>
                </div>
              ))}
            </div>

            {/* Reflections */}
            {findings.reflections && (
              <div style={{ background:'var(--kt-card)', borderRadius:12, border:'1px solid var(--kt-border)', padding:'18px 22px' }}>
                <p style={sectionHead}><span style={iconBox}><Heart size={13} color="#2d6a4f" /></span>Teacher-Researcher's Reflection</p>
                {(findings.reflections ?? '').split('\n').filter(Boolean).map((p, i) => (
                  <p key={i} style={{ margin:'0 0 10px', fontSize:13, color:'var(--kt-text-primary)', lineHeight:1.7, fontStyle:'italic', textIndent:'2em' }}>{p}</p>
                ))}
              </div>
            )}

            {/* Download CTA */}
            <div style={{ background:'#f0f9f4', border:'2px solid #2d6a4f', borderRadius:14, padding:'20px 24px', display:'flex', alignItems:'center', justifyContent:'space-between', gap:14, flexWrap:'wrap' }}>
              <div>
                <p style={{ margin:0, fontSize:14, fontWeight:700, color:'#1a3d2b' }}>Your action research paper is ready!</p>
                <p style={{ margin:'3px 0 0', fontSize:12, color:'#4a6357' }}>A4 Word document — Times New Roman 12pt, double-spaced, with all 5 chapters</p>
              </div>
              <button onClick={handleDownload} disabled={downloading} style={{
                display:'flex', alignItems:'center', gap:7,
                background:'#2d6a4f', color:'#fff', border:'none', borderRadius:8,
                padding:'11px 20px', fontSize:13, fontWeight:600,
                cursor:downloading?'not-allowed':'pointer', fontFamily:'inherit',
                opacity:downloading?0.7:1, flexShrink:0,
              }}>
                {downloading ? <><Loader2 size={13} style={{animation:'spin 1s linear infinite'}} /> Generating…</> : 'Download Full Paper (.docx)'}
              </button>
            </div>
          </div>
        )}

        {error && <div style={{ background:'#fde8e8', border:'1px solid rgba(224,92,92,0.3)', borderRadius:8, padding:'10px 14px', fontSize:13, color:'#c0392b', fontWeight:500 }}>{error}</div>}
      </div>
    </ActionResearchShell>
  );
}
