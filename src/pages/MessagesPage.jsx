import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BellRing } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import MessagesPanel from '../features/messages/MessagesPanel';

/** /messages — teacher-to-teacher chats (same school or division). */
export default function MessagesPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const canAsk = typeof Notification !== 'undefined' && Notification.permission === 'default';
  const [asked, setAsked] = useState(false);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, height: 'calc(100vh - 120px)', minHeight: 480 }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, color: 'var(--kt-text-primary)', fontFamily: 'var(--kt-font-heading)' }}>Messages</h1>
          <p style={{ margin: '4px 0 0', fontSize: 13.5, color: 'var(--kt-text-secondary)' }}>Chat with teachers from your school or division, one-to-one or as a team.</p>
        </div>
        {canAsk && !asked && (
          <button
            onClick={() => { setAsked(true); Notification.requestPermission().catch(() => {}); }}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'transparent', border: '1px solid var(--kt-border)', color: 'var(--kt-text-primary)', borderRadius: 8, padding: '7px 12px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}
          >
            <BellRing size={13} /> Notify me of new messages
          </button>
        )}
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        <MessagesPanel user={user} onOpenProfile={() => navigate('/settings')} />
      </div>
    </div>
  );
}
