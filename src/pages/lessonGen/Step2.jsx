import { useState, useEffect } from 'react';
import { Loader2, AlertCircle } from 'lucide-react';
import { useLessonGenStore } from '../../store/lessonGenStore';
import { unpackCompetency } from '../../services/ai';

const BLOOMS_COLORS = {
  Remember:   { bg: '#ccfbf1', text: '#0f766e', border: '#0f766e' },
  Understand: { bg: '#e0f2fe', text: '#0369a1', border: '#0369a1' },
  Apply:      { bg: '#ede9fe', text: '#6d28d9', border: '#6d28d9' },
  Analyze:    { bg: 'rgba(232,163,32,0.12)', text: '#b45309', border: '#b45309' },
  Evaluate:   { bg: '#fde8e8', text: '#e05c5c', border: '#e05c5c' },
  Create:     { bg: '#d8f3dc', text: '#1a3d2b', border: '#2d6a4f' },
};

const inputStyle = {
  width: '100%', boxSizing: 'border-box',
  border: '1px solid rgba(45,106,79,0.2)',
  borderRadius: 10, padding: '10px 14px',
  fontSize: 15, color: '#0d2218',
  background: '#f5faf7',
  outline: 'none', transition: 'border-color 0.15s, box-shadow 0.15s',
  fontFamily: 'inherit',
};

export default function Step2() {
  const store = useLessonGenStore();

  const [competencyText,   setCompetencyText]   = useState(store.competencyText    || '');
  const [content,          setContent]          = useState(store.content           || '');
  const [contentStandards, setContentStandards] = useState(store.contentStandards  || '');
  const [learningContext,  setLearningContext]  = useState(store.learningContext   || '');
  const [lessonName,       setLessonName]       = useState(store.lessonName        || '');
  const [contribute,       setContribute]       = useState(false);

  const [ctError, setCtError] = useState(false);
  const [lnError, setLnError] = useState(false);
  const [ctShake, setCtShake] = useState(false);
  const [lnShake, setLnShake] = useState(false);

  const [unpackState,  setUnpackState]  = useState(store.unpackedSessions?.length > 0 ? 'success' : 'idle');
  const [unpackError,  setUnpackError]  = useState(null);
  const [unpackResult, setUnpackResult] = useState(
    store.unpackedSessions?.length > 0
      ? { competencyCeiling: store.competencyCeiling, fullLadder: store.fullLadder, sessions: store.unpackedSessions }
      : null
  );

  const n    = store.selectedDays.length;
  const days = store.selectedDays;

  useEffect(() => {
    store.setStep2({ competencyText, content, contentStandards, learningContext, lessonName });
  }, [competencyText, content, contentStandards, learningContext, lessonName]);

  function triggerShake(field) {
    if (field === 'ct') { setCtShake(true); setTimeout(() => setCtShake(false), 500); }
    else                { setLnShake(true); setTimeout(() => setLnShake(false), 500); }
  }

  async function handleUnpack() {
    let hasError = false;
    if (!competencyText.trim()) { setCtError(true); triggerShake('ct'); hasError = true; } else setCtError(false);
    if (!lessonName.trim())     { setLnError(true); triggerShake('ln'); hasError = true; } else setLnError(false);
    if (hasError) return;
    await runUnpack(0);
  }

  async function runUnpack(attempt) {
    setUnpackState('loading');
    setUnpackError(null);
    setUnpackResult(null);

    const selectedDates = days.map(iso => {
      try {
        return new Date(iso + 'T00:00').toLocaleDateString('en-US', {
          weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
        });
      } catch { return iso; }
    });

    try {
      const result = await unpackCompetency({
        competencyText:   competencyText.trim(),
        content:          content.trim(),
        contentStandards: contentStandards.trim(),
        learningContext:  learningContext.trim(),
        subject:          store.subject    || 'Science',
        gradeLevel:       store.gradeLevel || 'Grade 7',
        term:             store.term       || 'Term 1',
        numberOfDays:     days.length || 1,
        selectedDates,
      });
      setUnpackResult(result);
      setUnpackState('success');
      store.setCompetencyText(competencyText.trim());
      store.setLessonName(lessonName.trim());
      store.setCompetencyCeiling(result.competencyCeiling);
      store.setFullLadder(result.fullLadder);
      store.setUnpackedSessions(result.sessions);
    } catch (err) {
      console.error('Unpack error (attempt', attempt, '):', err);
      if (attempt === 0) {
        await new Promise(r => setTimeout(r, 1200));
        await runUnpack(1);
      } else {
        setUnpackState('error');
        setUnpackError(err.message);
      }
    }
  }

  function handleReunpack() {
    setUnpackState('idle');
    setUnpackResult(null);
    store.setStep2({ competencyCeiling: '', fullLadder: [], unpackedSessions: [] });
  }

  const isReady   = !!(competencyText.trim() && lessonName.trim());
  const isLoading = unpackState === 'loading';
  const isSuccess = unpackState === 'success';
  const isError   = unpackState === 'error';
  const sessions  = unpackResult?.sessions || [];

  return (
    <>
      <style>{`
        @keyframes shake {
          0%,100%{ transform:translateX(0); }
          20%    { transform:translateX(-6px); }
          40%    { transform:translateX(6px); }
          60%    { transform:translateX(-4px); }
          80%    { transform:translateX(4px); }
        }
        .field-shake { animation: shake 0.45s ease; }
        @keyframes resultFadeUp {
          from { opacity:0; transform:translateY(16px); }
          to   { opacity:1; transform:translateY(0); }
        }
        .result-in { animation: resultFadeUp 0.3s ease-out forwards; }
      `}</style>

      <div style={{ maxWidth: 720, margin: '0 auto' }}>

        {/* Phase badge + heading */}
        <div style={{ marginBottom: 28 }}>
          <span style={{ background: '#ede9fe', color: '#7c3aed', borderRadius: 20, padding: '4px 12px', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px' }}>
            Phase 2 — Competency
          </span>
          <h2 style={{ margin: '10px 0 6px', fontSize: 22, fontWeight: 600, color: '#0d2218' }}>
            What will you teach this week?
          </h2>
          <p style={{ margin: 0, fontSize: 15, color: '#4a6357', lineHeight: 1.65, maxWidth: 560 }}>
            Paste your learning competency from the MATATAG Curriculum Guide. kaTuro AI will
            detect its cognitive level and unpack it across your{' '}
            <strong style={{ color: '#0d2218' }}>{n > 0 ? n : '—'}</strong>{' '}
            selected teaching day{n !== 1 ? 's' : ''}.
          </p>
        </div>

        {/* The card */}
        <div style={{
          background: '#fff', borderRadius: 14,
          border: '1px solid rgba(45,106,79,0.12)', borderTop: '3px solid #1a3d2b',
          padding: '24px', marginBottom: 20,
        }}>
          <p style={{ margin: '0 0 4px', fontSize: 11, fontWeight: 700, color: '#4a6357', textTransform: 'uppercase', letterSpacing: '1.2px' }}>
            MATATAG Curriculum Guide Reference
          </p>
          <p style={{ margin: '0 0 16px', fontSize: 13, color: '#4a6357' }}>
            Based on {store.subject || 'your subject'} · {store.gradeLevel || 'your grade'} · {store.term || 'your term'} from Step 1
          </p>
          <div style={{ borderTop: '1px solid rgba(45,106,79,0.08)', marginBottom: 20 }} />

          {/* Content Standards */}
          <div style={{ marginBottom: 18 }}>
            <label style={{ display: 'block', marginBottom: 4, fontSize: 13, fontWeight: 600, color: '#0d2218' }}>
              Content Standards
            </label>
            <p style={{ margin: '0 0 8px', fontSize: 13, color: '#4a6357', lineHeight: 1.65 }}>
              Paste the content standards from the Curriculum Guide (optional but improves AI output).
            </p>
            <textarea
              rows={3}
              value={contentStandards}
              onChange={e => setContentStandards(e.target.value)}
              placeholder="e.g. The learner demonstrates understanding of the factors that affect chemical reactions…"
              style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.65 }}
              onFocus={e => { e.target.style.borderColor = '#52b788'; e.target.style.boxShadow = '0 0 0 2px rgba(82,183,136,0.25)'; }}
              onBlur={e  => { e.target.style.borderColor = 'rgba(45,106,79,0.2)'; e.target.style.boxShadow = 'none'; }}
            />
          </div>

          {/* Content */}
          <div style={{ marginBottom: 18 }}>
            <label style={{ display: 'block', marginBottom: 4, fontSize: 13, fontWeight: 600, color: '#0d2218' }}>
              Content
            </label>
            <p style={{ margin: '0 0 8px', fontSize: 13, color: '#4a6357', lineHeight: 1.65 }}>
              The specific subject matter / topic from the Curriculum Guide (optional).
            </p>
            <input
              type="text"
              value={content}
              onChange={e => setContent(e.target.value)}
              placeholder="e.g. Indicators of Chemical Reactions"
              style={inputStyle}
              onFocus={e => { e.target.style.borderColor = '#52b788'; e.target.style.boxShadow = '0 0 0 2px rgba(82,183,136,0.25)'; }}
              onBlur={e  => { e.target.style.borderColor = 'rgba(45,106,79,0.2)'; e.target.style.boxShadow = 'none'; }}
            />
          </div>

          {/* Learning Competency */}
          <div style={{ marginBottom: 18 }}>
            <label style={{ display: 'block', marginBottom: 4, fontSize: 13, fontWeight: 600, color: '#0d2218' }}>
              Learning Competency <span style={{ color: '#e05c5c' }}>*</span>
            </label>
            <p style={{ margin: '0 0 8px', fontSize: 13, color: '#4a6357', lineHeight: 1.65 }}>
              Paste the competency exactly as written in your Curriculum Guide. AI will detect
              its cognitive level and unpack it across your {n > 0 ? n : '—'} teaching day{n !== 1 ? 's' : ''}.
            </p>
            <textarea
              rows={5}
              value={competencyText}
              onChange={e => { setCompetencyText(e.target.value); if (ctError && e.target.value.trim()) setCtError(false); }}
              placeholder={`Paste your learning competency here...\n\nExamples:\n· describe the indicators for a chemical reaction as color change, formation of a precipitate, release of gas, and/or odor, or a change in temperature;\n\n· investigate the factors affecting the rate of a chemical reaction;`}
              className={ctShake ? 'field-shake' : ''}
              style={{
                ...inputStyle,
                border: `1px solid ${ctError ? '#e05c5c' : 'rgba(45,106,79,0.2)'}`,
                background: ctError ? '#fde8e8' : '#f5faf7',
                resize: 'vertical', lineHeight: 1.65,
              }}
              onFocus={e => { if (!ctError) { e.target.style.borderColor = '#52b788'; e.target.style.boxShadow = '0 0 0 2px rgba(82,183,136,0.25)'; } }}
              onBlur={e  => { if (!ctError) { e.target.style.borderColor = 'rgba(45,106,79,0.2)'; e.target.style.boxShadow = 'none'; } }}
            />
            {ctError && <p style={{ margin: '4px 0 0', fontSize: 12, color: '#e05c5c', fontWeight: 600 }}>This is required</p>}
          </div>

          {/* Learning Context (Optional) */}
          <div style={{ marginBottom: 18 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <label style={{ fontSize: 13, fontWeight: 600, color: '#0d2218' }}>
                Learning Context
              </label>
              <span style={{
                background: 'rgba(232,163,32,0.15)', color: '#92400e',
                borderRadius: 20, padding: '2px 9px',
                fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em',
              }}>
                Optional — Personalizes the AI output
              </span>
            </div>
            <p style={{ margin: '0 0 8px', fontSize: 13, color: '#4a6357', lineHeight: 1.65 }}>
              Describe your school, classroom, or community situation. When filled, the AI will tailor
              activities, examples, and assessments to your specific context — not generic ones.
            </p>
            <textarea
              rows={3}
              value={learningContext}
              onChange={e => setLearningContext(e.target.value)}
              placeholder={`Examples:\n· Rural school with limited lab equipment — activities should use locally available materials\n· Coastal community in Quezon Province — connect examples to fishing and marine life\n· Urban school in Cebu with access to tablets and internet\n· Multilingual class — some learners are Bisaya-dominant`}
              style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.65, borderColor: learningContext.trim() ? 'rgba(232,163,32,0.5)' : 'rgba(45,106,79,0.2)', background: learningContext.trim() ? '#fffbeb' : '#f5faf7' }}
              onFocus={e => { e.target.style.borderColor = '#d97706'; e.target.style.boxShadow = '0 0 0 2px rgba(217,119,6,0.2)'; }}
              onBlur={e  => { e.target.style.borderColor = learningContext.trim() ? 'rgba(232,163,32,0.5)' : 'rgba(45,106,79,0.2)'; e.target.style.boxShadow = 'none'; }}
            />
            {learningContext.trim() && (
              <p style={{ margin: '5px 0 0', fontSize: 12, color: '#b45309', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
                ✦ AI will contextualize this lesson to your setting
              </p>
            )}
          </div>

          {/* Name of Lesson */}
          <div style={{ marginBottom: 20 }}>
            <label style={{ display: 'block', marginBottom: 4, fontSize: 13, fontWeight: 600, color: '#0d2218' }}>
              Name of Lesson <span style={{ color: '#e05c5c' }}>*</span>
            </label>
            <input
              type="text"
              value={lessonName}
              onChange={e => { setLessonName(e.target.value); if (lnError && e.target.value.trim()) setLnError(false); }}
              placeholder="e.g. Indicators of Chemical Reactions"
              className={lnShake ? 'field-shake' : ''}
              style={{
                ...inputStyle,
                border: `1px solid ${lnError ? '#e05c5c' : 'rgba(45,106,79,0.2)'}`,
                background: lnError ? '#fde8e8' : '#f5faf7',
              }}
              onFocus={e => { if (!lnError) { e.target.style.borderColor = '#52b788'; e.target.style.boxShadow = '0 0 0 2px rgba(82,183,136,0.25)'; } }}
              onBlur={e  => { if (!lnError) { e.target.style.borderColor = 'rgba(45,106,79,0.2)'; e.target.style.boxShadow = 'none'; } }}
            />
            {lnError && <p style={{ margin: '4px 0 0', fontSize: 12, color: '#e05c5c', fontWeight: 600 }}>This is required</p>}
            <p style={{ margin: '5px 0 0', fontSize: 12, color: '#4a6357' }}>
              This will appear as the lesson title in your ILAW document.
            </p>
          </div>

          {/* Unpack button */}
          {!isSuccess && (
            <button
              onClick={isLoading ? undefined : handleUnpack}
              style={{
                width: '100%', height: 48, marginTop: 8,
                background: isLoading ? '#1a3d2b' : isReady ? '#1a3d2b' : 'rgba(45,106,79,0.1)',
                color: isLoading ? '#fff' : isReady ? '#fff' : '#4a6357',
                border: 'none', borderRadius: 10,
                fontSize: 15, fontWeight: 600,
                cursor: isLoading ? 'not-allowed' : isReady ? 'pointer' : 'not-allowed',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                transition: 'background 0.15s',
                fontFamily: 'inherit',
              }}
              onMouseEnter={e => { if (isReady && !isLoading) e.currentTarget.style.background = '#2d6a4f'; }}
              onMouseLeave={e => { if (isReady && !isLoading) e.currentTarget.style.background = '#1a3d2b'; }}
            >
              {isLoading ? (
                <><Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />AI is detecting cognitive level…</>
              ) : isReady ? 'Unpack with AI →' : 'Paste a competency to continue'}
            </button>
          )}

          {/* Success bar */}
          {isSuccess && (
            <div style={{
              height: 48, marginTop: 8,
              background: '#f0faf5', border: '1px solid rgba(45,106,79,0.3)',
              borderRadius: 10, padding: '0 16px',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <span style={{ fontSize: 14, fontWeight: 600, color: '#1a3d2b' }}>
                ✓ Competency unpacked — {sessions.length} session{sessions.length !== 1 ? 's' : ''} ready
              </span>
              <span onClick={handleReunpack} style={{ fontSize: 12, color: '#4a6357', textDecoration: 'underline', cursor: 'pointer' }}>
                Re-unpack
              </span>
            </div>
          )}

          {/* Error state */}
          {isError && (
            <div style={{
              background: '#fde8e8', border: '1px solid rgba(224,92,92,0.3)',
              borderRadius: 10, padding: '12px 14px', marginTop: 10,
              display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10,
            }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                <AlertCircle size={15} color="#e05c5c" style={{ flexShrink: 0, marginTop: 1 }} />
                <div>
                  <p style={{ margin: '0 0 2px', fontSize: 13, color: '#e05c5c', fontWeight: 600, lineHeight: 1.5 }}>
                    ⚠ AI couldn't process this competency.
                  </p>
                  {unpackError && <p style={{ margin: 0, fontSize: 11, color: '#e05c5c', lineHeight: 1.5, opacity: 0.8, wordBreak: 'break-word' }}>{unpackError}</p>}
                </div>
              </div>
              <button
                onClick={() => runUnpack(0)}
                style={{
                  background: 'none', border: '1px solid #1a3d2b',
                  borderRadius: 8, padding: '5px 12px',
                  fontSize: 12, fontWeight: 600, color: '#1a3d2b',
                  cursor: 'pointer', flexShrink: 0, transition: 'background 0.12s',
                  fontFamily: 'inherit',
                }}
                onMouseEnter={e => e.currentTarget.style.background = '#f0faf5'}
                onMouseLeave={e => e.currentTarget.style.background = 'none'}
              >
                Try Again
              </button>
            </div>
          )}
        </div>

        {/* Results after successful unpack */}
        {isSuccess && unpackResult && (
          <div className="result-in">
            <div style={{
              background: '#d8f3dc', border: '1px solid rgba(45,106,79,0.2)',
              borderRadius: 10, padding: '12px 16px', marginBottom: 12,
            }}>
              <p style={{ margin: '0 0 4px', fontSize: 13, fontWeight: 600, color: '#1a3d2b' }}>
                AI detected: <strong>{unpackResult.competencyCeiling}</strong> level competency
              </p>
              <p style={{ margin: 0, fontSize: 13, color: '#4a6357' }}>
                Unpacked downward: {unpackResult.fullLadder.join(' → ')} → distributed across {sessions.length} session{sessions.length !== 1 ? 's' : ''}
              </p>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#0d2218' }}>Learning objectives per session</span>
              <span onClick={handleReunpack} style={{ fontSize: 12, color: '#4a6357', textDecoration: 'underline', cursor: 'pointer' }}>Re-unpack</span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {sessions.map((session, i) => {
                const bc = BLOOMS_COLORS[session.bloomsLevel] || BLOOMS_COLORS.Remember;
                return (
                  <div key={i} style={{
                    background: '#fff', border: '1px solid rgba(45,106,79,0.12)',
                    borderLeft: `3px solid ${bc.border}`,
                    borderRadius: 10, padding: '14px 16px',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: '#2d6a4f' }}>
                        Session {session.day} · {session.date}
                      </span>
                      <span style={{ background: bc.bg, color: bc.text, borderRadius: 20, padding: '2px 10px', fontSize: 11, fontWeight: 600, flexShrink: 0 }}>
                        {session.bloomsLevel}
                      </span>
                    </div>
                    <p style={{ margin: '8px 0 0', fontSize: 15, color: '#0d2218', lineHeight: 1.65 }}>
                      {session.objective}
                    </p>
                  </div>
                );
              })}
            </div>

            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginTop: 16 }}>
              <input
                type="checkbox" id="contribute" checked={contribute}
                onChange={e => setContribute(e.target.checked)}
                style={{ accentColor: '#1a3d2b', marginTop: 2, flexShrink: 0 }}
              />
              <label htmlFor="contribute" style={{ fontSize: 13, color: '#4a6357', cursor: 'pointer', lineHeight: 1.65 }}>
                Help other teachers — contribute this competency to kaTuro's library
              </label>
            </div>
          </div>
        )}

        <div style={{ height: 24 }} />
      </div>
    </>
  );
}
