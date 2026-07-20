import { useState } from 'react';
import { Loader2, AlertCircle, Plus, X } from 'lucide-react';
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

// One color per LC slot (up to 5)
const LC_COLORS = [
  { bg: '#d8f3dc', text: '#1a3d2b', border: '#2d6a4f', solid: '#52b788' },
  { bg: '#e0f2fe', text: '#0369a1', border: '#0284c7', solid: '#38bdf8' },
  { bg: 'rgba(232,163,32,0.15)', text: '#92400e', border: '#d97706', solid: '#fbbf24' },
  { bg: '#fde8e8', text: '#c0392b', border: '#e05c5c', solid: '#f87171' },
  { bg: '#ede9fe', text: '#6d28d9', border: '#7c3aed', solid: '#a78bfa' },
];

const inputStyle = {
  width: '100%', boxSizing: 'border-box',
  border: '1px solid rgba(45,106,79,0.2)',
  borderRadius: 10, padding: '10px 14px',
  fontSize: 15, color: 'var(--kt-text-primary)',
  background: 'var(--kt-input-bg)',
  outline: 'none', transition: 'border-color 0.15s, box-shadow 0.15s',
  fontFamily: 'inherit',
};

function formatDateLong(iso) {
  try {
    return new Date(iso + 'T00:00').toLocaleDateString('en-US', {
      weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
    });
  } catch { return iso; }
}

function bloomsBase(level) {
  return (level || '').split(/\s*[—\-]\s*/)[0].trim();
}

export default function Step2() {
  const store = useLessonGenStore();
  const n     = store.selectedDays.length;
  const days  = store.selectedDays;

  // ── Multi-competency state ──────────────────────────────────────────────────
  const [competencies, setCompetencies] = useState(
    store.competencies?.length > 0 ? store.competencies : [{ text: '', days: 1 }]
  );
  const [compErrors, setCompErrors] = useState(() =>
    (store.competencies?.length > 0 ? store.competencies : [{ text: '', days: 1 }]).map(() => false)
  );

  // ── Other fields ────────────────────────────────────────────────────────────
  const [content,          setContent]          = useState(store.content          || '');
  const [contentStandards, setContentStandards] = useState(store.contentStandards || '');
  const [learningContext,  setLearningContext]  = useState(store.learningContext  || '');
  const [lessonName,       setLessonName]       = useState(store.lessonName       || '');
  const [lnError,          setLnError]          = useState(false);
  const [lnShake,          setLnShake]          = useState(false);
  const [contribute,       setContribute]       = useState(false);

  // ── Unpack state ────────────────────────────────────────────────────────────
  const [unpackState,    setUnpackState]    = useState(store.unpackedSessions?.length > 0 ? 'success' : 'idle');
  const [unpackError,    setUnpackError]    = useState(null);
  const [sessions,       setSessions]       = useState(store.unpackedSessions?.length > 0 ? store.unpackedSessions : []);
  const [unpackProgress, setUnpackProgress] = useState(0); // 0-100

  // ── Derived ─────────────────────────────────────────────────────────────────
  const totalDaysUsed = competencies.reduce((s, c) => s + c.days, 0);
  const daysRemaining = n - totalDaysUsed;
  const canAddMore    = competencies.length < 5 && daysRemaining > 0;
  const atLimit       = daysRemaining <= 0;

  // ── Competency row operations ───────────────────────────────────────────────
  function addCompetency() {
    if (!canAddMore) return;
    setCompetencies(prev => [...prev, { text: '', days: 1 }]);
    setCompErrors(prev => [...prev, false]);
  }

  function removeCompetency(idx) {
    if (competencies.length === 1) return;
    setCompetencies(prev => prev.filter((_, i) => i !== idx));
    setCompErrors(prev => prev.filter((_, i) => i !== idx));
  }

  function updateText(idx, text) {
    setCompetencies(prev => prev.map((c, i) => i === idx ? { ...c, text } : c));
    if (compErrors[idx] && text.trim())
      setCompErrors(prev => prev.map((e, i) => i === idx ? false : e));
  }

  function updateDays(idx, newDays) {
    const oldDays = competencies[idx].days;
    if (totalDaysUsed - oldDays + newDays > n) return;
    setCompetencies(prev => prev.map((c, i) => i === idx ? { ...c, days: newDays } : c));
  }

  // Max days this row's dropdown can offer without exceeding the budget
  function maxDaysForRow(idx) {
    const otherDays = competencies.reduce((s, c, i) => i === idx ? s : s + c.days, 0);
    return Math.max(1, n - otherDays);
  }

  // ── Validation ──────────────────────────────────────────────────────────────
  function validate() {
    let ok = true;
    const errs = competencies.map(c => {
      const empty = !c.text.trim();
      if (empty) ok = false;
      return empty;
    });
    setCompErrors(errs);
    if (!lessonName.trim()) {
      setLnError(true); setLnShake(true);
      setTimeout(() => setLnShake(false), 500);
      ok = false;
    } else {
      setLnError(false);
    }
    return ok;
  }

  // ── Unpack ──────────────────────────────────────────────────────────────────
  async function handleUnpack() {
    if (!validate()) return;
    await runUnpack(0);
  }

  async function runUnpack(attempt) {
    setUnpackState('loading');
    setUnpackError(null);
    setSessions([]);
    setUnpackProgress(0);

    // Slice selectedDates per competency sequentially
    let offset = 0;
    const dateSlices = competencies.map(c => {
      const slice = days.slice(offset, offset + c.days).map(formatDateLong);
      offset += c.days;
      return slice;
    });

    try {
      const merged = [];
      let globalDay = 1;

      for (let ci = 0; ci < competencies.length; ci++) {
        if (ci > 0) await new Promise(r => setTimeout(r, 900));
        setUnpackProgress(Math.round((ci / competencies.length) * 85));

        const comp   = competencies[ci];
        const result = await unpackCompetency({
          competencyText:   comp.text.trim(),
          content:          content.trim(),
          contentStandards: contentStandards.trim(),
          learningContext:  learningContext.trim(),
          subject:          store.subject    || 'Science',
          gradeLevel:       store.gradeLevel || 'Grade 7',
          term:             store.term       || 'Term 1',
          numberOfDays:     comp.days,
          selectedDates:    dateSlices[ci],
          // This whole loop re-runs from competency 1 on retry (attempt 1) —
          // treat every call in that re-run as part of the same logical
          // "unpack this lesson" action so it isn't charged twice against
          // the daily limit.
          isRetry:          attempt > 0,
        });

        const tagged = result.sessions.map((s, si) => ({
          ...s,
          day:              globalDay + si,
          competencyIndex:  ci,
          competencyText:   comp.text.trim(),
          competencyCeiling: result.competencyCeiling,
        }));
        merged.push(...tagged);
        globalDay += comp.days;
      }

      setUnpackProgress(100);
      setSessions(merged);
      setUnpackState('success');

      // Persist to store — combine texts for Step 3 context
      const combinedText = competencies.map(c => c.text.trim()).join('; ');
      store.setCompetencies([...competencies]);
      store.setCompetencyText(combinedText);
      store.setLessonName(lessonName.trim());
      store.setUnpackedSessions(merged);
      store.setStep2({ content, contentStandards, learningContext });

    } catch (err) {
      console.error('Unpack error (attempt', attempt, '):', err);
      if (attempt === 0) {
        await new Promise(r => setTimeout(r, 1200));
        return runUnpack(1);
      }
      setUnpackState('error');
      setUnpackError(err.message);
    }
  }

  function handleReunpack() {
    setUnpackState('idle');
    setSessions([]);
    store.setStep2({ competencyCeiling: '', fullLadder: [], unpackedSessions: [] });
  }

  const isReady   = competencies.every(c => c.text.trim()) && !!lessonName.trim();
  const isLoading = unpackState === 'loading';
  const isSuccess = unpackState === 'success';
  const isError   = unpackState === 'error';

  // ── Budget tracker helper ────────────────────────────────────────────────────
  function compIdxForDaySlot(slotIndex) {
    let cum = 0;
    for (let ci = 0; ci < competencies.length; ci++) {
      cum += competencies[ci].days;
      if (slotIndex < cum) return ci;
    }
    return -1;
  }

  // ── Render ──────────────────────────────────────────────────────────────────
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
        @keyframes spin { from { transform:rotate(0deg); } to { transform:rotate(360deg); } }
      `}</style>

      <div style={{ maxWidth: 860, margin: '0 auto' }}>

        {/* ── Phase badge + heading ─────────────────────────────────────────── */}
        <div style={{ marginBottom: 28 }}>
          <span style={{ background: '#ede9fe', color: '#7c3aed', borderRadius: 20, padding: '4px 12px', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px' }}>
            Phase 2 — Competency
          </span>
          <h2 style={{ margin: '10px 0 6px', fontSize: 22, fontWeight: 600, color: 'var(--kt-text-primary)' }}>
            What will you teach this week?
          </h2>
          <p style={{ margin: 0, fontSize: 15, color: 'var(--kt-text-secondary)', lineHeight: 1.65, maxWidth: 600 }}>
            Add each learning competency from your MATATAG Curriculum Guide and assign how many days
            each needs. kaTuro AI will unpack them across your{' '}
            <strong style={{ color: 'var(--kt-text-primary)' }}>{n > 0 ? n : '—'}</strong>{' '}
            selected teaching day{n !== 1 ? 's' : ''}.
          </p>
        </div>

        {/* ── Main card ────────────────────────────────────────────────────── */}
        <div style={{
          background: 'var(--kt-card)', borderRadius: 14,
          border: '1px solid var(--kt-border)', borderTop: '3px solid #1a3d2b',
          padding: '24px', marginBottom: 20,
        }}>
          <p style={{ margin: '0 0 4px', fontSize: 11, fontWeight: 700, color: 'var(--kt-text-secondary)', textTransform: 'uppercase', letterSpacing: '1.2px' }}>
            MATATAG Curriculum Guide Reference
          </p>
          <p style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--kt-text-secondary)' }}>
            Based on {store.subject || 'your subject'} · {store.gradeLevel || 'your grade'} · {store.term || 'your term'} from Step 1
          </p>
          <div style={{ borderTop: '1px solid rgba(45,106,79,0.08)', marginBottom: 20 }} />

          {/* Content Standards */}
          <div style={{ marginBottom: 18 }}>
            <label style={{ display: 'block', marginBottom: 4, fontSize: 13, fontWeight: 600, color: 'var(--kt-text-primary)' }}>
              Content Standards
            </label>
            <p style={{ margin: '0 0 8px', fontSize: 13, color: 'var(--kt-text-secondary)', lineHeight: 1.65 }}>
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
          <div style={{ marginBottom: 22 }}>
            <label style={{ display: 'block', marginBottom: 4, fontSize: 13, fontWeight: 600, color: 'var(--kt-text-primary)' }}>
              Content
            </label>
            <p style={{ margin: '0 0 8px', fontSize: 13, color: 'var(--kt-text-secondary)', lineHeight: 1.65 }}>
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

          <div style={{ borderTop: '1px solid rgba(45,106,79,0.08)', marginBottom: 20 }} />

          {/* ── MULTI-COMPETENCY SECTION ────────────────────────────────────── */}
          <div style={{ marginBottom: 22 }}>
            <div style={{ marginBottom: 14 }}>
              <label style={{ display: 'block', marginBottom: 3, fontSize: 13, fontWeight: 600, color: 'var(--kt-text-primary)' }}>
                Learning Competencies <span style={{ color: '#e05c5c' }}>*</span>
              </label>
              <p style={{ margin: 0, fontSize: 13, color: 'var(--kt-text-secondary)', lineHeight: 1.6 }}>
                Add each competency from your Budget of Work. Assign how many teaching days each one needs — the total cannot exceed your {n}-day week.
              </p>
            </div>

            {/* Week Budget Tracker */}
            {n > 0 && (
              <div style={{
                background: 'var(--kt-surface)', borderRadius: 10,
                border: '1px solid var(--kt-border)',
                padding: '12px 14px', marginBottom: 16,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#4a6357', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                    Week Budget
                  </span>
                  <span style={{ fontSize: 11, fontWeight: 600, color: atLimit ? '#1a3d2b' : '#4a6357' }}>
                    {totalDaysUsed} of {n} day{n !== 1 ? 's' : ''} assigned
                    {atLimit && <span style={{ color: '#2d6a4f', marginLeft: 6 }}>✓ Full week covered</span>}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 5 }}>
                  {Array.from({ length: n }, (_, i) => {
                    const ci    = compIdxForDaySlot(i);
                    const color = ci >= 0 ? LC_COLORS[ci] : null;
                    let dayLabel = '';
                    if (days[i]) {
                      try { dayLabel = new Date(days[i] + 'T00:00').toLocaleDateString('en-US', { weekday: 'short' }); }
                      catch { dayLabel = `D${i + 1}`; }
                    } else {
                      dayLabel = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'][i] || `D${i + 1}`;
                    }
                    return (
                      <div key={i} style={{
                        flex: 1, borderRadius: 7, overflow: 'hidden',
                        border: `1.5px solid ${color ? color.border : 'rgba(45,106,79,0.15)'}`,
                        transition: 'border-color 0.2s',
                      }}>
                        <div style={{
                          height: 26,
                          background: color ? color.solid : 'rgba(45,106,79,0.07)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 10, fontWeight: 800, color: color ? '#fff' : '#b0c4b8',
                          letterSpacing: '0.04em',
                          transition: 'background 0.2s',
                        }}>
                          {ci >= 0 ? `LC${ci + 1}` : '—'}
                        </div>
                        <div style={{
                          textAlign: 'center', padding: '2px 0',
                          fontSize: 9, fontWeight: 700, color: '#4a6357',
                          background: 'var(--kt-card)',
                        }}>
                          {dayLabel}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Competency rows */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {competencies.map((comp, idx) => {
                const lc       = LC_COLORS[idx];
                const hasError = compErrors[idx];
                const maxDays  = maxDaysForRow(idx);

                return (
                  <div key={idx} style={{
                    background: '#fafcfa', borderRadius: 10,
                    border: `1px solid ${hasError ? '#e05c5c' : 'rgba(45,106,79,0.14)'}`,
                    borderLeft: `3px solid ${lc.solid}`,
                    padding: '12px 14px',
                    transition: 'border-color 0.15s',
                  }}>
                    {/* Row header: LC badge + days selector + remove */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                      <span style={{
                        background: lc.bg, color: lc.text,
                        border: `1px solid ${lc.border}`,
                        borderRadius: 20, padding: '2px 10px',
                        fontSize: 11, fontWeight: 700, flexShrink: 0,
                      }}>
                        LC {idx + 1}
                      </span>

                      <div style={{ flex: 1 }} />

                      {/* Days dropdown */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontSize: 12, color: '#4a6357', fontWeight: 600, whiteSpace: 'nowrap' }}>Days:</span>
                        <select
                          value={comp.days}
                          onChange={e => updateDays(idx, Number(e.target.value))}
                          style={{
                            border: '1px solid rgba(45,106,79,0.25)', borderRadius: 7,
                            padding: '4px 8px', fontSize: 13, fontWeight: 700,
                            background: 'var(--kt-input-bg)', color: 'var(--kt-text-primary)',
                            cursor: 'pointer', fontFamily: 'inherit', outline: 'none',
                          }}
                        >
                          {Array.from({ length: maxDays }, (_, i) => i + 1).map(d => (
                            <option key={d} value={d}>{d}</option>
                          ))}
                        </select>
                      </div>

                      {/* Remove */}
                      {competencies.length > 1 && (
                        <button
                          onClick={() => removeCompetency(idx)}
                          style={{
                            background: 'none', border: 'none', cursor: 'pointer',
                            color: '#b0c4b8', padding: 4, borderRadius: 6,
                            display: 'flex', alignItems: 'center',
                            transition: 'color 0.15s',
                          }}
                          title="Remove this competency"
                          onMouseEnter={e => e.currentTarget.style.color = '#e05c5c'}
                          onMouseLeave={e => e.currentTarget.style.color = '#b0c4b8'}
                        >
                          <X size={15} />
                        </button>
                      )}
                    </div>

                    {/* Competency textarea */}
                    <textarea
                      rows={3}
                      value={comp.text}
                      onChange={e => updateText(idx, e.target.value)}
                      placeholder={`Paste Learning Competency ${idx + 1} from the Curriculum Guide…`}
                      style={{
                        ...inputStyle,
                        border: `1px solid ${hasError ? '#e05c5c' : 'rgba(45,106,79,0.15)'}`,
                        background: hasError ? '#fde8e8' : '#fff',
                        resize: 'vertical', lineHeight: 1.65, fontSize: 14,
                        padding: '8px 12px',
                      }}
                      onFocus={e => { if (!hasError) { e.target.style.borderColor = '#52b788'; e.target.style.boxShadow = '0 0 0 2px rgba(82,183,136,0.25)'; } }}
                      onBlur={e  => { if (!hasError) { e.target.style.borderColor = 'rgba(45,106,79,0.15)'; e.target.style.boxShadow = 'none'; } }}
                    />
                    {hasError && (
                      <p style={{ margin: '4px 0 0', fontSize: 12, color: '#e05c5c', fontWeight: 600 }}>
                        This is required
                      </p>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Add competency button */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10 }}>
              <button
                onClick={addCompetency}
                disabled={!canAddMore}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  background: 'none',
                  border: `1.5px dashed ${canAddMore ? 'rgba(45,106,79,0.4)' : 'rgba(45,106,79,0.15)'}`,
                  borderRadius: 8, padding: '7px 14px',
                  fontSize: 13, fontWeight: 600,
                  color: canAddMore ? '#2d6a4f' : '#b0c4b8',
                  cursor: canAddMore ? 'pointer' : 'not-allowed',
                  fontFamily: 'inherit', transition: 'all 0.15s',
                }}
                onMouseEnter={e => { if (canAddMore) e.currentTarget.style.background = '#f0faf5'; }}
                onMouseLeave={e => { if (canAddMore) e.currentTarget.style.background = 'none'; }}
              >
                <Plus size={14} /> Add Competency
              </button>
              {atLimit && (
                <span style={{ fontSize: 11, color: '#9BB8A5', fontStyle: 'italic' }}>
                  {n}-day limit reached
                </span>
              )}
            </div>
          </div>

          <div style={{ borderTop: '1px solid rgba(45,106,79,0.08)', marginBottom: 20 }} />

          {/* Learning Context */}
          <div style={{ marginBottom: 18 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--kt-text-primary)' }}>Learning Context</label>
              <span style={{
                background: 'rgba(232,163,32,0.15)', color: '#92400e',
                borderRadius: 20, padding: '2px 9px',
                fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em',
              }}>
                Optional — Personalizes the AI output
              </span>
            </div>
            <p style={{ margin: '0 0 8px', fontSize: 13, color: 'var(--kt-text-secondary)', lineHeight: 1.65 }}>
              Describe your school, classroom, or community situation. The AI will tailor activities,
              examples, and assessments to your specific context.
            </p>
            <textarea
              rows={3}
              value={learningContext}
              onChange={e => setLearningContext(e.target.value)}
              placeholder={`Examples:\n· Rural school with limited lab equipment — use locally available materials\n· Coastal community in Quezon Province — connect to fishing and marine life\n· Multilingual class — some learners are Bisaya-dominant`}
              style={{
                ...inputStyle, resize: 'vertical', lineHeight: 1.65,
                borderColor: learningContext.trim() ? 'rgba(232,163,32,0.5)' : 'rgba(45,106,79,0.2)',
                background:  learningContext.trim() ? '#fffbeb' : 'var(--kt-input-bg)',
              }}
              onFocus={e => { e.target.style.borderColor = '#d97706'; e.target.style.boxShadow = '0 0 0 2px rgba(217,119,6,0.2)'; }}
              onBlur={e  => { e.target.style.borderColor = learningContext.trim() ? 'rgba(232,163,32,0.5)' : 'rgba(45,106,79,0.2)'; e.target.style.boxShadow = 'none'; }}
            />
            {learningContext.trim() && (
              <p style={{ margin: '5px 0 0', fontSize: 12, color: '#b45309', fontWeight: 600 }}>
                ✦ AI will contextualize this lesson to your setting
              </p>
            )}
          </div>

          {/* Name of Lesson */}
          <div style={{ marginBottom: 20 }}>
            <label style={{ display: 'block', marginBottom: 4, fontSize: 13, fontWeight: 600, color: 'var(--kt-text-primary)' }}>
              Name of Lesson <span style={{ color: '#e05c5c' }}>*</span>
            </label>
            <input
              type="text"
              value={lessonName}
              onChange={e => { setLessonName(e.target.value); if (lnError && e.target.value.trim()) setLnError(false); }}
              placeholder="e.g. Chemical Reactions — Indicators, Acids, Bases, and Salts"
              className={lnShake ? 'field-shake' : ''}
              style={{
                ...inputStyle,
                border: `1px solid ${lnError ? '#e05c5c' : 'rgba(45,106,79,0.2)'}`,
                background: lnError ? '#fde8e8' : 'var(--kt-input-bg)',
              }}
              onFocus={e => { if (!lnError) { e.target.style.borderColor = '#52b788'; e.target.style.boxShadow = '0 0 0 2px rgba(82,183,136,0.25)'; } }}
              onBlur={e  => { if (!lnError) { e.target.style.borderColor = 'rgba(45,106,79,0.2)'; e.target.style.boxShadow = 'none'; } }}
            />
            {lnError && <p style={{ margin: '4px 0 0', fontSize: 12, color: '#e05c5c', fontWeight: 600 }}>This is required</p>}
            <p style={{ margin: '5px 0 0', fontSize: 12, color: 'var(--kt-text-secondary)' }}>
              This will appear as the lesson title in your ILAW document.
            </p>
          </div>

          {/* Unpack button */}
          {!isSuccess && (
            <button
              onClick={isLoading ? undefined : handleUnpack}
              style={{
                width: '100%', height: 52, marginTop: 8,
                background: isLoading ? '#1a3d2b' : isReady ? '#1a3d2b' : 'rgba(45,106,79,0.1)',
                color:      isLoading ? '#fff'    : isReady ? '#fff'    : '#4a6357',
                border: 'none', borderRadius: 10,
                fontSize: 15, fontWeight: 600,
                cursor: isLoading ? 'not-allowed' : isReady ? 'pointer' : 'not-allowed',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                transition: 'background 0.15s', fontFamily: 'inherit',
              }}
              onMouseEnter={e => { if (isReady && !isLoading) e.currentTarget.style.background = '#2d6a4f'; }}
              onMouseLeave={e => { if (isReady && !isLoading) e.currentTarget.style.background = '#1a3d2b'; }}
            >
              {isLoading ? (
                <>
                  <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
                  Unpacking {competencies.length} competenc{competencies.length === 1 ? 'y' : 'ies'}…
                  {unpackProgress > 0 && (
                    <span style={{
                      fontSize: 12, fontWeight: 400, opacity: 0.75,
                      background: 'rgba(255,255,255,0.15)', borderRadius: 20,
                      padding: '2px 8px',
                    }}>
                      {unpackProgress}%
                    </span>
                  )}
                </>
              ) : isReady
                ? `Unpack ${competencies.length} competenc${competencies.length === 1 ? 'y' : 'ies'} with AI →`
                : 'Fill in competencies and lesson name to continue'
              }
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
                ✓ {sessions.length} session{sessions.length !== 1 ? 's' : ''} unpacked across {competencies.length} competenc{competencies.length === 1 ? 'y' : 'ies'}
              </span>
              <span
                onClick={handleReunpack}
                style={{ fontSize: 12, color: '#4a6357', textDecoration: 'underline', cursor: 'pointer' }}
              >
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
                  <p style={{ margin: '0 0 2px', fontSize: 13, color: '#e05c5c', fontWeight: 600 }}>
                    ⚠ AI couldn't process a competency.
                  </p>
                  {unpackError && (
                    <p style={{ margin: 0, fontSize: 11, color: '#e05c5c', opacity: 0.8, lineHeight: 1.5, wordBreak: 'break-word' }}>
                      {unpackError}
                    </p>
                  )}
                </div>
              </div>
              <button
                onClick={() => runUnpack(0)}
                style={{
                  background: 'none', border: '1px solid #1a3d2b',
                  borderRadius: 8, padding: '5px 12px',
                  fontSize: 12, fontWeight: 600, color: '#1a3d2b',
                  cursor: 'pointer', flexShrink: 0, fontFamily: 'inherit',
                }}
                onMouseEnter={e => e.currentTarget.style.background = '#f0faf5'}
                onMouseLeave={e => e.currentTarget.style.background = 'none'}
              >
                Try Again
              </button>
            </div>
          )}
        </div>

        {/* ── 5-COLUMN UNPACKING DISPLAY ──────────────────────────────────── */}
        {isSuccess && sessions.length > 0 && (
          <div className="result-in">

            {/* Header row */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <div>
                <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--kt-text-primary)' }}>Weekly Teaching Plan</span>
                <span style={{ marginLeft: 10, fontSize: 12, color: '#4a6357' }}>
                  {sessions.length} session{sessions.length !== 1 ? 's' : ''} · AI-sequenced by Bloom's Taxonomy
                </span>
              </div>
              <span
                onClick={handleReunpack}
                style={{ fontSize: 12, color: '#4a6357', textDecoration: 'underline', cursor: 'pointer', flexShrink: 0 }}
              >
                Re-unpack
              </span>
            </div>

            {/* LC legend */}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
              {competencies.map((comp, idx) => {
                const lc    = LC_COLORS[idx];
                const label = comp.text.trim();
                return (
                  <div key={idx} style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    background: lc.bg, border: `1px solid ${lc.border}`,
                    borderRadius: 20, padding: '4px 12px',
                    fontSize: 11, color: lc.text, fontWeight: 600, maxWidth: 320,
                  }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: lc.solid, flexShrink: 0 }} />
                    <span style={{ whiteSpace: 'nowrap' }}>LC {idx + 1}:</span>
                    <span style={{
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      maxWidth: 220,
                    }} title={label}>
                      {label.length > 50 ? label.slice(0, 50) + '…' : label}
                    </span>
                    <span style={{ color: lc.border, opacity: 0.7, flexShrink: 0 }}>
                      · {comp.days} day{comp.days !== 1 ? 's' : ''}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Day columns — horizontal scroll on small screens */}
            <div style={{ overflowX: 'auto', paddingBottom: 8 }}>
              <div style={{
                display: 'grid',
                gridTemplateColumns: `repeat(${sessions.length}, minmax(160px, 1fr))`,
                gap: 10,
                minWidth: sessions.length * 170,
              }}>
                {sessions.map((session, i) => {
                  const lc = LC_COLORS[session.competencyIndex ?? 0];
                  const bc = BLOOMS_COLORS[bloomsBase(session.bloomsLevel)] || BLOOMS_COLORS.Remember;

                  // Parse date string like "Monday, January 13, 2025"
                  let dayAbbr = `D${session.day}`;
                  let dateSub = '';
                  if (session.date) {
                    const parts = session.date.split(',');
                    if (parts.length >= 2) {
                      dayAbbr = parts[0].trim().slice(0, 3);   // "Mon"
                      dateSub = parts.slice(1).join(',').trim(); // "January 13, 2025"
                    }
                  }

                  return (
                    <div key={i} style={{
                      background: 'var(--kt-card)',
                      border: '1px solid var(--kt-border)',
                      borderTop: `3px solid ${lc.solid}`,
                      borderRadius: 10,
                      padding: '14px 13px',
                      display: 'flex', flexDirection: 'column', gap: 0,
                    }}>
                      {/* Day header */}
                      <div style={{ marginBottom: 10 }}>
                        <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--kt-text-primary)', lineHeight: 1 }}>
                          {dayAbbr}
                        </div>
                        {dateSub && (
                          <div style={{ fontSize: 10, color: '#9BB8A5', marginTop: 2, lineHeight: 1.3 }}>
                            {dateSub}
                          </div>
                        )}
                      </div>

                      {/* Badges */}
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 10 }}>
                        <span style={{
                          background: lc.bg, color: lc.text, border: `1px solid ${lc.border}`,
                          borderRadius: 20, padding: '2px 8px',
                          fontSize: 10, fontWeight: 700,
                        }}>
                          LC {(session.competencyIndex ?? 0) + 1}
                        </span>
                        <span style={{
                          background: bc.bg, color: bc.text, border: `1px solid ${bc.border}`,
                          borderRadius: 20, padding: '2px 8px',
                          fontSize: 10, fontWeight: 700,
                        }}>
                          {bloomsBase(session.bloomsLevel)}
                        </span>
                      </div>

                      <div style={{ borderTop: '1px solid rgba(45,106,79,0.08)', marginBottom: 10 }} />

                      {/* Objective */}
                      <div style={{ marginBottom: 9 }}>
                        <p style={{ margin: '0 0 3px', fontSize: 9, fontWeight: 700, color: '#4a6357', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                          Learning Objective
                        </p>
                        <p style={{ margin: 0, fontSize: 12, color: 'var(--kt-text-primary)', lineHeight: 1.6 }}>
                          {session.objective}
                        </p>
                      </div>

                      {/* Key Content Focus */}
                      {session.keyContentFocus && (
                        <div style={{ marginBottom: 9 }}>
                          <p style={{ margin: '0 0 3px', fontSize: 9, fontWeight: 700, color: '#4a6357', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                            Content Focus
                          </p>
                          <p style={{ margin: 0, fontSize: 12, color: '#163828', lineHeight: 1.5, fontWeight: 500 }}>
                            {session.keyContentFocus}
                          </p>
                        </div>
                      )}

                      {/* Activity Type */}
                      {session.activityType && (
                        <div style={{
                          marginTop: 'auto', paddingTop: 8,
                          background: lc.bg, borderRadius: 6,
                          padding: '5px 8px',
                          fontSize: 11, color: lc.text, fontWeight: 600,
                          textAlign: 'center',
                        }}>
                          {session.activityType}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Contribute checkbox */}
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginTop: 18 }}>
              <input
                type="checkbox" id="contribute" checked={contribute}
                onChange={e => setContribute(e.target.checked)}
                style={{ accentColor: '#1a3d2b', marginTop: 2, flexShrink: 0 }}
              />
              <label htmlFor="contribute" style={{ fontSize: 13, color: '#4a6357', cursor: 'pointer', lineHeight: 1.65 }}>
                Help other teachers — contribute these competencies to kaTuro's library
              </label>
            </div>
          </div>
        )}

        <div style={{ height: 24 }} />
      </div>
    </>
  );
}
