// BrainBank Part K1 — the Next-Move Engine table, verbatim in substance from
// the BrainBank (action/responsible/talk_to/form/governing source per case
// state). This is corpus-independent — it's DepEd procedure, not a legal
// citation requiring Layer 2 verbatim text — so it's safe to encode directly
// and use before the legal corpus is loaded.
//
// `talkToOffices` references ids from constants/referralOffices.js so
// NextMoveCard can merge in the school's real saved contact info.

export const NEXT_MOVE_ENGINE = {
  REPORTED: {
    action: 'Ensure immediate safety of the learner; log the report.',
    responsible: 'LFO / receiving teacher',
    talkTo: 'Victim (child-friendly manner), school head',
    talkToOffices: ['lfo', 'school_head'],
    form: 'G1 — Case Intake Sheet',
    governingSource: 'Revised IRR of RA 10627 (first response); DepEd Order No. 40, s. 2012',
  },
  INTAKE_DONE: {
    action: "Classify the case and check the repeat-incident registry for this learner.",
    responsible: 'LFO',
    talkTo: 'Guidance designate',
    talkToOffices: ['guidance'],
    form: 'G2 — AI Classification Record',
    governingSource: 'Revised IRR of RA 10627; DepEd Order No. 40, s. 2012',
  },
  CLASSIFIED: {
    action: 'Route the case: if school-jurisdiction, convene the CPC. If red-flag (OSAEC/abuse/weapons), make the external referral FIRST.',
    responsible: 'School head',
    talkTo: 'CPC members; if red-flag: PNP / DSWD',
    talkToOffices: ['cpc', 'pnp_wcpd', 'dswd_lswdo'],
    form: 'G4 — CPC Referral / Convening Memo, or an external referral letter',
    governingSource: 'Revised IRR of RA 10627, Sec. 14 (jurisdiction); RA 11930 protocol',
  },
  PARENTS_NOTIFIED: {
    action: 'Notify parents/guardians of ALL learners involved and schedule a conference.',
    responsible: 'School head / LFO',
    talkTo: 'Parents/guardians of victim AND respondent',
    talkToOffices: [],
    form: 'G5 — Parent/Guardian Notification Letter',
    governingSource: 'Revised IRR of RA 10627 — verify the exact notification timeline against verbatim text before quoting a deadline',
  },
  FACTFINDING: {
    action: 'Gather statements, authenticate electronic evidence, conduct child-friendly interviews.',
    responsible: 'CPC',
    talkTo: 'Witnesses and parties, interviewed separately',
    talkToOffices: [],
    form: 'Written statement forms; evidence log',
    governingSource: 'Revised IRR of RA 10627 (evidence handling)',
  },
  CPC_DELIBERATION: {
    action: 'CPC deliberates: determine the acts, select the graduated response level, design the intervention plan.',
    responsible: 'CPC (quorum)',
    talkTo: 'Division LRP focal, if guidance is needed',
    talkToOffices: ['sdo_lrp_focal'],
    form: 'Deliberation minutes; G8 — Intervention/Monitoring Plan',
    governingSource: "Revised IRR of RA 10627's leveled-response matrix — verify the exact levels against verbatim text",
  },
  DECISION_ISSUED: {
    action: 'Communicate the decision with due process (right to be heard, appeal info); implement discipline and interventions for BOTH parties.',
    responsible: 'School head',
    talkTo: 'Parties and parents; guidance counselor',
    talkToOffices: ['guidance'],
    form: 'Decision memo; G8 — Intervention/Monitoring Plan',
    governingSource: 'Revised IRR of RA 10627; DepEd Order No. 40, s. 2012; school handbook',
  },
  REFERRED_OUT: {
    action: 'Where criminal or welfare aspects exist: make the formal referral, turn over evidence, coordinate with the receiving agency.',
    responsible: 'School head',
    talkTo: 'PNP-WCPD / PNP-ACG / LSWDO / DSWD / Prosecutor, as applicable',
    talkToOffices: ['pnp_wcpd', 'pnp_acg_nbi', 'dswd_lswdo', 'prosecutor'],
    form: 'Referral letter + evidence inventory',
    governingSource: 'RA 9344; RA 11930; RA 10175',
  },
  MONITORING: {
    action: 'Scheduled check-ins with victim and respondent; track counseling attendance; watch for recurrence.',
    responsible: 'Guidance + LFO',
    talkTo: 'Learners, parents, class adviser',
    talkToOffices: ['class_adviser'],
    form: 'Monitoring log (G8 review entries)',
    governingSource: 'Revised IRR of RA 10627 (intervention & follow-through)',
  },
  REPORTING: {
    action: 'Submit case statistics in the consolidated semestral/year-end report.',
    responsible: 'School head',
    talkTo: 'SDO (Division), via the prescribed channel',
    talkToOffices: ['sdo_lrp_focal'],
    form: 'G6 — Division Office Report',
    governingSource: 'Revised IRR of RA 10627, Sec. 16',
  },
  CLOSED: {
    action: 'Closure criteria met — archive securely and retain per the retention schedule.',
    responsible: 'School head',
    talkTo: '—',
    talkToOffices: [],
    form: 'Closure note in the secure case logbook',
    governingSource: 'RA 10173 (Data Privacy Act — retention)',
  },
};
