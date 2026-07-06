import { useState, useEffect } from 'react';
import { X, Clock, BookOpenText, Sparkles, CheckCircle2, MessageCircle, ShoppingCart } from 'lucide-react';

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

  // Icon + label per type — a small tinted icon chip, not a badge pill on a
  // tinted card. The card itself always stays neutral (var(--kt-card)).
  const meta =
    type === 1 ? { Icon: Clock,        label: 'Salita ng Karunungan', tint: 'var(--kt-warning-tint)', color: 'var(--kt-warning)' }
  : type === 2 ? { Icon: BookOpenText, label: 'Salita ng Diyos',      tint: '#ede9fe',                 color: '#7c3aed' }
               : { Icon: Sparkles,     label: 'Para sa mga Guro',     tint: 'var(--kt-success-tint)',  color: 'var(--kt-success)' };

  return (
    <>
      <style>{`
        @keyframes kt-fade-in {
          from { opacity: 0; transform: scale(0.96) translateY(6px); }
          to   { opacity: 1; transform: scale(1)    translateY(0);   }
        }
        .kt-popup-card { animation: kt-fade-in 0.22s var(--kt-ease, ease) forwards; }
      `}</style>

      {/* Backdrop */}
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
        {/* Card */}
        <div
          className="kt-popup-card"
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
          {/* Close button */}
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

          {/* Icon + label */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
            <div style={{
              width: 34, height: 34, borderRadius: 'var(--kt-radius-sm)', flexShrink: 0,
              display: 'grid', placeItems: 'center', background: meta.tint, color: meta.color,
            }}>
              <meta.Icon size={16} />
            </div>
            <span style={{
              fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
              color: 'var(--kt-text-secondary)',
            }}>
              {meta.label}
            </span>
          </div>

          {/* ── Type 1: Quote ──────────────────────────────────────── */}
          {type === 1 && (
            <>
              <p style={{
                margin: '0 0 12px',
                fontSize: 18, fontWeight: 700, color: 'var(--kt-text-primary)',
                lineHeight: 1.55, fontStyle: 'italic',
              }}>
                "{item.text}"
              </p>

              {item.by && (
                <p style={{ margin: '0 0 22px', fontSize: 13, color: 'var(--kt-text-secondary)', fontWeight: 600 }}>
                  {item.by}
                </p>
              )}

              <button
                onClick={() => window.open(FB_URL, '_blank', 'noopener')}
                style={{
                  width: '100%', padding: '12px 20px',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  background: 'var(--kt-green-primary)', color: '#fff',
                  border: 'none', borderRadius: 'var(--kt-radius-md)',
                  fontSize: 14, fontWeight: 700, cursor: 'pointer',
                  fontFamily: 'inherit', letterSpacing: '0.01em',
                  transition: 'background var(--kt-duration) var(--kt-ease), transform var(--kt-duration) var(--kt-ease)',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = 'var(--kt-green-dark)'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'var(--kt-green-primary)'; e.currentTarget.style.transform = 'none'; }}
              >
                <MessageCircle size={15} /> Wag mahihiyang Magtanong!
              </button>
            </>
          )}

          {/* ── Type 2: Bible Verse ────────────────────────────────── */}
          {type === 2 && (
            <>
              <p style={{
                margin: '0 0 14px',
                fontSize: 18, fontWeight: 700, color: 'var(--kt-text-primary)',
                lineHeight: 1.55, fontStyle: 'italic',
              }}>
                "{item.text}"
              </p>

              <p style={{
                margin: 0,
                fontSize: 13, fontWeight: 700, color: meta.color,
                letterSpacing: '0.02em',
              }}>
                — {item.ref}
              </p>
            </>
          )}

          {/* ── Type 3: Product Pitch ──────────────────────────────── */}
          {type === 3 && (
            <>
              <p style={{
                margin: '0 0 6px',
                fontSize: 21, fontWeight: 800, color: 'var(--kt-text-primary)', lineHeight: 1.2,
              }}>
                Anong magagawa ng{' '}
                <span style={{
                  background: 'linear-gradient(135deg, var(--kt-green-primary), var(--kt-green-mid))',
                  WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                }}>
                  ₱3
                </span>{' '}
                mo?
              </p>

              <p style={{ margin: '0 0 14px', fontSize: 13, color: 'var(--kt-text-secondary)', lineHeight: 1.65 }}>
                Isang kumpletong <strong>ILAW Lesson Plan at DLL</strong> — handa na, propesyonal, at nakatipid ka pa ng maraming oras para sa iyong pamilya.
              </p>

              <p style={{ margin: '0 0 4px', fontSize: 12, color: 'var(--kt-text-secondary)', fontWeight: 600 }}>
                Huwag hayaang magnakaw ng oras ang pagpaplano. Sa ₱3 lang:
              </p>
              <div style={{ marginBottom: 18, display: 'flex', flexDirection: 'column', gap: 6 }}>
                {[
                  'Kumpleto at aligned na Lesson Plan',
                  'Daily Lesson Log (DLL)',
                  'Mas maraming quality time kasama ang pamilya',
                ].map(line => (
                  <div key={line} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13, color: 'var(--kt-text-primary)' }}>
                    <CheckCircle2 size={15} color="var(--kt-success)" style={{ flexShrink: 0, marginTop: 1 }} />
                    {line}
                  </div>
                ))}
              </div>

              <p style={{
                margin: '0 0 18px',
                fontSize: 13, fontStyle: 'italic', color: 'var(--kt-text-secondary)', lineHeight: 1.5,
                borderLeft: `2px solid var(--kt-success-tint)`, paddingLeft: 12,
              }}>
                "Ang oras mo ay mas mahalaga kaysa sa iyong inaakala."
              </p>

              <button
                onClick={() => window.open(FB_URL, '_blank', 'noopener')}
                style={{
                  width: '100%', padding: '12px 20px',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  background: 'linear-gradient(135deg, var(--kt-green-primary), var(--kt-green-mid))',
                  color: '#fff', border: 'none', borderRadius: 'var(--kt-radius-md)',
                  fontSize: 14, fontWeight: 700, cursor: 'pointer',
                  fontFamily: 'inherit', letterSpacing: '0.01em',
                  transition: 'opacity var(--kt-duration) var(--kt-ease), transform var(--kt-duration) var(--kt-ease)',
                  boxShadow: 'var(--kt-shadow-sm)',
                }}
                onMouseEnter={e => { e.currentTarget.style.opacity = '0.92'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
                onMouseLeave={e => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.transform = 'none'; }}
              >
                <ShoppingCart size={15} /> Kumuha Na — ₱3 Lang!
              </button>
            </>
          )}
        </div>
      </div>
    </>
  );
}
