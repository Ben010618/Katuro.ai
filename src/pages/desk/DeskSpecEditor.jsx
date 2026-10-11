import { useState } from 'react';
import {
  Plus, Trash2, ArrowUp, ArrowDown, AlignLeft, AlignCenter, AlignRight, AlignJustify, IndentIncrease, IndentDecrease, Bold, Italic, Underline, X,
} from 'lucide-react';
import { PAPER_SIZES, MARGIN_PRESETS, FONTS, DEFAULT_FONT, LINE_SPACINGS } from '../../services/desk/docSpec';
import { setBlockStyle, shiftIndent, marginPresetOf, setMargins, setPage, setFont, insertBlock, addColumn, deleteColumn, findReplace, countMatches } from '../../services/desk/specEdits';

/**
 * Block editor for a generated DocumentSpec. Teachers edit text directly;
 * saving re-renders the .docx/.pdf from the edited spec, so formatting stays official.
 */

const inputCls = 'w-full bg-white border border-gray-300 rounded px-2 py-1 text-xs focus:outline-none focus:border-emerald-600';

function linesToItems(text) {
  return text.split('\n').map((s) => s.trimEnd()).filter((s) => s.trim());
}

function BlockEditor({ block, onChange }) {
  switch (block.type) {
    case 'heading':
      return (
        <div className="flex gap-2">
          <select value={block.level} onChange={(e) => onChange({ ...block, level: Number(e.target.value) })} className="border border-gray-300 rounded text-xs px-1">
            <option value={1}>H1</option>
            <option value={2}>H2</option>
            <option value={3}>H3</option>
          </select>
          <input value={block.text} onChange={(e) => onChange({ ...block, text: e.target.value })} className={`${inputCls} font-bold`} />
        </div>
      );
    case 'paragraph':
      return <textarea rows={Math.min(8, Math.max(2, Math.ceil(block.text.length / 70)))} value={block.text} onChange={(e) => onChange({ ...block, text: e.target.value })} className={inputCls} />;
    case 'bullets':
      return (
        <div>
          <label className="text-[10px] text-gray-500 flex items-center gap-1 mb-0.5">
            <input type="checkbox" checked={block.ordered} onChange={(e) => onChange({ ...block, ordered: e.target.checked })} /> Numbered list · one item per line
          </label>
          <textarea rows={Math.min(10, block.items.length + 1)} value={block.items.join('\n')} onChange={(e) => onChange({ ...block, items: linesToItems(e.target.value) })} className={inputCls} />
        </div>
      );
    case 'table':
      return (
        <div className="overflow-x-auto">
          <table className="text-[11px] border-collapse w-full">
            <thead>
              <tr>
                {block.columns.map((c, ci) => (
                  <th key={ci} className="border border-gray-300 bg-gray-50 p-0">
                    <div className="flex items-center">
                      <input
                        value={c}
                        onChange={(e) => onChange({ ...block, columns: block.columns.map((x, i) => (i === ci ? e.target.value : x)) })}
                        className="w-full min-w-[70px] px-1 py-0.5 bg-transparent font-semibold focus:outline-none focus:bg-white"
                      />
                      {block.columns.length > 1 && (
                        <button onClick={() => onChange(deleteColumn(block, ci))} className="p-0.5 text-gray-300 hover:text-red-600" title="Delete this column">
                          <X size={10} />
                        </button>
                      )}
                    </div>
                  </th>
                ))}
                <th className="w-6" />
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, ri) => (
                <tr key={ri}>
                  {row.map((cell, ci) => (
                    <td key={ci} className="border border-gray-300 p-0 align-top">
                      <textarea
                        rows={Math.min(4, Math.max(1, Math.ceil(cell.length / 28)))}
                        value={cell}
                        onChange={(e) => onChange({ ...block, rows: block.rows.map((r, i) => (i === ri ? r.map((x, j) => (j === ci ? e.target.value : x)) : r)) })}
                        className="w-full min-w-[70px] px-1 py-0.5 bg-transparent resize-y focus:outline-none focus:bg-emerald-50"
                      />
                    </td>
                  ))}
                  <td>
                    <button onClick={() => onChange({ ...block, rows: block.rows.filter((_, i) => i !== ri) })} className="p-0.5 text-gray-400 hover:text-red-600" title="Delete row">
                      <Trash2 size={11} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-1 flex gap-3">
            <button onClick={() => onChange({ ...block, rows: [...block.rows, block.columns.map(() => '')] })} className="text-[10.5px] text-emerald-700 hover:underline flex items-center gap-0.5">
              <Plus size={10} /> Add row
            </button>
            <button onClick={() => onChange(addColumn(block))} disabled={block.columns.length >= 12} className="text-[10.5px] text-emerald-700 hover:underline flex items-center gap-0.5 disabled:opacity-40">
              <Plus size={10} /> Add column
            </button>
          </div>
        </div>
      );
    case 'questions':
      return (
        <div className="space-y-2">
          {block.items.map((q, qi) => (
            <div key={qi} className="border border-gray-200 rounded p-1.5 bg-white">
              <div className="flex gap-1">
                <span className="text-[11px] font-bold text-gray-500 pt-1">{qi + 1}.</span>
                <textarea rows={2} value={q.question} onChange={(e) => onChange({ ...block, items: block.items.map((x, i) => (i === qi ? { ...x, question: e.target.value } : x)) })} className={inputCls} />
                <button onClick={() => onChange({ ...block, items: block.items.filter((_, i) => i !== qi) })} className="p-0.5 text-gray-400 hover:text-red-600 self-start" title="Delete item">
                  <Trash2 size={11} />
                </button>
              </div>
              <div className="pl-4 mt-1 grid grid-cols-2 gap-1">
                <textarea
                  rows={Math.max(2, (q.choices || []).length)}
                  placeholder="Choices, one per line"
                  value={(q.choices || []).join('\n')}
                  onChange={(e) => onChange({ ...block, items: block.items.map((x, i) => (i === qi ? { ...x, choices: linesToItems(e.target.value) } : x)) })}
                  className={inputCls}
                />
                <input
                  placeholder="Answer"
                  value={q.answer || ''}
                  onChange={(e) => onChange({ ...block, items: block.items.map((x, i) => (i === qi ? { ...x, answer: e.target.value } : x)) })}
                  className={`${inputCls} self-start`}
                />
              </div>
            </div>
          ))}
          <button onClick={() => onChange({ ...block, items: [...block.items, { question: '', choices: [] }] })} className="text-[10.5px] text-emerald-700 hover:underline flex items-center gap-0.5">
            <Plus size={10} /> Add item
          </button>
        </div>
      );
    case 'answerLines':
      return (
        <label className="text-xs text-gray-600 flex items-center gap-2">
          Answer lines
          <input type="number" min={1} max={30} value={block.count} onChange={(e) => onChange({ ...block, count: Number(e.target.value) || 1 })} className="w-16 border border-gray-300 rounded px-1" />
        </label>
      );
    case 'pageBreak':
      return <p className="text-[10px] text-gray-400 text-center border-t border-dashed border-gray-300 pt-1">Page break</p>;
    case 'cutLine':
      return <p className="text-[10px] text-gray-400 text-center border-t border-dashed border-gray-400 pt-1">✂ cut line</p>;
    default:
      return null;
  }
}

const tool = (on) => `p-1 rounded border text-[10.5px] leading-none ${on ? 'border-emerald-600 bg-emerald-50 text-emerald-800' : 'border-transparent text-gray-600 hover:bg-gray-100'}`;
const small = 'border border-gray-300 rounded bg-white text-[10.5px] px-1 py-0.5';

/** Alignment, indents, spacing and text style for one heading, paragraph or list. */
function FormatBar({ block, onChange }) {
  const st = block.style || {};
  const set = (patch) => onChange(setBlockStyle(block, patch));
  const list = block.type === 'bullets';
  const first = st.firstLine > 0 ? 'first' : st.firstLine < 0 ? 'hanging' : 'none';
  return (
    <div className="flex flex-wrap items-center gap-0.5 mb-1" role="toolbar" aria-label="Formatting">
      {[['left', AlignLeft, 'Align left'], ['center', AlignCenter, 'Center'], ['right', AlignRight, 'Align right'], ['justify', AlignJustify, 'Justify']].map(([a, Icon, t]) => (
        <button key={a} type="button" title={t} aria-pressed={(st.align || 'left') === a} onClick={() => set({ align: a === 'left' ? null : a })} className={tool((st.align || 'left') === a)}><Icon size={12} /></button>
      ))}
      <span className="mx-1 h-4 border-l border-gray-200" />
      <button type="button" title="Decrease indent" onClick={() => onChange(shiftIndent(block, -0.5))} disabled={!st.indent} className={`${tool(false)} disabled:opacity-30`}><IndentDecrease size={12} /></button>
      <button type="button" title="Increase indent (0.5 inch)" onClick={() => onChange(shiftIndent(block, 0.5))} disabled={(st.indent || 0) >= 4} className={`${tool(false)} disabled:opacity-30`}><IndentIncrease size={12} /></button>
      {st.indent ? <span className="text-[10px] text-gray-500 tabular-nums">{st.indent}"</span> : null}
      {!list && (
        <select value={first} onChange={(e) => set({ firstLine: e.target.value === 'first' ? 0.5 : e.target.value === 'hanging' ? -0.5 : null })} className={small} title="First line">
          <option value="none">No first-line indent</option>
          <option value="first">First line 0.5"</option>
          <option value="hanging">Hanging 0.5"</option>
        </select>
      )}
      <select value={st.lineSpacing || ''} onChange={(e) => set({ lineSpacing: e.target.value ? Number(e.target.value) : null })} className={small} title="Line spacing">
        <option value="">Spacing: normal</option>
        {LINE_SPACINGS.map((v) => <option key={v} value={v}>Spacing {v.toFixed(v === 1.15 ? 2 : 1)}</option>)}
      </select>
      <span className="mx-1 h-4 border-l border-gray-200" />
      <button type="button" title="Bold" aria-pressed={Boolean(st.bold)} onClick={() => set({ bold: !st.bold })} className={tool(st.bold)}><Bold size={12} /></button>
      <button type="button" title="Italic" aria-pressed={Boolean(st.italic)} onClick={() => set({ italic: !st.italic })} className={tool(st.italic)}><Italic size={12} /></button>
      <button type="button" title="Underline" aria-pressed={Boolean(st.underline)} onClick={() => set({ underline: !st.underline })} className={tool(st.underline)}><Underline size={12} /></button>
      <select value={st.size || ''} onChange={(e) => set({ size: e.target.value ? Number(e.target.value) : null })} className={small} title="Text size">
        <option value="">Size: normal</option>
        {[9, 10, 11, 12, 13, 14, 16, 18, 20, 24].map((v) => <option key={v} value={v}>{v} pt</option>)}
      </select>
    </div>
  );
}

/** Paper, orientation, margins and the document's font. */
function PageSetup({ spec, onChange }) {
  const preset = marginPresetOf(spec.margins);
  const [custom, setCustom] = useState(preset === 'custom');
  const [error, setError] = useState('');
  const m = spec.margins || MARGIN_PRESETS.katuro;
  const font = spec.font || DEFAULT_FONT;
  const applyMargins = (next) => {
    const res = setMargins(spec, next);
    if (!res) {
      setError('Those margins leave less than 2 inches for the text (each margin can be 0.2 to 3 inches).');
      return;
    }
    setError('');
    onChange(res);
  };
  return (
    <div className="space-y-1.5 rounded border border-gray-200 bg-[#fbfcfb] p-2 text-[11px] text-gray-600">
      <p className="text-[9.5px] font-bold uppercase tracking-wider text-gray-400">Page setup</p>
      <div className="flex flex-wrap gap-2">
        <select value={spec.paper} onChange={(e) => onChange(setPage(spec, { paper: e.target.value }))} className="border border-gray-300 rounded px-1" title="Paper">
          {Object.entries(PAPER_SIZES).map(([k, p]) => <option key={k} value={k}>{p.label}</option>)}
        </select>
        <select value={spec.orientation} onChange={(e) => onChange(setPage(spec, { orientation: e.target.value }))} className="border border-gray-300 rounded px-1" title="Orientation">
          <option value="portrait">Portrait</option>
          <option value="landscape">Landscape</option>
        </select>
        <select
          value={custom ? 'custom' : preset}
          onChange={(e) => {
            if (e.target.value === 'custom') {
              setCustom(true);
              return;
            }
            setCustom(false);
            applyMargins(MARGIN_PRESETS[e.target.value]);
          }}
          className="border border-gray-300 rounded px-1"
          title="Margins"
        >
          {Object.entries(MARGIN_PRESETS).map(([k, p]) => <option key={k} value={k}>Margins: {p.label}</option>)}
          <option value="custom">Margins: custom</option>
        </select>
      </div>
      {custom && (
        <div className="flex flex-wrap items-center gap-2">
          {['top', 'bottom', 'left', 'right'].map((k) => (
            <label key={k} className="flex items-center gap-1 capitalize">
              {k}
              <input type="number" step="0.1" min="0.2" max="3" defaultValue={m[k]} onBlur={(e) => applyMargins({ ...m, [k]: Number(e.target.value) })} className="w-14 border border-gray-300 rounded px-1" aria-label={`${k} margin in inches`} />
            </label>
          ))}
          <span className="text-gray-400">inches</span>
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <select value={font.family} onChange={(e) => onChange(setFont(spec, { family: e.target.value }))} className="border border-gray-300 rounded px-1" title="Font">
          {FONTS.map((f) => <option key={f} value={f}>{f}</option>)}
        </select>
        <select value={font.size} onChange={(e) => onChange(setFont(spec, { size: Number(e.target.value) }))} className="border border-gray-300 rounded px-1" title="Body text size">
          {[9, 10, 10.5, 11, 12, 13, 14].map((v) => <option key={v} value={v}>{v} pt</option>)}
        </select>
      </div>
      {error && <p className="text-red-700">{error}</p>}
    </div>
  );
}

/** Find a word or phrase in the whole document and replace it. */
function FindReplace({ spec, onChange }) {
  const [find, setFind] = useState('');
  const [replace, setReplace] = useState('');
  const [matchCase, setMatchCase] = useState(false);
  const [note, setNote] = useState('');
  const found = find ? countMatches(spec, find, { matchCase }) : 0;
  return (
    <details className="rounded border border-gray-200 bg-white p-2 text-[11px] text-gray-600">
      <summary className="cursor-pointer font-semibold text-gray-700">Find and replace</summary>
      <div className="mt-1.5 grid grid-cols-2 gap-1.5">
        <input value={find} onChange={(e) => { setFind(e.target.value); setNote(''); }} placeholder="Find" className={inputCls} />
        <input value={replace} onChange={(e) => setReplace(e.target.value)} placeholder="Replace with" className={inputCls} />
      </div>
      <div className="mt-1.5 flex items-center gap-2">
        <label className="flex items-center gap-1"><input type="checkbox" checked={matchCase} onChange={(e) => setMatchCase(e.target.checked)} /> Match case</label>
        <span className="flex-1 text-gray-500">{find ? `${found} found` : ''}{note ? ` ${note}` : ''}</span>
        <button
          type="button"
          disabled={!found}
          onClick={() => {
            const res = findReplace(spec, find, replace, { matchCase });
            onChange(res.spec);
            setNote(`Replaced ${res.count}.`);
          }}
          className="rounded bg-emerald-700 px-2 py-0.5 font-semibold text-white hover:bg-emerald-800 disabled:opacity-40"
        >
          Replace all
        </button>
      </div>
    </details>
  );
}

const INSERTS = [['paragraph', 'Paragraph'], ['heading', 'Heading'], ['bullets', 'Bulleted list'], ['numbered', 'Numbered list'], ['table', 'Table'], ['answerLines', 'Answer lines'], ['pageBreak', 'Page break'], ['cutLine', 'Cut line']];

export default function DeskSpecEditor({ spec, onChange }) {
  const setBlock = (i, block) => onChange({ ...spec, blocks: spec.blocks.map((b, j) => (j === i ? block : b)) });
  const move = (i, dir) => {
    const j = i + dir;
    if (j < 0 || j >= spec.blocks.length) return;
    const blocks = [...spec.blocks];
    [blocks[i], blocks[j]] = [blocks[j], blocks[i]];
    onChange({ ...spec, blocks });
  };
  const remove = (i) => onChange({ ...spec, blocks: spec.blocks.filter((_, j) => j !== i) });
  const insertAfter = (i, type) => onChange(insertBlock(spec, i, type));

  return (
    <div className="w-full space-y-3">
      <div className="bg-white border border-gray-200 rounded-lg p-2.5 space-y-1.5">
        <input value={spec.title} onChange={(e) => onChange({ ...spec, title: e.target.value })} className={`${inputCls} font-bold text-sm`} placeholder="Title" />
        <input value={spec.subtitle || ''} onChange={(e) => onChange({ ...spec, subtitle: e.target.value })} className={inputCls} placeholder="Subtitle (optional)" />
        <PageSetup spec={spec} onChange={onChange} />
        {spec.meta?.length > 0 && (
          <div className="grid grid-cols-2 gap-1">
            {spec.meta.map((m, i) => (
              <label key={i} className="text-[10.5px] text-gray-500">
                {m.label}
                <input value={m.value} onChange={(e) => onChange({ ...spec, meta: spec.meta.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)) })} className={inputCls} />
              </label>
            ))}
          </div>
        )}
      </div>

      <FindReplace spec={spec} onChange={onChange} />
      {!spec.blocks.length && (
        <select value="" onChange={(e) => e.target.value && insertAfter(-1, e.target.value)} className={small} title="Add to the document">
          <option value="">Add…</option>
          {INSERTS.map(([k, t]) => <option key={k} value={k}>{t}</option>)}
        </select>
      )}

      {spec.blocks.map((block, i) => (
        <div key={i} className="group bg-[#fbfcfb] border border-gray-200 rounded-lg p-2">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[9.5px] uppercase tracking-wider font-bold text-gray-400">{block.type}</span>
            <div className="flex items-center gap-0.5 opacity-50 group-hover:opacity-100">
              <button onClick={() => move(i, -1)} className="p-0.5 hover:text-emerald-700" title="Move up"><ArrowUp size={11} /></button>
              <button onClick={() => move(i, 1)} className="p-0.5 hover:text-emerald-700" title="Move down"><ArrowDown size={11} /></button>
              <select value="" onChange={(e) => e.target.value && insertAfter(i, e.target.value)} className="border border-gray-200 rounded bg-white text-[10px] px-0.5" title="Insert below">
                <option value="">Insert below…</option>
                {INSERTS.map(([k, t]) => <option key={k} value={k}>{t}</option>)}
              </select>
              <button onClick={() => remove(i)} className="p-0.5 hover:text-red-600" title="Delete block"><Trash2 size={11} /></button>
            </div>
          </div>
          {['heading', 'paragraph', 'bullets'].includes(block.type) && <FormatBar block={block} onChange={(b) => setBlock(i, b)} />}
          <BlockEditor block={block} onChange={(b) => setBlock(i, b)} />
        </div>
      ))}
    </div>
  );
}
