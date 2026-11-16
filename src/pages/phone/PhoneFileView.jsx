import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, FileUp, FolderInput, HardDriveDownload, Loader2, MoreHorizontal, Pencil, X } from 'lucide-react';
import { keepFile, keptFile, forgetKept, folderLabel } from '../../services/link/phoneFiles';
import { bytesToBase64 } from '../../utils/bytes';
import { readDocument, loadPdfjs } from '../../services/desk/readers/index.js';

const IMAGE = /\.(png|jpe?g|webp|gif|bmp)$/i;
const MAX_PDF_PAGES = 40;
const MAX_ROWS = 400;

function PdfPages({ bytes }) {
  const box = useRef(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let cancelled = false;
    let doc = null;
    (async () => {
      try {
        const pdfjs = await loadPdfjs();
        doc = await pdfjs.getDocument({ data: bytes.slice() }).promise;
        if (cancelled) { doc.destroy(); return; }
        const width = Math.max(320, box.current?.clientWidth || 360);
        for (let i = 1; i <= Math.min(doc.numPages, MAX_PDF_PAGES) && !cancelled; i++) {
          const page = await doc.getPage(i);
          const base = page.getViewport({ scale: 1 });
          const scale = (width / base.width) * Math.min(2, window.devicePixelRatio || 1);
          const vp = page.getViewport({ scale });
          const canvas = document.createElement('canvas');
          canvas.width = vp.width;
          canvas.height = vp.height;
          canvas.className = 'w-full h-auto bg-white shadow mb-3';
          await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
          if (!cancelled) box.current?.appendChild(canvas);
        }
        if (doc.numPages > MAX_PDF_PAGES && !cancelled) setError(`Showing the first ${MAX_PDF_PAGES} of ${doc.numPages} pages. Open it on KaTuroDesk for the rest.`);
      } catch {
        if (!cancelled) setError('This PDF could not be shown on the phone. Open it on KaTuroDesk.');
      }
    })();
    // Frees the pdf.js document (worker, data, page caches) when the viewer closes.
    return () => { cancelled = true; doc?.destroy(); };
  }, [bytes]);
  return (
    <div>
      <div ref={box} />
      {error && <p className="text-xs text-gray-600 p-2">{error}</p>}
    </div>
  );
}

function SheetView({ sheets }) {
  const [i, setI] = useState(0);
  const sheet = sheets[i] || sheets[0];
  const rows = (sheet?.rows || []).slice(0, MAX_ROWS);
  return (
    <div>
      {sheets.length > 1 && (
        <div className="flex gap-1 overflow-x-auto pb-2">
          {sheets.map((s, n) => (
            <button key={s.name} type="button" onClick={() => setI(n)} className={`whitespace-nowrap rounded-full px-3 py-1 text-xs font-semibold ${n === i ? 'bg-emerald-700 text-white' : 'bg-white text-gray-700 border border-gray-200'}`}>{s.name}</button>
          ))}
        </div>
      )}
      <div className="overflow-auto rounded-lg border border-gray-200 bg-white">
        <table className="text-[11px] border-collapse">
          <tbody>
            {rows.map((r, ri) => (
              <tr key={ri} className={ri % 2 ? 'bg-gray-50' : ''}>
                {r.map((v, ci) => <td key={ci} className="border border-gray-100 px-1.5 py-0.5 whitespace-nowrap">{v === null || v === undefined ? '' : String(v)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {(sheet?.rows?.length || 0) > MAX_ROWS && <p className="text-xs text-gray-600 mt-2">Showing the first {MAX_ROWS} rows.</p>}
    </div>
  );
}

/**
 * Rename, move or replace a file, in a folder where KaTuroDesk gives this phone "Full" access
 * (it checks again, and saves a replaced file in KaTuro Backups first). → onDone(note)
 */
function FileActions({ entry, client, file, kept, onClose, onDone }) {
  const [mode, setMode] = useState('menu'); // menu | rename | move
  const ext = (entry.name.match(/\.[^.]+$/) || [''])[0];
  const [name, setName] = useState(entry.name.slice(0, entry.name.length - ext.length));
  const [folders, setFolders] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const here = entry.path.split('/').slice(0, -1).join('/');

  useEffect(() => {
    if (mode !== 'move') return undefined;
    let alive = true;
    const top = entry.path.split('/')[0];
    const dirs = (r) => r.items.filter((i) => i.kind === 'directory' && i.access === 'full').map((i) => i.path);
    client.list(top)
      .then(async (r) => {
        const below = await Promise.all(dirs(r).map((p) => client.list(p).then((s) => [p, ...dirs(s)]).catch(() => [p])));
        if (alive) setFolders([top, ...below.flat()].filter((p) => p !== here));
      })
      .catch((err) => alive && setError(err.message));
    return () => { alive = false; };
  }, [mode, client, entry.path, here]);

  // A kept copy follows the file to its new name or place.
  const follow = async (newPath, newName, bytes = file?.bytes) => {
    if (!kept || !bytes) return;
    // The old copy goes only once the new one is saved (a full phone keeps the old one).
    const saved = await keepFile(newPath, { name: newName, size: bytes.byteLength, bytes }).then(() => true, () => false);
    if (saved && newPath !== entry.path) await forgetKept(entry.path).catch(() => {});
  };
  const run = async (fn) => {
    setBusy(true);
    setError('');
    try {
      onDone(await fn());
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };
  const rename = () => run(async () => {
    const res = await client.request('rename', { path: entry.path, name: `${name.trim()}${ext}` });
    await follow(res.path, res.name);
    return `Renamed to ${res.name}.`;
  });
  const moveTo = (to) => run(async () => {
    const res = await client.request('move', { path: entry.path, to });
    await follow(res.path, entry.name);
    return `Moved to ${folderLabel(to)}.`;
  });
  const replace = (e) => {
    const picked = e.target.files?.[0];
    e.target.value = '';
    if (!picked) return;
    run(async () => {
      const bytes = new Uint8Array(await picked.arrayBuffer());
      const res = await client.request('replace', { path: entry.path, name: picked.name, data: bytesToBase64(bytes) });
      await follow(entry.path, entry.name, bytes);
      return `Replaced. The old one is in ${folderLabel(res.backup.split('/').slice(0, 2).join('/'))}.`;
    });
  };

  const row = 'nm-press flex w-full items-center gap-4 rounded-2xl px-4 py-4 text-left text-[15px] font-medium disabled:opacity-50';
  return (
    <div className="fixed inset-0 z-[55] flex items-end bg-black/30" onClick={busy ? undefined : onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full rounded-t-2xl bg-white px-4 pt-3 space-y-1" style={{ paddingBottom: 'max(20px, env(safe-area-inset-bottom))' }}>
        <div className="flex items-center justify-between pb-1">
          <p className="truncate text-sm font-semibold">{entry.name}</p>
          <button type="button" onClick={onClose} disabled={busy} aria-label="Close" className="p-1"><X size={20} /></button>
        </div>
        {mode === 'menu' && (
          <>
            <button type="button" onClick={() => setMode('rename')} disabled={busy} className={row}><Pencil size={20} className="nm-green" /> Rename</button>
            <button type="button" onClick={() => setMode('move')} disabled={busy} className={row}><FolderInput size={20} className="nm-green" /> Move</button>
            <label className={row}>
              <FileUp size={20} className="nm-green" /> Replace with a file from this phone
              <input type="file" accept={ext} className="hidden" disabled={busy} onChange={replace} />
            </label>
            <p className="nm-muted px-4 pt-1 text-[11px]">A replaced file is saved in KaTuro Backups first.</p>
          </>
        )}
        {mode === 'rename' && (
          <div className="space-y-3 pt-1">
            <label className="block text-xs font-medium" htmlFor="kt-rename">New name</label>
            <div className="flex items-center gap-2">
              <input id="kt-rename" value={name} onChange={(e) => setName(e.target.value)} className="flex-1 rounded-2xl px-4 py-3 text-base" />
              <span className="nm-muted text-sm">{ext}</span>
            </div>
            <button type="button" onClick={rename} disabled={busy || !name.trim()} className="w-full rounded-2xl bg-emerald-700 py-3.5 font-semibold text-white disabled:opacity-50">{busy ? 'Renaming…' : 'Rename'}</button>
          </div>
        )}
        {mode === 'move' && (
          <div className="space-y-2 pt-1">
            <p className="text-xs font-medium">Move to</p>
            {!folders && !error && <p className="nm-muted flex items-center gap-2 text-sm"><Loader2 size={16} className="animate-spin" /> Finding folders…</p>}
            {folders && !folders.length && <p className="nm-muted text-sm">No other folder here that this phone may change.</p>}
            <ul className="max-h-[50vh] space-y-2 overflow-y-auto">
              {folders?.map((p) => (
                <li key={p}><button type="button" disabled={busy} onClick={() => moveTo(p)} className="w-full rounded-xl bg-white px-4 py-3 text-left text-sm shadow-sm disabled:opacity-50">{folderLabel(p)}</button></li>
              ))}
            </ul>
          </div>
        )}
        {busy && mode === 'menu' && <p className="nm-muted flex items-center gap-2 px-4 text-sm"><Loader2 size={16} className="animate-spin" /> Working on KaTuroDesk…</p>}
        {error && <p className="px-1 text-sm text-red-700">{error}</p>}
      </div>
    </div>
  );
}

/**
 * Opens one file from KaTuroDesk on the phone. "Keep on phone" saves a copy that opens
 * without KaTuroDesk; when KaTuroDesk can't be reached the kept copy is used. In a folder with
 * "Full" access, ⋯ renames, moves or replaces the file. → onChanged(note) after one of those.
 */
export default function PhoneFileView({ entry, client, onBack, onKeptChange, onChanged }) {
  const [actions, setActions] = useState(false);
  const [state, setState] = useState({ loading: true });
  const [file, setFile] = useState(null); // { bytes, size, fromPhone }
  const [kept, setKept] = useState(false);
  const [keepNote, setKeepNote] = useState('');

  useEffect(() => {
    let alive = true;
    let url = null;
    (async () => {
      try {
        const copy = await keptFile(entry.path).catch(() => null);
        if (alive) setKept(Boolean(copy));
        let file;
        try {
          file = await client.read(entry.path);
          // A kept copy is refreshed whenever the file is opened from KaTuroDesk.
          if (copy) keepFile(entry.path, { name: entry.name, size: file.size, bytes: file.bytes }).catch(() => {});
        } catch (err) {
          if (!copy || (err.code !== 'UNREACHABLE' && err.code !== 'DESK_STARTING')) throw err;
          file = { bytes: copy.bytes, size: copy.size, fromPhone: true };
        }
        if (!alive) return;
        setFile(file);
        if (IMAGE.test(entry.name)) {
          url = URL.createObjectURL(new Blob([file.bytes]));
          setState({ image: url });
        } else if (/\.pdf$/i.test(entry.name)) {
          setState({ pdf: file.bytes });
        } else {
          const parsed = await readDocument({ bytes: file.bytes, name: entry.name });
          if (!alive) return;
          if (parsed.sheets?.length) setState({ sheets: parsed.sheets });
          else if (parsed.text) setState({ text: parsed.text });
          else setState({ error: parsed.warnings?.[0] || 'This file cannot be shown on the phone yet. Open it on KaTuroDesk.' });
        }
      } catch (err) {
        if (alive) setState({ error: err.message });
      }
    })();
    return () => {
      alive = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [entry, client]);

  return (
    <div className="min-h-full">
      <div className="sticky top-0 z-10 flex items-center gap-2 bg-[#eef2ef] px-3 py-2 border-b border-gray-200">
        <button type="button" onClick={onBack} aria-label="Back" className="p-2 -ml-2"><ArrowLeft size={20} /></button>
        <p className="text-sm font-semibold text-gray-900 truncate flex-1">{entry.name}</p>
        {entry.access === 'full' && file && !file.fromPhone && (
          <button type="button" onClick={() => setActions(true)} aria-label="Rename, move or replace" className="p-2"><MoreHorizontal size={20} /></button>
        )}
        {file && (
          <button
            type="button"
            onClick={async () => {
              try {
                if (kept) { await forgetKept(entry.path); setKept(false); setKeepNote('Removed from this phone.'); }
                else { await keepFile(entry.path, { name: entry.name, size: file.size, bytes: file.bytes }); setKept(true); setKeepNote('Kept on this phone: it opens even without KaTuroDesk.'); }
                onKeptChange?.();
              } catch (err) { setKeepNote(err.message); }
            }}
            className={`flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-semibold ${kept ? 'bg-emerald-700 text-white' : 'border border-emerald-300 bg-white text-emerald-800'}`}
          >
            <HardDriveDownload size={14} /> {kept ? 'On this phone' : 'Keep on phone'}
          </button>
        )}
      </div>
      {actions && (
        <FileActions
          entry={entry}
          client={client}
          file={file}
          kept={kept}
          onClose={() => setActions(false)}
          onDone={(note) => { setActions(false); onChanged?.(note); }}
        />
      )}
      <div className="p-3">
        {keepNote && <p className="mb-2 text-xs text-emerald-800">{keepNote}</p>}
        {file?.fromPhone && <p className="mb-2 rounded-lg bg-amber-50 border border-amber-200 p-2 text-xs text-amber-900">KaTuroDesk can't be reached, so this is the copy kept on this phone.</p>}
        {state.loading && <p className="flex items-center gap-2 text-sm text-gray-600"><Loader2 size={16} className="animate-spin" /> Opening from KaTuroDesk…</p>}
        {state.error && <p className="text-sm text-red-700">{state.error}</p>}
        {state.image && <img src={state.image} alt={entry.name} className="w-full h-auto rounded-lg" />}
        {state.pdf && <PdfPages bytes={state.pdf} />}
        {state.sheets && <SheetView sheets={state.sheets} />}
        {state.text && <div className="whitespace-pre-wrap text-sm leading-relaxed bg-white rounded-lg border border-gray-200 p-3">{state.text}</div>}
      </div>
    </div>
  );
}
