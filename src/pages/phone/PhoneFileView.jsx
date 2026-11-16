import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { readDocument, loadPdfjs } from '../../services/desk/readers/index.js';

const IMAGE = /\.(png|jpe?g|webp|gif|bmp)$/i;
const MAX_PDF_PAGES = 40;
const MAX_ROWS = 400;

function PdfPages({ bytes }) {
  const box = useRef(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const pdfjs = await loadPdfjs();
        const doc = await pdfjs.getDocument({ data: bytes.slice() }).promise;
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
    return () => { cancelled = true; };
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

/** Opens one file from the KaTuro folder on the phone (read only). */
export default function PhoneFileView({ entry, client, onBack }) {
  const [state, setState] = useState({ loading: true });

  useEffect(() => {
    let alive = true;
    let url = null;
    (async () => {
      try {
        const file = await client.read(entry.path);
        if (!alive) return;
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
        <p className="text-sm font-semibold text-gray-900 truncate">{entry.name}</p>
      </div>
      <div className="p-3">
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
