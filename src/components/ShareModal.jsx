import { useState } from 'react';
import { X, Copy, CheckCircle2 } from 'lucide-react';

const PLATFORMS = [
  {
    id: 'whatsapp',
    label: 'WhatsApp',
    bg: '#dcfce7', color: '#15803d', border: 'rgba(21,128,61,0.25)',
    href: (url, text) => `https://wa.me/?text=${encodeURIComponent(text + '\n' + url)}`,
    target: '_blank',
  },
  {
    id: 'facebook',
    label: 'Facebook',
    bg: '#dbeafe', color: '#1d4ed8', border: 'rgba(29,78,216,0.2)',
    href: (url) => `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`,
    target: '_blank',
    popup: true,
  },
  {
    id: 'messenger',
    label: 'Messenger',
    bg: '#ede9fe', color: '#6d28d9', border: 'rgba(109,40,217,0.2)',
    href: (url) => `fb-messenger://share/?link=${encodeURIComponent(url)}`,
    target: '_self',
    mobileNote: true,
  },
  {
    id: 'viber',
    label: 'Viber',
    bg: '#f5f3ff', color: '#7c3aed', border: 'rgba(124,58,237,0.2)',
    href: (url, text) => `viber://forward?text=${encodeURIComponent(text + ' ' + url)}`,
    target: '_self',
    mobileNote: true,
  },
  {
    id: 'telegram',
    label: 'Telegram',
    bg: '#e0f2fe', color: '#0284c7', border: 'rgba(2,132,199,0.2)',
    href: (url, text) => `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`,
    target: '_blank',
  },
  {
    id: 'twitter',
    label: 'X / Twitter',
    bg: '#f1f5f9', color: '#0f172a', border: 'rgba(15,23,42,0.2)',
    href: (url, text) => `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`,
    target: '_blank',
  },
  {
    id: 'email',
    label: 'Email',
    bg: '#fef2f2', color: '#b91c1c', border: 'rgba(185,28,28,0.2)',
    href: (url, text, subject) => `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text + '\n\n' + url)}`,
    target: '_self',
  },
];

// Minimal inline SVG logos for each platform
const Icons = {
  whatsapp: (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
    </svg>
  ),
  facebook: (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
    </svg>
  ),
  messenger: (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
      <path d="M12 0C5.373 0 0 4.974 0 11.111c0 3.498 1.744 6.614 4.469 8.652V24l4.088-2.242c1.092.3 2.246.464 3.443.464 6.627 0 12-4.975 12-11.111S18.627 0 12 0zm1.191 14.963l-3.055-3.26-5.963 3.26L10.732 8l3.131 3.26L19.752 8l-6.561 6.963z"/>
    </svg>
  ),
  viber: (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
      <path d="M11.4 0C6.392.032 1.9 3.64.468 8.748c-.593 2.172-.559 4.493.086 6.656.697 2.326 2.088 4.36 3.97 5.894l.028 2.7s-.017.43.266.517c.347.107.55-.222.55-.222l2.745-3.857c.978.232 1.984.343 2.99.331 5.52.001 10.3-4 11.237-9.44C23.432 5.086 18.93-.04 11.4 0zm5.484 15.8s-.287.36-.89.397c-.512.03-.82-.232-.82-.232-1.137-.961-2.2-1.997-3.167-3.115l-.017-.019c-.29-.346-.58-.698-.856-1.058l-.007-.009c-.303-.396-.6-.795-.893-1.201l-.008-.011c-.29-.404-.566-.818-.834-1.238l-.013-.021c-.177-.291-.5-.84-.64-1.18-.327-.805.35-1.426.35-1.426s.374-.406.638-.531c.25-.12.528-.099.7.13.172.229.88 1.164.88 1.164s.2.287.316.454c.103.145.22.312.22.312s.22.338-.024.62c-.238.278-.465.497-.465.497s-.232.211-.182.503c.048.292.895 1.576 1.88 2.35.987.773 2.192 1.302 2.192 1.302s.274.113.513-.133c.239-.246.403-.447.403-.447s.265-.31.602-.175c.337.135 2.026 1.02 2.026 1.02s.261.119.302.316c.04.196-.083.583-.083.583zm-1.655-5.67c-.162 0-.162-.248 0-.248.667-.003 1.225-.556 1.231-1.233 0-.162.249-.162.249 0-.007.818-.675 1.478-1.48 1.481zm.67-.674c-.159 0-.16-.244 0-.244.272-.003.496-.23.498-.506 0-.16.247-.16.247 0-.003.413-.337.745-.745.75zm-1.353.013c-.162 0-.162-.249 0-.249 1.114-.003 2.044-.93 2.05-2.06 0-.162.248-.162.248 0-.007 1.27-1.039 2.306-2.298 2.309z"/>
    </svg>
  ),
  telegram: (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
      <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
    </svg>
  ),
  twitter: (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
    </svg>
  ),
  email: (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
      <path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z"/>
    </svg>
  ),
};

export default function ShareModal({ url, title, subject, onClose }) {
  const [copied, setCopied] = useState(false);

  const shareText = `Check out this lesson plan: ${title}`;

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch (_) {}
  }

  function handlePlatform(p) {
    const href = p.href(url, shareText, subject || title);
    if (p.popup) {
      window.open(href, '_blank', 'width=600,height=500,noopener');
    } else {
      window.open(href, p.target);
    }
  }

  async function handleNativeShare() {
    try {
      await navigator.share({ title: subject || title, text: shareText, url });
    } catch (_) {}
  }

  const canNativeShare = typeof navigator.share === 'function';

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
        background: 'rgba(13,34,24,0.6)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 20,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'var(--kt-card)', borderRadius: 18, width: '100%', maxWidth: 440,
          boxShadow: '0 24px 64px rgba(13,34,24,0.22)', overflow: 'hidden',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{
          background: 'linear-gradient(135deg, #0d2218 0%, #1a3d2b 50%, #2d6a4f 100%)',
          padding: '18px 22px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div>
            <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#fff' }}>Share Lesson Plan</p>
            {title && <p style={{ margin: '2px 0 0', fontSize: 11, color: 'rgba(255,255,255,0.65)' }}>{title}</p>}
          </div>
          <button
            onClick={onClose}
            style={{ background: 'rgba(255,255,255,0.15)', border: 'none', cursor: 'pointer', color: '#fff', borderRadius: 8, padding: 6 }}
          >
            <X size={16} />
          </button>
        </div>

        <div style={{ padding: '20px 22px 24px' }}>
          {/* URL copy bar */}
          <div style={{
            display: 'flex', gap: 8, alignItems: 'center',
            background: 'var(--kt-surface)', border: '1.5px solid var(--kt-border)',
            borderRadius: 10, padding: '8px 10px 8px 14px', marginBottom: 20,
          }}>
            <span style={{
              flex: 1, fontSize: 12, color: 'var(--kt-text-secondary)',
              fontFamily: '"DM Mono", monospace',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {url}
            </span>
            <button
              onClick={handleCopy}
              style={{
                flexShrink: 0,
                background: copied ? '#d8f3dc' : '#2d6a4f',
                color: copied ? '#1a3d2b' : '#fff',
                border: 'none', borderRadius: 7, padding: '6px 12px',
                fontSize: 12, fontWeight: 600, cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 5, fontFamily: 'inherit',
                transition: 'background 0.2s, color 0.2s',
              }}
            >
              {copied ? <CheckCircle2 size={13} /> : <Copy size={13} />}
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>

          {/* Native share — shown on mobile/supported browsers */}
          {canNativeShare && (
            <button
              onClick={handleNativeShare}
              style={{
                width: '100%', marginBottom: 16,
                background: 'linear-gradient(135deg, #2d6a4f, #40916c)',
                color: '#fff', border: 'none', borderRadius: 10,
                padding: '11px 16px', fontSize: 13, fontWeight: 700,
                cursor: 'pointer', fontFamily: 'inherit',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
              }}
            >
              <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                <path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92s2.92-1.31 2.92-2.92-1.31-2.92-2.92-2.92z"/>
              </svg>
              Share via…
            </button>
          )}

          {/* Platform grid */}
          <p style={{ margin: '0 0 12px', fontSize: 11, fontWeight: 700, color: 'var(--kt-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            Share to platform
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
            {PLATFORMS.map(p => (
              <button
                key={p.id}
                onClick={() => handlePlatform(p)}
                style={{
                  background: p.bg, color: p.color,
                  border: `1.5px solid ${p.border}`,
                  borderRadius: 10, padding: '10px 4px 8px',
                  cursor: 'pointer', fontFamily: 'inherit',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5,
                  transition: 'opacity 0.15s',
                }}
                onMouseEnter={e => e.currentTarget.style.opacity = '0.8'}
                onMouseLeave={e => e.currentTarget.style.opacity = '1'}
                title={p.mobileNote ? `${p.label} — opens app on mobile` : p.label}
              >
                {Icons[p.id]}
                <span style={{ fontSize: 10, fontWeight: 700, lineHeight: 1.2, textAlign: 'center' }}>
                  {p.label}
                </span>
              </button>
            ))}
          </div>

          <p style={{ margin: '14px 0 0', fontSize: 11, color: 'var(--kt-text-secondary)', textAlign: 'center', lineHeight: 1.5 }}>
            Messenger &amp; Viber open on mobile devices with the app installed.
          </p>
        </div>
      </div>
    </div>
  );
}
