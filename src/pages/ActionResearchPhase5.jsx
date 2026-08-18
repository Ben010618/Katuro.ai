import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Sparkles, Loader2, ClipboardList, BarChart2, FlaskConical,
  MessageSquare, Eye, GraduationCap, CheckCircle2,
} from 'lucide-react';
import { useAuth }          from '../hooks/useAuth';
import { db }               from '../firebase';
import { doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { deductTokens, refundTokens } from '../services/db';
import { generateDataCollection, generateResearchInstrument, THEME_LABELS } from '../services/actionResearchAI';
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

const tag = (t) => (
  <span style={{
    fontSize: 11,
    fontWeight: 700,
    background: 'var(--kt-card-2, #F4EDDB)',
    border: '1px solid var(--kt-border, #DCD0AE)',
    color: 'var(--kt-chalkboard, #1F3A2E)',
    borderRadius: 3,
    padding: '2px 8px',
    marginRight: 6,
    fontFamily: 'var(--kt-font-mono, monospace)',
  }}>
    {t}
  </span>
);

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
        <div style={{ background:'var(--kt-surface)', borderRadius:10, border:'1px solid var(--kt-border)', padding:'12px 16px' }}>
          <p style={{ margin:0, fontSize:13, color:'var(--kt-text-primary)', lineHeight:1.65 }}>{data.instructions}</p>
        </div>
      )}
      {(data.sections ?? []).map((section, si) => (
        <div key={si} style={{ background:'var(--kt-card)', borderRadius:12, border:'1px solid var(--kt-border)', padding:'16px 20px' }}>
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
                    <tr key={ii} style={{ borderBottom:'1px solid rgba(45,106,79,0.08)', background: ii%2===0?'var(--kt-card)':'var(--kt-card-2)' }}>
                      <td style={{ padding:'8px 10px', color:'var(--kt-text-primary)', lineHeight:1.5 }}>{item.num}. {item.text}</td>
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
                  <p style={{ margin:'0 0 6px', fontSize:13, color:'var(--kt-text-primary)', fontWeight:500 }}>{item.num}. {item.text}</p>
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
        <div style={{ background:'var(--kt-surface)', borderRadius:10, border:'1px solid var(--kt-border)', padding:'12px 16px' }}>
          <p style={{ margin:'0 0 3px', fontSize:10, fontWeight:700, color:'var(--kt-text-secondary)', textTransform:'uppercase', letterSpacing:'0.06em' }}>Purpose</p>
          <p style={{ margin:0, fontSize:13, color:'var(--kt-text-primary)', lineHeight:1.6 }}>{data.purpose}</p>
        </div>
      )}
      {data.introduction && (
        <div style={{ background:'#fffbeb', border:'1px solid rgba(245,158,11,0.25)', borderRadius:10, padding:'12px 16px' }}>
          <p style={{ margin:'0 0 3px', fontSize:10, fontWeight:700, color:'#92400e', textTransform:'uppercase', letterSpacing:'0.06em' }}>Opening Script</p>
          <p style={{ margin:0, fontSize:13, color:'#78350f', lineHeight:1.65, fontStyle:'italic' }}>{data.introduction}</p>
        </div>
      )}
      {(data.sections ?? []).map((section, si) => (
        <div key={si} style={{ background:'var(--kt-card)', borderRadius:12, border:'1px solid var(--kt-border)', padding:'16px 20px' }}>
          <p style={{ margin:'0 0 14px', fontSize:13, fontWeight:700, color:'#1a3d2b' }}>{section.sectionTitle}</p>
          <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
            {(section.questions ?? []).map((q, qi) => (
              <div key={qi} style={{ paddingLeft:12, borderLeft:'3px solid #52b788' }}>
                <p style={{ margin:'0 0 8px', fontSize:13, fontWeight:600, color:'var(--kt-text-primary)', lineHeight:1.55 }}>
                  <span style={{ color:'#2d6a4f', fontWeight:700, marginRight:5 }}>Q{q.num}.</span>{q.mainQuestion}
                </p>
                {q.probes?.length > 0 && (
                  <div>
                    <p style={{ margin:'0 0 4px', fontSize:10, fontWeight:700, color:'var(--kt-text-secondary)', textTransform:'uppercase', letterSpacing:'0.05em' }}>Probing questions:</p>
                    {q.probes.map((probe, pi) => (
                      <p key={pi} style={{ margin:'0 0 2px', fontSize:12, color:'var(--kt-text-secondary)', paddingLeft:10 }}>• {probe}</p>
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
        <div style={{ background:'var(--kt-surface)', borderRadius:10, border:'1px solid var(--kt-border)', padding:'12px 16px' }}>
          <p style={{ margin:'0 0 3px', fontSize:10, fontWeight:700, color:'var(--kt-text-secondary)', textTransform:'uppercase', letterSpacing:'0.06em' }}>Purpose</p>
          <p style={{ margin:0, fontSize:13, color:'var(--kt-text-primary)', lineHeight:1.6 }}>{data.purpose}</p>
        </div>
      )}
      {data.instructions && (
        <div style={{ background:'var(--kt-surface)', borderRadius:10, border:'1px solid var(--kt-border)', padding:'12px 16px' }}>
          <p style={{ margin:'0 0 3px', fontSize:10, fontWeight:700, color:'var(--kt-text-secondary)', textTransform:'uppercase', letterSpacing:'0.06em' }}>Instructions</p>
          <p style={{ margin:0, fontSize:13, color:'var(--kt-text-primary)', lineHeight:1.6 }}>{data.instructions}</p>
        </div>
      )}
      {data.scale && (
        <div style={{ background:'#d8f3dc', borderRadius:8, padding:'8px 14px' }}>
          <p style={{ margin:0, fontSize:12, fontWeight:600, color:'#1a3d2b' }}>Rating Scale: {data.scale}</p>
        </div>
      )}
      {(data.sections ?? []).map((section, si) => (
        <div key={si} style={{ background:'var(--kt-card)', borderRadius:12, border:'1px solid var(--kt-border)', padding:'16px 20px' }}>
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
                  <tr key={ii} style={{ borderBottom:'1px solid rgba(45,106,79,0.08)', background: ii%2===0?'var(--kt-card)':'var(--kt-card-2)' }}>
                    <td style={{ padding:'8px', textAlign:'center', color:'var(--kt-text-secondary)', fontWeight:600 }}>{item.num}</td>
                    <td style={{ padding:'8px 10px', color:'var(--kt-text-primary)', lineHeight:1.5 }}>{item.indicator}</td>
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
        <div style={{ background:'var(--kt-surface)', borderRadius:10, border:'1px solid var(--kt-border)', padding:'12px 16px' }}>
          <p style={{ margin:'0 0 3px', fontSize:10, fontWeight:700, color:'var(--kt-text-secondary)', textTransform:'uppercase', letterSpacing:'0.06em' }}>Scoring Guide</p>
          <p style={{ margin:0, fontSize:13, color:'var(--kt-text-primary)', lineHeight:1.6 }}>{data.scoringGuide}</p>
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
        <div style={{ background:'var(--kt-surface)', borderRadius:10, border:'1px solid var(--kt-border)', padding:'12px 16px' }}>
          <p style={{ margin:0, fontSize:13, color:'var(--kt-text-primary)', lineHeight:1.6, fontWeight:500 }}>{data.instructions}</p>
        </div>
      )}
      <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
        {(data.items ?? []).map((item, ii) => (
          <div key={ii} style={{ background:'var(--kt-card)', borderRadius:10, border:'1px solid var(--kt-border)', padding:'14px 18px' }}>
            <p style={{ margin:'0 0 10px', fontSize:13, fontWeight:600, color:'var(--kt-text-primary)', lineHeight:1.55 }}>
              <span style={{ fontFamily:'"DM Mono", monospace', color:'#2d6a4f', marginRight:6 }}>{item.num}.</span>
              {item.question}
            </p>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:6 }}>
              {Object.entries(item.choices || {}).map(([letter, text]) => {
                const isAns = item.answer === letter;
                return (
                  <div key={letter} style={{
                    display:'flex', alignItems:'flex-start', gap:8, padding:'7px 10px',
                    borderRadius:7, background: isAns ? '#d8f3dc' : 'var(--kt-surface)',
                    border: `1px solid ${isAns ? 'rgba(45,106,79,0.3)' : 'transparent'}`,
                  }}>
                    <span style={{ fontFamily:'"DM Mono", monospace', fontWeight:700, fontSize:11, color: isAns ? '#1a3d2b' : 'var(--kt-text-secondary)', flexShrink:0, marginTop:1 }}>{letter}.</span>
                    <span style={{ fontSize:12, color: isAns ? 'var(--kt-text-primary)' : 'var(--kt-text-secondary)', fontWeight: isAns ? 600 : 400 }}>{text}</span>
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
  const { user, freeMode } = useAuth();
  const navigate   = useNavigate();

  const [docData,             setDocData]             = useState(null);
  const [pageLoading,         setPageLoading]         = useState(true);
  const [dataCollection,      setDataCollection]      = useState(null);
  const [generating,          setGenerating]          = useState(false);
  const [saving,              setSaving]              = useState(false);
  const [downloading,         setDownloading]         = useState(false);
  const [error,               setError]               = useState('');
  const [statusMsg,           setStatusMsg]           = useState('');

  // Instrument state
  const [instrumentType,       setInstrumentType]       = useState('questionnaire');
  const [aiRecommended,        setAiRecommended]        = useState(null);
  const [instrument,           setInstrument]           = useState(null);
  const [generatingInstrument, setGeneratingInstrument] = useState(false);
  const [instrumentStatusMsg,  setInstrumentStatusMsg]  = useState('');

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
    if (!user?.uid || !docData || generating) return;
    setGenerating(true); setError(''); setStatusMsg('');
    let elapsedMs;
    let tokensDeducted = false;
    try {
      await deductTokens(user.uid, 'action-research-datacollection', 5);
      tokensDeducted = true;
      elapsedMs = startTimer();

      let result;
      let lastErr;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          result = await generateDataCollection({
            title: docData.selectedTitle, selectedQuestions: docData.selectedQuestions,
            beraTheme: docData.beraTheme, subjectArea: docData.subjectArea,
            gradeLevel: docData.gradeLevel,
            isRetry: attempt > 0,
          });
          break;
        } catch (err) {
          lastErr = err;
          console.warn(`generateDataCollection attempt ${attempt + 1} failed:`, err);
          if (err.dailyLimit) break; // won't clear up by retrying — surface immediately
          if (attempt < 2) {
            const wait = err.status === 429
              ? Math.min((err.retryAfter || 30) * 1000, 30_000)
              : 6000 + attempt * 3000;
            setStatusMsg(`Due to high demand, generation may be slow — retrying in ${Math.round(wait / 1000)}s…`);
            await new Promise(r => setTimeout(r, wait));
            setStatusMsg('Re-generating your data collection plan…');
          }
        }
      }
      if (!result) throw lastErr || new Error('Failed to generate. Please try again.');

      setDataCollection(result);
      const rec = result.recommendedInstrument;
      if (rec && VALID_TYPES.includes(rec)) {
        setAiRecommended(rec);
        setInstrumentType(rec);
      }
      trackEvent(user.uid, 'action_research_phase5_generated', { subject: docData.subjectArea, grade: docData.gradeLevel });
      trackGeneration(user.uid, 'ar_phase5_data', { success: true, durationMs: elapsedMs() });
    } catch (err) {
      setError(
        err.status === 429
          ? 'Rate limit reached — wait a moment then try again.'
          : (err.message || 'Failed to generate. Please try again.')
      );
      if (tokensDeducted) {
        refundTokens(user.uid, 'action-research-datacollection', 5).catch(e => console.error('Token refund failed:', e));
      }
      if (elapsedMs) {
        trackGeneration(user.uid, 'ar_phase5_data', { success: false, durationMs: elapsedMs(), error: err.message });
      }
    } finally { setGenerating(false); }
  }

  async function handleGenerateInstrument() {
    if (!user?.uid || !docData || generatingInstrument) return;
    setGeneratingInstrument(true); setError(''); setInstrumentStatusMsg('Building your complete instrument — this takes about 10–20 seconds…');
    let elapsedMs;
    let tokensDeducted = false;
    try {
      await deductTokens(user.uid, 'action-research-instrument', 5);
      tokensDeducted = true;
      elapsedMs = startTimer();

      let result;
      let lastErr;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          result = await generateResearchInstrument({
            instrumentType,
            title:             docData.selectedTitle,
            subjectArea:       docData.subjectArea,
            gradeLevel:        docData.gradeLevel,
            selectedQuestions: docData.selectedQuestions,
            problemText:       docData.problemText,
            isRetry:           attempt > 0,
          });
          break;
        } catch (err) {
          lastErr = err;
          console.warn(`generateResearchInstrument attempt ${attempt + 1} failed:`, err);
          if (err.dailyLimit) break; // won't clear up by retrying — surface immediately
          if (attempt < 2) {
            const wait = err.status === 429
              ? Math.min((err.retryAfter || 30) * 1000, 30_000)
              : 6000 + attempt * 3000;
            setInstrumentStatusMsg(`Due to high demand, generation may be slow — retrying in ${Math.round(wait / 1000)}s…`);
            await new Promise(r => setTimeout(r, wait));
            setInstrumentStatusMsg('Re-building your instrument…');
          }
        }
      }
      if (!result) throw lastErr || new Error('Failed to generate instrument. Please try again.');

      setInstrument(result);
      await updateDoc(doc(db, 'teachers', user.uid, 'actionResearch', docId), {
        instrument: result, instrumentType, updatedAt: serverTimestamp(),
      });
      trackGeneration(user.uid, 'ar_phase5_instrument', { success: true, durationMs: elapsedMs() });
    } catch (err) {
      setError(
        err.status === 429
          ? 'Rate limit reached — wait a moment then try again.'
          : (err.message || 'Failed to generate instrument. Please try again.')
      );
      if (tokensDeducted) {
        refundTokens(user.uid, 'action-research-instrument', 5).catch(e => console.error('Token refund failed:', e));
      }
      if (elapsedMs) {
        trackGeneration(user.uid, 'ar_phase5_instrument', { success: false, durationMs: elapsedMs(), error: err.message });
      }
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
    } catch {
      setError('Failed to save. Please try again.');
    } finally { setSaving(false); }
  }

  async function handleDownload() {
    if (!docData) return;
    setDownloading(true);
    try {
      const { downloadResearchDocx } = await import('../services/actionResearchDocx');
      await downloadResearchDocx({ ...docData, dataCollection }, user.displayName ?? '');
    } finally { setDownloading(false); }
  }

  if (pageLoading) return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'var(--kt-surface)' }}>
      <Loader2 size={24} color="#2d6a4f" style={{ animation:'spin 1s linear infinite' }} />
    </div>
  );

  const themeName = THEME_LABELS[docData?.beraTheme] ?? docData?.beraTheme;
  const dc        = dataCollection;

  return (
    <ActionResearchShell
      phase={5}
      canNext={!!dc}
      nextLabel="Susunod: Findings & Report"
      onNext={handleNext}
      nextLoading={saving}
      onDownload={dc ? handleDownload : undefined}
      downloadLoading={downloading}
      onBack={() => navigate(`/action-research/phase-4/${docId}`)}
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

        {/* ── Step 1: Methodology Generator ─────────────────────────────────── */}
        <div style={{
          background: 'var(--kt-card, #FBF7EC)',
          borderRadius: 'var(--kt-radius-md, 6px)',
          border: '1px solid var(--kt-border, #DCD0AE)',
          padding: '24px',
          boxShadow: '0 2px 6px rgba(38, 33, 25, 0.04)',
        }}>
          <h2 style={{ margin: '0 0 4px', fontSize: 18, fontWeight: 700, color: 'var(--kt-text-primary, #262119)', fontFamily: 'var(--kt-font-heading, "Bitter", serif)' }}>
            1. Metodolohiya at Pangangalap ng Datos (Data Collection Plan)
          </h2>
          <p style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--kt-text-secondary, #6E6455)', lineHeight: 1.5 }}>
            Bumubuo ang AI ng primary at secondary collection tools, statistical treatment, at paraan ng pagsusuri ng datos alinsunod sa DepEd research guidelines.
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
                <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> Bumubuo ng Metodolohiya…
              </>
            ) : (
              <>
                <Sparkles size={14} /> {dc ? 'Muling Bumuo (Regenerate Plan)' : 'Bumuo ng Data Collection Plan'}{!freeMode && ' (5 tokens)'}
              </>
            )}
          </button>
          {generating && statusMsg && (
            <p style={{ margin: '10px 0 0', fontSize: 12.5, color: 'var(--kt-text-secondary, #6E6455)' }}>
              {statusMsg}
            </p>
          )}
        </div>

        {/* Methodology results */}
        {dc && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* Primary tool */}
            <div style={{
              background: 'var(--kt-card, #FBF7EC)',
              borderRadius: 'var(--kt-radius-md, 6px)',
              border: '1px solid var(--kt-border, #DCD0AE)',
              padding: '20px 24px',
              boxShadow: '0 2px 6px rgba(38, 33, 25, 0.04)',
            }}>
              <p style={sectionHead}><span style={iconBox}><ClipboardList size={14} color="var(--kt-chalkboard, #1F3A2E)" /></span>Pangunahing Instrumento (Primary Data Collection Tool)</p>
              <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                {dc.primaryTool?.name && tag(dc.primaryTool.name)}
                {dc.primaryTool?.type && tag(dc.primaryTool.type)}
              </div>
              <p style={{ margin: '0 0 8px', fontSize: 13.5, color: 'var(--kt-text-primary, #262119)', lineHeight: 1.65 }}>{dc.primaryTool?.description}</p>
              {dc.primaryTool?.rationale && <p style={{ margin: '0 0 8px', fontSize: 13, color: 'var(--kt-text-secondary, #6E6455)', lineHeight: 1.6 }}><strong style={{ color: 'var(--kt-chalkboard, #1F3A2E)' }}>Batayan (Rationale):</strong> {dc.primaryTool.rationale}</p>}
              {dc.primaryTool?.administration && <p style={{ margin: '0 0 8px', fontSize: 13, color: 'var(--kt-text-secondary, #6E6455)', lineHeight: 1.6 }}><strong style={{ color: 'var(--kt-chalkboard, #1F3A2E)' }}>Pangangasiwa (Administration):</strong> {dc.primaryTool.administration}</p>}
              {dc.primaryTool?.sampleItems?.length > 0 && (
                <div style={{ marginTop: 12, background: 'var(--kt-card-2, #F4EDDB)', border: '1px solid var(--kt-border, #DCD0AE)', borderRadius: 'var(--kt-radius-sm, 4px)', padding: '12px 14px' }}>
                  <p style={{ margin: '0 0 6px', fontSize: 11, fontWeight: 700, color: 'var(--kt-text-secondary, #6E6455)', textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: 'var(--kt-font-mono, monospace)' }}>Mga Halimbawang Aytem (Sample Items)</p>
                  {dc.primaryTool.sampleItems.map((s, i) => <p key={i} style={{ margin: '0 0 4px', fontSize: 13, color: 'var(--kt-text-primary, #262119)' }}>{i + 1}. {s}</p>)}
                </div>
              )}
            </div>

            {/* Secondary tool */}
            <div style={{
              background: 'var(--kt-card, #FBF7EC)',
              borderRadius: 'var(--kt-radius-md, 6px)',
              border: '1px solid var(--kt-border, #DCD0AE)',
              padding: '20px 24px',
              boxShadow: '0 2px 6px rgba(38, 33, 25, 0.04)',
            }}>
              <p style={sectionHead}><span style={iconBox}><FlaskConical size={14} color="var(--kt-chalkboard, #1F3A2E)" /></span>Sekundaryang Instrumento (Secondary Data Collection Tool)</p>
              <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                {dc.secondaryTool?.name && tag(dc.secondaryTool.name)}
                {dc.secondaryTool?.type && tag(dc.secondaryTool.type)}
              </div>
              <p style={{ margin: '0 0 8px', fontSize: 13.5, color: 'var(--kt-text-primary, #262119)', lineHeight: 1.65 }}>{dc.secondaryTool?.description}</p>
              {dc.secondaryTool?.sampleItems?.length > 0 && (
                <div style={{ marginTop: 12, background: 'var(--kt-card-2, #F4EDDB)', border: '1px solid var(--kt-border, #DCD0AE)', borderRadius: 'var(--kt-radius-sm, 4px)', padding: '12px 14px' }}>
                  <p style={{ margin: '0 0 6px', fontSize: 11, fontWeight: 700, color: 'var(--kt-text-secondary, #6E6455)', textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: 'var(--kt-font-mono, monospace)' }}>Mga Halimbawang Pamantayan (Sample Criteria)</p>
                  {dc.secondaryTool.sampleItems.map((s, i) => <p key={i} style={{ margin: '0 0 4px', fontSize: 13, color: 'var(--kt-text-primary, #262119)' }}>{i + 1}. {s}</p>)}
                </div>
              )}
            </div>

            {/* Stats table */}
            <div style={{
              background: 'var(--kt-card, #FBF7EC)',
              borderRadius: 'var(--kt-radius-md, 6px)',
              border: '1px solid var(--kt-border, #DCD0AE)',
              padding: '20px 24px',
              boxShadow: '0 2px 6px rgba(38, 33, 25, 0.04)',
            }}>
              <p style={sectionHead}><span style={iconBox}><BarChart2 size={14} color="var(--kt-chalkboard, #1F3A2E)" /></span>Pang-estadistikang Pagsusuri (Statistical Treatment)</p>
              <div style={{ overflowX: 'auto', border: '1px solid var(--kt-border, #DCD0AE)', borderRadius: 'var(--kt-radius-sm, 4px)' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                  <thead>
                    <tr style={{ background: 'var(--kt-manila, #E4D5AC)', borderBottom: '1px solid var(--kt-manila-border, #C9B583)' }}>
                      {['Pormula / Treatment', 'Layunin (Purpose)', 'Interpretasyon'].map(h => (
                        <th key={h} style={{ padding: '9px 12px', textAlign: 'left', fontWeight: 700, color: 'var(--kt-chalkboard, #1F3A2E)', fontSize: 11, fontFamily: 'var(--kt-font-mono, monospace)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(dc.statisticalTreatment ?? []).map((row, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid var(--kt-border, #DCD0AE)', background: i % 2 === 0 ? 'var(--kt-card, #FBF7EC)' : 'var(--kt-card-2, #F4EDDB)' }}>
                        <td style={{ padding: '9px 12px', fontWeight: 700, color: 'var(--kt-chalkboard, #1F3A2E)', verticalAlign: 'top' }}>{row.formula}</td>
                        <td style={{ padding: '9px 12px', color: 'var(--kt-text-primary, #262119)', verticalAlign: 'top' }}>{row.purpose}</td>
                        <td style={{ padding: '9px 12px', color: 'var(--kt-text-secondary, #6E6455)', verticalAlign: 'top' }}>{row.interpretation}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Analysis approach */}
            {dc.analysisApproach && (
              <div style={{
                background: 'var(--kt-card, #FBF7EC)',
                borderRadius: 'var(--kt-radius-md, 6px)',
                border: '1px solid var(--kt-border, #DCD0AE)',
                padding: '20px 24px',
                boxShadow: '0 2px 6px rgba(38, 33, 25, 0.04)',
              }}>
                <h3 style={{ margin: '0 0 10px', fontSize: 15, fontWeight: 700, color: 'var(--kt-text-primary, #262119)', fontFamily: 'var(--kt-font-heading, "Bitter", serif)' }}>
                  Paraan ng Pagsusuri ng Datos (Data Analysis Approach)
                </h3>
                <p style={{ margin: 0, fontSize: 13.5, color: 'var(--kt-text-primary, #262119)', lineHeight: 1.75, textAlign: 'justify' }}>{dc.analysisApproach}</p>
              </div>
            )}
          </div>
        )}

        {/* ── Step 2: Research Instrument Generator ─────────────────────────── */}
        <div style={{
          background: 'var(--kt-card, #FBF7EC)',
          borderRadius: 'var(--kt-radius-md, 6px)',
          border: '1px solid var(--kt-border, #DCD0AE)',
          padding: '24px',
          boxShadow: '0 2px 6px rgba(38, 33, 25, 0.04)',
        }}>
          {/* Section header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
            <div style={{ width: 26, height: 26, borderRadius: 4, background: 'var(--kt-chalkboard, #1F3A2E)', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#FBF7EC', fontFamily: 'var(--kt-font-mono, monospace)' }}>2</span>
            </div>
            <div style={{ flex: 1 }}>
              <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: 'var(--kt-text-primary, #262119)', fontFamily: 'var(--kt-font-heading, "Bitter", serif)' }}>
                Bumuo ng Kumpletong Instrumento (Research Instrument)
              </h2>
              <p style={{ margin: '2px 0 0', fontSize: 12.5, color: 'var(--kt-text-secondary, #6E6455)' }}>
                {aiRecommended
                  ? 'Iminumungkahi ng AI ang pinaka-angkop na instrumento sa ibaba — pumili at mag-generate.'
                  : 'Bumubuo ang AI ng kumpleto at magagamit agad na survey, checklist, o exam — pumili sa ibaba.'}
              </p>
            </div>
            {instrument && (
              <span style={{ marginLeft: 'auto', background: 'var(--kt-manila, #E4D5AC)', border: '1px solid var(--kt-manila-border, #C9B583)', color: 'var(--kt-chalkboard, #1F3A2E)', borderRadius: 3, padding: '3px 10px', fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0, fontFamily: 'var(--kt-font-mono, monospace)' }}>
                <CheckCircle2 size={12} /> Nabuong Instrumento
              </span>
            )}
          </div>

          <div style={{ borderTop: '1px solid var(--kt-border, #DCD0AE)', margin: '16px 0' }} />

          {/* Type selector — 2×2 grid */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 18 }}>
            {INSTRUMENT_TYPES.map(({ id, label, Icon, desc }) => {
              const active   = instrumentType === id;
              const isAiPick = aiRecommended === id;
              return (
                <button
                  key={id}
                  onClick={() => setInstrumentType(id)}
                  style={{
                    textAlign: 'left',
                    fontFamily: 'inherit',
                    cursor: 'pointer',
                    background: active ? 'var(--kt-manila, #E4D5AC)' : 'var(--kt-card-2, #F4EDDB)',
                    border: active ? '1px solid var(--kt-manila-border, #C9B583)' : '1px solid var(--kt-border, #DCD0AE)',
                    borderRadius: 'var(--kt-radius-sm, 4px)',
                    padding: '14px 16px',
                    transition: 'border-color 0.15s, background 0.15s',
                    position: 'relative',
                    boxShadow: active ? '0 2px 6px rgba(38, 33, 25, 0.08)' : 'none',
                  }}
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
                  {isAiPick && (
                    <span style={{
                      position: 'absolute',
                      top: 10,
                      left: 12,
                      background: 'var(--kt-chalkboard, #1F3A2E)',
                      color: '#FBF7EC',
                      fontSize: 9.5,
                      fontWeight: 700,
                      letterSpacing: '0.05em',
                      borderRadius: 3,
                      padding: '2px 7px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                      fontFamily: 'var(--kt-font-mono, monospace)',
                    }}>
                      <Sparkles size={9} /> AI Recommended
                    </span>
                  )}
                  {active && (
                    <div style={{ position: 'absolute', top: 10, right: 10, width: 18, height: 18, borderRadius: '50%', background: 'var(--kt-chalkboard, #1F3A2E)', display: 'grid', placeItems: 'center' }}>
                      <CheckCircle2 size={12} color="#FBF7EC" />
                    </div>
                  )}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, marginTop: isAiPick ? 20 : 0 }}>
                    <Icon size={16} color="var(--kt-chalkboard, #1F3A2E)" />
                    <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--kt-text-primary, #262119)', fontFamily: 'var(--kt-font-heading, "Bitter", serif)' }}>
                      {label}
                    </p>
                  </div>
                  <p style={{ margin: 0, fontSize: 12, color: 'var(--kt-text-secondary, #6E6455)', lineHeight: 1.5 }}>
                    {desc}
                  </p>
                </button>
              );
            })}
          </div>

          <button
            onClick={handleGenerateInstrument}
            disabled={generatingInstrument}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              background: generatingInstrument ? 'var(--kt-border, #DCD0AE)' : 'var(--kt-chalkboard, #1F3A2E)',
              color: '#FBF7EC',
              border: 'none',
              borderRadius: 'var(--kt-radius-sm, 4px)',
              padding: '10px 18px',
              fontSize: 13,
              fontWeight: 700,
              cursor: generatingInstrument ? 'not-allowed' : 'pointer',
              fontFamily: 'var(--kt-font-ui, "Inter", sans-serif)',
              transition: 'background 0.15s ease',
            }}
            onMouseEnter={e => { if (!generatingInstrument) e.currentTarget.style.background = 'var(--kt-chalkboard-hover, #2B4E3E)'; }}
            onMouseLeave={e => { if (!generatingInstrument) e.currentTarget.style.background = 'var(--kt-chalkboard, #1F3A2E)'; }}
          >
            {generatingInstrument ? (
              <>
                <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> Bumubuo ng Instrumento…
              </>
            ) : (
              <>
                <Sparkles size={14} /> {instrument ? 'Muling Bumuo' : 'Bumuo ng'} {INSTRUMENT_TYPES.find(t => t.id === instrumentType)?.label}{!freeMode && ' (5 tokens)'}
              </>
            )}
          </button>
          {generatingInstrument && instrumentStatusMsg && (
            <p style={{ margin: '10px 0 0', fontSize: 12.5, color: 'var(--kt-text-secondary, #6E6455)' }}>
              {instrumentStatusMsg}
            </p>
          )}
        </div>

        {/* Instrument output */}
        {instrument && (
          <div style={{
            background: 'var(--kt-card, #FBF7EC)',
            borderRadius: 'var(--kt-radius-md, 6px)',
            border: '1px solid var(--kt-border, #DCD0AE)',
            padding: '24px',
            boxShadow: '0 2px 6px rgba(38, 33, 25, 0.04)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
              {(() => { const t = INSTRUMENT_TYPES.find(x => x.id === instrumentType); return t ? <t.Icon size={16} color="var(--kt-chalkboard, #1F3A2E)" /> : null; })()}
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--kt-text-primary, #262119)', fontFamily: 'var(--kt-font-heading, "Bitter", serif)' }}>
                {INSTRUMENT_TYPES.find(t => t.id === instrumentType)?.label}
              </h3>
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--kt-chalkboard, #1F3A2E)', background: 'var(--kt-manila, #E4D5AC)', border: '1px solid var(--kt-manila-border, #C9B583)', borderRadius: 3, padding: '2px 8px', marginLeft: 6, fontFamily: 'var(--kt-font-mono, monospace)' }}>
                Handa nang Gamitin (Ready to Use)
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
