import { useEffect, useState } from 'react';
import { FolderInput, FolderOpen } from 'lucide-react';
import { useDeskStore } from '../../store/deskStore';
import { openHomeDirectory } from '../../services/localFileSystem';
import { carryPins } from './explorerPins';

const desk = () => (typeof window !== 'undefined' ? window.katuroDeskApi : undefined);

/** Settings → Documents: where the KaTuro folder (Records and Lessons) is, and moving it. */
export default function DeskHomeFolderSettings() {
  const api = desk();
  const [home, setHome] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!api?.homeInfo) return undefined;
    let alive = true;
    api.homeInfo().then((info) => { if (alive && info?.path) setHome(info.path); }).catch(() => {});
    return () => { alive = false; };
  }, [api]);

  if (!api?.homeInfo) return null;

  const move = async () => {
    setBusy(true);
    setMessage('');
    try {
      const res = await api.moveHomeFolder();
      if (res?.canceled) return;
      if (!res?.ok) { setMessage(res?.error || 'The folder could not be moved.'); return; }
      setHome(res.path);
      carryPins(res.from, res.path);
      setMessage(`Moved to ${res.path}.${res.warning ? ` ${res.warning}` : ''}`);
      // The open folder was the KaTuro folder (or inside it): open it again from its new place.
      const { workspace, setWorkspace } = useDeskStore.getState();
      const was = String(workspace?.rootPath || '').toLowerCase();
      const from = String(res.from || '').toLowerCase();
      if (workspace?.handle?.katuroHome || (from && (was === from || was.startsWith(`${from}\\`)))) {
        const ws = await openHomeDirectory();
        if (ws) setWorkspace({ name: ws.name, handle: ws.handle, files: ws.files, rootPath: ws.rootPath, isVirtual: false });
      }
    } catch (err) {
      setMessage(err?.message || 'The folder could not be moved.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section>
      <h3 className="text-xs font-bold text-gray-800 mb-0.5">KaTuro folder location</h3>
      <p className="text-[11px] text-gray-500 mb-2">
        Your Records and Lessons folders live here. The KaTuro App and your backups use this folder too.
      </p>
      <p className="text-[11px] text-gray-700 bg-gray-50 border border-gray-200 rounded-lg px-2.5 py-1.5 mb-2 break-all" data-testid="home-path">{home || '…'}</p>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => api.showHomeFolder?.()} className="px-3 py-1.5 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-100 text-xs font-semibold flex items-center gap-1.5">
          <FolderOpen size={13} /> Show in File Explorer
        </button>
        <button type="button" onClick={move} disabled={busy} className="px-3 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold disabled:opacity-50 flex items-center gap-1.5">
          <FolderInput size={13} /> {busy ? 'Moving…' : 'Change location…'}
        </button>
      </div>
      <p className="text-[10.5px] text-gray-500 mt-2">Choose a new place and the whole folder moves there with everything in it. Close any open Word or Excel files from it first.</p>
      {message && <p role="status" className="text-[11px] text-gray-700 mt-2">{message}</p>}
    </section>
  );
}
