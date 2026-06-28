import { useState, useEffect } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { teacherRef, applyPendingPassword } from '../services/db';

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
      if (!currentUser) { setLoading(false); return; }
      applyPendingPassword(currentUser).catch(() => {});
    });
    return () => { unsubAuth(); clearTimeout(timeout); };
  }, []);

  useEffect(() => {
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

  // Subscribe to global free-mode flag (adminConfig/billing)
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
    tokenBalance:    profile?.tokenBalance     ?? 0,
    disabled:        profile?.disabled         ?? false,
    pendingApproval: profile?.pendingApproval  ?? false,
  };
}
