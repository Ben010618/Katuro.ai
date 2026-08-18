import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLessonGenStore } from '../../store/lessonGenStore';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../hooks/useAuth';
import { generateIlawSession } from '../../services/ai';
import { saveIlawPlan, deductTokens, refundTokens } from '../../services/db';
import { trackEvent, trackGeneration, startTimer } from '../../services/usageTracker';
import { retryAsync } from '../../utils/retry';
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

  // If the user navigates away mid-generation (e.g. clicks Back), this
  // component unmounts but the in-flight handleGenerate() promise chain
  // keeps running — it isn't tied to React lifecycle. Bumping activeGenRef
  // here invalidates its genId, so the staleness checks already in
  // handleGenerate correctly treat it as abandoned instead of force-
  // navigating the user to the output page and overwriting the store once
  // it eventually finishes.
  useEffect(() => () => { activeGenRef.current++; }, []);

  if (n === 0) return null;

  async function handleGenerate() {
    if (!user?.uid || generating) return;

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
          const result = await generateIlawSession(s, context, { isRetry: attempt > 0 });
          if (activeGenRef.current !== genId) return null;
          setProgress(Math.round(5 + ((i + 1) / n) * 75));
          return result;
        } catch (err) {
          lastErr = err;
          console.warn(`Session ${s.day} attempt ${attempt + 1} failed:`, err);
          if (err.dailyLimit) break; // won't clear up by retrying — surface immediately
          if (attempt < 2) {
            const backOff = err.status === 429
              ? Math.min((err.retryAfter || 30) * 1000, 30_000)
              : 5000 + attempt * 3000;
            setStatusMsg(`Due to high demand, Session ${s.day} is slow — retrying in ${Math.round(backOff / 1000)}s…`);
            await new Promise(r => setTimeout(r, backOff));
            setStatusMsg(`Retrying Session ${s.day} of ${n}…`);
          }
        }
      }
      const REASON_MESSAGES = {
        429:            'Rate limit reached — wait a moment and try again.',
        truncated:      'The AI response was cut off. Try again — it usually succeeds on retry.',
        invalid_json:   'The AI returned an unexpected format for this session. Try again.',
        empty_response: 'The AI returned no content for this session. Try again.',
        safety_block:   'This session was blocked by the AI\'s content filter. Try rephrasing the competency or context.',
        network_error:  'Could not reach the AI service. Check your internet connection and try again.',
      };
      const reasonKey = lastErr?.status === 429 ? 429 : lastErr?.reason;
      throw new Error(
        `Session ${s.day} (${bloomsBaseOf(s.bloomsLevel)}) could not be generated. ` +
        (REASON_MESSAGES[reasonKey] || 'Check your connection and try again.')
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
      // The lesson charge already went through before generation started —
      // refund it since no usable plan came out of this attempt. Best-effort:
      // a refund failure shouldn't replace the real error shown above.
      refundTokens(user.uid, 'lesson').catch(err => console.error('Token refund failed:', err));
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
      // Retried with backoff -- a dropped hotspot connection right after
      // generation is the #1 cause of lessons that "disappear": the plan
      // never reaches Firestore, so it never shows up in My Lessons later,
      // even though generation itself succeeded. Most such failures are a
      // few seconds of flaky connectivity, not a permanent problem, so a
      // couple of retries recovers the overwhelming majority silently.
      retryAsync(() => saveIlawPlan(user.uid, planData))
        .then(docId => {
          store.setGeneratedPlan({ sessions: enriched, planId: docId });
          store.setSaveStatus('saved');
        })
        .catch(err => {
          console.error('Firestore save failed after retries:', err);
          store.setSaveStatus('failed');
          addToast('Plan generated but not saved to cloud yet — download it now, then retry saving from this page.', 'warning', 6000);
        });
    }
  }

  const isDone = statusMsg.startsWith('✓');

  return (
    <div style={{ maxWidth: 680, margin: '0 auto' }}>

      {/* Phase badge + heading */}
      <div style={{ marginBottom: 24 }}>
        <span style={{ background: 'var(--kt-manila)', color: 'var(--kt-text-primary)', border: '1px solid var(--kt-manila-border)', borderRadius: 'var(--kt-radius-sm)', padding: '3px 10px', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', fontFamily: 'var(--kt-font-mono)' }}>
          Step 3 · Review & Generate
        </span>
        <h2 style={{ margin: '10px 0 6px', fontSize: 24, fontWeight: 700, color: 'var(--kt-text-primary)', fontFamily: 'var(--kt-font-heading)' }}>
          Ready to generate your ILAW Lesson Plan
        </h2>
        <p style={{ margin: 0, fontSize: 14, color: 'var(--kt-text-secondary)', lineHeight: 1.6 }}>
          Review your session setup and competency, then click Generate. kaTuro builds your complete {n}-session ILAW document.
        </p>
      </div>

      {/* Review Summary Cards */}
      <div className="kt-grid-2" style={{ gap: 14, marginBottom: 16 }}>

        <div style={{ background: 'var(--kt-card)', borderRadius: 'var(--kt-radius-md)', border: '1px solid var(--kt-border)', padding: '16px 18px', boxShadow: 'var(--kt-shadow-sm)' }}>
          <p style={{ margin: '0 0 8px', fontSize: 11.5, fontWeight: 700, color: 'var(--kt-text-secondary)', textTransform: 'uppercase', letterSpacing: '1.2px', fontFamily: 'var(--kt-font-mono)' }}>
            Session Details
          </p>
          <p style={{ margin: '0 0 4px', fontSize: 13.5, fontWeight: 700, color: 'var(--kt-text-primary)', fontFamily: 'var(--kt-font-heading)' }}>
            {store.subject} {store.gradeLevel} · {store.term} · {store.weekNumber}
          </p>
          <p style={{ margin: '0 0 8px', fontSize: 11.5, color: 'var(--kt-text-secondary)', lineHeight: 1.6 }}>
            Teaching days: {days.slice(0, 4).map(d => formatDayShort(d)).join(' · ')}
            {days.length > 4 ? ` +${days.length - 4}` : ''}
          </p>
          <div style={{ background: 'var(--kt-manila)', border: '1px solid var(--kt-manila-border)', borderRadius: 'var(--kt-radius-sm)', padding: '3px 8px', display: 'inline-block' }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--kt-text-primary)', fontFamily: 'var(--kt-font-mono)' }}>
              {n} session{n !== 1 ? 's' : ''}
            </span>
          </div>
        </div>

        <div style={{ background: 'var(--kt-card)', borderRadius: 'var(--kt-radius-md)', border: '1px solid var(--kt-border)', padding: '16px 18px', boxShadow: 'var(--kt-shadow-sm)' }}>
          <p style={{ margin: '0 0 8px', fontSize: 11.5, fontWeight: 700, color: 'var(--kt-text-secondary)', textTransform: 'uppercase', letterSpacing: '1.2px', fontFamily: 'var(--kt-font-mono)' }}>
            Competency
          </p>
          <p style={{ margin: '0 0 6px', fontSize: 13, color: 'var(--kt-text-primary)', lineHeight: 1.6, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
            {store.competencyText || 'No competency entered'}
          </p>
          <p style={{ margin: '0 0 8px', fontSize: 11.5, color: 'var(--kt-text-secondary)' }}>
            Lesson: <strong style={{ color: 'var(--kt-text-primary)' }}>{store.lessonName || 'Untitled'}</strong>
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {sessions.map(s => {
              return (
                <span key={s.day} style={{ background: 'var(--kt-card-2)', color: 'var(--kt-text-primary)', border: '1px solid var(--kt-border)', borderRadius: 'var(--kt-radius-sm)', padding: '2px 7px', fontSize: 10, fontWeight: 700 }}>
                  {s.bloomsLevel}
                </span>
              );
            })}
          </div>
        </div>
      </div>

      {/* Declaration of AI Use */}
      <div style={{ background: 'var(--kt-card)', borderRadius: 'var(--kt-radius-md)', border: '1px solid var(--kt-border)', padding: '18px 20px', marginBottom: 16, boxShadow: 'var(--kt-shadow-sm)' }}>
        <label style={{ display: 'block', marginBottom: 5, fontSize: 11.5, fontWeight: 700, color: 'var(--kt-text-secondary)', textTransform: 'uppercase', letterSpacing: '1.2px', fontFamily: 'var(--kt-font-mono)' }}>
          Declaration of AI use{' '}
          <span style={{ fontSize: 11, color: 'var(--kt-text-secondary)', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(DepEd DO 16, s. 2026)</span>
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
      <div style={{ background: 'var(--kt-chalkboard)', borderRadius: 'var(--kt-radius-md)', border: '1px solid var(--kt-manila-border)', padding: '36px 28px', textAlign: 'center', marginBottom: 8, boxShadow: '0 4px 16px rgba(31,58,46,0.2)' }}>

        {!generating ? (
          <>
            {genError && (
              <div style={{
                background: 'var(--kt-danger-tint)', border: '1px solid rgba(162,59,46,0.4)',
                borderRadius: 'var(--kt-radius-md)', padding: '12px 16px', marginBottom: 20,
                display: 'flex', alignItems: 'flex-start', gap: 8, textAlign: 'left',
              }}>
                <AlertCircle size={15} color="var(--kt-danger)" style={{ flexShrink: 0, marginTop: 1 }} />
                <p style={{ margin: 0, fontSize: 13, color: 'var(--kt-danger)', fontWeight: 600, lineHeight: 1.65 }}>
                  {genError}
                </p>
              </div>
            )}

            <h3 style={{ margin: '0 0 8px', fontSize: 18, fontWeight: 700, color: '#FBF7EC', fontFamily: 'var(--kt-font-heading)' }}>
              Ready to generate your ILAW lesson plan?
            </h3>
            <p style={{ margin: '0 0 24px', fontSize: 14, color: 'var(--kt-manila)', lineHeight: 1.6, maxWidth: 520, marginInline: 'auto' }}>
              kaTuro AI will write your complete{' '}
              <strong style={{ color: '#ffffff' }}>{n}-session</strong> ILAW document —
              Pre-Lesson, Flow, Learning Resources, Integration, Formative Assessment,
              Extended Learning, and Reflection Prompts.
            </p>
            <button
              onClick={handleGenerate}
              style={{
                width: '100%', maxWidth: 360, margin: '0 auto', background: 'var(--kt-manila)', color: 'var(--kt-text-primary)',
                border: '1px solid var(--kt-manila-border)', borderRadius: 'var(--kt-radius-md)', padding: '13px 28px',
                fontSize: 14.5, fontWeight: 700, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                transition: 'background 0.15s, transform 0.15s',
                fontFamily: 'inherit',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = '#dac797'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'var(--kt-manila)'; e.currentTarget.style.transform = 'translateY(0)'; }}
            >
              Generate Now <ArrowRight size={17} />
            </button>
          </>
        ) : (
          <>
            <div style={{ height: 6, background: 'rgba(255,255,255,0.15)', borderRadius: 100, overflow: 'hidden', marginBottom: 20, maxWidth: 440, marginInline: 'auto' }}>
              <div style={{
                height: '100%', width: `${progress}%`, borderRadius: 100,
                background: 'var(--kt-manila)',
                transition: 'width 0.5s ease',
              }} />
            </div>
            <p style={{ margin: '0 0 6px', fontSize: 15, fontWeight: 600, minHeight: 28, color: isDone ? 'var(--kt-manila)' : '#FBF7EC', transition: 'color 0.2s', fontFamily: 'var(--kt-font-heading)' }}>
              {statusMsg}
            </p>
            <p style={{ margin: 0, fontSize: 11, color: 'rgba(251,247,236,0.65)', fontFamily: 'var(--kt-font-mono)' }}>
              {progress}% complete — please wait…
            </p>
          </>
        )}
      </div>

      <div style={{ height: 24 }} />
    </div>
  );
}
