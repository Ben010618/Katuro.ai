import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  BookOpen, ShieldCheck, Users, Scale,
  Sparkles, AlertTriangle, X, Loader2, CheckCircle2,
} from 'lucide-react';
import { useAuth }    from '../hooks/useAuth';
import { addDoc, serverTimestamp } from 'firebase/firestore';
import { callGeminiProxy } from '../services/geminiConfig';
import { parseAIJson } from '../services/aiJsonParse';
import { generateResearchTitles } from '../services/actionResearchAI';
import { trackEvent, trackGeneration, startTimer } from '../services/usageTracker';
import {
  actionResearchColRef,
  getActionResearch,
  updateActionResearch,
  deductTokens,
  refundTokens,
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
  // Routed through the generateAI proxy like every other AI call in the app
  // (see ai.js's header comment) — this used to call Gemini directly from
  // the browser with a client-fetched API key, which meant (a) it silently
  // failed for every non-admin teacher, since adminConfig/gemini is
  // admin-only per firestore.rules, and (b) it had no daily-limit protection
  // at all, unlike every other AI feature in the app.
  const { text } = await callGeminiProxy({
    action: 'ar_problem_suggest',
    contents: [{ parts: [{ text:
      `You are a DepEd action research assistant. Based on this teacher-observed problem: "${problemText}", and BERA theme: "${themeName}", generate: (1) a clean, formal problem statement in 1–2 sentences suitable for a DepEd action research paper, and (2) three specific intervention suggestions aligned to the BERA theme. Return JSON only, no markdown: { "problemStatement": "...", "interventions": ["...", "...", "..."] }`
    }] }],
    temperature: 0.4,
    maxTokens: 512,
    responseMimeType: 'application/json',
  });
  try {
    return parseAIJson(text);
  } catch {
    return null;
  }
}

/* ── Styles ──────────────────────────────────────────────────────────────── */

const CSS = `
  .ar-theme-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
  @media (max-width: 640px) { .ar-theme-grid { grid-template-columns: 1fr; } }
`;

const fieldStyle = {
  width: '100%',
  boxSizing: 'border-box',
  padding: '10px 12px',
  border: '1px solid var(--kt-border, #DCD0AE)',
  borderRadius: 'var(--kt-radius-sm, 4px)',
  fontSize: 13.5,
  background: 'var(--kt-card-2, #F4EDDB)',
  color: 'var(--kt-text-primary, #262119)',
  outline: 'none',
  fontFamily: 'inherit',
  transition: 'border-color 0.15s, background 0.15s',
};

const labelStyle = {
  display: 'block',
  fontSize: 11,
  fontWeight: 700,
  color: 'var(--kt-text-secondary, #6E6455)',
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  marginBottom: 6,
  fontFamily: 'var(--kt-font-mono, monospace)',
};

const focus = e => {
  e.target.style.borderColor = 'var(--kt-manila-border, #C9B583)';
  e.target.style.background = '#ffffff';
};

const blur = e => {
  e.target.style.borderColor = 'var(--kt-border, #DCD0AE)';
  e.target.style.background = 'var(--kt-card-2, #F4EDDB)';
};

/* ── Component ───────────────────────────────────────────────────────────── */

export default function ActionResearchPhase1() {
  const { user, freeMode } = useAuth();
  const navigate   = useNavigate();
  const { docId: urlDocId } = useParams();

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
  const [statusMsg,      setStatusMsg]      = useState('');
  const [loadingResume,  setLoadingResume]  = useState(!!urlDocId);
  const debounceRef = useRef(null);

  const currentTheme = BERA_THEMES.find(t => t.id === selectedTheme);

  /* ── Load saved data when resuming ─────────────────────────────────── */
  useEffect(() => {
    (async () => {
      if (!urlDocId || !user?.uid) { setLoadingResume(false); return; }
      try {
        const saved = await getActionResearch(user.uid, urlDocId);
        if (saved) {
          if (saved.beraTheme)      setSelectedTheme(saved.beraTheme);
          if (saved.gradeLevel)     setGradeLevel(saved.gradeLevel);
          if (saved.subjectArea)    setSubjectArea(saved.subjectArea);
          if (saved.schoolYear)     setSchoolYear(saved.schoolYear);
          if (saved.schoolName)     setSchoolName(saved.schoolName);
          if (saved.problemText)    setProblemText(saved.problemText);
          if (saved.researchTitles) setResearchTitles(saved.researchTitles);
          if (saved.selectedTitle)  setSelectedTitle(saved.selectedTitle);
          if (saved.aiSuggestion)   setAiSuggestion(saved.aiSuggestion);
        }
      } catch (err) {
        console.error('Failed to load saved action research:', err);
      } finally {
        setLoadingResume(false);
      }
    })();
  }, [urlDocId, user?.uid]);

  /* ── Save helper: writes to Firestore, returns docId ─────────────────── */
  const buildPayload = useCallback((extra = {}) => ({
    userId:        user.uid,
    phase:         1,
    beraTheme:     selectedTheme,
    gradeLevel,
    subjectArea,
    schoolYear,
    schoolName,
    problemText,
    researchTitles,
    selectedTitle,
    aiSuggestion,
    updatedAt:     serverTimestamp(),
    ...extra,
  }), [user?.uid, selectedTheme, gradeLevel, subjectArea, schoolYear, schoolName, problemText, researchTitles, selectedTitle, aiSuggestion]);

  async function saveToFirestore(payload) {
    if (docId) {
      await updateActionResearch(user.uid, docId, payload);
      return docId;
    }
    const newDoc = await addDoc(actionResearchColRef(user.uid), {
      ...payload,
      createdAt: serverTimestamp(),
    });
    setDocId(newDoc.id);
    return newDoc.id;
  }

  /* ── Theme select — switches theme and clears BERF dismiss ───────────── */
  function handleThemeSelect(themeId) {
    setSelectedTheme(themeId);
    setBerfDismissed(false);
    setResearchTitles([]);
    setSelectedTitle('');
    setAiSuggestion(null);
  }

  /* ── Debounced AI problem suggestion ─────────────────────────────────── */
  useEffect(() => {
    if (problemText.trim().length < 20) {
      setAiSuggestion(null);
      setAiLoading(false);
      return;
    }
    setAiLoading(true);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const suggestion = await fetchAISuggestion(problemText, currentTheme?.name ?? selectedTheme);
        setAiSuggestion(suggestion);
      } catch (err) {
        console.error('AI suggestion failed:', err);
      } finally {
        setAiLoading(false);
      }
    }, 1200);
    return () => clearTimeout(debounceRef.current);
  }, [problemText, selectedTheme, currentTheme?.name]);

  /* ── Generate titles — also saves progress to Firestore ──────────────── */
  async function handleGenerateTitles() {
    if (!user?.uid || problemText.trim().length < 20 || titlesLoading) return;
    setTitlesLoading(true); setError(''); setStatusMsg('');
    let elapsedMs;
    let tokensDeducted = false;
    try {
      await deductTokens(user.uid, 'action-research-titles', 5);
      tokensDeducted = true;
      elapsedMs = startTimer();

      let result;
      let lastErr;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          result = await generateResearchTitles({ beraTheme:selectedTheme, problemText, subjectArea, gradeLevel, isRetry: attempt > 0 });
          break;
        } catch (err) {
          lastErr = err;
          console.warn(`generateResearchTitles attempt ${attempt + 1} failed:`, err);
          if (err.dailyLimit) break;
          if (attempt < 2) {
            const wait = err.status === 429
              ? Math.min((err.retryAfter || 30) * 1000, 30_000)
              : 6000 + attempt * 3000;
            setStatusMsg(`May kaunting pagkaantala sa server — muling susubukan sa ${Math.round(wait / 1000)}s…`);
            await new Promise(r => setTimeout(r, wait));
            setStatusMsg('Muling bumubuo ng mga pamagat…');
          }
        }
      }
      if (!result) throw lastErr || new Error('Failed to generate titles. Please try again.');

      const titles = result.titles ?? [];
      setResearchTitles(titles);
      setSelectedTitle('');
      await saveToFirestore(buildPayload({ researchTitles: titles, selectedTitle: '' }));
      trackEvent(user.uid, 'action_research_phase1_generated', { subject: subjectArea, grade: gradeLevel });
      trackGeneration(user.uid, 'ar_phase1', { success: true, durationMs: elapsedMs() });
    } catch (err) {
      setError(
        err.status === 429
          ? 'Rate limit reached — wait a moment then try again.'
          : (err.message || 'Failed to generate titles. Please try again.')
      );
      if (tokensDeducted) {
        refundTokens(user.uid, 'action-research-titles', 5).catch(e => console.error('Token refund failed:', e));
      }
      if (elapsedMs) {
        trackGeneration(user.uid, 'ar_phase1', { success: false, durationMs: elapsedMs(), error: err.message });
      }
    } finally {
      setTitlesLoading(false); setStatusMsg('');
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
      <ActionResearchShell phase={1} canNext={false} nextLabel="Susunod na Phase" themeName="">
        <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--kt-text-secondary, #6E6455)', fontSize: 14 }}>
          <Loader2 size={28} color="var(--kt-chalkboard, #1F3A2E)" style={{ animation: 'spin 1s linear infinite', marginBottom: 12 }} />
          <p style={{ margin: 0, fontFamily: 'var(--kt-font-heading, "Bitter", serif)' }}>Ikinakarga ang iyong na-save na pananaliksik…</p>
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
      nextLabel="Susunod: Research Questions"
      onNext={handleNext}
      nextLoading={saving}
      themeName={currentTheme?.name}
    >
      <style>{CSS}</style>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

        {/* Resume banner */}
        {urlDocId && (
          <div style={{
            background: 'var(--kt-manila, #E4D5AC)',
            border: '1px solid var(--kt-manila-border, #C9B583)',
            borderRadius: 'var(--kt-radius-sm, 4px)',
            padding: '12px 16px',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
          }}>
            <CheckCircle2 size={16} color="var(--kt-chalkboard, #1F3A2E)" />
            <p style={{ margin: 0, fontSize: 13, color: 'var(--kt-text-primary, #262119)', fontWeight: 600 }}>
              Ipinagpapatuloy ang na-save na action research project — naibalik ang lahat ng naunang impormasyon.
            </p>
          </div>
        )}

        {/* BERF alert */}
        {showBerf && (
          <div style={{
            background: 'var(--kt-manila, #E4D5AC)',
            border: '1px solid var(--kt-manila-border, #C9B583)',
            borderRadius: 'var(--kt-radius-md, 6px)',
            padding: '14px 18px',
            display: 'flex',
            alignItems: 'flex-start',
            gap: 12,
          }}>
            <AlertTriangle size={17} color="var(--kt-chalkboard, #1F3A2E)" style={{ flexShrink: 0, marginTop: 1 }} />
            <div style={{ flex: 1 }}>
              <p style={{ margin: 0, fontSize: 13.5, fontWeight: 700, color: 'var(--kt-text-primary, #262119)', fontFamily: 'var(--kt-font-heading, "Bitter", serif)' }}>
                May Posibilidad sa BERF Grant Funding Alignment
              </p>
              <p style={{ margin: '4px 0 0', fontSize: 12.5, color: 'var(--kt-text-secondary, #6E6455)', lineHeight: 1.5 }}>
                Ang napiling tema ay nakahanay sa mga prayoridad ng Basic Education Research Fund (BERF). Ang pagkumpleto sa pananaliksik na ito ay makatutulong para sa opisyal na grant application.
              </p>
            </div>
            <button
              onClick={() => setBerfDismissed(true)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--kt-text-secondary, #6E6455)', padding: 2 }}
              aria-label="Dismiss alert"
            >
              <X size={15} />
            </button>
          </div>
        )}

        {/* 1. BERA theme */}
        <div style={{
          background: 'var(--kt-card, #FBF7EC)',
          borderRadius: 'var(--kt-radius-md, 6px)',
          border: '1px solid var(--kt-border, #DCD0AE)',
          padding: '24px',
          boxShadow: '0 2px 8px rgba(38, 33, 25, 0.04)',
        }}>
          <h2 style={{
            margin: '0 0 4px',
            fontSize: 17,
            fontWeight: 700,
            color: 'var(--kt-text-primary, #262119)',
            fontFamily: 'var(--kt-font-heading, "Bitter", serif)',
          }}>
            1. Piliin ang BERA Theme
          </h2>
          <p style={{ margin: '0 0 18px', fontSize: 13, color: 'var(--kt-text-secondary, #6E6455)', lineHeight: 1.5 }}>
            Piliin ang research area na tumutugma sa suliranin sa inyong silid-aralan o paaralan.
          </p>

          <div className="ar-theme-grid">
            {BERA_THEMES.map(({ id, name, Icon, description, tags }) => {
              const active = selectedTheme === id;
              return (
                <button
                  key={id}
                  onClick={() => handleThemeSelect(id)}
                  style={{
                    textAlign: 'left',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    background: active ? 'var(--kt-manila, #E4D5AC)' : 'var(--kt-card-2, #F4EDDB)',
                    border: active ? '1px solid var(--kt-manila-border, #C9B583)' : '1px solid var(--kt-border, #DCD0AE)',
                    borderRadius: 'var(--kt-radius-sm, 4px)',
                    padding: '16px',
                    transition: 'border-color 0.15s, background 0.15s, transform 0.15s',
                    position: 'relative',
                    boxShadow: active ? '0 2px 8px rgba(38, 33, 25, 0.08)' : 'none',
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
                  {active && (
                    <div style={{
                      position: 'absolute',
                      top: 12,
                      right: 12,
                      background: 'var(--kt-chalkboard, #1F3A2E)',
                      color: '#FBF7EC',
                      fontSize: 10,
                      fontWeight: 700,
                      borderRadius: 3,
                      padding: '2px 8px',
                      fontFamily: 'var(--kt-font-mono, monospace)',
                      letterSpacing: '0.04em',
                    }}>
                      NAPILI
                    </div>
                  )}

                  <div style={{
                    width: 36,
                    height: 36,
                    borderRadius: 4,
                    background: active ? 'var(--kt-chalkboard, #1F3A2E)' : 'rgba(38, 33, 25, 0.08)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginBottom: 10,
                  }}>
                    <Icon size={18} color={active ? '#FBF7EC' : 'var(--kt-chalkboard, #1F3A2E)'} />
                  </div>

                  <p style={{
                    margin: '0 0 5px',
                    fontSize: 14,
                    fontWeight: 700,
                    color: 'var(--kt-text-primary, #262119)',
                    fontFamily: 'var(--kt-font-heading, "Bitter", serif)',
                    paddingRight: active ? 56 : 0,
                  }}>
                    {name}
                  </p>
                  <p style={{ margin: '0 0 12px', fontSize: 12, color: 'var(--kt-text-secondary, #6E6455)', lineHeight: 1.5 }}>
                    {description}
                  </p>

                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                    {tags.map(t => (
                      <span key={t} style={{
                        fontSize: 10.5,
                        fontWeight: 600,
                        color: 'var(--kt-text-primary, #262119)',
                        background: active ? 'rgba(38, 33, 25, 0.1)' : 'rgba(38, 33, 25, 0.05)',
                        border: '1px solid var(--kt-border, #DCD0AE)',
                        borderRadius: 3,
                        padding: '2px 7px',
                        fontFamily: 'var(--kt-font-mono, monospace)',
                      }}>
                        {t}
                      </span>
                    ))}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* 2. Problem form */}
        <div style={{
          background: 'var(--kt-card, #FBF7EC)',
          borderRadius: 'var(--kt-radius-md, 6px)',
          border: '1px solid var(--kt-border, #DCD0AE)',
          padding: '24px',
          boxShadow: '0 2px 8px rgba(38, 33, 25, 0.04)',
        }}>
          <h2 style={{
            margin: '0 0 4px',
            fontSize: 17,
            fontWeight: 700,
            color: 'var(--kt-text-primary, #262119)',
            fontFamily: 'var(--kt-font-heading, "Bitter", serif)',
          }}>
            2. Ilarawan ang Suliranin (Problem Context)
          </h2>
          <p style={{ margin: '0 0 20px', fontSize: 13, color: 'var(--kt-text-secondary, #6E6455)', lineHeight: 1.5 }}>
            Ilagay ang konteksto ng iyong klase at ang partikular na suliraning naobserbahan sa pagkatuto.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
            <div>
              <label style={labelStyle}>Baitang (Grade Level)</label>
              <select value={gradeLevel} onChange={e => setGradeLevel(e.target.value)} style={{ ...fieldStyle, height: 42 }}>
                <option value="">Pumili ng baitang…</option>
                {GRADE_LEVELS.map(g => <option key={g} value={g}>{g}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Asignatura (Subject Area)</label>
              <select value={subjectArea} onChange={e => setSubjectArea(e.target.value)} style={{ ...fieldStyle, height: 42 }}>
                <option value="">Pumili ng asignatura…</option>
                {SUBJECTS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
            <div>
              <label style={labelStyle}>Taong Panuruan (School Year)</label>
              <input type="text" value={schoolYear} onChange={e => setSchoolYear(e.target.value)} placeholder="2025–2026" style={fieldStyle} onFocus={focus} onBlur={blur} />
            </div>
            <div>
              <label style={labelStyle}>Pangalan ng Paaralan (School Name)</label>
              <input type="text" value={schoolName} onChange={e => setSchoolName(e.target.value)} placeholder="Mabini National High School" style={fieldStyle} onFocus={focus} onBlur={blur} />
            </div>
          </div>

          <div>
            <label style={labelStyle}>
              Naobserbahang Suliranin sa Klase <span style={{ color: 'var(--kt-danger, #A23B2E)' }}>*</span>
            </label>
            <textarea
              rows={4}
              value={problemText}
              onChange={e => setProblemText(e.target.value)}
              placeholder="Ilarawan ang suliranin — hal., mababang antas ng pag-unawa sa pagbasa (reading comprehension), kahirapan sa paglutas ng fractions, mababang attendance…"
              style={{ ...fieldStyle, height: 'auto', resize: 'vertical', lineHeight: 1.6, padding: '10px 12px' }}
              onFocus={focus}
              onBlur={blur}
            />
            <p style={{ margin: '6px 0 0', fontSize: 11.5, color: 'var(--kt-text-secondary, #6E6455)', fontFamily: 'var(--kt-font-mono, monospace)' }}>
              Mag-type ng hindi bababa sa 20 characters upang makabuo ng AI suggestions at mga pamagat.
            </p>
          </div>
        </div>

        {/* AI problem statement suggestion (free, debounced) */}
        {(aiLoading || aiSuggestion) && (
          <div style={{
            background: 'var(--kt-card-2, #F4EDDB)',
            border: '1px solid var(--kt-manila-border, #C9B583)',
            borderRadius: 'var(--kt-radius-md, 6px)',
            padding: '20px 22px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 12 }}>
              <Sparkles size={15} color="var(--kt-chalkboard, #1F3A2E)" />
              <span style={{
                fontSize: 11.5,
                fontWeight: 700,
                color: 'var(--kt-chalkboard, #1F3A2E)',
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                fontFamily: 'var(--kt-font-mono, monospace)',
              }}>
                Mungkahi ng AI Assistant (Problem & Interventions)
              </span>
              {aiLoading && <Loader2 size={13} color="var(--kt-text-secondary)" style={{ animation: 'spin 1s linear infinite', marginLeft: 4 }} />}
            </div>

            {aiSuggestion && (
              <>
                <div style={{
                  background: 'var(--kt-card, #FBF7EC)',
                  borderRadius: 'var(--kt-radius-sm, 4px)',
                  border: '1px solid var(--kt-border, #DCD0AE)',
                  padding: '12px 14px',
                  marginBottom: 12,
                }}>
                  <p style={{ margin: '0 0 4px', fontSize: 10.5, fontWeight: 700, color: 'var(--kt-text-secondary, #6E6455)', textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: 'var(--kt-font-mono, monospace)' }}>
                    Pormal na Pahayag ng Suliranin (Problem Statement)
                  </p>
                  <p style={{ margin: 0, fontSize: 13.5, color: 'var(--kt-text-primary, #262119)', lineHeight: 1.6 }}>
                    {aiSuggestion.problemStatement}
                  </p>
                </div>

                {aiSuggestion.interventions?.length > 0 && (
                  <>
                    <p style={{ margin: '0 0 8px', fontSize: 10.5, fontWeight: 700, color: 'var(--kt-text-secondary, #6E6455)', textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: 'var(--kt-font-mono, monospace)' }}>
                      Iminungkahing Interbensyon (Suggested Interventions)
                    </p>
                    {aiSuggestion.interventions.map((t, i) => (
                      <div key={i} style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: 10,
                        background: 'var(--kt-card, #FBF7EC)',
                        borderRadius: 'var(--kt-radius-sm, 4px)',
                        border: '1px solid var(--kt-border, #DCD0AE)',
                        padding: '10px 12px',
                        marginBottom: 6,
                      }}>
                        <div style={{
                          width: 20,
                          height: 20,
                          borderRadius: '50%',
                          background: 'var(--kt-chalkboard, #1F3A2E)',
                          color: '#FBF7EC',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: 10,
                          fontWeight: 700,
                          flexShrink: 0,
                          marginTop: 1,
                        }}>
                          {i + 1}
                        </div>
                        <p style={{ margin: 0, fontSize: 13, color: 'var(--kt-text-primary, #262119)', lineHeight: 1.5 }}>
                          {t}
                        </p>
                      </div>
                    ))}
                  </>
                )}
              </>
            )}
          </div>
        )}

        {/* 3. Generate and choose research title */}
        <div style={{
          background: 'var(--kt-card, #FBF7EC)',
          borderRadius: 'var(--kt-radius-md, 6px)',
          border: '1px solid var(--kt-border, #DCD0AE)',
          padding: '24px',
          boxShadow: '0 2px 8px rgba(38, 33, 25, 0.04)',
        }}>
          <h2 style={{
            margin: '0 0 4px',
            fontSize: 17,
            fontWeight: 700,
            color: 'var(--kt-text-primary, #262119)',
            fontFamily: 'var(--kt-font-heading, "Bitter", serif)',
          }}>
            3. Pumili ng Pamagat ng Pananaliksik (Research Title)
          </h2>
          <p style={{ margin: '0 0 18px', fontSize: 13, color: 'var(--kt-text-secondary, #6E6455)', lineHeight: 1.5 }}>
            Bumuo ng 5 AI-suggested titles batay sa iyong BERA theme at inilarawang suliranin, pagkatapos ay pumili ng isa.
          </p>

          {problemText.trim().length < 20 ? (
            <p style={{ fontSize: 13, color: 'var(--kt-text-secondary, #6E6455)', fontStyle: 'italic' }}>
              Mangyaring kumpletuhin muna ang paglalarawan ng suliranin sa itaas.
            </p>
          ) : (
            <button
              onClick={handleGenerateTitles}
              disabled={titlesLoading}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                background: titlesLoading ? 'var(--kt-border, #DCD0AE)' : 'var(--kt-chalkboard, #1F3A2E)',
                color: '#FBF7EC',
                border: 'none',
                borderRadius: 'var(--kt-radius-sm, 4px)',
                padding: '10px 18px',
                fontSize: 13,
                fontWeight: 700,
                cursor: titlesLoading ? 'not-allowed' : 'pointer',
                fontFamily: 'var(--kt-font-ui, "Inter", sans-serif)',
                marginBottom: researchTitles.length ? 16 : 0,
                transition: 'background 0.15s ease',
              }}
              onMouseEnter={e => { if (!titlesLoading) e.currentTarget.style.background = 'var(--kt-chalkboard-hover, #2B4E3E)'; }}
              onMouseLeave={e => { if (!titlesLoading) e.currentTarget.style.background = 'var(--kt-chalkboard, #1F3A2E)'; }}
            >
              {titlesLoading ? (
                <>
                  <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> Bumubuo ng mga pamagat…
                </>
              ) : (
                <>
                  <Sparkles size={14} />
                  Bumuo ng mga Pamagat (Generate Titles){!freeMode && ' (5 tokens)'}
                </>
              )}
            </button>
          )}
          {titlesLoading && statusMsg && (
            <p style={{ margin: '10px 0 0', fontSize: 12.5, color: 'var(--kt-text-secondary, #6E6455)' }}>
              {statusMsg}
            </p>
          )}

          {researchTitles.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {researchTitles.map((title, i) => {
                const active = selectedTitle === title;
                return (
                  <button
                    key={i}
                    onClick={() => setSelectedTitle(title)}
                    style={{
                      textAlign: 'left',
                      fontFamily: 'inherit',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: 12,
                      background: active ? 'var(--kt-manila, #E4D5AC)' : 'var(--kt-card-2, #F4EDDB)',
                      border: active ? '1px solid var(--kt-manila-border, #C9B583)' : '1px solid var(--kt-border, #DCD0AE)',
                      borderRadius: 'var(--kt-radius-sm, 4px)',
                      padding: '14px 16px',
                      transition: 'border-color 0.15s, background 0.15s',
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
                    <div style={{
                      width: 20,
                      height: 20,
                      borderRadius: '50%',
                      border: active ? 'none' : '2px solid var(--kt-border, #DCD0AE)',
                      background: active ? 'var(--kt-chalkboard, #1F3A2E)' : 'transparent',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                      marginTop: 2,
                    }}>
                      {active && <CheckCircle2 size={14} color="#FBF7EC" />}
                    </div>
                    <p style={{
                      margin: 0,
                      fontSize: 13.5,
                      color: 'var(--kt-text-primary, #262119)',
                      lineHeight: 1.6,
                      fontWeight: active ? 700 : 500,
                      fontFamily: active ? 'var(--kt-font-heading, "Bitter", serif)' : 'inherit',
                    }}>
                      {title}
                    </p>
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
