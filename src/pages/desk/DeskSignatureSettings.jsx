import { useRef, useState } from 'react';
import { Upload, PenLine, Trash2, Check } from 'lucide-react';
import { useDeskStore } from '../../store/deskStore';
import { prepareSignatureImage } from '../../services/desk/signature';

const btn = 'flex items-center gap-1 px-2.5 py-1 rounded-lg border border-gray-300 text-[11px] font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50';

/**
 * Settings > E-signature: the teacher's own signature for "sign this document".
 * A photo of the signature (paper made transparent, cropped) or one drawn here.
 * Saved only on this computer.
 */
export default function DeskSignatureSettings() {
  const { eSignature, setESignature } = useDeskStore();
  const [mode, setMode] = useState('view');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const canvasRef = useRef(null);
  const drawing = useRef(null);
  const [hasInk, setHasInk] = useState(false);

  const clearDrawing = () => {
    const c = canvasRef.current;
    if (c) c.getContext('2d').clearRect(0, 0, c.width, c.height);
    setHasInk(false);
  };

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError('');
    if (!/^image\/(png|jpe?g)$/.test(file.type)) { setError('Please choose a PNG or JPG picture of your signature.'); return; }
    setBusy(true);
    try {
      setESignature(await prepareSignatureImage(file));
      setMode('view');
    } catch (err) {
      setError(err?.message || 'Could not read that picture.');
    } finally {
      setBusy(false);
    }
  };

  const point = (e) => {
    const r = canvasRef.current.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * canvasRef.current.width, y: ((e.clientY - r.top) / r.height) * canvasRef.current.height };
  };
  const down = (e) => { canvasRef.current.setPointerCapture?.(e.pointerId); drawing.current = point(e); };
  const move = (e) => {
    if (!drawing.current) return;
    const g = canvasRef.current.getContext('2d');
    const p = point(e);
    g.strokeStyle = '#1b2a6b';
    g.lineWidth = 3;
    g.lineCap = 'round';
    g.lineJoin = 'round';
    g.beginPath();
    g.moveTo(drawing.current.x, drawing.current.y);
    g.lineTo(p.x, p.y);
    g.stroke();
    drawing.current = p;
    setHasInk(true);
  };
  const up = () => { drawing.current = null; };

  const saveDrawing = async () => {
    setError('');
    setBusy(true);
    try {
      setESignature(await prepareSignatureImage(canvasRef.current));
      setMode('view');
    } catch (err) {
      setError(err?.message || 'Could not save the drawing.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="p-5 space-y-4 overflow-y-auto">
      <section className="space-y-2">
        <h3 className="text-xs font-bold text-gray-800">My e-signature</h3>
        <p className="text-[11px] text-gray-500">
          Used when you ask KaTuroDesk to sign a Word or PDF file. It is placed only above your own name (from My profile), and KaTuroDesk asks you before every signing. It is saved only on this computer and never uploaded.
        </p>
        {mode === 'draw' ? (
          <div className="space-y-2">
            <canvas
              ref={canvasRef}
              width={600}
              height={200}
              onPointerDown={down}
              onPointerMove={move}
              onPointerUp={up}
              onPointerLeave={up}
              aria-label="Signature drawing area"
              className="w-full max-w-[480px] h-40 rounded-lg border border-gray-300 bg-white touch-none cursor-crosshair"
            />
            <div className="flex gap-2">
              <button type="button" className={btn} disabled={!hasInk || busy} onClick={saveDrawing}><Check size={12} /> Save signature</button>
              <button type="button" className={btn} disabled={!hasInk} onClick={clearDrawing}>Clear</button>
              <button type="button" className={btn} onClick={() => setMode('view')}>Cancel</button>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="w-full max-w-[480px] h-32 rounded-lg border border-gray-200 bg-white flex items-center justify-center">
              {eSignature ? <img src={eSignature} alt="Your saved e-signature" className="max-h-28 max-w-full object-contain" /> : <span className="text-[11px] text-gray-500">No e-signature saved yet.</span>}
            </div>
            <div className="flex flex-wrap gap-2">
              <label className={`${btn} cursor-pointer`}>
                <Upload size={12} /> {busy ? 'Reading…' : 'Upload a photo'}
                <input type="file" accept="image/png,image/jpeg" className="hidden" onChange={onFile} disabled={busy} />
              </label>
              <button type="button" className={btn} onClick={() => { setHasInk(false); setMode('draw'); }}><PenLine size={12} /> Draw it</button>
              {eSignature && <button type="button" className={btn} onClick={() => setESignature(null)}><Trash2 size={12} /> Remove</button>}
            </div>
            <p className="text-[11px] text-gray-500">For a photo: sign in dark ink on plain white paper, take the photo straight on, then upload it. The white paper is removed automatically.</p>
          </div>
        )}
        {error && <p className="text-[11px] text-red-600">{error}</p>}
      </section>
    </div>
  );
}
