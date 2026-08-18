import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { ClipboardList, ClipboardCheck, ArrowRight } from 'lucide-react';

const TYPES = [
  {
    key: 'quiz',
    Icon: ClipboardList,
    title: 'kaTuro AI Quiz Builder',
    badge: 'Quick Assessment',
    description: 'Turn any lesson into a ready-to-print quiz in minutes. Pick a lesson, set your quiz preferences, then preview and print.',
  },
  {
    key: 'test',
    Icon: ClipboardCheck,
    title: 'kaTuro AI Test Builder',
    badge: 'DepEd Table of Specifications (TOS)',
    description: 'Build a DepEd-compliant test with Bloom’s taxonomy levels and a full Table of Specifications, guided step by step.',
  },
];

function TypeCard({ type, freeMode, onClick }) {
  const { Icon, title, badge, description } = type;
  return (
    <button
      onClick={onClick}
      style={{
        background: 'var(--kt-card)',
        borderRadius: 'var(--kt-radius-md)',
        border: '1px solid var(--kt-border)',
        padding: '24px',
        textAlign: 'left',
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
        transition: 'all 0.15s ease',
        boxShadow: 'var(--kt-shadow-sm)',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.borderColor = 'var(--kt-manila-border)';
        e.currentTarget.style.transform = 'translateY(-2px)';
        e.currentTarget.style.boxShadow = 'var(--kt-shadow-md)';
      }}
      onMouseLeave={e => {
        e.currentTarget.style.borderColor = 'var(--kt-border)';
        e.currentTarget.style.transform = 'translateY(0)';
        e.currentTarget.style.boxShadow = 'var(--kt-shadow-sm)';
      }}
    >
      <div style={{
        width: 44,
        height: 44,
        borderRadius: 'var(--kt-radius-sm)',
        background: 'var(--kt-card-2)',
        border: '1px solid var(--kt-border)',
        display: 'grid',
        placeItems: 'center',
      }}>
        <Icon size={22} color="var(--kt-chalkboard)" />
      </div>

      <div style={{ flex: 1 }}>
        <p style={{ margin: '0 0 6px', fontSize: 18, fontWeight: 700, color: 'var(--kt-text-primary)', fontFamily: 'var(--kt-font-heading)' }}>
          {title}
        </p>
        {badge && (
          <span style={{
            display: 'inline-block',
            margin: '0 0 8px',
            background: 'var(--kt-manila)',
            color: 'var(--kt-text-primary)',
            border: '1px solid var(--kt-manila-border)',
            borderRadius: 'var(--kt-radius-sm)',
            padding: '2px 8px',
            fontSize: 10.5,
            fontWeight: 700,
            fontFamily: 'var(--kt-font-mono)',
          }}>
            {badge}
          </span>
        )}
        <p style={{ margin: 0, fontSize: 13.5, color: 'var(--kt-text-secondary)', lineHeight: 1.6 }}>
          {description}
        </p>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 'auto', paddingTop: 10, borderTop: '1px solid var(--kt-border)' }}>
        {!freeMode ? <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--kt-text-secondary)', fontFamily: 'var(--kt-font-mono)' }}>3 tokens per generation</span> : <div />}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--kt-chalkboard)', fontWeight: 700, fontSize: 13 }}>
          Open Tool <ArrowRight size={14} />
        </div>
      </div>
    </button>
  );
}

export default function AssessmentGateway() {
  const navigate = useNavigate();
  const { freeMode } = useAuth();

  const HANDLERS = {
    quiz: () => navigate('/quiz-builder'),
    test: () => navigate('/test-builder'),
  };

  return (
    <div style={{ maxWidth: 820, margin: '0 auto' }}>

      {/* Header */}
      <div style={{ marginBottom: 32 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <span style={{
            background: 'var(--kt-manila)',
            color: 'var(--kt-text-primary)',
            border: '1px solid var(--kt-manila-border)',
            borderRadius: 'var(--kt-radius-sm)',
            padding: '3px 10px',
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '1px',
            textTransform: 'uppercase',
            fontFamily: 'var(--kt-font-mono)',
          }}>
            AI Assessment Tools
          </span>
        </div>
        <h1 style={{ margin: 0, fontSize: 26, fontWeight: 700, color: 'var(--kt-text-primary)', lineHeight: 1.2, fontFamily: 'var(--kt-font-heading)' }}>
          What would you like to build?
        </h1>
        <p style={{ margin: '6px 0 0', fontSize: 14, color: 'var(--kt-text-secondary)', lineHeight: 1.6 }}>
          Choose an assessment tool from your Teacher's Desk.
        </p>
      </div>

      {/* Type cards */}
      <div className="kt-grid-2" style={{ gap: 18, marginBottom: 28, paddingTop: 4 }}>
        {TYPES.map(type => (
          <TypeCard key={type.key} type={type} freeMode={freeMode} onClick={HANDLERS[type.key]} />
        ))}
      </div>
    </div>
  );
}
