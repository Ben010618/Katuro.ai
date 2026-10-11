import { useEffect, useMemo, useRef, useState } from 'react';
import qrcode from 'qrcode-generator';
import { ShieldCheck } from 'lucide-react';
import { useDeskStore } from '../../../store/deskStore';
import { absolutePath, flattenFileTree, revealInFolder } from '../../../services/localFileSystem';
import { PHOTOS_DIR, PHOTO_FILE } from '../../../services/desk/bubble/quiz';

const desk = () => (typeof window !== 'undefined' ? window.katuroDeskApi : undefined);

// The open session survives switching tabs (the phone keeps sending); it ends on Stop,
// when KaTuroDesk closes, or after 2 hours.
let live = null; // { folder, urls }

function QrImage({ text }) {
  const svg = useMemo(() => {
    const qr = qrcode(0, 'M');
    qr.addData(text);
    qr.make();
    return qr.createSvgTag({ cellSize: 5, margin: 3, scalable: true });
  }, [text]);
  // The SVG comes from our own QR generator (no outside text is inserted as markup).
  return <div className="h-48 w-48 rounded-lg border border-gray-200 bg-white p-1" aria-label="QR code for the phone" dangerouslySetInnerHTML={{ __html: svg }} />;
}

/** Step 2: the phone sends photos of the answered sheets into the quiz's Photos folder. */
export default function BubblePhotos({ quiz, folder, onNext }) {
  const { workspace, refreshFiles } = useDeskStore();
  const photosDir = `${folder}/${PHOTOS_DIR}`;
  const [session, setSession] = useState(() => (live?.folder === folder ? live : null));
  const [otherOpen, setOtherOpen] = useState(false);
  const [received, setReceived] = useState(0);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const refreshTimer = useRef(null);
  const api = desk();
  const supported = Boolean(api?.startPhoneCapture) && workspace?.handle?.kind === 'electron';

  const tree = workspace?.files;
  const photos = useMemo(
    () => flattenFileTree(tree || []).filter((f) => f.kind === 'file' && f.path.startsWith(`${photosDir}/`) && PHOTO_FILE.test(f.name)),
    [tree, photosDir],
  );

  useEffect(() => {
    if (!supported) return undefined;
    let alive = true;
    api.phoneCaptureStatus().then((st) => {
      if (!alive) return;
      if (!st.active) {
        live = null;
        setSession(null);
      } else if (live?.folder !== folder) {
        setOtherOpen(true);
      }
    }).catch(() => {});
    const offPhoto = api.onCapturePhoto((p) => {
      setReceived(p.count);
      clearTimeout(refreshTimer.current);
      refreshTimer.current = setTimeout(() => refreshFiles(), 1200);
    });
    const offEnd = api.onCaptureEnded(() => {
      live = null;
      setSession(null);
      setError('The phone session ended after 2 hours. Connect again to send more photos.');
    });
    return () => {
      alive = false;
      offPhoto();
      offEnd();
      clearTimeout(refreshTimer.current);
    };
  }, [api, supported, folder, refreshFiles]);

  const connect = async () => {
    setError('');
    setBusy(true);
    try {
      const res = await api.startPhoneCapture(absolutePath(workspace.handle, photosDir), quiz.title);
      if (!res.urls.length) {
        setError('This computer is not connected to any Wi-Fi or hotspot. Connect it to the same Wi-Fi as your phone, or to your phone\'s hotspot, then try again.');
        await api.stopPhoneCapture();
        return;
      }
      live = { folder, urls: res.urls };
      setSession(live);
      setOtherOpen(false);
      setReceived(0);
    } catch (err) {
      setError(err?.message || 'The phone connection could not be started.');
    } finally {
      setBusy(false);
    }
  };

  const stop = async () => {
    await api.stopPhoneCapture().catch(() => {});
    live = null;
    setSession(null);
    setOtherOpen(false);
    refreshFiles();
  };

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-gray-200 bg-white p-3">
        <div className="flex items-center gap-2">
          <p className="flex-1 text-[12px] text-gray-800"><span className="text-lg font-bold tabular-nums">{photos.length}</span> photo{photos.length === 1 ? '' : 's'} in the Photos folder <span className="text-gray-500">({quiz.learners.length} learners)</span></p>
          <button type="button" onClick={() => revealInFolder(workspace?.handle, photosDir).catch(() => {})} className="rounded-lg border border-gray-300 px-2.5 py-1 text-[11px] text-gray-700 hover:bg-gray-50">Show Photos folder</button>
        </div>
        <p className="mt-1 text-[11px] text-gray-600">You can also copy photos into this folder yourself (from a USB cable, Bluetooth or another app).</p>
      </div>

      {!supported ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-[11px] text-amber-900">Sending photos from your phone works in the KaTuroDesk app on your computer. You can still copy the photos into the Photos folder.</p>
      ) : session ? (
        <div className="space-y-2 rounded-lg border border-emerald-200 bg-white p-3">
          <div className="flex flex-wrap items-start gap-3">
            <QrImage text={session.urls[0].url} />
            <div className="min-w-0 flex-1 space-y-1.5 text-[11px] text-gray-700">
              <p className="text-[12px] font-semibold text-gray-900">Scan this with your phone's camera.</p>
              <p>A page opens on your phone. Tap <span className="font-semibold">Take a photo</span> for each sheet; each photo comes straight to this folder.</p>
              <p className="text-gray-500">Received in this session: <span className="font-semibold tabular-nums text-gray-800">{received}</span></p>
              <p className="break-all text-gray-500">Or type this on the phone: {session.urls[0].url}</p>
              {session.urls.length > 1 && (
                <p className="break-all text-gray-500">If that does not open, try: {session.urls.slice(1).map((u) => u.url).join('  or  ')}</p>
              )}
              <button type="button" onClick={stop} className="rounded-lg border border-gray-300 px-3 py-1 text-[11px] font-medium text-gray-700 hover:bg-gray-50">Stop</button>
            </div>
          </div>
          <details className="text-[11px] text-gray-600">
            <summary className="cursor-pointer font-medium text-gray-700">The phone cannot open the page?</summary>
            <ul className="mt-1 list-disc space-y-0.5 pl-5">
              <li>The phone and this computer must be on the same Wi-Fi, or connect this computer to the phone's hotspot. No internet is needed.</li>
              <li>If Windows asked whether to allow KaTuroDesk on networks, it must be allowed. Some school Wi-Fi keeps devices apart; use the phone's hotspot then.</li>
              <li>Only the first phone that opens the page can send photos. To use another phone, tap Stop, then connect again.</li>
            </ul>
          </details>
        </div>
      ) : (
        <div className="space-y-2 rounded-lg border border-gray-200 bg-white p-3">
          {otherOpen && <p className="text-[11px] text-amber-800">A phone is still connected for another quiz. Connecting here ends that one.</p>}
          <button type="button" onClick={connect} disabled={busy} className="rounded-lg bg-[#2d6a4f] px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-[#235841] disabled:opacity-40">{busy ? 'Starting…' : 'Connect my phone'}</button>
          <p className="text-[11px] text-gray-600">Your phone and this computer must be on the same Wi-Fi, or this computer connected to your phone's hotspot. No internet is needed. If Windows asks, allow KaTuroDesk on the network.</p>
        </div>
      )}
      {error && <p className="text-[11px] text-red-700" role="alert">{error}</p>}

      <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white p-3">
        <p className="flex flex-1 items-center gap-1 text-[10.5px] text-gray-500"><ShieldCheck size={11} /> Photos stay on this computer. Checking needs no internet.</p>
        <button type="button" onClick={onNext} disabled={!photos.length} className="rounded-lg border border-emerald-600 px-3 py-1.5 text-[11px] font-semibold text-emerald-800 hover:bg-emerald-50 disabled:opacity-40">Next: check the photos</button>
      </div>
    </div>
  );
}
