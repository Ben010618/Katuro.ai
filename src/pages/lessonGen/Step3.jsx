import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLessonGenStore } from '../../store/lessonGenStore';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../hooks/useAuth';
import { generateIlawSession } from '../../services/ai';
import { saveIlawPlan, deductTokens } from '../../services/db';
import { trackEvent, trackGeneration, startTimer } from '../../services/usageTracker';
import { ArrowRight, AlertCircle } from 'lucide-react';

function formatDayShort(iso) {
  if (!iso || iso.startsWith('Day')) return iso;
  try {
    return new Date(iso + 'T00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  } catch { return iso; }
}

const BLOOMS_COLORS = {
  Remember:   '#0d9488',
  Understand: '#0284c7',
  Apply:      '#7c3aed',
  Analyze:    '#e8a320',
  Evaluate:   '#e05c5c',
  Create:     '#16a34a',
};

const VALID_BLOOMS = ['Remember', 'Understand', 'Apply', 'Analyze', 'Evaluate', 'Create'];
function bloomsBaseOf(level) {
  return VALID_BLOOMS.find(l => level.startsWith(l)) ?? level.split(/\s*[-—–]\s*/)[0].trim();
}

async function runConcurrentSettled(items, concurrency, fn) {
  const results = new Array(items.length);
  const queue   = [...items.entries()];
  async function worker() {
    while (queue.length > 0) {
      const [i, item] = queue.shift();
      try        { results[i] = { status: 'fulfilled', value: await fn(item, i) }; }
      catch (err){ results[i] = { status: 'rejected',  reason: err }; }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return results;
}

export default function Step3() {
  const navigate     = useNavigate();
  const store        = useLessonGenStore();
  const { addToast } = useToast();
  const { user, freeMode } = useAuth();

  const [decl,       setDecl]       = useState(store.declarationOfAIUse);
  const [generating, setGenerating] = useState(false);
  const [progress,   setProgress]   = useState(0);
  const [statusMsg,  setStatusMsg]  = useState('');
  const [genError,   setGenError]   = useState(null);
  const activeGenRef = useRef(0);

  const sessions = store.unpackedSessions || [];
  const n        = sessions.length;
  const days     = store.selectedDays || [];

  useEffect(() => {
    if (n === 0) navigate('/lesson-gen/step-2', { replace: true });
  }, []);

  if (n === 0) return null;

  async function handleGenerate() {
    if (!user?.uid) return;

    setGenerating(true);
    setGenError(null);
    setProgress(5);
    setStatusMsg(freeMode ? 'Preparing…' : 'Checking tokens…');
    try {
      await deductTokens(user.uid, 'lesson');
    } catch (err) {
      setGenerating(false);
      setGenError(err.message);
      return;
    }

    const genId = ++activeGenRef.current;
    const elapsedMs = startTimer();
    setStatusMsg(`Generating ${n} session${n !== 1 ? 's' : ''}…`);

    const context = {
      subject:          store.subject          || 'Science',
      gradeLevel:       store.gradeLevel       || 'Grade 7',
      term:             store.term             || 'Term 1',
      weekNumber:       store.weekNumber       || 'Week 1',
      lessonName:       store.lessonName       || 'My Lesson',
      competencyText:   store.competencyText   || '',
      content:          store.content          || '',
      contentStandards: store.contentStandards || '',
      learningContext:  store.learningContext  || '',
      totalSessions:    n,
      allSessions:      sessions,
    };

    const results = await runConcurrentSettled(sessions, 1, async (s, i) => {
      // Small cooldown between sessions to avoid Gemini rate limits
      if (i > 0) await new Promise(r => setTimeout(r, 1200));

      setStatusMsg(`Generating Session ${s.day} of ${n} — ${bloomsBaseOf(s.bloomsLevel)} level…`);
      setProgress(Math.round(5 + (i / n) * 75));

      let lastErr = null;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const result = await generateIlawSession(s, context);
          if (activeGenRef.current !== genId) return null;
          setProgress(Math.round(5 + ((i + 1) / n) * 75));
          return result;
        } catch (err) {
          lastErr = err;
          console.warn(`Session ${s.day} attempt ${attempt + 1} failed:`, err);
          if (attempt < 2) {
            const backOff = err.status === 429
              ? Math.min((err.retryAfter || 30) * 1000, 30_000)
              : 5000 + attempt * 3000;
            setStatusMsg(`Session ${s.day} failed — retrying in ${Math.round(backOff / 1000)}s…`);
            await new Promise(r => setTimeout(r, backOff));
            setStatusMsg(`Retrying Session ${s.day} of ${n}…`);
          }
        }
      }
      throw new Error(
        `Session ${s.day} (${bloomsBaseOf(s.bloomsLevel)}) could not be generated. ` +
        (lastErr?.status === 429
          ? 'Rate limit reached — wait a moment and try again.'
          : 'Check your connection and try again.')
      );
    });

    if (activeGenRef.current !== genId) return;

    const failed = results.filter(r => r.status === 'rejected');
    if (failed.length > 0) {
      setGenerating(false);
      setGenError(
        failed.length === 1
          ? failed[0].reason.message
          : `${failed.length} sessions could not be generated. Check your connection and try again.`
      );
      trackGeneration(user.uid, 'ilaw', {
        success: false,
        durationMs: elapsedMs(),
        error: failed[0]?.reason?.message,
      });
      return;
    }

    const enriched = results.map(r => r.value).filter(Boolean);

    setStatusMsg('Formatting ILAW document…');
    setProgress(90);
    await new Promise(r => setTimeout(r, 450));

    store.setStep2({ declarationOfAIUse: decl });
    store.setGeneratedPlan({ sessions: enriched });

    setStatusMsg('✓ Done!');
    setProgress(100);
    await new Promise(r => setTimeout(r, 500));

    navigate('/lesson-gen/output/new');
    trackEvent(user.uid, 'ilaw_generated', { subject: store.subject, grade: store.gradeLevel });
    trackGeneration(user.uid, 'ilaw', { success: true, durationMs: elapsedMs() });

    if (user?.uid) {
      const planData = {
        subject:            store.subject,
        gradeLevel:         store.gradeLevel,
        term:               store.term,
        weekNumber:         store.weekNumber,
        lessonName:         store.lessonName,
        competencyText:     store.competencyText,
        content:            store.content            || '',
        contentStandards:   store.contentStandards   || '',
        competencyCeiling:  store.competencyCeiling,
        fullLadder:         store.fullLadder,
        selectedDays:       store.selectedDays,
        declarationOfAIUse: decl,
        sessions:           enriched,
      };
      saveIlawPlan(user.uid, planData)
        .then(docId => store.setGeneratedPlan({ sessions: enriched, planId: docId }))
        .catch(err => {
          console.error('Firestore save failed:', err);
          addToast('Plan generated but could not save to cloud. Check your connection.', 'warning');
        });
    }
  }

  const isDone = statusMsg.startsWith('✓');

  return (
    <div style={{ maxWidth: 680, margin: '0 auto' }}>

      {/* Phase badge + heading */}
      <div style={{ marginBottom: 24 }}>
        <span style={{ background: 'rgba(232,163,32,0.12)', color: '#e8a320', borderRadius: 20, padding: '4px 12px', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px' }}>
          Phase 3 — Generate
        </span>
        <h2 style={{ margin: '10px 0 6px', fontSize: 22, fontWeight: 600, color: 'var(--kt-text-primary)' }}>
          Ready to generate your ILAW Lesson Plan
        </h2>
        <p style={{ margin: 0, fontSize: 15, color: 'var(--kt-text-secondary)', lineHeight: 1.65 }}>
          Review your session setup and competency, then click Generate. kaTuro builds your complete {n}-session ILAW document.
        </p>
      </div>

      {/* Review Summary Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 16 }}>

        <div style={{ background: 'var(--kt-card)', borderRadius: 14, border: '1px solid var(--kt-border)', padding: '16px 18px' }}>
          <p style={{ margin: '0 0 10px', fontSize: 11, fontWeight: 700, color: 'var(--kt-text-secondary)', textTransform: 'uppercase', letterSpacing: '1.2px' }}>
            Session Details
          </p>
          <p style={{ margin: '0 0 4px', fontSize: 13, fontWeight: 600, color: 'var(--kt-text-primary)' }}>
            {store.subject} {store.gradeLevel} · {store.term} · {store.weekNumber}
          </p>
          <p style={{ margin: '0 0 8px', fontSize: 11, color: 'var(--kt-text-secondary)', lineHeight: 1.65 }}>
            Teaching days: {days.slice(0, 4).map(d => formatDayShort(d)).join(' · ')}
            {days.length > 4 ? ` +${days.length - 4}` : ''}
          </p>
          <div style={{ background: '#d8f3dc', borderRadius: 8, padding: '5px 10px', display: 'inline-block' }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#1a3d2b', fontFamily: '"DM Mono", monospace' }}>
              {n} session{n !== 1 ? 's' : ''}
            </span>
          </div>
        </div>

        <div style={{ background: 'var(--kt-card)', borderRadius: 14, border: '1px solid var(--kt-border)', padding: '16px 18px' }}>
          <p style={{ margin: '0 0 10px', fontSize: 11, fontWeight: 700, color: 'var(--kt-text-secondary)', textTransform: 'uppercase', letterSpacing: '1.2px' }}>
            Competency
          </p>
          <p style={{ margin: '0 0 6px', fontSize: 13, color: 'var(--kt-text-primary)', lineHeight: 1.65, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
            {store.competencyText || 'No competency entered'}
          </p>
          <p style={{ margin: '0 0 8px', fontSize: 11, color: 'var(--kt-text-secondary)' }}>
            Lesson: <strong>{store.lessonName || 'Untitled'}</strong>
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {sessions.map(s => {
              const clr = BLOOMS_COLORS[bloomsBaseOf(s.bloomsLevel)] || '#888';
              return (
                <span key={s.day} style={{ background: `${clr}18`, color: clr, borderRadius: 20, padding: '2px 8px', fontSize: 10, fontWeight: 700 }}>
                  {s.bloomsLevel}
                </span>
              );
            })}
          </div>
        </div>
      </div>

      {/* Declaration of AI Use */}
      <div style={{ background: 'var(--kt-card)', borderRadius: 14, border: '1px solid var(--kt-border)', padding: '18px 20px', marginBottom: 16 }}>
        <label style={{ display: 'block', marginBottom: 5, fontSize: 11, fontWeight: 700, color: 'var(--kt-text-secondary)', textTransform: 'uppercase', letterSpacing: '1.2px' }}>
          Declaration of AI use{' '}
          <span style={{ fontSize: 11, color: '#4a6357', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(DepEd DO 3, 2026)</span>
        </label>
        <textarea
          rows={4}
          value={decl}
          onChange={e => { setDecl(e.target.value); store.setStep2({ declarationOfAIUse: e.target.value }); }}
          className="input"
          style={{ resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.65 }}
        />
      </div>

      {/* Generate CTA Card */}
      <div style={{ background: 'linear-gradient(135deg, #0d2218 0%, #1a3d2b 50%, #2d6a4f 100%)', borderRadius: 16, padding: '40px 32px', textAlign: 'center', marginBottom: 8 }}>

        {!generating ? (
          <>
            {genError && (
              <div style={{
                background: 'rgba(224,92,92,0.15)', border: '1px solid rgba(224,92,92,0.4)',
                borderRadius: 10, padding: '12px 16px', marginBottom: 20,
                display: 'flex', alignItems: 'flex-start', gap: 8, textAlign: 'left',
              }}>
                <AlertCircle size={15} color="rgba(224,92,92,0.8)" style={{ flexShrink: 0, marginTop: 1 }} />
                <p style={{ margin: 0, fontSize: 13, color: 'rgba(224,92,92,0.9)', fontWeight: 600, lineHeight: 1.65 }}>
                  {genError}
                </p>
              </div>
            )}

            <h3 style={{ margin: '0 0 8px', fontSize: 17, fontWeight: 600, color: '#fff' }}>
              Ready to generate your ILAW lesson plan?
            </h3>
            <p style={{ margin: '0 0 24px', fontSize: 15, color: 'rgba(255,255,255,0.6)', lineHeight: 1.65 }}>
              kaTuro AI will write your complete{' '}
              <strong style={{ color: '#52b788' }}>{n}-session</strong> ILAW document —
              Pre-Lesson, Flow, Learning Resources, Integration, Formative Assessment,
              Extended Learning, and Reflection Prompts.
            </p>
            <button
              onClick={handleGenerate}
              style={{
                width: '100%', background: '#fff', color: '#1a3d2b',
                border: 'none', borderRadius: 10, padding: '14px 32px',
                fontSize: 15, fontWeight: 600, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                transition: 'background 0.15s',
                fontFamily: 'inherit',
              }}
              onMouseEnter={e => e.currentTarget.style.background = '#d8f3dc'}
              onMouseLeave={e => e.currentTarget.style.background = '#fff'}
            >
              Generate Now <ArrowRight size={18} />
            </button>
          </>
        ) : (
          <>
            <div style={{ height: 8, background: 'rgba(255,255,255,0.15)', borderRadius: 100, overflow: 'hidden', marginBottom: 20 }}>
              <div style={{
                height: '100%', width: `${progress}%`, borderRadius: 100,
                background: 'linear-gradient(90deg, #52b788, #40916c)',
                transition: 'width 0.5s ease',
              }} />
            </div>
            <p style={{ margin: '0 0 6px', fontSize: 15, fontWeight: 600, minHeight: 28, color: isDone ? '#52b788' : '#fff', transition: 'color 0.2s' }}>
              {statusMsg}
            </p>
            <p style={{ margin: 0, fontSize: 11, color: 'rgba(255,255,255,0.4)', fontFamily: '"DM Mono", monospace' }}>
              {progress}% complete — please wait…
            </p>
          </>
        )}
      </div>

      <div style={{ height: 24 }} />
    </div>
  );
}
