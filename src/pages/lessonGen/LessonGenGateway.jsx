import { useNavigate } from 'react-router-dom';
import { useLessonGenStore } from '../../store/lessonGenStore';
import { useAuth } from '../../hooks/useAuth';
import { Sparkles, BookOpen, CalendarDays, ArrowRight, RotateCcw, ShieldCheck } from 'lucide-react';

// ── Colors extracted from the Filipino education mural ─────────────────────
// 1. Philippine Flag Blue  — cobalt sky & flag field  #0f2d6e → #1d4ed8
// 2. Rice Terrace Green    — lush mountains & terraces #14532d → #16a34a
// 3. Sunburst Amber-Gold   — radiating sun & flag gold #92400e → #d97706

const TYPES = [
  {
    key: 'ilaw',
    color: '#1d4ed8', accentRgb: '29,78,216',
    iconBg: 'linear-gradient(135deg, #dbeafe, #bfdbfe)',
    Icon: BookOpen,
    title: 'Build your ILAW Lesson Plan',
    description: 'AI-generated detailed lesson plans per session. 3 steps, ~5 minutes. Pre-lesson, flow, assessment, extended learning.',
  },
  {
    key: 'dll',
    color: '#16a34a', accentRgb: '22,163,74',
    iconBg: 'linear-gradient(135deg, #dcfce7, #bbf7d0)',
    Icon: CalendarDays,
    title: 'Build your Daily Lesson Log',
    description: 'DepEd standard DLL format. AI fills in all 10 procedure steps for each day. Exports as landscape A4 Word document.',
  },
  {
    key: 'cot',
    color: '#d97706', accentRgb: '217,119,6',
    iconBg: 'linear-gradient(135deg, #fef3c7, #fde68a)',
    Icon: ShieldCheck,
    title: 'Build your COT Lesson Plan',
    badge: 'COT-optimized · 4As Framework',
    description: 'Full PIVOT 4A / IDEA lesson plan with a built-in COT Indicator Evidence Map for your IPCRF defense.',
  },
];

function TypeCard({ type, freeMode, onClick }) {
  const { color, accentRgb, iconBg, Icon, title, badge, description } = type;
  return (
    <button
      onClick={onClick}
      className="kt-3d-card"
      style={{ '--card-accent': accentRgb }}
    >
      <div className="kt-3d-card-icon" style={{ background: iconBg }}>
        <Icon size={22} color={color} />
      </div>

      <div>
        <p style={{ margin: badge ? '0 0 4px' : '0 0 6px', fontSize: 17, fontWeight: 700, color: 'var(--kt-text-primary)' }}>
          {title}
        </p>
        {badge && (
          <p style={{ margin: '0 0 6px', fontSize: 11, fontWeight: 700, color, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            {badge}
          </p>
        )}
        <p style={{ margin: 0, fontSize: 13, color: 'var(--kt-text-secondary)', lineHeight: 1.6 }}>
          {description}
        </p>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 'auto' }}>
        {!freeMode && <span style={{ fontSize: 12, fontWeight: 600, color }}>3 tokens per generation</span>}
        <ArrowRight size={14} color={color} />
      </div>
    </button>
  );
}

export default function LessonGenGateway() {
  const navigate = useNavigate();
  const store    = useLessonGenStore();
  const { freeMode } = useAuth();

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

  const HANDLERS = {
    ilaw: handleILAW,
    dll:  () => navigate('/dll-gen/step-1'),
    cot:  () => navigate('/cot-gen/step-1'),
  };

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
        <h1 style={{ margin: 0, fontSize: 28, fontWeight: 700, color: 'var(--kt-text-primary)', lineHeight: 1.2 }}>
          What would you like to build?
        </h1>
        <p style={{ margin: '6px 0 0', fontSize: 15, color: 'var(--kt-text-secondary)', lineHeight: 1.65 }}>
          Choose a document type to get started.
        </p>
      </div>

      {/* Type cards */}
      <div className="kt-grid-3" style={{ gap: 18, marginBottom: 28, paddingTop: 4 }}>
        {TYPES.map(type => (
          <TypeCard key={type.key} type={type} freeMode={freeMode} onClick={HANDLERS[type.key]} />
        ))}
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
