'use client';

import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { relativeTime } from '@/lib/format';
import { IconBell } from '../ui/Icons';
import { Badge, EmptyState, Spinner } from '../ui/Primitives';
import type { Notification } from '@/lib/types';

const TYPE_TONE = {
  PLACEMENT: 'success',
  ACADEMIC: 'info',
  ALERT: 'danger',
  AI: 'brand',
  INFO: 'neutral',
} as const;

export function NotificationsMenu({ onNavigate }: { onNavigate?: (link: string) => void }) {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const load = async () => {
    setLoading(true);
    try {
      const result = await api.notifications();
      setNotifications(result.notifications);
      setUnread(result.unread);
    } catch {
      /* the bell degrades silently — never block the shell */
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    const interval = setInterval(() => void load(), 60_000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onClick = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  const markAllRead = async () => {
    setUnread(0);
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    await api.markNotificationsRead(undefined, true).catch(() => void load());
  };

  return (
    <div className="relative" ref={containerRef}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative rounded-lg p-2 text-ink-500 transition-colors hover:bg-ink-100 hover:text-ink-800"
        aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`}
        aria-expanded={open}
      >
        <IconBell width={18} height={18} />
        {unread > 0 ? (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">
            {unread > 9 ? '9+' : unread}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="animate-fade-in absolute right-0 z-40 mt-2 w-[22rem] max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-ink-200 bg-white shadow-pop">
          <div className="flex items-center justify-between border-b border-ink-100 px-4 py-3">
            <p className="text-sm font-semibold text-ink-900">Notifications</p>
            {unread > 0 ? (
              <button onClick={markAllRead} className="text-xs font-semibold text-brand-600 hover:text-brand-700">
                Mark all read
              </button>
            ) : null}
          </div>

          <div className="max-h-96 overflow-y-auto">
            {loading && !notifications.length ? (
              <div className="flex justify-center py-8">
                <Spinner />
              </div>
            ) : notifications.length === 0 ? (
              <EmptyState title="All caught up" description="Placement and academic alerts will appear here." icon={<IconBell />} />
            ) : (
              <ul className="divide-y divide-ink-100">
                {notifications.slice(0, 12).map((notification) => (
                  <li key={notification.id}>
                    <button
                      onClick={() => {
                        if (notification.link && onNavigate) onNavigate(notification.link);
                        setOpen(false);
                      }}
                      className={`w-full px-4 py-3 text-left transition-colors hover:bg-ink-50 ${notification.read ? '' : 'bg-brand-50/40'}`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-semibold text-ink-800">{notification.title}</p>
                        {!notification.read ? <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" /> : null}
                      </div>
                      <p className="mt-0.5 line-clamp-2 text-xs text-ink-500">{notification.body}</p>
                      <div className="mt-1.5 flex items-center gap-2">
                        <Badge tone={TYPE_TONE[notification.type]}>{notification.type.toLowerCase()}</Badge>
                        <span className="text-[11px] text-ink-400">{relativeTime(notification.createdAt)}</span>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
