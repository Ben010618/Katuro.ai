import { useState, useEffect } from 'react';
import { X } from 'lucide-react';

const FB_URL = 'https://www.facebook.com/Teachers2ls';

const QUOTES = [
  { text: 'Ang panahon ay ginto. Huwag itong sayangin.', by: '— Filipino Proverb' },
  { text: 'Time is gold. Invest it wisely.', by: null },
  { text: 'Ang hindi marunong magpahalaga sa oras ay hindi marunong mamuhay nang maayos.', by: null },
  { text: 'Lost time is never found again.', by: '— Benjamin Franklin' },
  { text: 'Ang oras na lumipas ay hindi na maaaring ibalik.', by: null },
  { text: 'Time is what we want most, but what we use worst.', by: '— William Penn' },
  { text: 'Gamitin ang bawat minuto nang may layunin.', by: null },
  { text: 'Either you run the day, or the day runs you.', by: '— Jim Rohn' },
  { text: 'Ang bawat segundo ay pagkakataon na hindi na mauulit.', by: null },
  { text: "Don't watch the clock; do what it does. Keep going.", by: '— Sam Levenson' },
];

const VERSES = [
  { text: 'Redeeming the time, because the days are evil.', ref: 'Ephesians 5:16' },
  { text: 'Itayo ang inyong sarili sa pinakabanal na pananampalataya.', ref: 'Judas 1:20' },
  { text: 'Teach us to number our days, that we may gain a heart of wisdom.', ref: 'Psalm 90:12' },
  { text: 'Ang bawat bagay ay may takdang panahon.', ref: 'Eclesiastes 3:1' },
  { text: 'Make the most of every opportunity.', ref: 'Colossians 4:5' },
  { text: 'Huwag nating antalahin ang paggawa ng kabutihan.', ref: 'Galatians 6:9' },
  { text: 'This is the day the Lord has made; let us rejoice and be glad in it.', ref: 'Psalm 118:24' },
  { text: "So be careful how you live. Don't live like fools, but like those who are wise.", ref: 'Ephesians 5:15' },
  { text: 'Mag-ingat kayo kung paano kayo namumuhay.', ref: 'Efeso 5:15' },
  { text: 'Now is the acceptable time; now is the day of salvation.', ref: '2 Corinthians 6:2' },
];

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

export default function DailyMotivationalPopup() {
  const [popup, setPopup] = useState(null); // null = hidden

  useEffect(() => {
    const today = todayStr();
    if (localStorage.getItem('lastPopupDate') === today) return;

    const type = Math.floor(Math.random() * 3) + 1;
    if (type === 1)      setPopup({ type: 1, item: pick(QUOTES) });
    else if (type === 2) setPopup({ type: 2, item: pick(VERSES) });
    else                 setPopup({ type: 3 });

    localStorage.setItem('lastPopupDate', today);
  }, []);

  if (!popup) return null;

  function close() { setPopup(null); }

  const { type, item } = popup;

  // ── accent colours per type ──────────────────────────────────────────────
  const accent =
    type === 1 ? { bg: '#fffbeb', border: '#fde68a', icon: '#d97706', badge: '#fef3c7', badgeText: '#92400e', btn: '#f59e0b', btnHover: '#d97706' }
  : type === 2 ? { bg: '#f5f3ff', border: '#ddd6fe', icon: '#7c3aed', badge: '#ede9fe', badgeText: '#5b21b6', btn: null, btnHover: null }
               : { bg: '#f0fdf4', border: '#bbf7d0', icon: '#16a34a', badge: '#dcfce7', badgeText: '#15803d', btn: '#16a34a', btnHover: '#15803d' };

  return (
    <>
      <style>{`
        @keyframes kt-fade-in {
          from { opacity: 0; transform: scale(0.94) translateY(8px); }
          to   { opacity: 1; transform: scale(1)    translateY(0);   }
        }
        .kt-popup-card { animation: kt-fade-in 0.28s cubic-bezier(0.34,1.3,0.64,1) forwards; }
      `}</style>

      {/* Backdrop */}
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
        {/* Card */}
        <div
          className="kt-popup-card"
          onClick={e => e.stopPropagation()}
          style={{
            background: accent.bg,
            border: `1.5px solid ${accent.border}`,
            borderRadius: 22,
            padding: '32px 30px 28px',
            width: '100%', maxWidth: 420,
            boxShadow: '0 24px 80px rgba(0,0,0,0.22)',
            position: 'relative',
          }}
        >
          {/* Close button */}
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

          {/* ── Type 1: Quote ──────────────────────────────────────── */}
          {type === 1 && (
            <>
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                background: accent.badge, color: accent.badgeText,
                borderRadius: 20, padding: '4px 12px',
                fontSize: 11, fontWeight: 800, letterSpacing: '0.06em',
                textTransform: 'uppercase', marginBottom: 18,
              }}>
                ⏰ Salita ng Karunungan
              </div>

              <p style={{
                margin: '0 0 12px',
                fontSize: 18, fontWeight: 700, color: 'var(--kt-text-primary)',
                lineHeight: 1.55, fontStyle: 'italic',
              }}>
                "{item.text}"
              </p>

              {item.by && (
                <p style={{ margin: '0 0 24px', fontSize: 13, color: '#6b7280', fontWeight: 600 }}>
                  {item.by}
                </p>
              )}

              <button
                onClick={() => window.open(FB_URL, '_blank', 'noopener')}
                style={{
                  width: '100%', padding: '13px 20px',
                  background: accent.btn, color: '#fff',
                  border: 'none', borderRadius: 12,
                  fontSize: 14, fontWeight: 800, cursor: 'pointer',
                  fontFamily: 'inherit', letterSpacing: '0.02em',
                  transition: 'background 0.15s, transform 0.1s',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = accent.btnHover; e.currentTarget.style.transform = 'translateY(-1px)'; }}
                onMouseLeave={e => { e.currentTarget.style.background = accent.btn; e.currentTarget.style.transform = 'none'; }}
              >
                💬 Wag mahihiyang Magtanong!
              </button>
            </>
          )}

          {/* ── Type 2: Bible Verse ────────────────────────────────── */}
          {type === 2 && (
            <>
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                background: accent.badge, color: accent.badgeText,
                borderRadius: 20, padding: '4px 12px',
                fontSize: 11, fontWeight: 800, letterSpacing: '0.06em',
                textTransform: 'uppercase', marginBottom: 18,
              }}>
                ✝️ Salita ng Diyos
              </div>

              <p style={{
                margin: '0 0 14px',
                fontSize: 18, fontWeight: 700, color: 'var(--kt-text-primary)',
                lineHeight: 1.55, fontStyle: 'italic',
              }}>
                "{item.text}"
              </p>

              <p style={{
                margin: 0,
                fontSize: 13, fontWeight: 700, color: accent.icon,
                letterSpacing: '0.04em',
              }}>
                — {item.ref}
              </p>
            </>
          )}

          {/* ── Type 3: Product Pitch ──────────────────────────────── */}
          {type === 3 && (
            <>
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                background: accent.badge, color: accent.badgeText,
                borderRadius: 20, padding: '4px 12px',
                fontSize: 11, fontWeight: 800, letterSpacing: '0.06em',
                textTransform: 'uppercase', marginBottom: 18,
              }}>
                🌟 Para sa mga Guro
              </div>

              <p style={{
                margin: '0 0 6px',
                fontSize: 21, fontWeight: 800, color: 'var(--kt-text-primary)', lineHeight: 1.2,
              }}>
                Anong magagawa ng{' '}
                <span style={{
                  background: 'linear-gradient(135deg, #16a34a, #059669)',
                  WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                }}>
                  ₱3
                </span>{' '}
                mo?
              </p>

              <p style={{ margin: '0 0 14px', fontSize: 13, color: '#374151', lineHeight: 1.65 }}>
                Isang kumpletong <strong>ILAW Lesson Plan at DLL</strong> — handa na, propesyonal, at nakatipid ka pa ng maraming oras para sa iyong pamilya! 💛
              </p>

              <p style={{ margin: '0 0 4px', fontSize: 12, color: '#374151', fontWeight: 600 }}>
                Huwag hayaang magnakaw ng oras ang pagpaplano. Sa ₱3 lang:
              </p>
              <div style={{ marginBottom: 18, display: 'flex', flexDirection: 'column', gap: 5 }}>
                {[
                  'Kumpleto at aligned na Lesson Plan',
                  'Daily Lesson Log (DLL)',
                  'Mas maraming quality time kasama ang pamilya',
                ].map(line => (
                  <div key={line} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13, color: 'var(--kt-text-primary)' }}>
                    <span style={{ color: '#16a34a', fontWeight: 800, flexShrink: 0 }}>✅</span>
                    {line}
                  </div>
                ))}
              </div>

              <p style={{
                margin: '0 0 18px',
                fontSize: 13, fontStyle: 'italic', color: '#4b5563', lineHeight: 1.5,
                borderLeft: '3px solid #86efac', paddingLeft: 12,
              }}>
                "Ang oras mo ay mas mahalaga kaysa sa iyong inaakala."
              </p>

              <button
                onClick={() => window.open(FB_URL, '_blank', 'noopener')}
                style={{
                  width: '100%', padding: '13px 20px',
                  background: 'linear-gradient(135deg, #16a34a, #059669)',
                  color: '#fff', border: 'none', borderRadius: 12,
                  fontSize: 14, fontWeight: 800, cursor: 'pointer',
                  fontFamily: 'inherit', letterSpacing: '0.02em',
                  transition: 'opacity 0.15s, transform 0.1s',
                  boxShadow: '0 4px 14px rgba(22,163,74,0.35)',
                }}
                onMouseEnter={e => { e.currentTarget.style.opacity = '0.9'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
                onMouseLeave={e => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.transform = 'none'; }}
              >
                🛒 Kumuha Na — ₱3 Lang!
              </button>
            </>
          )}
        </div>
      </div>
    </>
  );
}
