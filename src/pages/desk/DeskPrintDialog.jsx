import { useEffect, useMemo, useState } from 'react';
import { Loader2, X, AlertTriangle } from 'lucide-react';
import { PAPER_SIZES } from '../../services/desk/docSpec';
import { buildHtml } from '../../services/desk/generators/htmlFromSpec';
import { parsePageRanges, specForPrint, portraitPaperInches, pickPrinter } from '../../services/desk/print/printOptions';

const desk = () => (typeof window !== 'undefined' ? window.katuroDeskApi : undefined);
const label = 'text-[10.5px] font-semibold uppercase tracking-wide text-gray-500';
const box = { padding: '4px 6px', fontSize: 12, borderRadius: 6 };
const seg = (on) => `rounded-md border px-2.5 py-1 text-[11px] font-medium ${on ? 'border-emerald-600 bg-emerald-50 text-emerald-900' : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'}`;

/**
 * KaTuroDesk's own Print panel for a document: the printers installed in Windows (default
 * marked, offline ones flagged), paper, orientation, copies, pages, color and two-sided.
 * What prints is the same page as the preview and the saved PDF.
 */
export default function DeskPrintDialog({ spec, onClose }) {
  const [printers, setPrinters] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [printer, setPrinter] = useState('');
  const [paper, setPaper] = useState(spec.paper);
  const [orientation, setOrientation] = useState(spec.orientation);
  const [copies, setCopies] = useState(1);
  const [pages, setPages] = useState('');
  const [color, setColor] = useState(true);
  const [duplex, setDuplex] = useState('off');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);

  useEffect(() => {
    let alive = true;
    desk().listPrinters()
      .then((list) => {
        if (!alive) return;
        setPrinters(list);
        setPrinter(pickPrinter(list));
      })
      .catch((err) => { if (alive) { setPrinters([]); setLoadError(err?.message || 'The printers could not be listed.'); } });
    return () => { alive = false; };
  }, []);

  const chosen = printers?.find((p) => p.name === printer) || null;
  const range = parsePageRanges(pages);
  const changedLayout = paper !== spec.paper || orientation !== spec.orientation;
  const printSpec = useMemo(() => specForPrint(spec, { paper, orientation }), [spec, paper, orientation]);

  const send = async (dialog) => {
    if (range.error) return;
    setBusy(true);
    setResult(null);
    try {
      const res = await desk().printDocument(buildHtml(printSpec, { forPrint: true }), {
        dialog,
        deviceName: printer,
        copies,
        pageRanges: range.ranges,
        color,
        duplex,
        landscape: printSpec.orientation === 'landscape',
        pageSizeInches: portraitPaperInches(printSpec.paper),
      });
      setResult(res.success
        ? { ok: true, text: dialog ? 'Sent to the printer from the Windows print window.' : `Sent to ${chosen?.displayName || printer}. ${copies > 1 ? `${copies} copies. ` : ''}Check the printer for the pages.` }
        : { ok: false, text: /cancel/i.test(res.reason) ? 'Printing was cancelled.' : `The printer did not take the job${res.reason ? ` (${res.reason})` : ''}. Check that it is on and connected, then try again.` });
    } catch (err) {
      setResult({ ok: false, text: err?.message || 'Printing failed.' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-3" role="dialog" aria-modal="true" aria-label="Print">
      <div className="w-full max-w-md space-y-3 rounded-xl bg-white p-4 text-xs text-gray-800 shadow-xl">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-gray-900">Print</h2>
          <button type="button" onClick={onClose} className="rounded p-1 text-gray-500 hover:bg-gray-100" aria-label="Close"><X size={14} /></button>
        </div>

        <label className="block space-y-1">
          <span className={label}>Printer</span>
          {printers === null ? (
            <span className="flex items-center gap-1.5 text-[11px] text-gray-500"><Loader2 size={12} className="animate-spin" /> Finding the printers on this computer…</span>
          ) : printers.length ? (
            <select value={printer} onChange={(e) => setPrinter(e.target.value)} className="w-full border border-gray-300 bg-white" style={box}>
              {printers.map((p) => (
                <option key={p.name} value={p.name}>{p.displayName}{p.isDefault ? ' (default)' : ''}{p.problem ? ` - ${p.problem}` : ''}{p.savesFile ? ' - saves a file' : ''}</option>
              ))}
            </select>
          ) : (
            <span className="block text-[11px] text-amber-800">{loadError || 'No printer is installed on this computer. Add one in Windows Settings > Bluetooth & devices > Printers & scanners. You can still choose Microsoft Print to PDF there, or open the PDF file.'}</span>
          )}
        </label>
        {chosen?.problem && (
          <p className="flex items-start gap-1 rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5 text-[11px] text-amber-900">
            <AlertTriangle size={12} className="mt-0.5 flex-shrink-0" /> Windows reports this printer as: {chosen.problem}. Turn it on and connect it (USB, Wi-Fi), or choose another printer.
          </p>
        )}

        <div className="grid grid-cols-2 gap-2">
          <label className="space-y-1">
            <span className={label}>Paper</span>
            <select value={paper} onChange={(e) => setPaper(e.target.value)} className="w-full border border-gray-300 bg-white" style={box}>
              {Object.entries(PAPER_SIZES).map(([k, p]) => <option key={k} value={k}>{p.label}</option>)}
            </select>
          </label>
          <div className="space-y-1">
            <span className={label}>Orientation</span>
            <div className="flex gap-1">
              {[['portrait', 'Portrait'], ['landscape', 'Landscape']].map(([k, t]) => <button key={k} type="button" onClick={() => setOrientation(k)} className={seg(orientation === k)}>{t}</button>)}
            </div>
          </div>
          <label className="space-y-1">
            <span className={label}>Copies</span>
            <input type="number" min="1" max="99" value={copies} onChange={(e) => setCopies(Math.min(99, Math.max(1, Math.floor(Number(e.target.value) || 1))))} className="w-full border border-gray-300" style={box} />
          </label>
          <label className="space-y-1">
            <span className={label}>Pages</span>
            <input value={pages} onChange={(e) => setPages(e.target.value)} placeholder="All, or e.g. 1-3, 5" className={`w-full border ${range.error ? 'border-red-500' : 'border-gray-300'}`} style={box} />
          </label>
          <div className="space-y-1">
            <span className={label}>Color</span>
            <div className="flex gap-1">
              <button type="button" onClick={() => setColor(true)} className={seg(color)}>Color</button>
              <button type="button" onClick={() => setColor(false)} className={seg(!color)}>Black and white</button>
            </div>
          </div>
          <label className="space-y-1">
            <span className={label}>Two-sided</span>
            <select value={duplex} onChange={(e) => setDuplex(e.target.value)} className="w-full border border-gray-300 bg-white" style={box}>
              <option value="off">One side only</option>
              <option value="long">Both sides (book style)</option>
              <option value="short">Both sides (flip up)</option>
            </select>
          </label>
        </div>
        {range.error && <p className="text-[11px] text-red-700">{range.error}</p>}
        <p className="text-[11px] text-gray-600">
          Load <span className="font-semibold">{PAPER_SIZES[paper].label}</span> paper in the printer.
          {changedLayout && ' The document is laid out again for this paper and orientation; your saved files do not change.'}
          {duplex !== 'off' && ' Two-sided printing works only if the printer can do it by itself.'}
        </p>

        {result && <p className={`rounded-md px-2 py-1.5 text-[11px] ${result.ok ? 'bg-emerald-50 text-emerald-900' : 'bg-red-50 text-red-800'}`} role="status">{result.text}</p>}

        <div className="flex flex-wrap items-center gap-2 pt-1">
          <button type="button" onClick={() => send(false)} disabled={busy || !printer || Boolean(range.error)} className="rounded-lg bg-[#2d6a4f] px-4 py-1.5 text-[11px] font-semibold text-white hover:bg-[#235841] disabled:opacity-40">
            {busy ? 'Sending…' : 'Print'}
          </button>
          <button type="button" onClick={() => send(true)} disabled={busy || Boolean(range.error)} className="rounded-lg border border-gray-300 px-3 py-1.5 text-[11px] font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40">Use the Windows print window</button>
          <button type="button" onClick={onClose} className="ml-auto rounded-lg px-3 py-1.5 text-[11px] text-gray-600 hover:bg-gray-100">Close</button>
        </div>
      </div>
    </div>
  );
}
