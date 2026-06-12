import { useNavigate } from 'react-router-dom';
import { useLessonGenStore } from '../../store/lessonGenStore';
import { Sparkles, BookOpen, CalendarDays, ArrowRight, RotateCcw, ShieldCheck } from 'lucide-react';

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
    <div style={{ maxWidth: 760, margin: '0 auto' }}>

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

        {/* ILAW card */}
        <button
          onClick={handleILAW}
          style={{
            textAlign: 'left', background: '#fff', border: '2px solid rgba(45,106,79,0.15)',
            borderRadius: 16, padding: '26px 24px', cursor: 'pointer',
            transition: 'border-color 0.15s, box-shadow 0.15s',
            display: 'flex', flexDirection: 'column', gap: 14,
          }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = '#2d6a4f'; e.currentTarget.style.boxShadow = '0 4px 20px rgba(45,106,79,0.12)'; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(45,106,79,0.15)'; e.currentTarget.style.boxShadow = 'none'; }}
        >
          <div style={{
            width: 48, height: 48, borderRadius: 12,
            background: 'linear-gradient(135deg, #ccfbf1, #d8f3dc)',
            display: 'grid', placeItems: 'center',
          }}>
            <BookOpen size={22} color="#0d9488" />
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
            <span style={{ fontSize: 12, fontWeight: 600, color: '#0d9488' }}>3 tokens per generation</span>
            <ArrowRight size={14} color="#0d9488" />
          </div>
        </button>

        {/* DLL card */}
        <button
          onClick={() => navigate('/dll-gen/step-1')}
          style={{
            textAlign: 'left', background: '#fff', border: '2px solid rgba(79,70,229,0.15)',
            borderRadius: 16, padding: '26px 24px', cursor: 'pointer',
            transition: 'border-color 0.15s, box-shadow 0.15s',
            display: 'flex', flexDirection: 'column', gap: 14,
          }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = '#4f46e5'; e.currentTarget.style.boxShadow = '0 4px 20px rgba(79,70,229,0.12)'; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(79,70,229,0.15)'; e.currentTarget.style.boxShadow = 'none'; }}
        >
          <div style={{
            width: 48, height: 48, borderRadius: 12,
            background: 'linear-gradient(135deg, #ede9fe, #e0e7ff)',
            display: 'grid', placeItems: 'center',
          }}>
            <CalendarDays size={22} color="#4f46e5" />
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
            <span style={{ fontSize: 12, fontWeight: 600, color: '#4f46e5' }}>3 tokens per generation</span>
            <ArrowRight size={14} color="#4f46e5" />
          </div>
        </button>

        {/* COT card */}
        <button
          onClick={() => navigate('/cot-gen/step-1')}
          style={{
            textAlign: 'left', background: '#fff', border: '2px solid rgba(124,58,237,0.15)',
            borderRadius: 16, padding: '26px 24px', cursor: 'pointer',
            transition: 'border-color 0.15s, box-shadow 0.15s',
            display: 'flex', flexDirection: 'column', gap: 14,
          }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = '#7c3aed'; e.currentTarget.style.boxShadow = '0 4px 20px rgba(124,58,237,0.12)'; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(124,58,237,0.15)'; e.currentTarget.style.boxShadow = 'none'; }}
        >
          <div style={{
            width: 48, height: 48, borderRadius: 12,
            background: 'linear-gradient(135deg, #f3e8ff, #ede9fe)',
            display: 'grid', placeItems: 'center',
          }}>
            <ShieldCheck size={22} color="#7c3aed" />
          </div>

          <div>
            <p style={{ margin: '0 0 4px', fontSize: 17, fontWeight: 700, color: '#0d2218' }}>
              PPST-aligned Lesson Plan
            </p>
            <p style={{ margin: '0 0 6px', fontSize: 11, fontWeight: 700, color: '#7c3aed', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              COT-optimized · 4As Framework
            </p>
            <p style={{ margin: 0, fontSize: 13, color: '#4a6357', lineHeight: 1.6 }}>
              Full PIVOT 4A / IDEA lesson plan with a built-in COT Indicator Evidence Map for your IPCRF defense.
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 'auto' }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: '#7c3aed' }}>3 tokens per generation</span>
            <ArrowRight size={14} color="#7c3aed" />
          </div>
        </button>

      </div>

      {/* Resume draft */}
      {hasDraft && (
        <div style={{
          background: 'rgba(45,106,79,0.04)', border: '1px solid rgba(45,106,79,0.12)',
          borderRadius: 12, padding: '14px 18px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div>
            <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: '#1a3d2b' }}>
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
