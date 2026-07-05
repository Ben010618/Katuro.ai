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
          from { opacity: 0; transform: scale(0.94) translateY(8px); }
          to   { opacity: 1; transform: scale(1)    translateY(0);   }
        }
        .kt-shares-popup-card { animation: kt-shares-fade-in 0.28s cubic-bezier(0.34,1.3,0.64,1) forwards; }
      `}</style>

      <div
        onClick={close}
        style={{
          position: 'fixed', inset: 0, zIndex: 9000,
          background: 'rgba(13,34,24,0.55)',
          backdropFilter: 'blur(3px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '20px',
        }}
      >
        <div
          className="kt-shares-popup-card"
          onClick={e => e.stopPropagation()}
          style={{
            background: '#f0fdf4',
            border: '1.5px solid #bbf7d0',
            borderRadius: 22,
            padding: '32px 30px 28px',
            width: '100%', maxWidth: 420,
            boxShadow: '0 24px 80px rgba(0,0,0,0.22)',
            position: 'relative',
          }}
        >
          <button
            onClick={close}
            style={{
              position: 'absolute', top: 14, right: 14,
              background: 'rgba(0,0,0,0.07)', border: 'none',
              borderRadius: 8, padding: 6, cursor: 'pointer',
              display: 'flex', alignItems: 'center',
              color: '#6b7280', lineHeight: 0,
            }}
          >
            <X size={16} />
          </button>

          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            background: '#d8f3dc', color: '#1a3d2b',
            borderRadius: 20, padding: '4px 12px',
            fontSize: 11, fontWeight: 800, letterSpacing: '0.06em',
            textTransform: 'uppercase', marginBottom: 18,
          }}>
            <PenLine size={12} /> kaTuro Shares · Teacher Community
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
            color: '#2d6a4f', lineHeight: 1.5,
          }}>
            {prompt}
          </p>

          <p style={{ margin: '0 0 22px', fontSize: 13, color: '#374151', lineHeight: 1.65 }}>
            Isang tagumpay, isang aral, o simpleng kwento mula sa iyong klase — makakaabot ito sa kapwa mo guro sa kaTuro Shares.
          </p>

          <button
            onClick={writeNow}
            style={{
              width: '100%', padding: '13px 20px',
              background: 'linear-gradient(135deg, #2d6a4f, #52b788)',
              color: '#fff', border: 'none', borderRadius: 12,
              fontSize: 14, fontWeight: 800, cursor: 'pointer',
              fontFamily: 'inherit', letterSpacing: '0.02em',
              transition: 'opacity 0.15s, transform 0.1s',
              boxShadow: '0 4px 14px rgba(45,106,79,0.35)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
            }}
            onMouseEnter={e => { e.currentTarget.style.opacity = '0.9'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
            onMouseLeave={e => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.transform = 'none'; }}
          >
            <PenLine size={15} /> Isulat Ngayon →
          </button>
        </div>
      </div>
    </>
  );
}
