import { useState } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { db } from '../firebase';
import { useAuth } from '../hooks/useAuth';

export default function InactivityAnnouncementModal() {
  const { user, profile } = useAuth();
  const [dismissing, setDismissing] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  const shouldShow = !!user && !!profile && !profile.announcementSeen_90dayPolicy && !dismissed;
  if (!shouldShow) return null;

  async function handleDismiss() {
    setDismissing(true);
    try {
      await updateDoc(doc(db, 'teachers', user.uid), { announcementSeen_90dayPolicy: true });
    } catch {
      // Non-fatal — worst case the notice shows again next session
    } finally {
      setDismissed(true);
      setDismissing(false);
    }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 10000,
      background: 'rgba(20,0,0,0.6)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 16,
    }}>
      <style>{`
        @keyframes kt-inactivity-in {
          from { opacity: 0; transform: scale(0.95); }
          to   { opacity: 1; transform: scale(1); }
        }
        @keyframes kt-inactivity-spin { to { transform: rotate(360deg); } }
        @keyframes kt-inactivity-shake {
          0%, 100% { transform: translateX(0); }
          20%      { transform: translateX(-4px); }
          40%      { transform: translateX(4px); }
          60%      { transform: translateX(-3px); }
          80%      { transform: translateX(3px); }
        }
        .kt-inactivity-card {
          animation: kt-inactivity-in 0.25s ease-out both,
                     kt-inactivity-shake 0.5s ease-in-out 0.25s both;
        }
        @media (prefers-reduced-motion: reduce) {
          .kt-inactivity-card { animation: kt-inactivity-in 0.25s ease-out both; }
        }
      `}</style>

      <div className="kt-inactivity-card" style={{
        background: '#fff', borderRadius: 18,
        width: '100%', maxWidth: 480,
        border: '3px solid #dc2626',
        boxShadow: '0 24px 70px rgba(0,0,0,0.4)',
        overflow: 'hidden',
      }}>
        <div style={{
          background: 'linear-gradient(135deg, #dc2626 0%, #991b1b 100%)',
          padding: '20px 24px', display: 'flex', alignItems: 'center', gap: 12,
        }}>
          <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'rgba(255,255,255,0.2)', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
            <AlertTriangle size={22} color="#fff" />
          </div>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#fff' }}>Important Notice</h2>
        </div>

        <div style={{ padding: '24px' }}>
          <p style={{ margin: 0, fontSize: 15, lineHeight: 1.6, color: '#1f2937', fontWeight: 500 }}>
            Accounts with no activity — no login, site visit, or any action — for <strong>90 days or more</strong> will
            be automatically deactivated, and permanently deleted 30 days after that, to save space and enhance the
            experience of active users.
          </p>
          <p style={{ margin: '12px 0 0', fontSize: 14, lineHeight: 1.6, color: '#4b5563' }}>
            Simply logging in keeps your account active — no extra steps needed.
          </p>

          <button
            onClick={handleDismiss}
            disabled={dismissing}
            style={{
              width: '100%', marginTop: 22,
              background: '#dc2626', color: '#fff', border: 'none',
              borderRadius: 10, padding: '13px 0', fontSize: 15, fontWeight: 700,
              cursor: dismissing ? 'not-allowed' : 'pointer', opacity: dismissing ? 0.7 : 1,
              fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            }}
          >
            {dismissing && <Loader2 size={15} style={{ animation: 'kt-inactivity-spin 0.8s linear infinite' }} />}
            I Understand
          </button>
        </div>
      </div>
    </div>
  );
}
