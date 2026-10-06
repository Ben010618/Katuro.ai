'use strict';
/**
 * chatSearch.js — find teachers by @username, most likely first.
 *
 *   exact            "ben"  -> @ben
 *   starts with      "be"   -> @ben, @benjie
 *   contains         "eye"  -> @mseyey
 *   close spelling   "ban"  -> @ben   (typo distance; "Did you mean @ben?")
 *
 * Pure functions: no database, so the ranking is easy to test.
 */

/** "@Ben " -> "ben"; keeps only characters a username can have. */
function normalizeQuery(q) {
  return String(q || '').trim().toLowerCase().replace(/^@+/, '').replace(/[^a-z0-9._]/g, '').slice(0, 30);
}

/** Damerau-Levenshtein distance (a swap of two letters counts as one typo). */
function typoDistance(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...new Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[a.length][b.length];
}

/**
 * How likely `username` is the teacher meant by query `q` (0..1).
 * Bands never overlap: exact 1 > starts-with 0.9.. > contains 0.75.. > close spelling < 0.7.
 */
function usernameScore(q, username) {
  const u = String(username || '').toLowerCase();
  if (!q || !u) return 0;
  if (u === q) return 1;
  if (u.startsWith(q)) return 0.9 + 0.09 * (q.length / u.length);
  if (q.length >= 2 && u.includes(q)) return 0.75 + 0.05 * (q.length / u.length);
  if (q.length < 3) return 0; // too short to guess a misspelling
  const whole = 1 - typoDistance(q, u) / Math.max(q.length, u.length);
  const start = u.length > q.length ? 1 - typoDistance(q, u.slice(0, q.length)) / q.length : 0;
  const s = Math.max(whole, start * 0.95);
  const needed = q.length <= 4 ? 0.6 : 0.55;
  return s >= needed ? 0.7 * s : 0;
}

/** Best matches first (ties: shorter, then alphabetical). entries: [{ uid, username, ... }]. */
function searchUsernames(query, entries, { limit = 8 } = {}) {
  const q = normalizeQuery(query);
  if (!q) return [];
  return entries
    .map((e) => ({ ...e, score: usernameScore(q, e.username) }))
    .filter((e) => e.score > 0)
    .sort((a, b) => b.score - a.score || a.username.length - b.username.length || a.username.localeCompare(b.username))
    .slice(0, limit);
}

module.exports = { normalizeQuery, typoDistance, usernameScore, searchUsernames };
