import { describe, it, expect } from 'vitest';
import { teacherInfo, signatoryList, teacherFactsForAI, profileCompleteness, PROFILE_FIELDS } from './teacherInfo';
import { getTeacherSalutationName } from './teacherProfileUtils';

const FULL = {
  userName: 'Ben', name: 'Ben Mark Joy A. Cuvinar', honorific: 'Sir', designation: 'Teacher VI',
  school: 'Dayap National High School', schoolId: '301234', district: 'Calauan District', division: 'Province of Laguna', region: 'Region IV-A (CALABARZON)',
  masterTeacherName: 'Juliet Bulahan', masterTeacherPosition: 'Master Teacher II',
  headTeacherName: 'Lisette Quinay', headTeacherPosition: '',
  principalName: 'Dr. Aida M. Bejo', principalPosition: 'Principal IV',
  psdsName: '', psdsPosition: 'Public Schools District Supervisor',
};

describe('teacherInfo', () => {
  it('normalizes and trims every field', () => {
    const t = teacherInfo({ ...FULL, school: '  Dayap   National High School ' });
    expect(t.school).toBe('Dayap National High School');
    expect(t.signatories.headTeacher).toEqual({ name: 'Lisette Quinay', position: '' });
  });

  it('never keeps a position without a name', () => {
    expect(teacherInfo(FULL).signatories.psds).toEqual({ name: '', position: '' });
  });

  it('reads older profiles (supervisorName = Master Teacher, schoolName, position, displayName)', () => {
    const t = teacherInfo({ displayName: 'Ana Cruz', schoolName: 'Old School', position: 'Teacher I', supervisorName: 'Old MT', supervisorPosition: 'Master Teacher I' });
    expect(t).toMatchObject({ name: 'Ana Cruz', school: 'Old School', designation: 'Teacher I' });
    expect(t.signatories.masterTeacher).toEqual({ name: 'Old MT', position: 'Master Teacher I' });
  });

  it('lists every editable field', () => {
    expect(PROFILE_FIELDS).toEqual(expect.arrayContaining(['userName', 'name', 'honorific', 'school', 'schoolId', 'district', 'division', 'region', 'designation', 'psdsName', 'psdsPosition']));
  });
});

describe('signatoryList (blank = not shown)', () => {
  it('includes only filled-in people, in DepEd order', () => {
    expect(signatoryList(FULL)).toEqual([
      { label: 'Prepared by:', name: 'Ben Mark Joy A. Cuvinar', position: 'Teacher VI' },
      { label: 'Checked by:', name: 'Juliet Bulahan', position: 'Master Teacher II', role: 'masterTeacher' },
      { label: 'Reviewed by:', name: 'Lisette Quinay', position: '', role: 'headTeacher' },
      { label: 'Approved by:', name: 'Dr. Aida M. Bejo', position: 'Principal IV', role: 'principal' },
    ]);
  });

  it('returns nothing for an empty profile — no placeholders, no default titles', () => {
    expect(signatoryList({})).toEqual([]);
    expect(signatoryList(null)).toEqual([]);
    expect(signatoryList({ designation: 'Teacher I' })).toEqual([]); // position alone is never printed
  });

  it('supports per-document labels and role subsets', () => {
    const s = signatoryList(FULL, { preparedBy: false, roles: ['principal'], labels: { principal: 'Noted by:' } });
    expect(s).toEqual([{ label: 'Noted by:', name: 'Dr. Aida M. Bejo', position: 'Principal IV', role: 'principal' }]);
  });
});

describe('teacherFactsForAI', () => {
  it('mentions only filled fields and forbids inventing the rest', () => {
    const facts = teacherFactsForAI(FULL);
    expect(facts).toContain('Teacher: Sir Ben Mark Joy A. Cuvinar, Teacher VI');
    expect(facts).toContain('Principal / School Head: Dr. Aida M. Bejo, Principal IV');
    expect(facts).not.toContain('Public Schools District Supervisor:');
    expect(facts).toMatch(/never invent/);
    expect(teacherFactsForAI({})).toMatch(/not filled in/);
  });

  it('reports completeness for a gentle nudge', () => {
    expect(profileCompleteness(FULL)).toMatchObject({ filled: 6, total: 6, missing: [] });
    expect(profileCompleteness({}).missing).toContain('Full name');
  });
});

describe('salutation uses the profile', () => {
  it('uses User name + Title exactly as chosen', () => {
    expect(getTeacherSalutationName({ userName: 'Ben', honorific: 'Sir', firstName: 'Benjamin' })).toBe('Sir Ben');
    expect(getTeacherSalutationName({ userName: 'Aida', honorific: 'Dr.' })).toBe('Dr. Aida');
    expect(getTeacherSalutationName({ userName: 'April' })).toBe("Ma'am April"); // no title chosen → old heuristic
  });
});
