/**
 * transfer.js — moves data from one school paper into another, and compares two papers.
 *
 * Works on canonical tables (extract.js), so the source can be a Word table, an Excel
 * sheet, a CSV, or a photo transcribed by AI vision. The result is a list of CELL EDITS
 * for the target's own template (docmap/applyEdits writes only those cells), plus a
 * human-readable preview for the teacher to approve.
 */

import { matchLearnerName, normalizeLearnerName } from '../generators/fillTemplates.js';

export const NAME_MATCH_THRESHOLD = 0.85;

const normHeader = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '');

export function locationLabel(loc) {
  if (!loc) return '';
  if (loc.cell) return `${loc.sheet}!${loc.cell}`;
  const m = String(loc.id || '').match(/^t(\d+)\.r(\d+)\.c(\d+)/);
  return m ? `table ${Number(m[1]) + 1}, row ${Number(m[2]) + 1}, column ${Number(m[3]) + 1}` : String(loc.id || '');
}

/**
 * Pairs learners across two lists: LRN first, then fuzzy name (order-insensitive,
 * tolerant of initials and spelling). Each target learner is used once.
 */
export function matchLearners(sourceLearners, targetLearners) {
  const used = new Set();
  const pairs = [];
  const unmatched = [];
  const byLrn = new Map(targetLearners.filter((t) => t.lrn).map((t) => [String(t.lrn).replace(/\D/g, ''), t]));

  for (const s of sourceLearners) {
    const lrn = s.lrn ? String(s.lrn).replace(/\D/g, '') : '';
    if (lrn && byLrn.has(lrn) && !used.has(byLrn.get(lrn))) {
      const t = byLrn.get(lrn);
      used.add(t);
      pairs.push({ source: s, target: t, score: 1, by: 'lrn' });
      continue;
    }
    let best = null;
    let second = 0;
    for (const t of targetLearners) {
      if (used.has(t)) continue;
      const score = matchLearnerName(s.name, t.name);
      if (!best || score > best.score) {
        second = best ? best.score : second;
        best = { t, score };
      } else if (score > second) {
        second = score;
      }
    }
    // Ambiguous: two target names almost equally close — don't guess.
    if (best && best.score >= NAME_MATCH_THRESHOLD && best.score - second > 0.03) {
      used.add(best.t);
      pairs.push({ source: s, target: best.t, score: best.score, by: 'name' });
    } else {
      unmatched.push({ learner: s, closest: best && best.score >= 0.6 ? { name: best.t.name, score: best.score } : null });
    }
  }
  const unmatchedTarget = targetLearners.filter((t) => !used.has(t));
  return { pairs, unmatched, unmatchedTarget };
}

/**
 * Column pairs between two canonical tables. Explicit `mapping` ({ sourceKey: targetKey })
 * wins; otherwise: attendance days by date, then by day number; then identical headers;
 * then component+item; then meanings that occur once on both sides (total, grade, remarks...).
 */
export function mapColumns(sourceTable, targetTable, mapping = {}) {
  const pairs = [];
  const usedT = new Set();
  const take = (sc, tc, by) => {
    if (!sc || !tc || usedT.has(tc.key) || pairs.some((p) => p.source.key === sc.key)) return;
    usedT.add(tc.key);
    pairs.push({ source: sc, target: tc, by });
  };
  const sCols = sourceTable.columns.filter((c) => c.meaning !== 'learner_name');
  const tCols = targetTable.columns.filter((c) => c.meaning !== 'learner_name');

  for (const [sk, tk] of Object.entries(mapping || {})) take(sCols.find((c) => c.key === sk), tCols.find((c) => c.key === tk), 'teacher/AI');

  const isDay = (c) => c.meaning === 'day' || c.meaning === 'date';
  for (const sc of sCols.filter((c) => isDay(c) && c.date)) take(sc, tCols.find((t) => isDay(t) && t.date === sc.date), 'date');
  for (const sc of sCols.filter((c) => isDay(c) && Number.isFinite(c.day))) take(sc, tCols.find((t) => isDay(t) && t.day === sc.day && !usedT.has(t.key)), 'day');

  for (const sc of sCols) {
    if (!sc.header) continue;
    take(sc, tCols.find((t) => !usedT.has(t.key) && t.header && normHeader(t.header) === normHeader(sc.header) && t.meaning === sc.meaning), 'header');
  }
  for (const sc of sCols.filter((c) => c.component && Number.isFinite(c.item))) {
    take(sc, tCols.find((t) => !usedT.has(t.key) && t.component === sc.component && t.item === sc.item), 'component');
  }
  for (const meaning of ['lrn', 'sex', 'total', 'average', 'grade', 'remarks', 'absences', 'tardies']) {
    const s = sCols.filter((c) => c.meaning === meaning && !pairs.some((p) => p.source.key === c.key));
    const t = tCols.filter((c) => c.meaning === meaning && !usedT.has(c.key));
    if (s.length === 1 && t.length === 1) take(s[0], t[0], 'meaning');
  }
  const unmappedSource = sCols.filter((c) => !pairs.some((p) => p.source.key === c.key));
  return { pairs, unmappedSource };
}

/** Human label for a column in previews: "Day 2", "Oct 7", or its header. */
function columnLabel(c) {
  if ((c.meaning === 'day' || c.meaning === 'date') && /^\d{1,2}$/.test(String(c.header).trim())) return `Day ${c.header.trim()}`;
  return c.header || c.key;
}

const isBlank = (v) => v === null || v === undefined || String(v).trim() === '';

/** Translates an attendance mark from the source's convention to the target's. */
function translateMark(value, sourceTable, targetTable) {
  const v = String(value ?? '').trim().toLowerCase();
  const sAbsent = (sourceTable.marks?.absent?.length ? sourceTable.marks.absent : ['x', 'a', 'absent']).map((m) => m.toLowerCase());
  const sTardy = (sourceTable.marks?.tardy || []).map((m) => m.toLowerCase());
  const tAbsent = targetTable.marks?.absent?.[0] ?? 'x';
  const tTardy = targetTable.marks?.tardy?.[0];
  const tPresent = targetTable.marks?.present?.find((m) => m !== '') ?? '';
  if (sAbsent.includes(v)) return tAbsent;
  if (sTardy.includes(v)) return tTardy ?? value;
  if (!v) return null; // blank stays blank (don't stamp "present" on unrecorded days)
  return tPresent || null;
}

function sameValue(a, b) {
  if (isBlank(a) && isBlank(b)) return true;
  if (typeof a === 'number' || typeof b === 'number') return Number(a) === Number(b);
  return String(a ?? '').trim().toLowerCase() === String(b ?? '').trim().toLowerCase();
}

function toEdit(loc, value, kind) {
  return kind === 'xlsx' ? { sheet: loc.sheet, cell: loc.cell, value } : { id: loc.id, text: value === null || value === undefined ? '' : String(value) };
}

/**
 * Plans the cell edits that copy `sourceTable` data into `targetTable`.
 * Returns { edits, changes, conflicts, unmatched, unmatchedTarget, nameFixes, columns, unmappedSource, stats }.
 */
export function planTransfer(sourceTable, targetTable, { targetKind, mapping, overwrite = false } = {}) {
  const { pairs, unmatched, unmatchedTarget } = matchLearners(sourceTable.learners, targetTable.learners);
  const { pairs: colPairs, unmappedSource } = mapColumns(sourceTable, targetTable, mapping);
  const edits = [];
  const changes = [];
  const conflicts = [];
  const isAttendance = (c) => c.meaning === 'day' || c.meaning === 'date';

  for (const { source, target, score, by } of pairs) {
    for (const cp of colPairs) {
      let value = source.values[cp.source.key];
      if (isAttendance(cp.source) && isAttendance(cp.target)) value = translateMark(value, sourceTable, targetTable);
      else if (isBlank(value)) continue;
      const loc = target.cells[cp.target.key];
      if (!loc) continue;
      const before = target.values[cp.target.key];
      if (sameValue(before, value)) continue;
      if (isBlank(value) && isBlank(before)) continue;
      const entry = { learner: source.name, targetName: target.name, column: columnLabel(cp.target), location: locationLabel(loc), before: before ?? '', after: value ?? '', matchedBy: by, matchScore: Math.round(score * 100) / 100 };
      if (!isBlank(before) && !overwrite) {
        conflicts.push(entry);
        continue;
      }
      edits.push(toEdit(loc, value, targetKind));
      changes.push(entry);
    }
  }

  const nameFixes = pairs
    .filter((p) => p.by === 'name' && normalizeLearnerName(p.source.name) !== normalizeLearnerName(p.target.name))
    .map((p) => ({ source: p.source.name, target: p.target.name, score: Math.round(p.score * 100) / 100 }));

  return {
    edits,
    changes,
    conflicts,
    unmatched: unmatched.map((u) => ({ name: u.learner.name, closest: u.closest })),
    unmatchedTarget: unmatchedTarget.map((t) => t.name),
    nameFixes,
    columns: colPairs.map((p) => ({ from: p.source.header || p.source.key, to: p.target.header || p.target.key, by: p.by })),
    unmappedSource: unmappedSource.map((c) => c.header || c.key),
    stats: {
      sourceLearners: sourceTable.learners.length,
      targetLearners: targetTable.learners.length,
      matched: pairs.length,
      cellsToChange: edits.length,
      conflicts: conflicts.length,
    },
  };
}

/**
 * Compares two canonical tables (e.g. SF1 vs class record, SF5 vs e-Class Record).
 * Returns roster differences, spelling variants, and value mismatches on shared columns.
 */
export function compareTables(aTable, bTable, { mapping } = {}) {
  const { pairs, unmatched, unmatchedTarget } = matchLearners(aTable.learners, bTable.learners);
  const { pairs: colPairs } = mapColumns(aTable, bTable, mapping);
  const mismatches = [];
  for (const { source, target } of pairs) {
    for (const cp of colPairs) {
      const a = source.values[cp.source.key];
      const b = target.values[cp.target.key];
      if (!sameValue(a, b)) {
        mismatches.push({ learner: source.name, otherName: target.name, column: cp.source.header || cp.source.key, a: a ?? '', b: b ?? '', aLocation: locationLabel(source.cells[cp.source.key]), bLocation: locationLabel(target.cells[cp.target.key]) });
      }
    }
  }
  const nameVariants = pairs
    .filter((p) => normalizeLearnerName(p.source.name) !== normalizeLearnerName(p.target.name))
    .map((p) => ({ a: p.source.name, b: p.target.name, score: Math.round(p.score * 100) / 100 }));
  return {
    onlyInA: unmatched.map((u) => ({ name: u.learner.name, closest: u.closest })),
    onlyInB: unmatchedTarget.map((t) => t.name),
    nameVariants,
    mismatches,
    comparedColumns: colPairs.map((p) => ({ a: p.source.header || p.source.key, b: p.target.header || p.target.key, by: p.by })),
    stats: { a: aTable.learners.length, b: bTable.learners.length, matched: pairs.length, mismatches: mismatches.length },
  };
}
