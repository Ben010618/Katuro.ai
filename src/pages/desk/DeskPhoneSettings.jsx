import { useEffect, useMemo, useState } from 'react';
import qrcode from 'qrcode-generator';
import { Folder, FolderPlus, Smartphone, ShieldCheck, Trash2, Wifi, X } from 'lucide-react';

const desk = () => (typeof window !== 'undefined' ? window.katuroDeskApi : undefined);

function QrImage({ text }) {
  const svg = useMemo(() => {
    const qr = qrcode(0, 'M');
    qr.addData(text);
    qr.make();
    return qr.createSvgTag({ cellSize: 5, margin: 3, scalable: true });
  }, [text]);
  // The SVG comes from our own QR generator (no outside text is inserted as markup).
  return <div className="h-56 w-56 rounded-lg border border-gray-200 bg-white p-1" aria-label="QR code to link the KaTuro App" dangerouslySetInnerHTML={{ __html: svg }} />;
}

const when = (iso) => {
  if (!iso) return 'never';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? 'never' : d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
};

// What a phone may do in a folder (electron/phoneAccess.cjs).
const LEVELS = [
  ['hidden', 'Hidden'],
  ['view', 'View'],
  ['add', 'View & add'],
  ['full', 'Full'],
];

/**
 * What phones can see: a level for each KaTuro folder and each folder added for phones, per
 * phone. KaTuroDesk checks it on every request from the phone.
 */
function PhoneAccess({ api, status, onStatus }) {
  const devices = status?.devices || [];
  const folders = status?.folders || [];
  const [chosen, setChosen] = useState('');
  const [error, setError] = useState('');
  const device = devices.find((d) => d.id === chosen) || devices[0];
  const run = async (fn) => {
    setError('');
    try {
      const next = await fn();
      if (next) onStatus(next);
    } catch (err) {
      setError(String(err?.message || err).replace(/^Error invoking remote method '[^']+': (Error: )?/, ''));
    }
  };
  const add = () => run(async () => (await api.addPhoneFolder())?.status);
  const remove = (f) => {
    if (!window.confirm(`Stop showing "${f.name}" on your phones? The folder stays on this computer.`)) return;
    run(() => api.removePhoneFolder(f.id));
  };

  return (
    <section>
      <h3 className="text-xs font-bold text-gray-800 mb-0.5">What phones can see</h3>
      <p className="text-[11px] text-gray-500 mb-3">Choose what each phone may do in each folder. Scores and attendance always use your prepared class records, whatever is set here.</p>
      {!device ? <p className="text-[11px] text-gray-500">Link a phone first.</p> : (
        <>
          {devices.length > 1 && (
            <label className="mb-2 flex items-center gap-2 text-[11px] text-gray-600">
              For
              <select value={device.id} onChange={(e) => setChosen(e.target.value)} className="!w-auto rounded-md border border-gray-300 px-2 py-1 text-xs">
                {devices.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </label>
          )}
          <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200">
            {folders.map((f) => (
              <li key={f.key} className="flex items-center gap-3 px-3 py-2">
                <Folder size={15} className={f.kind === 'outside' ? 'text-amber-600 flex-shrink-0' : 'text-emerald-700 flex-shrink-0'} />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-gray-800 truncate">{f.name}</p>
                  {f.kind === 'outside' && <p className="text-[10.5px] text-gray-500 truncate" title={f.path}>{f.path}</p>}
                </div>
                <select
                  aria-label={`What ${device.name} may do in ${f.name}`}
                  value={device.levels?.[f.key] || 'view'}
                  onChange={(e) => run(() => api.setPhoneAccess(device.id, f.key, e.target.value))}
                  className="!w-48 flex-none rounded-md border border-gray-300 px-2 py-1 text-xs"
                >
                  {LEVELS.filter(([v]) => LEVELS.findIndex(([x]) => x === v) <= LEVELS.findIndex(([x]) => x === f.max)).map(([v, label]) => <option key={v} value={v}>{label}</option>)}
                </select>
                {f.kind === 'outside' && <button type="button" onClick={() => remove(f)} title={`Stop showing ${f.name}`} className="p-1 rounded text-gray-400 hover:bg-red-50 hover:text-red-600"><X size={14} /></button>}
              </li>
            ))}
          </ul>
          <button type="button" onClick={add} className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-300 text-xs font-semibold text-gray-700 hover:bg-gray-50"><FolderPlus size={14} /> Add a folder from this computer…</button>
          <p className="mt-1 text-[10.5px] text-gray-500">View: open files. View &amp; add: also send photos and files. Full: also rename, move and replace files (a replaced file is saved in KaTuro Backups first).</p>
        </>
      )}
      {error && <p className="text-[11px] text-red-600 mt-2">{error}</p>}
    </section>
  );
}

/** Settings → Phones: link the KaTuro App on the teacher's phone, see and remove linked phones. */
export default function DeskPhoneSettings() {
  const api = desk();
  const [status, setStatus] = useState(null);
  const [qr, setQr] = useState(null); // { qrText, expiresAt }
  const [now, setNow] = useState(() => Date.now());
  const [error, setError] = useState('');

  useEffect(() => {
    if (!api?.linkStatus) return undefined;
    let alive = true;
    api.linkStatus().then((st) => alive && setStatus(st)).catch(() => {});
    const off = api.onLinkChanged((st) => {
      setStatus(st);
      if (!st.pairing) setQr(null); // paired (or cancelled): the QR code is used up
    });
    return () => {
      alive = false;
      off?.();
      api.cancelLinkPhone?.().catch(() => {});
    };
  }, [api]);

  useEffect(() => {
    if (!qr) return undefined;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [qr]);

  if (!api?.linkStatus) return <div className="p-5 text-xs text-gray-600">Linking a phone works in the KaTuroDesk app on your computer.</div>;

  const left = qr ? Math.max(0, Math.round((qr.expiresAt - now) / 1000)) : 0;
  const expired = qr && left === 0;
  const devices = status?.devices || [];

  const showQr = async () => {
    setError('');
    try {
      setQr(await api.linkPhone());
      setNow(Date.now());
    } catch (err) {
      setError(err?.message || 'Could not make a QR code.');
    }
  };
  const remove = async (d) => {
    if (!window.confirm(`Remove ${d.name}? It will no longer see your KaTuro folder. You can link it again any time.`)) return;
    setStatus(await api.removeLinkedPhone(d.id));
  };

  return (
    <div className="p-5 space-y-5 overflow-y-auto">
      <section>
        <h3 className="text-xs font-bold text-gray-800 mb-0.5 flex items-center gap-1.5"><Smartphone size={14} className="text-emerald-700" /> KaTuro App on your phone</h3>
        <p className="text-[11px] text-gray-500 mb-3">
          A linked phone can see the folders you allow below and open their files. It works over the same Wi-Fi or your phone&apos;s hotspot; no internet is needed, and nothing goes to the cloud.
        </p>
        {status && !status.running && <p className="text-[11px] text-amber-700 mb-2">The phone link is not running. Close and reopen KaTuroDesk.</p>}

        {qr && !expired ? (
          <div className="flex flex-col sm:flex-row gap-4 items-start">
            <QrImage text={qr.qrText} />
            <div className="text-xs text-gray-700 space-y-2">
              <ol className="list-decimal pl-4 space-y-1">
                <li>Open the KaTuro App on your phone and sign in.</li>
                <li>Tap <b>Link to KaTuroDesk</b>, then point the camera at this code.</li>
              </ol>
              <p className="text-[11px] text-gray-500">This code links one phone and works for {Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')} more. Show it only to your own phone.</p>
              <button type="button" onClick={() => { api.cancelLinkPhone(); setQr(null); }} className="px-3 py-1.5 rounded-lg border border-gray-300 text-xs font-semibold text-gray-700 hover:bg-gray-50">Cancel</button>
            </div>
          </div>
        ) : (
          <button type="button" onClick={showQr} disabled={status && !status.running} className="px-3 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold disabled:opacity-50">
            {expired ? 'The code expired. Show a new one' : 'Link a phone'}
          </button>
        )}
        {error && <p className="text-[11px] text-red-600 mt-2">{error}</p>}
      </section>

      <section>
        <h3 className="text-xs font-bold text-gray-800 mb-2">Linked phones</h3>
        {devices.length ? (
          <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200">
            {devices.map((d) => (
              <li key={d.id} className="flex items-center gap-3 px-3 py-2">
                <Smartphone size={16} className="text-gray-500 flex-shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-gray-800 truncate">{d.name}</p>
                  <p className="text-[10.5px] text-gray-500">Linked {when(d.pairedAt)} · last seen {when(d.lastSeen)}</p>
                </div>
                <button type="button" onClick={() => remove(d)} title={`Remove ${d.name}`} className="p-1.5 rounded hover:bg-red-50 text-gray-400 hover:text-red-600"><Trash2 size={14} /></button>
              </li>
            ))}
          </ul>
        ) : <p className="text-[11px] text-gray-500">No phone is linked yet.</p>}
      </section>

      <PhoneAccess api={api} status={status} onStatus={setStatus} />

      <section className="rounded-lg bg-[#f6f8f7] p-3 text-[11px] text-gray-600 space-y-1">
        <p className="flex items-center gap-1.5 font-semibold text-gray-700"><ShieldCheck size={13} className="text-emerald-700" /> Private by design</p>
        <p>Everything between your phone and this computer is encrypted with a key only your linked phone has. Others on the same Wi-Fi see only scrambled data.</p>
        {status?.addresses?.length ? <p className="flex items-center gap-1.5"><Wifi size={12} /> This computer: {status.addresses.join(', ')} (port {status.port})</p> : null}
        <p>If Windows asks whether KaTuroDesk may use the network, choose <b>Private networks</b> and <b>Allow</b>.</p>
      </section>
    </div>
  );
}
