import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { needsEmailCode, hasVisitPass } from '../services/emailCode';

/**
 * Website only: 'loading' | 'ask' (show the email-code screen) | 'pass'.
 * Anything that goes wrong reading the switch or the last check lets the teacher in —
 * the code is a safety step, never a reason to lock someone out.
 */
export function useEmailCodeGate(uid) {
  const [state, setState] = useState({ uid: null, config: undefined, check: undefined });

  useEffect(() => {
    if (!uid) return undefined;
    const put = (patch) => setState((s) => ({ ...(s.uid === uid ? s : { uid, config: undefined, check: undefined }), ...patch }));
    const unsubConfig = onSnapshot(
      doc(db, 'adminConfig', 'emailCode'),
      (snap) => put({ config: snap.exists() ? snap.data() : null }),
      () => put({ config: null }),
    );
    const unsubCheck = onSnapshot(
      doc(db, 'emailChecks', uid),
      (snap) => put({ check: snap.exists() ? snap.data() : null }),
      () => put({ check: { verifiedAt: Date.now() } }), // unreadable → do not ask
    );
    return () => { unsubConfig(); unsubCheck(); };
  }, [uid]);

  if (!uid) return 'pass';
  const mine = state.uid === uid ? state : { config: undefined, check: undefined };
  const need = needsEmailCode(mine.config, mine.check);
  if (need === undefined) return 'loading';
  if (!need || hasVisitPass(uid)) return 'pass';
  return 'ask';
}
