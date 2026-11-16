import { useCallback, useEffect, useMemo, useState } from 'react';
import { signOut } from 'firebase/auth';
import { ChevronRight, ClipboardList, FileText, Folder, FolderOpen, Laptop, Loader2, LogOut, RefreshCw, ShieldCheck, Unlink } from 'lucide-react';
import { auth } from '../../firebase';
import { useAuth } from '../../hooks/useAuth';
import { teacherInfo } from '../../services/teacherInfo';
import { parseLinkQr, pairWithDesk, createLinkClient } from '../../services/link/linkClient';
import { loadLink, saveLink, forgetLink } from '../../services/link/linkStore';
import QrScanner from './QrScanner';
import PhoneFileView from './PhoneFileView';
import ScoresFlow from './ScoresFlow';
import { KeptList, OutboxBanner, AddToFolder, SharedFilesSheet } from './PhoneLessons';
import { takeSharedFiles, onFilesShared } from '../../services/link/shareTarget';
import { forgetCachedClasses } from '../../services/link/scoreEntry';

const MAIN = ['Records', 'Lessons'];
const HINT = { Records: 'Class records', Lessons: 'Learning materials' };

const size = (n) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round((n || 0) / 1024))} KB`);
const day = (ms) => (ms ? new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '');

function LinkScreen({ teacherName, onLinked }) {
  const [scanning, setScanning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const onCode = useCallback(async (text) => {
    setScanning(false);
    const qr = parseLinkQr(text);
    if (!qr) {
      setError('That is not a KaTuroDesk code. On your computer, open KaTuroDesk → Settings → Phones → Link a phone.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const link = await pairWithDesk(qr, { deviceName: teacherName ? `${teacherName}'s phone` : 'My phone' });
      saveLink(link);
      onLinked(link);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }, [teacherName, onLinked]);

  return (
    <div className="p-5 space-y-5">
      <div className="rounded-2xl bg-white p-5 shadow-sm space-y-3">
        <Laptop size={32} className="text-emerald-700" />
        <h2 className="text-lg font-bold text-gray-900">Link to your KaTuroDesk</h2>
        <p className="text-sm text-gray-600">See your Records and Lessons from your computer on this phone.</p>
        <ol className="list-decimal pl-5 text-sm text-gray-700 space-y-1">
          <li>On your computer, open <b>KaTuroDesk → Settings → Phones</b> and click <b>Link a phone</b>.</li>
          <li>Keep this phone on the same Wi-Fi as the computer, or turn on this phone&apos;s hotspot and connect the computer to it.</li>
          <li>Tap the button below and point the camera at the code.</li>
        </ol>
        <button type="button" onClick={() => { setError(''); setScanning(true); }} disabled={busy} className="w-full rounded-xl bg-emerald-700 py-3.5 text-white font-bold disabled:opacity-60">
          {busy ? 'Linking…' : 'Scan the code'}
        </button>
        {error && <p className="text-sm text-red-700">{error}</p>}
      </div>
      <p className="flex items-start gap-2 text-xs text-gray-500"><ShieldCheck size={16} className="text-emerald-700 flex-shrink-0" /> Your files stay on your computer. They travel only between your computer and this phone, encrypted, and never through the internet.</p>
      {scanning && <QrScanner onResult={onCode} onClose={() => setScanning(false)} />}
    </div>
  );
}

function FolderList({ client, path, onOpen, onError, onLoaded }) {
  const [state, setState] = useState({ loading: true, items: [] });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let alive = true;
    client.list(path)
      .then((r) => {
        if (!alive) return;
        setState({ loading: false, items: r.items });
        onLoaded?.();
      })
      .catch((err) => {
        if (!alive) return;
        setState({ loading: false, items: [], error: err.message });
        onError?.(err);
      });
    return () => { alive = false; };
  }, [client, path, tick, onError, onLoaded]);

  const atTop = !path;
  const items = atTop
    ? [...state.items.filter((i) => MAIN.includes(i.name)).sort((a, b) => MAIN.indexOf(a.name) - MAIN.indexOf(b.name)), ...state.items.filter((i) => !MAIN.includes(i.name))]
    : state.items;

  return (
    <div className="p-3 space-y-2">
      <div className="flex items-center justify-between px-1">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{atTop ? 'Your KaTuro folder' : path.split('/').pop()}</p>
        <button type="button" onClick={() => { setState((s) => ({ ...s, loading: true, error: '' })); setTick((t) => t + 1); }} aria-label="Refresh" className="p-2 text-gray-500"><RefreshCw size={16} className={state.loading ? 'animate-spin' : ''} /></button>
      </div>
      {state.error && <p className="rounded-xl bg-white p-4 text-sm text-red-700">{state.error}</p>}
      {!state.loading && !state.error && !items.length && <p className="rounded-xl bg-white p-4 text-sm text-gray-500">This folder is empty.</p>}
      <ul className="space-y-2">
        {items.map((i) => {
          const main = atTop && MAIN.includes(i.name);
          return (
            <li key={i.path}>
              <button type="button" onClick={() => onOpen(i)} className={`w-full flex items-center gap-3 rounded-xl bg-white px-4 text-left shadow-sm active:bg-gray-50 ${main ? 'py-4' : 'py-3'}`}>
                {i.kind === 'directory'
                  ? (main ? <FolderOpen size={26} className="text-emerald-700 flex-shrink-0" /> : <Folder size={22} className="text-amber-600 flex-shrink-0" />)
                  : <FileText size={22} className="text-gray-500 flex-shrink-0" />}
                <span className="min-w-0 flex-1">
                  <span className={`block truncate ${main ? 'text-base font-bold' : 'text-sm font-semibold'} text-gray-900`}>{i.name}</span>
                  <span className="block text-xs text-gray-500">{main ? HINT[i.name] : i.kind === 'file' ? `${size(i.size)} · ${day(i.lastModified)}` : (atTop ? 'View only on the phone' : '')}</span>
                </span>
                <ChevronRight size={18} className="text-gray-400 flex-shrink-0" />
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** The KaTuro App (phone): link to KaTuroDesk, then browse and open the KaTuro folder. */
export default function PhoneApp() {
  const { user, profile } = useAuth();
  const teacher = teacherInfo(profile, user);
  const firstName = (profile?.firstName || teacher.name || '').split(' ')[0];
  const [link, setLink] = useState(() => loadLink());
  const [path, setPath] = useState('');
  const [file, setFile] = useState(null);
  const [online, setOnline] = useState(null); // null = checking, true, false
  const [tab, setTab] = useState('scores'); // scores | files
  const [version, setVersion] = useState(0); // bumped after files are sent or kept
  const [shared, setShared] = useState(null); // files shared from another app
  const bump = useCallback(() => setVersion((v) => v + 1), []);

  // Share → KaTuro from another app: on start, and while the app is open.
  useEffect(() => {
    let alive = true;
    const take = () => takeSharedFiles().then(({ files }) => {
      if (alive && files.length) { setShared(files); setTab('files'); }
    });
    take();
    const stop = onFilesShared(take);
    return () => { alive = false; stop(); };
  }, []);

  const client = useMemo(() => (link ? createLinkClient(link, { onLinkChange: (l) => saveLink(l) }) : null), [link]);

  useEffect(() => {
    if (!client) return;
    let alive = true;
    client.hello().then(() => alive && setOnline(true)).catch((err) => {
      if (!alive) return;
      setOnline(false);
      if (err.code === 'NOT_LINKED') { forgetLink(); setLink(null); }
    });
    return () => { alive = false; };
  }, [client]);

  const onListError = useCallback((err) => {
    if (err.code === 'UNREACHABLE') setOnline(false);
    if (err.code === 'NOT_LINKED') { forgetLink(); setLink(null); }
  }, []);

  const onListLoaded = useCallback(() => setOnline(true), []);

  const unlink = () => {
    if (!window.confirm('Unlink this phone from KaTuroDesk? You can link it again any time.')) return;
    forgetLink();
    forgetCachedClasses();
    setLink(null);
    setPath('');
  };

  // Android back button / gesture: go up a folder instead of closing the app.
  useEffect(() => {
    const onPop = () => {
      if (file) setFile(null);
      else if (path) setPath(path.split('/').slice(0, -1).join('/'));
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [file, path]);
  const go = (next) => {
    window.history.pushState({ kt: true }, '');
    next();
  };

  return (
    <div className="min-h-screen bg-[#eef2ef] text-gray-900" style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}>
      {file && client ? (
        <PhoneFileView entry={file} client={client} onBack={() => window.history.back()} onKeptChange={bump} />
      ) : (
        <>
          <header className="flex items-center justify-between px-4 py-3 bg-[#1f3a2c] text-white">
            <div className="min-w-0">
              <p className="text-base font-bold">KaTuro</p>
              <p className="text-xs text-emerald-100 truncate">{firstName ? `Hi, ${firstName}` : user?.email}</p>
            </div>
            <button type="button" onClick={() => signOut(auth)} aria-label="Sign out" className="p-2 -mr-2"><LogOut size={20} /></button>
          </header>

          {!link ? (
            <LinkScreen teacherName={firstName} onLinked={(l) => { setOnline(null); setLink(l); setPath(''); }} />
          ) : (
            <>
              <div className="flex items-center gap-2 px-4 py-2 bg-white border-b border-gray-200">
                <Laptop size={16} className="text-gray-500" />
                <p className="text-xs text-gray-700 flex-1 truncate">
                  {link.deskName} ·{' '}
                  {online === null ? <span className="inline-flex items-center gap-1"><Loader2 size={11} className="animate-spin" /> checking</span>
                    : online ? <span className="text-emerald-700 font-semibold">connected</span>
                      : <span className="text-amber-700 font-semibold">not reachable</span>}
                </p>
                <button type="button" onClick={unlink} aria-label="Unlink this phone" className="p-1.5 text-gray-400"><Unlink size={15} /></button>
              </div>
              {tab === 'files' && path && (
                <nav className="flex items-center gap-1 px-4 pt-3 text-xs text-emerald-800 overflow-x-auto whitespace-nowrap">
                  <button type="button" onClick={() => setPath('')} className="font-semibold">KaTuro</button>
                  {path.split('/').map((part, i, all) => (
                    <span key={all.slice(0, i + 1).join('/')} className="flex items-center gap-1">
                      <ChevronRight size={12} />
                      <button type="button" onClick={() => setPath(all.slice(0, i + 1).join('/'))} className={i === all.length - 1 ? 'font-bold text-gray-900' : 'font-semibold'}>{part}</button>
                    </span>
                  ))}
                </nav>
              )}
              {online === false && (
                <p className="mx-3 mt-3 rounded-xl bg-amber-50 border border-amber-200 p-3 text-xs text-amber-900">
                  Can&apos;t reach {link.deskName}. Check that KaTuroDesk is open on your computer and that this phone is on the same Wi-Fi or hotspot.
                </p>
              )}
              {client && tab === 'scores' && <ScoresFlow client={client} online={online} />}
              {client && tab === 'files' && <OutboxBanner client={client} onSent={bump} version={version} />}
              {tab === 'files' && !path && <KeptList version={version} onOpen={(i) => go(() => setFile(i))} />}
              {client && tab === 'files' && <AddToFolder key={path} client={client} path={path} onSent={bump} />}
              {client && shared && <SharedFilesSheet client={client} files={shared} onClose={() => setShared(null)} onSent={bump} />}
              {client && tab === 'files' && (
                <FolderList
                  key={`${path}|${version}`}
                  client={client}
                  path={path}
                  onError={onListError}
                  onLoaded={onListLoaded}
                  onOpen={(i) => {
                    if (i.kind === 'directory') go(() => setPath(i.path));
                    else go(() => setFile(i));
                  }}
                />
              )}
              <div className="h-20" />
              <nav className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-2 border-t border-gray-200 bg-white" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
                {[['scores', 'Scores', ClipboardList], ['files', 'Files', FolderOpen]].map(([id, label, Icon]) => (
                  <button key={id} type="button" onClick={() => setTab(id)} aria-pressed={tab === id} className={`flex flex-col items-center gap-0.5 py-2 text-xs font-semibold ${tab === id ? 'text-emerald-800' : 'text-gray-500'}`}>
                    <Icon size={22} /> {label}
                  </button>
                ))}
              </nav>
            </>
          )}
        </>
      )}
    </div>
  );
}
