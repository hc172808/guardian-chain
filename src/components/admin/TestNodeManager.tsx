import { useState, useEffect, useRef, useCallback } from 'react';
import { GlassCard } from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import {
  Play, Square, RefreshCw, Terminal, Wifi, WifiOff,
  Activity, Cpu, Zap, Server, Clock, Copy, Check, Globe,
  Database, Rocket, Shield, MonitorDot, Link2, ChevronDown, ChevronUp,
  Anchor, Radio
} from 'lucide-react';
import { cn } from '@/lib/utils';

type Network  = 'mainnet' | 'testnet' | 'devnet';
type NodeType = 'rpc' | 'lite' | 'fullnode' | 'boostnode' | 'validator' | 'genesis' | 'bootnode';

interface NodeStatus {
  running:     boolean;
  startedAt:   string | null;
  port:        number;
  blockHeight: number;
  peers:       number;
  txPool:      number;
}

type FullStatus = Record<Network, Record<NodeType, NodeStatus>>;

const NODE_TYPES: NodeType[] = ['rpc', 'lite', 'fullnode', 'boostnode', 'validator', 'genesis', 'bootnode'];
const NETWORKS:  Network[]   = ['mainnet', 'testnet', 'devnet'];

const NETWORK_CFG = {
  mainnet: { label: 'Mainnet', chainId: 13370, symbol: 'GYDS',  color: 'emerald', icon: '🌐',
    rpcUrl: 'https://rpc.netlifegy.com', explorerUrl: 'https://explorer.netlifegy.com' },
  testnet: { label: 'Testnet', chainId: 13371, symbol: 'tGYDS', color: 'amber',   icon: '🧪',
    rpcUrl: 'https://testnet-rpc.netlifegy.com', explorerUrl: 'https://testnet-explorer.netlifegy.com' },
  devnet:  { label: 'Devnet',  chainId: 13372, symbol: 'dGYDS', color: 'blue',    icon: '🔧',
    rpcUrl: 'https://devnet-rpc.netlifegy.com', explorerUrl: 'https://devnet-explorer.netlifegy.com' },
};

const NODE_META: Record<NodeType, { label: string; description: string; color: string; icon: any; badge?: string }> = {
  rpc: {
    label: 'RPC Node',
    description: 'Ethereum-compatible JSON-RPC (eth_blockNumber, eth_getBlockByNumber, eth_chainId…). Use for MetaMask / frontend testing.',
    color: 'text-primary', icon: Cpu,
  },
  lite: {
    label: 'Lite Node',
    description: 'Lightweight header-sync node. Simulates peer discovery and block header propagation without full state.',
    color: 'text-cyan-400', icon: Zap,
  },
  fullnode: {
    label: 'Full Node',
    description: 'Full-state node with mempool, txpool_status, debug_traceTransaction, eth_getLogs, eth_call, eth_getCode, storage queries.',
    color: 'text-violet-400', icon: Database, badge: 'Full State',
  },
  boostnode: {
    label: 'Boost Node',
    description: '1-second blocks, MEV/priority-tx, /boost/bundle endpoint, txpool simulation, elevated peer count.',
    color: 'text-amber-400', icon: Rocket, badge: 'MEV · 1s blocks',
  },
  validator: {
    label: 'Validator Node',
    description: 'PoS consensus node. Proposes blocks every 120s, runs validator_info, validator_set, validator_getRewards, validator_register.',
    color: 'text-emerald-400', icon: Shield, badge: 'PoS · 120s',
  },
  genesis: {
    label: 'Genesis Node',
    description: 'Serves the genesis block config (GET /genesis.json). Bootstrap new nodes or verify chain origin. Responds to basic eth_chainId, eth_blockNumber.',
    color: 'text-teal-400', icon: Anchor, badge: 'Genesis',
  },
  bootnode: {
    label: 'Boot Node',
    description: 'Peer discovery node. Maintains enode list, serves GET /peers with live peer addresses. Responds to net_peerCount and admin_peers.',
    color: 'text-slate-300', icon: Radio, badge: 'P2P · Discovery',
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

function NodeCard({
  network, type, status, onStart, onStop, loading,
}: {
  network: Network; type: NodeType; status: NodeStatus;
  onStart: () => void; onStop: () => void; loading: boolean;
}) {
  const [logs, setLogs] = useState<string[]>([]);
  const [logsOpen, setLogsOpen] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);
  const meta = NODE_META[type];
  const netCfg = NETWORK_CFG[network];
  const Icon = meta.icon;
  const host = getNodeHost();
  const endpointUrl = `http://${host}:${status.port}`;

  const fetchLogs = useCallback(async () => {
    const res = await fetch(`/api/admin/test-nodes/${network}/${type}/logs`, { credentials: 'include' });
    if (res.ok) {
      const data: string[] = await res.json();
      setLogs(data);
      setTimeout(() => { if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight; }, 50);
    }
  }, [network, type]);

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

  const networkColor = netCfg.color;
  const activeBorder = status.running
    ? networkColor === 'emerald' ? 'border-emerald-500/40'
    : networkColor === 'amber'   ? 'border-amber-500/40'
    : 'border-blue-500/40'
    : 'border-border/30';

  return (
    <GlassCard className={cn('p-4 space-y-3 border', activeBorder)}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className={cn('p-2.5 rounded-xl border', status.running ? 'bg-primary/10 border-primary/30' : 'bg-muted/30 border-border/30')}>
            <Icon className={cn('w-5 h-5', status.running ? meta.color : 'text-muted-foreground')} />
          </div>
          <div>
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="font-semibold text-sm">{meta.label}</span>
              {meta.badge && (
                <Badge variant="outline" className="text-xs text-violet-400 border-violet-500/40 bg-violet-500/10 py-0">{meta.badge}</Badge>
              )}
              <Badge variant="outline" className={cn('text-xs py-0', status.running
                ? 'text-emerald-400 border-emerald-500/40 bg-emerald-500/10'
                : 'text-muted-foreground border-border/40')}>
                {status.running
                  ? <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /> Running</span>
                  : 'Stopped'}
              </Badge>
              {status.running && (
                <Badge variant="outline" className="text-xs text-blue-400 border-blue-500/40 bg-blue-500/10 py-0">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-400 mr-1" /> System Active
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{meta.description}</p>
          </div>
        </div>
        <div className="flex gap-1.5 shrink-0">
          {status.running
            ? <Button variant="destructive" size="sm" onClick={onStop} disabled={loading} className="gap-1 h-7 px-2 text-xs"><Square className="w-3 h-3" /> Stop</Button>
            : <Button variant="default"     size="sm" onClick={onStart} disabled={loading} className="gap-1 h-7 px-2 text-xs"><Play className="w-3 h-3" /> Start</Button>
          }
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5 text-center">
        <div className="p-1.5 rounded-lg bg-muted/20 border border-border/20">
          <p className="text-xs text-muted-foreground">Port</p>
          <p className="font-mono font-bold text-xs">{status.port}</p>
        </div>
        <div className="p-1.5 rounded-lg bg-muted/20 border border-border/20">
          <p className="text-xs text-muted-foreground">Block</p>
          <p className="font-bold text-xs">{status.running ? `#${status.blockHeight.toLocaleString()}` : '—'}</p>
        </div>
        <div className="p-1.5 rounded-lg bg-muted/20 border border-border/20">
          <p className="text-xs text-muted-foreground">Peers</p>
          <p className="font-bold text-xs">{status.running ? status.peers : '—'}</p>
        </div>
        <div className="p-1.5 rounded-lg bg-muted/20 border border-border/20">
          <p className="text-xs text-muted-foreground">TxPool</p>
          <p className="font-bold text-xs">{status.running ? status.txPool : '—'}</p>
        </div>
        <div className="p-1.5 rounded-lg bg-muted/20 border border-border/20">
          <p className="text-xs text-muted-foreground">Uptime</p>
          <p className="font-bold text-xs">{status.running ? uptime : '—'}</p>
        </div>
      </div>

      {status.running && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="font-mono text-primary truncate">{endpointUrl}</span>
          <CopyBtn text={endpointUrl} />
          <button
            onClick={() => setLogsOpen(o => !o)}
            className="flex items-center gap-1 ml-auto text-muted-foreground hover:text-foreground border border-border/30 rounded px-2 py-0.5"
          >
            <Terminal className="w-3 h-3" />
            {logsOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>
        </div>
      )}

      {logsOpen && (
        <div ref={logRef} className="h-36 overflow-y-auto rounded-lg bg-black/40 border border-border/20 p-2 font-mono text-xs space-y-0.5">
          {logs.length === 0
            ? <p className="text-muted-foreground">No logs yet…</p>
            : logs.map((line, i) => (
              <p key={i} className={cn('leading-relaxed',
                line.includes('ERROR') ? 'text-red-400'
                : line.includes('Block #') || line.includes('Header #') ? 'text-emerald-400'
                : line.includes('MEV') ? 'text-amber-400'
                : line.includes('started') ? 'text-yellow-400'
                : line.includes('stopped') ? 'text-orange-400'
                : 'text-green-300/80'
              )}>{line}</p>
            ))}
        </div>
      )}
    </GlassCard>
  );
}

function NetworkPanel({
  network, status, loading, onAction,
}: {
  network: Network;
  status: Record<NodeType, NodeStatus>;
  loading: Record<string, boolean>;
  onAction: (network: Network, type: NodeType, act: 'start' | 'stop') => void;
}) {
  const netCfg = NETWORK_CFG[network];
  const runningTypes = NODE_TYPES.filter(t => status[t]?.running);
  const runningCount = runningTypes.length;
  const anyRunning   = runningCount > 0;
  const allRunning   = runningCount === NODE_TYPES.length;
  const host = getNodeHost();

  const colorCls = {
    emerald: { tab: 'text-emerald-400 border-emerald-500/40 bg-emerald-500/10', badge: 'text-emerald-400 border-emerald-500/40 bg-emerald-500/10' },
    amber:   { tab: 'text-amber-400 border-amber-500/40 bg-amber-500/10',       badge: 'text-amber-400 border-amber-500/40 bg-amber-500/10' },
    blue:    { tab: 'text-blue-400 border-blue-500/40 bg-blue-500/10',           badge: 'text-blue-400 border-blue-500/40 bg-blue-500/10' },
  }[netCfg.color];

  return (
    <div className="space-y-4">
      {/* Network header */}
      <div className="flex items-center justify-between gap-3 p-3 rounded-lg border border-border/20 bg-muted/10">
        <div className="flex items-center gap-3">
          <span className="text-xl">{netCfg.icon}</span>
          <div>
            <div className="flex items-center gap-2">
              <p className="font-semibold">{netCfg.label}</p>
              <Badge variant="outline" className={cn('text-xs py-0', colorCls.badge)}>
                Chain ID {netCfg.chainId}
              </Badge>
              <Badge variant="outline" className="text-xs py-0 text-muted-foreground border-border/40">
                {netCfg.symbol}
              </Badge>
              {anyRunning && (
                <Badge variant="outline" className="text-xs py-0 text-emerald-400 border-emerald-500/40 bg-emerald-500/10 gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  {runningCount}/7 running
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              RPC: <a href={netCfg.rpcUrl} target="_blank" rel="noreferrer" className="text-primary hover:underline font-mono">{netCfg.rpcUrl}</a>
            </p>
          </div>
        </div>
        <div className="flex gap-1.5">
          {allRunning
            ? <Button variant="destructive" size="sm" className="gap-1 h-7 px-2 text-xs" onClick={() => NODE_TYPES.forEach(t => onAction(network, t, 'stop'))}>
                <Square className="w-3 h-3" /> Stop All
              </Button>
            : <Button size="sm" className="gap-1 h-7 px-2 text-xs" onClick={() => NODE_TYPES.filter(t => !status[t]?.running).forEach(t => onAction(network, t, 'start'))}>
                <Play className="w-3 h-3" /> Start All
              </Button>
          }
        </div>
      </div>

      {/* System integration panel */}
      {anyRunning && (
        <GlassCard className="p-3 space-y-2 border border-primary/30 bg-primary/5">
          <div className="flex items-center gap-2">
            <MonitorDot className="w-4 h-4 text-primary" />
            <p className="text-sm font-semibold text-primary">System Integrated — {netCfg.label}</p>
            <Badge variant="outline" className="text-xs text-emerald-400 border-emerald-500/40 bg-emerald-500/10 ml-auto gap-1 py-0">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /> {runningCount} active
            </Badge>
          </div>
          <div className="grid sm:grid-cols-2 gap-2 text-xs">
            <div className="rounded-lg bg-muted/20 border border-border/20 p-2 space-y-0.5">
              <p className="text-muted-foreground font-medium flex items-center gap-1"><Link2 className="w-3 h-3" /> Local RPC Proxy</p>
              <p className="font-mono text-primary break-all">{window.location.origin}/api/rpc?network={network}</p>
            </div>
            <div className="rounded-lg bg-muted/20 border border-border/20 p-2 space-y-0.5">
              <p className="text-muted-foreground font-medium flex items-center gap-1"><Globe className="w-3 h-3" /> MetaMask — Chain ID {netCfg.chainId}</p>
              <p className="font-mono text-primary">{host}:{status[runningTypes[0]]?.port ?? '—'} · {netCfg.symbol}</p>
            </div>
          </div>
        </GlassCard>
      )}

      {/* Node cards grid */}
      <div className="grid gap-3 lg:grid-cols-1">
        {NODE_TYPES.map(type => (
          <NodeCard
            key={type}
            network={network}
            type={type}
            status={status[type]}
            onStart={() => onAction(network, type, 'start')}
            onStop={() => onAction(network, type, 'stop')}
            loading={loading[`${network}:${type}`] ?? false}
          />
        ))}
      </div>

      {/* MetaMask quick-connect */}
      {anyRunning && (
        <GlassCard className="p-3 space-y-2 border border-amber-500/20 bg-amber-500/5">
          <p className="text-xs font-semibold text-amber-400">Connect MetaMask / Any Wallet to {netCfg.label}</p>
          <div className="text-xs text-muted-foreground space-y-1">
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              <span>RPC URL: <span className="font-mono text-primary">{host}:{status[runningTypes[0]]?.port ?? '—'}</span></span>
              <span>Chain ID: <span className="font-mono text-primary">{netCfg.chainId}</span></span>
              <span>Symbol: <span className="font-mono text-primary">{netCfg.symbol}</span></span>
            </div>
            <p>Explorer: <span className="font-mono text-primary">{netCfg.explorerUrl}</span></p>
            <p className="text-muted-foreground/70">MetaMask → Settings → Networks → Add Network → enter the details above</p>
          </div>
        </GlassCard>
      )}
    </div>
  );
}

const EMPTY_NODE_STATUS: NodeStatus = { running: false, startedAt: null, port: 0, blockHeight: 1000, peers: 0, txPool: 0 };
const EMPTY_STATUS: FullStatus = {
  mainnet: { rpc: { ...EMPTY_NODE_STATUS, port: 8545 }, lite: { ...EMPTY_NODE_STATUS, port: 8555 }, fullnode: { ...EMPTY_NODE_STATUS, port: 8565 }, boostnode: { ...EMPTY_NODE_STATUS, port: 8575 }, validator: { ...EMPTY_NODE_STATUS, port: 8585 }, genesis: { ...EMPTY_NODE_STATUS, port: 8590 }, bootnode: { ...EMPTY_NODE_STATUS, port: 8595 } },
  testnet: { rpc: { ...EMPTY_NODE_STATUS, port: 8600 }, lite: { ...EMPTY_NODE_STATUS, port: 8601 }, fullnode: { ...EMPTY_NODE_STATUS, port: 8602 }, boostnode: { ...EMPTY_NODE_STATUS, port: 8603 }, validator: { ...EMPTY_NODE_STATUS, port: 8604 }, genesis: { ...EMPTY_NODE_STATUS, port: 8605 }, bootnode: { ...EMPTY_NODE_STATUS, port: 8606 } },
  devnet:  { rpc: { ...EMPTY_NODE_STATUS, port: 8650 }, lite: { ...EMPTY_NODE_STATUS, port: 8651 }, fullnode: { ...EMPTY_NODE_STATUS, port: 8652 }, boostnode: { ...EMPTY_NODE_STATUS, port: 8653 }, validator: { ...EMPTY_NODE_STATUS, port: 8654 }, genesis: { ...EMPTY_NODE_STATUS, port: 8655 }, bootnode: { ...EMPTY_NODE_STATUS, port: 8656 } },
};

export function TestNodeManager() {
  const { toast } = useToast();
  const [status, setStatus]               = useState<FullStatus>(EMPTY_STATUS);
  const [loading, setLoading]             = useState<Record<string, boolean>>({});
  const [selectedNetwork, setSelectedNet] = useState<Network>('mainnet');

  const fetchStatus = useCallback(async () => {
    const res = await fetch('/api/admin/test-nodes/status', { credentials: 'include' });
    if (res.ok) setStatus(await res.json());
  }, []);

  useEffect(() => {
    fetchStatus();
    const id = setInterval(fetchStatus, 5000);
    return () => clearInterval(id);
  }, [fetchStatus]);

  const onAction = async (network: Network, type: NodeType, act: 'start' | 'stop') => {
    const key = `${network}:${type}`;
    setLoading(l => ({ ...l, [key]: true }));
    try {
      const res = await fetch(`/api/admin/test-nodes/${network}/${type}/${act}`, { method: 'POST', credentials: 'include' });
      const data = await res.json();
      toast({ title: data.message, variant: data.ok ? 'default' : 'destructive' });
      if (data.ok) await fetchStatus();
    } catch {
      toast({ title: 'Request failed', variant: 'destructive' });
    } finally {
      setLoading(l => ({ ...l, [key]: false }));
    }
  };

  const totalRunning = NETWORKS.reduce((sum, n) => sum + NODE_TYPES.filter(t => status[n]?.[t]?.running).length, 0);
  const anyRunningGlobal = totalRunning > 0;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Server className="w-5 h-5 text-primary" /> Network Test Nodes
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            7 node types × 3 networks = 21 live nodes. Each runs the correct chain ID, currency, and RPC endpoints.
            <span className="text-amber-400 font-medium ml-1">Admin / Founder only.</span>
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchStatus} className="gap-1.5">
          <RefreshCw className="w-3.5 h-3.5" />
        </Button>
      </div>

      {/* Global health bar */}
      <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/10 border border-border/20 text-sm">
        {anyRunningGlobal
          ? <Wifi className="w-4 h-4 text-emerald-400 shrink-0" />
          : <WifiOff className="w-4 h-4 text-muted-foreground shrink-0" />}
        <span className="text-muted-foreground">
          {anyRunningGlobal
            ? `${totalRunning}/21 nodes running across all networks`
            : 'No nodes running — select a network tab and click Start All'}
        </span>
        {anyRunningGlobal && <Activity className="w-4 h-4 text-emerald-400 animate-pulse ml-auto shrink-0" />}
      </div>

      {/* Network selector tabs */}
      <div className="flex gap-1 p-1 rounded-xl bg-muted/20 border border-border/20">
        {NETWORKS.map(n => {
          const cfg     = NETWORK_CFG[n];
          const running = NODE_TYPES.filter(t => status[n]?.[t]?.running).length;
          const isActive = selectedNetwork === n;
          const colorMap = {
            emerald: isActive ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40' : 'text-muted-foreground hover:text-emerald-300',
            amber:   isActive ? 'bg-amber-500/20   text-amber-400   border border-amber-500/40'   : 'text-muted-foreground hover:text-amber-300',
            blue:    isActive ? 'bg-blue-500/20    text-blue-400    border border-blue-500/40'     : 'text-muted-foreground hover:text-blue-300',
          };
          return (
            <button
              key={n}
              onClick={() => setSelectedNet(n)}
              className={cn('flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-medium transition-all', colorMap[cfg.color as keyof typeof colorMap])}
            >
              <span>{cfg.icon}</span>
              <span>{cfg.label}</span>
              <span className="font-mono text-[10px] opacity-70">{cfg.chainId}</span>
              {running > 0 && (
                <Badge variant="outline" className="text-[10px] py-0 px-1 border-current text-current h-4">{running}/7</Badge>
              )}
            </button>
          );
        })}
      </div>

      {/* Selected network panel */}
      {status[selectedNetwork] && (
        <NetworkPanel
          network={selectedNetwork}
          status={status[selectedNetwork]}
          loading={loading}
          onAction={onAction}
        />
      )}
    </div>
  );
}
