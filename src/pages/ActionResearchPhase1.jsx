import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  BookOpen, ShieldCheck, Users, Scale,
  Sparkles, AlertTriangle, X, Loader2, CheckCircle2,
} from 'lucide-react';
import { useAuth }    from '../hooks/useAuth';
import { addDoc, serverTimestamp } from 'firebase/firestore';
import { getGeminiKey, geminiWithRetry } from '../services/geminiConfig';
import { generateResearchTitles, THEME_LABELS } from '../services/actionResearchAI';
import { trackEvent, trackGeneration, startTimer } from '../services/usageTracker';
import {
  actionResearchColRef,
  getActionResearch,
  updateActionResearch,
  deductTokens,
} from '../services/db';
import ActionResearchShell from '../components/ActionResearchShell';

/* ── Static data ─────────────────────────────────────────────────────────── */

const BERA_THEMES = [
  { id: 'teaching-learning', name: 'Teaching & Learning', Icon: BookOpen,
    description: 'Strategies to improve literacy and numeracy, innovative teaching practices, curriculum localization',
    tags: ['Literacy', 'Numeracy', 'Pedagogy', 'Curriculum'] },
  { id: 'child-protection',  name: 'Child Protection', Icon: ShieldCheck,
    description: 'Policies and interventions for learner welfare, bullying prevention, and school safety operations',
    tags: ['Bullying', 'Welfare', 'Safety'] },
  { id: 'hrd',               name: 'Human Resource Development', Icon: Users,
    description: 'Professional development, teacher wellness, and capacity building for teaching and non-teaching personnel',
    tags: ['PD', 'Wellness', 'Capacity building'] },
  { id: 'governance',        name: 'Governance', Icon: Scale,
    description: 'Cross-cutting themes — DRRM, Gender and Development (GAD), inclusive education',
    tags: ['DRRM', 'GAD', 'Inclusion'] },
];
const GRADE_LEVELS = ['Kinder','Grade 1','Grade 2','Grade 3','Grade 4','Grade 5','Grade 6','Grade 7','Grade 8','Grade 9','Grade 10','Grade 11','Grade 12'];
const SUBJECTS     = ['English','Filipino','Mathematics','Science','Araling Panlipunan','MAPEH','TLE','Values Education','ESP'];
const BERF_THEMES  = new Set(['teaching-learning','governance']);

/* ── Debounced AI problem suggestion ─────────────────────────────────────── */

async function fetchAISuggestion(problemText, themeName) {
  const key = await getGeminiKey();
  const res = await geminiWithRetry(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`,
    { method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ contents:[{parts:[{text:
        `You are a DepEd action research assistant. Based on this teacher-observed problem: "${problemText}", and BERA theme: "${themeName}", generate: (1) a clean, formal problem statement in 1–2 sentences suitable for a DepEd action research paper, and (2) three specific intervention suggestions aligned to the BERA theme. Return JSON only, no markdown: { "problemStatement": "...", "interventions": ["...", "...", "..."] }`
      }]}], generationConfig:{temperature:0.4,maxOutputTokens:512,thinkingConfig:{thinkingBudget:0}} }) }
  );
  const data  = await res.json();
  const text  = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  const match = text.match(/\{[\s\S]*\}/);
  return match ? JSON.parse(match[0]) : null;
}

/* ── Styles ──────────────────────────────────────────────────────────────── */

const CSS = `
  .ar-theme-grid { display:grid; grid-template-columns:1fr 1fr; gap:14px; }
  @media(max-width:640px){ .ar-theme-grid{grid-template-columns:1fr;} }
`;

const fieldStyle = {
  width:'100%', boxSizing:'border-box', padding:'10px 12px',
  border:'1.5px solid rgba(45,106,79,0.2)', borderRadius:8,
  fontSize:14, background:'#f5faf7', color:'#163828',
  outline:'none', fontFamily:'inherit', transition:'border 0.15s, box-shadow 0.15s',
};
const labelStyle = {
  display:'block', fontSize:11, fontWeight:700, color:'#4a6357',
  textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:6,
};
const focus = e => { e.target.style.borderColor='#2d6a4f'; e.target.style.boxShadow='0 0 0 3px rgba(45,106,79,0.1)'; };
const blur  = e => { e.target.style.borderColor='rgba(45,106,79,0.2)'; e.target.style.boxShadow='none'; };

/* ── Component ───────────────────────────────────────────────────────────── */

export default function ActionResearchPhase1() {
  const { user, freeMode } = useAuth();
  const navigate   = useNavigate();
  const { docId: urlDocId } = useParams(); // present when resuming an existing project

  // Persisted Firestore doc ID (set when we first save or when resuming)
  const [docId, setDocId] = useState(urlDocId || null);

  const [selectedTheme,  setSelectedTheme]  = useState('teaching-learning');
  const [gradeLevel,     setGradeLevel]     = useState('');
  const [subjectArea,    setSubjectArea]    = useState('');
  const [schoolYear,     setSchoolYear]     = useState('');
  const [schoolName,     setSchoolName]     = useState('');
  const [problemText,    setProblemText]    = useState('');
  const [aiSuggestion,   setAiSuggestion]   = useState(null);
  const [aiLoading,      setAiLoading]      = useState(false);
  const [berfDismissed,  setBerfDismissed]  = useState(false);
  const [researchTitles, setResearchTitles] = useState([]);
  const [selectedTitle,  setSelectedTitle]  = useState('');
  const [titlesLoading,  setTitlesLoading]  = useState(false);
  const [saving,         setSaving]         = useState(false);
  const [error,          setError]          = useState('');
  const [loadingResume,  setLoadingResume]  = useState(!!urlDocId);
  const debounceRef = useRef(null);

  const currentTheme = BERA_THEMES.find(t => t.id === selectedTheme);

  /* ── Load saved data when resuming ─────────────────────────────────── */
  useEffect(() => {
    if (!urlDocId || !user?.uid) { setLoadingResume(false); return; }
    getActionResearch(user.uid, urlDocId)
      .then(data => {
        if (data.beraTheme)         setSelectedTheme(data.beraTheme);
        if (data.gradeLevel)        setGradeLevel(data.gradeLevel);
        if (data.subjectArea)       setSubjectArea(data.subjectArea);
        if (data.schoolYear)        setSchoolYear(data.schoolYear);
        if (data.schoolName)        setSchoolName(data.schoolName);
        if (data.problemText)       setProblemText(data.problemText);
        if (data.researchTitles?.length) setResearchTitles(data.researchTitles);
        if (data.selectedTitle)     setSelectedTitle(data.selectedTitle);
        if (data.aiProblemStatement) {
          setAiSuggestion({ problemStatement: data.aiProblemStatement, interventions: [] });
        }
      })
      .catch(() => {})
      .finally(() => setLoadingResume(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlDocId, user?.uid]);

  /* ── Debounced AI problem suggestion ─────────────────────────────────── */
  const triggerAI = useCallback((text, themeId) => {
    clearTimeout(debounceRef.current);
    if (!text.trim() || text.length < 20) { setAiSuggestion(null); return; }
    debounceRef.current = setTimeout(async () => {
      const theme = BERA_THEMES.find(t => t.id === themeId);
      if (!theme) return;
      setAiLoading(true);
      try   { setAiSuggestion(await fetchAISuggestion(text, theme.name)); }
      catch { /* silent */ }
      finally { setAiLoading(false); }
    }, 800);
  }, []);

  useEffect(() => {
    if (loadingResume) return; // don't fire while restoring saved data
    triggerAI(problemText, selectedTheme);
    return () => clearTimeout(debounceRef.current);
  }, [problemText, selectedTheme, triggerAI, loadingResume]);

  /* Theme change: manually clear titles (not via useEffect) so that
     loading saved data doesn't accidentally clear them. */
  function handleThemeSelect(id) {
    if (id === selectedTheme) return;
    setSelectedTheme(id);
    setBerfDismissed(false);
    setResearchTitles([]);
    setSelectedTitle('');
  }

  /* ── Save helpers ─────────────────────────────────────────────────────── */
  function buildPayload(extras = {}) {
    return {
      phase: 1, status: 'in-progress',
      beraTheme: selectedTheme,
      gradeLevel, subjectArea, schoolYear, schoolName, problemText,
      aiProblemStatement: aiSuggestion?.problemStatement ?? '',
      ...extras,
    };
  }

  async function saveToFirestore(payload) {
    if (!user?.uid) return null;
    if (docId) {
      await updateActionResearch(user.uid, docId, payload);
      return docId;
    }
    const ref = await addDoc(actionResearchColRef(user.uid), {
      ...payload,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    setDocId(ref.id);
    return ref.id;
  }

  /* ── Generate titles — also saves progress to Firestore ──────────────── */
  async function handleGenerateTitles() {
    if (!user?.uid || problemText.trim().length < 20) return;
    setTitlesLoading(true); setError('');
    let elapsedMs;
    try {
      await deductTokens(user.uid, 'action-research-titles', 5);
      elapsedMs = startTimer();
      const result = await generateResearchTitles({ beraTheme:selectedTheme, problemText, subjectArea, gradeLevel });
      const titles = result.titles ?? [];
      setResearchTitles(titles);
      setSelectedTitle('');
      // Save intermediate state so the project appears in the dashboard
      await saveToFirestore(buildPayload({ researchTitles: titles, selectedTitle: '' }));
      trackEvent(user.uid, 'action_research_phase1_generated', { subject: subjectArea, grade: gradeLevel });
      trackGeneration(user.uid, 'ar_phase1', { success: true, durationMs: elapsedMs() });
    } catch (err) {
      setError(err.message || 'Failed to generate titles. Please try again.');
      if (elapsedMs) {
        trackGeneration(user.uid, 'ar_phase1', { success: false, durationMs: elapsedMs(), error: err.message });
      }
    } finally {
      setTitlesLoading(false);
    }
  }

  /* ── Next — finalize Phase 1 and move to Phase 2 ─────────────────────── */
  const canProceed = selectedTheme && problemText.trim().length > 0 && !!selectedTitle;

  async function handleNext() {
    if (!canProceed || !user?.uid) return;
    setSaving(true); setError('');
    try {
      const finalDocId = await saveToFirestore(
        buildPayload({ researchTitles, selectedTitle })
      );
      navigate(`/action-research/phase-2/${finalDocId}`);
    } catch {
      setError('Failed to save. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  const showBerf = BERF_THEMES.has(selectedTheme) && !berfDismissed;

  /* ── Loading skeleton while restoring saved data ─────────────────────── */
  if (loadingResume) {
    return (
      <ActionResearchShell phase={1} canNext={false} nextLabel="Next: Research Questions" themeName="">
        <div style={{ textAlign:'center', padding:'60px 0', color:'#4a6357', fontSize:14 }}>
          <Loader2 size={28} color="#2d6a4f" style={{ animation:'spin 1s linear infinite', marginBottom:12 }} />
          <p style={{ margin:0 }}>Loading your saved research…</p>
        </div>
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </ActionResearchShell>
    );
  }

  /* ── Render ─────────────────────────────────────────────────────── */
  return (
    <ActionResearchShell
      phase={1}
      canNext={canProceed}
      nextLabel="Next: Research Questions"
      onNext={handleNext}
      nextLoading={saving}
      themeName={currentTheme?.name}
    >
      <style>{CSS}</style>
      <div style={{ display:'flex', flexDirection:'column', gap:24 }}>

        {/* Resume banner */}
        {urlDocId && (
          <div style={{ background:'#eef2ff', border:'1px solid rgba(79,70,229,0.2)', borderRadius:10, padding:'11px 16px', display:'flex', alignItems:'center', gap:10 }}>
            <CheckCircle2 size={14} color="#4f46e5" />
            <p style={{ margin:0, fontSize:13, color:'#312e81', fontWeight:500 }}>
              Resuming your saved research project — all previous inputs have been restored.
            </p>
          </div>
        )}

        {/* BERF alert */}
        {showBerf && (
          <div style={{ background:'#fffbeb', border:'1px solid #f59e0b', borderRadius:10, padding:'13px 16px', display:'flex', alignItems:'flex-start', gap:10 }}>
            <AlertTriangle size={15} color="#d97706" style={{ flexShrink:0, marginTop:1 }} />
            <div style={{ flex:1 }}>
              <p style={{ margin:0, fontSize:13, fontWeight:600, color:'#92400e' }}>Possible BERF grant alignment</p>
              <p style={{ margin:'3px 0 0', fontSize:12, color:'#78350f', lineHeight:1.5 }}>Your topic may align with BERF grant funding priorities. Completing this research could qualify you to apply.</p>
            </div>
            <button onClick={() => setBerfDismissed(true)} style={{ background:'none', border:'none', cursor:'pointer', color:'#92400e', padding:2 }}><X size={14} /></button>
          </div>
        )}

        {/* 1. BERA theme */}
        <div style={{ background:'#fff', borderRadius:14, border:'1px solid rgba(45,106,79,0.12)', padding:'22px 24px' }}>
          <p style={{ margin:'0 0 4px', fontSize:15, fontWeight:700, color:'#0d2218' }}>1. Select your BERA theme</p>
          <p style={{ margin:'0 0 18px', fontSize:13, color:'#4a6357', lineHeight:1.5 }}>Choose the research area that matches your classroom problem.</p>
          <div className="ar-theme-grid">
            {BERA_THEMES.map(({ id, name, Icon, description, tags }) => {
              const active = selectedTheme === id;
              return (
                <button key={id} onClick={() => handleThemeSelect(id)} style={{ textAlign:'left', cursor:'pointer', fontFamily:'inherit', background:active?'#f0f9f4':'#fafafa', border:active?'2px solid #2d6a4f':'1.5px solid rgba(45,106,79,0.15)', borderRadius:12, padding:'16px', transition:'border 0.15s, background 0.15s', position:'relative' }}
                  onMouseEnter={e=>{if(!active)e.currentTarget.style.background='#f5faf7';}}
                  onMouseLeave={e=>{if(!active)e.currentTarget.style.background='#fafafa';}}>
                  {active && <div style={{ position:'absolute', top:10, right:10, background:'#2d6a4f', color:'#fff', fontSize:10, fontWeight:700, borderRadius:20, padding:'2px 8px' }}>Selected</div>}
                  <div style={{ width:38, height:38, borderRadius:9, background:active?'rgba(45,106,79,0.12)':'rgba(45,106,79,0.07)', display:'flex', alignItems:'center', justifyContent:'center', marginBottom:10 }}>
                    <Icon size={18} color={active?'#2d6a4f':'#4a6357'} />
                  </div>
                  <p style={{ margin:'0 0 5px', fontSize:13, fontWeight:700, color:active?'#1a3d2b':'#0d2218', paddingRight:active?52:0 }}>{name}</p>
                  <p style={{ margin:'0 0 10px', fontSize:12, color:'#4a6357', lineHeight:1.5 }}>{description}</p>
                  <div style={{ display:'flex', flexWrap:'wrap', gap:5 }}>
                    {tags.map(t => <span key={t} style={{ fontSize:10, fontWeight:600, color:active?'#1a3d2b':'#4a6357', background:active?'rgba(45,106,79,0.1)':'rgba(45,106,79,0.06)', borderRadius:20, padding:'2px 8px' }}>{t}</span>)}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* 2. Problem form */}
        <div style={{ background:'#fff', borderRadius:14, border:'1px solid rgba(45,106,79,0.12)', padding:'22px 24px' }}>
          <p style={{ margin:'0 0 4px', fontSize:15, fontWeight:700, color:'#0d2218' }}>2. Describe the problem</p>
          <p style={{ margin:'0 0 20px', fontSize:13, color:'#4a6357', lineHeight:1.5 }}>Fill in your classroom context and the problem you have observed.</p>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14, marginBottom:14 }}>
            <div>
              <label style={labelStyle}>Grade level</label>
              <select value={gradeLevel} onChange={e=>setGradeLevel(e.target.value)} style={{...fieldStyle,height:42}}>
                <option value="">Select grade…</option>
                {GRADE_LEVELS.map(g=><option key={g} value={g}>{g}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Subject area</label>
              <select value={subjectArea} onChange={e=>setSubjectArea(e.target.value)} style={{...fieldStyle,height:42}}>
                <option value="">Select subject…</option>
                {SUBJECTS.map(s=><option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14, marginBottom:14 }}>
            <div>
              <label style={labelStyle}>School year</label>
              <input type="text" value={schoolYear} onChange={e=>setSchoolYear(e.target.value)} placeholder="2025–2026" style={fieldStyle} onFocus={focus} onBlur={blur} />
            </div>
            <div>
              <label style={labelStyle}>School name</label>
              <input type="text" value={schoolName} onChange={e=>setSchoolName(e.target.value)} placeholder="Mabini National High School" style={fieldStyle} onFocus={focus} onBlur={blur} />
            </div>
          </div>
          <div>
            <label style={labelStyle}>Observed classroom problem <span style={{color:'#e05c5c'}}>*</span></label>
            <textarea rows={4} value={problemText} onChange={e=>setProblemText(e.target.value)}
              placeholder="Describe the specific problem — e.g., low reading comprehension scores, difficulty with fractions…"
              style={{...fieldStyle,height:'auto',resize:'vertical',lineHeight:1.6,padding:'10px 12px'}}
              onFocus={focus} onBlur={blur} />
            <p style={{ margin:'5px 0 0', fontSize:11, color:'#9bb8ac' }}>Type at least 20 characters to generate AI suggestions and research titles.</p>
          </div>
        </div>

        {/* AI problem statement suggestion (free, debounced) */}
        {(aiLoading || aiSuggestion) && (
          <div style={{ background:'#f0f9f4', border:'1.5px solid rgba(45,106,79,0.2)', borderRadius:12, padding:'18px 20px' }}>
            <div style={{ display:'flex', alignItems:'center', gap:7, marginBottom:12 }}>
              <Sparkles size={14} color="#2d6a4f" />
              <span style={{ fontSize:11, fontWeight:700, color:'#2d6a4f', textTransform:'uppercase', letterSpacing:'0.06em' }}>AI suggestion</span>
              {aiLoading && <Loader2 size={12} color="#4a6357" style={{ animation:'spin 1s linear infinite', marginLeft:4 }} />}
            </div>
            {aiSuggestion && (
              <>
                <div style={{ background:'#fff', borderRadius:8, border:'1px solid rgba(45,106,79,0.12)', padding:'12px 14px', marginBottom:12 }}>
                  <p style={{ margin:'0 0 3px', fontSize:10, fontWeight:700, color:'#4a6357', textTransform:'uppercase', letterSpacing:'0.06em' }}>Suggested problem statement</p>
                  <p style={{ margin:0, fontSize:13, color:'#163828', lineHeight:1.65 }}>{aiSuggestion.problemStatement}</p>
                </div>
                {aiSuggestion.interventions?.length > 0 && (
                  <>
                    <p style={{ margin:'0 0 8px', fontSize:10, fontWeight:700, color:'#4a6357', textTransform:'uppercase', letterSpacing:'0.06em' }}>Suggested interventions</p>
                    {aiSuggestion.interventions.map((t,i)=>(
                      <div key={i} style={{ display:'flex', alignItems:'flex-start', gap:8, background:'#fff', borderRadius:8, border:'1px solid rgba(45,106,79,0.1)', padding:'9px 12px', marginBottom:6 }}>
                        <div style={{ width:18, height:18, borderRadius:'50%', background:'#2d6a4f', color:'#fff', display:'flex', alignItems:'center', justifyContent:'center', fontSize:9, fontWeight:700, flexShrink:0, marginTop:1 }}>{i+1}</div>
                        <p style={{ margin:0, fontSize:12, color:'#163828', lineHeight:1.55 }}>{t}</p>
                      </div>
                    ))}
                  </>
                )}
              </>
            )}
          </div>
        )}

        {/* 3. Generate and choose research title */}
        <div style={{ background:'#fff', borderRadius:14, border:'1px solid rgba(45,106,79,0.12)', padding:'22px 24px' }}>
          <p style={{ margin:'0 0 4px', fontSize:15, fontWeight:700, color:'#0d2218' }}>3. Choose a research title</p>
          <p style={{ margin:'0 0 18px', fontSize:13, color:'#4a6357', lineHeight:1.5 }}>Generate 5 AI-suggested titles based on your BERA theme and problem, then select one.</p>

          {problemText.trim().length < 20 ? (
            <p style={{ fontSize:13, color:'#9bb8ac', fontStyle:'italic' }}>Complete the problem description above first.</p>
          ) : (
            <button
              onClick={handleGenerateTitles}
              disabled={titlesLoading}
              style={{ display:'flex', alignItems:'center', gap:7, background:titlesLoading?'rgba(45,106,79,0.35)':'#2d6a4f', color:'#fff', border:'none', borderRadius:8, padding:'10px 18px', fontSize:13, fontWeight:600, cursor:titlesLoading?'not-allowed':'pointer', fontFamily:'inherit', marginBottom: researchTitles.length?16:0 }}
            >
              {titlesLoading ? <><Loader2 size={13} style={{animation:'spin 1s linear infinite'}} /> Generating titles…</> : <><Sparkles size={13} /> Generate research titles{!freeMode && ' (5 tokens)'}</>}
            </button>
          )}

          {researchTitles.length > 0 && (
            <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
              {researchTitles.map((title, i) => {
                const active = selectedTitle === title;
                return (
                  <button key={i} onClick={() => setSelectedTitle(title)}
                    style={{ textAlign:'left', fontFamily:'inherit', cursor:'pointer', display:'flex', alignItems:'flex-start', gap:12, background:active?'#f0f9f4':'#fafafa', border:active?'2px solid #2d6a4f':'1.5px solid rgba(45,106,79,0.15)', borderRadius:10, padding:'14px 16px', transition:'border 0.15s, background 0.15s' }}
                    onMouseEnter={e=>{if(!active)e.currentTarget.style.background='#f5faf7';}}
                    onMouseLeave={e=>{if(!active)e.currentTarget.style.background='#fafafa';}}>
                    <div style={{ width:20, height:20, borderRadius:'50%', border:active?'none':'2px solid rgba(45,106,79,0.3)', background:active?'#2d6a4f':'transparent', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, marginTop:2 }}>
                      {active && <CheckCircle2 size={14} color="#fff" />}
                    </div>
                    <p style={{ margin:0, fontSize:13, color:active?'#1a3d2b':'#0d2218', lineHeight:1.6, fontWeight:active?600:400 }}>{title}</p>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Error */}
        {error && <div style={{ background:'#fde8e8', border:'1px solid rgba(224,92,92,0.3)', borderRadius:8, padding:'10px 14px', fontSize:13, color:'#c0392b', fontWeight:500 }}>{error}</div>}
      </div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </ActionResearchShell>
  );
}
