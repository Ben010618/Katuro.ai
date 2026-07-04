// kaTuro Test Builder — config constants (DepEd Order No. 015, s. 2026)
// Product convention values (HOTS floors, cognitive presets) are marked as such —
// not hard DepEd numbers — kept here as named constants rather than magic numbers.

export const DAY_LIMIT = 50;

export const TERMS = ['Term 1', 'Term 2', 'Term 3'];

export const SUBJECTS = [
  'Science', 'Mathematics', 'English', 'Filipino',
  'Araling Panlipunan', 'MAPEH', 'GMRC', 'Makabansa',
  'Reading & Literacy', 'Language', 'TLE', 'EPP', 'ESP',
];

export const TEST_TYPES = [
  { value: 'ST1', label: 'Summative Test 1 (ST1)' },
  { value: 'ST2', label: 'Summative Test 2 (ST2)' },
  { value: 'TE',  label: 'Term Examination (TE)' },
];

export function testTypeLabel(testType) {
  return TEST_TYPES.find((t) => t.value === testType)?.label || testType || '';
}

// Optional class-average calibration for AI item difficulty — a rough sense
// of where students are starting from, not a DepEd grading band. Values are
// the class's current average score (%); the AI leans easier/harder and
// adjusts distractor plausibility accordingly (see testBuilderItemsAI.js).
export const PROFICIENCY_LEVELS = [
  { value: 75, label: '75% — Developing' },
  { value: 80, label: '80% — Approaching Proficiency' },
  { value: 90, label: '90% — Proficient' },
  { value: 95, label: '95% — Advanced' },
];

export function proficiencyLevelLabel(value) {
  return PROFICIENCY_LEVELS.find((p) => p.value === Number(value))?.label || '';
}

// Subjects whose medium of instruction is Filipino (Tagalog) — drives both the
// AI item-generation language and the static document text (directions,
// headers, answer-key labels). Everything else defaults to English.
export const FILIPINO_MEDIUM_SUBJECTS = new Set(['Filipino', 'ESP', 'Araling Panlipunan']);

export function deriveLanguage(subject) {
  return FILIPINO_MEDIUM_SUBJECTS.has(subject) ? 'fil' : 'en';
}

// Item formats the AI can draw from when generating the actual test paper.
// 'Matching Type' and 'True or False' spellings match the existing worksheet
// generator's labels (src/services/gamificationDocx.js) for consistency.
export const QUESTION_FORMATS = [
  'Multiple Choice',
  'True or False',
  'Matching Type',
  'Identification',
  'Enumeration',
  'Essay',
];

// Item ceiling table only defines KS2–KS4 (Grades 4–12) — DO 015 examinations
// (ST1/ST2/TE) apply from Grade 4 onward.
export const GRADE_LEVELS = [
  'Grade 4', 'Grade 5', 'Grade 6',
  'Grade 7', 'Grade 8', 'Grade 9', 'Grade 10',
  'Grade 11', 'Grade 12',
];

const GRADE_KEY_STAGE = {
  'Grade 4': 'KS2', 'Grade 5': 'KS2', 'Grade 6': 'KS2',
  'Grade 7': 'KS3', 'Grade 8': 'KS3', 'Grade 9': 'KS3', 'Grade 10': 'KS3',
  'Grade 11': 'KS4', 'Grade 12': 'KS4',
};

export function deriveKeyStage(gradeLevel) {
  return GRADE_KEY_STAGE[gradeLevel] || null;
}

export const KEY_STAGE_LABELS = {
  KS2: 'Key Stage 2 · Grades 4–6',
  KS3: 'Key Stage 3 · Grades 7–10',
  KS4: 'Key Stage 4 · Grades 11–12',
};

// TE items, ST1/ST2 max each (per Key Stage)
export const ITEM_CEILINGS = {
  KS2: { TE: 40, ST1: 20, ST2: 20 },
  KS3: { TE: 50, ST1: 25, ST2: 25 },
  KS4: { TE: 60, ST1: 30, ST2: 30 },
};

export function deriveItemCeiling(keyStage, testType) {
  return ITEM_CEILINGS[keyStage]?.[testType] ?? 0;
}

// Summative Tests (ST1/ST2): DepEd memo caps these at 25 items regardless of
// Key Stage, and lets the teacher pick the count (min 10) rather than a fixed
// auto value. Term Examination keeps the auto-derived ceiling above.
export const MANUAL_CEILING_TYPES = new Set(['ST1', 'ST2']);
export const MANUAL_CEILING_MIN = 10;
export const MANUAL_CEILING_MAX = 25;

export function isManualCeilingType(testType) {
  return MANUAL_CEILING_TYPES.has(testType);
}

export function manualCeilingOptions() {
  const opts = [];
  for (let n = MANUAL_CEILING_MIN; n <= MANUAL_CEILING_MAX; n++) opts.push(n);
  return opts;
}

// Single source of truth for the effective item ceiling — manual pick for
// ST1/ST2, DepEd auto-derived value for everything else.
export function resolveItemCeiling(keyStage, testType, manualCeiling) {
  if (isManualCeilingType(testType)) return manualCeiling || 0;
  return keyStage ? deriveItemCeiling(keyStage, testType) : 0;
}

// HOTS floor by Key Stage — product convention, not a hard DepEd number.
export const HOTS_FLOOR = { KS2: 0, KS3: 30, KS4: 40 };

export function deriveHotsFloor(keyStage) {
  return HOTS_FLOOR[keyStage] ?? 0;
}

export const COGNITIVE_LEVELS = [
  { key: 'remembering',   label: 'Remembering',   short: 'R',  hots: false },
  { key: 'understanding', label: 'Understanding', short: 'U',  hots: false },
  { key: 'applying',      label: 'Applying',      short: 'Ap', hots: false },
  { key: 'analyzing',     label: 'Analyzing',     short: 'An', hots: true  },
  { key: 'evaluating',    label: 'Evaluating',    short: 'E',  hots: true  },
  { key: 'creating',      label: 'Creating',      short: 'C',  hots: true  },
];

// Default cognitive preset (R/U/Ap/An/E/C) by Key Stage — product convention.
export const COGNITIVE_PRESETS = {
  KS2: { remembering: 30, understanding: 25, applying: 25, analyzing: 10, evaluating: 5,  creating: 5  },
  KS3: { remembering: 20, understanding: 20, applying: 20, analyzing: 16, evaluating: 14, creating: 10 },
  KS4: { remembering: 15, understanding: 15, applying: 20, analyzing: 20, evaluating: 15, creating: 15 },
};

export function derivePreset(keyStage) {
  return { ...(COGNITIVE_PRESETS[keyStage] || COGNITIVE_PRESETS.KS2) };
}

export function genCompetencyId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export function makeEmptyCompetency() {
  return { id: genCompetencyId(), text: '', days: 1 };
}

export const EMPTY_TOS = {
  rows: [],
  columnTotals: [0, 0, 0, 0, 0, 0],
  hotsCount: 0,
  hotsPct: 0,
};
