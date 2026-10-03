/**
 * teacherInfo.js — the teacher's profile and signatories, in one place.
 *
 * Teachers fill these once (Settings → Profile, or KaTuroDesk → Settings) and every
 * document generator reads them from here: DLL, ILAW lesson plans, COT, and all
 * KaTuroDesk outputs.
 *
 * RULE: anything left blank is NOT shown. No placeholders, no made-up default titles.
 */

export const HONORIFICS = ['Sir', "Ma'am", 'Mr.', 'Mrs.', 'Ms.', 'Dr.', 'Prof.'];

/** Optional signatories, in DepEd sign-off order (after "Prepared by" = the teacher). */
export const SIGNATORY_ROLES = [
  { key: 'masterTeacher', role: 'Master Teacher', label: 'Checked by:', example: 'Juliet Bulahan', examplePosition: 'Master Teacher II' },
  { key: 'headTeacher', role: 'Head Teacher', label: 'Reviewed by:', example: 'Lisette Quinay', examplePosition: 'Head Teacher III' },
  { key: 'principal', role: 'Principal / School Head', label: 'Approved by:', example: 'Dr. Aida M. Bejo', examplePosition: 'Principal IV' },
  { key: 'psds', role: 'Public Schools District Supervisor', label: 'Noted by:', example: 'Luis M. Germina', examplePosition: 'Public Schools District Supervisor' },
];

/** Profile fields teachers may edit (all optional). Stored flat on teachers/{uid}. */
export const PROFILE_FIELDS = [
  'userName', 'name', 'honorific',
  'school', 'schoolId', 'district', 'division', 'region', 'designation',
  ...SIGNATORY_ROLES.flatMap((r) => [`${r.key}Name`, `${r.key}Position`]),
];

const clean = (v) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '');

/**
 * Normalized teacher info. Every value is a trimmed string ('' when not filled).
 * Older profiles are read too: displayName/givenName for names, schoolName,
 * position, supervisorName/supervisorPosition (= Master Teacher).
 */
export function teacherInfo(profile, user) {
  const p = profile || {};
  const name = clean(p.name) || clean(p.fullName) || clean(p.displayName) || clean(user?.displayName);
  const signatories = {};
  for (const r of SIGNATORY_ROLES) {
    let n = clean(p[`${r.key}Name`]);
    let pos = clean(p[`${r.key}Position`]);
    if (r.key === 'masterTeacher' && !n) {
      n = clean(p.supervisorName);
      pos = pos || clean(p.supervisorPosition);
    }
    signatories[r.key] = { name: n, position: n ? pos : '' };
  }
  return {
    userName: clean(p.userName) || clean(p.givenName) || clean(p.firstName),
    name,
    honorific: clean(p.honorific),
    school: clean(p.school) || clean(p.schoolName),
    schoolId: clean(p.schoolId),
    district: clean(p.district),
    division: clean(p.division),
    region: clean(p.region),
    designation: clean(p.designation) || clean(p.position),
    signatories,
  };
}

/**
 * Sign-off blocks for a document: [{ label, name, position }], only for people
 * whose NAME is filled in (a position alone is never printed).
 * options.preparedBy  — include the teacher as "Prepared by:" (default true)
 * options.roles       — which signatories, in order (default all four)
 * options.labels      — per-document wording, e.g. { principal: 'Noted by:' }
 */
export function signatoryList(profile, { user, preparedBy = true, roles, labels = {} } = {}) {
  const t = teacherInfo(profile, user);
  const out = [];
  if (preparedBy && t.name) out.push({ label: labels.preparedBy || 'Prepared by:', name: t.name, position: t.designation });
  for (const r of SIGNATORY_ROLES) {
    if (roles && !roles.includes(r.key)) continue;
    const s = t.signatories[r.key];
    if (s.name) out.push({ label: labels[r.key] || r.label, name: s.name, position: s.position, role: r.key });
  }
  return out;
}

/** The facts an AI may use when writing documents (filled fields only). Never invent the rest. */
export function teacherFactsForAI(profile, user) {
  const t = teacherInfo(profile, user);
  const lines = [];
  if (t.name) lines.push(`Teacher: ${[t.honorific, t.name].filter(Boolean).join(' ')}${t.designation ? `, ${t.designation}` : ''}`);
  if (t.school) lines.push(`School: ${t.school}${t.schoolId ? ` (School ID ${t.schoolId})` : ''}`);
  if (t.district) lines.push(`District: ${t.district}`);
  if (t.division) lines.push(`Division: ${t.division}`);
  if (t.region) lines.push(`Region: ${t.region}`);
  for (const r of SIGNATORY_ROLES) {
    const s = t.signatories[r.key];
    if (s.name) lines.push(`${r.role}: ${s.name}${s.position ? `, ${s.position}` : ''}`);
  }
  return lines.length
    ? `Teacher profile (use these exact names and titles; leave out anything not listed — never invent names or placeholders):\n${lines.join('\n')}`
    : 'Teacher profile: not filled in. Do not invent names, schools or signatories; leave them out.';
}

/** How complete the profile is, for a gentle nudge in the UI. */
export function profileCompleteness(profile, user) {
  const t = teacherInfo(profile, user);
  const core = [t.userName, t.name, t.honorific, t.school, t.division, t.designation];
  const filled = core.filter(Boolean).length;
  return { filled, total: core.length, missing: ['User name', 'Full name', 'Title', 'School', 'Division', 'Position'].filter((_, i) => !core[i]) };
}
