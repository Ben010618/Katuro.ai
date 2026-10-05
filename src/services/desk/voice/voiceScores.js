/**
 * voiceScores.js — spoken score encoding (Phase 2 of voice input). Pure code.
 *
 * The teacher reads scores aloud ("Alvarez 18, Bautista 15, Cruz absent") or just the
 * scores in list order. The clip is turned into text with a strict line format; every
 * name is matched HERE, against the learner list of the teacher's own file (names never
 * go back to the AI). Nothing is guessed: a name that fits two learners, or none, is an
 * open question for the teacher. Scores above the highest possible score are flagged.
 * The result is the same cell-edit plan transfer_data produces, so writing goes through
 * the usual review -> Apply -> working copy + backup.
 */

import { locationLabel, toEdit } from '../understand/transfer.js';

const NOT_ENGLISH = '[not english]';
const NO_SPEECH = '[no speech]';

const ENGLISH_RULES = `- Voice input is English only. If most of the clip is spoken in Filipino, Tagalog, Taglish or another language that is not English, reply with exactly: ${NOT_ENGLISH}
- If there is no clear speech, reply with exactly: ${NO_SPEECH}
- Do not add, fix or guess anything that was not said.`;

/** Transcription prompt: names and scores, one per line. */
export const NAMED_SCORES_PROMPT = `A teacher is reading learners' names and their scores aloud, to record them.
Write one entry per line, exactly like this: <name> = <score>
- <score> is written in digits ("eighteen" becomes 18, "eighteen and a half" becomes 18.5), or the word absent when the teacher says the learner was absent.
- If the teacher corrects a score ("no, seventeen"), write only the corrected score.
- Write each name exactly as heard (Filipino surnames are common). If a name is said without a score, write: <name> = ?
${ENGLISH_RULES}
Reply with the lines only.`;

/** Transcription prompt: scores only, in the order of the learner list. */
export const LIST_SCORES_PROMPT = `A teacher is reading test scores aloud in order, one learner after another, without names.
Write one value per line, in the order spoken:
- the score in digits ("eighteen" becomes 18, "eighteen and a half" becomes 18.5),
- absent when the teacher says the learner was absent,
- skip when the teacher says skip or next without a score.
- If the teacher corrects a score ("no, seventeen"), write only the corrected score.
${ENGLISH_RULES}
Reply with the lines only.`;

/** Throws on "[not english]"; returns '' for "[no speech]". */
export function checkVoiceReply(text) {
  const t = String(text || '').trim();
  if (t.toLowerCase().includes(NOT_ENGLISH)) {
    const e = new Error('Voice input understands English only. Please read the scores again in English.');
    e.code = 'not-english';
    throw e;
  }
  return t.toLowerCase() === NO_SPEECH ? '' : t;
}

function parseValue(raw) {
  const v = String(raw ?? '').trim().replace(/[.;,]+$/, '').toLowerCase();
  if (/^\d+(\.\d+)?$/.test(v)) return Number(v);
  if (v === 'absent' || v === 'a') return 'absent';
  if (v === 'skip' || v === 'next') return 'skip';
  return null;
}

/** "Alvarez = 18" lines → [{ name, value }] (value: number | 'absent' | null when unclear). */
export function parseNamedScores(text) {
  const out = [];
  for (const raw of String(text || '').split(/\r?\n/)) {
    const line = raw.replace(/^\s*[-*•\d]+[.)]\s+/, '').trim();
    if (!line) continue;
    let name;
    let value;
    const eq = line.lastIndexOf('=');
    if (eq > 0) {
      name = line.slice(0, eq).trim();
      value = parseValue(line.slice(eq + 1));
    } else {
      // Fallback if the model ignored the format: "Alvarez 18" / "Alvarez: absent"
      const m = line.match(/^(.*?[a-zñ].*?)[\s,:-]+(\d+(?:\.\d+)?|absent)\.?$/i);
      if (!m) {
        out.push({ name: line.replace(/[.,;:]+$/, ''), value: null });
        continue;
      }
      name = m[1].trim();
      value = parseValue(m[2]);
    }
    if (name) out.push({ name: name.replace(/[,:;-]+$/, '').trim(), value: value === 'skip' ? null : value });
  }
  return out;
}

/** One value per line → [number | 'absent' | 'skip' | null]. */
export function parseListScores(text) {
  return String(text || '')
    .split(/\r?\n|,/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map(parseValue);
}

// ── Name matching ────────────────────────────────────────────────────────────

const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const compact = (s) => fold(s).replace(/[^a-z]/g, '');
const words = (s) => fold(s).split(/[^a-z]+/).filter((w) => w.length > 1);
const surnameOf = (name) => (String(name).includes(',') ? String(name).split(',')[0] : String(name));

function levRatio(a, b) {
  if (a === b) return 1;
  if (!a.length || !b.length) return 0;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return 1 - prev[b.length] / Math.max(a.length, b.length);
}

/**
 * Finds the learner a spoken name refers to.
 * Returns { status: 'ok', index, how } | { status: 'ambiguous', candidates } | { status: 'unknown', candidates }.
 *  1. exact surname ("Cruz" → CRUZ, ANA but not DE LA CRUZ, MARIA)
 *  2. every spoken word is in the learner's name ("Cruz Ana", "Ana Cruz")
 *  3. close spelling of the surname or full name — only when one learner is clearly closest
 */
export function matchSpokenName(spoken, learners) {
  const sp = compact(spoken);
  if (sp.length < 2) return { status: 'unknown', candidates: [] };
  const pick = (idxs, how) => (idxs.length === 1 ? { status: 'ok', index: idxs[0], how } : { status: 'ambiguous', candidates: idxs });

  const bySurname = learners.map((l, i) => (compact(surnameOf(l.name)) === sp ? i : -1)).filter((i) => i >= 0);
  if (bySurname.length) return pick(bySurname, 'surname');

  const sw = words(spoken);
  if (sw.length >= 2) {
    const byWords = learners
      .map((l, i) => {
        const set = new Set([...words(l.name), compact(surnameOf(l.name))]);
        return sw.every((w) => set.has(w)) ? i : -1;
      })
      .filter((i) => i >= 0);
    if (byWords.length) return pick(byWords, 'name');
  }

  const scored = learners
    .map((l, i) => {
      const sur = compact(surnameOf(l.name));
      const rest = compact(String(l.name).split(',').slice(1).join(' '));
      const s = Math.max(
        sur.length >= 4 ? levRatio(sp, sur) : 0,
        sw.length >= 2 ? Math.max(levRatio(sp, sur + rest), levRatio(sp, rest + sur)) : 0,
      );
      return { i, s };
    })
    .filter((x) => x.s >= 0.8)
    .sort((a, b) => b.s - a.s);
  if (!scored.length) return { status: 'unknown', candidates: [] };
  if (scored.length > 1 && scored[0].s - scored[1].s < 0.06) return { status: 'ambiguous', candidates: scored.filter((x) => scored[0].s - x.s < 0.06).map((x) => x.i) };
  return { status: 'ok', index: scored[0].i, how: 'close' };
}

// ── Session state (what has been heard so far) ───────────────────────────────

export const emptySession = () => ({ assignments: {}, cursor: 0, issues: [], nextIssueId: 1 });

const assign = (assignments, index, value, heard) => ({ ...assignments, [index]: { value, heard, replaced: index in assignments ? assignments[index].value : undefined } });

/** Adds a clip of "name = score" entries. A learner said twice keeps the latest score. */
export function addNamedEntries(session, entries, learners) {
  let { assignments, issues, nextIssueId } = session;
  for (const e of entries) {
    const m = matchSpokenName(e.name, learners);
    if (m.status === 'ok' && e.value !== null) {
      assignments = assign(assignments, m.index, e.value, e.name);
    } else {
      const kind = m.status === 'ok' ? 'no-score' : m.status;
      issues = [...issues, { id: nextIssueId++, kind, heard: e.name, value: e.value, candidates: m.status === 'ok' ? [m.index] : m.candidates }];
    }
  }
  return { ...session, assignments, issues, nextIssueId };
}

/** Adds a clip of scores read in list order, starting at the cursor. */
export function addListValues(session, values, learners) {
  let { assignments, issues, nextIssueId, cursor } = session;
  for (const v of values) {
    if (cursor >= learners.length) {
      issues = [...issues, { id: nextIssueId++, kind: 'extra', heard: v === null ? '(unclear)' : String(v), value: v === 'skip' ? null : v, candidates: [] }];
      continue;
    }
    if (v === 'skip') {
      cursor += 1;
      continue;
    }
    if (v === null) {
      issues = [...issues, { id: nextIssueId++, kind: 'unclear', heard: `(unclear, for ${learners[cursor].name})`, value: null, candidates: [cursor] }];
    } else {
      assignments = assign(assignments, cursor, v, `#${cursor + 1}`);
    }
    cursor += 1;
  }
  return { ...session, assignments, issues, nextIssueId, cursor };
}

/** Teacher answers an open question: give the heard score to this learner (or dismiss with index null). */
export function resolveIssue(session, issueId, index, value) {
  const issue = session.issues.find((i) => i.id === issueId);
  if (!issue) return session;
  const v = value !== undefined ? value : issue.value;
  const issues = session.issues.filter((i) => i.id !== issueId);
  if (index === null || index === undefined || v === null || v === undefined) return { ...session, issues };
  return { ...session, issues, assignments: assign(session.assignments, index, v, issue.heard) };
}

/** Teacher types or clears a score directly in the table ('' clears). */
export function setScore(session, index, raw) {
  const text = String(raw ?? '').trim();
  if (!text) {
    const rest = { ...session.assignments };
    delete rest[index];
    return { ...session, assignments: rest };
  }
  const value = parseValue(text);
  return { ...session, assignments: assign(session.assignments, index, value === null || value === 'skip' ? text : value, 'typed') };
}

export const setCursor = (session, index) => ({ ...session, cursor: Math.max(0, index) });

/** Problem with one score, or '' when fine. */
export function scoreProblem(value, maxScore) {
  if (value === 'absent') return '';
  if (typeof value !== 'number' || !Number.isFinite(value)) return 'Not a score';
  if (value < 0) return 'Below 0';
  if (Number.isFinite(maxScore) && maxScore > 0 && value > maxScore) return `Above ${maxScore}`;
  return '';
}

/**
 * Turns the session into the review plan (same shape as planTransfer), or explains
 * what must be fixed first. absentAs: 'blank' (nothing written) | 'zero'.
 */
export function buildScorePlan({ learners, column, kind, session, maxScore, absentAs, overwrite = false }) {
  const problems = [];
  if (!column) problems.push('Choose the column to fill.');
  if (!(Number.isFinite(maxScore) && maxScore > 0)) problems.push('Enter the highest possible score.');
  if (session.issues.length) problems.push(`Answer the ${session.issues.length} open question(s) first.`);
  const entries = Object.entries(session.assignments).map(([i, a]) => ({ index: Number(i), ...a }));
  const bad = entries.filter((e) => scoreProblem(e.value, maxScore));
  if (bad.length) problems.push(`Fix ${bad.length} score(s) marked in red.`);
  if (entries.some((e) => e.value === 'absent') && absentAs !== 'blank' && absentAs !== 'zero') problems.push('Choose how to record absent learners.');
  if (!entries.length) problems.push('No scores yet.');
  if (problems.length) return { ok: false, problems };

  const edits = [];
  const changes = [];
  const conflicts = [];
  for (const e of entries.sort((a, b) => a.index - b.index)) {
    const l = learners[e.index];
    const loc = l?.cells?.[column.key];
    if (!loc) continue;
    if (e.value === 'absent' && absentAs === 'blank') continue;
    const after = e.value === 'absent' ? 0 : e.value;
    const before = l.values?.[column.key];
    const blank = before === null || before === undefined || String(before).trim() === '';
    if (!blank && Number(before) === after) continue;
    const entry = { learner: e.heard === 'typed' ? l.name : String(e.heard), targetName: l.name, column: column.header || column.key, location: locationLabel(loc), before: before ?? '', after, matchedBy: 'voice', matchScore: 1 };
    if (!blank && !overwrite) {
      conflicts.push(entry);
      continue;
    }
    edits.push(toEdit(loc, after, kind));
    changes.push(entry);
  }
  const scored = new Set(entries.map((e) => e.index));
  return {
    ok: true,
    plan: {
      edits,
      changes,
      conflicts,
      unmatched: [],
      unmatchedTarget: learners.filter((_, i) => !scored.has(i)).map((l) => l.name),
      nameFixes: [],
      columns: [{ from: 'Voice', to: column.header || column.key, by: 'teacher' }],
      unmappedSource: [],
      stats: { sourceLearners: entries.length, targetLearners: learners.length, matched: entries.length, cellsToChange: edits.length, conflicts: conflicts.length },
    },
  };
}

/** The pending "changes" artifact for the review screen (same shape transfer_data produces). */
export function scoreChangesArtifact(plan, { targetPath, kind, columnLabel, now = Date.now() }) {
  const s = plan.stats;
  const subtitle = `${s.cellsToChange} score(s) to enter in ${columnLabel}${s.conflicts ? `, ${s.conflicts} already filled (kept)` : ''}. Review and tap Apply.`;
  return {
    id: `art-${now}-voice`,
    createdAt: now,
    sourceTool: 'voice_encode_scores',
    type: 'changes',
    title: `Scores for ${columnLabel}: ${targetPath.split('/').pop()}`,
    subtitle,
    files: [],
    editable: false,
    data: { targetPath, kind, ...plan, status: 'pending', operation: 'voice_scores' },
  };
}
