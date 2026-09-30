import { useState } from 'react';
import { useFacultyStore } from '../store/facultyStore';
import FacultyCustomizerModal from './FacultyCustomizerModal';
import { Sparkles, Settings2, MessageSquare } from 'lucide-react';

export default function CoTeacherBanner({
  agentId = 'dll',
  customMessage = null,
  compact = false,
}) {
  const { faculty } = useFacultyStore();
  const [modalOpen, setModalOpen] = useState(false);

  const agent = faculty[agentId] || faculty.dll;
  const displayName = agent.customName || agent.defaultName;
  const message = customMessage || agent.tagline;

  if (compact) {
    return (
      <>
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 10,
            padding: '6px 14px',
            borderRadius: 100,
            background: 'var(--kt-card, #ffffff)',
            border: `1.5px solid ${agent.color || '#059669'}40`,
            boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
            marginBottom: 16,
          }}
        >
          <img
            src={agent.avatar}
            alt={displayName}
            style={{
              width: 26,
              height: 26,
              borderRadius: '50%',
              border: `1.5px solid ${agent.color || '#059669'}`,
              objectFit: 'cover',
            }}
          />
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--kt-text-primary, #1e293b)' }}>
            Guided by {displayName}
          </span>
          <span
            style={{
              fontSize: 10,
              fontWeight: 700,
              color: agent.color || '#059669',
              background: `${agent.color || '#059669'}15`,
              padding: '2px 8px',
              borderRadius: 100,
            }}
          >
            {agent.badge}
          </span>
          <button
            onClick={() => setModalOpen(true)}
            title="Customize Co-Teacher Name & Avatar"
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--kt-text-secondary, #64748b)',
              padding: 2,
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <Settings2 size={13} />
          </button>
        </div>
        <FacultyCustomizerModal isOpen={modalOpen} onClose={() => setModalOpen(false)} />
      </>
    );
  }

  return (
    <>
      <div
        style={{
          background: 'var(--kt-card, #ffffff)',
          borderRadius: 16,
          border: `1.5px solid ${agent.color || '#059669'}30`,
          padding: '16px 20px',
          marginBottom: 24,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 16,
          boxShadow: '0 4px 16px rgba(0,0,0,0.03)',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Subtle theme accent stripe on left */}
        <div
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            bottom: 0,
            width: 4,
            background: agent.color || '#059669',
          }}
        />

        <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 0, flex: 1 }}>
          <div style={{ position: 'relative', flexShrink: 0 }}>
            <img
              src={agent.avatar}
              alt={displayName}
              style={{
                width: 50,
                height: 50,
                borderRadius: '50%',
                border: `2px solid ${agent.color || '#059669'}`,
                background: 'var(--kt-surface, #f8fafc)',
                objectFit: 'cover',
                boxShadow: `0 0 12px ${agent.color || '#059669'}30`,
              }}
            />
            <span
              style={{
                position: 'absolute',
                bottom: -2,
                right: -2,
                width: 14,
                height: 14,
                borderRadius: '50%',
                background: '#10b981',
                border: '2px solid #ffffff',
              }}
              title="Active Co-Teacher"
            />
          </div>

          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span
                style={{
                  fontSize: 15,
                  fontWeight: 800,
                  color: 'var(--kt-text-primary, #0f172a)',
                  letterSpacing: '-0.2px',
                }}
              >
                {displayName}
              </span>
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  color: agent.color || '#059669',
                  background: `${agent.color || '#059669'}18`,
                  padding: '2px 8px',
                  borderRadius: 100,
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                }}
              >
                {agent.badge}
              </span>
              <span
                style={{
                  fontSize: 11,
                  color: 'var(--kt-text-secondary, #64748b)',
                  fontWeight: 600,
                }}
              >
                · {agent.role}
              </span>
            </div>

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                marginTop: 4,
                fontSize: 12.5,
                color: 'var(--kt-text-secondary, #475569)',
              }}
            >
              <MessageSquare size={13} style={{ flexShrink: 0, opacity: 0.6 }} />
              <span style={{ fontStyle: 'italic' }}>"{message}"</span>
            </div>
          </div>
        </div>

        {/* Customization Action */}
        <button
          onClick={() => setModalOpen(true)}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '6px 12px',
            borderRadius: 8,
            border: '1px solid rgba(220,208,174,0.3)',
            background: 'var(--kt-surface, #f8fafc)',
            color: 'var(--kt-text-secondary, #475569)',
            fontSize: 11.5,
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
          <span>Customize Avatar & Name</span>
        </button>
      </div>

      <FacultyCustomizerModal isOpen={modalOpen} onClose={() => setModalOpen(false)} />
    </>
  );
}
