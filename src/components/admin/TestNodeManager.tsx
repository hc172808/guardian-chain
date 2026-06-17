import { useState, useEffect, useRef, useCallback } from 'react';
import { GlassCard } from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import {
  Play, Square, RefreshCw, Terminal, Wifi, WifiOff,
  Activity, Cpu, Zap, Server, Clock, Copy, Check, Globe,
  Database, Rocket, Shield, MonitorDot, Link2
} from 'lucide-react';
import { cn } from '@/lib/utils';

type NodeType = 'rpc' | 'lite' | 'fullnode' | 'boostnode' | 'validator';

interface NodeStatus {
  running: boolean;
  startedAt: string | null;
  port: number;
  blockHeight: number;
  peers: number;
  txPool: number;
}

interface Status {
  rpc: NodeStatus;
  lite: NodeStatus;
  fullnode: NodeStatus;
  boostnode: NodeStatus;
  validator: NodeStatus;
}

const NODE_META: Record<NodeType, { label: string; description: string; color: string; icon: any; badge?: string }> = {
  rpc: {
    label: 'RPC Test Node',
    description: 'Ethereum-compatible JSON-RPC (eth_blockNumber, eth_getBlockByNumber, eth_chainId…). Use for MetaMask / frontend testing.',
    color: 'text-primary',
    icon: Cpu,
  },
  lite: {
    label: 'Lite Test Node',
    description: 'Lightweight header-sync node. Simulates peer discovery and block header propagation without full state.',
    color: 'text-neon-cyan',
    icon: Zap,
  },
  fullnode: {
    label: 'Full Node',
    description: 'Full-state node with mempool, txpool_status, debug_traceTransaction, eth_getLogs, eth_call, eth_getCode, storage queries.',
    color: 'text-violet-400',
    icon: Database,
    badge: 'Full State',
  },
  boostnode: {
    label: 'Boost Node',
    description: '1-second blocks, high-throughput MEV/priority-tx processing, /boost/bundle endpoint, txpool simulation, elevated peer count.',
    color: 'text-amber-400',
    icon: Rocket,
    badge: 'MEV · 1s blocks',
  },
  validator: {
    label: 'Validator Node',
    description: 'PoS consensus node. Proposes blocks every 120s, runs validator_info / validator_set / validator_getRewards / validator_register. Requires 1000 GYDS stake.',
    color: 'text-emerald-400',
    icon: Shield,
    badge: 'PoS · 120s',
  },
};

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

function CopyBtn({ text }: { text: string }) {
  const { copied, copy } = useCopy(text);
  return (
    <button onClick={copy} title="Copy" className="ml-1 text-muted-foreground hover:text-foreground transition-colors shrink-0">
      {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  );
}

function formatUptime(startedAt: string | null): string {
  if (!startedAt) return '—';
  const seconds = Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000);
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
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

  const endpointUrl = type === 'lite'
    ? `http://${host}:${status.port}/status`
    : type === 'boostnode'
    ? `http://${host}:${status.port}`
    : `http://${host}:${status.port}`;

  const fetchLogs = useCallback(async () => {
    const res = await fetch(`/api/admin/test-nodes/${type}/logs`, { credentials: 'include' });
    if (res.ok) {
      const data: string[] = await res.json();
      setLogs(data);
      setTimeout(() => { if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight; }, 50);
    }
  }, [type]);

  useEffect(() => {
    if (!logsOpen) return;
    fetchLogs();
    const id = setInterval(fetchLogs, 2000);
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
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold">{meta.label}</span>
              {meta.badge && (
                <Badge variant="outline" className="text-xs text-violet-400 border-violet-500/40 bg-violet-500/10">
                  {meta.badge}
                </Badge>
              )}
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
              {status.running && (
                <Badge variant="outline" className="text-xs text-blue-400 border-blue-500/40 bg-blue-500/10">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-400 mr-1" />
                  System Active
                </Badge>
              )}
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
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        <div className="p-2 rounded-lg bg-muted/20 border border-border/20 text-center">
          <p className="text-xs text-muted-foreground">Port</p>
          <p className="font-mono font-bold text-sm">{status.port}</p>
        </div>
        <div className="p-2 rounded-lg bg-muted/20 border border-border/20 text-center">
          <p className="text-xs text-muted-foreground">Block</p>
          <p className="font-bold text-sm">{status.running ? `#${status.blockHeight.toLocaleString()}` : '—'}</p>
        </div>
        <div className="p-2 rounded-lg bg-muted/20 border border-border/20 text-center">
          <p className="text-xs text-muted-foreground">Peers</p>
          <p className="font-bold text-sm">{status.running ? status.peers : '—'}</p>
        </div>
        {(type === 'fullnode' || type === 'boostnode') && (
          <div className="p-2 rounded-lg bg-muted/20 border border-border/20 text-center">
            <p className="text-xs text-muted-foreground">Tx Pool</p>
            <p className="font-bold text-sm">{status.running ? status.txPool : '—'}</p>
          </div>
        )}
        <div className={cn('p-2 rounded-lg bg-muted/20 border border-border/20 text-center', (type === 'rpc' || type === 'lite') && 'col-span-1')}>
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
            <CopyBtn text={endpointUrl} />
          </div>
          {type === 'rpc' && <p className="text-muted-foreground/60">JSON-RPC · Chain ID 13370 · GYDS Testnet</p>}
          {type === 'lite' && <p className="text-muted-foreground/60">Header sync · peers: {status.peers} · block #{status.blockHeight.toLocaleString()}</p>}
          {type === 'fullnode' && (
            <div className="space-y-0.5 text-muted-foreground/60">
              <p>Full JSON-RPC + txpool_status + debug_traceTransaction</p>
              <p>Chain ID 13370 · 2-second blocks · {status.peers} peers</p>
            </div>
          )}
          {type === 'boostnode' && (
            <div className="space-y-0.5 text-muted-foreground/60">
              <div className="flex items-center gap-2">
                <span>RPC: <span className="text-primary">{endpointUrl}</span></span>
                <CopyBtn text={endpointUrl} />
              </div>
              <div className="flex items-center gap-2">
                <span>Bundle: <span className="text-amber-400">{`http://${host}:${status.port}/boost/bundle`}</span></span>
                <CopyBtn text={`http://${host}:${status.port}/boost/bundle`} />
              </div>
              <p>1-second blocks · {status.peers} peers · pool: {status.txPool} txs</p>
            </div>
          )}
        </div>
      )}

      {/* Logs */}
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
            {logs.length === 0
              ? <p className="text-muted-foreground">No logs yet…</p>
              : logs.map((line, i) => (
                <p key={i} className={cn(
                  'leading-relaxed',
                  line.includes('ERROR') ? 'text-red-400'
                  : line.includes('Block #') || line.includes('Header #') ? 'text-emerald-400'
                  : line.includes('MEV') ? 'text-amber-400'
                  : line.includes('bundle') ? 'text-amber-300'
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

function MetaMaskCard({ status }: { status: Status }) {
  const host = getNodeHost();
  const isRemote = host !== 'localhost';
  const rpcUrl = `http://${host}:${status.rpc.port}`;
  const fullUrl = `http://${host}:${status.fullnode.port}`;
  const boostUrl = `http://${host}:${status.boostnode.port}`;
  const { copied: c1, copy: copy1 } = useCopy(rpcUrl);
  const { copied: c2, copy: copy2 } = useCopy('13370');

  return (
    <div className="space-y-3">
      <GlassCard className="p-4 space-y-3 border border-amber-500/20 bg-amber-500/5">
        <p className="text-sm font-semibold text-amber-400">Connect MetaMask / any wallet</p>
        <div className="text-xs text-muted-foreground space-y-2">
          <p className="font-medium text-foreground/80">Which node to use:</p>
          <ul className="space-y-1.5 list-none">
            <li className="flex items-start gap-2">
              <Cpu className="w-3.5 h-3.5 text-primary mt-0.5 shrink-0" />
              <span><span className="text-primary font-mono">{rpcUrl}</span> — RPC Test Node, basic MetaMask testing</span>
            </li>
            <li className="flex items-start gap-2">
              <Database className="w-3.5 h-3.5 text-violet-400 mt-0.5 shrink-0" />
              <span><span className="text-violet-400 font-mono">{fullUrl}</span> — Full Node, use for dApps that need traces / logs / storage</span>
            </li>
            <li className="flex items-start gap-2">
              <Rocket className="w-3.5 h-3.5 text-amber-400 mt-0.5 shrink-0" />
              <span><span className="text-amber-400 font-mono">{boostUrl}</span> — Boost Node, use for MEV / high-throughput tx testing</span>
            </li>
          </ul>
        </div>
        <ol className="text-xs text-muted-foreground space-y-1.5 list-decimal list-inside border-t border-border/20 pt-3">
          <li>Start any node above</li>
          <li>MetaMask → Settings → Networks → Add Network</li>
          <li className="flex flex-wrap items-center gap-1">
            RPC URL (e.g.):
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
            · Currency: <span className="font-mono text-primary">GYDS</span>
          </li>
          <li>Explorer: <span className="font-mono text-primary">https://explorer.netlifegy.com</span></li>
        </ol>
      </GlassCard>

      {isRemote && (
        <GlassCard className="p-4 space-y-2 border border-blue-500/20 bg-blue-500/5">
          <p className="text-sm font-semibold text-blue-400 flex items-center gap-2">
            <Server className="w-4 h-4" /> Remote Server — Firewall Setup
          </p>
          <p className="text-xs text-muted-foreground">
            Running on <span className="font-mono text-primary">{host}</span>. Nodes bind to{' '}
            <span className="font-mono">0.0.0.0</span> — allow all four ports through your firewall.
          </p>
          <div className="text-xs font-mono bg-black/40 rounded p-2 text-green-300 space-y-0.5">
            <p className="text-muted-foreground"># UFW (Ubuntu)</p>
            <p>sudo ufw allow 8545/tcp  # RPC</p>
            <p>sudo ufw allow 8555/tcp  # Lite</p>
            <p>sudo ufw allow 8565/tcp  # Full Node</p>
            <p>sudo ufw allow 8575/tcp  # Boost Node</p>
            <p className="text-muted-foreground"># iptables</p>
            <p>for p in 8545 8555 8565 8575; do iptables -A INPUT -p tcp --dport $p -j ACCEPT; done</p>
          </div>
        </GlassCard>
      )}
    </div>
  );
}

export function TestNodeManager() {
  const { toast } = useToast();
  const [status, setStatus] = useState<Status>({
    rpc:       { running: false, startedAt: null, port: 8545, blockHeight: 1000, peers: 4,  txPool: 0  },
    lite:      { running: false, startedAt: null, port: 8555, blockHeight: 1000, peers: 2,  txPool: 0  },
    fullnode:  { running: false, startedAt: null, port: 8565, blockHeight: 1000, peers: 10, txPool: 12 },
    boostnode: { running: false, startedAt: null, port: 8575, blockHeight: 1000, peers: 18, txPool: 40 },
    validator: { running: false, startedAt: null, port: 8585, blockHeight: 1000, peers: 5,  txPool: 3  },
  });
  const [loading, setLoading] = useState<Record<NodeType, boolean>>({ rpc: false, lite: false, fullnode: false, boostnode: false, validator: false });

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
      const res = await fetch(`/api/admin/test-nodes/${type}/${act}`, { method: 'POST', credentials: 'include' });
      const data = await res.json();
      toast({ title: data.message, variant: data.ok ? 'default' : 'destructive' });
      if (data.ok) await fetchStatus();
    } catch {
      toast({ title: 'Request failed', variant: 'destructive' });
    } finally {
      setLoading(l => ({ ...l, [type]: false }));
    }
  };

  const allRunning = (['rpc', 'lite', 'fullnode', 'boostnode', 'validator'] as NodeType[]).every(t => status[t].running);
  const anyRunning = (['rpc', 'lite', 'fullnode', 'boostnode', 'validator'] as NodeType[]).some(t => status[t].running);
  const runningCount = (['rpc', 'lite', 'fullnode', 'boostnode', 'validator'] as NodeType[]).filter(t => status[t].running).length;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Server className="w-5 h-5 text-primary" /> Replit Test Nodes
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Five in-process blockchain nodes — RPC, Lite, Full Node, Boost Node, Validator. Bind to{' '}
            <span className="font-mono text-xs">0.0.0.0</span> so they work on any server.
            <span className="text-amber-400 font-medium ml-1">Admin / Founder only.</span>
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={fetchStatus} className="gap-1.5">
            <RefreshCw className="w-3.5 h-3.5" />
          </Button>
          {allRunning ? (
            <Button variant="destructive" size="sm" onClick={async () => {
              for (const t of ['rpc', 'lite', 'fullnode', 'boostnode', 'validator'] as NodeType[]) await action(t, 'stop');
            }} className="gap-1.5">
              <Square className="w-3.5 h-3.5" /> Stop All
            </Button>
          ) : (
            <Button size="sm" onClick={async () => {
              for (const t of ['rpc', 'lite', 'fullnode', 'boostnode', 'validator'] as NodeType[])
                if (!status[t].running) await action(t, 'start');
            }} className="gap-1.5">
              <Play className="w-3.5 h-3.5" /> Start All
            </Button>
          )}
        </div>
      </div>

      {/* Network health bar */}
      <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/10 border border-border/20 text-sm">
        {anyRunning
          ? <Wifi className="w-4 h-4 text-emerald-400 shrink-0" />
          : <WifiOff className="w-4 h-4 text-muted-foreground shrink-0" />}
        <span className="text-muted-foreground">
          {anyRunning
            ? `${runningCount}/5 nodes running — ports ${((['rpc','lite','fullnode','boostnode','validator'] as NodeType[]).filter(t=>status[t].running).map(t=>status[t].port)).join(', ')}`
            : 'No test nodes running — click Start All or start individual nodes below'}
        </span>
        {anyRunning && <Activity className="w-4 h-4 text-emerald-400 animate-pulse ml-auto shrink-0" />}
      </div>

      {/* System Integration panel — shown when any node is running */}
      {anyRunning && (
        <GlassCard className="p-4 space-y-3 border border-primary/30 bg-primary/5">
          <div className="flex items-center gap-2">
            <MonitorDot className="w-4 h-4 text-primary" />
            <p className="text-sm font-semibold text-primary">System Integrated</p>
            <Badge variant="outline" className="text-xs text-emerald-400 border-emerald-500/40 bg-emerald-500/10 ml-auto gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              {runningCount} node{runningCount > 1 ? 's' : ''} active in system
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            Running nodes are registered in the node directory and count toward network stats. All app features (Explorer, DeFi, Validators) use the RPC proxy below.
          </p>
          <div className="grid sm:grid-cols-2 gap-2 text-xs">
            <div className="rounded-lg bg-muted/20 border border-border/20 p-3 space-y-1">
              <p className="text-muted-foreground font-medium flex items-center gap-1"><Link2 className="w-3 h-3" /> RPC Proxy (app-wide)</p>
              <p className="font-mono text-primary break-all">{window.location.origin}/api/rpc</p>
              <p className="text-muted-foreground/70">Routes JSON-RPC to best running node. Use this in dApps instead of the external RPC.</p>
            </div>
            <div className="rounded-lg bg-muted/20 border border-border/20 p-3 space-y-1">
              <p className="text-muted-foreground font-medium flex items-center gap-1"><Server className="w-3 h-3" /> Node Heartbeat API</p>
              <p className="font-mono text-primary break-all">POST /api/nodes/:id/heartbeat</p>
              <p className="text-muted-foreground/70">Deployed nodes use this to stay online. Get your node ID from Admin → Nodes tab.</p>
            </div>
          </div>
        </GlassCard>
      )}

      {/* Node cards */}
      {(['rpc', 'lite', 'fullnode', 'boostnode', 'validator'] as NodeType[]).map(type => (
        <NodeCard
          key={type}
          type={type}
          status={status[type]}
          onStart={() => action(type, 'start')}
          onStop={() => action(type, 'stop')}
          loading={loading[type]}
        />
      ))}

      <MetaMaskCard status={status} />
    </div>
  );
}
