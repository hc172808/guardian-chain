import { useState, useEffect, useRef } from 'react';
import { GlassCard } from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Server, Play, Square, RefreshCw, Terminal, Wifi, WifiOff,
  Cpu, Activity, Hash, Users2, ChevronDown, ChevronUp,
} from 'lucide-react';

interface NodeStatus {
  online: boolean;
  blockHeight: number | null;
  peers: number | null;
  chainId: number | null;
  managedByApi: boolean;
  recentLogs: string[];
}

interface StatusResponse {
  litenode: NodeStatus;
}

async function apiPost(path: string) {
  const res = await fetch(path, { method: 'POST', credentials: 'include' });
  return res.json() as Promise<{ ok: boolean; message: string }>;
}

export function NodeManager() {
  const { toast } = useToast();
  const [status, setStatus] = useState<NodeStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionPending, setActionPending] = useState<string | null>(null);
  const [logsOpen, setLogsOpen] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const logRef = useRef<HTMLDivElement>(null);

  const fetchStatus = async () => {
    try {
      const res = await fetch('/api/admin/nodes/status', { credentials: 'include' });
      const data = (await res.json()) as StatusResponse;
      setStatus(data.litenode);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  };

  const fetchLogs = async () => {
    try {
      const res = await fetch('/api/admin/nodes/litenode/logs', { credentials: 'include' });
      const data = (await res.json()) as { logs: string[] };
      setLogs(data.logs);
      setTimeout(() => logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: 'smooth' }), 50);
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 4000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (logsOpen) {
      fetchLogs();
      const interval = setInterval(fetchLogs, 3000);
      return () => clearInterval(interval);
    }
  }, [logsOpen]);

  const doAction = async (action: 'start' | 'stop' | 'restart') => {
    setActionPending(action);
    try {
      const result = await apiPost(`/api/admin/nodes/litenode/${action}`);
      toast({
        title: result.ok ? 'Done' : 'Notice',
        description: result.message,
        variant: result.ok ? 'default' : 'destructive',
      });
      if (result.ok) setTimeout(fetchStatus, 2000);
    } catch {
      toast({ title: 'Request failed', variant: 'destructive' });
    } finally {
      setActionPending(null);
    }
  };

  const nodeOnline = status?.online ?? false;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Server className="w-5 h-5 text-primary" />
            Node Manager
          </h3>
          <p className="text-sm text-muted-foreground mt-0.5">
            Monitor and control the GYDS litenode (Chain ID 13370)
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={fetchStatus} className="gap-1.5 text-xs">
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Litenode card */}
      <GlassCard className="p-5 space-y-5">
        {/* Status row */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`p-2.5 rounded-xl ${nodeOnline ? 'bg-emerald-500/20' : 'bg-destructive/20'}`}>
              {nodeOnline
                ? <Wifi className="w-5 h-5 text-emerald-400" />
                : <WifiOff className="w-5 h-5 text-destructive" />
              }
            </div>
            <div>
              <p className="font-semibold text-foreground">GYDS Litenode</p>
              <p className="text-xs text-muted-foreground">Port 8545 · PoS · 5 s blocks</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {nodeOnline ? (
              <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Online
              </Badge>
            ) : (
              <Badge variant="destructive" className="gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-destructive-foreground" />
                Offline
              </Badge>
            )}
            {status?.managedByApi && (
              <Badge variant="outline" className="text-xs border-primary/40 text-primary">API-managed</Badge>
            )}
          </div>
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-lg bg-background/40 border border-border/30 p-3 text-center">
            <Hash className="w-4 h-4 text-primary mx-auto mb-1" />
            <p className="text-lg font-bold font-mono">
              {status?.blockHeight != null ? status.blockHeight.toLocaleString() : '—'}
            </p>
            <p className="text-xs text-muted-foreground">Block Height</p>
          </div>
          <div className="rounded-lg bg-background/40 border border-border/30 p-3 text-center">
            <Users2 className="w-4 h-4 text-primary mx-auto mb-1" />
            <p className="text-lg font-bold font-mono">
              {status?.peers != null ? status.peers : '—'}
            </p>
            <p className="text-xs text-muted-foreground">Peers</p>
          </div>
          <div className="rounded-lg bg-background/40 border border-border/30 p-3 text-center">
            <Cpu className="w-4 h-4 text-primary mx-auto mb-1" />
            <p className="text-lg font-bold font-mono">
              {status?.chainId != null ? status.chainId : '—'}
            </p>
            <p className="text-xs text-muted-foreground">Chain ID</p>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            onClick={() => doAction('start')}
            disabled={actionPending !== null || nodeOnline}
            className="gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white"
          >
            {actionPending === 'start'
              ? <><Activity className="w-3.5 h-3.5 animate-spin" /> Starting…</>
              : <><Play className="w-3.5 h-3.5" /> Start Node</>
            }
          </Button>
          <Button
            size="sm"
            variant="destructive"
            onClick={() => doAction('stop')}
            disabled={actionPending !== null || !status?.managedByApi}
            className="gap-1.5"
          >
            {actionPending === 'stop'
              ? <><Activity className="w-3.5 h-3.5 animate-spin" /> Stopping…</>
              : <><Square className="w-3.5 h-3.5" /> Stop Node</>
            }
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => doAction('restart')}
            disabled={actionPending !== null}
            className="gap-1.5 border-primary/40 text-primary hover:bg-primary/10"
          >
            {actionPending === 'restart'
              ? <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> Restarting…</>
              : <><RefreshCw className="w-3.5 h-3.5" /> Restart Node</>
            }
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setLogsOpen((v) => !v)}
            className="gap-1.5 ml-auto text-muted-foreground"
          >
            <Terminal className="w-3.5 h-3.5" />
            Logs
            {logsOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </Button>
        </div>

        {/* Log panel */}
        <AnimatePresence>
          {logsOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div
                ref={logRef}
                className="rounded-lg bg-black/60 border border-border/40 p-3 font-mono text-xs text-green-400 h-52 overflow-y-auto space-y-0.5"
              >
                {logs.length === 0 ? (
                  <p className="text-muted-foreground">No logs yet — start the node to see output.</p>
                ) : (
                  logs.map((line, i) => (
                    <p key={i} className="leading-relaxed whitespace-pre-wrap break-all">{line}</p>
                  ))
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Info note */}
        <p className="text-xs text-muted-foreground leading-relaxed border-t border-border/30 pt-3">
          <strong>Stop</strong> and <strong>Start</strong> only control processes launched from this panel.
          The Replit workflow litenode (already running) will keep producing blocks and cannot be
          stopped from here — use the Replit workflow panel for that.
        </p>
      </GlassCard>
    </div>
  );
}
