import { useEffect, useState } from 'react';
import { Download } from 'lucide-react';
import { getLatestDeskRelease, DESK_RELEASES_URL } from '../services/deskRelease';

// KaTuroDesk is a Windows app: no button on phones/tablets or inside KaTuroDesk itself.
const hidden = typeof window !== 'undefined' && (
  Boolean(window.katuroDeskApi) || /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || '')
);

/** Top-bar link to the newest KaTuroDesk installer ("Download KaTuroDesk 1.8.2"). */
export default function DeskDownloadButton() {
  const [release, setRelease] = useState(null);

  useEffect(() => {
    if (hidden) return undefined;
    let alive = true;
    getLatestDeskRelease().then((r) => { if (alive) setRelease(r); });
    return () => { alive = false; };
  }, []);

  if (hidden) return null;
  const label = release ? `Download KaTuroDesk ${release.version}` : 'Download KaTuroDesk';
  return (
    <a
      className="shell-desk-dl"
      href={release?.url || DESK_RELEASES_URL}
      target={release ? undefined : '_blank'}
      rel="noreferrer"
      title="KaTuroDesk for Windows: your Co-Teacher working directly with the files on your computer. Installed apps update by themselves."
      style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'transparent', color: '#2d6a4f', border: '1px solid #2d6a4f', borderRadius: 'var(--kt-radius-md)', padding: '5px 10px', fontSize: 11.5, fontWeight: 700, textDecoration: 'none', fontFamily: 'inherit', flexShrink: 0, whiteSpace: 'nowrap', transition: 'background 0.15s, color 0.15s' }}
      onMouseEnter={(e) => { e.currentTarget.style.background = '#2d6a4f'; e.currentTarget.style.color = '#ffffff'; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#2d6a4f'; }}
    >
      <Download size={13} /> <span>{label}</span>
    </a>
  );
}
