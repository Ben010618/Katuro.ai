import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Sparkles, Loader2, ClipboardList, BarChart2, FlaskConical,
  MessageSquare, Eye, GraduationCap, FileText, CheckCircle2,
} from 'lucide-react';
import { useAuth }          from '../hooks/useAuth';
import { db }               from '../firebase';
import { doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { deductTokens }     from '../services/db';
import { generateDataCollection, generateResearchInstrument, THEME_LABELS } from '../services/actionResearchAI';
import { downloadResearchDocx } from '../services/actionResearchDocx';
import ActionResearchShell  from '../components/ActionResearchShell';

const sectionHead = { margin:'0 0 12px', fontSize:13, fontWeight:700, color:'#1a3d2b', display:'flex', alignItems:'center', gap:7 };
const iconBox = { width:26, height:26, borderRadius:7, background:'#d8f3dc', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 };
const tag = (t) => <span style={{ fontSize:10, fontWeight:700, background:'#f0f9f4', color:'#2d6a4f', borderRadius:20, padding:'2px 10px', marginRight:6 }}>{t}</span>;

// ── Instrument type config ────────────────────────────────────────────────────
const INSTRUMENT_TYPES = [
  {
    id: 'questionnaire',
    label: 'Questionnaire',
    Icon: ClipboardList,
    desc: 'Likert-scale survey for learner attitudes or satisfaction',
  },
  {
    id: 'interview-guide',
    label: 'Interview Guide',
    Icon: MessageSquare,
    desc: 'Semi-structured questions with probes for qualitative data',
  },
  {
    id: 'checklist',
    label: 'Observation Checklist',
    Icon: Eye,
    desc: 'Observable indicators rated on a 4-point scale',
  },
  {
    id: 'pretest-posttest',
    label: 'Pretest / Posttest',
    Icon: GraduationCap,
    desc: '20-item achievement test aligned to learning competencies',
  },
];

// ── Instrument renderers ──────────────────────────────────────────────────────

function RenderQuestionnaire({ data }) {
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
      <div style={{ background:'#1a3d2b', borderRadius:12, padding:'18px 22px' }}>
        <p style={{ margin:0, fontSize:15, fontWeight:700, color:'#fff' }}>{data.title}</p>
      </div>
      {data.instructions && (
        <div style={{ background:'#f5faf7', borderRadius:10, border:'1px solid rgba(45,106,79,0.12)', padding:'12px 16px' }}>
          <p style={{ margin:0, fontSize:13, color:'#163828', lineHeight:1.65 }}>{data.instructions}</p>
        </div>
      )}
      {(data.sections ?? []).map((section, si) => (
        <div key={si} style={{ background:'#fff', borderRadius:12, border:'1px solid rgba(45,106,79,0.12)', padding:'16px 20px' }}>
          <p style={{ margin:'0 0 10px', fontSize:13, fontWeight:700, color:'#1a3d2b' }}>{section.sectionTitle}</p>
          {section.scale && (
            <p style={{ margin:'0 0 12px', fontSize:11, fontWeight:600, color:'#1a3d2b', background:'#d8f3dc', padding:'6px 12px', borderRadius:6 }}>
              Scale: {section.scale}
            </p>
          )}
          {section.type === 'likert' ? (
            <div style={{ overflowX:'auto' }}>
              <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
                <thead>
                  <tr style={{ background:'#d8f3dc' }}>
                    <th style={{ padding:'8px 10px', textAlign:'left', fontWeight:700, color:'#1a3d2b' }}>Statement</th>
                    {['5','4','3','2','1'].map(n => (
                      <th key={n} style={{ padding:'8px 8px', textAlign:'center', fontWeight:700, color:'#1a3d2b', width:36 }}>{n}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(section.items ?? []).map((item, ii) => (
                    <tr key={ii} style={{ borderBottom:'1px solid rgba(45,106,79,0.08)', background: ii%2===0?'#fff':'#fafafa' }}>
                      <td style={{ padding:'8px 10px', color:'#163828', lineHeight:1.5 }}>{item.num}. {item.text}</td>
                      {['5','4','3','2','1'].map(n => (
                        <td key={n} style={{ padding:'8px', textAlign:'center' }}>
                          <div style={{ width:16, height:16, borderRadius:'50%', border:'1.5px solid rgba(45,106,79,0.3)', margin:'0 auto' }} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
              {(section.items ?? []).map((item, ii) => (
                <div key={ii}>
                  <p style={{ margin:'0 0 6px', fontSize:13, color:'#163828', fontWeight:500 }}>{item.num}. {item.text}</p>
                  {section.type === 'open' && (
                    <div style={{ borderBottom:'1px solid rgba(45,106,79,0.25)', paddingBottom:2, marginBottom:6 }}>
                      <div style={{ borderBottom:'1px solid rgba(45,106,79,0.15)', paddingBottom:2, marginBottom:6 }} />
                      <div style={{ borderBottom:'1px solid rgba(45,106,79,0.15)', paddingBottom:2 }} />
                    </div>
                  )}
                  {section.type === 'profile' && (
                    <div style={{ borderBottom:'1px solid rgba(45,106,79,0.25)', paddingBottom:2 }} />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function RenderInterviewGuide({ data }) {
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
      <div style={{ background:'#1a3d2b', borderRadius:12, padding:'18px 22px' }}>
        <p style={{ margin:'0 0 4px', fontSize:15, fontWeight:700, color:'#fff' }}>{data.title}</p>
        {data.estimatedTime && <p style={{ margin:0, fontSize:11, color:'rgba(255,255,255,0.65)' }}>Estimated time: {data.estimatedTime}</p>}
      </div>
      {data.purpose && (
        <div style={{ background:'#f5faf7', borderRadius:10, border:'1px solid rgba(45,106,79,0.12)', padding:'12px 16px' }}>
          <p style={{ margin:'0 0 3px', fontSize:10, fontWeight:700, color:'#4a6357', textTransform:'uppercase', letterSpacing:'0.06em' }}>Purpose</p>
          <p style={{ margin:0, fontSize:13, color:'#163828', lineHeight:1.6 }}>{data.purpose}</p>
        </div>
      )}
      {data.introduction && (
        <div style={{ background:'#fffbeb', border:'1px solid rgba(245,158,11,0.25)', borderRadius:10, padding:'12px 16px' }}>
          <p style={{ margin:'0 0 3px', fontSize:10, fontWeight:700, color:'#92400e', textTransform:'uppercase', letterSpacing:'0.06em' }}>Opening Script</p>
          <p style={{ margin:0, fontSize:13, color:'#78350f', lineHeight:1.65, fontStyle:'italic' }}>{data.introduction}</p>
        </div>
      )}
      {(data.sections ?? []).map((section, si) => (
        <div key={si} style={{ background:'#fff', borderRadius:12, border:'1px solid rgba(45,106,79,0.12)', padding:'16px 20px' }}>
          <p style={{ margin:'0 0 14px', fontSize:13, fontWeight:700, color:'#1a3d2b' }}>{section.sectionTitle}</p>
          <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
            {(section.questions ?? []).map((q, qi) => (
              <div key={qi} style={{ paddingLeft:12, borderLeft:'3px solid #52b788' }}>
                <p style={{ margin:'0 0 8px', fontSize:13, fontWeight:600, color:'#0d2218', lineHeight:1.55 }}>
                  <span style={{ color:'#2d6a4f', fontWeight:700, marginRight:5 }}>Q{q.num}.</span>{q.mainQuestion}
                </p>
                {q.probes?.length > 0 && (
                  <div>
                    <p style={{ margin:'0 0 4px', fontSize:10, fontWeight:700, color:'#4a6357', textTransform:'uppercase', letterSpacing:'0.05em' }}>Probing questions:</p>
                    {q.probes.map((probe, pi) => (
                      <p key={pi} style={{ margin:'0 0 2px', fontSize:12, color:'#4a6357', paddingLeft:10 }}>• {probe}</p>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
      {data.closing && (
        <div style={{ background:'#f0f9f4', border:'1px solid rgba(45,106,79,0.15)', borderRadius:10, padding:'12px 16px' }}>
          <p style={{ margin:'0 0 3px', fontSize:10, fontWeight:700, color:'#2d6a4f', textTransform:'uppercase', letterSpacing:'0.06em' }}>Closing Statement</p>
          <p style={{ margin:0, fontSize:13, color:'#163828', lineHeight:1.65, fontStyle:'italic' }}>{data.closing}</p>
        </div>
      )}
    </div>
  );
}

function RenderChecklist({ data }) {
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
      <div style={{ background:'#1a3d2b', borderRadius:12, padding:'18px 22px' }}>
        <p style={{ margin:0, fontSize:15, fontWeight:700, color:'#fff' }}>{data.title}</p>
      </div>
      {data.purpose && (
        <div style={{ background:'#f5faf7', borderRadius:10, border:'1px solid rgba(45,106,79,0.12)', padding:'12px 16px' }}>
          <p style={{ margin:'0 0 3px', fontSize:10, fontWeight:700, color:'#4a6357', textTransform:'uppercase', letterSpacing:'0.06em' }}>Purpose</p>
          <p style={{ margin:0, fontSize:13, color:'#163828', lineHeight:1.6 }}>{data.purpose}</p>
        </div>
      )}
      {data.instructions && (
        <div style={{ background:'#f5faf7', borderRadius:10, border:'1px solid rgba(45,106,79,0.12)', padding:'12px 16px' }}>
          <p style={{ margin:'0 0 3px', fontSize:10, fontWeight:700, color:'#4a6357', textTransform:'uppercase', letterSpacing:'0.06em' }}>Instructions</p>
          <p style={{ margin:0, fontSize:13, color:'#163828', lineHeight:1.6 }}>{data.instructions}</p>
        </div>
      )}
      {data.scale && (
        <div style={{ background:'#d8f3dc', borderRadius:8, padding:'8px 14px' }}>
          <p style={{ margin:0, fontSize:12, fontWeight:600, color:'#1a3d2b' }}>Rating Scale: {data.scale}</p>
        </div>
      )}
      {(data.sections ?? []).map((section, si) => (
        <div key={si} style={{ background:'#fff', borderRadius:12, border:'1px solid rgba(45,106,79,0.12)', padding:'16px 20px' }}>
          <p style={{ margin:'0 0 12px', fontSize:13, fontWeight:700, color:'#1a3d2b' }}>{section.sectionTitle}</p>
          <div style={{ overflowX:'auto' }}>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
              <thead>
                <tr style={{ background:'#d8f3dc' }}>
                  <th style={{ padding:'8px 8px', textAlign:'center', fontWeight:700, color:'#1a3d2b', width:36 }}>No.</th>
                  <th style={{ padding:'8px 10px', textAlign:'left', fontWeight:700, color:'#1a3d2b' }}>Indicator</th>
                  {['4','3','2','1'].map(n => (
                    <th key={n} style={{ padding:'8px 8px', textAlign:'center', fontWeight:700, color:'#1a3d2b', width:36 }}>{n}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(section.indicators ?? []).map((item, ii) => (
                  <tr key={ii} style={{ borderBottom:'1px solid rgba(45,106,79,0.08)', background: ii%2===0?'#fff':'#fafafa' }}>
                    <td style={{ padding:'8px', textAlign:'center', color:'#4a6357', fontWeight:600 }}>{item.num}</td>
                    <td style={{ padding:'8px 10px', color:'#163828', lineHeight:1.5 }}>{item.indicator}</td>
                    {['4','3','2','1'].map(n => (
                      <td key={n} style={{ padding:'8px', textAlign:'center' }}>
                        <div style={{ width:15, height:15, borderRadius:3, border:'1.5px solid rgba(45,106,79,0.3)', margin:'0 auto' }} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
      {data.scoringGuide && (
        <div style={{ background:'#f5faf7', borderRadius:10, border:'1px solid rgba(45,106,79,0.12)', padding:'12px 16px' }}>
          <p style={{ margin:'0 0 3px', fontSize:10, fontWeight:700, color:'#4a6357', textTransform:'uppercase', letterSpacing:'0.06em' }}>Scoring Guide</p>
          <p style={{ margin:0, fontSize:13, color:'#163828', lineHeight:1.6 }}>{data.scoringGuide}</p>
        </div>
      )}
    </div>
  );
}

function RenderPretest({ data }) {
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
      <div style={{ background:'#1a3d2b', borderRadius:12, padding:'18px 22px' }}>
        <p style={{ margin:'0 0 4px', fontSize:15, fontWeight:700, color:'#fff' }}>{data.title}</p>
        {data.timeAllotment && <p style={{ margin:0, fontSize:11, color:'rgba(255,255,255,0.65)' }}>Time allotment: {data.timeAllotment}</p>}
      </div>
      {data.instructions && (
        <div style={{ background:'#f5faf7', borderRadius:10, border:'1px solid rgba(45,106,79,0.12)', padding:'12px 16px' }}>
          <p style={{ margin:0, fontSize:13, color:'#163828', lineHeight:1.6, fontWeight:500 }}>{data.instructions}</p>
        </div>
      )}
      <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
        {(data.items ?? []).map((item, ii) => (
          <div key={ii} style={{ background:'#fff', borderRadius:10, border:'1px solid rgba(45,106,79,0.12)', padding:'14px 18px' }}>
            <p style={{ margin:'0 0 10px', fontSize:13, fontWeight:600, color:'#0d2218', lineHeight:1.55 }}>
              <span style={{ fontFamily:'"DM Mono", monospace', color:'#2d6a4f', marginRight:6 }}>{item.num}.</span>
              {item.question}
            </p>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:6 }}>
              {Object.entries(item.choices || {}).map(([letter, text]) => {
                const isAns = item.answer === letter;
                return (
                  <div key={letter} style={{
                    display:'flex', alignItems:'flex-start', gap:8, padding:'7px 10px',
                    borderRadius:7, background: isAns ? '#d8f3dc' : '#f5faf7',
                    border: `1px solid ${isAns ? 'rgba(45,106,79,0.3)' : 'transparent'}`,
                  }}>
                    <span style={{ fontFamily:'"DM Mono", monospace', fontWeight:700, fontSize:11, color: isAns ? '#1a3d2b' : '#4a6357', flexShrink:0, marginTop:1 }}>{letter}.</span>
                    <span style={{ fontSize:12, color: isAns ? '#0d2218' : '#4a6357', fontWeight: isAns ? 600 : 400 }}>{text}</span>
                  </div>
                );
              })}
            </div>
            {item.competency && (
              <p style={{ margin:'8px 0 0', fontSize:10, color:'#9bb8ac', fontStyle:'italic' }}>Competency: {item.competency}</p>
            )}
          </div>
        ))}
      </div>
      {data.answerKey?.length > 0 && (
        <div style={{ background:'#1a3d2b', borderRadius:12, padding:'18px 22px' }}>
          <p style={{ margin:'0 0 12px', fontSize:13, fontWeight:700, color:'#fff' }}>Answer Key</p>
          <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
            {data.answerKey.map((ans, i) => (
              <div key={i} style={{ background:'rgba(255,255,255,0.1)', borderRadius:6, padding:'4px 10px', textAlign:'center', minWidth:38 }}>
                <p style={{ margin:0, fontSize:10, color:'rgba(255,255,255,0.55)' }}>{i+1}</p>
                <p style={{ margin:0, fontSize:13, fontWeight:700, color:'#52b788' }}>{ans}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function InstrumentDisplay({ type, data }) {
  if (!data) return null;
  if (type === 'questionnaire')    return <RenderQuestionnaire data={data} />;
  if (type === 'interview-guide')  return <RenderInterviewGuide data={data} />;
  if (type === 'checklist')        return <RenderChecklist data={data} />;
  if (type === 'pretest-posttest') return <RenderPretest data={data} />;
  return null;
}

// ── Main component ────────────────────────────────────────────────────────────

export default function ActionResearchPhase5() {
  const { docId }  = useParams();
  const { user }   = useAuth();
  const navigate   = useNavigate();

  const [docData,             setDocData]             = useState(null);
  const [pageLoading,         setPageLoading]         = useState(true);
  const [dataCollection,      setDataCollection]      = useState(null);
  const [generating,          setGenerating]          = useState(false);
  const [saving,              setSaving]              = useState(false);
  const [downloading,         setDownloading]         = useState(false);
  const [error,               setError]               = useState('');

  // Instrument state
  const [instrumentType,       setInstrumentType]       = useState('questionnaire');
  const [aiRecommended,        setAiRecommended]        = useState(null);
  const [instrument,           setInstrument]           = useState(null);
  const [generatingInstrument, setGeneratingInstrument] = useState(false);

  const VALID_TYPES = INSTRUMENT_TYPES.map(t => t.id);

  useEffect(() => {
    if (!user?.uid || !docId) return;
    getDoc(doc(db, 'teachers', user.uid, 'actionResearch', docId)).then(snap => {
      if (snap.exists()) {
        const d = { id: snap.id, ...snap.data() };
        setDocData(d);
        if (d.dataCollection) {
          setDataCollection(d.dataCollection);
          const rec = d.dataCollection.recommendedInstrument;
          if (rec && VALID_TYPES.includes(rec)) {
            setAiRecommended(rec);
            setInstrumentType(rec);
          }
        }
        if (d.instrument)     setInstrument(d.instrument);
        if (d.instrumentType) setInstrumentType(d.instrumentType);
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
      const rec = result.recommendedInstrument;
      if (rec && VALID_TYPES.includes(rec)) {
        setAiRecommended(rec);
        setInstrumentType(rec);
      }
    } catch (err) {
      setError(err.message || 'Failed to generate. Please try again.');
    } finally { setGenerating(false); }
  }

  async function handleGenerateInstrument() {
    if (!user?.uid || !docData) return;
    setGeneratingInstrument(true); setError('');
    try {
      await deductTokens(user.uid, 'action-research-instrument', 5);
      const result = await generateResearchInstrument({
        instrumentType,
        title:             docData.selectedTitle,
        subjectArea:       docData.subjectArea,
        gradeLevel:        docData.gradeLevel,
        selectedQuestions: docData.selectedQuestions,
        problemText:       docData.problemText,
      });
      setInstrument(result);
      await updateDoc(doc(db, 'teachers', user.uid, 'actionResearch', docId), {
        instrument: result, instrumentType, updatedAt: serverTimestamp(),
      });
    } catch (err) {
      setError(err.message || 'Failed to generate instrument. Please try again.');
    } finally { setGeneratingInstrument(false); }
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

        {/* ── Step 1: Data Collection Methodology ─────────────────────────── */}
        <div style={{ background:'#fff', borderRadius:14, border:'1px solid rgba(45,106,79,0.12)', padding:'22px 24px' }}>
          <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:4 }}>
            <div style={{ width:26, height:26, borderRadius:'50%', background:'#2d6a4f', display:'grid', placeItems:'center', flexShrink:0 }}>
              <span style={{ fontSize:12, fontWeight:700, color:'#fff' }}>1</span>
            </div>
            <p style={{ margin:0, fontSize:15, fontWeight:700, color:'#0d2218' }}>Data Collection Methodology</p>
          </div>
          <p style={{ margin:'0 0 16px', fontSize:13, color:'#4a6357', lineHeight:1.5, paddingLeft:36 }}>AI recommends the best data collection tools, statistical formulas, and analysis approach for your research.</p>
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

        {/* Methodology results */}
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

        {/* ── Step 2: Research Instrument Generator ─────────────────────────── */}
        <div style={{
          background:'#fff', borderRadius:14,
          border:'2px solid rgba(45,106,79,0.15)', padding:'22px 24px',
        }}>
          {/* Section header */}
          <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:4 }}>
            <div style={{ width:26, height:26, borderRadius:'50%', background:'#2d6a4f', display:'grid', placeItems:'center', flexShrink:0 }}>
              <span style={{ fontSize:12, fontWeight:700, color:'#fff' }}>2</span>
            </div>
            <div style={{ flex:1 }}>
              <p style={{ margin:0, fontSize:15, fontWeight:700, color:'#0d2218' }}>Auto-Generate Research Instruments</p>
              <p style={{ margin:0, fontSize:11, color:'#4a6357' }}>
                {aiRecommended
                  ? 'AI suggests and highlights the best instrument below — choose and generate.'
                  : 'AI drafts a complete, ready-to-use instrument — select one type below, then generate.'}
              </p>
            </div>
            {instrument && (
              <span style={{ marginLeft:'auto', background:'#d8f3dc', color:'#1a3d2b', borderRadius:20, padding:'3px 10px', fontSize:10, fontWeight:700, display:'flex', alignItems:'center', gap:5, flexShrink:0 }}>
                <CheckCircle2 size={11} /> Generated
              </span>
            )}
          </div>

          <div style={{ borderTop:'1px solid rgba(45,106,79,0.1)', margin:'16px 0' }} />

          {/* Type selector — 2×2 grid */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:18 }}>
            {INSTRUMENT_TYPES.map(({ id, label, Icon, desc }) => {
              const active     = instrumentType === id;
              const isAiPick   = aiRecommended === id;
              return (
                <button
                  key={id}
                  onClick={() => setInstrumentType(id)}
                  style={{
                    textAlign:'left', fontFamily:'inherit', cursor:'pointer',
                    background: active ? '#f0f9f4' : '#fafafa',
                    border: active ? '2px solid #2d6a4f' : '1.5px solid rgba(45,106,79,0.15)',
                    borderRadius:10, padding:'13px 14px',
                    transition:'border 0.15s, background 0.15s', position:'relative',
                  }}
                  onMouseEnter={e => { if (!active) e.currentTarget.style.background='#f5faf7'; }}
                  onMouseLeave={e => { if (!active) e.currentTarget.style.background='#fafafa'; }}
                >
                  {/* AI Recommended badge — top-left */}
                  {isAiPick && (
                    <span style={{
                      position:'absolute', top:8, left:10,
                      background:'#e8a320', color:'#fff',
                      fontSize:9, fontWeight:700, letterSpacing:'0.05em',
                      borderRadius:20, padding:'2px 7px',
                      display:'flex', alignItems:'center', gap:3,
                    }}>
                      <Sparkles size={8} /> AI Recommended
                    </span>
                  )}
                  {/* Selected check — top-right */}
                  {active && (
                    <div style={{ position:'absolute', top:8, right:8, width:16, height:16, borderRadius:'50%', background:'#2d6a4f', display:'grid', placeItems:'center' }}>
                      <CheckCircle2 size={10} color="#fff" />
                    </div>
                  )}
                  <div style={{ display:'flex', alignItems:'center', gap:7, marginBottom:5, marginTop: isAiPick ? 18 : 0 }}>
                    <Icon size={14} color={active ? '#2d6a4f' : '#4a6357'} />
                    <p style={{ margin:0, fontSize:13, fontWeight:700, color: active ? '#1a3d2b' : '#0d2218' }}>{label}</p>
                  </div>
                  <p style={{ margin:0, fontSize:11, color:'#4a6357', lineHeight:1.5 }}>{desc}</p>
                </button>
              );
            })}
          </div>

          <button
            onClick={handleGenerateInstrument}
            disabled={generatingInstrument}
            style={{
              display:'flex', alignItems:'center', gap:7,
              background: generatingInstrument ? 'rgba(45,106,79,0.35)' : '#2d6a4f',
              color:'#fff', border:'none', borderRadius:8, padding:'10px 18px',
              fontSize:13, fontWeight:600,
              cursor: generatingInstrument ? 'not-allowed' : 'pointer', fontFamily:'inherit',
            }}
          >
            {generatingInstrument
              ? <><Loader2 size={13} style={{ animation:'spin 1s linear infinite' }} /> Generating instrument…</>
              : <><Sparkles size={13} /> {instrument ? 'Regenerate' : 'Generate'} {INSTRUMENT_TYPES.find(t => t.id === instrumentType)?.label} (5 tokens)</>}
          </button>
          {generatingInstrument && (
            <p style={{ margin:'10px 0 0', fontSize:12, color:'#4a6357' }}>Building your complete instrument — this takes about 10–20 seconds…</p>
          )}
        </div>

        {/* Instrument output */}
        {instrument && (
          <div style={{ background:'#f5faf7', borderRadius:14, border:'1px solid rgba(45,106,79,0.12)', padding:'20px 22px' }}>
            <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:16 }}>
              {(() => { const t = INSTRUMENT_TYPES.find(x => x.id === instrumentType); return t ? <t.Icon size={14} color="#2d6a4f" /> : null; })()}
              <p style={{ margin:0, fontSize:13, fontWeight:700, color:'#1a3d2b' }}>
                {INSTRUMENT_TYPES.find(t => t.id === instrumentType)?.label}
              </p>
              <span style={{ fontSize:10, fontWeight:600, color:'#4a6357', background:'#d8f3dc', borderRadius:20, padding:'2px 8px', marginLeft:4 }}>
                Ready to use
              </span>
            </div>
            <InstrumentDisplay type={instrumentType} data={instrument} />
          </div>
        )}

        {error && <div style={{ background:'#fde8e8', border:'1px solid rgba(224,92,92,0.3)', borderRadius:8, padding:'10px 14px', fontSize:13, color:'#c0392b', fontWeight:500 }}>{error}</div>}
      </div>
    </ActionResearchShell>
  );
}
