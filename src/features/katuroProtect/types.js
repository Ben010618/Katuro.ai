// kaTuro Protect — data shapes mirrored from KaturoProtect/kaTuro_Protect_BrainBank.md
// Parts G (form schemas), K1 (case state enum), L2 (incident registry), N2 (export).
// Plain JSDoc + factory functions, matching this project's JS (not TS) convention
// (see src/config/testBuilderConfig.js's makeEmptyCompetency/EMPTY_TOS for the
// same pattern elsewhere in the codebase).

// ─── Part K1 — case states ──────────────────────────────────────────────────
// Order matters: this is the case's forward path through the Next-Move Engine.
// Full next-move metadata (responsible/talk_to/form/citations per state) is
// built in Phase 5, not here — this enum is just what protect_cases.state is
// allowed to hold.
export const CASE_STATES = [
  'REPORTED', 'INTAKE_DONE', 'CLASSIFIED', 'PARENTS_NOTIFIED', 'FACTFINDING',
  'CPC_DELIBERATION', 'DECISION_ISSUED', 'REFERRED_OUT', 'MONITORING', 'REPORTING', 'CLOSED',
];

export const CASE_STATE_LABELS = {
  REPORTED:          'Reported',
  INTAKE_DONE:       'Intake Done',
  CLASSIFIED:        'Classified',
  PARENTS_NOTIFIED:  'Parents Notified',
  FACTFINDING:       'Fact-Finding',
  CPC_DELIBERATION:  'CPC Deliberation',
  DECISION_ISSUED:   'Decision Issued',
  REFERRED_OUT:      'Referred Out',
  MONITORING:        'Monitoring',
  REPORTING:         'Reporting',
  CLOSED:            'Closed',
};

// ─── Part G1 — Case Intake Sheet ────────────────────────────────────────────
/**
 * @typedef {Object} IntakeParty
 * @property {string} code_name
 * @property {string} [grade_section]
 * @property {string} [grade_section_or_position]
 * @property {string} role
 */
/**
 * @typedef {Object} IntakeForm
 * @property {string} case_id
 * @property {string} date_reported
 * @property {string} date_of_incident
 * @property {string} time
 * @property {string} location
 * @property {'learner'|'parent'|'teacher'|'anonymous'|'other'} reporter_role
 * @property {IntakeParty} complainant
 * @property {IntakeParty} respondent
 * @property {{code_name: string, role: string}[]} witnesses
 * @property {string} incident_narrative
 * @property {('physical'|'verbal'|'social'|'online'|'sexual'|'weapon'|'other')[]} modality
 * @property {boolean} repeated_or_pattern
 * @property {('screenshots'|'medical_cert'|'written_statement'|'cctv'|'other')[]} evidence
 * @property {string} immediate_actions_taken
 * @property {{name: string, position: string}} received_by
 */

/** @returns {IntakeForm} */
export function makeEmptyIntakeForm() {
  return {
    case_id: '',
    date_reported: '', date_of_incident: '', time: '', location: '',
    reporter_role: 'learner',
    complainant: { code_name: '', grade_section: '', role: 'learner' },
    respondent:  { code_name: '', grade_section_or_position: '', role: '' },
    witnesses: [],
    incident_narrative: '',
    modality: [],
    repeated_or_pattern: false,
    evidence: [],
    immediate_actions_taken: '',
    received_by: { name: '', position: '' },
  };
}

// ─── Part G2 — AI Classification Record ─────────────────────────────────────
/**
 * @typedef {Object} ClassificationRecord
 * @property {string} case_id
 * @property {'bullying'|'cyberbullying'|'gbsh'|'child_abuse'|'corporal_punishment'|'osaec_redflag'|'hazing'|'security_offense'|'mixed'} classification
 * @property {{id: string, sections: string[]}[]} governing_issuances
 * @property {{source: string, section: string, verbatim: string}[]} citations_quoted
 * @property {string} recommended_procedure
 * @property {string[]} referrals_required
 * @property {string[]} timelines
 * @property {'high'|'medium'|'low'} confidence
 * @property {boolean} human_review_required
 */

// ─── Part L2 — Repeat-incident registry ─────────────────────────────────────
/**
 * @typedef {Object} IncidentHistoryEntry
 * @property {string} case_id
 * @property {string} date
 * @property {string} classification
 * @property {'substantiated'|'unsubstantiated'|'referred'|'pending'} outcome
 * @property {'L1'|'L2'|'L3'} response_level_applied
 * @property {string[]} interventions
 * @property {boolean} completed
 */
/**
 * @typedef {Object} IncidentRegistryEntry
 * @property {string} learner_code       // coded — real identity lives in protect_identities, never here
 * @property {'respondent'|'victim'} role_in_incidents
 * @property {IncidentHistoryEntry[]} history
 * @property {('same_victim'|'same_modality'|'escalating_severity')[]} pattern_flags
 * @property {'T1_first'|'T2_repeat'|'T3_pattern'} computed_escalation_tier
 * @property {string[]} access_roles
 */

export const ESCALATION_TIERS = ['T1_first', 'T2_repeat', 'T3_pattern', 'T_RED'];

// ─── Part N2 — Case Action File export ──────────────────────────────────────
/**
 * @typedef {Object} NextMoveStep
 * @property {number} step
 * @property {string} action
 * @property {string} responsible
 * @property {{office: string, contact: string}} talk_to
 * @property {string} form
 * @property {string} deadline
 * @property {{source: string, section: string}[]} citations
 */
/**
 * @typedef {Object} CaseActionFileExport
 * @property {string} case_id
 * @property {string} generated_at
 * @property {string} generated_by_role
 * @property {string} state_at_export
 * @property {ClassificationRecord} classification
 * @property {string} escalation_tier
 * @property {NextMoveStep[]} next_moves
 * @property {string[]} documents
 * @property {{cpc_copy: string, parent_copy: string, division_copy: string}} distribution
 * @property {string} storage
 */
