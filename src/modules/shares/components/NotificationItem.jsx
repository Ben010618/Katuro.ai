import PropTypes from 'prop-types';
import { Link } from 'react-router-dom';
import { timeAgo, avatarColor } from '../services/sharesService';

const ICONS = {
  follow:   '👤',
  reaction: '❤️',
  comment:  '💬',
  reply:    '↩️',
};

const LABELS = {
  follow:   (n) => <><strong>{n.fromName}</strong> started following you.</>,
  reaction: (n) => <><strong>{n.fromName}</strong> reacted {n.reactionEmoji || ''} to your post.</>,
  comment:  (n) => <><strong>{n.fromName}</strong> commented on your post.</>,
  reply:    (n) => <><strong>{n.fromName}</strong> replied to your comment.</>,
};

export function NotificationItem({ notif, onRead }) {
  const bg = avatarColor(notif.fromUid || '');

  function handleClick() {
    if (!notif.read) onRead?.(notif.id);
  }

  const inner = (
    <div
      className={`sh-notif-item ${notif.read ? '' : 'sh-notif-item--unread'}`}
      onClick={handleClick}
    >
      <div className={`sh-notif-icon sh-notif-icon--${notif.type}`}>
        {ICONS[notif.type] || '🔔'}
      </div>
      <div style={{ flex: 1 }}>
        <div className="sh-notif-text">
          {LABELS[notif.type]?.(notif) ?? <strong>{notif.fromName}</strong>}
        </div>
        <div className="sh-notif-time">{timeAgo(notif.createdAt)}</div>
      </div>
      {!notif.read && <div className="sh-notif-dot" />}
    </div>
  );

  if (notif.postId) {
    return <Link to={`/shares`} style={{ textDecoration: 'none' }}>{inner}</Link>;
  }
  return inner;
}

NotificationItem.propTypes = {
  notif:  PropTypes.object.isRequired,
  onRead: PropTypes.func,
};
