/**
 * errorReports.js — groups the admin's AI Error Reports so repeats show once.
 *
 * The same failure arrives many times with tiny differences (a new file hash after
 * each deploy, a different install path, a timestamp). The signature removes those,
 * so "useFacultyStore is not defined" from five sessions is ONE row with a count.
 */

export function reportSignature(r) {
  const msg = String(r?.errorMessage || '')
    .replace(/https?:\/\/\S+/g, '<url>')
    .replace(/file:\/\/\/\S+/g, '<file>')
    .replace(/[A-Za-z]:\\[^\s]+/g, '<path>')
    .replace(/-[A-Za-z0-9_]{6,}\.(js|css)\b/g, '.$1') // Vite file hashes
    .replace(/\d+/g, '#')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 160);
  return `${r?.feature || 'unknown'}::${msg}`;
}

const toMs = (t) => (t?.toMillis ? t.toMillis() : t?.seconds ? t.seconds * 1000 : t ? new Date(t).getTime() : 0);

/**
 * @returns {Array<{ key, feature, sample, ids, openIds, count, openCount, firstAt, lastAt }>}
 *   newest problem first; groups with open reports before fully resolved ones.
 */
export function groupReports(reports = []) {
  const groups = new Map();
  for (const r of reports) {
    const key = reportSignature(r);
    const at = toMs(r.createdAt);
    let g = groups.get(key);
    if (!g) {
      g = { key, feature: r.feature || 'unknown', sample: r, ids: [], openIds: [], count: 0, openCount: 0, firstAt: at, lastAt: at };
      groups.set(key, g);
    }
    g.ids.push(r.id);
    g.count += 1;
    if (!r.resolved) {
      g.openIds.push(r.id);
      g.openCount += 1;
    }
    if (at > g.lastAt) {
      g.lastAt = at;
      g.sample = r; // show the most recent occurrence
    }
    if (at && (!g.firstAt || at < g.firstAt)) g.firstAt = at;
  }
  return [...groups.values()].sort((a, b) => (b.openCount > 0) - (a.openCount > 0) || b.lastAt - a.lastAt);
}
