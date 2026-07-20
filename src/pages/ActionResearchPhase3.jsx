import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Sparkles, Loader2, Globe, MapPin, School, BookOpen, Link2 } from 'lucide-react';
import { useAuth }          from '../hooks/useAuth';
import { db }               from '../firebase';
import { doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { deductTokens }     from '../services/db';
import { generateLiteratureReview, THEME_LABELS } from '../services/actionResearchAI';
import { trackEvent, trackGeneration, startTimer } from '../services/usageTracker';
import { downloadResearchDocx }  from '../services/actionResearchDocx';
import ActionResearchShell  from '../components/ActionResearchShell';

const SECTIONS = [
  { key:'globalPerspective',    label:'Global Perspective',    Icon:Globe },
  { key:'nationalPerspective',  label:'National Perspective',  Icon:MapPin },
  { key:'localPerspective',     label:'Local Perspective',     Icon:School },
  { key:'classroomPerspective', label:'Classroom Perspective', Icon:BookOpen },
  { key:'synthesis',            label:'Synthesis',             Icon:Link2 },
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
    if (!user?.uid || !docData) return;
    const initialStatus = 'This may take 15–30 seconds. Researching global, national, local, and classroom literature…';
    setGenerating(true); setError(''); setStatusMsg(initialStatus);
    let elapsedMs;
    try {
      await deductTokens(user.uid, 'action-research-literature', 5);
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
          if (err.dailyLimit) break; // won't clear up by retrying — surface immediately
          if (attempt < 2) {
            const wait = err.status === 429
              ? Math.min((err.retryAfter || 30) * 1000, 30_000)
              : 6000 + attempt * 3000;
            setStatusMsg(`Due to high demand, generation may be slow — retrying in ${Math.round(wait / 1000)}s…`);
            await new Promise(r => setTimeout(r, wait));
            setStatusMsg('Re-researching your literature review…');
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
    } catch (err) {
      setError('Failed to save. Please try again.');
    } finally { setSaving(false); }
  }

  async function handleDownload() {
    if (!docData) return;
    setDownloading(true);
    try {
      await downloadResearchDocx({ ...docData, literatureReview: litReview }, user.displayName ?? '');
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
      phase={3}
      canNext={!!litReview}
      nextLabel="Next: Action Plan"
      onNext={handleNext}
      nextLoading={saving}
      onDownload={litReview ? handleDownload : undefined}
      downloadLoading={downloading}
      onBack={() => navigate(`/action-research/phase-2/${docId}`)}
      themeName={themeName}
    >
      <div style={{ display:'flex', flexDirection:'column', gap:20 }}>

        {/* Context */}
        <div style={{ background:'#fff', borderRadius:14, border:'1px solid rgba(45,106,79,0.12)', padding:'20px 24px' }}>
          <p style={{ margin:'0 0 2px', fontSize:11, fontWeight:700, color:'#4a6357', textTransform:'uppercase', letterSpacing:'0.06em' }}>Research title</p>
          <p style={{ margin:'0 0 10px', fontSize:15, fontWeight:600, color:'#1a3d2b', lineHeight:1.5 }}>{docData?.selectedTitle}</p>
          {docData?.selectedQuestions?.length > 0 && (
            <>
              <p style={{ margin:'0 0 8px', fontSize:11, fontWeight:700, color:'#4a6357', textTransform:'uppercase', letterSpacing:'0.06em' }}>Selected research questions</p>
              {docData.selectedQuestions.map((q, i) => (
                <p key={i} style={{ margin:'0 0 4px', fontSize:12, color:'#163828', lineHeight:1.55 }}>
                  <span style={{ fontWeight:700, color:'#2d6a4f' }}>RQ{i+1}.</span> {q}
                </p>
              ))}
            </>
          )}
        </div>

        {/* Generate */}
        <div style={{ background:'#fff', borderRadius:14, border:'1px solid rgba(45,106,79,0.12)', padding:'22px 24px' }}>
          <p style={{ margin:'0 0 4px', fontSize:15, fontWeight:700, color:'#0d2218' }}>Literature Review</p>
          <p style={{ margin:'0 0 16px', fontSize:13, color:'#4a6357', lineHeight:1.5 }}>
            AI generates a Funnel Format review — from global research down to your classroom context.
          </p>
          <button onClick={handleGenerate} disabled={generating} style={{
            display:'flex', alignItems:'center', gap:7,
            background:generating?'rgba(45,106,79,0.35)':'#2d6a4f', color:'#fff',
            border:'none', borderRadius:8, padding:'10px 18px', fontSize:13, fontWeight:600,
            cursor:generating?'not-allowed':'pointer', fontFamily:'inherit',
          }}>
            {generating
              ? <><Loader2 size={13} style={{animation:'spin 1s linear infinite'}} /> Generating literature review…</>
              : <><Sparkles size={13} /> {litReview ? 'Regenerate' : 'Generate'} literature review{!freeMode && ' (5 tokens)'}</>}
          </button>
          {generating && <p style={{ margin:'10px 0 0', fontSize:12, color:'#4a6357' }}>{statusMsg}</p>}
        </div>

        {/* Results */}
        {litReview && (
          <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
            {SECTIONS.map(({ key, label, Icon }) => (
              litReview[key] ? (
                <div key={key} style={{ background:'#fff', borderRadius:12, border:'1px solid rgba(45,106,79,0.12)', padding:'18px 22px' }}>
                  <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:12 }}>
                    <div style={{ width:30, height:30, borderRadius:8, background:'#d8f3dc', display:'flex', alignItems:'center', justifyContent:'center' }}>
                      <Icon size={14} color="#2d6a4f" />
                    </div>
                    <p style={{ margin:0, fontSize:13, fontWeight:700, color:'#1a3d2b' }}>{label}</p>
                  </div>
                  {litReview[key].split('\n').filter(Boolean).map((para, i) => (
                    <p key={i} style={{ margin:'0 0 10px', fontSize:13, color:'#163828', lineHeight:1.7, textAlign:'justify', textIndent:'2em' }}>{para}</p>
                  ))}
                </div>
              ) : null
            ))}
          </div>
        )}

        {error && <div style={{ background:'#fde8e8', border:'1px solid rgba(224,92,92,0.3)', borderRadius:8, padding:'10px 14px', fontSize:13, color:'#c0392b', fontWeight:500 }}>{error}</div>}
      </div>
    </ActionResearchShell>
  );
}
