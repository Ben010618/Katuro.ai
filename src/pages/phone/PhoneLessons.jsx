import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowLeft, ArrowUp, Camera, CheckCircle2, CloudOff, FileUp, FolderOpen, HardDriveDownload, Loader2, Plus, ScanText, Trash2, X } from 'lucide-react';
import { canAdd, folderLabel, keptFiles, outbox, sendOutbox, dropFromOutbox, sendOrKeep, shrinkPhoto, pagesToPdf, stampName } from '../../services/link/phoneFiles';
import { formatBytes } from '../../utils/bytes';

const Card = ({ children, className = '' }) => <div className={`rounded-xl bg-white p-4 shadow-sm ${className}`}>{children}</div>;
const MAX_SEND = 25 * 1024 * 1024;

/** Files kept on this phone (open without KaTuroDesk). Shown at the top of the Files tab. */
export function KeptList({ onOpen, version }) {
  const [list, setList] = useState([]);
  useEffect(() => {
    let alive = true;
    keptFiles().then((l) => alive && setList(l)).catch(() => {});
    return () => { alive = false; };
  }, [version]);
  if (!list.length) return null;
  return (
    <div className="px-3 pt-3 space-y-2">
      <p className="px-1 text-xs font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-1"><HardDriveDownload size={13} /> On this phone</p>
      <ul className="rounded-xl bg-white shadow-sm divide-y divide-gray-100">
        {list.map((f) => (
          <li key={f.path}>
            <button type="button" onClick={() => onOpen({ name: f.name, path: f.path, kind: 'file', size: f.size })} className="w-full px-4 py-2.5 text-left">
              <span className="block text-sm font-semibold text-gray-900 truncate">{f.name}</span>
              <span className="block text-[11px] text-gray-500 truncate">{f.path.split('/').slice(0, -1).join(' › ')} · {formatBytes(f.size)}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Photos and files waiting to go to KaTuroDesk. Tries to send them when the tab opens. */
export function OutboxBanner({ client, onSent, version }) {
  const [items, setItems] = useState([]);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const after = useCallback(async (r) => {
    setItems(await outbox());
    if (r) setNote(r.unreachable ? 'KaTuroDesk is still not reachable.' : r.sent.length ? `${r.sent.length} file${r.sent.length > 1 ? 's' : ''} sent to KaTuroDesk.` : '');
    if (r?.sent.length) onSent?.();
  }, [onSent]);
  useEffect(() => {
    let alive = true;
    outbox().then(async (list) => {
      if (!alive) return;
      setItems(list);
      if (list.length && client) {
        const r = await sendOutbox(client);
        if (alive) after(r);
      }
    }).catch(() => {});
    return () => { alive = false; };
  }, [client, after, version]);

  if (!items.length) return note ? <p className="mx-4 mt-3 text-xs text-emerald-800">{note}</p> : null;
  return (
    <Card className="mx-3 mt-3 border border-amber-200 bg-amber-50">
      <p className="text-sm font-semibold text-amber-900 flex items-center gap-2"><CloudOff size={16} /> {items.length} file{items.length > 1 ? 's' : ''} waiting to send</p>
      <ul className="mt-1 text-xs text-amber-900 space-y-1">
        {items.map((i) => (
          <li key={i.id} className="flex items-start gap-2">
            <span className="flex-1 min-w-0"><span className="block truncate">{i.name} → {folderLabel(i.folder)}</span>{i.error && <span className="block text-red-700">{i.error}</span>}</span>
            <button type="button" aria-label={`Do not send ${i.name}`} onClick={async () => { await dropFromOutbox(i.id); after(null); }} className="p-1 text-amber-700"><X size={14} /></button>
          </li>
        ))}
      </ul>
      <button type="button" disabled={busy} onClick={async () => { setBusy(true); await after(await sendOutbox(client)); setBusy(false); }} className="mt-2 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60">{busy ? 'Sending…' : 'Send now'}</button>
      {note && <p className="mt-1 text-xs text-amber-900">{note}</p>}
    </Card>
  );
}

/** Sends files (photos made smaller first) to `folder`, one by one. → [{ name, ok, queued?, error? }] */
async function sendAll(client, folder, files, onProgress) {
  const out = [];
  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    onProgress(`Sending ${i + 1} of ${files.length}…`);
    try {
      const isPhoto = /^image\/(jpeg|png|webp|heic|heif)/i.test(f.type) || /\.(jpe?g|png|webp|heic|heif)$/i.test(f.name);
      let name = f.name || stampName('File', 'bin');
      let bytes;
      if (isPhoto) {
        bytes = await shrinkPhoto(f);
        name = /^image\.|^IMG|^\d|^photo/i.test(name) || !name.includes('.') ? stampName('Photo', 'jpg') : name.replace(/\.[^.]+$/, '.jpg');
      } else {
        if (f.size > MAX_SEND) { out.push({ name, ok: false, error: 'too big to send (up to 25 MB)' }); continue; }
        bytes = new Uint8Array(await f.arrayBuffer());
      }
      const r = await sendOrKeep(client, { folder, name, bytes });
      out.push({ name: r.sent?.name || name, ok: true, queued: Boolean(r.queued) });
    } catch (err) {
      out.push({ name: f.name, ok: false, error: err.message });
    }
  }
  onProgress('');
  return out;
}

function Results({ results }) {
  if (!results?.length) return null;
  const queued = results.filter((r) => r.queued).length;
  return (
    <Card className="space-y-1">
      {results.map((r) => (
        <p key={r.name} className={`text-sm flex items-center gap-2 ${r.ok ? 'text-gray-800' : 'text-red-700'}`}>
          {r.ok ? (r.queued ? <CloudOff size={15} className="text-amber-600" /> : <CheckCircle2 size={15} className="text-emerald-600" />) : <X size={15} />}
          <span className="truncate">{r.name}{r.ok ? '' : `: ${r.error}`}</span>
        </p>
      ))}
      {queued > 0 && <p className="text-xs text-amber-800">{queued} will be sent when KaTuroDesk is reachable.</p>}
    </Card>
  );
}

/** Scan pages with the camera into one PDF. */
function ScanToPdf({ client, folder, onClose, onSent }) {
  const [pages, setPages] = useState([]); // { id, bytes, url }
  const [name, setName] = useState(() => stampName('Scan', 'pdf').replace(/\.pdf$/, ''));
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState(null);

  // Page previews are freed when the scan screen closes (not while they are on screen).
  const urls = useRef([]);
  useEffect(() => () => urls.current.forEach((u) => URL.revokeObjectURL(u)), []);

  const add = async (e) => {
    const files = [...(e.target.files || [])];
    e.target.value = '';
    setBusy('Preparing the page…');
    try {
      const added = [];
      for (const f of files) {
        const bytes = await shrinkPhoto(f, { maxSide: 2000, quality: 0.85 });
        const url = URL.createObjectURL(new Blob([bytes], { type: 'image/jpeg' }));
        urls.current.push(url);
        added.push({ id: `${Date.now()}-${Math.random()}`, bytes, url });
      }
      setPages((p) => [...p, ...added]);
    } catch (err) {
      setError(err.message);
    }
    setBusy('');
  };
  const move = (i, d) => setPages((p) => {
    const n = [...p];
    const [x] = n.splice(i, 1);
    n.splice(i + d, 0, x);
    return n;
  });
  const send = async () => {
    setError('');
    setBusy('Making the PDF…');
    try {
      const pdf = await pagesToPdf(pages.map((p) => p.bytes));
      if (pdf.byteLength > MAX_SEND) throw new Error('The PDF is over 25 MB. Send fewer pages at a time.');
      setBusy('Sending…');
      const file = `${name.trim().replace(/[\\/:*?"<>|]+/g, ' ') || 'Scan'}.pdf`;
      const r = await sendOrKeep(client, { folder, name: file, bytes: pdf });
      setDone({ name: r.sent?.name || file, queued: Boolean(r.queued) });
      onSent?.();
    } catch (err) {
      setError(err.message);
    }
    setBusy('');
  };

  if (done) {
    return (
      <div className="p-3 space-y-3">
        <Card className="text-center space-y-2">
          {done.queued ? <CloudOff size={40} className="mx-auto text-amber-600" /> : <CheckCircle2 size={40} className="mx-auto text-emerald-600" />}
          <p className="text-lg font-bold">{done.queued ? 'Saved on this phone' : 'Sent'}</p>
          <p className="text-sm text-gray-600">{done.queued ? `${done.name} will be sent to ${folderLabel(folder)} when KaTuroDesk is reachable.` : `${done.name} is in ${folderLabel(folder)} on KaTuroDesk.`}</p>
        </Card>
        <button type="button" onClick={onClose} className="w-full rounded-xl bg-emerald-700 py-3 font-bold text-white">Done</button>
      </div>
    );
  }
  return (
    <div className="p-3 space-y-3 pb-28">
      <Card className="space-y-2">
        <label className="block text-xs font-semibold text-gray-600" htmlFor="kt-scan-name">PDF name</label>
        <input id="kt-scan-name" value={name} onChange={(e) => setName(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2" />
        <p className="text-[11px] text-gray-500">Goes to <b>{folderLabel(folder)}</b>. Take one photo per page, flat and in good light.</p>
      </Card>
      <div className="grid grid-cols-3 gap-2">
        {pages.map((p, i) => (
          <div key={p.id} className="relative rounded-lg bg-white p-1 shadow-sm">
            <img src={p.url} alt={`Page ${i + 1}`} className="aspect-[3/4] w-full rounded object-cover" />
            <span className="absolute left-1.5 top-1.5 rounded bg-black/60 px-1.5 text-[11px] font-bold text-white">{i + 1}</span>
            <div className="mt-1 flex justify-between">
              <button type="button" aria-label={`Move page ${i + 1} up`} disabled={i === 0} onClick={() => move(i, -1)} className="p-1 disabled:opacity-30"><ArrowUp size={14} /></button>
              <button type="button" aria-label={`Remove page ${i + 1}`} onClick={() => setPages((ps) => ps.filter((x) => x.id !== p.id))} className="p-1 text-red-600"><Trash2 size={14} /></button>
              <button type="button" aria-label={`Move page ${i + 1} down`} disabled={i === pages.length - 1} onClick={() => move(i, 1)} className="p-1 disabled:opacity-30"><ArrowDown size={14} /></button>
            </div>
          </div>
        ))}
        <label className="flex aspect-[3/4] flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-emerald-300 bg-emerald-50 text-xs font-semibold text-emerald-800">
          <Camera size={22} /> {pages.length ? 'Next page' : 'First page'}
          <input type="file" accept="image/*" capture="environment" className="hidden" onChange={add} />
        </label>
      </div>
      {busy && <p className="flex items-center gap-2 text-sm text-gray-700"><Loader2 size={16} className="animate-spin" /> {busy}</p>}
      {error && <p className="text-sm text-red-700">{error}</p>}
      <div className="kt-covers-nav fixed inset-x-0 bottom-0 z-30 bg-white border-t border-gray-200 p-3" style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}>
        <button type="button" disabled={!pages.length || Boolean(busy)} onClick={send} className="w-full rounded-xl bg-emerald-700 py-3.5 font-bold text-white disabled:opacity-50">
          Make PDF ({pages.length} page{pages.length === 1 ? '' : 's'}) and send
        </button>
      </div>
    </div>
  );
}

/**
 * The "+" on the Files tab: Snap & Send, Scan to PDF, Choose files, into `folder` (the folder
 * being viewed, or Lessons from the top; PhoneApp shows it only where KaTuroDesk allows adding).
 */
export function AddToFolder({ client, folder, onSent }) {
  const [open, setOpen] = useState(false);
  const [scan, setScan] = useState(false);
  const [busy, setBusy] = useState('');
  const [results, setResults] = useState(null);

  const pick = async (e) => {
    const files = [...(e.target.files || [])];
    e.target.value = '';
    if (!files.length) return;
    setResults(await sendAll(client, folder, files, setBusy));
    onSent?.();
  };

  if (scan) {
    return (
      <div className="fixed inset-0 z-40 overflow-y-auto bg-[#eef2ef]" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        <div className="sticky top-0 z-10 flex items-center gap-2 bg-[#eef2ef] px-3 py-2 border-b border-gray-200">
          <button type="button" onClick={() => setScan(false)} aria-label="Back" className="p-2 -ml-2"><ArrowLeft size={20} /></button>
          <p className="text-sm font-bold">Scan pages to PDF</p>
        </div>
        <ScanToPdf client={client} folder={folder} onClose={() => { setScan(false); setOpen(false); }} onSent={onSent} />
      </div>
    );
  }

  return (
    <>
      {(busy || results) && (
        <div className="px-3 pt-3 space-y-2">
          {busy && <p className="flex items-center gap-2 text-sm text-gray-700"><Loader2 size={16} className="animate-spin" /> {busy}</p>}
          <Results results={results} />
        </div>
      )}
      <button type="button" onClick={() => { setResults(null); setOpen(true); }} aria-label={`Add to ${folderLabel(folder)}`} className="fixed bottom-20 right-4 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-700 text-white shadow-lg" style={{ marginBottom: 'env(safe-area-inset-bottom)' }}>
        <Plus size={28} />
      </button>
      {open && (
        <div className="fixed inset-0 z-40 flex items-end bg-black/40" onClick={() => setOpen(false)}>
          <div onClick={(e) => e.stopPropagation()} className="w-full rounded-t-2xl bg-white p-4 space-y-2" style={{ paddingBottom: 'max(16px, env(safe-area-inset-bottom))' }}>
            <p className="text-sm font-bold text-gray-900 flex items-center gap-2"><FolderOpen size={16} className="text-emerald-700" /> Add to {folderLabel(folder)}</p>
            <label className="flex items-center gap-3 rounded-xl border border-gray-200 px-4 py-3.5 text-sm font-semibold text-gray-900">
              <Camera size={22} className="text-emerald-700" /> Take a photo
              <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { setOpen(false); pick(e); }} />
            </label>
            <button type="button" onClick={() => setScan(true)} className="flex w-full items-center gap-3 rounded-xl border border-gray-200 px-4 py-3.5 text-left text-sm font-semibold text-gray-900">
              <ScanText size={22} className="text-emerald-700" /> Scan pages to one PDF
            </button>
            <label className="flex items-center gap-3 rounded-xl border border-gray-200 px-4 py-3.5 text-sm font-semibold text-gray-900">
              <FileUp size={22} className="text-emerald-700" /> Choose photos or files from this phone
              <input type="file" multiple className="hidden" onChange={(e) => { setOpen(false); pick(e); }} />
            </label>
          </div>
        </div>
      )}
    </>
  );
}

/**
 * Files shared to KaTuro from another app (Android Share → KaTuro): choose a folder this phone
 * may add to (Lessons first, then the others KaTuroDesk allows, and their folders), then send.
 */
const OLD_DESK = 'Update KaTuroDesk on your computer to 1.18.0 to send files from this phone.';

export function SharedFilesSheet({ client, files, onClose, onSent }) {
  const [folder, setFolder] = useState('');
  const [note, setNote] = useState(''); // when this phone may not add anywhere (or KaTuroDesk is older)
  const [loaded, setLoaded] = useState(false);
  const [folders, setFolders] = useState([]);
  const [busy, setBusy] = useState('');
  const [results, setResults] = useState(null);
  useEffect(() => {
    let alive = true;
    client.list('')
      .then((r) => {
        if (r.access === undefined) throw Object.assign(new Error(OLD_DESK), { oldDesk: true });
        const tops = r.items.filter((i) => i.kind === 'directory' && canAdd(i.access))
          .sort((a, b) => (a.path === 'Lessons' ? -1 : b.path === 'Lessons' ? 1 : 0));
        return Promise.all(tops.map((t) => client.list(t.path)
          .then((sub) => [t.path, ...sub.items.filter((i) => i.kind === 'directory' && canAdd(i.access)).map((i) => i.path)])
          .catch(() => [t.path])));
      })
      .then((lists) => {
        if (!alive) return;
        const all = lists.flat();
        setFolders(all);
        setFolder((f) => f || all[0] || '');
        setLoaded(true);
        if (!all.length) setNote('This phone may not add files to any folder. Change it in KaTuroDesk Settings → Phones.');
      })
      // KaTuroDesk not reachable now: Lessons, kept in the outbox until it is (it checks again then).
      .catch((err) => {
        if (!alive) return;
        setLoaded(true);
        if (err.oldDesk) { setNote(err.message); return; }
        setFolders(['Lessons']);
        setFolder((f) => f || 'Lessons');
      });
    return () => { alive = false; };
  }, [client]);

  const send = async () => {
    const asFiles = files.map((f) => new File([f.bytes], f.name, { type: f.mimeType || '' }));
    setResults(await sendAll(client, folder, asFiles, setBusy));
    onSent?.();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/40">
      <div className="w-full max-h-[85vh] overflow-y-auto rounded-t-2xl bg-white p-4 space-y-3" style={{ paddingBottom: 'max(16px, env(safe-area-inset-bottom))' }}>
        <div className="flex items-center justify-between">
          <p className="text-base font-bold text-gray-900">Send to KaTuroDesk</p>
          <button type="button" onClick={onClose} aria-label="Close" className="p-1"><X size={20} /></button>
        </div>
        <ul className="text-sm text-gray-800 space-y-0.5">{files.map((f) => <li key={f.name} className="truncate">• {f.name} <span className="text-gray-500">({formatBytes(f.bytes.byteLength)})</span></li>)}</ul>
        {!results && (
          <>
            {folders.length > 0 && (
              <>
                <label className="block text-xs font-semibold text-gray-600" htmlFor="kt-share-folder">Folder</label>
                <select id="kt-share-folder" value={folder} onChange={(e) => setFolder(e.target.value)} className="w-full rounded-lg border border-gray-300 p-2.5 text-sm">
                  {folders.map((p) => <option key={p} value={p}>{folderLabel(p)}</option>)}
                </select>
              </>
            )}
            {!loaded && <p className="text-[11px] text-gray-500">Checking which folders KaTuroDesk lets this phone add to…</p>}
            {note && <p className="text-xs text-amber-800">{note}</p>}
            <button type="button" disabled={Boolean(busy) || !folder} onClick={send} className="w-full rounded-xl bg-emerald-700 py-3.5 font-bold text-white disabled:opacity-60">{busy || `Send ${files.length} file${files.length > 1 ? 's' : ''}`}</button>
          </>
        )}
        <Results results={results} />
        {results && <button type="button" onClick={onClose} className="w-full rounded-xl border border-gray-300 py-3 font-semibold">Done</button>}
      </div>
    </div>
  );
}
