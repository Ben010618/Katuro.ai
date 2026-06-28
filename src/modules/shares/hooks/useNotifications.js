import { useState, useEffect, useCallback } from 'react';
import {
  subscribeToNotifications,
  markNotificationRead,
  markAllNotificationsRead,
} from '../services/notificationService';

/**
 * Real-time notifications for the current user.
 * @param {string} uid
 */
export function useNotifications(uid) {
  const [notifications, setNotifications] = useState([]);
  const [unreadCount,   setUnreadCount]   = useState(0);
  const [loading,       setLoading]       = useState(true);

  useEffect(() => {
    if (!uid) return;
    const unsub = subscribeToNotifications(uid, data => {
      setNotifications(data);
      setUnreadCount(data.filter(n => !n.read).length);
      setLoading(false);
    });
    return unsub;
  }, [uid]);

  const markRead = useCallback(async (notifId) => {
    await markNotificationRead(uid, notifId).catch(() => {});
  }, [uid]);

  const markAllRead = useCallback(async () => {
    await markAllNotificationsRead(uid).catch(() => {});
  }, [uid]);

  return { notifications, unreadCount, loading, markRead, markAllRead };
}
