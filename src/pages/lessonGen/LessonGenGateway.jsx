import { useNavigate } from 'react-router-dom';
import { useLessonGenStore } from '../../store/lessonGenStore';
import { Sparkles, BookOpen, CalendarDays, ArrowRight, RotateCcw, ShieldCheck } from 'lucide-react';

// ── Colors extracted from the Filipino education mural ─────────────────────
// 1. Philippine Flag Blue  — cobalt sky & flag field  #0f2d6e → #1d4ed8
// 2. Rice Terrace Green    — lush mountains & terraces #14532d → #16a34a
// 3. Sunburst Amber-Gold   — radiating sun & flag gold #92400e → #d97706

const ILAW_COLOR  = '#1d4ed8';   // Philippine Blue
const DLL_COLOR   = '#16a34a';   // Rice Terrace Green
const COT_COLOR   = '#d97706';   // Sunburst Amber-Gold

export default function LessonGenGateway() {
  const navigate = useNavigate();
  const store    = useLessonGenStore();

  const hasDraft = !!(store.subject || store.selectedDays?.length > 0);

  function handleILAW() {
    store.reset();
    navigate('/lesson-gen/step-1');
  }

  function handleResume() {
    if (store.unpackedSessions?.length > 0)  navigate('/lesson-gen/step-3');
    else if (store.competencyText)            navigate('/lesson-gen/step-2');
    else                                      navigate('/lesson-gen/step-1');
  }

  return (
    <div style={{ maxWidth: 820, margin: '0 auto' }}>

      {/* Header */}
      <div style={{ marginBottom: 32 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <div style={{
            background: 'linear-gradient(135deg, #0d2218, #2d6a4f)',
            borderRadius: 10, padding: '6px 10px',
            display: 'flex', alignItems: 'center', gap: 6,
          }}>
            <Sparkles size={13} color="#52b788" />
            <span style={{ fontSize: 11, fontWeight: 700, color: '#52b788', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
              AI Lesson Generator
            </span>
          </div>
        </div>
        <h1 style={{ margin: 0, fontSize: 28, fontWeight: 700, color: '#0d2218', lineHeight: 1.2 }}>
          What would you like to build?
        </h1>
        <p style={{ margin: '6px 0 0', fontSize: 15, color: '#4a6357', lineHeight: 1.65 }}>
          Choose a document type to get started.
        </p>
      </div>

      {/* Type cards */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 18, marginBottom: 28 }}>

        {/* ILAW card — Philippine Blue */}
        <button
          onClick={handleILAW}
          style={{
            textAlign: 'left', background: '#fff',
            border: `2px solid rgba(29,78,216,0.15)`,
            borderRadius: 16, padding: '26px 24px', cursor: 'pointer',
            transition: 'border-color 0.15s, box-shadow 0.15s',
            display: 'flex', flexDirection: 'column', gap: 14,
          }}
          onMouseEnter={e => {
            e.currentTarget.style.borderColor = ILAW_COLOR;
            e.currentTarget.style.boxShadow = '0 4px 20px rgba(29,78,216,0.14)';
          }}
          onMouseLeave={e => {
            e.currentTarget.style.borderColor = 'rgba(29,78,216,0.15)';
            e.currentTarget.style.boxShadow = 'none';
          }}
        >
          <div style={{
            width: 48, height: 48, borderRadius: 12,
            background: 'linear-gradient(135deg, #dbeafe, #bfdbfe)',
            display: 'grid', placeItems: 'center',
          }}>
            <BookOpen size={22} color={ILAW_COLOR} />
          </div>

          <div>
            <p style={{ margin: '0 0 6px', fontSize: 17, fontWeight: 700, color: '#0d2218' }}>
              Build your ILAW Lesson Plan
            </p>
            <p style={{ margin: 0, fontSize: 13, color: '#4a6357', lineHeight: 1.6 }}>
              AI-generated detailed lesson plans per session. 3 steps, ~5 minutes. Pre-lesson, flow, assessment, extended learning.
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 'auto' }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: ILAW_COLOR }}>3 tokens per generation</span>
            <ArrowRight size={14} color={ILAW_COLOR} />
          </div>
        </button>

        {/* DLL card — Rice Terrace Green */}
        <button
          onClick={() => navigate('/dll-gen/step-1')}
          style={{
            textAlign: 'left', background: '#fff',
            border: `2px solid rgba(22,163,74,0.15)`,
            borderRadius: 16, padding: '26px 24px', cursor: 'pointer',
            transition: 'border-color 0.15s, box-shadow 0.15s',
            display: 'flex', flexDirection: 'column', gap: 14,
          }}
          onMouseEnter={e => {
            e.currentTarget.style.borderColor = DLL_COLOR;
            e.currentTarget.style.boxShadow = '0 4px 20px rgba(22,163,74,0.14)';
          }}
          onMouseLeave={e => {
            e.currentTarget.style.borderColor = 'rgba(22,163,74,0.15)';
            e.currentTarget.style.boxShadow = 'none';
          }}
        >
          <div style={{
            width: 48, height: 48, borderRadius: 12,
            background: 'linear-gradient(135deg, #dcfce7, #bbf7d0)',
            display: 'grid', placeItems: 'center',
          }}>
            <CalendarDays size={22} color={DLL_COLOR} />
          </div>

          <div>
            <p style={{ margin: '0 0 6px', fontSize: 17, fontWeight: 700, color: '#0d2218' }}>
              Build your Daily Lesson Log
            </p>
            <p style={{ margin: 0, fontSize: 13, color: '#4a6357', lineHeight: 1.6 }}>
              DepEd standard DLL format. AI fills in all 10 procedure steps for each day. Exports as landscape A4 Word document.
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 'auto' }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: DLL_COLOR }}>3 tokens per generation</span>
            <ArrowRight size={14} color={DLL_COLOR} />
          </div>
        </button>

        {/* COT card — Sunburst Amber-Gold */}
        <button
          onClick={() => navigate('/cot-gen/step-1')}
          style={{
            textAlign: 'left', background: '#fff',
            border: `2px solid rgba(217,119,6,0.15)`,
            borderRadius: 16, padding: '26px 24px', cursor: 'pointer',
            transition: 'border-color 0.15s, box-shadow 0.15s',
            display: 'flex', flexDirection: 'column', gap: 14,
          }}
          onMouseEnter={e => {
            e.currentTarget.style.borderColor = COT_COLOR;
            e.currentTarget.style.boxShadow = '0 4px 20px rgba(217,119,6,0.14)';
          }}
          onMouseLeave={e => {
            e.currentTarget.style.borderColor = 'rgba(217,119,6,0.15)';
            e.currentTarget.style.boxShadow = 'none';
          }}
        >
          <div style={{
            width: 48, height: 48, borderRadius: 12,
            background: 'linear-gradient(135deg, #fef3c7, #fde68a)',
            display: 'grid', placeItems: 'center',
          }}>
            <ShieldCheck size={22} color={COT_COLOR} />
          </div>

          <div>
            <p style={{ margin: '0 0 4px', fontSize: 17, fontWeight: 700, color: '#0d2218' }}>
              Build your COT Lesson Plan
            </p>
            <p style={{ margin: '0 0 6px', fontSize: 11, fontWeight: 700, color: COT_COLOR, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              COT-optimized · 4As Framework
            </p>
            <p style={{ margin: 0, fontSize: 13, color: '#4a6357', lineHeight: 1.6 }}>
              Full PIVOT 4A / IDEA lesson plan with a built-in COT Indicator Evidence Map for your IPCRF defense.
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 'auto' }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: COT_COLOR }}>3 tokens per generation</span>
            <ArrowRight size={14} color={COT_COLOR} />
          </div>
        </button>

      </div>

      {/* Resume draft */}
      {hasDraft && (
        <div style={{
          background: 'rgba(29,78,216,0.04)', border: '1px solid rgba(29,78,216,0.12)',
          borderRadius: 12, padding: '14px 18px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div>
            <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: '#1e3a8a' }}>
              You have an ILAW draft in progress
            </p>
            <p style={{ margin: '2px 0 0', fontSize: 12, color: '#4a6357' }}>
              {store.subject || 'Untitled'} — continue where you left off
            </p>
          </div>
          <button onClick={handleResume} className="btn-outline" style={{ fontSize: 13, padding: '8px 16px' }}>
            <RotateCcw size={13} />
            Resume
          </button>
        </div>
      )}
    </div>
  );
}
