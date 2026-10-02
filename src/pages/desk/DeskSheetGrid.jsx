import { useState } from 'react';

const MAX_ROWS = 400;

/**
 * Spreadsheet-style grid for previews (read-only) and extracted tables (editable).
 * sheets: [{ name, columns?: string[], rows: any[][] }]
 */
export default function DeskSheetGrid({ sheets = [], editable = false, onChange }) {
  const [activeIdx, setActiveIdx] = useState(0);
  const sheet = sheets[Math.min(activeIdx, sheets.length - 1)];
  if (!sheet) return <p className="text-xs text-gray-500 p-4">This workbook has no data.</p>;

  const columns = sheet.columns || [];
  const rows = sheet.rows || [];
  const width = Math.max(columns.length, ...rows.slice(0, MAX_ROWS).map((r) => r?.length || 0), 1);
  const colLetter = (i) => {
    let s = '';
    let n = i + 1;
    while (n > 0) {
      const m = (n - 1) % 26;
      s = String.fromCharCode(65 + m) + s;
      n = Math.floor((n - 1) / 26);
    }
    return s;
  };

  const setCell = (r, c, value) => {
    const nextRows = rows.map((row) => [...(row || [])]);
    while (nextRows[r].length <= c) nextRows[r].push('');
    nextRows[r][c] = value;
    onChange?.(activeIdx, { ...sheet, rows: nextRows });
  };

  const setHeader = (c, value) => {
    const next = [...columns];
    while (next.length <= c) next.push('');
    next[c] = value;
    onChange?.(activeIdx, { ...sheet, columns: next });
  };

  return (
    <div className="w-full flex flex-col min-h-0">
      {sheets.length > 1 && (
        <div className="flex gap-1 mb-2 overflow-x-auto">
          {sheets.map((s, i) => (
            <button
              key={`${s.name}-${i}`}
              onClick={() => setActiveIdx(i)}
              className={`px-2 py-0.5 text-[10.5px] rounded border whitespace-nowrap ${
                i === activeIdx ? 'bg-emerald-700 text-white border-emerald-700' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
              }`}
            >
              {s.name}
            </button>
          ))}
        </div>
      )}
      <div className="overflow-auto border border-gray-300 rounded bg-white max-h-[70vh]">
        <table className="border-collapse text-[11px] font-sans">
          <thead className="sticky top-0 z-10">
            <tr>
              <th className="bg-gray-100 border border-gray-300 px-1 text-gray-500 w-8" />
              {Array.from({ length: width }, (_, c) => (
                <th key={c} className="bg-gray-100 border border-gray-300 px-1.5 text-gray-500 font-medium min-w-[64px]">
                  {colLetter(c)}
                </th>
              ))}
            </tr>
            {columns.length > 0 && (
              <tr>
                <th className="bg-emerald-50 border border-gray-300 px-1 text-gray-400 text-[10px]">H</th>
                {Array.from({ length: width }, (_, c) => (
                  <th key={c} className="bg-emerald-50 border border-gray-300 px-1.5 py-0.5 text-left font-semibold text-emerald-900">
                    {editable ? (
                      <input value={columns[c] ?? ''} onChange={(e) => setHeader(c, e.target.value)} className="w-full bg-transparent focus:outline-none focus:bg-white" />
                    ) : (
                      columns[c] ?? ''
                    )}
                  </th>
                ))}
              </tr>
            )}
          </thead>
          <tbody>
            {rows.slice(0, MAX_ROWS).map((row, r) => (
              <tr key={r}>
                <td className="bg-gray-50 border border-gray-300 px-1 text-gray-400 text-right">{r + 1}</td>
                {Array.from({ length: width }, (_, c) => {
                  const v = row?.[c];
                  const text = v === null || v === undefined ? '' : String(v);
                  return (
                    <td key={c} className={`border border-gray-200 px-1.5 py-0.5 whitespace-nowrap ${typeof v === 'number' ? 'text-right' : ''}`}>
                      {editable ? (
                        <input value={text} onChange={(e) => setCell(r, c, e.target.value)} className="w-full min-w-[56px] bg-transparent focus:outline-none focus:bg-emerald-50" />
                      ) : (
                        text
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length > MAX_ROWS && <p className="text-[10px] text-gray-500 mt-1">Showing the first {MAX_ROWS} of {rows.length} rows.</p>}
    </div>
  );
}
