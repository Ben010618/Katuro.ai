/**
 * Firestore security rules tests — run against the local emulator:
 *   npm run test:rules
 * (skipped in the normal `npx vitest run`, which has no emulator)
 */
import { describe, it, beforeAll, afterAll, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, writeBatch, Timestamp } from 'firebase/firestore';

const hasEmulator = Boolean(process.env.FIRESTORE_EMULATOR_HOST);

describe.skipIf(!hasEmulator)('firestore.rules', () => {
  let env;

  beforeAll(async () => {
    env = await initializeTestEnvironment({
      projectId: 'katuro-rules-test',
      firestore: { rules: readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8') },
    });
  });

  afterAll(async () => {
    await env?.cleanup();
  });

  beforeEach(async () => {
    await env.clearFirestore();
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'teachers/teacher1'), { displayName: 'Ben', isAdmin: false, disabled: false, access: { mode: 'free' }, school: 'Rizal NHS' });
      await setDoc(doc(db, 'teachers/admin1'), { displayName: 'Admin', isAdmin: true });
      await setDoc(doc(db, 'teachers/teacher2'), { displayName: 'Other', isAdmin: false });
      await setDoc(doc(db, 'teachers/teacher1/usage/2026-10-03'), { dll_gen: 3 });
      await setDoc(doc(db, 'adminConfig/billing'), { freeMode: false });
    });
  });

  const asTeacher = () => env.authenticatedContext('teacher1').firestore();
  const asAdmin = () => env.authenticatedContext('admin1').firestore();

  it('teachers can edit their own normal profile fields', async () => {
    await assertSucceeds(updateDoc(doc(asTeacher(), 'teachers/teacher1'), { school: 'Bagong Paaralan', photoURL: 'x', announcementSeen_90dayPolicy: true }));
  });

  it('teachers cannot grant themselves a subscription, admin rights, or tokens', async () => {
    const db = asTeacher();
    await assertFails(updateDoc(doc(db, 'teachers/teacher1'), { access: { mode: 'subscription', subscriptionUntil: null } }));
    await assertFails(updateDoc(doc(db, 'teachers/teacher1'), { isAdmin: true }));
    await assertFails(updateDoc(doc(db, 'teachers/teacher1'), { disabled: true, school: 'sneaky' }));
    // A disabled teacher cannot re-enable themselves.
    await env.withSecurityRulesDisabled((ctx) => updateDoc(doc(ctx.firestore(), 'teachers/teacher1'), { disabled: true }));
    await assertFails(updateDoc(doc(db, 'teachers/teacher1'), { disabled: false }));
    await assertFails(updateDoc(doc(db, 'teachers/teacher1'), { tokenBalance: 9999 }));
  });

  it('teachers cannot reset their daily AI usage or write plan history', async () => {
    const db = asTeacher();
    await assertSucceeds(getDoc(doc(db, 'teachers/teacher1/usage/2026-10-03')));
    await assertFails(setDoc(doc(db, 'teachers/teacher1/usage/2026-10-03'), { dll_gen: 0 }));
    await assertFails(setDoc(doc(db, 'teachers/teacher1/accessLogs/x'), { plan: 'subscription' }));
    await assertFails(setDoc(doc(db, 'teachers/teacher1/tokenLogs/x'), { amount: 100 }));
  });

  it('teachers still own their other data (lesson plans, sessions…)', async () => {
    const db = asTeacher();
    await assertSucceeds(setDoc(doc(db, 'teachers/teacher1/lessonPlans/p1'), { title: 'Cells' }));
    await assertSucceeds(setDoc(doc(db, 'teachers/teacher1/actionResearch/a1'), { phase: 1 }));
  });

  it("teachers cannot read or write another teacher's data", async () => {
    const db = asTeacher();
    await assertFails(getDoc(doc(db, 'teachers/teacher2')));
    await assertFails(updateDoc(doc(db, 'teachers/teacher2'), { school: 'x' }));
    await assertFails(setDoc(doc(db, 'teachers/teacher2/lessonPlans/p1'), { title: 'x' }));
  });

  it('teacher documents cannot be created or deleted by clients', async () => {
    await assertFails(setDoc(doc(env.authenticatedContext('newbie').firestore(), 'teachers/newbie'), { isAdmin: false }));
  });

  it('admins can change plans and account fields', async () => {
    const db = asAdmin();
    await assertSucceeds(updateDoc(doc(db, 'teachers/teacher1'), { access: { mode: 'subscription', subscriptionUntil: null }, disabled: true }));
    await assertSucceeds(setDoc(doc(db, 'teachers/teacher1/usage/2026-10-03'), { dll_gen: 0 }));
  });

  it('everyone signed in can read the free-for-everyone switch; only admins can change it', async () => {
    await assertSucceeds(getDoc(doc(asTeacher(), 'adminConfig/billing')));
    await assertFails(setDoc(doc(asTeacher(), 'adminConfig/billing'), { freeMode: true }));
    await assertSucceeds(setDoc(doc(asAdmin(), 'adminConfig/billing'), { freeMode: true }));
    await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), 'adminConfig/billing')));
  });

  it('Shares: following writes both sides and one follower count; nothing more', async () => {
    await env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), 'shares_profiles/teacher2'), { followerCount: 4, bio: 'hi' }));
    const db = asTeacher();
    const b = writeBatch(db);
    b.set(doc(db, 'shares_follows/teacher1/following/teacher2'), { at: 1 });
    b.set(doc(db, 'shares_follows/teacher2/followers/teacher1'), { at: 1 });
    await assertSucceeds(b.commit());
    await assertSucceeds(updateDoc(doc(db, 'shares_profiles/teacher2'), { followerCount: 5 }));
    await assertFails(updateDoc(doc(db, 'shares_profiles/teacher2'), { followerCount: 50 }));   // only by one
    await assertFails(updateDoc(doc(db, 'shares_profiles/teacher2'), { bio: 'hacked' }));       // no other fields
    await assertFails(setDoc(doc(db, 'shares_follows/teacher2/followers/admin1'), { at: 1 }));  // not on behalf of others
  });

  describe('classroom sections (adviser teacher1, subject teacher teacher2, stranger teacher3)', () => {
    const later = () => Timestamp.fromMillis(Date.now() + 7 * 864e5);
    beforeEach(async () => {
      await env.withSecurityRulesDisabled(async (ctx) => {
        const db = ctx.firestore();
        await setDoc(doc(db, 'teachers/teacher3'), { displayName: 'Stranger', isAdmin: false });
        await setDoc(doc(db, 'sections/s1'), { adviserUid: 'teacher1', sectionName: 'Rizal' });
        await setDoc(doc(db, 'sections/s1/students/st1'), { surname: 'Cruz', givenName: 'Juan' });
        await setDoc(doc(db, 'invitations/inv1'), { sectionId: 's1', subject: 'Math', adviserUid: 'teacher1', status: 'pending', teacherUid: null, teacherName: null, expiresAt: later() });
      });
    });
    const as = (uid) => env.authenticatedContext(uid).firestore();
    const accept = (uid, inv = 'inv1') => {
      const db = as(uid);
      const b = writeBatch(db);
      b.update(doc(db, `invitations/${inv}`), { status: 'accepted', teacherUid: uid, teacherName: 'T' });
      b.set(doc(db, `sections/s1/members/${uid}`), { uid, invitationId: inv, subject: 'Math' });
      return b.commit();
    };

    it('a stranger cannot read or change the roster or grades of another adviser', async () => {
      const db = as('teacher3');
      await assertFails(getDoc(doc(db, 'sections/s1')));
      await assertFails(getDoc(doc(db, 'sections/s1/students/st1')));
      await assertFails(setDoc(doc(db, 'sections/s1/students/st1'), { surname: 'Hacked' }));
      await assertFails(setDoc(doc(db, 'sections/s1/grades/term1_math/students/st1'), { finalGrade: 99 }));
      await assertFails(setDoc(doc(db, 'sections/s1/members/teacher3'), { uid: 'teacher3', invitationId: 'inv1' }));
    });

    it('the adviser manages the roster and reads grades', async () => {
      const db = as('teacher1');
      await assertSucceeds(getDoc(doc(db, 'sections/s1')));
      await assertSucceeds(setDoc(doc(db, 'sections/s1/students/st2'), { surname: 'Reyes' }));
      await assertSucceeds(getDoc(doc(db, 'sections/s1/grades/term1_math/students/st1')));
    });

    it('a subject teacher who accepted can read the roster and write grades, not edit the roster', async () => {
      await assertSucceeds(accept('teacher2'));
      const db = as('teacher2');
      await assertSucceeds(getDoc(doc(db, 'sections/s1/students/st1')));
      await assertSucceeds(setDoc(doc(db, 'sections/s1/grades/term1_math/students/st1'), { finalGrade: 85 }));
      await assertSucceeds(setDoc(doc(db, 'sections/s1/gradeWeights/term1_math'), { writtenWorksWeight: 40 }));
      await assertFails(setDoc(doc(db, 'sections/s1/students/st1'), { surname: 'Changed' }));
    });

    it('an invitation is accepted once, by yourself, before it expires', async () => {
      await assertSucceeds(accept('teacher2'));
      await assertFails(accept('teacher3'));                                     // already accepted
      await assertFails(updateDoc(doc(as('teacher3'), 'invitations/inv1'), { status: 'pending' }));
      await env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), 'invitations/inv2'), {
        sectionId: 's1', subject: 'Science', adviserUid: 'teacher1', status: 'pending', teacherUid: null, expiresAt: Timestamp.fromMillis(Date.now() - 1000),
      }));
      await assertFails(accept('teacher3', 'inv2'));                             // expired
      await env.withSecurityRulesDisabled((ctx) => updateDoc(doc(ctx.firestore(), 'invitations/inv2'), { expiresAt: later() }));
      await assertFails(updateDoc(doc(as('teacher3'), 'invitations/inv2'), { status: 'accepted', teacherUid: 'teacher2' })); // not as someone else
      await assertFails(updateDoc(doc(as('teacher3'), 'invitations/inv2'), { status: 'accepted', teacherUid: 'teacher3', sectionId: 'other' })); // no other fields
    });

    it('only the adviser of a section can create its invitations', async () => {
      await assertSucceeds(setDoc(doc(as('teacher1'), 'invitations/inv3'), { sectionId: 's1', adviserUid: 'teacher1', status: 'pending' }));
      await assertFails(setDoc(doc(as('teacher3'), 'invitations/inv4'), { sectionId: 's1', adviserUid: 'teacher3', status: 'pending' }));
    });
  });
});
