# KaTuro App (Android, later iOS) — Plan

Status: **plan.** Written 2026-11-16, replanned the same day around the KaTuro folder.
Built so far: the KaTuro folder, class record setup and the readiness check, default save places, and the phone app shell (a test APK builds). See section 6.

## 1. The idea in one line

**KaTuroDesk on the teacher's PC owns the files. The KaTuro App on the phone works on
them.** Everything centers on one folder on the PC, and its two main folders, **Records**
and **Lessons**, are what the phone and the Desk edit together.

## 2. The KaTuro folder (built)

Made automatically the first time KaTuroDesk opens, and opened by default:

```
Documents\KaTuro\
├─ Records\    Excel class records for every class the teacher handles
├─ Lessons\    PDFs, Word, PowerPoint and other learning materials
└─ (any folder the teacher adds — managed in KaTuroDesk, viewable in the app)
```

- Made on the first launch, not by the installer, because Documents is per user and is often
  moved into OneDrive. The running app finds the real place.
- If Records or Lessons is deleted, it comes back the next time KaTuroDesk opens. The
  teacher's own files and folders are never touched.
- The teacher can still open any other folder (USB, drive). A **KaTuro** button in the
  folder panel goes back home.
- Code: `electron/defaultFolders.cjs`, wired in `electron/main.cjs`
  (`workspace:reopenLast`, `workspace:openHome`). Tests: `tests/defaultFolders.server.test.js`.

### Who can do what

| | KaTuroDesk (PC) | KaTuro App (phone) |
|---|---|---|
| **Records** | Full: create, edit, delete | **Edit**: enter scores, scan papers, take attendance. View every record. |
| **Lessons** | Full | **Edit**: add photos and files, save generated lessons. View and present. |
| Other folders | Full | **View and open only** |

### Inside Records (decided 2026-11-16)

```
Records\
├─ Grade 7 - Rizal - Science.xlsx        DepEd E-Class Record, one per class + subject
├─ Grade 7 - Bonifacio - Science.xlsx
└─ Scanned Papers\                        photos kept as proof of each score
   └─ Grade 7 - Rizal - Science\Quiz 3\
```

### The setup rule: prepare first, record after

1. **Format:** the official DepEd E-Class Record (DO 8 s. 2015: Written Work,
   Performance Task, Quarterly Assessment), **one file per class and subject**.
2. **Prepared first.** Before anything is recorded, the class record must exist in Records
   with the learners' names in it. Names go in either:
   - **by the teacher**, typed into the E-Class Record, or
   - **by KaTuroDesk on the teacher's behalf**, from a class list the teacher gives (SF1,
     an Excel or Word list, a photo of the list). The teacher checks the list before it's saved.
3. **No clear names, no recording.** Score entry, bubble scans, photo capture, attendance,
   report cards and every other recordable or deliverable run **only** on a class record
   with clear learner names. If the record is missing, has no names, or has unclear or
   duplicate names, KaTuro stops and tells the teacher what to fix. It never guesses a learner.
4. **The phone follows the PC.** The app only lists classes whose record is ready on the Desk.
   A class that isn't set up shows "Set up this class on KaTuroDesk first."
5. KaTuroDesk edits the Excel and Word files itself (its own readers and writers in
   `src/services/desk`). The teacher doesn't need to open Excel to record.

## 3. How the phone reaches the PC

**Records stay on the PC.** Learner names, LRNs and grades travel only between the phone and
the PC, over the same Wi-Fi or the phone's hotspot. They are never put on the cloud
(Data Privacy Act). The cloud (Firebase) is used only for the teacher's account and the
features that already live there.

```
   KaTuro App (phone) ◄──── same Wi-Fi / hotspot ────► KaTuroDesk (PC)
         │          paired once by QR, then automatic         │
         │                                         Documents\KaTuro\Records
         │                                         Documents\KaTuro\Lessons
         └──────────────── Firebase (account, messages, ────────┘
                           schedule push, AI, voices)
```

- **Pairing (built):** KaTuroDesk → Settings → Phones → Link a phone shows a QR code holding a
  one-time key (one phone, 10 minutes). The phone reads it with its camera, so the key never
  travels over the network, and gets its own long-term key back, encrypted. Every message after
  that is AES-256-GCM encrypted, time-stamped and single-use. Paired phones are saved on the PC
  only (Windows DPAPI), not in Firestore, so no record of the teacher's devices goes to the
  cloud. The Desk can remove a phone at any time.
- **Desk side:** a small local link service in Electron. It grows out of today's
  `electron/phoneCapture.cjs`, but stays on while KaTuroDesk is open, and it only
  accepts paired phones and only reaches into the KaTuro folder.
- **When the PC is off or far away:** the phone keeps working. New scores, photos and
  attendance wait in a queue on the phone and are sent the next time it finds the Desk.
  Lessons the teacher marked **"Keep on phone"** can be opened offline.

## 4. Features

⭐ = first release.

### Records: getting scores in without typing (the main feature)

The gap today: the teacher checks papers by hand, then types every score into Excel.

| Way in | How | Accuracy |
|---|---|---|
| ⭐ **Quick entry** | The phone shows the class list in order. Tap or say each score: "Juan, 38." | Exact |
| ⭐ **Bubble sheet scan** | The camera reads the bubbles; checked against the answer key (the Desk's existing checker). | Exact |
| **Photo of a checked paper** | The phone reads the score the teacher wrote ("38/50") on the phone itself, with no internet. It knows the learner from a QR code printed on the paper, the class list order, or the name matched to the class list. | Good on clear writing. Always confirmed. |

Rules for every way in:
- ⭐ **Confirm before saving.** A review screen highlights doubtful scores. Nothing is
  written unconfirmed.
- ⭐ **The Desk writes the class record.** It backs up the Excel file first, puts each score in
  the right column (Written Work / Performance Task / Quarterly Assessment), computes with
  DepEd rules by code (DO 8 s. 2015 transmutation), then runs the grade-sheet checker.
- ⭐ **Missing papers list**, e.g. "4 learners in Grade 7 - Rizal have no score for Quiz 3."
- **History**, showing who changed which score, when and from which device, with undo.
- **Duplicate check** for the same paper scanned twice.
- **Attendance by tap**, saved into the class record's attendance sheet.

### Lessons: materials in your pocket
- ⭐ **Browse and open** every PDF, Word and PowerPoint file in Lessons.
- ⭐ **Snap & Send:** photos of documents and learner outputs go into a Lessons (or Records)
  folder. Scan several pages into one PDF.
- ⭐ **Keep on phone:** offline copies of chosen lessons, for classrooms with no signal.
- **Share to KaTuro:** from Messenger, Gmail or Files, tap Share → KaTuro → Lessons.
- **Present from the phone:** show slides from a lesson. (Later: the phone as a slide
  clicker for the Desk.)
- **Generators on the phone** (Lesson Plan, DLL, COT, Test Builder, Quiz): the result
  is saved straight into Lessons on the Desk.

### Everywhere
- ⭐ **One KaTuro account**, the same login as the Desk and the website.
- ⭐ **Schedule and reminders** with push notifications.
- **Messages** with push notifications.
- **Talk to Matt, Luna, Grey or Lola Carmen** (push-to-talk, the same voices as the Desk).
- **"Ask my Desk":** "print the Grade 7 quiz," "which file has Juan's Term 1 grades?"
- **Other folders:** view and open, read-only.

## 5. Changes KaTuroDesk needs for this

These are Desk work that supports the app. They also make the Desk better on its own.

1. ✅ KaTuro folder with Records and Lessons (done).
2. ✅ **Set up a class record.** "Add class" makes `Records\Grade 7 - Rizal - Science.xlsx` as a
   DepEd E-Class Record. KaTuroDesk fills in the learners from a list the teacher gives, or
   the teacher types them in. Then a **readiness check** confirms every learner has a clear
   name with no duplicates and no blanks. A teacher's own E-Class Record dropped into Records
   gets the same check.
3. ✅ **Default save places.** Generated lesson plans, DLLs and slides go to Lessons. Bubble-quiz
   results and checked scores go to Records.
4. ✅ **Protect the main folders.** KaTuroDesk has no delete, rename or move for the teacher's
   files at all, and Records and Lessons come back on the next start if deleted in Windows.
5. **Records index.** A small local database (in KaTuroDesk's app data, not in the folder)
   that remembers which file and column holds which class and assessment, plus the score
   history. The Excel files stay the teacher's real records; the index only speeds things up
   and keeps the history.
6. **Link service + paired devices** screen (section 3).

## 6. Phases

| Phase | What we build | You can do after it |
|---|---|---|
| **0. Groundwork** ✅ | KaTuro folder. Desk items 2–4. Capacitor project in `Katuro_App/`, `--mode mobile` build, a `platform` helper in `src/`. | Install a test APK on your phone |
| **1. Link** ⭐ ✅ | Login, pairing by QR, link service on the Desk, browse Records and Lessons from the phone | See your PC's KaTuro folder on the phone |
| **2. Scores** ⭐ ✅ | Quick entry, bubble-sheet scan, review screen, the Desk writes the class record, missing papers, offline queue | Record a whole quiz without typing on the PC |
| **3. Lessons** ⭐ ✅ | Open files, Snap & Send, scan to PDF, Keep on phone, Share to KaTuro | Carry and add lessons from the phone |
| **4. Assistant** | Schedule and push, messages, personas, generators saving into Lessons | Use KaTuro daily on the phone |
| **5. Smarter capture** | Photo of a checked paper (handwritten score reading), attendance, history and undo, "Ask my Desk" | Snap the stack of papers instead |
| **6. Google Play** | Internal test → a few teachers → public | Teachers install from Play |
| **7. iOS** | Add `ios/` to the same project | iPhone teachers install it |

Each item: build, test, commit, then go on to the next, the same rule as the Desk to-do list.

## 7. How it's built

- **Capacitor** wraps the same React code in `src/` as the website and KaTuroDesk:
  `vite build --mode mobile` → `Katuro_App/`. This is the same idea as the Desk
  (`--mode desk` + Electron).
- Native plugins for the camera, push notifications (FCM), the microphone, the share sheet,
  on-device text reading (Google ML Kit) and local storage for the offline queue.
- iOS later from the same project (`ios/` folder). It needs an Apple Developer account and a Mac
  or a cloud build service.

```
katuro-ai/
├─ src/            shared React code (website + Desk + app)
├─ electron/       KaTuroDesk (Windows) — defaultFolders.cjs, link service
├─ functions/      Cloud Functions (shared backend)
└─ Katuro_App/     this folder
   ├─ PLAN.md, README.md
   ├─ package.json, capacitor.config.json (Phase 0) appId ai.katuro.app
   ├─ android/                              (Phase 0)
   └─ ios/                                  (Phase 7)
```

## 8. What it will need from you

| Item | Cost | When |
|---|---|---|
| Android Studio on this PC | Free | Phase 0 |
| Add an Android app to the Firebase project | Free | Phase 1 |
| Google Play Developer account | US$25 one-time | Phase 6 |
| Privacy policy page (required by the stores) | Free | Phase 6 |
| Apple Developer account + Mac or cloud build | US$99 per year | Phase 7 |

## 9. Open questions

1. ✅ Class record format: DepEd E-Class Record (decided 2026-11-16).
2. ✅ Records naming: one file per class and subject (decided 2026-11-16).
3. **Who can install:** only existing KaTuro accounts, or open sign-up from Play?
4. **Version numbers:** should the app share the Desk's version (1.16.x) or have its own?
