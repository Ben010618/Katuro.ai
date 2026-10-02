import { Plus, Trash2, ArrowUp, ArrowDown } from 'lucide-react';

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
                    <input
                      value={c}
                      onChange={(e) => onChange({ ...block, columns: block.columns.map((x, i) => (i === ci ? e.target.value : x)) })}
                      className="w-full min-w-[70px] px-1 py-0.5 bg-transparent font-semibold focus:outline-none focus:bg-white"
                    />
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
          <button onClick={() => onChange({ ...block, rows: [...block.rows, block.columns.map(() => '')] })} className="mt-1 text-[10.5px] text-emerald-700 hover:underline flex items-center gap-0.5">
            <Plus size={10} /> Add row
          </button>
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
  const insertAfter = (i, type) => {
    const blank = type === 'heading' ? { type, level: 2, text: 'New heading' } : type === 'bullets' ? { type, items: ['New item'], ordered: false } : { type: 'paragraph', text: 'New paragraph' };
    const blocks = [...spec.blocks];
    blocks.splice(i + 1, 0, blank);
    onChange({ ...spec, blocks });
  };

  return (
    <div className="w-full space-y-3">
      <div className="bg-white border border-gray-200 rounded-lg p-2.5 space-y-1.5">
        <input value={spec.title} onChange={(e) => onChange({ ...spec, title: e.target.value })} className={`${inputCls} font-bold text-sm`} placeholder="Title" />
        <input value={spec.subtitle || ''} onChange={(e) => onChange({ ...spec, subtitle: e.target.value })} className={inputCls} placeholder="Subtitle (optional)" />
        <div className="flex gap-2 text-[11px] text-gray-600">
          <select value={spec.paper} onChange={(e) => onChange({ ...spec, paper: e.target.value })} className="border border-gray-300 rounded px-1">
            <option value="long">Long bond 8.5×13</option>
            <option value="a4">A4</option>
            <option value="letter">Letter 8.5×11</option>
          </select>
          <select value={spec.orientation} onChange={(e) => onChange({ ...spec, orientation: e.target.value })} className="border border-gray-300 rounded px-1">
            <option value="portrait">Portrait</option>
            <option value="landscape">Landscape</option>
          </select>
        </div>
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

      {spec.blocks.map((block, i) => (
        <div key={i} className="group bg-[#fbfcfb] border border-gray-200 rounded-lg p-2">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[9.5px] uppercase tracking-wider font-bold text-gray-400">{block.type}</span>
            <div className="flex items-center gap-0.5 opacity-50 group-hover:opacity-100">
              <button onClick={() => move(i, -1)} className="p-0.5 hover:text-emerald-700" title="Move up"><ArrowUp size={11} /></button>
              <button onClick={() => move(i, 1)} className="p-0.5 hover:text-emerald-700" title="Move down"><ArrowDown size={11} /></button>
              <button onClick={() => insertAfter(i, 'paragraph')} className="p-0.5 hover:text-emerald-700 text-[10px] font-bold" title="Add paragraph below">+¶</button>
              <button onClick={() => insertAfter(i, 'bullets')} className="p-0.5 hover:text-emerald-700 text-[10px] font-bold" title="Add list below">+•</button>
              <button onClick={() => remove(i)} className="p-0.5 hover:text-red-600" title="Delete block"><Trash2 size={11} /></button>
            </div>
          </div>
          <BlockEditor block={block} onChange={(b) => setBlock(i, b)} />
        </div>
      ))}
    </div>
  );
}
