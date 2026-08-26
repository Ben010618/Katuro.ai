import PropTypes from 'prop-types';
import { X } from 'lucide-react';

/**
 * A speech bubble that appears to be spoken by the floating mascot.
 *
 * Positioned by the caller; this renders the bubble body plus the tail that
 * points down toward whatever is below its right edge. The tail is two stacked
 * triangles (border colour behind, background colour in front, offset by 1px)
 * so the bubble's 1px border appears to continue around the point — a single
 * triangle would leave the tail looking unbordered against the page.
 */
export default function SpeechBubble({ title, children, onClose, footer, maxWidth = 300 }) {
  return (
    <div
      role="dialog"
      aria-label={title || 'Message from kaTuro'}
      className="kt-bubble"
      style={{
        position: 'relative',
        width: 'max-content',
        maxWidth,
        background: '#fff',
        border: '1px solid rgba(45,106,79,0.18)',
        borderRadius: 16,
        padding: '14px 16px 16px',
        boxShadow: '0 14px 34px rgba(13,34,24,0.20)',
      }}
    >
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          aria-label="Close message"
          style={{
            position: 'absolute', top: 8, right: 8,
            width: 24, height: 24, borderRadius: '50%',
            border: 'none', cursor: 'pointer', padding: 0,
            background: 'var(--kt-green-tint)',
            color: 'var(--kt-green-dark)',
            display: 'grid', placeItems: 'center',
          }}
        >
          <X size={14} />
        </button>
      )}

      {title && (
        <p style={{
          margin: '0 26px 6px 0',
          fontSize: 11, fontWeight: 700,
          textTransform: 'uppercase', letterSpacing: '1.2px',
          color: 'var(--kt-green-primary)',
        }}>
          {title}
        </p>
      )}

      <div style={{
        fontSize: 14,
        lineHeight: 1.6,
        color: 'var(--kt-text-primary)',
        // Admin text is free-form and may contain a long unbroken string;
        // without this the bubble would blow past maxWidth.
        overflowWrap: 'anywhere',
        whiteSpace: 'pre-wrap',
        maxHeight: '45vh',
        overflowY: 'auto',
      }}>
        {children}
      </div>

      {footer && <div style={{ marginTop: 12 }}>{footer}</div>}

      {/* Tail — border layer, then fill layer 1px above it */}
      <span aria-hidden style={{
        position: 'absolute', bottom: -10, right: 26,
        width: 0, height: 0,
        borderLeft: '10px solid transparent',
        borderRight: '10px solid transparent',
        borderTop: '10px solid rgba(45,106,79,0.18)',
      }} />
      <span aria-hidden style={{
        position: 'absolute', bottom: -9, right: 26,
        width: 0, height: 0,
        borderLeft: '10px solid transparent',
        borderRight: '10px solid transparent',
        borderTop: '10px solid #fff',
      }} />
    </div>
  );
}

SpeechBubble.propTypes = {
  title:    PropTypes.string,
  children: PropTypes.node,
  onClose:  PropTypes.func,
  footer:   PropTypes.node,
  maxWidth: PropTypes.number,
};
