import { useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { PAPER_SIZES, MARGIN_PRESETS, FONTS, getDefaultPaper } from '../../services/desk/docSpec';
import { runChatTurn } from './runChatTurn';

const sel = 'border border-gray-300 rounded bg-white px-1 py-0.5 text-[11px]';

/**
 * Page setup for the teacher's OWN Word file: paper, margins, one font and text size.
 * Runs the "format to DepEd" tool on a working copy; the original is backed up, never changed.
 */
export default function DeskWordPageSetup({ path }) {
  const { user, profile } = useAuth();
  const [paper, setPaper] = useState(getDefaultPaper());
  const [margins, setMargins] = useState('katuro');
  const [font, setFont] = useState('');
  const [size, setSize] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const apply = async () => {
    setBusy(true);
    setError('');
    const m = MARGIN_PRESETS[margins];
    try {
      await runChatTurn({
        text: `Page setup for ${path.split('/').pop()}: ${PAPER_SIZES[paper].label}, margins ${m.label}${font ? `, ${font}` : ''}${size ? ` ${size} pt` : ''}`,
        attachments: [path],
        user,
        profile,
        confirmedPlan: { reply: '', tasks: [{ id: 't1', tool: 'deped_format_docx', label: 'Page setup', args: { path, paper, margins: { top: m.top, bottom: m.bottom, left: m.left, right: m.right }, ...(font ? { font } : {}), ...(size ? { size: Number(size) } : {}) } }] },
      });
    } catch (err) {
      setError(err?.message || 'The page setup could not be applied.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <details className="rounded-lg border border-gray-200 bg-white p-2 text-[11px] text-gray-700">
      <summary className="cursor-pointer font-semibold">Page setup for this Word file</summary>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <select value={paper} onChange={(e) => setPaper(e.target.value)} className={sel} title="Paper">
          {Object.entries(PAPER_SIZES).map(([k, p]) => <option key={k} value={k}>{p.label}</option>)}
        </select>
        <select value={margins} onChange={(e) => setMargins(e.target.value)} className={sel} title="Margins">
          {Object.entries(MARGIN_PRESETS).map(([k, p]) => <option key={k} value={k}>Margins: {p.label}</option>)}
        </select>
        <select value={font} onChange={(e) => setFont(e.target.value)} className={sel} title="Font">
          <option value="">Font: Arial (KaTuro)</option>
          {FONTS.map((f) => <option key={f} value={f}>{f}</option>)}
        </select>
        <select value={size} onChange={(e) => setSize(e.target.value)} className={sel} title="Body text size">
          <option value="">Text size: keep</option>
          {[10, 11, 12, 13, 14].map((v) => <option key={v} value={v}>{v} pt</option>)}
        </select>
        <button type="button" onClick={apply} disabled={busy} className="rounded bg-[#2d6a4f] px-2.5 py-1 font-semibold text-white hover:bg-[#235841] disabled:opacity-40">{busy ? 'Working…' : 'Make a formatted copy'}</button>
      </div>
      <p className="mt-1.5 flex items-center gap-1 text-[10.5px] text-gray-500"><ShieldCheck size={11} /> Saved as a "(KaTuro edit)" copy; your original is backed up and not changed. The words stay the same.</p>
      {error && <p className="mt-1 text-red-700" role="alert">{error}</p>}
    </details>
  );
}
