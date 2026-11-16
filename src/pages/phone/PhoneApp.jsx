import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { signOut } from 'firebase/auth';
import { CalendarDays, ChevronRight, ClipboardList, FileText, Folder, MessagesSquare, FolderOpen, Laptop, Loader2, Menu, RefreshCw, ShieldCheck } from 'lucide-react';
import { auth } from '../../firebase';
import { useAuth } from '../../hooks/useAuth';
import { teacherInfo } from '../../services/teacherInfo';
import { parseLinkQr, pairWithDesk, createLinkClient } from '../../services/link/linkClient';
import { loadLink, saveLink } from '../../services/link/linkStore';
import { forgetPhoneData, unsentOnPhone } from '../../services/link/phoneData';
import { canAdd } from '../../services/link/phoneFiles';
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
import { KT_LOGO } from './phoneLogo';
import './phone.css';

const MessagesPanel = lazy(() => import('../../features/messages/MessagesPanel'));

const MAIN = ['Records', 'Lessons'];
// The bottom bar; the Assistant is the KaTuro logo in the middle.
const TABS = [['today', 'Today', CalendarDays], ['scores', 'Scores', ClipboardList], ['assistant', 'KaTuro Assistant', null], ['messages', 'Messages', MessagesSquare], ['files', 'Files', FolderOpen]];

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
    <div className="flex flex-col items-center px-8 pt-[8vh] text-center">
      <div className="nm grid h-28 w-28 place-items-center rounded-full"><Laptop size={44} className="nm-green" /></div>
      <h2 className="mt-8 text-xl font-semibold">Link your computer</h2>
      <p className="nm-muted mt-2 text-sm">KaTuroDesk → Settings → Phones → Link a phone</p>
      <button type="button" onClick={() => { setError(''); setScanning(true); }} disabled={busy} className="nm-accent nm-press mt-10 w-full max-w-sm rounded-2xl py-4 font-semibold disabled:opacity-60">
        {busy ? 'Linking…' : 'Scan the code'}
      </button>
      {error && <p className="mt-4 text-sm text-red-700">{error}</p>}
      <p className="nm-muted mt-8 flex items-center gap-1.5 text-xs"><ShieldCheck size={14} className="nm-green" /> Same Wi-Fi or hotspot · never the internet</p>
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
        onLoaded?.(r);
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
    <div className="space-y-4 px-5 py-3">
      <div className="flex items-center justify-between">
        <p className="nm-muted text-sm font-medium">{atTop ? 'Files' : ''}</p>
        <button type="button" onClick={() => { setState((s) => ({ ...s, loading: true, error: '' })); setTick((t) => t + 1); }} aria-label="Refresh" className="nm-sm nm-press nm-muted grid h-10 w-10 place-items-center rounded-full"><RefreshCw size={16} className={state.loading ? 'animate-spin' : ''} /></button>
      </div>
      {state.error && <p className="nm-in rounded-2xl p-4 text-sm text-red-700">{state.error}</p>}
      {!state.loading && !state.error && !items.length && <p className="nm-muted py-10 text-center text-sm">Empty</p>}
      <ul className="space-y-4">
        {items.map((i) => {
          const main = atTop && MAIN.includes(i.name);
          return (
            <li key={i.path}>
              <button type="button" onClick={() => onOpen(i)} className={`nm nm-press flex w-full items-center gap-4 rounded-3xl px-5 text-left ${main ? 'py-5' : 'py-4'}`}>
                {i.kind === 'directory'
                  ? (main ? <FolderOpen size={26} className="nm-green flex-shrink-0" /> : <Folder size={22} className={`${i.outside ? 'text-sky-700' : 'text-amber-600'} flex-shrink-0`} />)
                  : <FileText size={22} className="nm-muted flex-shrink-0" />}
                <span className="min-w-0 flex-1">
                  <span className={`block truncate ${main ? 'text-base font-semibold' : 'text-sm font-medium'}`}>{i.name}</span>
                  {i.kind === 'file' && <span className="nm-muted block text-xs">{formatBytes(i.size)} · {day(i.lastModified)}</span>}
                </span>
                <ChevronRight size={18} className="nm-muted flex-shrink-0" />
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
    setFile(null);
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

  // The folder now listed, with what KaTuroDesk lets this phone do there (its "access").
  const [listing, setListing] = useState(null);
  const onListLoaded = useCallback((r) => { setOnline(true); setListing(r); }, []);
  // Where the "+" sends files: this folder when KaTuroDesk allows adding here; from the top,
  // Lessons (also while KaTuroDesk can't be reached: the files wait on the phone and it checks then).
  const lessons = listing?.path === '' ? listing.items.find((i) => i.path === 'Lessons') : null;
  let addTarget = null;
  if (listing?.path === path) addTarget = path ? (canAdd(listing.access) ? path : null) : (canAdd(lessons?.access) ? 'Lessons' : null);
  else if (!path && online === false) addTarget = 'Lessons';
  // "Renamed to …", "Moved to …": shown on the Files tab until the next folder or file opens.
  const [filesNote, setFilesNote] = useState('');

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

  // Android back button / gesture. Every step into a folder or a file is a history entry that
  // remembers what it shows ({ path, file, d: KaTuro steps below it, link }). Going back shows
  // exactly the entry it lands on, so the screen and Android's back stack cannot drift apart:
  // not under the PIN screen, not after back on another tab, not after a folder-path tap.
  // Entries from before an unlink / another link show the top of the folder.
  const linkId = link?.deviceId || '';
  const navLink = useRef(linkId);
  useEffect(() => { navLink.current = linkId; }, [linkId]);
  const stepping = useRef(false); // a folder-path tap is going back; a second tap waits for it
  useEffect(() => {
    const onPop = (e) => {
      stepping.current = false;
      const s = e.state?.kt && e.state.link === navLink.current ? e.state : null;
      setPath(s?.path || '');
      setFile(s?.file || null);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  /** Opens a folder ({ path }) or a file ({ file }) as a new back step. */
  const go = ({ path: nextPath = path, file: nextFile = null }) => {
    const below = window.history.state?.kt ? window.history.state.d : 0;
    window.history.pushState({ kt: true, link: navLink.current, d: below + 1, path: nextPath, file: nextFile }, '');
    setPath(nextPath);
    setFile(nextFile);
    setFilesNote('');
  };
  /** A folder-path tap: back to that level through the back steps (never past the first). */
  const upTo = (depth) => {
    const below = window.history.state?.kt ? window.history.state.d : 0;
    const steps = Math.min(path.split('/').length - depth, below);
    if (stepping.current) return;
    if (steps > 0) {
      stepping.current = true;
      window.history.go(-steps);
    } else setPath(path.split('/').slice(0, depth).join('/'));
  };

  return (
    <div className="kt-phone" style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}>
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
      {menuOpen && menuNote && !pinScreen && <p className="fixed inset-x-6 bottom-6 z-[55] rounded-2xl bg-gray-900/90 px-4 py-3 text-center text-sm text-white" style={{ marginBottom: 'env(safe-area-inset-bottom)' }}>{menuNote}</p>}
      {update && !pinScreen && <UpdateSheet update={update} state={updateState} onUpdate={runUpdate} onClose={() => { setUpdate(null); setUpdateState({}); }} />}
      <div hidden={pinScreen} inert={pinScreen}>
          {file && client && (
            <div className="fixed inset-0 z-50 overflow-y-auto bg-[#eef2ef]" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
              <PhoneFileView entry={file} client={client} onBack={() => window.history.back()} onKeptChange={bump} onChanged={(note) => { setFilesNote(note); bump(); window.history.back(); }} />
            </div>
          )}
          <header className="flex items-center justify-between px-5 pb-2 pt-5">
            <div className="flex min-w-0 items-center gap-2.5">
              <p className="truncate text-xl font-semibold">{firstName ? `Hi, ${firstName}` : 'KaTuro'}</p>
              {link && (
                <span
                  role="img"
                  aria-label={online === false ? `${link.deskName} not reachable` : online ? `Connected to ${link.deskName}` : 'Connecting'}
                  className={`h-2.5 w-2.5 flex-shrink-0 rounded-full ${online === false ? 'bg-amber-500' : online ? 'bg-emerald-500' : 'animate-pulse bg-gray-300'}`}
                />
              )}
            </div>
            <button type="button" onClick={() => { setMenuNote(''); setMenuOpen(true); }} aria-label="Menu" className="nm-sm nm-press grid h-11 w-11 place-items-center rounded-full"><Menu size={20} /></button>
          </header>

          {!link ? (
            <LinkScreen teacherName={firstName} uid={user?.uid} onLinked={(l) => { setOnline(null); setLink(l); setPath(''); }} />
          ) : (
            <>
              {tab === 'files' && path && (
                <nav className="nm-green flex items-center gap-1 overflow-x-auto whitespace-nowrap px-5 pt-2 text-xs">
                  <button type="button" onClick={() => upTo(0)} className="font-semibold">KaTuro</button>
                  {path.split('/').map((part, i, all) => (
                    <span key={all.slice(0, i + 1).join('/')} className="flex items-center gap-1">
                      <ChevronRight size={12} />
                      <button type="button" onClick={() => upTo(i + 1)} className={i === all.length - 1 ? 'nm-ink font-semibold' : 'font-semibold'}>{part.replace(/^:/, '')}</button>
                    </span>
                  ))}
                </nav>
              )}
              {online === false && (
                <p className="nm-in mx-5 mt-2 rounded-2xl px-4 py-3 text-xs text-amber-800">
                  {deskNote || <>Can&apos;t reach {link.deskName}. Is KaTuroDesk open, on the same Wi-Fi?</>}
                </p>
              )}
              {client && visited.has('today') && <div hidden={tab !== 'today'}><PhoneToday client={client} online={online} /></div>}
              {client && visited.has('scores') && <div hidden={tab !== 'scores'}><ScoresFlow client={client} online={online} /></div>}
              {client && visited.has('assistant') && <div hidden={tab !== 'assistant'}><PhoneAssistant client={client} user={user} profile={profile} onOpenFile={(i) => go({ file: i })} /></div>}
              {visited.has('messages') && (
                <div hidden={tab !== 'messages'}>
                  <Suspense fallback={<p className="flex items-center gap-2 p-4 text-sm text-gray-600"><Loader2 size={16} className="animate-spin" /> Opening Messages…</p>}>
                    <div className="bg-white"><MessagesPanel user={user} height={`calc(100vh - ${online === false ? 290 : 230}px - env(safe-area-inset-top) - env(safe-area-inset-bottom))`} /></div>
                  </Suspense>
                </div>
              )}
              {sharedNote && <p className="nm-in mx-5 mt-3 rounded-2xl px-4 py-3 text-xs text-amber-800">{sharedNote}</p>}
              {tab === 'files' && filesNote && <p className="nm-green mx-5 mt-3 text-xs font-medium">{filesNote}</p>}
              {client && tab === 'files' && <OutboxBanner client={client} onSent={bump} version={version} />}
              {tab === 'files' && !path && <KeptList version={version} onOpen={(i) => go({ file: i })} />}
              {client && tab === 'files' && addTarget && <AddToFolder key={path} client={client} folder={addTarget} onSent={bump} />}
              {client && shared && <SharedFilesSheet client={client} files={shared} onClose={() => { setShared(null); setSharedNote(''); }} onSent={bump} />}
              {client && tab === 'files' && (
                <FolderList
                  key={`${path}|${version}`}
                  client={client}
                  path={path}
                  onError={onListError}
                  onLoaded={onListLoaded}
                  onOpen={(i) => {
                    if (i.kind === 'directory') go({ path: i.path });
                    else go({ file: i });
                  }}
                />
              )}
              <div className="h-28" />
              <nav className="kt-nav fixed inset-x-0 bottom-0 z-20" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
                <div className="relative grid h-16 grid-cols-5 items-center">
                  {TABS.map(([id, label, Icon]) => (Icon ? (
                    <button key={id} type="button" onClick={() => openTab(id)} aria-pressed={tab === id} aria-label={label} className="relative grid place-items-center justify-self-center">
                      <span className={`grid h-11 w-11 place-items-center rounded-2xl ${tab === id ? 'nm-in nm-green' : 'nm-muted'}`}><Icon size={22} strokeWidth={tab === id ? 2.2 : 1.8} /></span>
                      {id === 'messages' && chatState.badgeCount > 0 && <span className="absolute -right-1 -top-1 min-w-[18px] rounded-full bg-red-600 px-1 text-center text-[10px] font-bold leading-[18px] text-white">{chatState.badgeCount > 99 ? '99+' : chatState.badgeCount}</span>}
                    </button>
                  ) : (
                    <span key={id} aria-hidden="true" />
                  )))}
                  {/* The KaTuro logo, big and in the middle: opens the Assistant. */}
                  <button type="button" onClick={() => openTab('assistant')} aria-pressed={tab === 'assistant'} aria-label="KaTuro Assistant" className="kt-logo-btn absolute -top-12 left-1/2 -translate-x-1/2">
                    <img src={KT_LOGO} alt="" className="kt-logo h-[104px] w-[104px]" />
                  </button>
                </div>
              </nav>
            </>
          )}
      </div>
    </div>
  );
}
