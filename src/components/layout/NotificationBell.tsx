import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bell, CheckCheck, X, Zap, ArrowRightLeft, Shield, TrendingUp, Megaphone } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';

interface Notification {
  id: string;
  type: 'tx' | 'price' | 'node' | 'governance' | 'announcement';
  title: string;
  body: string;
  read: boolean;
  createdAt: string;
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

// Demo notifications — in production these come from user_notifications table
const DEMO: Notification[] = [
  { id: '1', type: 'announcement', title: 'Mainnet launch confirmed', body: 'GYDSchain mainnet is confirmed for Q4 2026. Upgrade your nodes.', read: false, createdAt: '2h ago' },
  { id: '2', type: 'tx',           title: 'Transaction confirmed',     body: 'Your bridge tx of 1,500,000 GYDS confirmed in block #1,234,567.', read: false, createdAt: '4h ago' },
  { id: '3', type: 'price',        title: 'GYDS price alert',          body: 'GYDS is up 12.4% in the last 24h — now at $0.000000115.', read: true,  createdAt: '1d ago' },
  { id: '4', type: 'governance',   title: 'New governance proposal',   body: 'Proposal #3 "Validator Reward Formula v2" is now open for voting.', read: true, createdAt: '2d ago' },
  { id: '5', type: 'node',         title: 'Node approved',             body: 'Your lite node installation has been approved by the network.', read: true, createdAt: '3d ago' },
];

export function NotificationBell() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>(DEMO);
  const panelRef = useRef<HTMLDivElement>(null);

  const unread = notifications.filter(n => !n.read).length;

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    if (open) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const markRead = (id: string) =>
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));

  const markAllRead = () =>
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));

  const dismiss = (id: string) =>
    setNotifications(prev => prev.filter(n => n.id !== id));

  if (!user) return null;

  return (
    <div className="relative" ref={panelRef}>
      {/* Bell button */}
      <button
        onClick={() => setOpen(o => !o)}
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

      {/* Panel */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 top-12 w-80 bg-sidebar border border-sidebar-border rounded-xl shadow-xl z-50 overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-sidebar-border">
              <h3 className="font-semibold text-sm">Notifications</h3>
              <div className="flex items-center gap-2">
                {unread > 0 && (
                  <button onClick={markAllRead} className="text-xs text-primary hover:underline flex items-center gap-1">
                    <CheckCheck className="w-3 h-3" /> Mark all read
                  </button>
                )}
              </div>
            </div>

            {/* List */}
            <div className="max-h-80 overflow-y-auto divide-y divide-sidebar-border/50">
              {notifications.length === 0 ? (
                <div className="p-6 text-center text-sm text-muted-foreground">
                  <Bell className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  No notifications
                </div>
              ) : (
                notifications.map(n => {
                  const Icon = TYPE_ICON[n.type];
                  return (
                    <div
                      key={n.id}
                      className={cn('flex gap-3 px-4 py-3 transition-colors hover:bg-sidebar-accent/50', !n.read && 'bg-primary/5')}
                    >
                      <div className={cn('w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5', TYPE_COLOR[n.type])}>
                        <Icon className="w-3.5 h-3.5" />
                      </div>
                      <div className="flex-1 min-w-0 cursor-pointer" onClick={() => markRead(n.id)}>
                        <div className="flex items-start justify-between gap-1">
                          <p className={cn('text-xs font-semibold', !n.read && 'text-foreground')}>{n.title}</p>
                          {!n.read && <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0 mt-1" />}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{n.body}</p>
                        <p className="text-[10px] text-muted-foreground/60 mt-0.5">{n.createdAt}</p>
                      </div>
                      <button onClick={() => dismiss(n.id)} className="text-muted-foreground hover:text-foreground p-0.5 shrink-0 mt-0.5">
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  );
                })
              )}
            </div>

            {/* Footer */}
            <div className="px-4 py-2 border-t border-sidebar-border text-center">
              <button className="text-xs text-primary hover:underline">View all notifications</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
