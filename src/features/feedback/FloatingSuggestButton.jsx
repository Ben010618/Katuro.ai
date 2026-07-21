import { useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import suggestIcon from '../../assets/suggest.png';
import SuggestionModal from './SuggestionModal';

export default function FloatingSuggestButton() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);

  if (!user) return null;

  return (
    <>
      <style>{`
        @keyframes kt-suggest-float {
          0%, 100% { transform: translateY(0); }
          50%      { transform: translateY(-6px); }
        }
        .kt-suggest-btn {
          animation: kt-suggest-float 3s ease-in-out infinite;
          transition: transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
        }
        .kt-suggest-btn:hover {
          transform: scale(1.1);
          animation-play-state: paused;
        }
        @media (prefers-reduced-motion: reduce) {
          .kt-suggest-btn { animation: none; }
          .kt-suggest-btn:hover { transform: none; }
        }
      `}</style>

      <button
        className="kt-suggest-btn"
        onClick={() => setOpen(true)}
        aria-label="Send a suggestion"
        title="Send a suggestion"
        style={{
          position: 'fixed', bottom: 20, right: 20, zIndex: 500,
          width: 84, height: 84, borderRadius: '50%',
          border: 'none', cursor: 'pointer', padding: 0,
          background: 'var(--kt-card)',
          boxShadow: '0 8px 24px rgba(13,34,24,0.28)',
          display: 'grid', placeItems: 'center',
          overflow: 'hidden',
        }}
      >
        <img src={suggestIcon} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      </button>

      {open && <SuggestionModal onClose={() => setOpen(false)} />}
    </>
  );
}
