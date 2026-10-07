import { useFacultyStore } from '../store/facultyStore';
import { Sparkles } from 'lucide-react';

/**
 * CoTeacherBanner - Unified Co-Teacher Header for kaTuro modules
 *
 * Blends Co-Teacher presence (avatar, identity, prompt tip) seamlessly with
 * the page/step title, badge, and description into a single cohesive, purposeful header.
 *
 * Customization of names and avatars is exclusively accessed via the Settings
 * button in the bottom-left sidebar.
 */
export default function CoTeacherBanner({
  agentId = 'dll',
  badge = null,
  title = null,
  description = null,
  tip = null,
  customMessage = null,
  compact = false,
  actions = null,
}) {
  const { faculty } = useFacultyStore();

  const agent = faculty[agentId] || faculty.dll;
  const displayName = agent.customName || agent.defaultName;
  const quote = tip || customMessage || agent.tagline;

  if (compact) {
    return (
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
            // Accent as text: same colour in light mode, lightened in dark mode (--kt-accent-ink-mix).
            color: `color-mix(in srgb, ${agent.color || '#059669'} var(--kt-accent-ink-mix, 100%), #ffffff)`,
            background: `${agent.color || '#059669'}15`,
            padding: '2px 8px',
            borderRadius: 100,
          }}
        >
          {badge || agent.badge}
        </span>
      </div>
    );
  }

  return (
    <div
      style={{
        background: 'var(--kt-card, #ffffff)',
        borderRadius: 16,
        border: `1.5px solid ${agent.color || '#059669'}28`,
        padding: title ? '20px 24px' : '16px 20px',
        marginBottom: 24,
        position: 'relative',
        overflow: 'hidden',
        boxShadow: '0 4px 20px -2px rgba(0,0,0,0.04)',
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

      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 18 }}>
        {/* Avatar with active indicator */}
        <div style={{ position: 'relative', flexShrink: 0, marginTop: 2 }}>
          <img
            src={agent.avatar}
            alt={displayName}
            style={{
              width: title ? 58 : 50,
              height: title ? 58 : 50,
              borderRadius: '50%',
              border: `2.5px solid ${agent.color || '#059669'}`,
              background: 'var(--kt-surface, #f8fafc)',
              objectFit: 'cover',
              boxShadow: `0 0 14px ${agent.color || '#059669'}25`,
            }}
          />
          <span
            style={{
              position: 'absolute',
              bottom: 1,
              right: 1,
              width: 14,
              height: 14,
              borderRadius: '50%',
              background: '#10b981',
              border: '2px solid #ffffff',
            }}
            title="Active Co-Teacher"
          />
        </div>

        {/* Content Column */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Top badges bar */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              flexWrap: 'wrap',
              marginBottom: title ? 6 : 4,
            }}
          >
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                // Accent as text: same colour in light mode, lightened in dark mode (--kt-accent-ink-mix).
                color: `color-mix(in srgb, ${agent.color || '#059669'} var(--kt-accent-ink-mix, 100%), #ffffff)`,
                background: `${agent.color || '#059669'}15`,
                padding: '3px 10px',
                borderRadius: 100,
                textTransform: 'uppercase',
                letterSpacing: '0.8px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
              }}
            >
              {badge || agent.badge}
            </span>
            <span
              style={{
                fontSize: 11.5,
                fontWeight: 600,
                color: 'var(--kt-text-secondary, #64748b)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
              }}
            >
              <span>Guided by</span>
              <strong style={{ color: 'var(--kt-text-primary, #0f172a)' }}>{displayName}</strong>
              <span>· {agent.role}</span>
            </span>
          </div>

          {/* Unified title */}
          {title && (
            <h2
              style={{
                margin: '0 0 6px',
                fontSize: 22,
                fontWeight: 700,
                color: 'var(--kt-text-primary, #0f172a)',
                letterSpacing: '-0.3px',
                lineHeight: 1.25,
              }}
            >
              {title}
            </h2>
          )}

          {/* Unified description */}
          {description && (
            <p
              style={{
                margin: '0 0 10px',
                fontSize: 13.5,
                color: 'var(--kt-text-secondary, #64748b)',
                lineHeight: 1.6,
                maxWidth: 640,
              }}
            >
              {description}
            </p>
          )}

          {/* Co-teacher voice / tip pill */}
          {quote && (
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 7,
                fontSize: 12,
                color: 'var(--kt-text-secondary, #475569)',
                background: 'var(--kt-surface, #f8fafc)',
                padding: '5px 12px',
                borderRadius: 8,
                border: '1px solid rgba(0,0,0,0.05)',
                marginTop: title ? 2 : 4,
              }}
            >
              <Sparkles size={12} color={agent.color || '#059669'} style={{ flexShrink: 0 }} />
              <span>
                <strong style={{ color: 'var(--kt-text-primary, #1e293b)' }}>{displayName}:</strong>{' '}
                <span style={{ fontStyle: 'italic' }}>"{quote}"</span>
              </span>
            </div>
          )}
        </div>

        {actions && (
          <div style={{ flexShrink: 0 }}>
            {actions}
          </div>
        )}
      </div>
    </div>
  );
}
