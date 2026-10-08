/**
 * depedActivities.js — every activity in the official SY 2026–2027 school calendar,
 * for the KaTuroDesk calendar (top bar → Calendar).
 *
 * Source: DepEd Order No. 9, s. 2026, read page by page from the official PDF:
 *   Annex B — Three-Term School Calendar in Basic Education for SY 2026–2027
 *             (EOSY 2025–2026 break, Terms 1–3, EOSY 2026–2027), pp. 20–25.
 *   Annex D — Calendar of Legislated Activities and Celebrations (yearly, June–May), pp. 29–55.
 * Transcribed as printed. Two notes kept as the order prints them: Annex D lists
 * "Philippines' Earth Day (22)" under May, and "National Human Rights Consciousness
 * Week (4–10)" under both December and January. The Term 3 header's "April 8, 2026"
 * is read as 2027 (Annex B's own month tables and the summary on p. 27 say 2027).
 */

export const DO9_SOURCE = 'DepEd Order No. 9, s. 2026';

/**
 * Annex B. `kind` sets the colour: term (start/end of a term), block (Opening /
 * Instructional / End-of-Term Block), assessment, pta, inset, break, holiday, activity.
 * Dates: `start` (+ `end` for a range) or `days` (a list of separate days).
 */
export const SCHOOL_ACTIVITIES = [
  // ── EOSY 2025–2026 ──
  { start: '2026-04-01', title: "Start of 30-day Teachers' EOSY Break", kind: 'break' },
  { start: '2026-04-02', title: 'Maundy Thursday', holiday: 'Regular Holiday', kind: 'holiday' },
  { start: '2026-04-03', title: 'Good Friday', holiday: 'Regular Holiday', kind: 'holiday' },
  { start: '2026-04-04', title: 'Black Saturday', holiday: 'Additional Special Non-Working Holiday', kind: 'holiday' },
  { start: '2026-04-09', title: 'The Day of Valor', holiday: 'Regular Holiday', kind: 'holiday' },
  { start: '2026-04-13', end: '2026-04-17', title: '2026 National Schools Press Conference (NSPC)', kind: 'activity' },
  { start: '2026-04-18', end: '2026-04-22', title: '2026 National Festival of Talents (NFOT)', kind: 'activity' },
  { start: '2026-04-25', end: '2026-04-30', title: '2026 Palarong Pambansa', kind: 'activity' },
  { start: '2026-05-01', title: 'Labor Day', holiday: 'Regular Holiday', kind: 'holiday' },
  { start: '2026-05-01', title: "End of 30-day Teachers' EOSY Break", kind: 'break' },
  { start: '2026-05-04', end: '2026-05-22', title: 'EOSY Intervention Program', kind: 'activity' },
  { start: '2026-05-04', end: '2026-05-29', title: 'Training Window for Teachers, School Heads, and Teaching Related-Personnel', kind: 'inset' },
  { start: '2026-05-04', end: '2026-05-29', title: 'Oplan Balik Eskwela', kind: 'activity' },

  // ── Term 1: June 8 – September 15, 2026 ──
  { start: '2026-06-01', end: '2026-06-05', title: 'Brigada Eskwela', kind: 'activity' },
  { start: '2026-06-01', end: '2026-06-05', title: 'Enrollment Period', kind: 'activity' },
  { start: '2026-06-08', end: '2026-06-11', title: 'Opening Block: Start of Term 1', kind: 'term' },
  { start: '2026-06-08', end: '2026-06-11', title: "Start of Mandatory Learners' Health Assessment, Learners and Parents' Orientation, and other activities", kind: 'activity' },
  { start: '2026-06-08', end: '2026-06-11', title: 'Start of Testing Window for BOSY Assessments (CRLA, RMA, Phil-IRI, etc.)', kind: 'assessment' },
  { start: '2026-06-08', end: '2026-06-11', title: 'Gathering and Submission of Data needed for the New School Year (e.g. Class Program, School Forms, etc.)', kind: 'activity' },
  { start: '2026-06-12', title: 'Independence Day', holiday: 'Regular Holiday', kind: 'holiday' },
  { start: '2026-06-22', end: '2026-06-26', title: 'Phil ECD Checklist for BOSY', kind: 'assessment' },
  { start: '2026-06-23', title: "DepEd's Founding Anniversary: Flag Raising Ceremony and Opening of Activity (Nationwide)", kind: 'activity' },
  { start: '2026-06-24', title: "DepEd's Founding Anniversary: Anniversary Proper", kind: 'activity' },
  { start: '2026-07-03', title: "End of Mandatory Learners' Health Assessment", kind: 'activity' },
  { start: '2026-07-06', title: 'Term 1: First Teacher-made Summative Test', kind: 'assessment' },
  { start: '2026-07-10', title: 'End of Testing Window for BOSY Assessments (CRLA, RMA, Phil-IRI, etc.)', kind: 'assessment' },
  { start: '2026-07-13', end: '2026-07-17', title: 'MFAT', kind: 'assessment' },
  { start: '2026-07-20', end: '2026-07-24', title: 'National Federation SELG and SSLG Election', kind: 'activity' },
  { start: '2026-07-28', title: 'Term 1: Second Teacher-made Summative Test', kind: 'assessment' },
  { start: '2026-08-21', title: 'Ninoy Aquino Day', holiday: 'Non-Working Holiday', kind: 'holiday' },
  { start: '2026-08-28', title: 'Term 1 Examination', kind: 'assessment' },
  { start: '2026-08-31', title: 'National Heroes Day', holiday: 'Regular Holiday', kind: 'holiday' },
  { start: '2026-09-01', title: 'Term 1 Examination', kind: 'assessment' },
  { start: '2026-09-05', title: "Start of National Teachers' Month", kind: 'activity' },
  { start: '2026-09-02', end: '2026-09-15', title: 'End-of-Term Block', kind: 'block' },
  { start: '2026-09-02', end: '2026-09-08', title: 'ARAL Program, Computation of Grades, Accomplishment of School Forms, & Co-/Extra-Curricular Activities', kind: 'activity' },
  { start: '2026-09-09', title: 'PTA Meeting & Distribution of Report Cards', kind: 'pta' },
  { start: '2026-09-10', end: '2026-09-11', title: 'INSET', kind: 'inset' },
  { start: '2026-09-10', end: '2026-09-15', title: 'Wellness Break of Learners (Guided asynchronous learning experiences)', kind: 'break' },
  { start: '2026-09-14', end: '2026-09-15', title: 'Wellness Break of Teachers', kind: 'break' },
  { start: '2026-09-15', title: 'End of Term 1', kind: 'term' },

  // ── Term 2: September 16 – December 18, 2026 ──
  { start: '2026-09-16', title: 'Start of Term 2', kind: 'term' },
  { start: '2026-09-16', title: 'Start of Testing Window for NCAE (Grade 10 only)', kind: 'assessment' },
  { start: '2026-09-21', end: '2026-09-25', title: 'Start of Testing Window for MOSY Assessments (CRLA, RMA, Phil-IRI, etc.)', kind: 'assessment' },
  { start: '2026-10-05', title: "Culmination of National Teachers' Month", kind: 'activity' },
  { start: '2026-10-05', title: "World Teachers' Day", kind: 'activity' },
  { start: '2026-10-05', end: '2026-10-09', title: 'NAT for Grade 10', kind: 'assessment' },
  { start: '2026-10-07', title: 'Term 2: First Teacher-made Summative Test', kind: 'assessment' },
  { start: '2026-10-19', end: '2026-10-23', title: 'End of Testing Window for MOSY Assessments (CRLA, RMA, Phil-IRI, etc.)', kind: 'assessment' },
  { start: '2026-10-29', title: 'Term 2: Second Teacher-made Summative Test', kind: 'assessment' },
  { start: '2026-11-01', title: "All Saints' Day", holiday: 'Special Non-Working Holiday', kind: 'holiday' },
  { start: '2026-11-02', title: "All Souls' Day", holiday: 'Additional Special Non-Working Holiday', kind: 'holiday' },
  { start: '2026-11-15', title: 'PEPT (Luzon & VisMin Clusters)', kind: 'assessment' },
  { start: '2026-11-27', title: 'Araw ng Pagbasa', kind: 'activity' },
  { start: '2026-11-30', title: 'Bonifacio Day', holiday: 'Regular Holiday', kind: 'holiday' },
  { start: '2026-12-03', end: '2026-12-04', title: 'Term 2 Examination', kind: 'assessment' },
  { start: '2026-12-04', title: 'End of Testing Window for NCAE (Grade 10 only)', kind: 'assessment' },
  { start: '2026-12-07', end: '2026-12-18', title: 'End-of-Term Block', kind: 'block' },
  { start: '2026-12-07', end: '2026-12-14', title: 'ARAL Program, Computation of Grades, Accomplishment of School Forms, & Co-/Extra-Curricular Activities', kind: 'activity' },
  { start: '2026-12-08', title: 'Feast of the Immaculate Concepcion of Mary', holiday: 'Special Non-Working Holiday', kind: 'holiday' },
  { start: '2026-12-15', title: 'PTA Meeting & Distribution of Progress/Performance Report', kind: 'pta' },
  { start: '2026-12-16', title: 'Year-End Activity', kind: 'activity' },
  { start: '2026-12-17', end: '2026-12-18', title: 'INSET', kind: 'inset' },
  { start: '2026-12-17', end: '2026-12-18', title: 'Wellness Break of Learners (Guided asynchronous learning experiences)', kind: 'break' },
  { start: '2026-12-18', title: 'End of Term 2', kind: 'term' },
  { start: '2026-12-19', end: '2026-12-31', title: 'Year-End Break (Wellness Break of Learners & Teachers)', kind: 'break' },
  { start: '2026-12-24', title: 'Christmas Eve', holiday: 'Special Non-Working Holiday', kind: 'holiday' },
  { start: '2026-12-25', title: 'Christmas Day', holiday: 'Regular Holiday', kind: 'holiday' },
  { start: '2026-12-30', title: 'Rizal Day', holiday: 'Regular Holiday', kind: 'holiday' },
  { start: '2026-12-31', title: 'Last Day of the Year', holiday: 'Special Non-Working Holiday', kind: 'holiday' },

  // ── Term 3: January 4 – April 8, 2027 ──
  { start: '2027-01-01', title: "New Year's Day", holiday: 'Regular Holiday', kind: 'holiday' },
  { start: '2027-01-04', title: 'Start of Term 3', kind: 'term' },
  { start: '2027-01-25', title: 'Term 3: First Teacher-made Summative Test', kind: 'assessment' },
  { start: '2027-01-30', title: 'Start of Early Registration for Incoming Kinder, Grades 1, 7, 11, OSCYA, and Transferees', kind: 'activity' },
  { start: '2027-02-01', end: '2027-02-05', title: 'Start of Testing Window for EOSY Assessments (CRLA, RMA, Phil-IRI, etc.)', kind: 'assessment' },
  { start: '2027-02-06', title: 'Chinese New Year', holiday: 'Additional Special Non-Working Holiday', kind: 'holiday' },
  { start: '2027-02-15', end: '2027-02-19', title: 'NAT for Grade 12', kind: 'assessment' },
  { start: '2027-02-16', title: 'Term 3: Second Teacher-made Summative Test', kind: 'assessment' },
  { start: '2027-02-26', title: 'End of Early Registration for Incoming Kinder, Grades 1, 7, 11, OSCYA, and Transferees', kind: 'activity' },
  { start: '2027-03-01', end: '2027-03-05', title: 'ELLNA for Grade 3', kind: 'assessment' },
  { start: '2027-03-08', end: '2027-03-12', title: 'NAT for Grade 6', kind: 'assessment' },
  { start: '2027-03-08', end: '2027-03-12', title: 'End of Testing Window for EOSY Assessments (CRLA, RMA, Phil-IRI, etc.)', kind: 'assessment' },
  { start: '2027-03-15', end: '2027-03-16', title: 'Term 3 Examination (Moving up/Graduating Learners)', kind: 'assessment' },
  { start: '2027-03-15', end: '2027-03-19', title: 'Phil ECD Checklist for EOSY', kind: 'assessment' },
  { start: '2027-03-17', end: '2027-03-23', title: 'Computation of Grades, Accomplishment of School Forms, and Academic Deliberation (Moving Up/Graduating Learners)', kind: 'activity' },
  { start: '2027-03-22', end: '2027-03-23', title: 'Term 3 Examination (Other Grade Levels)', kind: 'assessment' },
  { days: ['2027-03-24', '2027-03-29', '2027-03-30', '2027-03-31'], title: 'End-of-Term Block', kind: 'block' },
  { start: '2027-03-24', title: 'Announcement of Academic Excellence Awardees (Moving up/Graduating Learners)', kind: 'activity' },
  { days: ['2027-03-24', '2027-03-29', '2027-03-30', '2027-03-31'], title: 'Computation of Grades (Other Grade Levels), Accomplishment of School Forms, & Co-/Extra-Curricular Activities', kind: 'activity' },
  { start: '2027-03-25', title: 'Maundy Thursday', holiday: 'Regular Holiday', kind: 'holiday' },
  { start: '2027-03-26', title: 'Good Friday', holiday: 'Regular Holiday', kind: 'holiday' },
  { start: '2027-03-27', title: 'Black Saturday', holiday: 'Additional Special Non-Working Holiday', kind: 'holiday' },
  { start: '2027-04-01', end: '2027-04-08', title: 'End-of-Term Block', kind: 'block' },
  { start: '2027-04-01', title: 'Accomplishment of School Forms & Co-/Extra-Curricular Activities', kind: 'activity' },
  { days: ['2027-04-02', '2027-04-05'], title: 'INSET', kind: 'inset' },
  { start: '2027-04-06', end: '2027-04-07', title: 'EOSY Rites', kind: 'activity' },
  { start: '2027-04-08', title: 'PTA Meeting & Distribution of Report Cards', kind: 'pta' },
  { start: '2027-04-08', title: 'End of Term 3', kind: 'term' },

  // ── EOSY 2026–2027 ──
  { start: '2027-04-09', title: 'The Day of Valor', holiday: 'Regular Holiday', kind: 'holiday' },
  { start: '2027-04-09', title: "Start of 30-day Teachers' EOSY Break", kind: 'break' },
  { start: '2027-04-19', end: '2027-04-23', title: '2027 NSPC', kind: 'activity' },
  { start: '2027-04-26', end: '2027-04-30', title: '2027 NFOT', kind: 'activity' },
  { start: '2027-05-01', title: 'Labor Day', holiday: 'Regular Holiday', kind: 'holiday' },
  { start: '2027-05-03', end: '2027-05-07', title: '2027 Palarong Pambansa', kind: 'activity' },
  { start: '2027-05-09', title: "End of 30-day Teachers' EOSY Break", kind: 'break' },
  { start: '2027-05-10', end: '2027-05-14', title: 'Start of EOSY Intervention Program', kind: 'activity' },
  { start: '2027-05-10', end: '2027-05-14', title: 'Start of Training Window for Teachers, School Heads, and Teaching Related-Personnel', kind: 'inset' },
  { start: '2027-05-17', title: 'Start of Oplan Balik Eskwela', kind: 'activity' },
  { start: '2027-06-01', end: '2027-06-04', title: 'End of Training Window for Teachers, School Heads, and Teaching Related-Personnel', kind: 'inset' },
  { start: '2027-06-04', title: 'End of Oplan Balik Eskwela', kind: 'activity' },
  { start: '2027-06-07', end: '2027-06-11', title: 'Brigada Eskwela', kind: 'activity' },
  { start: '2027-06-07', end: '2027-06-11', title: 'Enrollment Period', kind: 'activity' },
];

/**
 * Annex D (every year, June to May). `when`:
 *   { days: [a, b] } a range in the month · { day } one day · { nth, weekday } e.g. 3rd
 *   Saturday (0 = Sunday) · { label } a week the order names without exact days
 *   ("3rd Week") · { from: 'MM-DD', to: 'MM-DD' } across months.
 */
export const OBSERVANCES = [
  // June
  { month: 6, when: { days: [1, 30] }, title: 'National Dengue Awareness Month', basis: 'PP No. 1204, s. 1998' },
  { month: 6, when: { days: [1, 30] }, title: 'National Kidney Month', basis: 'PP No. 184, s. 1993' },
  { month: 6, when: { days: [1, 30] }, title: 'W.A.T.C.H. (We Advocate Time Consciousness and Honesty) Month', basis: 'PP No. 1782, s. 2009' },
  { month: 6, when: { days: [1, 30] }, title: 'Philippine Environment Month', basis: 'PP No. 237, s. 1988' },
  { month: 6, when: { days: [1, 30] }, title: 'National Information and Communications Technology Month', basis: 'PP No. 1521, s. 2008' },
  { month: 6, when: { day: 5 }, title: 'World Environmental Day', basis: 'PP No. 1149, s. 1973' },
  { month: 6, when: { label: '3rd week' }, title: 'National Safe Kids Week', basis: 'PP No. 1307, s. 2007' },
  { month: 6, when: { day: 23 }, title: 'Department of Education Founding Anniversary', basis: 'AO No. 322, s. 1997' },
  { month: 6, when: { day: 26 }, title: 'International Day Against Drug Abuse and Illicit Trafficking', basis: 'PP No. 264, s. 1988' },
  { month: 6, when: { day: 30 }, title: 'Commemoration of the Historic Siege of Baler and Philippine-Spanish Friendship Day', basis: 'RA No. 9187' },
  // July
  { month: 7, when: { days: [1, 31] }, title: 'National Disaster Resilience Month', basis: 'EO No. 29, s. 2017' },
  { month: 7, when: { days: [1, 31] }, title: 'Nutrition Month', basis: 'PD No. 491, s. 1974' },
  { month: 7, when: { label: '3rd week' }, title: 'National Disability Prevention and Rehabilitation Week', basis: 'PP No. 361, s. 2000; PP No. 1870, s. 1979' },
  { month: 7, when: { label: 'Last week' }, title: 'Linggo ng Musikang Pilipino', basis: 'PP No. 993, s. 2014' },
  // August
  { month: 8, when: { day: 1 }, title: 'White Cane Safety Day', basis: 'RA No. 6759' },
  { month: 8, when: { days: [1, 31] }, title: 'Buwan ng Wikang Pambansa', basis: 'Proklamasyong Blg. 1041, s. 1997' },
  { month: 8, when: { days: [1, 31] }, title: 'ASEAN Month', basis: 'Proclamation No. 282, s. 2017' },
  { month: 8, when: { days: [1, 31] }, title: 'National Adolescent Immunization Month', basis: 'Health Calendar 2023 (DOH)' },
  { month: 8, when: { days: [1, 31] }, title: 'Breastfeeding Awareness Month', basis: 'RA No. 10028' },
  { month: 8, when: { days: [1, 31] }, title: 'National Lung Month', basis: 'PP No. 1761, s. 1978' },
  { month: 8, when: { days: [1, 31] }, title: 'Sight Saving Month', basis: 'DOH Calendar 2023' },
  { month: 8, when: { days: [1, 31] }, title: 'History Month', basis: 'PP No. 339, s. 2012' },
  { month: 8, when: { label: '1st week' }, title: 'Sight-Conservation Week', basis: 'PP No. 40, s. 1954' },
  { month: 8, when: { day: 9 }, title: 'National Indigenous Peoples Day', basis: 'RA No. 10689' },
  { month: 8, when: { day: 12 }, title: 'Philippine International Youth Day', basis: 'PP No. 229, s. 2002' },
  { month: 8, when: { label: 'The week of August 12 (International Youth Day)' }, title: 'Linggo ng Kabataan', basis: 'RA No. 10742' },
  { month: 8, when: { day: 19 }, title: 'Commemoration of the Birth Anniversary of President Manuel L. Quezon', basis: 'RA No. 6741' },
  { month: 8, when: { day: 19 }, title: 'World Humanitarian Day', basis: 'UN General Assembly Resolution A/63/L.49' },
  { month: 8, when: { day: 25 }, title: 'National Tech-Voc Day', basis: 'RA No. 10970' },
  // September
  { month: 9, when: { days: [1, 30] }, title: 'National Peace Consciousness Month', basis: 'PP No. 675, s. 2004' },
  { month: 9, when: { label: '1st week' }, title: 'Maritime and Archipelagic Nation Awareness Month', basis: 'PP No. 316, s. 2017' },
  { month: 9, when: { days: [2, 8] }, title: 'National Crime Prevention Week', basis: 'PP No. 461, s. 1994' },
  { month: 9, when: { day: 8 }, title: 'Literacy Week Celebration', basis: 'PP No. 239, s. 1993' },
  { month: 9, when: { day: 8 }, title: 'International Literacy Day / National Literacy Day', basis: 'UNESCO, 14th Session (November 1966)' },
  { month: 9, when: { from: '09-05', to: '10-05' }, title: "National Teachers' Month", basis: 'PP No. 242, s. 2011' },
  { month: 9, when: { day: 21 }, title: 'International Day of Peace in the Philippines', basis: 'PP No. 1881, s. 2009' },
  { month: 9, when: { day: 10 }, title: 'World Suicide Prevention Day', basis: 'IASP with WHO and WFMH' },
  { month: 9, when: { nth: 3, weekday: 6 }, title: 'International Coastal Clean-up Day', basis: 'PP No. 470, s. 2003' },
  { month: 9, when: { label: '3rd week' }, title: 'Linggo ng Kasuotang Pilipino', basis: 'PP No. 241, s. 1993' },
  { month: 9, when: { nth: 4, weekday: 1 }, title: '"Salu-salo ng Pamilya Mahalaga" Day', basis: 'PP No. 1895, s. 2009' },
  { month: 9, when: { label: 'Last week' }, title: 'Family Week', basis: 'PP No. 60, s. 1992' },
  // October
  { month: 10, when: { days: [1, 31] }, title: 'Consumer Welfare Month', basis: 'PP No. 1098, s. 1997' },
  { month: 10, when: { days: [1, 31] }, title: 'National Indigenous Peoples Month', basis: 'PP No. 1906, s. 2009' },
  { month: 10, when: { days: [1, 31] }, title: 'National Scouting Month', basis: 'PP No. 1326, s. 1974' },
  { month: 10, when: { label: '1st week' }, title: 'Linggo ng Katandaang Filipino (Elderly Filipino Week)', basis: 'PP No. 470, s. 1994' },
  { month: 10, when: { day: 5 }, title: "World Teachers' Day", basis: 'UNESCO' },
  { month: 10, when: { day: 5 }, title: "National Teachers' Day", basis: 'RA No. 10743' },
  { month: 10, when: { label: '2nd week' }, title: 'National Mental Health Week', basis: 'PP No. 452, s. 1994' },
  { month: 10, when: { day: 13 }, title: 'International Day of Disaster Risk Reduction', basis: 'UN General Assembly Resolution 64/200; Sendai Framework' },
  { month: 10, when: { days: [18, 24] }, title: 'United Nations Week', basis: 'PP No. 483, s. 2003' },
  { month: 10, when: { label: '3rd week' }, title: 'ADHD Awareness Week', basis: 'Presidential Proclamation No. 472' },
  { month: 10, when: { label: '4th week' }, title: 'Juvenile Justice and Welfare Consciousness Week', basis: 'PP No. 489, s. 2012' },
  // November
  { month: 11, when: { days: [1, 30] }, title: 'Filipino Values Month', basis: 'PP No. 479, s. 1994' },
  { month: 11, when: { days: [1, 30] }, title: 'Malaria Awareness Month', basis: 'PP No. 1168, s. 2006' },
  { month: 11, when: { days: [1, 30] }, title: "National Children's Month", basis: 'RA No. 10661' },
  { month: 11, when: { days: [1, 30] }, title: 'National Environment Awareness Month', basis: 'RA No. 9512' },
  { month: 11, when: { days: [1, 30] }, title: 'Library and Information Services Month', basis: 'PP No. 837, s. 1991' },
  { month: 11, when: { days: [10, 16] }, title: 'Deaf Awareness Week', basis: 'PP No. 829, s. 1991' },
  { month: 11, when: { day: 5 }, title: 'World Tsunami Awareness Day', basis: 'UN General Assembly Resolution (A/RES/70/203)' },
  { month: 11, when: { day: 7 }, title: 'Sheikh Karimul Makhdum Day', basis: 'RA No. 12228' },
  { month: 11, when: { label: '2nd week' }, title: 'Economic and Financial Literacy Week', basis: 'RA No. 10922' },
  { month: 11, when: { day: 17 }, title: "National Students' Day", basis: 'RA No. 11369' },
  { month: 11, when: { days: [19, 25] }, title: 'Global Warming and Climate Change Consciousness Week', basis: 'PP No. 1667, s. 2008' },
  { month: 11, when: { nth: 3, weekday: 0 }, title: 'National Day of Remembrance for Road Crash Victims, Survivors, and their Families', basis: 'RA No. 11468' },
  { month: 11, when: { day: 25 }, title: 'National Consciousness Day for the Elimination of Violence Against Women and Children (VAWC)', basis: 'RA No. 10398' },
  { month: 11, when: { day: 25 }, title: 'National Day for Youth in Climate Action', basis: 'PP No. 1160, s. 2015' },
  { month: 11, when: { from: '11-25', to: '12-12' }, title: '18-day Campaign to End Violence Against Women (VAW)', basis: 'PP No. 1172, s. 2006' },
  { month: 11, when: { day: 27 }, title: 'Araw ng Pagbasa', basis: 'RA No. 10556' },
  { month: 11, when: { label: '4th week' }, title: 'Week of the Gifted and Talented', basis: 'Presidential Proclamation No. 199, s. 1999' },
  { month: 11, when: { label: '4th week' }, title: 'National Science and Technology Week', basis: 'PP No. 780, s. 2019' },
  { month: 11, when: { label: 'Last week' }, title: 'National Music Week for Young Artists', basis: 'PP No. 25, s. 1998' },
  // December
  { month: 12, when: { day: 1 }, title: 'World AIDS Day', basis: 'United Nations / UNAIDS' },
  { month: 12, when: { day: 3 }, title: 'International Day of Persons with Disabilities in the Philippines', basis: 'Presidential Proclamation No. 1157' },
  { month: 12, when: { days: [1, 31] }, title: 'Firecrackers Injury Prevention Month', basis: 'Health Calendar 2023 (DOH)' },
  { month: 12, when: { days: [4, 10] }, title: 'National Human Rights Consciousness Week', basis: 'RA No. 9201' },
  { month: 12, when: { nth: 2, weekday: 0 }, title: "National Children's Day of Broadcasting", basis: 'RA No. 8296' },
  { month: 12, when: { label: '2nd week' }, title: 'Education Week', basis: 'PP No. 2399, s. 1985' },
  // January
  { month: 1, when: { days: [1, 31] }, title: 'Food Conservation Month', basis: 'PP No. 1398, s. 1975' },
  { month: 1, when: { days: [1, 31] }, title: 'Zero Waste Month', basis: 'PP No. 760, s. 2014' },
  { month: 1, when: { days: [1, 31] }, title: 'Firecrackers Injury Prevention Month', basis: 'Health Calendar 2023 (DOH)' },
  { month: 1, when: { days: [4, 10] }, title: 'National Human Rights Consciousness Week', basis: 'RA No. 9201' },
  { month: 1, when: { label: '3rd week' }, title: 'National Cancer Consciousness Week', basis: 'PP No. 1348, s. 1974' },
  { month: 1, when: { label: '3rd week' }, title: 'National Autism Consciousness Week', basis: 'Presidential Proclamation No. 711, s. 1996' },
  { month: 1, when: { day: 23 }, title: 'Commemoration of the First Philippine Republic Day', basis: 'RA No. 11014' },
  // February
  { month: 2, when: { label: 'The whole month' }, title: 'National Down Syndrome Awareness Month', basis: 'Presidential Proclamation No. 157, s. 2002' },
  { month: 2, when: { label: 'The whole month' }, title: 'National Arts Month', basis: 'PP No. 683, s. 1991' },
  { month: 2, when: { day: 1 }, title: 'National Hijab Day', basis: 'RA No. 12224' },
  { month: 2, when: { days: [1, 28] }, title: 'National Dental Health Month', basis: 'PP No. 559, s. 2004' },
  { month: 2, when: { days: [1, 28] }, title: 'Philippine Heart Month', basis: 'PP No. 1096, s. 1973' },
  { month: 2, when: { nth: 1, weekday: 6 }, title: 'Adoption Consciousness Day', basis: 'PP No. 72, s. 1999' },
  { month: 2, when: { day: 11 }, title: 'International Day of Women and Girls in Science', basis: 'UN General Assembly A/RES/70/212' },
  { month: 2, when: { nth: 2, weekday: 2 }, title: 'Safer Internet Day for Children Philippines', basis: 'PP No. 417, s. 2018' },
  { month: 2, when: { label: '2nd week' }, title: 'National Awareness Week for the Prevention of Child Sexual Abuse and Exploitation', basis: 'PP No. 731, s. 1996' },
  { month: 2, when: { label: '2nd week' }, title: 'Intellectual Disability Awareness Week', basis: 'Presidential Proclamation No. 1385, s. 1975' },
  { month: 2, when: { days: [22, 25] }, title: 'EDSA People Power Commemoration Week', basis: 'PP No. 1224, s. 2007' },
  { month: 2, when: { label: 'Last week' }, title: 'Leprosy Control Week', basis: 'PP No. 467, s. 1965' },
  // March
  { month: 3, when: { days: [1, 31] }, title: 'Fire Prevention Month', basis: 'PP No. 115-A, s. 1966' },
  { month: 3, when: { days: [1, 31] }, title: "Women's Role in History Month", basis: 'PP No. 227, s. 1998' },
  { month: 3, when: { label: '1st week' }, title: "Women's Week", basis: 'PP No. 224, s. 1988' },
  { month: 3, when: { day: 8 }, title: "Women's Rights and International Day of Peace", basis: 'PP No. 224, s. 1988' },
  { month: 3, when: { label: '4th week' }, title: 'Protection and Gender-Fair Treatment of the Girl Child Week', basis: 'PP No. 759, s. 1996' },
  // April
  { month: 4, when: { days: [1, 30] }, title: 'National Intellectual Property Month', basis: 'PP No. 190, s. 2017' },
  { month: 4, when: { day: 2 }, title: "Commemoration of the Birth Anniversary of Francisco 'Balagtas' Baltazar", basis: 'PP No. 964, s. 1997' },
  { month: 4, when: { day: 9 }, title: 'Commemoration of the Araw ng Kagitingan', basis: 'EO No. 203, s. 1987' },
  { month: 4, when: { day: 21 }, title: 'Philippine Innovation Day', basis: 'RA No. 11293' },
  { month: 4, when: { day: 28 }, title: 'International Girls in ICT Day', basis: 'ITU Plenipotentiary Resolution 70 (Rev. Busan, 2014)' },
  // May
  { month: 5, when: { day: 7 }, title: "Health Workers' Day", basis: 'RA No. 10069' },
  { month: 5, when: { day: 17 }, title: 'World Information Society Day', basis: 'UN General Assembly Resolution A/RES/60/252' },
  { month: 5, when: { day: 22 }, title: 'Commemoration of the Philippine-Australia Friendship Day', basis: 'PP No. 1282, s. 2016' },
  { month: 5, when: { day: 22 }, title: "Philippines' Earth Day", basis: 'PP No. 1481, s. 2008' },
  { month: 5, when: { from: '05-28', to: '06-12' }, title: 'Display of the National Flag', basis: 'EO No. 179, s. 1994' },
  { month: 5, when: { day: 28 }, title: 'Flag Day', basis: 'PP No. 374, s. 1965' },
  { month: 5, when: { day: 31 }, title: 'World No Tobacco Day', basis: 'Res. WHA 42.19, 1988' },
];

const pad = (n) => String(n).padStart(2, '0');
export const isoOf = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;
const daysInMonth = (y, m) => new Date(y, m, 0).getDate();

/** The day of the month of the nth weekday (0 = Sunday), e.g. 3rd Saturday. */
export function nthWeekday(y, m, nth, weekday) {
  const first = new Date(y, m - 1, 1).getDay();
  const day = 1 + ((weekday - first + 7) % 7) + (nth - 1) * 7;
  return day <= daysInMonth(y, m) ? day : null;
}

/** The year an Annex D month falls in for the school year starting in June of `syStart`. */
const yearFor = (syStart, month) => (month >= 6 ? syStart : syStart + 1);

function inSchoolActivity(a, iso) {
  if (a.days) return a.days.includes(iso);
  return iso >= a.start && iso <= (a.end || a.start);
}

/** Annex D observances on one day (dated ones only) for SY 2026–2027. */
function observancesOn(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  const syStart = m >= 6 ? y : y - 1;
  if (syStart !== 2026) return [];
  return OBSERVANCES.filter((o) => {
    const w = o.when;
    if (w.from) {
      const fromY = yearFor(syStart, Number(w.from.slice(0, 2)));
      const toY = yearFor(syStart, Number(w.to.slice(0, 2)));
      return iso >= `${fromY}-${w.from}` && iso <= `${toY}-${w.to}`;
    }
    if (o.month !== m) return false;
    if (w.days) return d >= w.days[0] && d <= w.days[1];
    if (w.day) return d === w.day;
    if (w.nth) return nthWeekday(y, m, w.nth, w.weekday) === d;
    return false;
  });
}

/**
 * Everything on one day: { school: [...Annex B], observances: [...Annex D] }.
 * Long month-long observances are left out of `observances` unless asked for, so a
 * day stays readable.
 */
export function activitiesOn(iso, { includeMonthLong = false } = {}) {
  const school = SCHOOL_ACTIVITIES.filter((a) => inSchoolActivity(a, iso));
  const observances = observancesOn(iso).filter((o) => includeMonthLong || !isMonthLong(o));
  return { school, observances };
}

/** Month-long observances, and the ones the order dates only by week ("3rd week"). */
export function monthObservances(y, m) {
  const syStart = m >= 6 ? y : y - 1;
  if (syStart !== 2026) return [];
  return OBSERVANCES.filter((o) => o.month === m && (isMonthLong(o) || o.when.label));
}

function isMonthLong(o) {
  const w = o.when;
  return Boolean(w.days && w.days[0] === 1 && w.days[1] >= 28);
}

/** The holiday on a day (Annex B), or null. */
export function holidayOn(iso) {
  return SCHOOL_ACTIVITIES.find((a) => a.kind === 'holiday' && inSchoolActivity(a, iso)) || null;
}

/** School activities from `fromIso` for `days` days, first date first: [{ iso, activity }]. */
export function upcomingActivities(fromIso, days = 14) {
  const out = [];
  const start = new Date(`${fromIso}T12:00:00`);
  for (let i = 0; i < days; i++) {
    const d = new Date(start.getTime() + i * 86400000);
    const iso = isoOf(d.getFullYear(), d.getMonth() + 1, d.getDate());
    for (const a of SCHOOL_ACTIVITIES) {
      const first = a.days ? a.days.find((x) => x >= fromIso) : (a.start >= fromIso ? a.start : (i === 0 && inSchoolActivity(a, iso) ? iso : null));
      if (first === iso) out.push({ iso, activity: a });
    }
  }
  return out;
}
