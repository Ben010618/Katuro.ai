/**
 * tourSteps.js: the KaTuroDesk tours.
 *
 *   FIRST_RUN  the basic workflow, for a teacher opening KaTuroDesk for the first time
 *   WHATS_NEW  a few highlights per version, shown once after KaTuroDesk updates itself
 *
 * A step points at the part of the screen marked data-tour="<target>" (KaTuroDeskPage.jsx);
 * a step without a target (or whose part is hidden) shows in the middle of the screen.
 * Add the next version's highlights at the top of WHATS_NEW when it ships.
 */
export const TOUR_KEY = 'katuro-desk-tour-v1';
export const TOUR_EVENT = 'katuro-desk-tour';

/** Settings → "Take the tour again" ('welcome') or "What's new" ('new'): DeskTour.jsx shows it. */
export function startDeskTour(kind = 'welcome') {
  window.dispatchEvent(new CustomEvent(TOUR_EVENT, { detail: kind }));
}

export const FIRST_RUN = [
  {
    title: 'Welcome to KaTuroDesk',
    body: 'Your teaching desk: your files, an assistant that prepares lessons and records with you, and your phone. A one-minute tour shows the basics.',
  },
  {
    target: 'folder',
    title: '1 · Your folder',
    body: 'Your KaTuro folder is on the left: Records for your class records, Lessons for learning materials. Right-click any folder or file for more. Everything stays on this computer.',
  },
  {
    target: 'chat',
    title: '2 · Ask your assistant',
    body: 'Type or say what you need, for example "Make a lesson plan on cells for Grade 7" or "Set up my Grade 7 Rizal Science class record". Your assistant works in your folder.',
  },
  {
    target: 'canvas',
    title: '3 · See and edit the result',
    body: 'Documents open here. Read them, change them, then save, print or open them in Word or Excel.',
  },
  {
    target: 'phone',
    title: '4 · Connect your phone',
    body: 'Link the KaTuro App on your phone: record scores, check attendance and your schedule, send photos of papers and ask your assistant, over the same Wi-Fi. Nothing goes to the cloud.',
  },
  {
    target: 'classes',
    title: '5 · Your classes and the school calendar',
    body: 'Add your class schedule once. KaTuroDesk reminds you before each class and follows the DepEd school calendar.',
  },
  {
    target: 'messages',
    title: '6 · Messages',
    body: 'Chat with other teachers and send files from your folder.',
  },
  {
    target: 'settings',
    title: '7 · Settings',
    body: 'Choose your assistant (Matt, Luna, Grey or Lola Carmen), back up your folder to a USB drive, and choose what your phone may see. You can take this tour again from here.',
  },
];

// Newest first. Each version's highlights are shown once, after updating to it.
export const WHATS_NEW = [
  {
    version: '1.24.0',
    steps: [
      {
        target: 'folder',
        title: 'New: Tests, all in one place',
        body: 'Click Tests (top bar) → New test: choose the class, the topic, the number of items and the record column. KaTuro makes the test paper, the answer key and the bubble sheets in Lessons › Tests. Print, then check the papers with the KaTuro App camera: the scores go to your class record after your review.',
      },
    ],
  },
  {
    version: '1.23.0',
    steps: [
      {
        target: 'folder',
        title: 'Your files, always backed up',
        body: 'Before KaTuro changes a file in Lessons or Records, it saves a backup copy in KaTuro Backups, then updates your file itself: no extra "(KaTuro edit)" copies to keep track of.',
      },
    ],
  },
  {
    version: '1.22.0',
    steps: [
      {
        target: 'folder',
        title: 'New: your Templates folder',
        body: 'Put your own Word templates here (lesson plan, project proposal…), or right-click a Word file → Save as template. Then ask: "Make a lesson plan on photosynthesis using my template." The new file keeps the template\'s margins, fonts and layout.',
      },
    ],
  },
  {
    version: '1.21.0',
    steps: [
      {
        target: 'folder',
        title: 'Right-click for more',
        body: 'Right-click any folder or file: rename it, make a new folder, pin it to the top, show it in File Explorer, or delete it (it goes to the Recycle Bin).',
      },
      {
        target: 'settings',
        title: 'Your folder, your place',
        body: 'New computers keep Records and Lessons on the Desktop, in Katuro Teaching Assistant. Settings → Documents shows where your KaTuro folder is, and can move it.',
      },
    ],
  },
  {
    version: '1.20.0',
    steps: [
      {
        target: 'phone',
        title: 'Linking your phone is quick now',
        body: 'Point the phone at the code and it links at once. If Windows blocks your phone on this network, Settings → Phones shows a button to allow it.',
      },
    ],
  },
  {
    version: '1.19.0',
    steps: [
      {
        target: 'phone',
        title: 'New: connect your phone',
        body: 'Link the KaTuro App on your phone: record scores, attendance, your schedule, your files and your assistant, over the same Wi-Fi or your phone\'s hotspot.',
      },
      {
        target: 'settings',
        title: 'New: you choose what your phone sees',
        body: 'Settings → Phones: for each folder, hidden, view, view & add, or full. Settings → Backup copies your KaTuro folder to a USB drive. Settings also replays the quick tour.',
      },
      {
        target: 'folder',
        title: 'Your KaTuro folder',
        body: 'Records for class records and Lessons for learning materials. Class records are updated in place, with a backup first. Settings → Documents shows where it is.',
      },
    ],
  },
];

/** "1.18.0" vs "1.9.2" → -1 / 0 / 1 (numbers, not text). */
export function compareVersions(a, b) {
  const pa = String(a || '0').split('.').map((n) => parseInt(n, 10) || 0);
  const pb = String(b || '0').split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i += 1) {
    if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) < (pb[i] || 0) ? -1 : 1;
  }
  return 0;
}

/** The highlights of the versions after `from` up to `to` (only `to`'s own when `from` is unknown), oldest first. */
export function whatsNewSteps(from, to) {
  return WHATS_NEW
    .filter((n) => compareVersions(n.version, to) <= 0 && (from ? compareVersions(n.version, from) > 0 : compareVersions(n.version, to) === 0))
    .sort((a, b) => compareVersions(a.version, b.version))
    .flatMap((n) => n.steps);
}

/** The newest highlights at or before `version` (Settings → What's new), [] when there are none. */
export function latestWhatsNew(version) {
  const n = WHATS_NEW.filter((w) => !version || compareVersions(w.version, version) <= 0)
    .sort((a, b) => compareVersions(b.version, a.version))[0];
  return n ? n.steps : [];
}

/**
 * Which tour to show now. → { kind: 'welcome' | 'new', steps } or null.
 *   seen      what this computer remembers ({ version } of the last tour shown or skipped), or null
 *   firstRun  KaTuroDesk had never opened a folder on this computer before this start
 *   version   the KaTuroDesk running now
 */
export function tourToShow({ seen, firstRun, version }) {
  if (!version) return null;
  if (!seen?.version) {
    if (firstRun) return { kind: 'welcome', steps: FIRST_RUN };
    // Used KaTuroDesk before the tours existed: every highlight so far, oldest first.
    const steps = whatsNewSteps('0', version);
    return steps.length ? { kind: 'new', steps } : null;
  }
  if (compareVersions(seen.version, version) >= 0) return null;
  const steps = whatsNewSteps(seen.version, version);
  return steps.length ? { kind: 'new', steps } : null;
}
