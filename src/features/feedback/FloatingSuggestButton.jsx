import { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { useAuth } from '../../hooks/useAuth';
import { db } from '../../firebase';
import suggestIcon from '../../assets/suggest.webp';
import SuggestionModal from './SuggestionModal';

export default function FloatingSuggestButton() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [unreadReplies, setUnreadReplies] = useState(0);

  useEffect(() => {
    // Nothing renders below when there's no user (see the early return further
    // down), so there's no stale badge to reset here -- just skip subscribing.
    if (!user?.uid) return undefined;
    // Firestore can't filter "reply exists" directly, so this counts every
    // entry with a reply and filters replyRead client-side -- a teacher's
    // own feedback volume is small enough that this is cheap.
    const unsub = onSnapshot(
      query(collection(db, 'feedback_inbox'), where('createdBy.uid', '==', user.uid)),
      (snap) => {
        const count = snap.docs.filter((d) => {
          const data = d.data();
          return !!data.reply && !data.replyRead;
        }).length;
        setUnreadReplies(count);
      },
      () => setUnreadReplies(0),
    );
    return unsub;
  }, [user?.uid]);

  if (!user) return null;

  return (
    <>
      <style>{`
        @keyframes kt-suggest-float {
          0%, 100% { transform: translateY(0); }
          50%      { transform: translateY(-6px); }
        }
        .kt-suggest-btn {
          animation: kt-suggest-float 3s ease-in-out infinite;
          transition: transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
        }
        .kt-suggest-btn:hover {
          transform: scale(1.1);
          animation-play-state: paused;
        }
        @media (prefers-reduced-motion: reduce) {
          .kt-suggest-btn { animation: none; }
          .kt-suggest-btn:hover { transform: none; }
        }
      `}</style>

      <div style={{ position: 'fixed', bottom: 20, right: 20, zIndex: 500 }}>
        <button
          className="kt-suggest-btn"
          onClick={() => setOpen(true)}
          aria-label={unreadReplies > 0 ? `Send a suggestion — ${unreadReplies} reply from kaTuro` : 'Send a suggestion'}
          title="Send a suggestion"
          style={{
            position: 'relative',
            width: 84, height: 84, borderRadius: '50%',
            border: 'none', cursor: 'pointer', padding: 0,
            background: 'var(--kt-card)',
            boxShadow: '0 8px 24px rgba(13,34,24,0.28)',
            display: 'grid', placeItems: 'center',
            overflow: 'hidden',
          }}
        >
          <img src={suggestIcon} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        </button>
        {unreadReplies > 0 && (
          <span style={{
            position: 'absolute', top: -4, right: -4,
            minWidth: 22, height: 22, padding: '0 5px', borderRadius: 11,
            background: '#c0392b', color: '#fff', fontSize: 11, fontWeight: 700,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: '2px solid var(--kt-card)', pointerEvents: 'none',
          }}>
            {unreadReplies}
          </span>
        )}
      </div>

      {open && <SuggestionModal onClose={() => setOpen(false)} defaultView={unreadReplies > 0 ? 'mine' : 'new'} />}
    </>
  );
}
