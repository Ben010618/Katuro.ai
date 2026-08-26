import { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { useAuth } from '../../hooks/useAuth';
import { db } from '../../firebase';
import suggestIcon from '../../assets/suggest.webp';
import SuggestionModal from './SuggestionModal';
import SpeechBubble from '../../components/SpeechBubble';
import {
  subscribeAnnouncement,
  isAnnouncementUnread,
  markAnnouncementSeen,
} from '../../services/announcementDb';

export default function FloatingSuggestButton() {
  const { user, profile } = useAuth();
  const [open, setOpen] = useState(false);
  const [unreadReplies, setUnreadReplies] = useState(0);
  const [announcement, setAnnouncement] = useState(null);
  const [bubbleOpen, setBubbleOpen] = useState(false);

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

  useEffect(() => {
    if (!user?.uid) return undefined;
    return subscribeAnnouncement(setAnnouncement);
  }, [user?.uid]);

  const hasAnnouncement = isAnnouncementUnread(announcement, profile?.announcementSeenVersion);
  // The mascot's badge counts everything it is waiting to tell you: the unread
  // announcement plus any replies to your own feedback. So "1" is usually the
  // announcement alone and "2" is an announcement plus a reply.
  const badgeCount = (hasAnnouncement ? 1 : 0) + unreadReplies;

  // An announcement takes over the click: tapping the mascot speaks it in a
  // bubble instead of opening the suggestion form. Once dismissed, the button
  // goes straight back to its normal job.
  function handleMascotClick() {
    if (hasAnnouncement) setBubbleOpen(true);
    else setOpen(true);
  }

  async function dismissAnnouncement() {
    setBubbleOpen(false);
    try {
      await markAnnouncementSeen(user.uid, announcement?.version ?? 0);
    } catch {
      // Non-fatal — worst case the announcement shows again next session,
      // which is far better than blocking the teacher behind a failed write.
    }
  }

  if (!user) return null;

  const ariaLabel = hasAnnouncement
    ? 'Read the announcement from kaTuro'
    : unreadReplies > 0
      ? `Send a suggestion — ${unreadReplies} reply from kaTuro`
      : 'Send a suggestion';

  return (
    <>
      <style>{`
        @keyframes kt-suggest-float {
          0%, 100% { transform: translateY(0); }
          50%      { transform: translateY(-6px); }
        }
        /* Announcement waiting: a short shake that pauses between bursts, so it
           draws the eye without becoming a permanent distraction. */
        @keyframes kt-suggest-shake {
          0%, 62%, 100%   { transform: translateX(0) rotate(0deg); }
          66%             { transform: translateX(-5px) rotate(-7deg); }
          70%             { transform: translateX(5px)  rotate(7deg); }
          74%             { transform: translateX(-4px) rotate(-5deg); }
          78%             { transform: translateX(4px)  rotate(5deg); }
          82%             { transform: translateX(-2px) rotate(-2deg); }
          86%             { transform: translateX(0) rotate(0deg); }
        }
        .kt-suggest-btn {
          animation: kt-suggest-float 3s ease-in-out infinite;
          transition: transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
        }
        .kt-suggest-btn[data-alert='true'] {
          animation: kt-suggest-shake 2.6s ease-in-out infinite;
        }
        .kt-suggest-btn:hover {
          transform: scale(1.1);
          animation-play-state: paused;
        }
        @keyframes kt-bubble-in {
          from { opacity: 0; transform: translateY(8px) scale(0.94); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
        .kt-bubble {
          animation: kt-bubble-in 0.22s cubic-bezier(0.34, 1.4, 0.64, 1) both;
          transform-origin: bottom right;
        }
        @media (prefers-reduced-motion: reduce) {
          .kt-suggest-btn,
          .kt-suggest-btn[data-alert='true'] { animation: none; }
          .kt-suggest-btn:hover { transform: none; }
          .kt-bubble { animation: none; }
        }
      `}</style>

      <div style={{ position: 'fixed', bottom: 20, right: 20, zIndex: 500 }}>
        {bubbleOpen && hasAnnouncement && (
          <div style={{ position: 'absolute', bottom: 96, right: 0, zIndex: 1 }}>
            <SpeechBubble
              title={announcement?.title || 'Announcement'}
              onClose={dismissAnnouncement}
              footer={
                <button
                  type="button"
                  onClick={dismissAnnouncement}
                  style={{
                    width: '100%', border: 'none', borderRadius: 10,
                    background: 'var(--kt-green-primary)', color: '#fff',
                    padding: '9px 14px', fontSize: 13, fontWeight: 700,
                    fontFamily: 'inherit', cursor: 'pointer',
                  }}
                >
                  Got it
                </button>
              }
            >
              {announcement?.text}
            </SpeechBubble>
          </div>
        )}

        <button
          className="kt-suggest-btn"
          data-alert={hasAnnouncement ? 'true' : 'false'}
          onClick={handleMascotClick}
          aria-label={ariaLabel}
          title={hasAnnouncement ? 'New announcement from kaTuro' : 'Send a suggestion'}
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
        {badgeCount > 0 && (
          <span style={{
            position: 'absolute', top: -4, right: -4,
            minWidth: 22, height: 22, padding: '0 5px', borderRadius: 11,
            background: '#c0392b', color: '#fff', fontSize: 11, fontWeight: 700,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: '2px solid var(--kt-card)', pointerEvents: 'none',
          }}>
            {badgeCount}
          </span>
        )}
      </div>

      {open && <SuggestionModal onClose={() => setOpen(false)} defaultView={unreadReplies > 0 ? 'mine' : 'new'} />}
    </>
  );
}
