import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { signOut } from 'firebase/auth';
import { Bot, CalendarDays, ChevronRight, ClipboardList, FileText, Folder, MessagesSquare, FolderOpen, Laptop, Loader2, Menu, RefreshCw, ShieldCheck, Unlink } from 'lucide-react';
import { auth } from '../../firebase';
import { useAuth } from '../../hooks/useAuth';
import { teacherInfo } from '../../services/teacherInfo';
import { parseLinkQr, pairWithDesk, createLinkClient } from '../../services/link/linkClient';
import { loadLink, saveLink } from '../../services/link/linkStore';
import { forgetPhoneData, unsentOnPhone } from '../../services/link/phoneData';
import QrScanner from './QrScanner';
import PhoneFileView from './PhoneFileView';
import ScoresFlow from './ScoresFlow';
import { KeptList, OutboxBanner, AddToFolder, SharedFilesSheet } from './PhoneLessons';
import { takeSharedFiles, onFilesShared } from '../../services/link/shareTarget';
import PhoneToday from './PhoneToday';
import PhoneAssistant from './PhoneAssistant';
import { useChats, useChatNotifications } from '../../features/messages/chatStore';
import { notifyNow } from '../../services/link/phoneReminders';
import { formatBytes } from '../../utils/bytes';
import { LockScreen, PhoneMenu, UpdateSheet } from './PhoneSecurity';
import { hasPin, shouldLock } from '../../services/link/appLock';
import { canUpdate, checkForUpdate, checkQuietly, installUpdate, installedVersion } from '../../services/link/appUpdate';
import { publishedDesk, withPublishedAddresses } from '../../services/link/findDesk';

const MessagesPanel = lazy(() => import('../../features/messages/MessagesPanel'));

const MAIN = ['Records', 'Lessons'];
const HINT = { Records: 'Class records', Lessons: 'Learning materials' };

const day = (ms) => (ms ? new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '');

function LinkScreen({ teacherName, uid, onLinked }) {
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
      const link = await pairWithDesk(qr, { deviceName: teacherName ? `${teacherName}'s phone` : 'My phone', uid });
      saveLink(link);
      onLinked(link);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }, [teacherName, uid, onLinked]);

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
                  <span className="block text-xs text-gray-500">{main ? HINT[i.name] : i.kind === 'file' ? `${formatBytes(i.size)} · ${day(i.lastModified)}` : (atTop ? 'View only on the phone' : '')}</span>
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
  const [deskNote, setDeskNote] = useState(''); // why KaTuroDesk refused (e.g. another account signed in there)
  const [update, setUpdate] = useState(null); // a newer KaTuro App (appUpdate.js)
  // PIN lock: locked when the app opens and after 5 minutes away (appLock.js).
  const [locked, setLocked] = useState(() => hasPin());
  const [settingPin, setSettingPin] = useState(false);
  const hiddenAt = useRef(0);
  useEffect(() => {
    const onVisible = () => {
      if (document.hidden) { hiddenAt.current = Date.now(); return; }
      if (hasPin() && shouldLock(hiddenAt.current)) setLocked(true);
      hiddenAt.current = 0;
      // Back in front after a long time in the background: the daily update check too.
      checkQuietly((u) => setUpdate(u));
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);
  // App menu and online updates.
  const [menuOpen, setMenuOpen] = useState(false);
  const [appVersion, setAppVersion] = useState('');
  const [updateState, setUpdateState] = useState({});
  const [menuNote, setMenuNote] = useState('');
  useEffect(() => {
    if (!canUpdate()) return undefined;
    let alive = true;
    installedVersion().then((v) => alive && setAppVersion(v.versionName || ''));
    checkQuietly((u) => alive && setUpdate(u));
    return () => { alive = false; };
  }, []);
  const checkNow = async () => {
    setMenuNote('Checking…');
    try {
      const r = await checkForUpdate();
      if (r.update) { setMenuOpen(false); setMenuNote(''); setUpdate(r.update); }
      else setMenuNote(`You have the latest version (v${r.installed.versionName}).`);
    } catch (err) {
      setMenuNote(err.message || 'Could not check for updates. Check the internet connection.');
    }
  };
  const runUpdate = async () => {
    setUpdateState({ busy: true });
    try {
      await installUpdate(update, (progress) => setUpdateState({ busy: true, progress }));
      setUpdateState({ note: 'Follow Android’s screen to finish the update.' });
    } catch (err) {
      setUpdateState({ note: err.message });
    }
  };
  // Found KaTuroDesk again at its new Wi-Fi address (published under this account) once per link.
  const searched = useRef('');
  const [tab, setTab] = useState('today'); // today | scores | assistant | messages | files
  const [version, setVersion] = useState(0); // bumped after files are sent or kept
  const [shared, setShared] = useState(null); // files shared from another app
  const [sharedNote, setSharedNote] = useState('');
  const [visited, setVisited] = useState(() => new Set(['today'])); // tabs stay mounted once opened (typed scores, a running Assistant turn)
  const bump = useCallback(() => setVersion((v) => v + 1), []);

  // Share → KaTuro from another app: on start, and while the app is open.
  useEffect(() => {
    let alive = true;
    // Files come in batches (the native side caps memory per batch); every batch is added.
    const take = async () => {
      for (let more = true; more && alive;) {
        const r = await takeSharedFiles();
        more = r.more;
        if (!alive) return;
        if (r.files.length) { setShared((prev) => [...(prev || []), ...r.files]); setTab('files'); }
        if (r.skipped.length) setSharedNote(`Not sent: ${r.skipped.map((x) => `${x.name} (${x.reason})`).join('; ')}.`);
      }
    };
    take();
    const stop = onFilesShared(take);
    return () => { alive = false; stop(); };
  }, []);

  // KaTuro Messages (cloud): a phone notification for a new message while the app is open
  // in the background or on another tab.
  const chatState = useChats(user?.uid);
  useChatNotifications({
    uid: user?.uid,
    chats: chatState.chats,
    invites: chatState.invites,
    invitesReady: chatState.invitesReady,
    teamInvites: chatState.teamInvites,
    teamInvitesReady: chatState.teamInvitesReady,
    ready: chatState.ready,
    openCid: null,
    panelOpen: tab === 'messages',
    notify: (title, body) => { if (tab !== 'messages' || document.hidden) notifyNow(title, body); },
  });

  // The link belongs to the account that made it: no client at all for another account.
  // Addresses learned later are saved only while this is still the phone's link.
  const ownLink = Boolean(link && user?.uid && link.uid === user.uid);
  const client = useMemo(() => (ownLink ? createLinkClient(link, { onLinkChange: (l) => { if (loadLink()?.deviceId === l.deviceId) saveLink(l); } }) : null), [link, ownLink]);
  // An old client is closed once it is replaced or the app closes (a moment later, so React's
  // development double-run of effects does not close the client in use).
  const clientRef = useRef(null);
  const closing = useRef(null);
  useEffect(() => {
    clientRef.current = client;
    if (closing.current?.client === client) clearTimeout(closing.current.timer);
    return () => { if (client) closing.current = { client, timer: setTimeout(() => client.close(), 0) }; };
  }, [client]);

  /**
   * The one way the teacher's data leaves the phone: close the link, let the screens close,
   * then clear (so no answer still on its way writes anything back).
   */
  const wipe = useCallback(async () => {
    clientRef.current?.close();
    setLink(null);
    setPath('');
    await new Promise((r) => setTimeout(r, 0));
    await forgetPhoneData();
  }, []);

  // Another account signed in (also after a sign-out the app did not start, e.g. a disabled
  // account): the phone starts clean.
  useEffect(() => {
    if (link && user?.uid && link.uid !== user.uid) Promise.resolve().then(wipe);
  }, [link, user?.uid, wipe]);

  useEffect(() => {
    if (!client) return;
    let alive = true;
    client.hello().then(() => { if (alive) { setOnline(true); setDeskNote(''); } }).catch((err) => {
      if (!alive) return;
      setOnline(false);
      setDeskNote(err.code === 'OTHER_ACCOUNT' ? err.message : '');
      // KaTuroDesk removed this phone: nothing of that teacher's classes stays on it.
      if (err.code === 'NOT_LINKED') wipe();
      // Not reachable at the saved addresses: KaTuroDesk may have a new Wi-Fi address.
      if (err.code === 'UNREACHABLE' && link && searched.current !== `${link.deviceId}|${link.hosts.join()}|${link.port}`) {
        searched.current = `${link.deviceId}|${link.hosts.join()}|${link.port}`;
        publishedDesk(user?.uid, link.deskId).then((published) => {
          const moved = withPublishedAddresses(link, published);
          if (moved && alive && loadLink()?.deviceId === moved.deviceId) { saveLink(moved); setLink(moved); }
        });
      }
    });
    return () => { alive = false; };
  }, [client, link, user?.uid, wipe]);

  const onListError = useCallback((err) => {
    if (err.code === 'UNREACHABLE' || err.code === 'OTHER_ACCOUNT') setOnline(false);
    setDeskNote(err.code === 'OTHER_ACCOUNT' ? err.message : '');
    if (err.code === 'NOT_LINKED') wipe();
  }, [wipe]);

  const onListLoaded = useCallback(() => setOnline(true), []);

  /** Unlink or sign out: everything of the teacher's on this phone is cleared (after a warning about unsent work). */
  const clearPhone = async (what) => {
    const { recordings, files } = await unsentOnPhone();
    const unsent = recordings || files ? ` ${[recordings && `${recordings} recording(s)`, files && `${files} file(s)`].filter(Boolean).join(' and ')} not sent to KaTuroDesk yet will be deleted.` : '';
    if (!window.confirm(`${what} Your class lists, kept files and schedule are removed from this phone.${unsent}`)) return false;
    await wipe();
    return true;
  };
  const unlink = () => clearPhone('Unlink this phone from KaTuroDesk? You can link it again any time.');
  const signOutHere = async () => { if (await clearPhone('Sign out of KaTuro on this phone?')) signOut(auth); };
  // Too many wrong PINs: no question (whoever is guessing must not be able to say No).
  const lockedOut = async () => { await wipe(); signOut(auth); };
  const openTab = (id) => { setTab(id); setVisited((v) => (v.has(id) ? v : new Set([...v, id]))); };

  const showUnlock = Boolean(link) && hasPin() && locked;
  const showSetPin = Boolean(link) && !showUnlock && (!hasPin() || settingPin);
  const pinScreen = showUnlock || showSetPin;

  // Android back button / gesture: go up a folder instead of closing the app. Also while the
  // PIN screen shows (it covers everything): the back step is used up either way, so the screen
  // must follow it or an open file could no longer be closed after unlocking.
  useEffect(() => {
    const onPop = () => {
      if (file) setFile(null);
      else if (tab === 'files' && path) setPath(path.split('/').slice(0, -1).join('/'));
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [file, path, tab]);
  const go = (next) => {
    window.history.pushState({ kt: true }, '');
    next();
  };

  return (
    <div className="min-h-screen bg-[#eef2ef] text-gray-900" style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}>
      {/* A linked phone needs a PIN first (class lists live on it), then asks for it when opened.
          While a PIN screen shows, the app underneath is hidden (not shown, not read aloud, not
          tappable) but stays mounted, so typed scores, an open file and a running Assistant turn
          are still there after the PIN. */}
      {showUnlock && <LockScreen mode="unlock" onDone={() => setLocked(false)} onForgot={signOutHere} onLockedOut={lockedOut} />}
      {showSetPin && <LockScreen mode="set" onDone={() => { setSettingPin(false); setLocked(false); }} onCancel={hasPin() ? () => setSettingPin(false) : undefined} />}
      {menuOpen && !pinScreen && (
        <PhoneMenu
          version={appVersion}
          linked={Boolean(link)}
          onClose={() => setMenuOpen(false)}
          onCheckUpdate={checkNow}
          onChangePin={() => { setMenuOpen(false); setSettingPin(true); }}
          onUnlink={() => { setMenuOpen(false); unlink(); }}
          onSignOut={() => { setMenuOpen(false); signOutHere(); }}
        />
      )}
      {menuOpen && menuNote && !pinScreen && <p className="fixed inset-x-0 bottom-0 z-[55] bg-gray-900 px-4 py-3 text-center text-sm text-white" style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}>{menuNote}</p>}
      {update && !pinScreen && <UpdateSheet update={update} state={updateState} onUpdate={runUpdate} onClose={() => { setUpdate(null); setUpdateState({}); }} />}
      <div hidden={pinScreen} inert={pinScreen}>
          {file && client && (
            <div className="fixed inset-0 z-50 overflow-y-auto bg-[#eef2ef]" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
              <PhoneFileView entry={file} client={client} onBack={() => window.history.back()} onKeptChange={bump} />
            </div>
          )}
          <header className="flex items-center justify-between px-4 py-3 bg-[#1f3a2c] text-white">
            <div className="min-w-0">
              <p className="text-base font-bold">KaTuro</p>
              <p className="text-xs text-emerald-100 truncate">{firstName ? `Hi, ${firstName}` : user?.email}</p>
            </div>
            <button type="button" onClick={() => { setMenuNote(''); setMenuOpen(true); }} aria-label="Menu" className="p-2 -mr-2"><Menu size={22} /></button>
          </header>

          {!link ? (
            <LinkScreen teacherName={firstName} uid={user?.uid} onLinked={(l) => { setOnline(null); setLink(l); setPath(''); }} />
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
                  {deskNote || <>Can&apos;t reach {link.deskName}. Check that KaTuroDesk is open on your computer and that this phone is on the same Wi-Fi or hotspot.</>}
                </p>
              )}
              {client && visited.has('today') && <div hidden={tab !== 'today'}><PhoneToday client={client} online={online} /></div>}
              {client && visited.has('scores') && <div hidden={tab !== 'scores'}><ScoresFlow client={client} online={online} /></div>}
              {client && visited.has('assistant') && <div hidden={tab !== 'assistant'}><PhoneAssistant client={client} user={user} profile={profile} onOpenFile={(i) => go(() => setFile(i))} /></div>}
              {visited.has('messages') && (
                <div hidden={tab !== 'messages'}>
                  <Suspense fallback={<p className="flex items-center gap-2 p-4 text-sm text-gray-600"><Loader2 size={16} className="animate-spin" /> Opening Messages…</p>}>
                    <div className="bg-white"><MessagesPanel user={user} height="calc(100vh - 170px)" /></div>
                  </Suspense>
                </div>
              )}
              {sharedNote && <p className="mx-3 mt-3 rounded-xl bg-amber-50 border border-amber-200 p-3 text-xs text-amber-900">{sharedNote}</p>}
              {client && tab === 'files' && <OutboxBanner client={client} onSent={bump} version={version} />}
              {tab === 'files' && !path && <KeptList version={version} onOpen={(i) => go(() => setFile(i))} />}
              {client && tab === 'files' && <AddToFolder key={path} client={client} path={path} onSent={bump} />}
              {client && shared && <SharedFilesSheet client={client} files={shared} onClose={() => { setShared(null); setSharedNote(''); }} onSent={bump} />}
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
              <nav className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-5 border-t border-gray-200 bg-white" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
                {[['today', 'Today', CalendarDays], ['scores', 'Scores', ClipboardList], ['assistant', 'Assistant', Bot], ['messages', 'Messages', MessagesSquare], ['files', 'Files', FolderOpen]].map(([id, label, Icon]) => (
                  <button key={id} type="button" onClick={() => openTab(id)} aria-pressed={tab === id} className={`relative flex flex-col items-center gap-0.5 py-2 text-[11px] font-semibold ${tab === id ? 'text-emerald-800' : 'text-gray-500'}`}>
                    <Icon size={22} /> {label}
                    {id === 'messages' && chatState.badgeCount > 0 && <span className="absolute right-2 top-1 min-w-[18px] rounded-full bg-red-600 px-1 text-[10px] font-bold leading-[18px] text-white">{chatState.badgeCount > 99 ? '99+' : chatState.badgeCount}</span>}
                  </button>
                ))}
              </nav>
            </>
          )}
      </div>
    </div>
  );
}
