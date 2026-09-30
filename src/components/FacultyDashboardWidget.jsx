import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useFacultyStore } from '../store/facultyStore';
import FacultyCustomizerModal from './FacultyCustomizerModal';
import { Users, Settings2, ArrowRight, Sparkles } from 'lucide-react';

export default function FacultyDashboardWidget() {
  const { faculty } = useFacultyStore();
  const navigate = useNavigate();
  const [modalOpen, setModalOpen] = useState(false);

  const agents = Object.values(faculty);

  return (
    <div
      style={{
        background: 'var(--kt-card, #ffffff)',
        borderRadius: 'var(--kt-radius-md, 14px)',
        padding: '22px 24px',
        border: '1px solid var(--kt-border, rgba(220,208,174,0.3))',
        boxShadow: 'var(--kt-shadow-sm, 0 1px 3px rgba(0,0,0,0.05))',
        position: 'relative',
      }}
    >
      {/* Widget Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 12,
          marginBottom: 18,
          borderBottom: '1px solid rgba(220,208,174,0.18)',
          paddingBottom: 14,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 8,
              background: 'rgba(52, 211, 153, 0.15)',
              display: 'grid',
              placeItems: 'center',
            }}
          >
            <Users size={18} color="#059669" />
          </div>
          <div>
            <h3
              style={{
                margin: 0,
                fontSize: 16,
                fontWeight: 800,
                color: 'var(--kt-text-primary, #0f172a)',
                fontFamily: 'var(--kt-font-heading, inherit)',
              }}
            >
              Your AI Co-Teacher Faculty
            </h3>
            <p style={{ margin: 0, fontSize: 12, color: 'var(--kt-text-secondary, #64748b)' }}>
              5 specialized partners ready to handle your lesson plans, exams, grading, and slides.
            </p>
          </div>
        </div>

        <button
          onClick={() => setModalOpen(true)}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '7px 14px',
            borderRadius: 8,
            border: '1px solid rgba(220,208,174,0.3)',
            background: 'var(--kt-surface, #f8fafc)',
            color: 'var(--kt-text-secondary, #475569)',
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer',
            transition: 'all 0.15s ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(52, 211, 153, 0.12)';
            e.currentTarget.style.color = '#059669';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'var(--kt-surface, #f8fafc)';
            e.currentTarget.style.color = 'var(--kt-text-secondary, #475569)';
          }}
        >
          <Settings2 size={13} />
          <span>Customize Avatars & Names</span>
        </button>
      </div>

      {/* Grid of 5 Co-Teachers */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: 14,
        }}
      >
        {agents.map((agent) => {
          const displayName = agent.customName || agent.defaultName;
          return (
            <div
              key={agent.id}
              onClick={() => navigate(agent.route)}
              style={{
                background: 'var(--kt-surface, #f8fafc)',
                borderRadius: 12,
                border: '1px solid var(--kt-border, #e2e8f0)',
                padding: '16px 14px',
                display: 'flex',
                flexDirection: 'column',
                cursor: 'pointer',
                transition: 'all 0.18s ease',
                position: 'relative',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = agent.color || '#059669';
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.boxShadow = '0 6px 16px rgba(0,0,0,0.06)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'var(--kt-border, #e2e8f0)';
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = 'none';
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                <div style={{ position: 'relative' }}>
                  <img
                    src={agent.avatar}
                    alt={displayName}
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: '50%',
                      border: `2px solid ${agent.color || '#059669'}`,
                      background: '#ffffff',
                      objectFit: 'cover',
                    }}
                  />
                  <span
                    style={{
                      position: 'absolute',
                      bottom: 0,
                      right: 0,
                      width: 10,
                      height: 10,
                      borderRadius: '50%',
                      background: '#10b981',
                      border: '1.5px solid #ffffff',
                    }}
                  />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 14,
                      fontWeight: 800,
                      color: 'var(--kt-text-primary, #0f172a)',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {displayName}
                  </div>
                  <span
                    style={{
                      fontSize: 9.5,
                      fontWeight: 700,
                      color: agent.color || '#059669',
                      background: `${agent.color || '#059669'}18`,
                      padding: '1px 6px',
                      borderRadius: 100,
                      display: 'inline-block',
                      marginTop: 2,
                    }}
                  >
                    {agent.badge}
                  </span>
                </div>
              </div>

              <div
                style={{
                  fontSize: 11.5,
                  fontWeight: 600,
                  color: 'var(--kt-text-secondary, #64748b)',
                  lineHeight: 1.35,
                  marginBottom: 12,
                  flex: 1,
                }}
              >
                {agent.role}
              </div>

              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  fontSize: 11.5,
                  fontWeight: 700,
                  color: agent.color || '#059669',
                  marginTop: 'auto',
                }}
              >
                <span>Launch Tool</span>
                <ArrowRight size={12} />
              </div>
            </div>
          );
        })}
      </div>

      <FacultyCustomizerModal isOpen={modalOpen} onClose={() => setModalOpen(false)} />
    </div>
  );
}
