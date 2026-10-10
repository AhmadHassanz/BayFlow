'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useId, useRef, useState } from 'react';
import { useNotificationFeed } from '@/lib/use-notification-feed';
import { markRead, notificationDestination } from '@/lib/api/notifications';
import { BookingReadError } from '@/lib/api/booking';
import { recordDate } from '@/lib/format';
import { AccessFeedback } from '@/components/workspace/AccessFeedback';

export function NotificationBell({ userId }: { userId?: string }) {
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(false);
  const [pending, setPending] = useState<string[]>([]);
  const [message, setMessage] = useState('');
  const lock = useRef(new Set<string>());
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const pathname = usePathname() || '/customer';
  const { data, error, loading, refresh } = useNotificationFeed(userId, unread);
  function close() { setOpen(false); trigger.current?.focus(); }
  useEffect(() => {
    if (!open) return;
    const element = dialog.current; element?.showModal();
    return () => { element?.close(); };
  }, [open]);
  async function read(id: string) {
    if (!data || lock.current.has(id)) return;
    lock.current.add(id); setPending(current => [...current, id]); setMessage('');
    try {
      await markRead(id, data.userId);
      setMessage('Read marker saved. Refreshing updates…');
      window.dispatchEvent(new Event('bayflow:notifications-updated'));
    } catch (failure) {
      setMessage(failure instanceof BookingReadError && failure.status === 401
        ? 'Your session expired. Sign in again, then refresh updates.'
        : 'We could not verify the read marker. Refresh updates or retry this item; marking it read again is safe.');
    } finally { lock.current.delete(id); setPending(current => current.filter(value => value !== id)); }
  }
  const count = data ? String(data.unreadCount) : error ? '!' : '…';
  return <div className="notification-bell"><button ref={trigger} className="notification-trigger" aria-label={data ? `Notifications · ${data.unreadCount} unread` : error ? 'Notifications unavailable' : 'Loading notifications'} aria-haspopup="dialog" aria-expanded={open} onClick={() => { setOpen(true); refresh(); }}>
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M6 9a6 6 0 0 1 12 0c0 7 3 7 3 8H3c0-1 3-1 3-8Z" /><path d="M9 20a3 3 0 0 0 6 0" /></svg><span className="notification-count" aria-hidden="true">{count}</span></button>
    {open && <dialog ref={dialog} className="notification-dialog" aria-labelledby={titleId} onCancel={event => { event.preventDefault(); close(); }}>
      <header className="notification-dialog-heading"><div><p className="eyebrow">Your updates</p><h2 id={titleId}>Workshop notifications.</h2></div><button autoFocus className="text-button" onClick={close}>Close updates</button></header>
      <div className="ledger-tabs" aria-label="Notification filter"><button aria-pressed={!unread} onClick={() => setUnread(false)}>All updates</button><button aria-pressed={unread} onClick={() => setUnread(true)}>Unread only</button><button className="text-button" onClick={refresh}>Refresh updates</button></div>
      {message && <p className="notification-message" role="status">{message}</p>}
      {error ? <AccessFeedback error={error} retry={refresh} returnTo={pathname} /> : loading && !data ? <p className="notification-loading" role="status">Loading your updates…</p> : data && <>
        <p className="fine-print">{data.unreadCount} unread · Latest {data.limit} updates. Older unread items can appear as you mark newer ones read.</p>
        {data.items.length ? <ul className="notification-items">{data.items.map(item => {
          const destination = notificationDestination(item, data.memberships);
          return <li key={item.id}><div className="notification-item-heading"><strong>{item.title}</strong><span className="role-badge">{item.readAt ? 'Read' : 'Unread'}</span></div><p>{item.message}</p><p className="notification-meta">{item.type.toLowerCase().replaceAll('_', ' ')} · <time dateTime={item.createdAt}>{recordDate(item.createdAt)} PKT</time></p>
            <div className="notification-item-actions">{destination && <Link className="text-button" href={destination} onClick={close}>View booking ↗</Link>}{!item.readAt && <button className="text-button" disabled={pending.includes(item.id)} onClick={() => void read(item.id)} aria-label={`Mark ${item.title} as read`}>{pending.includes(item.id) ? 'Saving read marker…' : 'Mark as read'}</button>}</div></li>;
        })}</ul> : <div className="empty-state"><h3>{unread ? 'No unread updates.' : 'No updates yet.'}</h3><p>Real workshop updates will appear here as your visits progress.</p></div>}
      </>}
    </dialog>}
  </div>;
}
