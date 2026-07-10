import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { ClipboardList, ClipboardCheck, ArrowRight } from 'lucide-react';

const TYPES = [
  {
    key: 'quiz',
    color: '#1d4ed8', accentRgb: '29,78,216',
    iconBg: 'linear-gradient(135deg, #dbeafe, #bfdbfe)',
    Icon: ClipboardList,
    title: 'kaTuro AI Quiz Builder',
    description: 'Turn any lesson into a ready-to-print quiz in minutes. Pick a lesson, set your quiz preferences, then preview and print.',
  },
  {
    key: 'test',
    color: '#534AB7', accentRgb: '83,74,183',
    iconBg: 'linear-gradient(135deg, #ede9fe, #ddd6fe)',
    Icon: ClipboardCheck,
    title: 'kaTuro AI Test Builder',
    badge: 'Newly Added · DepEd TOS',
    description: 'Build a DepEd-compliant test with Bloom’s taxonomy levels and a full Table of Specifications, guided step by step.',
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
          <div style={{
            background: 'linear-gradient(135deg, #0d2218, #2d6a4f)',
            borderRadius: 10, padding: '6px 10px',
            display: 'flex', alignItems: 'center', gap: 6,
          }}>
            <ClipboardCheck size={13} color="#52b788" />
            <span style={{ fontSize: 11, fontWeight: 700, color: '#52b788', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
              AI Assessment Tools
            </span>
          </div>
        </div>
        <h1 style={{ margin: 0, fontSize: 28, fontWeight: 700, color: 'var(--kt-text-primary)', lineHeight: 1.2 }}>
          What would you like to build?
        </h1>
        <p style={{ margin: '6px 0 0', fontSize: 15, color: 'var(--kt-text-secondary)', lineHeight: 1.65 }}>
          Choose a tool to get started.
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
