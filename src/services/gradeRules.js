/**
 * gradeRules.js — final ratings, general average and promotion status for the
 * report card and SF5. Only complete data produces a number: a term with no
 * grade is "missing", never skipped (skipping it made a Term-1-only student
 * look finished and PROMOTED).
 */

export const TERMS = ['term1', 'term2', 'term3'];
export const PASSING = 75;

const isGrade = (g) => typeof g === 'number' && Number.isFinite(g) && g > 0;

/** Final rating of one learning area: the mean of ALL term grades, or null if any is missing. */
export function subjectFinal(termGrades) {
  if (!Array.isArray(termGrades) || !termGrades.length || !termGrades.every(isGrade)) return null;
  return termGrades.reduce((a, b) => a + b, 0) / termGrades.length;
}

/** General average: mean of every learning area's final rating, or null if any is missing. */
export function generalAverage(finals) {
  if (!Array.isArray(finals) || !finals.length || !finals.every(isGrade)) return null;
  return finals.reduce((a, b) => a + b, 0) / finals.length;
}

/**
 * 'PROMOTED' when every learning area is complete and passed. Anything else is
 * left to the teacher (''): what happens with 1–2 or 3+ failed areas (remedial,
 * irregular, retained) depends on the grade level and DepEd's current rules.
 */
export function actionTaken(finals) {
  if (generalAverage(finals) === null) return '';
  return finals.every((f) => f >= PASSING) ? 'PROMOTED' : '';
}

/** Final ratings of a student for each subject: allGrades[term][subject][studentId].finalGrade */
export function studentFinals(allGrades, subjects, studentId, terms = TERMS) {
  return subjects.map((subj) => subjectFinal(terms.map((t) => allGrades?.[t]?.[subj]?.[studentId]?.finalGrade)));
}
