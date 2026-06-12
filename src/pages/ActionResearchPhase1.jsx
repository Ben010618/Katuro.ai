import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BookOpen, ShieldCheck, Users, Scale,
  ChevronRight, Sparkles, AlertTriangle, X,
  Loader2, FlaskConical,
} from 'lucide-react';
import { useAuth }      from '../hooks/useAuth';
import { db }           from '../firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { getGeminiKey } from '../services/geminiConfig';
import ktLogo           from '../assets/KT Favicon.png';

/* ── Data ────────────────────────────────────────────────────────────────── */

const BERA_THEMES = [
  {
    id:          'teaching-learning',
    name:        'Teaching & Learning',
    Icon:        BookOpen,
    description: 'Strategies to improve literacy and numeracy, innovative teaching practices, curriculum localization',
    tags:        ['Literacy', 'Numeracy', 'Pedagogy', 'Curriculum'],
  },
  {
    id:          'child-protection',
    name:        'Child Protection',
    Icon:        ShieldCheck,
    description: 'Policies and interventions for learner welfare, bullying prevention, and school safety operations',
    tags:        ['Bullying', 'Welfare', 'Safety'],
  },
  {
    id:          'hrd',
    name:        'Human Resource Development',
    Icon:        Users,
    description: 'Professional development, teacher wellness, and capacity building for teaching and non-teaching personnel',
    tags:        ['PD', 'Wellness', 'Capacity building'],
  },
  {
    id:          'governance',
    name:        'Governance',
    Icon:        Scale,
    description: 'Cross-cutting themes — DRRM, Gender and Development (GAD), inclusive education',
    tags:        ['DRRM', 'GAD', 'Inclusion'],
  },
];

const GRADE_LEVELS = [
  'Kinder',
  'Grade 1','Grade 2','Grade 3','Grade 4','Grade 5','Grade 6',
  'Grade 7','Grade 8','Grade 9','Grade 10',
  'Grade 11','Grade 12',
];

const SUBJECTS = [
  'English','Filipino','Mathematics','Science',
  'Araling Panlipunan','MAPEH','TLE','Values Education','ESP',
];

const STEPS = [
  'BERA theme & problem',
  'Research questions',
  'Literature review',
  'Action plan',
  'Data collection',
  'Findings & report',
];

const BERF_THEMES = new Set(['teaching-learning', 'governance']);

/* ── Responsive CSS ──────────────────────────────────────────────────────── */

const CSS = `
  .ar-theme-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 14px;
  }
  .ar-bottom-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }
  @media (max-width: 640px) {
    .ar-theme-grid { grid-template-columns: 1fr; }
    .ar-bottom-bar { flex-direction: column; align-items: stretch; }
    .ar-theme-badge { display: none !important; }
    .ar-next-btn   { width: 100%; justify-content: center; }
  }
`;

/* ── Gemini call ─────────────────────────────────────────────────────────── */

async function fetchAISuggestion(problemText, themeName) {
  const key = await getGeminiKey();
  const prompt = `You are a DepEd action research assistant. Based on this teacher-observed problem: "${problemText}", and BERA theme: "${themeName}", generate: (1) a clean, formal problem statement in 1–2 sentences suitable for a DepEd action research paper, and (2) three specific intervention suggestions aligned to the BERA theme. Return JSON only, no markdown: { "problemStatement": "...", "interventions": ["...", "...", "..."] }`;

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`,
    {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature:      0.4,
          maxOutputTokens:  512,
          thinkingConfig:   { thinkingBudget: 0 },
        },
      }),
    }
  );
  if (!res.ok) throw new Error(`AI error ${res.status}`);
  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('No JSON in response');
  return JSON.parse(match[0]);
}

/* ── Inline styles ───────────────────────────────────────────────────────── */

const fieldStyle = {
  width: '100%', boxSizing: 'border-box',
  padding: '10px 12px',
  border: '1.5px solid rgba(45,106,79,0.2)', borderRadius: 8,
  fontSize: 14, background: '#f5faf7', color: '#163828',
  outline: 'none', fontFamily: 'inherit',
  transition: 'border 0.15s, box-shadow 0.15s',
};
const labelStyle = {
  display: 'block', fontSize: 11, fontWeight: 700,
  color: '#4a6357', textTransform: 'uppercase',
  letterSpacing: '0.07em', marginBottom: 6,
};

/* ── Component ───────────────────────────────────────────────────────────── */

export default function ActionResearchPhase1() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [selectedTheme,  setSelectedTheme]  = useState('teaching-learning');
  const [gradeLevel,     setGradeLevel]     = useState('');
  const [subjectArea,    setSubjectArea]    = useState('');
  const [schoolYear,     setSchoolYear]     = useState('');
  const [schoolName,     setSchoolName]     = useState('');
  const [problemText,    setProblemText]    = useState('');
  const [aiSuggestion,   setAiSuggestion]   = useState(null);
  const [aiLoading,      setAiLoading]      = useState(false);
  const [berfDismissed,  setBerfDismissed]  = useState(false);
  const [saving,         setSaving]         = useState(false);
  const [error,          setError]          = useState('');

  const debounceTimer = useRef(null);

  const currentTheme = BERA_THEMES.find(t => t.id === selectedTheme);

  // Debounced AI suggestion
  const triggerAI = useCallback((text, themeId) => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    if (!text.trim() || text.trim().length < 20) {
      setAiSuggestion(null);
      return;
    }
    debounceTimer.current = setTimeout(async () => {
      const theme = BERA_THEMES.find(t => t.id === themeId);
      if (!theme) return;
      setAiLoading(true);
      try {
        const result = await fetchAISuggestion(text, theme.name);
        setAiSuggestion(result);
      } catch {
        // silent — don't block the form on AI failure
      } finally {
        setAiLoading(false);
      }
    }, 800);
  }, []);

  useEffect(() => {
    triggerAI(problemText, selectedTheme);
    return () => { if (debounceTimer.current) clearTimeout(debounceTimer.current); };
  }, [problemText, selectedTheme, triggerAI]);

  // Reset BERF banner when theme changes
  useEffect(() => { setBerfDismissed(false); }, [selectedTheme]);

  const canProceed = selectedTheme && problemText.trim().length > 0;

  async function handleNext() {
    if (!canProceed || !user?.uid) return;
    setSaving(true);
    setError('');
    try {
      const ref = await addDoc(
        collection(db, 'teachers', user.uid, 'actionResearch'),
        {
          phase:               1,
          status:              'in-progress',
          beraTheme:           selectedTheme,
          gradeLevel,
          subjectArea,
          schoolYear,
          schoolName,
          problemText,
          aiProblemStatement:  aiSuggestion?.problemStatement ?? '',
          selectedIntervention: null,
          createdAt:           serverTimestamp(),
          updatedAt:           serverTimestamp(),
        }
      );
      navigate(`/action-research/phase-2/${ref.id}`);
    } catch (err) {
      setError('Failed to save. Please try again.');
      console.error(err);
    } finally {
      setSaving(false);
    }
  }

  const showBerfAlert = BERF_THEMES.has(selectedTheme) && !berfDismissed;

  /* ── Render ─────────────────────────────────────────────────────────── */
  return (
    <>
      <style>{CSS}</style>

      <div style={{
        minHeight: '100vh', background: '#f5faf7',
        display: 'flex', flexDirection: 'column',
        fontFamily: '"Plus Jakarta Sans", sans-serif',
      }}>

        {/* ── Top bar ─────────────────────────────────────────────────── */}
        <div style={{
          background: '#fff',
          borderBottom: '1px solid rgba(45,106,79,0.12)',
          padding: '14px 28px',
          display: 'flex', alignItems: 'center', gap: 14,
          flexShrink: 0,
        }}>
          {/* Logo chip */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            background: '#d8f3dc', borderRadius: 8, padding: '5px 10px',
          }}>
            <img src={ktLogo} alt="kaTuro" style={{ width: 20, height: 20, borderRadius: 5, objectFit: 'cover' }} />
            <span style={{ fontSize: 12, fontWeight: 700, color: '#1a3d2b' }}>kaTuro</span>
          </div>

          <div>
            <p style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#0d2218', lineHeight: 1.2 }}>
              Action Research Partner
            </p>
            <p style={{ margin: 0, fontSize: 12, color: '#4a6357', marginTop: 2 }}>New research</p>
          </div>
        </div>

        {/* ── Step breadcrumb ──────────────────────────────────────────── */}
        <div style={{
          background: '#fff',
          borderBottom: '1px solid rgba(45,106,79,0.08)',
          padding: '12px 28px',
          overflowX: 'auto',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 0, minWidth: 'max-content' }}>
            {STEPS.map((step, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{
                    width: 22, height: 22, borderRadius: '50%',
                    background: i === 0 ? '#2d6a4f' : 'rgba(45,106,79,0.12)',
                    color: i === 0 ? '#fff' : '#9bb8ac',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 11, fontWeight: 700, flexShrink: 0,
                  }}>{i + 1}</div>
                  <span style={{
                    fontSize: 12, fontWeight: i === 0 ? 600 : 400,
                    color: i === 0 ? '#1a3d2b' : '#9bb8ac',
                    whiteSpace: 'nowrap',
                  }}>
                    {step}
                  </span>
                </div>
                {i < STEPS.length - 1 && (
                  <ChevronRight size={13} style={{ margin: '0 8px', color: '#c8ddd4', flexShrink: 0 }} />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* ── Scrollable content ───────────────────────────────────────── */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '28px 28px 120px' }}>
          <div style={{ maxWidth: 840, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 24 }}>

            {/* BERF grant alert */}
            {showBerfAlert && (
              <div style={{
                background: '#fffbeb',
                border: '1px solid #f59e0b',
                borderRadius: 10,
                padding: '13px 16px',
                display: 'flex', alignItems: 'flex-start', gap: 10,
              }}>
                <AlertTriangle size={16} color="#d97706" style={{ flexShrink: 0, marginTop: 1 }} />
                <div style={{ flex: 1 }}>
                  <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: '#92400e' }}>
                    Possible BERF grant alignment
                  </p>
                  <p style={{ margin: '3px 0 0', fontSize: 12, color: '#78350f', lineHeight: 1.5 }}>
                    Your topic may align with BERF grant funding priorities. Completing this research could qualify you to apply.
                  </p>
                </div>
                <button
                  onClick={() => setBerfDismissed(true)}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: '#92400e', padding: 2, flexShrink: 0,
                    display: 'flex', alignItems: 'center',
                  }}
                >
                  <X size={14} />
                </button>
              </div>
            )}

            {/* Section: BERA theme ────────────────────────────────────── */}
            <div style={{
              background: '#fff', borderRadius: 14,
              border: '1px solid rgba(45,106,79,0.12)', padding: '22px 24px',
            }}>
              <p style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 700, color: '#0d2218' }}>
                1. Select your BERA theme
              </p>
              <p style={{ margin: '0 0 18px', fontSize: 13, color: '#4a6357', lineHeight: 1.5 }}>
                Choose the research area that matches the problem you want to address in your classroom or school.
              </p>

              <div className="ar-theme-grid">
                {BERA_THEMES.map(({ id, name, Icon, description, tags }) => {
                  const active = selectedTheme === id;
                  return (
                    <button
                      key={id}
                      onClick={() => setSelectedTheme(id)}
                      style={{
                        textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit',
                        background: active ? '#f0f9f4' : '#fafafa',
                        border: active ? '2px solid #2d6a4f' : '1.5px solid rgba(45,106,79,0.15)',
                        borderRadius: 12, padding: '16px',
                        transition: 'border 0.15s, background 0.15s',
                        position: 'relative',
                      }}
                      onMouseEnter={e => { if (!active) e.currentTarget.style.background = '#f5faf7'; }}
                      onMouseLeave={e => { if (!active) e.currentTarget.style.background = '#fafafa'; }}
                    >
                      {active && (
                        <div style={{
                          position: 'absolute', top: 10, right: 10,
                          background: '#2d6a4f', color: '#fff',
                          fontSize: 10, fontWeight: 700,
                          borderRadius: 20, padding: '2px 8px',
                        }}>
                          Selected
                        </div>
                      )}
                      <div style={{
                        width: 38, height: 38, borderRadius: 9,
                        background: active ? 'rgba(45,106,79,0.12)' : 'rgba(45,106,79,0.07)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        marginBottom: 10,
                      }}>
                        <Icon size={18} color={active ? '#2d6a4f' : '#4a6357'} />
                      </div>
                      <p style={{
                        margin: '0 0 5px', fontSize: 13, fontWeight: 700,
                        color: active ? '#1a3d2b' : '#0d2218', lineHeight: 1.3,
                        paddingRight: active ? 52 : 0,
                      }}>
                        {name}
                      </p>
                      <p style={{
                        margin: '0 0 10px', fontSize: 12, color: '#4a6357', lineHeight: 1.5,
                      }}>
                        {description}
                      </p>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                        {tags.map(tag => (
                          <span key={tag} style={{
                            fontSize: 10, fontWeight: 600,
                            color: active ? '#1a3d2b' : '#4a6357',
                            background: active ? 'rgba(45,106,79,0.1)' : 'rgba(45,106,79,0.06)',
                            borderRadius: 20, padding: '2px 8px',
                          }}>
                            {tag}
                          </span>
                        ))}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Section: Problem form ──────────────────────────────────── */}
            <div style={{
              background: '#fff', borderRadius: 14,
              border: '1px solid rgba(45,106,79,0.12)', padding: '22px 24px',
            }}>
              <p style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 700, color: '#0d2218' }}>
                2. Describe the problem
              </p>
              <p style={{ margin: '0 0 20px', fontSize: 13, color: '#4a6357', lineHeight: 1.5 }}>
                Fill in the details of your classroom context and the problem you have observed.
              </p>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
                <div>
                  <label style={labelStyle}>Grade level</label>
                  <select
                    value={gradeLevel}
                    onChange={e => setGradeLevel(e.target.value)}
                    style={{ ...fieldStyle, height: 42 }}
                  >
                    <option value="">Select grade…</option>
                    {GRADE_LEVELS.map(g => <option key={g} value={g}>{g}</option>)}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Subject area</label>
                  <select
                    value={subjectArea}
                    onChange={e => setSubjectArea(e.target.value)}
                    style={{ ...fieldStyle, height: 42 }}
                  >
                    <option value="">Select subject…</option>
                    {SUBJECTS.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
                <div>
                  <label style={labelStyle}>School year</label>
                  <input
                    type="text"
                    value={schoolYear}
                    onChange={e => setSchoolYear(e.target.value)}
                    placeholder="2025–2026"
                    style={fieldStyle}
                    onFocus={e => { e.target.style.borderColor = '#2d6a4f'; e.target.style.boxShadow = '0 0 0 3px rgba(45,106,79,0.1)'; }}
                    onBlur={e  => { e.target.style.borderColor = 'rgba(45,106,79,0.2)'; e.target.style.boxShadow = 'none'; }}
                  />
                </div>
                <div>
                  <label style={labelStyle}>School name</label>
                  <input
                    type="text"
                    value={schoolName}
                    onChange={e => setSchoolName(e.target.value)}
                    placeholder="Mabini National High School"
                    style={fieldStyle}
                    onFocus={e => { e.target.style.borderColor = '#2d6a4f'; e.target.style.boxShadow = '0 0 0 3px rgba(45,106,79,0.1)'; }}
                    onBlur={e  => { e.target.style.borderColor = 'rgba(45,106,79,0.2)'; e.target.style.boxShadow = 'none'; }}
                  />
                </div>
              </div>

              <div>
                <label style={labelStyle}>
                  Observed classroom problem <span style={{ color: '#e05c5c' }}>*</span>
                </label>
                <textarea
                  rows={4}
                  value={problemText}
                  onChange={e => setProblemText(e.target.value)}
                  placeholder="Describe the specific problem you have observed in your class — e.g., low reading comprehension scores, high absenteeism, difficulty with fractions…"
                  style={{
                    ...fieldStyle,
                    height: 'auto', resize: 'vertical', lineHeight: 1.6,
                    padding: '10px 12px',
                  }}
                  onFocus={e => { e.target.style.borderColor = '#2d6a4f'; e.target.style.boxShadow = '0 0 0 3px rgba(45,106,79,0.1)'; }}
                  onBlur={e  => { e.target.style.borderColor = 'rgba(45,106,79,0.2)'; e.target.style.boxShadow = 'none'; }}
                />
                <p style={{ margin: '5px 0 0', fontSize: 11, color: '#9bb8ac' }}>
                  Type at least 20 characters to get an AI-suggested problem statement.
                </p>
              </div>
            </div>

            {/* Section: AI suggestion ─────────────────────────────────── */}
            {(aiLoading || aiSuggestion) && (
              <div style={{
                background: '#f0f9f4',
                border: '1.5px solid rgba(45,106,79,0.2)',
                borderRadius: 12, padding: '18px 20px',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 12 }}>
                  <Sparkles size={15} color="#2d6a4f" />
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#2d6a4f', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    AI suggestion
                  </span>
                  {aiLoading && <Loader2 size={13} color="#4a6357" style={{ animation: 'spin 1s linear infinite', marginLeft: 4 }} />}
                </div>

                {aiLoading && !aiSuggestion && (
                  <div style={{ display: 'flex', gap: 8, flexDirection: 'column' }}>
                    {[80, 60, 90].map(w => (
                      <div key={w} style={{
                        height: 10, borderRadius: 6,
                        background: 'rgba(45,106,79,0.1)',
                        width: `${w}%`,
                        animation: 'pulse 1.5s ease-in-out infinite',
                      }} />
                    ))}
                  </div>
                )}

                {aiSuggestion && (
                  <>
                    <div style={{
                      background: '#fff', borderRadius: 8,
                      border: '1px solid rgba(45,106,79,0.12)',
                      padding: '12px 14px', marginBottom: 14,
                    }}>
                      <p style={{ margin: '0 0 4px', fontSize: 11, fontWeight: 700, color: '#4a6357', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                        Suggested problem statement
                      </p>
                      <p style={{ margin: 0, fontSize: 13, color: '#163828', lineHeight: 1.65 }}>
                        {aiSuggestion.problemStatement}
                      </p>
                    </div>

                    <p style={{ margin: '0 0 10px', fontSize: 11, fontWeight: 700, color: '#4a6357', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                      Suggested interventions
                    </p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                      {(aiSuggestion.interventions ?? []).map((text, i) => (
                        <div key={i} style={{
                          display: 'flex', alignItems: 'flex-start', gap: 9,
                          background: '#fff', borderRadius: 8,
                          border: '1px solid rgba(45,106,79,0.12)',
                          padding: '10px 13px', cursor: 'default',
                        }}>
                          <div style={{
                            width: 20, height: 20, borderRadius: '50%', flexShrink: 0,
                            background: '#2d6a4f', color: '#fff',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 10, fontWeight: 700, marginTop: 1,
                          }}>
                            {i + 1}
                          </div>
                          <p style={{ margin: 0, fontSize: 13, color: '#163828', lineHeight: 1.55 }}>{text}</p>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Error */}
            {error && (
              <div style={{
                background: '#fde8e8', border: '1px solid rgba(224,92,92,0.3)',
                borderRadius: 8, padding: '10px 14px',
                fontSize: 13, color: '#c0392b', fontWeight: 500,
              }}>
                {error}
              </div>
            )}

          </div>
        </div>

        {/* ── Sticky bottom action bar ─────────────────────────────────── */}
        <div style={{
          position: 'sticky', bottom: 0, zIndex: 10,
          background: '#fff',
          borderTop: '1px solid rgba(45,106,79,0.12)',
          padding: '14px 28px',
          flexShrink: 0,
        }}>
          <div className="ar-bottom-bar" style={{ maxWidth: 840, margin: '0 auto' }}>
            {/* Cancel */}
            <button
              onClick={() => navigate('/dashboard')}
              style={{
                background: 'none', border: '1.5px solid rgba(45,106,79,0.2)',
                borderRadius: 8, padding: '9px 18px',
                fontSize: 13, fontWeight: 600, color: '#4a6357',
                cursor: 'pointer', fontFamily: 'inherit',
                display: 'flex', alignItems: 'center', gap: 6,
                transition: 'background 0.15s',
              }}
              onMouseEnter={e => e.currentTarget.style.background = '#f5faf7'}
              onMouseLeave={e => e.currentTarget.style.background = 'none'}
            >
              Cancel
            </button>

            {/* Current theme badge */}
            <div className="ar-theme-badge" style={{
              display: 'flex', alignItems: 'center', gap: 7,
              background: '#d8f3dc', borderRadius: 8, padding: '7px 14px',
            }}>
              {currentTheme && <currentTheme.Icon size={13} color="#1a3d2b" />}
              <span style={{ fontSize: 12, fontWeight: 600, color: '#1a3d2b' }}>
                {currentTheme?.name ?? 'No theme selected'}
              </span>
            </div>

            {/* Next */}
            <button
              className="ar-next-btn"
              onClick={handleNext}
              disabled={!canProceed || saving}
              style={{
                background: canProceed && !saving ? '#2d6a4f' : 'rgba(45,106,79,0.35)',
                color: '#fff', border: 'none', borderRadius: 8,
                padding: '10px 22px', fontSize: 13, fontWeight: 600,
                cursor: canProceed && !saving ? 'pointer' : 'not-allowed',
                fontFamily: 'inherit',
                display: 'flex', alignItems: 'center', gap: 7,
                transition: 'background 0.15s',
              }}
              onMouseEnter={e => { if (canProceed && !saving) e.currentTarget.style.background = '#1b4d37'; }}
              onMouseLeave={e => { if (canProceed && !saving) e.currentTarget.style.background = '#2d6a4f'; }}
            >
              {saving
                ? <><Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> Saving…</>
                : <>Next: Research questions <ChevronRight size={15} /></>}
            </button>
          </div>
        </div>

      </div>
    </>
  );
}
