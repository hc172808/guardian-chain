import { useState, useEffect, useRef, useCallback } from 'react';
import { GlassCard } from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import {
  Play, Square, RefreshCw, Terminal, Wifi, WifiOff,
  Activity, Cpu, Zap, Server, Clock, Copy, Check, Globe
} from 'lucide-react';
import { cn } from '@/lib/utils';

function useCopy(text: string) {
  const [copied, setCopied] = useState(false);
  const copy = useCallback(() => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  }, [text]);
  return { copied, copy };
}

function getNodeHost(): string {
  if (typeof window === 'undefined') return 'localhost';
  const { hostname } = window.location;
  if (hostname === 'localhost' || hostname === '127.0.0.1') return 'localhost';
  return hostname;
}

type NodeType = 'rpc' | 'lite';

interface NodeStatus {
  running: boolean;
  startedAt: string | null;
  port: number;
  blockHeight: number;
  peers: number;
}

interface Status {
  rpc: NodeStatus;
  lite: NodeStatus;
}

const NODE_META: Record<NodeType, { label: string; description: string; color: string; icon: any }> = {
  rpc:  {
    label: 'RPC Test Node',
    description: 'Ethereum-compatible JSON-RPC endpoint (eth_blockNumber, eth_getBlockByNumber, net_version…). Use for MetaMask / frontend testing.',
    color: 'text-primary',
    icon: Cpu,
  },
  lite: {
    label: 'Lite Test Node',
    description: 'Lightweight header-sync node. Simulates peer discovery and block header propagation without full state.',
    color: 'text-neon-cyan',
    icon: Zap,
  },
};

function formatUptime(startedAt: string | null): string {
  if (!startedAt) return '—';
  const seconds = Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000);
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
}

function CopyButton({ text }: { text: string }) {
  const { copied, copy } = useCopy(text);
  return (
    <button onClick={copy} title="Copy" className="ml-1.5 text-muted-foreground hover:text-foreground transition-colors">
      {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  );
}

function NodeCard({ type, status, onStart, onStop, loading }: {
  type: NodeType;
  status: NodeStatus;
  onStart: () => void;
  onStop: () => void;
  loading: boolean;
}) {
  const [logs, setLogs] = useState<string[]>([]);
  const [logsOpen, setLogsOpen] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);
  const meta = NODE_META[type];
  const Icon = meta.icon;
  const host = getNodeHost();
  const endpointUrl = type === 'rpc'
    ? `http://${host}:${status.port}`
    : `http://${host}:${status.port}/status`;

  const fetchLogs = useCallback(async () => {
    const res = await fetch(`/api/admin/test-nodes/${type}/logs`, { credentials: 'include' });
    if (res.ok) {
      const data: string[] = await res.json();
      setLogs(data);
      setTimeout(() => {
        if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
      }, 50);
    }
  }, [type]);

  useEffect(() => {
    if (!logsOpen) return;
    fetchLogs();
    const id = setInterval(fetchLogs, 3000);
    return () => clearInterval(id);
  }, [logsOpen, fetchLogs, status.running]);

  const [uptime, setUptime] = useState(formatUptime(status.startedAt));
  useEffect(() => {
    const id = setInterval(() => setUptime(formatUptime(status.startedAt)), 1000);
    return () => clearInterval(id);
  }, [status.startedAt]);

  return (
    <GlassCard className={cn('p-5 space-y-4 border', status.running ? 'border-primary/30' : 'border-border/30')}>
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className={cn('p-2.5 rounded-xl border', status.running ? 'bg-primary/10 border-primary/30' : 'bg-muted/30 border-border/30')}>
            <Icon className={cn('w-5 h-5', status.running ? meta.color : 'text-muted-foreground')} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-semibold">{meta.label}</span>
              <Badge variant="outline" className={cn('text-xs', status.running
                ? 'text-emerald-400 border-emerald-500/40 bg-emerald-500/10'
                : 'text-muted-foreground border-border/40')}>
                {status.running ? (
                  <span className="flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    Running
                  </span>
                ) : 'Stopped'}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">{meta.description}</p>
          </div>
        </div>
        <div className="flex gap-2 shrink-0">
          {status.running ? (
            <Button variant="destructive" size="sm" onClick={onStop} disabled={loading} className="gap-1.5">
              <Square className="w-3.5 h-3.5" /> Stop
            </Button>
          ) : (
            <Button variant="default" size="sm" onClick={onStart} disabled={loading} className="gap-1.5">
              <Play className="w-3.5 h-3.5" /> Start
            </Button>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-2.5 rounded-lg bg-muted/20 border border-border/20 text-center">
          <p className="text-xs text-muted-foreground">Port</p>
          <p className="font-mono font-bold text-sm">{status.port}</p>
        </div>
        <div className="p-2.5 rounded-lg bg-muted/20 border border-border/20 text-center">
          <p className="text-xs text-muted-foreground">Block Height</p>
          <p className="font-bold text-sm">{status.running ? `#${status.blockHeight.toLocaleString()}` : '—'}</p>
        </div>
        <div className="p-2.5 rounded-lg bg-muted/20 border border-border/20 text-center">
          <p className="text-xs text-muted-foreground">Peers</p>
          <p className="font-bold text-sm">{status.running ? status.peers : '—'}</p>
        </div>
        <div className="p-2.5 rounded-lg bg-muted/20 border border-border/20 text-center">
          <p className="text-xs text-muted-foreground flex items-center justify-center gap-1"><Clock className="w-3 h-3" /> Uptime</p>
          <p className="font-bold text-sm">{status.running ? uptime : '—'}</p>
        </div>
      </div>

      {/* Endpoint info when running */}
      {status.running && (
        <div className="p-3 rounded-lg bg-muted/10 border border-border/20 font-mono text-xs space-y-1.5">
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Globe className="w-3 h-3" /> Endpoint
          </div>
          <div className="flex items-center gap-1">
            <span className="text-primary break-all">{endpointUrl}</span>
            <CopyButton text={endpointUrl} />
          </div>
          {type === 'rpc' && (
            <p className="text-muted-foreground/60">JSON-RPC · Chain ID: 13370 · GYDS Testnet</p>
          )}
          {type === 'lite' && (
            <p className="text-muted-foreground/60">Header sync · peers: {status.peers} · block #{status.blockHeight.toLocaleString()}</p>
          )}
        </div>
      )}

      {/* Logs toggle */}
      <div>
        <button
          onClick={() => setLogsOpen(o => !o)}
          className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <Terminal className="w-3.5 h-3.5" />
          {logsOpen ? 'Hide' : 'Show'} logs
          {status.running && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />}
        </button>
        {logsOpen && (
          <div
            ref={logRef}
            className="mt-2 h-48 overflow-y-auto rounded-lg bg-black/60 border border-border/20 p-3 font-mono text-xs space-y-0.5"
          >
            {logs.length === 0 ? (
              <p className="text-muted-foreground">No logs yet…</p>
            ) : logs.map((line, i) => (
              <p key={i} className={cn(
                'leading-relaxed',
                line.includes('ERROR') ? 'text-red-400'
                : line.includes('Block #') || line.includes('Header #') ? 'text-emerald-400'
                : line.includes('started') ? 'text-yellow-400'
                : line.includes('stopped') ? 'text-orange-400'
                : 'text-green-300/80'
              )}>
                {line}
              </p>
            ))}
          </div>
        )}
      </div>
    </GlassCard>
  );
}

export function TestNodeManager() {
  const { toast } = useToast();
  const [status, setStatus] = useState<Status>({
    rpc:  { running: false, startedAt: null, port: 8545, blockHeight: 1000, peers: 4 },
    lite: { running: false, startedAt: null, port: 8555, blockHeight: 1000, peers: 2 },
  });
  const [loading, setLoading] = useState<Record<NodeType, boolean>>({ rpc: false, lite: false });

  const fetchStatus = useCallback(async () => {
    const res = await fetch('/api/admin/test-nodes/status', { credentials: 'include' });
    if (res.ok) setStatus(await res.json());
  }, []);

  useEffect(() => {
    fetchStatus();
    const id = setInterval(fetchStatus, 5000);
    return () => clearInterval(id);
  }, [fetchStatus]);

  const action = async (type: NodeType, act: 'start' | 'stop') => {
    setLoading(l => ({ ...l, [type]: true }));
    try {
      const res = await fetch(`/api/admin/test-nodes/${type}/${act}`, {
        method: 'POST', credentials: 'include',
      });
      const data = await res.json();
      toast({ title: data.message, variant: data.ok ? 'default' : 'destructive' });
      if (data.ok) await fetchStatus();
    } catch {
      toast({ title: 'Request failed', variant: 'destructive' });
    } finally {
      setLoading(l => ({ ...l, [type]: false }));
    }
  };

  const bothRunning = status.rpc.running && status.lite.running;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Server className="w-5 h-5 text-primary" /> Replit Test Nodes
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            In-process simulated blockchain nodes for local development and integration testing.
            <span className="text-amber-400 font-medium ml-1">Admin / Founder only.</span>
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={fetchStatus} className="gap-1.5">
            <RefreshCw className="w-3.5 h-3.5" />
          </Button>
          {bothRunning ? (
            <Button variant="destructive" size="sm" onClick={async () => {
              await action('rpc', 'stop');
              await action('lite', 'stop');
            }} className="gap-1.5">
              <Square className="w-3.5 h-3.5" /> Stop All
            </Button>
          ) : (
            <Button size="sm" onClick={async () => {
              if (!status.rpc.running) await action('rpc', 'start');
              if (!status.lite.running) await action('lite', 'start');
            }} className="gap-1.5">
              <Play className="w-3.5 h-3.5" /> Start All
            </Button>
          )}
        </div>
      </div>

      {/* Network health */}
      <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/10 border border-border/20 text-sm">
        {status.rpc.running || status.lite.running
          ? <Wifi className="w-4 h-4 text-emerald-400 shrink-0" />
          : <WifiOff className="w-4 h-4 text-muted-foreground shrink-0" />}
        <span className="text-muted-foreground">
          {bothRunning
            ? 'Both nodes running — testnet is live on ports 8545 (RPC) and 8555 (Lite)'
            : status.rpc.running
            ? 'RPC node running on port 8545 — lite node stopped'
            : status.lite.running
            ? 'Lite node running on port 8555 — RPC node stopped'
            : 'No test nodes running — start a node to begin testing'}
        </span>
        {(status.rpc.running || status.lite.running) && (
          <Activity className="w-4 h-4 text-emerald-400 animate-pulse ml-auto shrink-0" />
        )}
      </div>

      <NodeCard
        type="rpc"
        status={status.rpc}
        onStart={() => action('rpc', 'start')}
        onStop={() => action('rpc', 'stop')}
        loading={loading.rpc}
      />
      <NodeCard
        type="lite"
        status={status.lite}
        onStart={() => action('lite', 'start')}
        onStop={() => action('lite', 'stop')}
        loading={loading.lite}
      />

      <MetaMaskCard rpcPort={status.rpc.port} />
    </div>
  );
}

function MetaMaskCard({ rpcPort }: { rpcPort: number }) {
  const host = getNodeHost();
  const rpcUrl = `http://${host}:${rpcPort}`;
  const isRemote = host !== 'localhost';
  const { copied: c1, copy: copy1 } = useCopy(rpcUrl);
  const { copied: c2, copy: copy2 } = useCopy('13370');

  return (
    <div className="space-y-3">
      <GlassCard className="p-4 space-y-3 border border-amber-500/20 bg-amber-500/5">
        <p className="text-sm font-semibold text-amber-400">Connect MetaMask to this node</p>
        <ol className="text-xs text-muted-foreground space-y-2 list-decimal list-inside">
          <li>Start the RPC node above (port {rpcPort})</li>
          <li>Open MetaMask → Settings → Networks → Add Network</li>
          <li className="flex flex-wrap items-center gap-1">
            RPC URL:
            <span className="font-mono text-primary">{rpcUrl}</span>
            <button onClick={copy1} className="text-muted-foreground hover:text-foreground">
              {c1 ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
          </li>
          <li className="flex flex-wrap items-center gap-1">
            Chain ID:
            <span className="font-mono text-primary">13370</span>
            <button onClick={copy2} className="text-muted-foreground hover:text-foreground">
              {c2 ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
            | Currency: <span className="font-mono text-primary">GYDS</span>
          </li>
          <li>Explorer URL: <span className="font-mono text-primary">https://explorer.netlifegy.com</span></li>
        </ol>
      </GlassCard>

      {isRemote && (
        <GlassCard className="p-4 space-y-2 border border-blue-500/20 bg-blue-500/5">
          <p className="text-sm font-semibold text-blue-400 flex items-center gap-2">
            <Server className="w-4 h-4" /> Remote Server Setup
          </p>
          <p className="text-xs text-muted-foreground">
            This dashboard is running on <span className="font-mono text-primary">{host}</span>.
            The test nodes bind to <span className="font-mono">0.0.0.0</span> so they are reachable on your server's public IP.
            Make sure your firewall allows ports <span className="font-mono text-primary">{rpcPort}</span> and <span className="font-mono text-primary">8555</span>.
          </p>
          <div className="text-xs font-mono bg-black/40 rounded p-2 text-green-300 space-y-0.5">
            <p className="text-muted-foreground"># Open ports on UFW (Ubuntu)</p>
            <p>sudo ufw allow {rpcPort}/tcp</p>
            <p>sudo ufw allow 8555/tcp</p>
            <p className="text-muted-foreground"># Or iptables</p>
            <p>iptables -A INPUT -p tcp --dport {rpcPort} -j ACCEPT</p>
            <p>iptables -A INPUT -p tcp --dport 8555 -j ACCEPT</p>
          </div>
        </GlassCard>
      )}
    </div>
  );
}
