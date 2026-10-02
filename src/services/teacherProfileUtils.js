/**
 * teacherProfileUtils.js
 * 
 * Extracts and formats the teacher's proper DepEd salutation and name
 * (e.g. "Ma'am April", "Sir Ben") from their authenticated KaTuro account.
 */

export function getTeacherSalutationName(profile, user) {
  // 1. Get raw name from profile or user
  let rawName = profile?.givenName || profile?.firstName || '';
  if (!rawName && profile?.displayName) {
    rawName = profile.displayName.split(' ')[0];
  }
  if (!rawName && user?.displayName) {
    rawName = user.displayName.split(' ')[0];
  }
  if (!rawName && user?.email) {
    const prefix = user.email.split('@')[0].split('.')[0];
    rawName = prefix.charAt(0).toUpperCase() + prefix.slice(1);
  }
  // No name anywhere: plain "Teacher" (never "Teacher Teacher").
  if (!rawName) return 'Teacher';

  // 2. If name already starts with "Sir" or "Ma'am", return clean
  if (/^sir\b/i.test(rawName)) return rawName;
  if (/^ma'?am\b/i.test(rawName)) return rawName;

  // 3. Determine honorific (Sir vs Ma'am)
  let honorific = profile?.salutation || profile?.title || '';
  if (/^mr\.?$/i.test(honorific)) honorific = 'Sir';
  if (/^(ms\.?|mrs\.?)$/i.test(honorific)) honorific = "Ma'am";

  if (!honorific) {
    if (profile?.gender === 'male') honorific = 'Sir';
    else if (profile?.gender === 'female') honorific = "Ma'am";
  }

  // 4. Heuristic for common Filipino / English names
  if (!honorific) {
    const lower = rawName.toLowerCase();
    const maleNames = [
      'ben', 'mark', 'john', 'carlo', 'juan', 'jose', 'michael', 'christian',
      'cardo', 'alex', 'kevin', 'robert', 'david', 'james', 'richard', 'daniel',
      'paulo', 'ronaldo', 'eduardo', 'francis', 'ryan', 'jomar', 'joel', 'dennis'
    ];
    const femaleNames = [
      'april', 'maria', 'mary', 'ana', 'anna', 'joy', 'sarah', 'sofia',
      'claire', 'clarissa', 'jessica', 'rose', 'grace', 'mae', 'bea', 'jenny',
      'karen', 'michelle', 'marissa', 'dina', 'angela', 'cristina', 'maricel'
    ];

    if (maleNames.some((m) => lower === m || lower.startsWith(m))) honorific = 'Sir';
    else if (femaleNames.some((f) => lower === f || lower.startsWith(f))) honorific = "Ma'am";
    else honorific = "Teacher";
  }

  return `${honorific} ${rawName}`;
}
