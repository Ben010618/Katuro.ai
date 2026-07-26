// BrainBank Part M — pre-loaded office types. Each school fills in its real
// contact name/number in the Settings tab; the id is stable so a school's
// saved contact always matches back to the right office even if the label
// text is tweaked later.

export const REFERRAL_OFFICES = [
  // M1 — Internal (school level)
  { id: 'lfo',            category: 'internal', office: 'Learner Formation Officer (LFO)',        when: 'First response to any bullying report' },
  { id: 'guidance',       category: 'internal', office: 'Guidance Counselor / Designate',          when: 'Psychosocial first aid; interventions; monitoring' },
  { id: 'cpc',            category: 'internal', office: 'Child Protection Committee (CPC)',        when: 'Deliberation and determination of all CP cases' },
  { id: 'school_head',    category: 'internal', office: 'School Head',                             when: 'Convening CPC; decisions; external referrals; upward reporting' },
  { id: 'class_adviser',  category: 'internal', office: 'Class Adviser',                            when: 'Context, monitoring, classroom-level safeguards' },

  // M2 — Division / DepEd line
  { id: 'sdo_lrp_focal',  category: 'division', office: 'SDO Learner Rights and Protection (LRP) focal person', when: 'Guidance on procedure; escalation; consolidated reporting' },
  { id: 'division_legal', category: 'division', office: 'Division Legal Officer',                  when: 'Personnel administrative cases; legal questions beyond the corpus' },
  { id: 'sds',            category: 'division', office: 'Schools Division Superintendent',          when: 'Formal administrative complaints vs. personnel; appeals' },
  { id: 'regional_lrp',   category: 'division', office: 'Regional LRP Division',                    when: 'Escalation beyond division' },
  { id: 'lrpo_telesafe',  category: 'division', office: 'DepEd LRPO (Central) / Telesafe Helpline',  when: 'Any abuse report; when local channels fail or conflict of interest exists' },

  // M3 — External agencies
  { id: 'bcpc',           category: 'external', office: 'Barangay / BCPC',                          when: 'Community-level incidents; CICL diversion; family interventions' },
  { id: 'pnp_wcpd',       category: 'external', office: 'PNP Women and Children Protection Desk',   when: 'Physical/sexual abuse; violence against children' },
  { id: 'pnp_acg_nbi',    category: 'external', office: 'PNP Anti-Cybercrime Group / NBI Cybercrime Division', when: 'Cyberbullying with criminal elements; hacking; OSAEC; sextortion' },
  { id: 'dswd_lswdo',     category: 'external', office: 'DSWD / City-Municipal LSWDO',               when: 'Child welfare; CICL intervention/diversion; protective custody' },
  { id: 'prosecutor',     category: 'external', office: "Prosecutor's Office",                       when: 'Criminal complaints (filed by parents/guardians/authorities)' },
  { id: 'health_office',  category: 'external', office: 'Local Health Office / Mental Health Services', when: 'Medical exam; medico-legal; psychosocial services' },
  { id: 'npc',            category: 'external', office: 'National Privacy Commission (NPC)',         when: 'Data breaches involving case records' },
];

export const REFERRAL_CATEGORY_LABELS = {
  internal: 'Internal (School Level)',
  division: 'Division / DepEd Line',
  external: 'External Agencies',
};
