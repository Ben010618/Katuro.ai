import { useState, useEffect } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { onSnapshot } from 'firebase/firestore';
import { auth } from '../firebase';
import { teacherRef } from '../services/db';

export function useAuth() {
  const [user,    setUser]    = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const timeout = setTimeout(() => setLoading(false), 10_000);
    const unsubAuth = onAuthStateChanged(auth, (currentUser) => {
      clearTimeout(timeout);
      setUser(currentUser);
      // If no user, stop loading now. If user exists, keep loading
      // until the Firestore profile snapshot arrives (see effect below).
      if (!currentUser) setLoading(false);
    });
    return () => { unsubAuth(); clearTimeout(timeout); };
  }, []);

  useEffect(() => {
    if (!user?.uid) { setProfile(null); return; }
    const unsub = onSnapshot(teacherRef(user.uid), (snap) => {
      setProfile(snap.exists() ? { id: snap.id, ...snap.data() } : null);
      setLoading(false);
    });
    return unsub;
  }, [user?.uid]);

  return {
    user,
    loading,
    profile,
    isAdmin:      profile?.isAdmin      ?? false,
    tokenBalance: profile?.tokenBalance ?? 0,
    disabled:     profile?.disabled     ?? false,
  };
}
