import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, PenLine } from 'lucide-react';

const STORAGE_KEY = 'lastSharesPopupDate';
const SHOW_DELAY_MS = 3500; // let DailyMotivationalPopup (shows instantly) be seen/dismissed first

const PROMPTS = [
  '"I teach because...?"',
  '"Ang isang tagumpay ko sa klase this week ay..."',
  '"Ang paborito kong MELC o topic na ituro ay..."',
  '"Isang bagay na natutunan ko mula sa aking mga estudyante..."',
];

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

export default function SharesReminderPopup() {
  const [visible, setVisible] = useState(false);
  const [prompt]  = useState(() => pick(PROMPTS));
  const navigate  = useNavigate();

  useEffect(() => {
    const today = todayStr();
    if (localStorage.getItem(STORAGE_KEY) === today) return;
    localStorage.setItem(STORAGE_KEY, today);
    const timer = setTimeout(() => setVisible(true), SHOW_DELAY_MS);
    return () => clearTimeout(timer);
  }, []);

  if (!visible) return null;

  function close() { setVisible(false); }

  function writeNow() {
    setVisible(false);
    navigate('/shares?compose=1');
  }

  return (
    <>
      <style>{`
        @keyframes kt-shares-fade-in {
          from { opacity: 0; transform: scale(0.96) translateY(6px); }
          to   { opacity: 1; transform: scale(1)    translateY(0);   }
        }
        .kt-shares-popup-card { animation: kt-shares-fade-in 0.22s var(--kt-ease, ease) forwards; }
      `}</style>

      <div
        onClick={close}
        style={{
          position: 'fixed', inset: 0, zIndex: 9000,
          background: 'rgba(13,34,24,0.5)',
          backdropFilter: 'blur(3px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '20px',
        }}
      >
        <div
          className="kt-shares-popup-card"
          onClick={e => e.stopPropagation()}
          style={{
            background: 'var(--kt-card)',
            border: '1px solid var(--kt-border)',
            borderRadius: 'var(--kt-radius-lg)',
            padding: '28px',
            width: '100%', maxWidth: 400,
            boxShadow: 'var(--kt-shadow-lg)',
            position: 'relative',
          }}
        >
          <button
            onClick={close}
            aria-label="Close"
            style={{
              position: 'absolute', top: 14, right: 14,
              background: 'var(--kt-surface)', border: 'none',
              borderRadius: 'var(--kt-radius-sm)', padding: 6, cursor: 'pointer',
              display: 'flex', alignItems: 'center',
              color: 'var(--kt-text-secondary)', lineHeight: 0,
            }}
          >
            <X size={16} />
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
            <div style={{
              width: 34, height: 34, borderRadius: 'var(--kt-radius-sm)', flexShrink: 0,
              display: 'grid', placeItems: 'center', background: 'var(--kt-success-tint)', color: 'var(--kt-success)',
            }}>
              <PenLine size={16} />
            </div>
            <span style={{
              fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
              color: 'var(--kt-text-secondary)',
            }}>
              kaTuro Shares · Teacher Community
            </span>
          </div>

          <p style={{
            margin: '0 0 8px',
            fontSize: 21, fontWeight: 800, color: 'var(--kt-text-primary)', lineHeight: 1.25,
          }}>
            May gusto ka bang ibahagi ngayon?
          </p>

          <p style={{
            margin: '0 0 20px',
            fontSize: 15, fontWeight: 700, fontStyle: 'italic',
            color: 'var(--kt-green-primary)', lineHeight: 1.5,
          }}>
            {prompt}
          </p>

          <p style={{ margin: '0 0 22px', fontSize: 13, color: 'var(--kt-text-secondary)', lineHeight: 1.65 }}>
            Isang tagumpay, isang aral, o simpleng kwento mula sa iyong klase — makakaabot ito sa kapwa mo guro sa kaTuro Shares.
          </p>

          <button
            onClick={writeNow}
            style={{
              width: '100%', padding: '12px 20px',
              background: 'linear-gradient(135deg, var(--kt-green-primary), var(--kt-green-bright))',
              color: '#fff', border: 'none', borderRadius: 'var(--kt-radius-md)',
              fontSize: 14, fontWeight: 700, cursor: 'pointer',
              fontFamily: 'inherit', letterSpacing: '0.01em',
              transition: 'opacity var(--kt-duration) var(--kt-ease), transform var(--kt-duration) var(--kt-ease)',
              boxShadow: 'var(--kt-shadow-sm)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
            }}
            onMouseEnter={e => { e.currentTarget.style.opacity = '0.92'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
            onMouseLeave={e => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.transform = 'none'; }}
          >
            <PenLine size={15} /> Isulat Ngayon →
          </button>
        </div>
      </div>
    </>
  );
}
