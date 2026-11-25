import { Minus, Plus, RotateCcw } from 'lucide-react';
import { useDeskZoom } from './useDeskWindow';

// Settings › Screen size: how big everything in KaTuroDesk looks (remembered on this PC).
const btn = 'inline-flex items-center gap-1 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50';

export default function DeskScreenSettings() {
  const api = typeof window !== 'undefined' ? window.katuroDeskApi : undefined;
  const zoom = useDeskZoom();
  const set = (value) => api?.setZoom?.(value).catch(() => {});
  return (
    <div className="p-5 space-y-4 overflow-y-auto">
      <section>
        <h3 className="text-xs font-bold text-gray-800 mb-0.5">Screen size</h3>
        <p className="text-[11px] text-gray-500 mb-3">Make everything in KaTuroDesk bigger (easier to read) or smaller (more fits on the screen). You can also drag the window's edges to any size.</p>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => set('out')} disabled={zoom <= 0.67} className={btn} aria-label="Smaller"><Minus size={14} /> Smaller</button>
          <span className="min-w-[4rem] text-center text-sm font-bold text-gray-900" aria-live="polite">{Math.round(zoom * 100)}%</span>
          <button type="button" onClick={() => set('in')} disabled={zoom >= 2} className={btn} aria-label="Bigger"><Plus size={14} /> Bigger</button>
          <button type="button" onClick={() => set('reset')} disabled={zoom === 1} className={btn}><RotateCcw size={14} /> 100%</button>
        </div>
        <p className="text-[11px] text-gray-500 mt-3">Shortcuts: <b>Ctrl +</b> bigger, <b>Ctrl −</b> smaller, <b>Ctrl 0</b> back to 100%, or hold <b>Ctrl</b> and turn the mouse wheel.</p>
      </section>
    </div>
  );
}
