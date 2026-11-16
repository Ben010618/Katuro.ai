import { useEffect, useState } from 'react';
import { HardDriveDownload, ShieldCheck, Usb } from 'lucide-react';
import { backupAge, backupDue } from '../../services/desk/backup';
import { formatBytes } from '../../utils/bytes';

const desk = () => (typeof window !== 'undefined' ? window.katuroDeskApi : undefined);

const when = (iso) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
};

/** Settings → Backup: a copy of the KaTuro folder on a USB drive or another folder (never the cloud). */
export default function DeskBackupSettings() {
  const api = desk();
  const [last, setLast] = useState(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(null);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!api?.lastBackup) return undefined;
    let alive = true;
    api.lastBackup().then((info) => alive && setLast(info)).catch(() => {});
    const off = api.onBackupProgress?.((p) => setProgress(p));
    return () => { alive = false; off?.(); };
  }, [api]);

  if (!api?.runBackup) return <div className="p-5 text-xs text-gray-600">Backups work in the KaTuroDesk app on your computer.</div>;

  const run = async () => {
    setBusy(true);
    setMessage('');
    setProgress(null);
    try {
      const res = await api.runBackup();
      if (res?.canceled) return;
      if (!res?.ok) { setMessage(res?.error || 'The backup could not be made.'); return; }
      setLast(res);
      window.dispatchEvent(new Event('katuro-backup-done'));
      setMessage(`Backed up ${res.files} files (${formatBytes(res.bytes)}) to ${res.path}.`);
    } catch (err) {
      setMessage(err?.message || 'The backup could not be made.');
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  const due = backupDue(last);
  return (
    <div className="p-5 space-y-5 overflow-y-auto">
      <section>
        <h3 className="text-xs font-bold text-gray-800 mb-0.5 flex items-center gap-1.5"><Usb size={14} className="text-emerald-700" /> Back up your KaTuro folder</h3>
        <p className="text-[11px] text-gray-500 mb-3">
          Copies Records, Lessons and every other folder in your KaTuro folder to a USB drive or another folder you choose. If this computer breaks, your class records are safe on the drive.
        </p>
        <button type="button" onClick={run} disabled={busy} className="px-3 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold disabled:opacity-50">
          {busy ? `Backing up…${progress ? ` ${progress.files} files` : ''}` : 'Back up now to a USB drive or folder'}
        </button>
        {message && <p className="text-[11px] text-gray-700 mt-2">{message}</p>}
      </section>

      <section>
        <h3 className="text-xs font-bold text-gray-800 mb-2 flex items-center gap-1.5"><HardDriveDownload size={14} className="text-emerald-700" /> Last backup</h3>
        {last?.at ? (
          <div className="rounded-lg border border-gray-200 px-3 py-2 text-xs text-gray-700 space-y-0.5">
            <p><span className="font-semibold">{backupAge(last)}</span> · {when(last.at)}</p>
            <p className="truncate" title={last.path}>{last.path}</p>
            <p className="text-gray-500">{last.files} files{last.bytes ? `, ${formatBytes(last.bytes)}` : ''}</p>
          </div>
        ) : <p className="text-[11px] text-gray-500">No backup yet.</p>}
        {due && <p className="text-[11px] text-amber-700 mt-2">It is a good idea to back up at least once a week.</p>}
      </section>

      <section className="rounded-lg bg-[#f6f8f7] p-3 text-[11px] text-gray-600 space-y-1">
        <p className="flex items-center gap-1.5 font-semibold text-gray-700"><ShieldCheck size={13} className="text-emerald-700" /> Stays off the cloud</p>
        <p>The backup is a plain copy on the drive you choose. Nothing is uploaded. Keep the USB drive in a safe place: it holds your learners&apos; records.</p>
        <p>To bring files back, copy them from the backup folder into Documents\KaTuro.</p>
      </section>
    </div>
  );
}
