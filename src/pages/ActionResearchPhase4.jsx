import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Sparkles, Loader2, Target, Calendar, Package, CheckCircle2, ShieldCheck } from 'lucide-react';
import { useAuth }          from '../hooks/useAuth';
import { db }               from '../firebase';
import { doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { deductTokens }     from '../services/db';
import { generateActionPlan, THEME_LABELS } from '../services/actionResearchAI';
import { downloadResearchDocx } from '../services/actionResearchDocx';
import ActionResearchShell  from '../components/ActionResearchShell';

const sectionHead = { margin:'0 0 12px', fontSize:13, fontWeight:700, color:'#1a3d2b', display:'flex', alignItems:'center', gap:7 };
const iconBox = { width:26, height:26, borderRadius:7, background:'#d8f3dc', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 };

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
    if (!user?.uid || !docData) return;
    setGenerating(true); setError('');
    try {
      await deductTokens(user.uid, 'action-research-plan', 5);
      const result = await generateActionPlan({
        title: docData.selectedTitle, selectedQuestions: docData.selectedQuestions,
        problemText: docData.problemText, beraTheme: docData.beraTheme,
        subjectArea: docData.subjectArea, gradeLevel: docData.gradeLevel,
        schoolName: docData.schoolName, schoolYear: docData.schoolYear,
      });
      setActionPlan(result);
    } catch (err) {
      setError(err.message || 'Failed to generate. Please try again.');
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
    } catch (err) {
      setError('Failed to save. Please try again.');
    } finally { setSaving(false); }
  }

  async function handleDownload() {
    if (!docData) return;
    setDownloading(true);
    try {
      await downloadResearchDocx({ ...docData, actionPlan }, user.displayName ?? '');
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
      phase={4}
      canNext={!!actionPlan}
      nextLabel="Next: Data Collection"
      onNext={handleNext}
      nextLoading={saving}
      onDownload={actionPlan ? handleDownload : undefined}
      downloadLoading={downloading}
      onBack={() => navigate(`/action-research/phase-3/${docId}`)}
      themeName={themeName}
    >
      <div style={{ display:'flex', flexDirection:'column', gap:20 }}>

        {/* Context */}
        <div style={{ background:'var(--kt-card)', borderRadius:14, border:'1px solid var(--kt-border)', padding:'20px 24px' }}>
          <p style={{ margin:'0 0 2px', fontSize:11, fontWeight:700, color:'var(--kt-text-secondary)', textTransform:'uppercase', letterSpacing:'0.06em' }}>Research title</p>
          <p style={{ margin:'0 0 0', fontSize:14, fontWeight:600, color:'#1a3d2b', lineHeight:1.5 }}>{docData?.selectedTitle}</p>
        </div>

        {/* Generate button */}
        <div style={{ background:'var(--kt-card)', borderRadius:14, border:'1px solid var(--kt-border)', padding:'22px 24px' }}>
          <p style={{ margin:'0 0 4px', fontSize:15, fontWeight:700, color:'var(--kt-text-primary)' }}>Action Plan</p>
          <p style={{ margin:'0 0 16px', fontSize:13, color:'var(--kt-text-secondary)', lineHeight:1.5 }}>AI generates your SMART objectives, intervention description, timeline, resources, and ethical considerations.</p>
          <button onClick={handleGenerate} disabled={generating} style={{
            display:'flex', alignItems:'center', gap:7,
            background:generating?'rgba(45,106,79,0.35)':'#2d6a4f', color:'#fff',
            border:'none', borderRadius:8, padding:'10px 18px', fontSize:13, fontWeight:600,
            cursor:generating?'not-allowed':'pointer', fontFamily:'inherit',
          }}>
            {generating
              ? <><Loader2 size={13} style={{animation:'spin 1s linear infinite'}} /> Generating action plan…</>
              : <><Sparkles size={13} /> {actionPlan ? 'Regenerate' : 'Generate'} action plan{!freeMode && ' (5 tokens)'}</>}
          </button>
        </div>

        {/* Results */}
        {actionPlan && (
          <div style={{ display:'flex', flexDirection:'column', gap:14 }}>

            {/* Objectives */}
            <div style={{ background:'var(--kt-card)', borderRadius:12, border:'1px solid var(--kt-border)', padding:'18px 22px' }}>
              <p style={sectionHead}><span style={iconBox}><Target size={13} color="#2d6a4f" /></span>SMART Objectives</p>
              {(actionPlan.objectives ?? []).map((o, i) => (
                <div key={i} style={{ display:'flex', gap:10, marginBottom:8 }}>
                  <span style={{ background:'#2d6a4f', color:'#fff', width:20, height:20, borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center', fontSize:10, fontWeight:700, flexShrink:0, marginTop:2 }}>{i+1}</span>
                  <p style={{ margin:0, fontSize:13, color:'var(--kt-text-primary)', lineHeight:1.6 }}>{o}</p>
                </div>
              ))}
            </div>

            {/* Intervention */}
            <div style={{ background:'var(--kt-card)', borderRadius:12, border:'1px solid var(--kt-border)', padding:'18px 22px' }}>
              <p style={sectionHead}><span style={iconBox}><Sparkles size={13} color="#2d6a4f" /></span>Intervention Description</p>
              <p style={{ margin:0, fontSize:13, color:'var(--kt-text-primary)', lineHeight:1.7, textAlign:'justify' }}>{actionPlan.interventionDescription}</p>
            </div>

            {/* Timeline */}
            <div style={{ background:'var(--kt-card)', borderRadius:12, border:'1px solid var(--kt-border)', padding:'18px 22px' }}>
              <p style={sectionHead}><span style={iconBox}><Calendar size={13} color="#2d6a4f" /></span>Timeline</p>
              <div style={{ overflowX:'auto' }}>
                <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
                  <thead>
                    <tr style={{ background:'#d8f3dc' }}>
                      {['Phase','Duration','Activities','Outputs'].map(h => (
                        <th key={h} style={{ padding:'8px 10px', textAlign:'left', fontWeight:700, color:'#1a3d2b', fontSize:11 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(actionPlan.timeline ?? []).map((row, i) => (
                      <tr key={i} style={{ borderBottom:'1px solid rgba(45,106,79,0.08)' }}>
                        <td style={{ padding:'8px 10px', fontWeight:600, color:'#1a3d2b', verticalAlign:'top', whiteSpace:'nowrap' }}>{row.phase}</td>
                        <td style={{ padding:'8px 10px', color:'var(--kt-text-secondary)', verticalAlign:'top', whiteSpace:'nowrap' }}>{row.duration}</td>
                        <td style={{ padding:'8px 10px', color:'var(--kt-text-primary)', verticalAlign:'top' }}>{(row.activities ?? []).join(' • ')}</td>
                        <td style={{ padding:'8px 10px', color:'var(--kt-text-secondary)', verticalAlign:'top' }}>{row.outputs}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Resources */}
            <div style={{ background:'var(--kt-card)', borderRadius:12, border:'1px solid var(--kt-border)', padding:'18px 22px' }}>
              <p style={sectionHead}><span style={iconBox}><Package size={13} color="#2d6a4f" /></span>Resources Needed</p>
              {(actionPlan.resources ?? []).map((r, i) => (
                <p key={i} style={{ margin:'0 0 6px', fontSize:13, color:'var(--kt-text-primary)', lineHeight:1.55 }}>• {r}</p>
              ))}
            </div>

            {/* Success Indicators */}
            <div style={{ background:'var(--kt-card)', borderRadius:12, border:'1px solid var(--kt-border)', padding:'18px 22px' }}>
              <p style={sectionHead}><span style={iconBox}><CheckCircle2 size={13} color="#2d6a4f" /></span>Success Indicators</p>
              {(actionPlan.successIndicators ?? []).map((s, i) => (
                <p key={i} style={{ margin:'0 0 6px', fontSize:13, color:'var(--kt-text-primary)', lineHeight:1.55 }}>✓ {s}</p>
              ))}
            </div>

            {/* Ethical */}
            {actionPlan.ethicalConsiderations && (
              <div style={{ background:'var(--kt-card)', borderRadius:12, border:'1px solid var(--kt-border)', padding:'18px 22px' }}>
                <p style={sectionHead}><span style={iconBox}><ShieldCheck size={13} color="#2d6a4f" /></span>Ethical Considerations</p>
                <p style={{ margin:0, fontSize:13, color:'var(--kt-text-primary)', lineHeight:1.7 }}>{actionPlan.ethicalConsiderations}</p>
              </div>
            )}
          </div>
        )}

        {error && <div style={{ background:'#fde8e8', border:'1px solid rgba(224,92,92,0.3)', borderRadius:8, padding:'10px 14px', fontSize:13, color:'#c0392b', fontWeight:500 }}>{error}</div>}
      </div>
    </ActionResearchShell>
  );
}
