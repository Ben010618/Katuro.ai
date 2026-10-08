/**
 * fileSearch.js — find which files in the classroom folder contain what the teacher is
 * looking for ("which file has Juan's Term 1 grades?"), by code: every readable file is
 * searched (spreadsheet rows with their column headings, Word paragraphs and tables, PDF
 * pages, slides, file names) and files are ranked by how many of the terms they contain.
 */

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const STOP = new Set(['which', 'what', 'where', 'file', 'files', 'has', 'have', 'the', 'a', 'an', 'of', 'in', 'on', 'for', 'and', 'or', 'with', 'my', 'is', 'are', 'find', 'search', 'show', 'me', 'that', 'contains', 'containing', 'about', 'saan', 'ang', 'ng', 'sa', 'mga', 'na', 'yung', 'yong', 'po', 'please']);

/** Search terms from a plain question when the planner gave none. */
export function termsFromQuery(q) {
  const s = String(q || '').replace(/'s\b/g, '');
  const terms = [];
  // "Term 1", "Quarter 2", "Grade 5", "Q3", "SF2" stay together.
  const kept = s.replace(/\b(term|quarter|grade|week|q|t|sf)\s*(\d{1,2})\b/gi, (m) => { terms.push(m.replace(/\s+/g, ' ')); return ' '; });
  for (const w of kept.split(/[^A-Za-zÑñ0-9-]+/)) if (w.length > 1 && !STOP.has(w.toLowerCase())) terms.push(w);
  return [...new Set(terms)];
}

/** One term as a pattern: names in any common order, "Term 1" = "Quarter 1" = "Q1" = "T1". */
export function termPattern(term) {
  const t = String(term || '').trim();
  const period = t.match(/^(?:term|quarter|q|t)\s*(\d{1,2})$/i);
  if (period) return new RegExp(`(?<![A-Za-z0-9])(?:term|quarter|q|t)\\s*${period[1]}(?![0-9])`, 'i');
  const words = t.split(/\s+/).filter(Boolean);
  if (words.length >= 2 && words.every((w) => /^[A-ZÑ][a-zñ.]+$/.test(w) || /^[A-Z]\.?$/.test(w))) {
    // A person's name: as written, or "Surname, Given" for any split of the words; middle
    // initials may appear between any of them ("Juan P. Dela Cruz", "Dela Cruz, Juan P.").
    const core = words.filter((w) => !/^[A-Z]\.?$/.test(w)).map((w) => esc(w.replace(/\.$/, '')));
    const join = (list) => list.join('(?:[\\s,]+[A-Za-zÑñ]\\.?)*[\\s,]+');
    const orders = [join(core)];
    for (let k = 1; k < core.length; k += 1) orders.push(join([...core.slice(k), ...core.slice(0, k)]));
    return new RegExp(`(?<![\\p{L}])(?:${orders.join('|')})(?![\\p{L}])`, 'iu');
  }
  return new RegExp(`(?<![\\p{L}\\p{N}])${words.map(esc).join('\\s+')}(?![\\p{L}\\p{N}])`, 'iu');
}

const cell = (v) => (v === null || v === undefined ? '' : String(v)).replace(/\s+/g, ' ').trim();
const clip = (s, n = 160) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** Places inside one parsed file: [{ where, text, cells?, headers? }] */
function unitsOf(parsed) {
  const units = [];
  for (const sheet of parsed.sheets || []) {
    const rows = sheet.rows || [];
    rows.forEach((row, r) => {
      const cells = (row || []).map(cell);
      if (cells.some(Boolean)) units.push({ where: `${sheet.name}, row ${r + 1}`, text: cells.filter(Boolean).join(' | '), cells, headerRows: rows.slice(0, Math.min(r, 15)).map((h) => (h || []).map(cell)) });
    });
  }
  if (parsed.kind === 'docx') {
    String(parsed.text || '').split(/\n+/).forEach((p, i) => { if (p.trim()) units.push({ where: `paragraph ${i + 1}`, text: cell(p) }); });
    (parsed.tables || []).map((t) => (Array.isArray(t) ? t : t?.rows || [])).forEach((t, ti) => t.forEach((row, r) => {
      const cells = row.map(cell);
      if (cells.some(Boolean)) units.push({ where: `table ${ti + 1}, row ${r + 1}`, text: cells.filter(Boolean).join(' | '), cells, headerRows: t.slice(0, Math.min(r, 5)).map((h) => h.map(cell)) });
    }));
  }
  for (const p of parsed.pages || []) if (String(p.text || '').trim()) units.push({ where: `page ${p.number}`, text: cell(p.text) });
  for (const s of parsed.slides || []) units.push({ where: `slide ${s.number}`, text: cell(`${s.title || ''} ${s.text || ''} ${s.notes || ''}`) });
  if (!units.length && parsed.kind === 'text') String(parsed.text || '').split(/\n+/).forEach((l, i) => { if (l.trim()) units.push({ where: `line ${i + 1}`, text: cell(l) }); });
  return units;
}

/**
 * How well one file answers the terms.
 * → { matched: Set(term index), hits: [{ where, snippet, count }], score } or null
 */
export function searchFile(parsed, path, patterns) {
  const name = String(path).split('/').pop();
  const inName = new Set(patterns.map((re, i) => (re.test(name) ? i : -1)).filter((i) => i >= 0));
  const matched = new Set(inName);
  const hits = [];
  for (const u of unitsOf(parsed)) {
    const here = new Set(patterns.map((re, i) => (re.test(u.text) ? i : -1)).filter((i) => i >= 0));
    if (!here.size) continue;
    let snippet = u.text;
    // A spreadsheet row: other terms found in its column headings bring that column's value.
    if (u.cells && u.headerRows?.length) {
      const extra = [];
      patterns.forEach((re, i) => {
        if (here.has(i)) return;
        for (const h of u.headerRows) {
          const col = h.findIndex((v) => re.test(v));
          if (col >= 0 && u.cells[col]) { here.add(i); extra.push(`${h[col]}: ${u.cells[col]}`); break; }
        }
      });
      const first = u.cells.find((v) => patterns.some((re) => re.test(v))) || u.cells.find(Boolean);
      if (extra.length) snippet = `${first} — ${extra.join('; ')}`;
    }
    if (!u.cells) {
      // Around the first match in long text.
      const at = Math.max(0, ...patterns.map((re) => { const m = u.text.match(re); return m ? m.index : -1; }).filter((i) => i >= 0).slice(0, 1));
      snippet = `${at > 60 ? '…' : ''}${u.text.slice(Math.max(0, at - 60), at + 120)}`;
    }
    here.forEach((i) => matched.add(i));
    hits.push({ where: u.where, snippet: clip(snippet), count: here.size });
  }
  if (!matched.size) return null;
  hits.sort((a, b) => b.count - a.count);
  const best = hits[0]?.count || 0;
  return { matched, hits, score: matched.size * 10 + best * 6 + Math.min(hits.length, 5) + inName.size * 2 };
}
