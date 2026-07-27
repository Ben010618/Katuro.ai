// BrainBank Part E4/E5/E2 — red-flag emergency protocols. Per Part H rule 4
// and the BrainBank's Part O1 red-flag drill requirement: if a chat message
// hits any of these keyword sets, the matching protocol renders BEFORE the
// AI's response, every time — this check runs client-side, before the
// message is even sent to Gemini, so it can never be skipped by a bad model
// response.

export const RED_FLAG_PROTOCOLS = {
  osaec: {
    label: 'OSAEC / Intimate Images — Emergency Protocol',
    citation: 'RA 11930, RA 9995',
    steps: [
      'STOP internal handling. Do not download, forward, or screenshot-share the material beyond what reporting requires — preserve the device/evidence as-is.',
      'Report immediately: PNP Anti-Cybercrime Group (PNP-ACG) or NBI Cybercrime Division; DSWD; LRPO/Telesafe.',
      'Prioritize victim safety and psychosocial first aid.',
      'The school process continues ONLY for school-jurisdiction aspects (e.g. related bullying) — never as a substitute for the criminal referral.',
    ],
  },
  weapon: {
    label: 'Weapons / Threats — Emergency Protocol',
    citation: 'DepEd Order No. 006, s. 2026',
    steps: [
      'Immediate safety response per your school’s crisis protocol.',
      'Classify the offense per DO 006 severity tiers — verify exact tier wording against the verbatim order before acting.',
      'Coordinate with law enforcement for critical offenses (bomb threats, deadly weapons).',
      'Discipline follows the student handbook aligned to DO 006, with parallel CICL handling if the learner is a minor.',
    ],
  },
  personnel_abuse: {
    label: 'Personnel-Respondent Abuse — Emergency Protocol',
    citation: 'DepEd Order No. 40, s. 2012',
    steps: [
      'Immediate protective measures for the learner — separate from the respondent where warranted.',
      'Report upward to the Division Office without delay.',
      'Parallel referrals: criminal aspect → prosecutor/PNP Women and Children Protection Desk; welfare → DSWD/LSWDO; DepEd escalation → LRP Division / LRPO / Telesafe.',
      'If the respondent is the school head or a CPC member, route AROUND them — go directly to the SDO LRP focal, LRPO, or Telesafe (conflict-of-interest rule).',
    ],
  },
};

// Substring-matched, case-insensitive. Deliberately biased toward
// over-triggering rather than under-triggering — a false positive costs a
// CPC member one extra glance at a protocol card; a false negative could
// mean a real emergency gets treated as routine.
const KEYWORDS = {
  osaec: ['osaec', 'nude', 'naked photo', 'naked picture', 'sextortion', 'sexting', 'child porn', 'cp material', 'intimate photo', 'intimate video', 'private photo', 'private video', 'leaked photo', 'leaked video', 'inappropriate photo', 'inappropriate video', 'online sexual', 'grooming'],
  weapon: ['gun', 'knife', 'blade', 'weapon', 'bomb', 'shooting', 'shoot', 'stab', 'firearm', 'bullet', 'explosive'],
  personnel_abuse: ['teacher touched', 'teacher molested', 'teacher raped', 'teacher abused', 'personnel touched', 'sexually abused', 'sexual abuse by', 'molested', 'raped', 'groped by a teacher', 'groped by teacher'],
};

/** Returns an array of protocol keys ('osaec'|'weapon'|'personnel_abuse') triggered by the text, or []. */
export function detectRedFlags(text) {
  const t = (text || '').toLowerCase();
  return Object.entries(KEYWORDS)
    .filter(([, words]) => words.some((w) => t.includes(w)))
    .map(([key]) => key);
}
