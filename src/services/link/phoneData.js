/**
 * phoneData.js — everything the KaTuro App keeps on the phone for the teacher, and how to
 * clear it all at once: when the phone is unlinked, when KaTuroDesk removes the phone, and
 * on sign-out (so the next person on this phone sees nothing of the last teacher's classes).
 */
import { forgetLink } from './linkStore.js';
import { forgetCachedClasses, queuedRecordings } from './scoreEntry.js';
import { forgetPhoneFiles, outbox } from './phoneFiles.js';
import { syncReminders } from './phoneReminders.js';

// localStorage keys with the teacher's data (learner names, scores, schedule, chat).
export const PHONE_DATA_KEYS = [
  'katuro-score-queue-v1',
  'katuro-phone-schedule-v1',
  'katuro-phone-chat-v1',
];

/** What would be lost (not yet sent to KaTuroDesk). → { recordings, files } */
export async function unsentOnPhone() {
  const files = await outbox().catch(() => []);
  return { recordings: queuedRecordings().length, files: files.length };
}

/** Clears the link, class lists, waiting recordings and files, kept files, schedule, chat and reminders. */
export async function forgetPhoneData() {
  forgetLink();
  forgetCachedClasses();
  for (const key of PHONE_DATA_KEYS) {
    try { localStorage.removeItem(key); } catch { /* storage blocked */ }
  }
  await Promise.allSettled([forgetPhoneFiles(), syncReminders([])]);
}
