import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDLLStore } from '../../store/dllStore';
import { useAuth } from '../../hooks/useAuth';
import { deductTokens, saveDLLPlan } from '../../services/db';
import { generateDLLProcedure } from '../../services/dllAI';
import { useToast } from '../../context/ToastContext';
import { Sparkles, ArrowRight, ArrowLeft, CalendarDays } from 'lucide-react';

const DAY_KEYS  = ['mon',  'tue',      'wed',         'thu',      'fri'];
const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

export default function DLLStep2() {
  const navigate     = useNavigate();
  const store        = useDLLStore();
  const { user, tokenBalance } = useAuth();
  const { addToast } = useToast();
  const [generating, setGenerating] = useState(false);

  const canGenerate =
    store.contentStandards.trim() &&
    store.performanceStandards.trim() &&
    store.melc.trim() &&
    DAY_KEYS.some(d => store.dailyContent[d].trim()) &&
    tokenBalance >= 3;

  async function handleGenerate() {
    if (!canGenerate || generating) return;
    setGenerating(true);
    try {
      await deductTokens(user.uid, 'dll', 3);
      const procedure = await generateDLLProcedure({
        subject:              store.subject,
        gradeLevel:           store.gradeLevel,
        term:                 store.term,
        contentStandards:     store.contentStandards,
        performanceStandards: store.performanceStandards,
        melc:                 store.melc,
        dailyContent:         store.dailyContent,
      });
      store.setProcedure(procedure);
      // Save to Firestore so it appears in My Lessons
      try {
        const id = await saveDLLPlan(user.uid, {
          subject: store.subject, gradeLevel: store.gradeLevel,
          term: store.term, section: store.section, teachingDates: store.teachingDates,
          contentStandards: store.contentStandards, performanceStandards: store.performanceStandards,
          melc: store.melc, dailyContent: store.dailyContent, procedure,
        });
        store.setSavedId(id);
      } catch (e) {
        console.warn('DLL auto-save failed:', e.message);
      }
      navigate('/dll-gen/output');
    } catch (err) {
      addToast('Generation failed: ' + err.message, 'error');
    } finally {
      setGenerating(false);
    }
  }

  function Textarea({ label, storeKey, placeholder, rows = 3 }) {
    return (
      <div>
        <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#1a3d2b', marginBottom: 6 }}>
          {label}
        </label>
        <textarea
          value={store[storeKey]}
          onChange={e => store.setField(storeKey, e.target.value)}
          placeholder={placeholder}
          rows={rows}
          style={{
            width: '100%', boxSizing: 'border-box', resize: 'vertical',
            padding: '10px 12px', borderRadius: 8,
            border: '1.5px solid rgba(45,106,79,0.2)',
            fontSize: 13, color: '#0d2218', background: '#fff',
            outline: 'none', lineHeight: 1.6, fontFamily: 'inherit',
          }}
          onFocus={e => (e.target.style.borderColor = '#2d6a4f')}
          onBlur={e  => (e.target.style.borderColor = 'rgba(45,106,79,0.2)')}
        />
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 700, margin: '0 auto' }}>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24 }}>
        <div style={{ width: 40, height: 40, borderRadius: 10, background: 'linear-gradient(135deg, #ede9fe, #e0e7ff)', display: 'grid', placeItems: 'center' }}>
          <CalendarDays size={19} color="#4f46e5" />
        </div>
        <div>
          <p style={{ margin: 0, fontSize: 11, fontWeight: 700, color: '#4f46e5', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Daily Lesson Log · Step 2 of 2
          </p>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: '#0d2218' }}>
            Standards, MELC & Daily Content
          </h1>
        </div>
      </div>

      <div style={{
        background: '#fff', borderRadius: 14, border: '1px solid rgba(45,106,79,0.12)',
        padding: '28px 28px', display: 'flex', flexDirection: 'column', gap: 22,
        marginBottom: 18,
      }}>
        <Textarea
          label="Content Standards *"
          storeKey="contentStandards"
          placeholder="The learner demonstrates understanding of…"
        />
        <Textarea
          label="Performance Standards *"
          storeKey="performanceStandards"
          placeholder="The learner is able to…"
        />
        <Textarea
          label="Learning Competency / MELC *"
          storeKey="melc"
          placeholder="Paste the Most Essential Learning Competency (with LC code if available)"
          rows={4}
        />
      </div>

      {/* Daily content */}
      <div style={{
        background: '#fff', borderRadius: 14, border: '1px solid rgba(45,106,79,0.12)',
        padding: '24px 28px', marginBottom: 20,
      }}>
        <p style={{ margin: '0 0 4px', fontSize: 14, fontWeight: 700, color: '#0d2218' }}>
          Content (Subject Matter) per Day
        </p>
        <p style={{ margin: '0 0 18px', fontSize: 12, color: '#6b7280' }}>
          Enter the topic for each day. Leave blank for no class on that day.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {DAY_KEYS.map((d, i) => (
            <div key={d} style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
              <span style={{
                flexShrink: 0, width: 90, padding: '9px 0', fontSize: 13, fontWeight: 600, color: '#1a3d2b',
              }}>
                {DAY_NAMES[i]}
              </span>
              <input
                value={store.dailyContent[d]}
                onChange={e => store.setDailyContent(d, e.target.value)}
                placeholder={`Topic for ${DAY_NAMES[i]}…`}
                style={{
                  flex: 1, padding: '9px 12px', borderRadius: 8,
                  border: '1.5px solid rgba(45,106,79,0.2)',
                  fontSize: 13, color: '#0d2218', background: '#fff',
                  outline: 'none', fontFamily: 'inherit',
                }}
                onFocus={e => (e.target.style.borderColor = '#2d6a4f')}
                onBlur={e  => (e.target.style.borderColor = 'rgba(45,106,79,0.2)')}
              />
            </div>
          ))}
        </div>
      </div>

      {tokenBalance < 3 && (
        <div style={{
          background: '#fff7ed', border: '1px solid #fed7aa',
          borderRadius: 10, padding: '12px 16px', marginBottom: 16,
          fontSize: 13, color: '#9a3412',
        }}>
          You need at least 3 tokens to generate. Current balance: {tokenBalance} tokens.
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <button
          onClick={() => navigate('/dll-gen/step-1')}
          className="btn-outline"
          style={{ fontSize: 14, padding: '10px 20px' }}
        >
          <ArrowLeft size={14} />
          Back
        </button>

        <button
          onClick={handleGenerate}
          disabled={!canGenerate || generating}
          className="btn-primary"
          style={{
            fontSize: 14, padding: '11px 26px',
            opacity: canGenerate && !generating ? 1 : 0.45,
            background: '#4f46e5',
          }}
        >
          {generating ? (
            <>
              <span style={{ display: 'inline-block', width: 14, height: 14, border: '2px solid rgba(255,255,255,0.4)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
              Generating…
            </>
          ) : (
            <>
              <Sparkles size={15} />
              Generate Daily Lesson Log (3 tokens)
              <ArrowRight size={15} />
            </>
          )}
        </button>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
