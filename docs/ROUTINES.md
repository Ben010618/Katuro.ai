# KaTuro Routines (Routine Builder)

Picture cards that do a teacher's repeated work, n8n-style but made for teachers: **When → Get → Do → Ask me first → Save / send**, wired left to right. KaTuroDesk 1.26.0.

## Where the code is

| Part | File |
|---|---|
| Card catalog (every card, plugs, fields, English + Filipino) | `src/services/desk/routines/catalog.js` |
| Routine data: clean, check, explain | `src/services/desk/routines/routine.js` |
| When a routine starts (schedule, DepEd calendar, new files) | `src/services/desk/routines/triggers.js` |
| Running card by card, "Ask me first", runs | `src/services/desk/routines/runRoutine.js` |
| Ready-made routines | `src/services/desk/routines/templates.js` |
| Talk to build (sentence → cards) | `src/services/desk/routines/talk.js` |
| Saved routines and runs (this PC) | `src/store/routineStore.js` |
| KaTuroDesk side: agent, scheduler, lock | `src/pages/desk/routines/routineEngine.js` |
| Builder (React Flow canvas, list view, settings) | `src/pages/desk/routines/RoutineBuilder.jsx`, `CardNode.jsx`, `CardSettings.jsx`, `routineLayout.js` |
| Routines window (mine, ready-made, waiting, history) | `src/pages/desk/routines/RoutinesModal.jsx` |
| Approvals on the KaTuro App | `src/services/link/deskRoutineRequests.js`, `src/pages/phone/PhoneApprovals.jsx` |

A green card runs its KaTuroDesk tool(s) through `runDeskAgentTurn` with a **confirmed plan** (no AI planning call): the same tool code, path checks (`planner.sanitizePlan`), backups, privacy masking and records rules as a chat request. One thing runs at a time (the scheduler's lock, shared with scheduled tasks); never while the teacher's own request runs. A run keeps a copy of the routine it started with.

## Security rules (why: the holes used against n8n, Node-RED, Langflow and Flowise)

1. **No code, ever.** No code card, no expression box. Card settings are plain values checked against the catalog (number, choice, time, a file/folder inside the open folder, short text). No `eval`, `Function`, `vm` or `child_process` anywhere in the routine code (`tests/routinesSecurity.test.js`). *(n8n CVE-2025-68613, CVE-2026-1470, CVE-2026-25049, CVE-2026-27577; Flowise CVE-2025-59528.)*
2. **No open server.** The Builder and engine live inside the KaTuroDesk window. No webhook card. The phone answers "Ask me first" only through the existing paired, encrypted, same-Wi-Fi link, sending only a run id and yes/no. *(Langflow CVE-2025-3248; Node-RED CVE-2025-41656, CVE-2026-58115; Flowise without login before 3.0.1.)*
3. **No command or "run a program" card**, no general web-request card. *(Node-RED exec node; Flowise CustomMCP CVE-2025-8943.)*
4. **Files stay in the folder.** Paths are cleaned (`routine.cleanPath`: no `..`, drive, root, backslash or hidden characters) and checked again by the agent and the file layer.
5. **Imported and AI-drawn routines are rebuilt** from known cards and fields only (`cleanRoutine`): unknown cards, extra keys and `__proto__` are dropped, files over 200 KB refused, and they always start switched off.
6. **Ask before a record changes.** A card that changes a class record cannot be saved as runnable without "Ask me first" before it.
7. **No loops** (one wire in per card, one When card), at most 20 cards, a 20-minute limit per card, 40 new files per run.
8. **No secrets in routines.** AI keys stay in the Windows-encrypted store.
9. **Few new libraries, pinned:** `@xyflow/react` 12.12.1 (MIT), `@dagrejs/dagre` 3.1.3 (MIT).

## Open-source parts and ideas

| Project | License | Used for |
|---|---|---|
| React Flow (`@xyflow/react`) | MIT | The canvas |
| dagre (`@dagrejs/dagre`) | MIT | Auto-arranging the cards |
| Synergy Codes Workflow Builder | Apache-2.0 | Ideas only (palette, approval steps, live run view, pinned graph per run); its SDK was not added (it brings a code editor and form libraries we do not want) |
| sequential-workflow-designer | MIT | Ideas only: the simple top-to-bottom list view |
| Blockly, Node-RED, Flume | Apache-2.0 / MIT | Ideas only: plugs that only fit where they fit, status lights per card |
| n8n | Sustainable Use License | Looked at, nothing copied |
