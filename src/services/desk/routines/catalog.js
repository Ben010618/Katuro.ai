/**
 * catalog.js — every card a KaTuro Routine can use (Routine Builder, see docs/ROUTINES.md).
 *
 * A routine is picture cards wired left to right:
 *   when (purple)  what starts it          — gives "start"
 *   get  (blue)    what it reads            — a sheet, a class record, a folder, a test
 *   do   (green)   one of KaTuroDesk's own tools, run exactly as from the chat
 *   ask  (yellow)  waits for the teacher's OK (required before anything changes a record)
 *   save (orange)  where results go
 *
 * SECURITY (docs/ROUTINES.md): a card's settings are plain values checked against the fields
 * below (a number, a choice, a file inside the open folder, a short text). Nothing a teacher or
 * an imported routine types is ever run as code, there is no "run a program", "web request" or
 * "webhook" card, and every file goes through the agent's own path checks (planner.sanitizePlan).
 *
 * Plugs (what flows along a wire):
 *   start    a routine started (When cards)
 *   sheet    an Excel/CSV sheet (or a photo/scan of a table)
 *   record   an E-Class Record in Records
 *   folder   a folder of files (photos, scans, sheets) — or new files that just arrived
 *   docs     documents KaTuro made
 *   any      (Ask me first / Save / Alert accept every plug)
 */

export const KINDS = ['when', 'get', 'do', 'ask', 'save'];
export const PLUGS = ['start', 'sheet', 'record', 'folder', 'docs'];
export const MAX_CARDS = 20;
export const MAX_TEXT = 300;

export const KIND_STYLE = {
  when: { color: 'violet', label: { en: 'When', fil: 'Kailan' } },
  get: { color: 'sky', label: { en: 'Get', fil: 'Kunin' } },
  do: { color: 'emerald', label: { en: 'Do', fil: 'Gawin' } },
  ask: { color: 'amber', label: { en: 'Ask me first', fil: 'Itanong muna sa akin' } },
  save: { color: 'orange', label: { en: 'Save / send', fil: 'I-save / ipadala' } },
};

export const PLUG_LABEL = {
  start: { en: 'start', fil: 'simula' },
  sheet: { en: 'a sheet', fil: 'isang sheet' },
  record: { en: 'a class record', fil: 'isang class record' },
  folder: { en: 'a folder of files', fil: 'isang folder ng mga file' },
  docs: { en: 'documents', fil: 'mga dokumento' },
};

const WEEKDAY_OPTIONS = [0, 1, 2, 3, 4, 5, 6];
const SHEET = /\.(xlsx|xlsm|xls|csv|tsv)$/i;
const RECORD = /^Records\/.+\.(xlsx|xlsm)$/i;
const DOCS = /\.(docx|pdf|pptx|xlsx)$/i;
const PHOTO_OR_SCAN = /\.(jpe?g|png|webp|heic|heif|pdf)$/i;
const TO_PDF = /\.(docx|jpe?g|png|heic|heif)$/i;

/* Field kinds: text · number · choice · days · time · date · file · folder · offset.
 * file/folder fields hold a path INSIDE the open folder (checked by routine.js cleanPath). */
const F = {
  text: (key, en, fil, extra = {}) => ({ key, kind: 'text', label: { en, fil }, max: MAX_TEXT, ...extra }),
  number: (key, en, fil, min, max, extra = {}) => ({ key, kind: 'number', label: { en, fil }, min, max, int: true, ...extra }),
  choice: (key, en, fil, options, extra = {}) => ({ key, kind: 'choice', label: { en, fil }, options, ...extra }),
  file: (key, en, fil, accept, extra = {}) => ({ key, kind: 'file', label: { en, fil }, accept, ...extra }),
  folder: (key, en, fil, extra = {}) => ({ key, kind: 'folder', label: { en, fil }, ...extra }),
};

const TERM_CHOICES = [
  { value: '', label: { en: '(not said)', fil: '(hindi sinabi)' } },
  { value: 'Term 1', label: { en: 'Term 1', fil: 'Term 1' } },
  { value: 'Term 2', label: { en: 'Term 2', fil: 'Term 2' } },
  { value: 'Term 3', label: { en: 'Term 3', fil: 'Term 3' } },
];
const WEIGHT_CHOICES = [
  { value: '', label: { en: 'From the subject', fil: 'Ayon sa asignatura' } },
  { value: 'languages', label: { en: 'Languages, AP, EsP', fil: 'Wika, AP, EsP' } },
  { value: 'scienceMath', label: { en: 'Science, Math', fil: 'Science, Math' } },
  { value: 'mapehEpp', label: { en: 'MAPEH, EPP/TLE', fil: 'MAPEH, EPP/TLE' } },
];

/** One input path (first file of the plug) and all of them. */
const one = (input) => input?.paths?.[0] || '';
const all = (input) => (input?.paths || []).slice(0, 40);
/** A folder plug: either { folder } (a folder) or new files (paths). */
const folderArgs = (input) => (input?.folder ? { folder: input.folder } : { paths: all(input) });
const clean = (v) => String(v ?? '').trim();
const opt = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== '' && v !== undefined && v !== null));

export const CARDS = [
  // ── When ──────────────────────────────────────────────
  {
    type: 'when.manual', kind: 'when', icon: 'Play', accepts: [], gives: 'start',
    label: { en: 'When I press Play', fil: 'Kapag pinindot ko ang Play' },
    help: { en: 'Runs only when you press Play.', fil: 'Tatakbo lang kapag pinindot mo ang Play.' },
    fields: [],
  },
  {
    type: 'when.schedule', kind: 'when', icon: 'CalendarClock', accepts: [], gives: 'start',
    label: { en: 'On a schedule', fil: 'Ayon sa iskedyul' },
    help: { en: 'Every day, every school day, on chosen days of the week, or once a month.', fil: 'Araw-araw, tuwing may pasok, sa piling araw ng linggo, o minsan isang buwan.' },
    fields: [
      F.choice('repeat', 'How often', 'Gaano kadalas', [
        { value: 'weekly', label: { en: 'On chosen days', fil: 'Sa piling araw' } },
        { value: 'weekdays', label: { en: 'Every school day (Mon–Fri)', fil: 'Tuwing may pasok (Lun–Biy)' } },
        { value: 'daily', label: { en: 'Every day', fil: 'Araw-araw' } },
        { value: 'monthly', label: { en: 'Once a month', fil: 'Minsan isang buwan' } },
      ], { required: true, default: 'weekly' }),
      { key: 'weekdays', kind: 'days', label: { en: 'Days', fil: 'Mga araw' }, options: WEEKDAY_OPTIONS, default: [5], showIf: { repeat: 'weekly' }, required: true },
      F.number('dayOfMonth', 'Day of the month', 'Araw ng buwan', 1, 31, { default: 28, showIf: { repeat: 'monthly' }, required: true }),
      { key: 'time', kind: 'time', label: { en: 'Time', fil: 'Oras' }, default: '15:00', required: true },
    ],
  },
  {
    type: 'when.deped', kind: 'when', icon: 'CalendarDays', accepts: [], gives: 'start',
    label: { en: 'On a DepEd calendar date', fil: 'Sa petsa ng DepEd calendar' },
    help: { en: 'Before or after an event in the DepEd school calendar (DO 9, s. 2026), every time it comes.', fil: 'Bago o pagkatapos ng isang petsa sa DepEd school calendar (DO 9, s. 2026), tuwing darating ito.' },
    fields: [
      F.choice('event', 'Which date', 'Aling petsa', [
        { value: 'termExam', label: { en: 'A Term Examination', fil: 'Term Examination' } },
        { value: 'termEnd', label: { en: 'The end of a term', fil: 'Katapusan ng term' } },
        { value: 'termStart', label: { en: 'The start of a term', fil: 'Simula ng term' } },
        { value: 'bosyStart', label: { en: 'Start of BOSY testing (CRLA, RMA, Phil-IRI)', fil: 'Simula ng BOSY testing (CRLA, RMA, Phil-IRI)' } },
        { value: 'mosyStart', label: { en: 'Start of MOSY testing', fil: 'Simula ng MOSY testing' } },
        { value: 'eosyStart', label: { en: 'Start of EOSY testing', fil: 'Simula ng EOSY testing' } },
      ], { required: true, default: 'termEnd' }),
      { key: 'offsetDays', kind: 'offset', label: { en: 'Days before (−) or after (+)', fil: 'Ilang araw bago (−) o pagkatapos (+)' }, min: -30, max: 30, int: true, default: -3 },
      { key: 'time', kind: 'time', label: { en: 'Time', fil: 'Oras' }, default: '07:00', required: true },
    ],
  },
  {
    type: 'when.newFiles', kind: 'when', icon: 'FolderInput', accepts: [], gives: 'folder',
    label: { en: 'When new files arrive in a folder', fil: 'Kapag may bagong file sa isang folder' },
    help: { en: 'Photos from the KaTuro App, scans, or files you drop in. Checked every minute while KaTuroDesk is open.', fil: 'Mga litrato mula sa KaTuro App, scan, o file na inilagay mo. Sinusuri bawat minuto habang bukas ang KaTuroDesk.' },
    fields: [
      F.folder('folder', 'Folder', 'Folder', { required: true }),
      F.choice('what', 'Which files', 'Aling mga file', [
        { value: 'photos', label: { en: 'Photos and scans', fil: 'Mga litrato at scan' } },
        { value: 'sheets', label: { en: 'Excel / CSV sheets', fil: 'Mga Excel / CSV sheet' } },
        { value: 'any', label: { en: 'Any file', fil: 'Kahit anong file' } },
      ], { required: true, default: 'photos' }),
    ],
    match: { photos: PHOTO_OR_SCAN, sheets: SHEET, any: /./ },
  },

  // ── Get ───────────────────────────────────────────────
  {
    type: 'get.sheet', kind: 'get', icon: 'Sheet', accepts: ['start'], gives: 'sheet',
    label: { en: 'A sheet', fil: 'Isang sheet' },
    help: { en: 'An Excel or CSV file: scores, attendance (SF2), reading results.', fil: 'Isang Excel o CSV file: iskor, attendance (SF2), resulta ng pagbasa.' },
    fields: [F.file('path', 'File', 'File', SHEET, { required: true })],
  },
  {
    type: 'get.record', kind: 'get', icon: 'BookOpenCheck', accepts: ['start'], gives: 'record',
    label: { en: 'My class record', fil: 'Ang class record ko' },
    help: { en: 'An E-Class Record in Records (one per class and subject).', fil: 'Isang E-Class Record sa Records (isa bawat klase at asignatura).' },
    fields: [F.file('path', 'Class record', 'Class record', RECORD, { required: true, records: true })],
  },
  {
    type: 'get.folder', kind: 'get', icon: 'FolderOpen', accepts: ['start'], gives: 'folder',
    label: { en: 'A folder', fil: 'Isang folder' },
    help: { en: 'All the files in one folder (photos of papers, scans, sheets).', fil: 'Lahat ng file sa isang folder (litrato ng papel, scan, sheet).' },
    fields: [F.folder('folder', 'Folder', 'Folder', { required: true })],
  },

  // ── Do (KaTuroDesk's own tools) ───────────────────────
  {
    type: 'do.attendance', kind: 'do', icon: 'UserX', accepts: ['sheet'], gives: 'docs', keep: DOCS,
    label: { en: 'Find frequent absences', fil: 'Hanapin ang madalas lumiban' },
    help: { en: 'Checks an attendance sheet (SF2) for learners absent several days in a row and makes Home Visitation Notices.', fil: 'Sinusuri ang SF2 para sa mga mag-aaral na sunod-sunod na lumiban at gumagawa ng Home Visitation Notice.' },
    fields: [
      F.number('minConsecutive', 'Days in a row', 'Ilang sunod-sunod na araw', 2, 10, { default: 3 }),
      F.text('gradeSection', 'Grade and section', 'Baitang at seksyon'),
    ],
    toTasks: (s, input) => [{ tool: 'check_attendance', args: opt({ path: one(input), minConsecutive: s.minConsecutive, gradeSection: clean(s.gradeSection) }) }],
  },
  {
    type: 'do.itemAnalysis', kind: 'do', icon: 'BarChart3', accepts: ['sheet'], gives: 'docs', keep: DOCS,
    label: { en: 'Item analysis', fil: 'Item analysis' },
    help: { en: 'MPS, mastery, least mastered skills and learners below 75%, computed exactly; can also make remedial slips.', fil: 'MPS, mastery, mga kasanayang pinakamahina at mga mag-aaral na mababa sa 75%; puwede ring gumawa ng remedial slip.' },
    fields: [
      F.text('testTitle', 'Test name', 'Pangalan ng test'),
      F.text('gradeSection', 'Grade and section', 'Baitang at seksyon'),
      F.choice('remedial', 'Also make remedial slips', 'Gumawa rin ng remedial slip', [
        { value: 'no', label: { en: 'No', fil: 'Hindi' } },
        { value: 'yes', label: { en: 'Yes', fil: 'Oo' } },
      ], { default: 'no' }),
    ],
    toTasks: (s, input) => {
      const first = { id: 'a', tool: 'analyze_scores', args: opt({ path: one(input), testTitle: clean(s.testTitle), gradeSection: clean(s.gradeSection) }) };
      return s.remedial === 'yes' ? [first, { id: 'b', tool: 'make_remedial_package', args: {}, dependsOn: ['a'] }] : [first];
    },
  },
  {
    type: 'do.classGrades', kind: 'do', icon: 'Calculator', accepts: ['sheet'], gives: 'sheet', keep: SHEET,
    label: { en: 'Compute grades', fil: 'Kompyutin ang grado' },
    help: { en: 'An E-Class Record with grades by the DepEd weights (DO 8), from a score sheet.', fil: 'E-Class Record na may grado ayon sa DepEd weights (DO 8), mula sa score sheet.' },
    fields: [
      F.text('subject', 'Subject', 'Asignatura', { required: true }),
      F.text('gradeSection', 'Grade and section', 'Baitang at seksyon'),
      F.choice('quarter', 'Term', 'Term', TERM_CHOICES, { default: '' }),
      F.choice('weights', 'Weights', 'Weights', WEIGHT_CHOICES, { default: '' }),
    ],
    toTasks: (s, input) => [{ tool: 'make_class_record', args: opt({ path: one(input), subject: clean(s.subject), gradeSection: clean(s.gradeSection), quarter: s.quarter, weights: s.weights }) }],
  },
  {
    type: 'do.reportCards', kind: 'do', icon: 'FileBadge', accepts: ['folder', 'sheet', 'record'], gives: 'docs', keep: DOCS,
    label: { en: 'Make report cards (SF9)', fil: 'Gumawa ng report card (SF9)' },
    help: { en: 'For class advisers: SF9 report cards for the whole section from the subject teachers\' class records (a folder of them).', fil: 'Para sa class adviser: SF9 report card ng buong seksyon mula sa mga class record ng mga subject teacher (isang folder nito).' },
    fields: [
      F.text('grade', 'Grade', 'Baitang'),
      F.text('section', 'Section', 'Seksyon'),
    ],
    toTasks: (s, input) => [{ tool: 'build_report_cards', args: opt({ sourcePaths: (input?.paths || []).filter((p) => SHEET.test(p)).slice(0, 40), grade: clean(s.grade), section: clean(s.section) }) }],
    needsFiles: true,
  },
  {
    type: 'do.reading', kind: 'do', icon: 'BookOpen', accepts: ['sheet'], gives: 'sheet', keep: SHEET,
    label: { en: 'Phil-IRI reading levels', fil: 'Antas ng pagbasa (Phil-IRI)' },
    help: { en: 'Word reading, comprehension, words per minute and each learner\'s level; who needs reading help.', fil: 'Word reading, comprehension, bilis ng pagbasa at antas ng bawat mag-aaral; sino ang kailangang tulungan.' },
    fields: [
      F.number('passageWords', 'Words in the passage', 'Bilang ng salita sa babasahin', 1, 2000),
      F.number('questions', 'Number of questions', 'Bilang ng tanong', 1, 50),
      F.text('gradeSection', 'Grade and section', 'Baitang at seksyon'),
      F.choice('test', 'Which test', 'Aling test', [
        { value: '', label: { en: '(the only one in the sheet)', fil: '(ang nag-iisa sa sheet)' } },
        { value: 'pre-test', label: { en: 'Pre-test', fil: 'Pre-test' } },
        { value: 'post-test', label: { en: 'Post-test', fil: 'Post-test' } },
      ], { default: '' }),
    ],
    toTasks: (s, input) => [{ tool: 'reading_check', args: opt({ path: one(input), passageWords: s.passageWords, questions: s.questions, gradeSection: clean(s.gradeSection), test: s.test }) }],
  },
  {
    type: 'do.checkPapers', kind: 'do', icon: 'ScanLine', accepts: ['folder'], gives: 'sheet', keep: SHEET,
    label: { en: 'Check answer sheets', fil: 'I-check ang answer sheet' },
    help: { en: 'Checks photos of answer sheets against your answer key and lists the scores. The online AI reads each photo (name and answers); KaTuro scores them and flags unclear marks.', fil: 'Tsine-check ang litrato ng answer sheet gamit ang answer key mo at inililista ang iskor. Ang online AI ang nagbabasa ng bawat litrato (pangalan at sagot); ang KaTuro ang nag-iiskor at nagmamarka ng malabo.' },
    fields: [
      F.file('answerKeyPath', 'Answer key file', 'File ng answer key', /\.(docx|pdf|xlsx|csv|txt|jpe?g|png)$/i, { required: true }),
      F.text('title', 'Test name', 'Pangalan ng test'),
    ],
    toTasks: (s, input) => [{ tool: 'check_answer_sheets', args: opt({ ...folderArgs(input), answerKeyPath: clean(s.answerKeyPath), title: clean(s.title) }) }],
  },
  {
    type: 'do.typeScores', kind: 'do', icon: 'PencilLine', accepts: ['sheet'], gives: 'record', changesRecords: true,
    label: { en: 'Type scores into my class record', fil: 'I-type ang iskor sa class record ko' },
    help: { en: 'Copies scores from a sheet into one column of your E-Class Record, matching names (backup first). Needs "Ask me first" before it.', fil: 'Kinokopya ang iskor mula sa sheet papunta sa isang column ng E-Class Record mo (may backup muna). Kailangan ng "Itanong muna sa akin" bago ito.' },
    fields: [
      F.file('targetPath', 'Class record', 'Class record', RECORD, { required: true, records: true }),
      F.text('targetColumn', 'Column (e.g. WW3 or F)', 'Column (hal. WW3 o F)', { required: true }),
    ],
    toTasks: (s, input) => [{ tool: 'encode_scores', args: opt({ sourcePath: one(input), targetPath: clean(s.targetPath), targetColumn: clean(s.targetColumn) }) }],
    outputPaths: (s) => [clean(s.targetPath)],
  },
  {
    type: 'do.consolidate', kind: 'do', icon: 'Combine', accepts: ['folder'], gives: 'sheet', keep: SHEET,
    label: { en: 'Combine into one Excel', fil: 'Pagsamahin sa isang Excel' },
    help: { en: 'Puts the data of all the sheets in a folder into one Excel file.', fil: 'Pinagsasama ang laman ng lahat ng sheet sa isang folder sa isang Excel file.' },
    fields: [F.text('title', 'Title', 'Pamagat')],
    toTasks: (s, input) => [{ tool: 'consolidate_files', args: opt({ sourcePaths: (input?.paths || []).filter((p) => SHEET.test(p)).slice(0, 40), title: clean(s.title) }) }],
    needsFiles: true,
  },
  {
    type: 'do.checkGrades', kind: 'do', icon: 'ShieldCheck', accepts: ['sheet', 'record', 'folder'], gives: 'docs', keep: DOCS,
    label: { en: 'Check grade sheets for mistakes', fil: 'Suriin ang grade sheet kung may mali' },
    help: { en: 'Finds wrong totals, transmutation mistakes and missing scores.', fil: 'Hinahanap ang maling total, maling transmutation at kulang na iskor.' },
    fields: [],
    toTasks: (s, input) => [{ tool: 'check_grade_sheets', args: { sourcePaths: (input?.paths || []).filter((p) => SHEET.test(p)).slice(0, 40) } }],
    needsFiles: true,
  },
  {
    type: 'do.toPdf', kind: 'do', icon: 'FileDown', accepts: ['docs', 'folder'], gives: 'docs', keep: /\.pdf$/i,
    label: { en: 'Turn into PDF', fil: 'Gawing PDF' },
    help: { en: 'Word documents and photos as PDF; many photos become one PDF.', fil: 'Word document at litrato bilang PDF; ang maraming litrato ay nagiging isang PDF.' },
    fields: [],
    // convert_to_pdf takes Word files and photos (not Excel): only those are given to it.
    toTasks: (s, input) => [{ tool: 'convert_to_pdf', args: input?.folder ? { folder: input.folder } : { paths: (input?.paths || []).filter((p) => TO_PDF.test(p)).slice(0, 40) } }],
    needsFiles: true,
  },
  {
    type: 'do.submissionPack', kind: 'do', icon: 'Package', accepts: ['docs', 'folder', 'sheet'], gives: 'docs', keep: /\.pdf$/i,
    label: { en: 'Make a submission pack', fil: 'Gumawa ng submission pack' },
    help: { en: 'One PDF with a cover page and page numbers (PDF, Word, Excel, slides and photos), ready to submit.', fil: 'Isang PDF na may cover page at page number (PDF, Word, Excel, slide at litrato), handa nang ipasa.' },
    fields: [
      F.text('title', 'Title', 'Pamagat', { required: true }),
      F.text('submittedTo', 'Submitted to', 'Isusumite kay'),
    ],
    toTasks: (s, input) => [{ tool: 'submission_pack', args: opt({ ...folderArgs(input), title: clean(s.title), submittedTo: clean(s.submittedTo) }) }],
  },
  {
    type: 'do.dll', kind: 'do', icon: 'NotebookPen', accepts: ['start'], gives: 'docs', keep: DOCS,
    label: { en: 'Write a Daily Lesson Log', fil: 'Sumulat ng Daily Lesson Log' },
    help: { en: 'A DLL draft in Lessons for you to check (the AI writes it; your learners\' names are never sent).', fil: 'Draft ng DLL sa Lessons para suriin mo (AI ang sumusulat; hindi ipinapadala ang pangalan ng mag-aaral).' },
    fields: [
      F.text('subject', 'Subject', 'Asignatura', { required: true }),
      F.text('gradeLevel', 'Grade', 'Baitang', { required: true }),
      F.text('topic', 'Topic or lessons', 'Paksa o aralin', { required: true }),
    ],
    toTasks: (s) => [{ tool: 'write_document', args: { docType: 'dll', title: `Daily Lesson Log – ${clean(s.subject)} ${clean(s.gradeLevel)}`.trim(), instructions: `Daily Lesson Log for ${clean(s.subject)}, ${clean(s.gradeLevel)}: ${clean(s.topic)}`, subject: clean(s.subject), gradeLevel: clean(s.gradeLevel) } }],
  },

  // ── Ask ───────────────────────────────────────────────
  {
    type: 'ask.approve', kind: 'ask', icon: 'Hand', accepts: ['any'], gives: 'same',
    label: { en: 'Ask me first', fil: 'Itanong muna sa akin' },
    help: { en: 'The routine stops here and waits for your OK (on KaTuroDesk or the KaTuro App). Nothing after it runs until you approve.', fil: 'Titigil dito ang routine at hihintayin ang OK mo (sa KaTuroDesk o sa KaTuro App). Walang tatakbo pagkatapos nito hangga\'t hindi mo inaaprubahan.' },
    fields: [F.text('note', 'What to tell me', 'Ano ang sasabihin sa akin')],
  },

  // ── Save / send ───────────────────────────────────────
  {
    type: 'save.folder', kind: 'save', icon: 'FolderDown', accepts: ['docs', 'sheet'], gives: null,
    label: { en: 'Save in a folder', fil: 'I-save sa isang folder' },
    help: { en: 'Puts what the card before makes in this folder (instead of KaTuro Outputs).', fil: 'Inilalagay sa folder na ito ang ginawa ng naunang card (sa halip na KaTuro Outputs).' },
    fields: [F.folder('folder', 'Folder', 'Folder', { required: true })],
  },
  {
    type: 'save.notify', kind: 'save', icon: 'BellRing', accepts: ['any'], gives: null,
    label: { en: 'Tell me when done', fil: 'Sabihan ako kapag tapos na' },
    help: { en: 'A notice on this computer with what the routine did.', fil: 'Abiso sa computer na ito kung ano ang ginawa ng routine.' },
    fields: [F.text('message', 'Message', 'Mensahe')],
  },
];

export const CARD_BY_TYPE = Object.freeze(Object.fromEntries(CARDS.map((c) => [c.type, c])));

/** The card definition for a type, or null. */
export const cardDef = (type) => (Object.prototype.hasOwnProperty.call(CARD_BY_TYPE, type) ? CARD_BY_TYPE[type] : null);

/** The label in the teacher's language ('en' | 'fil'). */
export const say = (text, lang = 'en') => (text && typeof text === 'object' ? text[lang] || text.en : String(text ?? ''));
