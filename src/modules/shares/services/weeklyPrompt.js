/** Rotating conversation starters shown in the composer to reduce blank-page friction. */
export const WEEKLY_PROMPTS = [
  "What's one thing that worked in your classroom this week?",
  'Share a lesson, activity, or material you made that you’re proud of.',
  'What’s a challenge you’re facing right now? Fellow teachers might have ideas.',
  'Share a photo or story of a student "aha!" moment.',
  'What classroom management tip has saved you the most time or stress?',
  'What’s one small win from this week worth celebrating?',
  'Share a DLL, MELC, or teaching resource that made your prep easier.',
  'What would you tell a new teacher starting out this week?',
  'Share how you handled a tough day in the classroom.',
  'What’s something a student said or did that made you smile this week?',
];

/** ISO-ish week number of the year, used so every teacher sees the same prompt for the week. */
function weekOfYear(date) {
  const start = new Date(date.getFullYear(), 0, 1);
  const days = Math.floor((date - start) / 86400000);
  return Math.floor(days / 7);
}

/** The prompt-of-the-week — stable for all users across a given week. */
export function getWeeklyPrompt(date = new Date()) {
  return WEEKLY_PROMPTS[weekOfYear(date) % WEEKLY_PROMPTS.length];
}
