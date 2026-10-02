/**
 * gridMap.js — wraps a plain 2-D grid (CSV, old .xls, a PDF/photo table transcribed
 * by AI vision) as an xlsx-shaped document map, so recognition, extraction and
 * transfer work the same for every source. Such maps are READ-ONLY sources.
 */

export function columnLetter(index) {
  let s = '';
  let n = index + 1;
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

/** sheets: [{ name, rows: any[][] }] → { kind: 'xlsx', readOnly: true, sheets: [...] } */
export function mapFromGrids(sheets) {
  return {
    kind: 'xlsx',
    readOnly: true,
    definedNames: [],
    sheets: sheets.map((sh, index) => {
      const cells = {};
      let maxCol = 0;
      (sh.rows || []).forEach((row, r) => {
        (row || []).forEach((v, c) => {
          if (v === null || v === undefined || String(v).trim() === '') return;
          const num = typeof v === 'number' ? v : String(v).trim() !== '' && !Number.isNaN(Number(v)) && !/^0\d/.test(String(v).trim()) ? Number(v) : null;
          cells[`${columnLetter(c)}${r + 1}`] = num !== null ? { v: num, text: String(v) } : { v: String(v), text: String(v) };
          maxCol = Math.max(maxCol, c + 1);
        });
      });
      return { name: sh.name || `Sheet${index + 1}`, index, state: 'visible', maxRow: (sh.rows || []).length, maxCol, merges: [], cells };
    }),
  };
}
