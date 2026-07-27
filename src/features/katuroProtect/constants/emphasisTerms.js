// Case-defining terms that should always render bold in chat responses,
// regardless of whether the model itself thought to emphasize them —
// classification categories (BrainBank Part D), urgency/process terms, and
// sanction words in both English and Tagalog (chat responds in Tagalog by
// default, and Filipino professional speech commonly code-switches these
// exact English terms, so both are covered).
// Longest-first so a compound term (e.g. "Cyberbullying") is matched whole
// before a shorter one that could otherwise double-wrap part of it.
export const EMPHASIS_TERMS = [
  'Gender-Based Sexual Harassment',
  'Child Protection Committee',
  'Corporal Punishment',
  'Sexual Harassment',
  'Cyberbullying',
  'Cyber Bullying',
  'Child Abuse',
  'Sexual Abuse',
  'Emergency Protocol',
  'Unsubstantiated',
  'Substantiated',
  'Due Process',
  'Kaparusahan',
  'Expulsion',
  'Dismissal',
  'Suspension',
  'Red Flag',
  'Sanctions',
  'Sanction',
  'Bullying',
  'Weapons',
  'Weapon',
  'Hazing',
  'Parusa',
  'GBSH',
  'OSAEC',
  'CSAEM',
].sort((a, b) => b.length - a.length);
