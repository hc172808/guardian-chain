import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bell, CheckCheck, X, Zap, ArrowRightLeft, Shield, TrendingUp, Megaphone, RefreshCw } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';

interface Notification {
  id: string;
  type: 'tx' | 'price' | 'node' | 'governance' | 'announcement';
  title: string;
  body: string;
  read: boolean;
  link?: string;
  created_at: string;
}

const TYPE_ICON: Record<Notification['type'], any> = {
  tx:           ArrowRightLeft,
  price:        TrendingUp,
  node:         Zap,
  governance:   Shield,
  announcement: Megaphone,
};

const TYPE_COLOR: Record<Notification['type'], string> = {
  tx:           'text-primary bg-primary/10',
  price:        'text-emerald-400 bg-emerald-500/10',
  node:         'text-amber-400 bg-amber-500/10',
  governance:   'text-purple-400 bg-purple-500/10',
  announcement: 'text-red-400 bg-red-500/10',
};

const fmtRelative = (d: string) => {
  const diff = Date.now() - new Date(d).getTime();
  if (diff < 60000) return 'just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return `${Math.floor(diff / 86400000)}d ago`;
};

export function NotificationBell() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const unread = notifications.filter(n => !n.read).length;

  const fetchNotifications = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const res = await fetch('/api/notifications', { credentials: 'include' });
      if (res.ok) setNotifications(await res.json());
    } catch {}
    finally { setLoading(false); }
  }, [user]);

  useEffect(() => { fetchNotifications(); }, [fetchNotifications]);

  useEffect(() => {
    if (!user) return;
    const interval = setInterval(fetchNotifications, 30000);
    return () => clearInterval(interval);
  }, [user, fetchNotifications]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    if (open) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const markRead = async (id: string) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
    await fetch(`/api/notifications/${id}/read`, { method: 'PATCH', credentials: 'include' });
  };

  const markAllRead = async () => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    await fetch('/api/notifications/read-all', { method: 'PATCH', credentials: 'include' });
  };

  const dismiss = async (id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
    await fetch(`/api/notifications/${id}`, { method: 'DELETE', credentials: 'include' });
  };

  if (!user) return null;

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={() => { setOpen(o => !o); if (!open) fetchNotifications(); }}
        className="relative p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-sidebar-accent transition-colors"
        aria-label="Notifications"
      >
        <Bell className="w-5 h-5" />
        {unread > 0 && (
          <span className="absolute top-1 right-1 w-4 h-4 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 top-12 w-80 bg-sidebar border border-sidebar-border rounded-xl shadow-xl z-50 overflow-hidden"
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-sidebar-border">
              <h3 className="font-semibold text-sm">Notifications</h3>
              <div className="flex items-center gap-2">
                <button onClick={fetchNotifications} className="text-muted-foreground hover:text-foreground p-0.5 transition-colors">
                  <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
                </button>
                {unread > 0 && (
                  <button onClick={markAllRead} className="text-xs text-primary hover:underline flex items-center gap-1">
                    <CheckCheck className="w-3 h-3" /> Mark all read
                  </button>
                )}
              </div>
            </div>

            <div className="max-h-80 overflow-y-auto divide-y divide-sidebar-border/50">
              {loading && notifications.length === 0 ? (
                <div className="p-6 text-center text-sm text-muted-foreground">
                  <RefreshCw className="w-5 h-5 mx-auto mb-2 animate-spin opacity-40" />
                  Loading…
                </div>
              ) : notifications.length === 0 ? (
                <div className="p-6 text-center text-sm text-muted-foreground">
                  <Bell className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  No notifications
                </div>
              ) : (
                notifications.map(n => {
                  const type = (TYPE_ICON[n.type as Notification['type']] ? n.type : 'announcement') as Notification['type'];
                  const Icon = TYPE_ICON[type];
                  return (
                    <div
                      key={n.id}
                      className={cn('flex gap-3 px-4 py-3 transition-colors hover:bg-sidebar-accent/50', !n.read && 'bg-primary/5')}
                    >
                      <div className={cn('w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5', TYPE_COLOR[type])}>
                        <Icon className="w-3.5 h-3.5" />
                      </div>
                      <div className="flex-1 min-w-0 cursor-pointer" onClick={() => markRead(n.id)}>
                        <div className="flex items-start justify-between gap-1">
                          <p className={cn('text-xs font-semibold', !n.read && 'text-foreground')}>{n.title}</p>
                          {!n.read && <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0 mt-1" />}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{n.body}</p>
                        <p className="text-[10px] text-muted-foreground/60 mt-0.5">{fmtRelative(n.created_at)}</p>
                        {n.link && (
                          <a href={n.link} className="text-[10px] text-primary hover:underline mt-0.5 block" onClick={e => e.stopPropagation()}>
                            View →
                          </a>
                        )}
                      </div>
                      <button onClick={() => dismiss(n.id)} className="text-muted-foreground hover:text-foreground p-0.5 shrink-0 mt-0.5">
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  );
                })
              )}
            </div>

            <div className="px-4 py-2 border-t border-sidebar-border text-center">
              <span className="text-xs text-muted-foreground">{notifications.length} notification{notifications.length !== 1 ? 's' : ''}</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
