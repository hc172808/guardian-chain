import { useEffect, useRef, useState, useCallback } from 'react';
import { GlassCard } from '@/components/ui/GlassCard';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Activity, LogIn, ArrowRightLeft, Server, Vote, Droplets,
  Coins, ShieldCheck, Wifi, WifiOff, Pause, Play, Trash2, Filter
} from 'lucide-react';

type EventType = 'login' | 'logout' | 'transaction' | 'node_heartbeat' | 'governance_vote' | 'node_approved' | 'token_created' | 'faucet' | 'bridge' | 'admin_action';

interface ActivityEvent {
  id: string;
  type: EventType;
  title: string;
  detail: string;
  user?: string;
  ip?: string;
  ts: string;
  meta?: Record<string, any>;
}

const EVENT_META: Record<EventType, { icon: any; color: string; bg: string }> = {
  login:           { icon: LogIn,          color: 'text-blue-400',   bg: 'bg-blue-500/10' },
  logout:          { icon: LogIn,          color: 'text-slate-400',  bg: 'bg-slate-500/10' },
  transaction:     { icon: ArrowRightLeft,  color: 'text-green-400',  bg: 'bg-green-500/10' },
  node_heartbeat:  { icon: Server,          color: 'text-cyan-400',   bg: 'bg-cyan-500/10' },
  governance_vote: { icon: Vote,            color: 'text-purple-400', bg: 'bg-purple-500/10' },
  node_approved:   { icon: ShieldCheck,     color: 'text-emerald-400',bg: 'bg-emerald-500/10' },
  token_created:   { icon: Coins,           color: 'text-yellow-400', bg: 'bg-yellow-500/10' },
  faucet:          { icon: Droplets,        color: 'text-sky-400',    bg: 'bg-sky-500/10' },
  bridge:          { icon: ArrowRightLeft,  color: 'text-orange-400', bg: 'bg-orange-500/10' },
  admin_action:    { icon: ShieldCheck,     color: 'text-red-400',    bg: 'bg-red-500/10' },
};

const ALL_TYPES: EventType[] = ['login', 'logout', 'transaction', 'node_heartbeat', 'governance_vote', 'node_approved', 'token_created', 'faucet', 'bridge', 'admin_action'];

const TYPE_LABELS: Record<EventType, string> = {
  login: 'Login', logout: 'Logout', transaction: 'Tx', node_heartbeat: 'Heartbeat',
  governance_vote: 'Vote', node_approved: 'Node', token_created: 'Token',
  faucet: 'Faucet', bridge: 'Bridge', admin_action: 'Admin',
};

function fmt(ts: string) {
  const d = new Date(ts);
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export function ActivityFeed() {
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [paused, setPaused] = useState(false);
  const [filter, setFilter] = useState<EventType | 'all'>('all');
  const [connected, setConnected] = useState(false);
  const [newCount, setNewCount] = useState(0);
  const feedRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const pausedRef = useRef(false);
  pausedRef.current = paused;

  const scrollToBottom = useCallback(() => {
    if (feedRef.current) feedRef.current.scrollTop = feedRef.current.scrollHeight;
  }, []);

  const connect = useCallback(async () => {
    try {
      const tokenRes = await fetch('/api/admin/ws-token', { credentials: 'include' });
      if (!tokenRes.ok) return;
      const { token } = await tokenRes.json();
      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(`${proto}//${window.location.host}/ws/admin/activity?token=${token}`);
      wsRef.current = ws;

      ws.onopen = () => setConnected(true);
      ws.onclose = () => {
        setConnected(false);
        // Reconnect after 3s
        setTimeout(() => connect(), 3000);
      };
      ws.onerror = () => ws.close();

      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data);
          if (msg.type === 'history') {
            setEvents(msg.events ?? []);
            setTimeout(scrollToBottom, 50);
          } else if (msg.type === 'event') {
            if (!pausedRef.current) {
              setEvents(prev => [...prev.slice(-499), msg.event]);
              setTimeout(scrollToBottom, 20);
            } else {
              setNewCount(n => n + 1);
            }
          }
        } catch {}
      };
    } catch {}
  }, [scrollToBottom]);

  useEffect(() => {
    connect();
    return () => { wsRef.current?.close(); };
  }, [connect]);

  const resume = () => {
    setPaused(false);
    setNewCount(0);
    setTimeout(scrollToBottom, 50);
  };

  const filtered = filter === 'all' ? events : events.filter(e => e.type === filter);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Activity className="w-5 h-5 text-primary" />
          <h2 className="text-lg font-semibold">Live Activity Feed</h2>
          <div className={`w-2 h-2 rounded-full animate-pulse ${connected ? 'bg-green-400' : 'bg-red-400'}`} />
          <span className={`text-xs ${connected ? 'text-green-400' : 'text-red-400'}`}>
            {connected ? 'Connected' : 'Reconnecting…'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-xs">{filtered.length} events</Badge>
          {paused && newCount > 0 && (
            <Badge className="bg-primary/20 text-primary border-primary/30 text-xs animate-pulse">
              +{newCount} new
            </Badge>
          )}
          <Button
            variant="outline" size="sm"
            onClick={() => paused ? resume() : setPaused(true)}
            className="gap-1 h-7 text-xs"
          >
            {paused ? <><Play className="w-3 h-3" />Resume</> : <><Pause className="w-3 h-3" />Pause</>}
          </Button>
          <Button
            variant="outline" size="sm"
            onClick={() => setEvents([])}
            className="gap-1 h-7 text-xs"
          >
            <Trash2 className="w-3 h-3" />Clear
          </Button>
        </div>
      </div>

      {/* Filter chips */}
      <div className="flex flex-wrap gap-1.5">
        <button
          onClick={() => setFilter('all')}
          className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${filter === 'all' ? 'bg-primary text-primary-foreground' : 'bg-muted/30 text-muted-foreground hover:bg-muted/50'}`}
        >
          All
        </button>
        {ALL_TYPES.map(t => {
          const m = EVENT_META[t];
          const count = events.filter(e => e.type === t).length;
          if (count === 0 && filter !== t) return null;
          return (
            <button
              key={t}
              onClick={() => setFilter(f => f === t ? 'all' : t)}
              className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors flex items-center gap-1 ${filter === t ? 'bg-primary text-primary-foreground' : 'bg-muted/30 text-muted-foreground hover:bg-muted/50'}`}
            >
              <span>{TYPE_LABELS[t]}</span>
              {count > 0 && <span className="opacity-60">({count})</span>}
            </button>
          );
        })}
      </div>

      {/* Feed */}
      <GlassCard className="overflow-hidden">
        <div
          ref={feedRef}
          className="h-[520px] overflow-y-auto p-2 space-y-1 font-mono text-xs"
          style={{ scrollBehavior: 'smooth' }}
        >
          {filtered.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center gap-3 text-muted-foreground">
              {connected
                ? <><Activity className="w-8 h-8 opacity-30" /><p>Waiting for events…</p><p className="text-xs opacity-60">Events will appear here in real time</p></>
                : <><WifiOff className="w-8 h-8 opacity-30" /><p>Connecting to activity stream…</p></>
              }
            </div>
          ) : (
            <AnimatePresence initial={false}>
              {filtered.map(ev => {
                const m = EVENT_META[ev.type] ?? EVENT_META.admin_action;
                const Icon = m.icon;
                return (
                  <motion.div
                    key={ev.id}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.15 }}
                    className="flex items-start gap-2 px-2 py-1.5 rounded-md hover:bg-muted/10 group"
                  >
                    <span className="text-muted-foreground/50 shrink-0 w-20 pt-0.5">{fmt(ev.ts)}</span>
                    <span className={`${m.bg} ${m.color} rounded p-0.5 shrink-0`}>
                      <Icon className="w-3 h-3" />
                    </span>
                    <span className={`${m.color} shrink-0 w-24 truncate font-semibold`}>{ev.title}</span>
                    <span className="text-foreground/80 flex-1 truncate">{ev.detail}</span>
                    {ev.user && <span className="text-muted-foreground/60 shrink-0 truncate max-w-[80px]">{ev.user}</span>}
                    {ev.ip && <span className="text-muted-foreground/40 shrink-0 hidden group-hover:inline">{ev.ip}</span>}
                  </motion.div>
                );
              })}
            </AnimatePresence>
          )}
        </div>
      </GlassCard>

      {/* Stats bar */}
      <div className="grid grid-cols-5 gap-2">
        {(['login', 'transaction', 'faucet', 'governance_vote', 'node_heartbeat'] as EventType[]).map(t => {
          const m = EVENT_META[t];
          const Icon = m.icon;
          const count = events.filter(e => e.type === t).length;
          return (
            <GlassCard key={t} className="p-3 text-center cursor-pointer hover:border-primary/30 transition-colors" onClick={() => setFilter(f => f === t ? 'all' : t)}>
              <Icon className={`w-4 h-4 mx-auto mb-1 ${m.color}`} />
              <p className="text-lg font-bold">{count}</p>
              <p className="text-xs text-muted-foreground">{TYPE_LABELS[t]}</p>
            </GlassCard>
          );
        })}
      </div>
    </div>
  );
}
