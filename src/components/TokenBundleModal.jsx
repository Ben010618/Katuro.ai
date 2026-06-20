import { useEffect, useState, useRef } from 'react';
import { X, Zap } from 'lucide-react';
import ktLogo from '../assets/KT Favicon.png';

const BUNDLES = [
  {
    id: 'mini',
    name: 'Mini',
    tokens: 50,
    price: 49,
    perToken: '₱0.98',
    bestFor: 'Try it out',
    badge: null,
  },
  {
    id: 'starter',
    name: 'Starter',
    tokens: 110,
    price: 99,
    perToken: '₱0.90',
    bestFor: 'New teachers',
    badge: null,
  },
  {
    id: 'teacher',
    name: 'Teacher',
    tokens: 300,
    price: 249,
    perToken: '₱0.83',
    bestFor: '1 month regular use',
    badge: 'Most Popular',
    highlight: true,
  },
  {
    id: 'school',
    name: 'School Pack',
    tokens: 1500,
    price: 999,
    perToken: '₱0.67',
    bestFor: 'Share with colleagues',
    badge: 'Best Value',
    valueBadge: true,
  },
];

const CTAS = [
  'Ang magandang guro ay hindi titigil — mag-dagdag ng tokens ngayon!',
  'Para sa mas maginhawang pagpaplano ng aralin — kumuha ng bundle ngayon.',
  'Bawat token, isang hakbang patungo sa mas mahusay na pagtuturo.',
  'Isang bundle lang — maraming lessons, quizzes, at DLLs para sa buong buwan!',
  "Your tokens ran out — your students haven't. Get more.",
  "Great teachers never stop. Neither should your AI.",
];

const FB_URL = 'https://www.facebook.com/Teachers2ls';

function FacebookIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" />
    </svg>
  );
}

export default function TokenBundleModal({ onClose }) {
  const [cta] = useState(() => CTAS[Math.floor(Math.random() * CTAS.length)]);
  const overlayRef = useRef(null);

  // Close on Escape
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  // Prevent body scroll
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  return (
    <>
      <style>{`
        @keyframes kt-modal-in {
          from { opacity: 0; transform: translateY(24px) scale(0.97); }
          to   { opacity: 1; transform: translateY(0)    scale(1);    }
        }
        @keyframes kt-zap {
          0%,100% { transform: scale(1)    rotate(0deg);   }
          30%     { transform: scale(1.25) rotate(-12deg); }
          60%     { transform: scale(1.1)  rotate(8deg);   }
        }
      `}</style>

      {/* Overlay */}
      <div
        ref={overlayRef}
        onClick={(e) => { if (e.target === overlayRef.current) onClose(); }}
        style={{
          position: 'fixed', inset: 0, zIndex: 200,
          background: 'rgba(5, 18, 12, 0.82)',
          backdropFilter: 'blur(6px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '16px',
          overflowY: 'auto',
        }}
      >
        {/* Card */}
        <div style={{
          background: '#fff',
          borderRadius: 22,
          width: '100%', maxWidth: 520,
          boxShadow: '0 32px 80px rgba(0,0,0,0.45), 0 0 0 1px rgba(255,255,255,0.08)',
          animation: 'kt-modal-in 0.28s cubic-bezier(0.22,1,0.36,1) both',
          overflow: 'hidden',
          position: 'relative',
        }}>

          {/* Close button */}
          <button
            onClick={onClose}
            style={{
              position: 'absolute', top: 14, right: 14, zIndex: 10,
              background: 'rgba(255,255,255,0.2)', border: 'none', cursor: 'pointer',
              width: 30, height: 30, borderRadius: '50%',
              display: 'grid', placeItems: 'center',
              color: '#fff', transition: 'background 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.35)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.2)'; }}
            title="Close"
          >
            <X size={15} />
          </button>

          {/* Header gradient */}
          <div style={{
            background: 'linear-gradient(135deg, #0d2218 0%, #1a5c3a 55%, #2d8a5e 100%)',
            padding: '28px 28px 24px',
          }}>
            {/* Logo row */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
              <img src={ktLogo} alt="kaTuro AI" style={{ width: 34, height: 34, borderRadius: 9, objectFit: 'cover' }} />
              <div>
                <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: '#fff', lineHeight: 1 }}>kaTuro AI</p>
                <p style={{ margin: 0, fontSize: 10, color: 'rgba(255,255,255,0.55)', marginTop: 2 }}>Teacher Co-pilot</p>
              </div>
              {/* Zero badge */}
              <div style={{
                marginLeft: 'auto',
                background: 'rgba(220,38,38,0.25)',
                border: '1px solid rgba(220,38,38,0.5)',
                borderRadius: 20, padding: '4px 12px',
                display: 'flex', alignItems: 'center', gap: 6,
              }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#f87171', animation: 'none' }} />
                <span style={{ fontSize: 11, fontWeight: 700, color: '#fca5a5' }}>0 tokens remaining</span>
              </div>
            </div>

            {/* CTA headline */}
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
              <Zap size={20} color="#e8a320" style={{ flexShrink: 0, marginTop: 2, animation: 'kt-zap 2.5s ease-in-out infinite' }} />
              <p style={{
                margin: 0, fontSize: 15, fontWeight: 700, color: '#fff', lineHeight: 1.45,
                fontFamily: '"Plus Jakarta Sans", sans-serif',
              }}>
                {cta}
              </p>
            </div>
          </div>

          {/* Bundle cards */}
          <div style={{ padding: '20px 20px 0', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {BUNDLES.map(b => (
              <div key={b.id} style={{
                borderRadius: 14,
                border: b.highlight
                  ? '2px solid #2d6a4f'
                  : b.valueBadge
                    ? '2px solid #e8a320'
                    : '1.5px solid rgba(45,106,79,0.15)',
                background: b.highlight ? '#f0faf5' : b.valueBadge ? '#fffbeb' : '#fafafa',
                padding: '14px 14px 12px',
                position: 'relative',
              }}>
                {/* Badge */}
                {b.badge && (
                  <span style={{
                    position: 'absolute', top: -10, left: '50%', transform: 'translateX(-50%)',
                    background: b.highlight ? '#2d6a4f' : '#e8a320',
                    color: '#fff', fontSize: 9, fontWeight: 700,
                    borderRadius: 20, padding: '3px 10px', whiteSpace: 'nowrap',
                    letterSpacing: '0.05em', textTransform: 'uppercase',
                  }}>
                    {b.highlight ? '⭐ ' : '💎 '}{b.badge}
                  </span>
                )}

                {/* Bundle name */}
                <p style={{
                  margin: b.badge ? '6px 0 2px' : '0 0 2px',
                  fontSize: 11, fontWeight: 700, color: '#4a6357',
                  textTransform: 'uppercase', letterSpacing: '0.07em',
                }}>{b.name}</p>

                {/* Price — larger than token count */}
                <p style={{
                  margin: '0 0 2px',
                  fontSize: 34, fontWeight: 900, lineHeight: 1,
                  color: b.highlight ? '#1a5c3a' : b.valueBadge ? '#92400e' : '#0d2218',
                  fontFamily: '"DM Mono", monospace',
                }}>
                  ₱{b.price}
                </p>

                {/* Token count */}
                <p style={{
                  margin: '0 0 4px',
                  fontSize: 14, fontWeight: 700, color: '#4a6357', lineHeight: 1,
                }}>
                  {b.tokens.toLocaleString()} tokens
                </p>

                {/* Per token */}
                <p style={{ margin: '0 0 8px', fontSize: 10, color: '#9bb8a5', fontWeight: 600 }}>
                  {b.perToken} per token
                </p>

                {/* Best for tag */}
                <span style={{
                  display: 'inline-block',
                  background: b.highlight ? '#d8f3dc' : b.valueBadge ? 'rgba(232,163,32,0.15)' : '#f0f0f0',
                  color: b.highlight ? '#1a5c3a' : b.valueBadge ? '#92400e' : '#4a6357',
                  fontSize: 10, fontWeight: 600, borderRadius: 20, padding: '3px 9px',
                }}>
                  {b.bestFor}
                </span>
              </div>
            ))}
          </div>

          {/* Divider */}
          <div style={{ margin: '20px 20px 0', borderTop: '1px solid rgba(45,106,79,0.1)' }} />

          {/* Facebook CTA */}
          <div style={{ padding: '18px 20px 22px', textAlign: 'center' }}>
            <p style={{ margin: '0 0 4px', fontSize: 14, fontWeight: 700, color: '#0d2218' }}>
              Ready to get your bundle?
            </p>
            <p style={{ margin: '0 0 14px', fontSize: 12, color: '#4a6357', lineHeight: 1.5 }}>
              Message us on Facebook — tokens sent within minutes after payment.
            </p>
            <a
              href={FB_URL}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 9,
                background: '#1877f2', color: '#fff',
                borderRadius: 12, padding: '13px 28px',
                fontSize: 14, fontWeight: 700, textDecoration: 'none',
                boxShadow: '0 4px 16px rgba(24,119,242,0.35)',
                transition: 'all 0.15s', width: '100%', boxSizing: 'border-box',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = '#1464d0'; e.currentTarget.style.boxShadow = '0 6px 20px rgba(24,119,242,0.45)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = '#1877f2'; e.currentTarget.style.boxShadow = '0 4px 16px rgba(24,119,242,0.35)'; }}
            >
              <FacebookIcon size={17} />
              Message Us on Facebook
            </a>
            <p style={{ margin: '10px 0 0', fontSize: 10, color: '#9bb8a5' }}>
              fb.com/Teachers2ls · kaTuro AI Official Page
            </p>
          </div>

        </div>
      </div>
    </>
  );
}
