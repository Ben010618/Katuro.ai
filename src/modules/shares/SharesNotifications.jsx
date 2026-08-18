import { useEffect } from 'react';
import PropTypes from 'prop-types';
import { Bell } from 'lucide-react';
import { useNotifications }  from './hooks/useNotifications';
import { NotificationItem }  from './components/NotificationItem';

export default function SharesNotifications({ uid }) {
  const { notifications, loading, markRead, markAllRead } = useNotifications(uid);

  useEffect(() => {
    markAllRead();
  }, []);

  return (
    <div style={{ padding: '0 16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, paddingTop: 14 }}>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: 'var(--kt-text-primary, #262119)', fontFamily: 'var(--kt-font-heading, "Bitter", serif)' }}>
          Notifications
        </h2>
        {notifications.some(n => !n.read) && (
          <button
            onClick={markAllRead}
            style={{ background: 'none', border: 'none', color: 'var(--sh-primary)', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}
            type="button"
          >
            Mark all as read
          </button>
        )}
      </div>

      <div className="sh-card" style={{ overflow: 'hidden', padding: 0 }}>
        {loading ? (
          <div style={{ padding: 24, textAlign: 'center', color: 'var(--sh-text-muted)' }}>
            Loading…
          </div>
        ) : notifications.length === 0 ? (
          <div className="sh-empty">
            <div className="sh-empty-icon"><Bell size={40} /></div>
            <div className="sh-empty-title">No notifications yet</div>
            <p className="sh-empty-text">When someone follows you or reacts to your posts, you'll see it here.</p>
          </div>
        ) : (
          notifications.map(n => (
            <NotificationItem key={n.id} notif={n} onRead={markRead} />
          ))
        )}
      </div>
    </div>
  );
}

SharesNotifications.propTypes = {
  uid: PropTypes.string.isRequired,
};
