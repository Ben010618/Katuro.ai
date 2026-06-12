import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Sparkles, Loader2, ClipboardList, BarChart2, FlaskConical } from 'lucide-react';
import { useAuth }          from '../hooks/useAuth';
import { db }               from '../firebase';
import { doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { deductTokens }     from '../services/db';
import { generateDataCollection, THEME_LABELS } from '../services/actionResearchAI';
import { downloadResearchDocx } from '../services/actionResearchDocx';
import ActionResearchShell  from '../components/ActionResearchShell';

const sectionHead = { margin:'0 0 12px', fontSize:13, fontWeight:700, color:'#1a3d2b', display:'flex', alignItems:'center', gap:7 };
const iconBox = { width:26, height:26, borderRadius:7, background:'#d8f3dc', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 };
const tag = (t) => <span style={{ fontSize:10, fontWeight:700, background:'#f0f9f4', color:'#2d6a4f', borderRadius:20, padding:'2px 10px', marginRight:6 }}>{t}</span>;

export default function ActionResearchPhase5() {
  const { docId }  = useParams();
  const { user }   = useAuth();
  const navigate   = useNavigate();

  const [docData,        setDocData]        = useState(null);
  const [pageLoading,    setPageLoading]    = useState(true);
  const [dataCollection, setDataCollection] = useState(null);
  const [generating,     setGenerating]     = useState(false);
  const [saving,         setSaving]         = useState(false);
  const [downloading,    setDownloading]    = useState(false);
  const [error,          setError]          = useState('');

  useEffect(() => {
    if (!user?.uid || !docId) return;
    getDoc(doc(db, 'teachers', user.uid, 'actionResearch', docId)).then(snap => {
      if (snap.exists()) {
        const d = { id: snap.id, ...snap.data() };
        setDocData(d);
        if (d.dataCollection) setDataCollection(d.dataCollection);
      }
      setPageLoading(false);
    });
  }, [user?.uid, docId]);

  async function handleGenerate() {
    if (!user?.uid || !docData) return;
    setGenerating(true); setError('');
    try {
      await deductTokens(user.uid, 'action-research-datacollection', 5);
      const result = await generateDataCollection({
        title: docData.selectedTitle, selectedQuestions: docData.selectedQuestions,
        beraTheme: docData.beraTheme, subjectArea: docData.subjectArea,
        gradeLevel: docData.gradeLevel,
      });
      setDataCollection(result);
    } catch (err) {
      setError(err.message || 'Failed to generate. Please try again.');
    } finally { setGenerating(false); }
  }

  async function handleNext() {
    if (!user?.uid || !dataCollection) return;
    setSaving(true); setError('');
    try {
      await updateDoc(doc(db, 'teachers', user.uid, 'actionResearch', docId), {
        dataCollection, phase: 5, updatedAt: serverTimestamp(),
      });
      navigate(`/action-research/phase-6/${docId}`);
    } catch (err) {
      setError('Failed to save. Please try again.');
    } finally { setSaving(false); }
  }

  async function handleDownload() {
    if (!docData) return;
    setDownloading(true);
    try {
      await downloadResearchDocx({ ...docData, dataCollection }, user.displayName ?? '');
    } finally { setDownloading(false); }
  }

  if (pageLoading) return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'#f5faf7' }}>
      <Loader2 size={24} color="#2d6a4f" style={{ animation:'spin 1s linear infinite' }} />
    </div>
  );

  const themeName = THEME_LABELS[docData?.beraTheme] ?? docData?.beraTheme;
  const dc = dataCollection;

  return (
    <ActionResearchShell
      phase={5}
      canNext={!!dataCollection}
      nextLabel="Next: Findings & Report"
      onNext={handleNext}
      nextLoading={saving}
      onDownload={dataCollection ? handleDownload : undefined}
      downloadLoading={downloading}
      onBack={() => navigate(`/action-research/phase-4/${docId}`)}
      themeName={themeName}
    >
      <div style={{ display:'flex', flexDirection:'column', gap:20 }}>

        {/* Context */}
        <div style={{ background:'#fff', borderRadius:14, border:'1px solid rgba(45,106,79,0.12)', padding:'20px 24px' }}>
          <p style={{ margin:'0 0 2px', fontSize:11, fontWeight:700, color:'#4a6357', textTransform:'uppercase', letterSpacing:'0.06em' }}>Research title</p>
          <p style={{ margin:'0 0 0', fontSize:14, fontWeight:600, color:'#1a3d2b', lineHeight:1.5 }}>{docData?.selectedTitle}</p>
        </div>

        {/* Generate */}
        <div style={{ background:'#fff', borderRadius:14, border:'1px solid rgba(45,106,79,0.12)', padding:'22px 24px' }}>
          <p style={{ margin:'0 0 4px', fontSize:15, fontWeight:700, color:'#0d2218' }}>Data Collection Methodology</p>
          <p style={{ margin:'0 0 16px', fontSize:13, color:'#4a6357', lineHeight:1.5 }}>AI recommends the best data collection tools, statistical formulas, and analysis approach for your research.</p>
          <button onClick={handleGenerate} disabled={generating} style={{
            display:'flex', alignItems:'center', gap:7,
            background:generating?'rgba(45,106,79,0.35)':'#2d6a4f', color:'#fff',
            border:'none', borderRadius:8, padding:'10px 18px', fontSize:13, fontWeight:600,
            cursor:generating?'not-allowed':'pointer', fontFamily:'inherit',
          }}>
            {generating
              ? <><Loader2 size={13} style={{animation:'spin 1s linear infinite'}} /> Generating methodology…</>
              : <><Sparkles size={13} /> {dc ? 'Regenerate' : 'Generate'} data collection plan (5 tokens)</>}
          </button>
        </div>

        {/* Results */}
        {dc && (
          <div style={{ display:'flex', flexDirection:'column', gap:14 }}>

            {/* Primary tool */}
            <div style={{ background:'#fff', borderRadius:12, border:'1px solid rgba(45,106,79,0.12)', padding:'18px 22px' }}>
              <p style={sectionHead}><span style={iconBox}><ClipboardList size={13} color="#2d6a4f" /></span>Primary Data Collection Tool</p>
              <div style={{ display:'flex', gap:8, marginBottom:10 }}>
                {dc.primaryTool?.name && tag(dc.primaryTool.name)}
                {dc.primaryTool?.type && tag(dc.primaryTool.type)}
              </div>
              <p style={{ margin:'0 0 8px', fontSize:13, color:'#163828', lineHeight:1.65 }}>{dc.primaryTool?.description}</p>
              {dc.primaryTool?.rationale && <p style={{ margin:'0 0 8px', fontSize:13, color:'#4a6357', lineHeight:1.6, fontStyle:'italic' }}><strong style={{color:'#1a3d2b',fontStyle:'normal'}}>Rationale:</strong> {dc.primaryTool.rationale}</p>}
              {dc.primaryTool?.administration && <p style={{ margin:'0 0 8px', fontSize:13, color:'#4a6357', lineHeight:1.6 }}><strong style={{color:'#1a3d2b'}}>Administration:</strong> {dc.primaryTool.administration}</p>}
              {dc.primaryTool?.sampleItems?.length > 0 && (
                <>
                  <p style={{ margin:'10px 0 6px', fontSize:11, fontWeight:700, color:'#4a6357', textTransform:'uppercase', letterSpacing:'0.06em' }}>Sample items</p>
                  {dc.primaryTool.sampleItems.map((s, i) => <p key={i} style={{ margin:'0 0 4px', fontSize:12, color:'#163828' }}>{i+1}. {s}</p>)}
                </>
              )}
            </div>

            {/* Secondary tool */}
            <div style={{ background:'#fff', borderRadius:12, border:'1px solid rgba(45,106,79,0.12)', padding:'18px 22px' }}>
              <p style={sectionHead}><span style={iconBox}><FlaskConical size={13} color="#2d6a4f" /></span>Secondary Data Collection Tool</p>
              <div style={{ display:'flex', gap:8, marginBottom:10 }}>
                {dc.secondaryTool?.name && tag(dc.secondaryTool.name)}
                {dc.secondaryTool?.type && tag(dc.secondaryTool.type)}
              </div>
              <p style={{ margin:'0 0 8px', fontSize:13, color:'#163828', lineHeight:1.65 }}>{dc.secondaryTool?.description}</p>
              {dc.secondaryTool?.sampleItems?.length > 0 && (
                <>
                  <p style={{ margin:'10px 0 6px', fontSize:11, fontWeight:700, color:'#4a6357', textTransform:'uppercase', letterSpacing:'0.06em' }}>Sample items / criteria</p>
                  {dc.secondaryTool.sampleItems.map((s, i) => <p key={i} style={{ margin:'0 0 4px', fontSize:12, color:'#163828' }}>{i+1}. {s}</p>)}
                </>
              )}
            </div>

            {/* Stats table */}
            <div style={{ background:'#fff', borderRadius:12, border:'1px solid rgba(45,106,79,0.12)', padding:'18px 22px' }}>
              <p style={sectionHead}><span style={iconBox}><BarChart2 size={13} color="#2d6a4f" /></span>Statistical Treatment</p>
              <div style={{ overflowX:'auto' }}>
                <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
                  <thead>
                    <tr style={{ background:'#d8f3dc' }}>
                      {['Formula / Treatment','Purpose','Interpretation'].map(h => (
                        <th key={h} style={{ padding:'8px 10px', textAlign:'left', fontWeight:700, color:'#1a3d2b', fontSize:11 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(dc.statisticalTreatment ?? []).map((row, i) => (
                      <tr key={i} style={{ borderBottom:'1px solid rgba(45,106,79,0.08)' }}>
                        <td style={{ padding:'8px 10px', fontWeight:600, color:'#1a3d2b', verticalAlign:'top' }}>{row.formula}</td>
                        <td style={{ padding:'8px 10px', color:'#163828', verticalAlign:'top' }}>{row.purpose}</td>
                        <td style={{ padding:'8px 10px', color:'#4a6357', verticalAlign:'top' }}>{row.interpretation}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Analysis approach */}
            {dc.analysisApproach && (
              <div style={{ background:'#fff', borderRadius:12, border:'1px solid rgba(45,106,79,0.12)', padding:'18px 22px' }}>
                <p style={{ margin:'0 0 10px', fontSize:13, fontWeight:700, color:'#1a3d2b' }}>Data Analysis Approach</p>
                <p style={{ margin:0, fontSize:13, color:'#163828', lineHeight:1.7, textAlign:'justify' }}>{dc.analysisApproach}</p>
              </div>
            )}
          </div>
        )}

        {error && <div style={{ background:'#fde8e8', border:'1px solid rgba(224,92,92,0.3)', borderRadius:8, padding:'10px 14px', fontSize:13, color:'#c0392b', fontWeight:500 }}>{error}</div>}
      </div>
    </ActionResearchShell>
  );
}
