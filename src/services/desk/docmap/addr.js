// A1-style address helpers. Rows are 1-based, columns 0-based.

export function colToIndex(col) {
  const s = String(col || '').toUpperCase();
  if (!/^[A-Z]{1,3}$/.test(s)) return -1;
  let n = 0;
  for (let i = 0; i < s.length; i++) n = n * 26 + (s.charCodeAt(i) - 64);
  return n - 1;
}

export function indexToCol(index) {
  let n = Math.floor(index) + 1;
  if (!(n > 0)) return '';
  let s = '';
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

export function parseAddr(addr) {
  const m = /^\$?([A-Za-z]{1,3})\$?(\d+)$/.exec(String(addr ?? '').trim());
  if (!m) return null;
  const row = Number(m[2]);
  if (row < 1) return null;
  return { col: colToIndex(m[1]), row };
}

export function makeAddr(col, row) {
  return indexToCol(col) + row;
}

export function parseRange(ref) {
  const [a, b] = String(ref ?? '').split(':');
  const s = parseAddr(a);
  const e = b === undefined ? s : parseAddr(b);
  if (!s || !e) return null;
  return {
    start: { col: Math.min(s.col, e.col), row: Math.min(s.row, e.row) },
    end: { col: Math.max(s.col, e.col), row: Math.max(s.row, e.row) },
  };
}

export function inRange(addr, range) {
  const a = typeof addr === 'string' ? parseAddr(addr) : addr;
  const r = typeof range === 'string' ? parseRange(range) : range;
  if (!a || !r) return false;
  return a.col >= r.start.col && a.col <= r.end.col && a.row >= r.start.row && a.row <= r.end.row;
}
