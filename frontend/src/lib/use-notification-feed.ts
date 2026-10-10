'use client';
import { useEffect, useState, useCallback } from 'react';
import { loadNotificationFeed, type NotificationFeed } from './api/notifications';

export function useNotificationFeed(userId: string | undefined, unread: boolean) {
  const [outcome, setOutcome] = useState<({ userId: string | undefined; unread: boolean } &
    ({ kind: 'success'; data: NotificationFeed } | { kind: 'error'; error: unknown })) | null>(null);
  const [attempt, setAttempt] = useState(0);
  const refresh = useCallback(() => setAttempt(value => value + 1), []);
  const freshScope = outcome?.userId === userId && outcome?.unread === unread;
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    loadNotificationFeed(userId, unread, controller.signal).then(feed => {
      if (active) setOutcome({ userId, unread, kind: 'success', data: feed });
    }).catch(error => { if (active) setOutcome({ userId, unread, kind: 'error', error }); })
      .finally(() => clearTimeout(timer));
    return () => { active = false; clearTimeout(timer); controller.abort(); };
  }, [userId, unread, attempt]);
  useEffect(() => {
    const interval = setInterval(() => { if (document.visibilityState === 'visible') refresh(); }, 25000);
    const focused = () => refresh();
    window.addEventListener('focus', focused);
    window.addEventListener('bayflow:notifications-updated', focused);
    return () => { clearInterval(interval); window.removeEventListener('focus', focused); window.removeEventListener('bayflow:notifications-updated', focused); };
  }, [refresh]);
  return { data: freshScope && outcome?.kind === 'success' ? outcome.data : null,
    error: freshScope && outcome?.kind === 'error' ? outcome.error : null, loading: !freshScope, refresh };
}
