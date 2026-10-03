# kaTuro error prevention

How kaTuro AI (web) and KaTuroDesk keep wrong output and errors away from teachers. Each layer names the file that enforces it, so a change that weakens a layer is visible in review.

## 1. Nothing broken ships

| Guard | Where |
|---|---|
| The deploy stops if lint has errors or any test fails. The live site keeps the last good version. | `.github/workflows/deploy.yml` |
| Tests cover the AI gateway, the server's busy/retry/refund logic, the generators, the desk agent and scheduling. | `npm test` |
| Firestore rules have their own emulator tests. | `npm run test:rules` |
| Unused source files and links to pages that don't exist fail the tests. | `tests/codeHealth.test.js` |
| Desktop releases: bump the version, `npm run desk:dist`, then publish a GitHub Release with the installer, its `.blockmap` and `latest.yml`. Updates are SHA-512 checked. | `package.json`, `electron/main.cjs` |

**Rule:** a bug fix comes with a test that fails without the fix.

## 2. The AI must not invent facts

| Guard | Where |
|---|---|
| Every web AI request starts with the accuracy rules: no invented competency codes, DepEd Orders, laws, names, scores or dates, and no gap-filling with "typical" values. | `WEB_ACCURACY_RULES` in `src/services/geminiConfig.js` |
| KaTuroDesk uses stricter rules, checks what the AI wrote (removes codes it cannot verify, flags unknown learner names), and asks the teacher (`NEEDS_INFO`) instead of guessing. | `src/services/desk/agent/grounding.js`, `tools.js` |
| Names, school and signatories come only from the teacher profile. Blank fields are left out, never filled in. | `src/services/teacherInfo.js` |
| Forms start blank ("Not set") instead of pre-filling a subject or grade the teacher did not choose. | `src/pages/SettingsPage.jsx` |
| Production code contains no mock or sample data. Fake data belongs in tests only. | `src/data/` holds only the official curriculum |

## 3. When Google's AI is overloaded

| Guard | Where |
|---|---|
| A busy model is benched and the next model is tried. When every model is busy, the server waits (4 s, then 10 s) and retries. | `callGeminiRaw` in `functions/index.js` |
| If Google stays busy, the teacher gets a plain message, not raw Gemini text. | `BUSY_MESSAGE` |
| A failed generation gives the daily use back, so teachers are never charged for nothing. | `refundDailyUsage`, `withDailyCharge` |
| Google-side "busy" errors are not filed as kaTuro bugs, so real errors stay visible. | `src/services/geminiConfig.js`, `presentationAI.js` |

## 4. After a deploy

| Guard | Where |
|---|---|
| A tab left open across a deploy asks for old file names. It reloads once (at most once a minute) instead of crashing, and shows "Loading the latest version". | `src/utils/staleChunk.js`, `src/main.jsx`, `ErrorBoundary.jsx` |
| The service worker never caches the page itself, and keeps at most 250 build files. | `public/sw.js` |
| KaTuroDesk updates itself, so teachers are not stuck on old builds. | `electron/main.cjs` |

## 5. Seeing errors that do happen

| Guard | Where |
|---|---|
| Render crashes, errors in handlers/timers, and unhandled promises are reported to Admin → AI Error Reports, deduplicated and capped at 5 per page load. | `ErrorBoundary.jsx`, `src/utils/globalErrorReporter.js` |
| The admin inbox groups repeats ("12x") and resolves a whole group at once. A report shows as resolved only after the save succeeds. | `src/services/errorReports.js`, `AdminDashboard.jsx` |
| KaTuroDesk keeps `update.log` and `desk-console.log` in its data folder for support. | `electron/main.cjs` |

## Checklist for every change

1. `npx eslint . --quiet` shows no errors, `npm test` passes, `npm run build` succeeds.
2. New AI prompt? It goes through `callGeminiProxy` (web) or includes `GROUNDING_RULES` (desk). Missing data is asked for, never assumed.
3. New page? It has a route and a link, and every link points to a route that exists.
4. New button? It does something real. No placeholder actions ("disabled in preview").
5. New file? Something imports it (`tests/codeHealth.test.js` fails otherwise).
