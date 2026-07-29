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
  display:'flex', alignItems:'flex-start', gap:12, textAlign:'left', cursor:'pointer',
  fontFamily:'inherit', background:active?'#f0f9f4':'#fafafa',
  border:active?'2px solid #2d6a4f':'1.5px solid rgba(45,106,79,0.15)',
  borderRadius:10, padding:'14px 16px', transition:'border 0.15s, background 0.15s', width:'100%',
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
          if (err.dailyLimit) break; // won't clear up by retrying — surface immediately
          if (attempt < 2) {
            const wait = err.status === 429
              ? Math.min((err.retryAfter || 30) * 1000, 30_000)
              : 6000 + attempt * 3000;
            setStatusMsg(`Due to high demand, generation may be slow — retrying in ${Math.round(wait / 1000)}s…`);
            await new Promise(r => setTimeout(r, wait));
            setStatusMsg('Regenerating questions…');
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
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'#f5faf7' }}>
      <Loader2 size={24} color="#2d6a4f" style={{ animation:'spin 1s linear infinite' }} />
    </div>
  );

  const themeName = THEME_LABELS[docData?.beraTheme] ?? docData?.beraTheme;

  return (
    <ActionResearchShell
      phase={2}
      canNext={selectedQs.length > 0}
      nextLabel="Next: Literature Review"
      onNext={handleNext}
      nextLoading={saving}
      onDownload={questions.length > 0 ? handleDownload : undefined}
      downloadLoading={downloading}
      onBack={() => navigate(`/action-research/phase-1`)}
      themeName={themeName}
    >
      <div style={{ display:'flex', flexDirection:'column', gap:20 }}>

        {/* Context card */}
        <div style={{ background:'#fff', borderRadius:14, border:'1px solid rgba(45,106,79,0.12)', padding:'20px 24px' }}>
          <p style={{ margin:'0 0 2px', fontSize:11, fontWeight:700, color:'#4a6357', textTransform:'uppercase', letterSpacing:'0.06em' }}>Research title</p>
          <p style={{ margin:'0 0 10px', fontSize:15, fontWeight:600, color:'#1a3d2b', lineHeight:1.5 }}>{docData?.selectedTitle}</p>
          <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
            {docData?.gradeLevel && <span style={{ fontSize:11, background:'#d8f3dc', color:'#1a3d2b', borderRadius:20, padding:'2px 10px', fontWeight:600 }}>{docData.gradeLevel}</span>}
            {docData?.subjectArea && <span style={{ fontSize:11, background:'#d8f3dc', color:'#1a3d2b', borderRadius:20, padding:'2px 10px', fontWeight:600 }}>{docData.subjectArea}</span>}
            {themeName && <span style={{ fontSize:11, background:'#f0f9f4', color:'#2d6a4f', borderRadius:20, padding:'2px 10px', fontWeight:600 }}>{themeName}</span>}
          </div>
        </div>

        {/* Generate section */}
        <div style={{ background:'#fff', borderRadius:14, border:'1px solid rgba(45,106,79,0.12)', padding:'22px 24px' }}>
          <p style={{ margin:'0 0 4px', fontSize:15, fontWeight:700, color:'#0d2218' }}>Research Questions</p>
          <p style={{ margin:'0 0 18px', fontSize:13, color:'#4a6357', lineHeight:1.5 }}>
            Generate 5 AI-suggested research questions aligned to your title and problem. Select 1 to 5 to include in your paper.
          </p>
          <button onClick={handleGenerate} disabled={generating} style={{
            display:'flex', alignItems:'center', gap:7,
            background:generating?'rgba(45,106,79,0.35)':'#2d6a4f', color:'#fff',
            border:'none', borderRadius:8, padding:'10px 18px', fontSize:13, fontWeight:600,
            cursor:generating?'not-allowed':'pointer', fontFamily:'inherit',
            marginBottom: questions.length ? 20 : 0,
          }}>
            {generating
              ? <><Loader2 size={13} style={{animation:'spin 1s linear infinite'}} /> Generating…</>
              : <><Sparkles size={13} /> {questions.length ? 'Regenerate' : 'Generate'} research questions{!freeMode && ' (5 tokens)'}</>}
          </button>
          {generating && statusMsg && <p style={{ margin:'10px 0 0', fontSize:12, color:'#4a6357' }}>{statusMsg}</p>}

          {questions.length > 0 && (
            <>
              <p style={{ margin:'0 0 10px', fontSize:11, fontWeight:700, color:'#4a6357', textTransform:'uppercase', letterSpacing:'0.06em' }}>
                Select questions to include ({selectedQs.length} selected)
              </p>
              <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                {questions.map((q, i) => {
                  const active = selectedQs.includes(q);
                  return (
                    <button key={i} onClick={() => toggleQ(q)}
                      style={cardStyle(active)}
                      onMouseEnter={e=>{if(!active)e.currentTarget.style.background='#f5faf7';}}
                      onMouseLeave={e=>{if(!active)e.currentTarget.style.background='#fafafa';}}>
                      <div style={{ marginTop:1, flexShrink:0, color:active?'#2d6a4f':'#9bb8ac' }}>
                        {active ? <CheckSquare size={16} /> : <Square size={16} />}
                      </div>
                      <p style={{ margin:0, fontSize:13, color:active?'#1a3d2b':'#0d2218', lineHeight:1.6, fontWeight:active?600:400 }}>
                        <span style={{ fontWeight:700, color:'#2d6a4f', marginRight:6 }}>RQ{i+1}.</span>{q}
                      </p>
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {error && <div style={{ background:'#fde8e8', border:'1px solid rgba(224,92,92,0.3)', borderRadius:8, padding:'10px 14px', fontSize:13, color:'#c0392b', fontWeight:500 }}>{error}</div>}
      </div>
    </ActionResearchShell>
  );
}
