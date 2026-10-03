import { useState, useEffect } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { teacherRef, applyPendingPassword } from '../services/db';
import { trackEvent } from '../services/usageTracker';
import { planInfo } from '../services/plans';

// useAuth runs in ~47 components; each subscribes to auth. The "login" event and the
// pending-password check must happen once per page load per account, not once per
// component (that inflated Site Visits / Top Visitors several times per page).
let lastSignedInUid = null;

export function useAuth() {
  const [user,     setUser]     = useState(null);
  const [profile,  setProfile]  = useState(null);
  const [loading,  setLoading]  = useState(true);
  const [freeMode, setFreeMode] = useState(false);

  useEffect(() => {
    const timeout = setTimeout(() => setLoading(false), 5_000);
    const unsubAuth = onAuthStateChanged(auth, (currentUser) => {
      clearTimeout(timeout);
      setUser(currentUser);
      if (!currentUser) { lastSignedInUid = null; setLoading(false); return; }
      if (lastSignedInUid !== currentUser.uid) {
        lastSignedInUid = currentUser.uid;
        applyPendingPassword(currentUser).catch(() => {});
        trackEvent(currentUser.uid, 'login');
      }
    });
    return () => { unsubAuth(); clearTimeout(timeout); };
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- clears profile on sign-out before (re)subscribing to Firestore
    if (!user?.uid) { setProfile(null); return; }
    const unsub = onSnapshot(
      teacherRef(user.uid),
      (snap) => {
        setProfile(snap.exists() ? { id: snap.id, ...snap.data() } : null);
        setLoading(false);
      },
      () => setLoading(false),
    );
    return unsub;
  }, [user?.uid]);

  // Global "free for everyone" promo switch (adminConfig/billing.freeMode)
  useEffect(() => {
    const unsub = onSnapshot(
      doc(db, 'adminConfig', 'billing'),
      (snap) => setFreeMode(snap.data()?.freeMode === true),
      ()     => setFreeMode(false),
    );
    return unsub;
  }, []);

  return {
    user,
    loading,
    profile,
    freeMode,
    // photoURL prefers Firestore (real-time after upload) over stale Firebase Auth value
    photoURL:        profile?.photoURL         || user?.photoURL || null,
    isAdmin:         profile?.isAdmin          ?? false,
    // Access plan: { plan: 'free'|'subscription', mode, until, daysLeft, expired, expiringSoon, freeForAll, label }
    plan:            planInfo(profile, freeMode),
    disabled:        profile?.disabled         ?? false,
    pendingApproval: profile?.pendingApproval  ?? false,
  };
}
