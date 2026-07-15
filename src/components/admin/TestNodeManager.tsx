import { useState, useEffect, useRef, useCallback } from 'react';
import { GlassCard } from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import {
  Play, Square, RefreshCw, Terminal, Wifi, WifiOff,
  Activity, Cpu, Zap, Server, Clock, Copy, Check, Globe,
  Database, Rocket, Shield, MonitorDot, Link2, ChevronDown, ChevronUp,
  Anchor, Radio, FileText, Download, Trash2, Search, X as XIcon,
  PlayCircle, StopCircle, AlertTriangle, CheckCircle2,
  TerminalSquare, Send
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface SyncResult {
  network: string;
  type: string;
  localBlock: number;
  chainBlock: number | null;
  lag: number | null;
  synced: boolean | null;
  peers: number;
  port: number;
}
interface SyncCheck {
  chainBlock: number | null;
  chainBlockHex: string | null;
  nodes: SyncResult[];
}

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

const CONSOLE_SHORTCUTS = [
  'eth.blockNumber', 'eth.chainId', 'net.peerCount', 'eth.gasPrice',
  'eth.syncing', 'net.version', 'txpool.status', 'admin.peers',
  'web3.version', 'eth.hashrate', 'eth.coinbase', 'help',
];

interface ConsoleEntry { type: 'input' | 'output' | 'error' | 'info'; text: string; }

function NodeConsole({ network, type, running }: { network: Network; type: NodeType; running: boolean }) {
  const [input, setInput] = useState('');
  const [history, setHistory] = useState<ConsoleEntry[]>([
    { type: 'info', text: `GYDS Node Console  ·  ${network}/${type}\nType "help" for available commands. Use ↑↓ to navigate history.` },
  ]);
  const [cmdHistory, setCmdHistory] = useState<string[]>([]);
  const [histIdx, setHistIdx] = useState(-1);
  const [loading, setLoading] = useState(false);
  const outputRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const scrollBottom = () =>
    setTimeout(() => { if (outputRef.current) outputRef.current.scrollTop = outputRef.current.scrollHeight; }, 30);

  const run = async (cmd: string) => {
    const c = cmd.trim();
    if (!c) return;
    setHistory(h => [...h, { type: 'input', text: `> ${c}` }]);
    setCmdHistory(h => [c, ...h.slice(0, 49)]);
    setHistIdx(-1);
    setInput('');
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/test-nodes/${network}/${type}/console`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ command: c }),
      });
      const data = await res.json();
      if (data.ok) {
        setHistory(h => [...h, { type: 'output', text: data.result ?? 'null' }]);
      } else {
        setHistory(h => [...h, { type: 'error', text: data.error ?? 'Unknown error' }]);
      }
    } catch (e: any) {
      setHistory(h => [...h, { type: 'error', text: `Network error: ${e.message}` }]);
    } finally {
      setLoading(false);
      scrollBottom();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') { run(input); return; }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      const idx = Math.min(histIdx + 1, cmdHistory.length - 1);
      setHistIdx(idx);
      if (cmdHistory[idx] !== undefined) setInput(cmdHistory[idx]);
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const idx = Math.max(histIdx - 1, -1);
      setHistIdx(idx);
      setInput(idx === -1 ? '' : (cmdHistory[idx] ?? ''));
    }
  };

  if (!running) {
    return (
      <div className="p-3 rounded-lg bg-black/40 border border-border/20 text-center text-xs text-muted-foreground italic">
        Start the node to enable the console
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div
        ref={outputRef}
        className="h-48 overflow-y-auto rounded-lg bg-black/80 border border-green-900/30 p-2 font-mono text-xs space-y-0.5 cursor-text"
        onClick={() => inputRef.current?.focus()}
      >
        {history.map((e, i) => (
          <p key={i} className={cn(
            'leading-relaxed whitespace-pre-wrap break-all',
            e.type === 'input'  ? 'text-cyan-300/90' :
            e.type === 'error'  ? 'text-red-400' :
            e.type === 'info'   ? 'text-blue-300/70' :
            'text-green-300/85'
          )}>{e.text}</p>
        ))}
        {loading && <p className="text-amber-400/80 animate-pulse">⧖ executing…</p>}
      </div>

      <div className="flex flex-wrap gap-1">
        {CONSOLE_SHORTCUTS.map(cmd => (
          <button
            key={cmd}
            onClick={() => run(cmd)}
            disabled={loading}
            className="text-[9px] font-mono px-1.5 py-0.5 rounded border border-border/30 text-muted-foreground hover:border-primary/40 hover:text-primary hover:bg-primary/5 transition-all disabled:opacity-40"
          >
            {cmd}
          </button>
        ))}
      </div>

      <div className="flex gap-1.5 items-center">
        <span className="text-primary text-sm font-mono shrink-0">›</span>
        <input
          ref={inputRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="eth.blockNumber  (↑↓ history, Enter to run)"
          disabled={loading}
          className="flex-1 bg-black/60 border border-border/30 rounded px-2 py-1.5 text-xs font-mono text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-primary/50 disabled:opacity-50"
          autoComplete="off"
          spellCheck={false}
        />
        <Button
          size="sm"
          className="h-7 px-2 gap-1 shrink-0"
          onClick={() => run(input)}
          disabled={loading || !input.trim()}
        >
          <Send className="w-3 h-3" />
        </Button>
      </div>
    </div>
  );
}

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
  network, type, status, onStart, onStop, loading, bootup, onBootupToggle,
}: {
  network: Network; type: NodeType; status: NodeStatus;
  onStart: () => void; onStop: () => void; loading: boolean;
  bootup: boolean; onBootupToggle: (v: boolean) => void;
}) {
  const [logs, setLogs] = useState<string[]>([]);
  const [logsOpen, setLogsOpen] = useState(false);
  const [consoleOpen, setConsoleOpen] = useState(false);
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
        <div className="flex items-center gap-2 shrink-0">
          <div className="flex flex-col items-center gap-0.5" title={bootup ? 'Auto-starts at server boot' : 'Will not auto-start at boot'}>
            <Switch
              checked={bootup}
              onCheckedChange={onBootupToggle}
              className="scale-75 origin-center"
            />
            <span className="text-[9px] text-muted-foreground leading-none">{bootup ? 'Auto' : 'Manual'}</span>
          </div>
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
          <div className="flex items-center gap-1 ml-auto">
            <button
              onClick={() => { setLogsOpen(o => !o); if (!logsOpen) setConsoleOpen(false); }}
              className={cn(
                'flex items-center gap-1 text-muted-foreground hover:text-foreground border rounded px-2 py-0.5 transition-all',
                logsOpen ? 'border-primary/40 text-primary bg-primary/5' : 'border-border/30'
              )}
            >
              <Terminal className="w-3 h-3" />
              <span className="text-[10px]">Logs</span>
              {logsOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
            <button
              onClick={() => { setConsoleOpen(o => !o); if (!consoleOpen) setLogsOpen(false); }}
              className={cn(
                'flex items-center gap-1 text-muted-foreground hover:text-foreground border rounded px-2 py-0.5 transition-all',
                consoleOpen ? 'border-green-500/40 text-green-400 bg-green-500/5' : 'border-border/30'
              )}
            >
              <TerminalSquare className="w-3 h-3" />
              <span className="text-[10px]">Console</span>
              {consoleOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
          </div>
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

      {consoleOpen && (
        <NodeConsole network={network} type={type} running={status.running} />
      )}
    </GlassCard>
  );
}

function NetworkPanel({
  network, status, loading, onAction, bootup, onBootupToggle,
}: {
  network: Network;
  status: Record<NodeType, NodeStatus>;
  loading: Record<string, boolean>;
  onAction: (network: Network, type: NodeType, act: 'start' | 'stop') => void;
  bootup: Record<string, boolean>;
  onBootupToggle: (network: Network, type: NodeType, v: boolean) => void;
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
            bootup={bootup[`${network}:${type}`] ?? false}
            onBootupToggle={(v) => onBootupToggle(network, type, v)}
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

// ── Combined log file viewer ───────────────────────────────────────────────────
const LOG_FILTER_PRESETS = [
  { label: 'All',      value: '' },
  { label: 'Errors',   value: 'ERROR' },
  { label: 'Blocks',   value: 'Block #' },
  { label: 'Mainnet',  value: '[mainnet/' },
  { label: 'Testnet',  value: '[testnet/' },
  { label: 'Devnet',   value: '[devnet/' },
  { label: 'RPC',      value: '/rpc]' },
  { label: 'Validator',value: '/validator]' },
];

function NodeLogFilePanel() {
  const { toast } = useToast();
  const [open, setOpen]       = useState(false);
  const [lines, setLines]     = useState<string[]>([]);
  const [meta, setMeta]       = useState<{ total: number; size: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [search, setSearch]   = useState('');
  const [preset, setPreset]   = useState('');
  const logRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const fetchLog = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/test-nodes/logfile', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setLines(data.lines ?? []);
        setMeta({ total: data.total ?? data.lines?.length ?? 0, size: data.size ?? 0 });
        setTimeout(() => { if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight; }, 50);
      }
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    if (!open) return;
    fetchLog();
    const id = setInterval(fetchLog, 5000);
    return () => clearInterval(id);
  }, [open, fetchLog]);

  const clearLog = async () => {
    if (!confirm('Clear the entire log file? This cannot be undone.')) return;
    const res = await fetch('/api/admin/test-nodes/logfile', { method: 'DELETE', credentials: 'include' });
    if (res.ok) { setLines([]); setMeta(null); toast({ title: 'Log file cleared' }); }
  };

  const downloadLog = () => { window.open('/api/admin/test-nodes/logfile/download', '_blank'); };

  const filterText = search.trim() || preset;
  const filtered = filterText
    ? lines.filter(l => l.toLowerCase().includes(filterText.toLowerCase()))
    : lines;

  const applyPreset = (val: string) => {
    setPreset(val);
    setSearch('');
  };

  return (
    <GlassCard className="p-3 border border-border/30">
      <button
        className="w-full flex items-center justify-between gap-2 text-sm"
        onClick={() => setOpen(o => !o)}
      >
        <div className="flex items-center gap-2 flex-wrap">
          <FileText className="w-4 h-4 text-primary shrink-0" />
          <span className="font-semibold">Node Log File</span>
          <Badge variant="outline" className="text-xs py-0 text-muted-foreground border-border/40">
            logs/test-nodes.log
          </Badge>
          {meta && (
            <Badge variant="outline" className="text-xs py-0 text-amber-400 border-amber-500/40 bg-amber-500/10">
              {meta.total.toLocaleString()} lines · {(meta.size / 1024).toFixed(1)} KB
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {open && (
            <>
              <Button variant="outline" size="sm" className="h-6 px-2 text-xs gap-1" onClick={(e) => { e.stopPropagation(); fetchLog(); }}>
                <RefreshCw className={cn('w-3 h-3', loading && 'animate-spin')} />
              </Button>
              <Button variant="outline" size="sm" className="h-6 px-2 text-xs gap-1 text-blue-400 border-blue-500/40 hover:bg-blue-500/10" onClick={(e) => { e.stopPropagation(); downloadLog(); }}>
                <Download className="w-3 h-3" /> Download
              </Button>
              <Button variant="outline" size="sm" className="h-6 px-2 text-xs gap-1 text-red-400 border-red-500/40 hover:bg-red-500/10" onClick={(e) => { e.stopPropagation(); clearLog(); }}>
                <Trash2 className="w-3 h-3" /> Clear
              </Button>
            </>
          )}
          {open ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
        </div>
      </button>

      {open && (
        <div className="mt-3 space-y-2">
          {/* Search bar */}
          <div className="flex gap-2 items-center">
            <div className="relative flex-1">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
              <input
                ref={searchRef}
                value={search}
                onChange={e => { setSearch(e.target.value); setPreset(''); }}
                placeholder="Search logs… (node name, block #, error text)"
                className="w-full pl-7 pr-7 py-1.5 rounded-lg bg-black/40 border border-border/30 text-xs font-mono text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50"
              />
              {search && (
                <button className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" onClick={() => setSearch('')}>
                  <XIcon className="w-3 h-3" />
                </button>
              )}
            </div>
            {filterText && (
              <Badge variant="outline" className="text-xs py-0.5 text-emerald-400 border-emerald-500/40 bg-emerald-500/10 shrink-0">
                {filtered.length} match{filtered.length !== 1 ? 'es' : ''}
              </Badge>
            )}
          </div>

          {/* Quick-filter preset buttons */}
          <div className="flex flex-wrap gap-1">
            {LOG_FILTER_PRESETS.map(p => (
              <button
                key={p.value}
                onClick={() => applyPreset(p.value)}
                className={cn(
                  'text-[10px] px-2 py-0.5 rounded border transition-all',
                  (preset === p.value && !search)
                    ? 'bg-primary/20 border-primary/50 text-primary'
                    : 'border-border/30 text-muted-foreground hover:border-border/60 hover:text-foreground'
                )}
              >
                {p.label}
                {p.value === 'ERROR' && lines.filter(l => l.includes('ERROR')).length > 0 && (
                  <span className="ml-1 text-red-400">
                    ({lines.filter(l => l.includes('ERROR')).length})
                  </span>
                )}
              </button>
            ))}
          </div>

          <p className="text-xs text-muted-foreground">
            {filterText
              ? `Showing ${filtered.length} of ${lines.length} lines matching "${filterText}"`
              : `All logs from every node across all networks. Showing last ${lines.length.toLocaleString()} of ${meta?.total.toLocaleString() ?? '?'} lines.`
            }
          </p>

          <div
            ref={logRef}
            className="h-80 overflow-y-auto rounded-lg bg-black/60 border border-border/20 p-2 font-mono text-xs space-y-0.5"
          >
            {filtered.length === 0
              ? <p className="text-muted-foreground italic">
                  {lines.length === 0 ? 'No logs yet — start a node to begin logging.' : `No lines match "${filterText}"`}
                </p>
              : filtered.map((line, i) => {
                  const lo = line.toLowerCase();
                  const matchIdx = filterText ? lo.indexOf(filterText.toLowerCase()) : -1;
                  return (
                    <p key={i} className={cn('leading-relaxed whitespace-pre-wrap break-all',
                      line.includes('ERROR') ? 'text-red-400'
                      : line.includes('Block #') || line.includes('Header #') ? 'text-emerald-400'
                      : line.includes('MEV') ? 'text-amber-400'
                      : line.includes('started') ? 'text-yellow-300'
                      : line.includes('stopped') ? 'text-orange-400'
                      : line.includes('peers') ? 'text-cyan-300/80'
                      : 'text-green-300/70'
                    )}>
                      {matchIdx >= 0 && filterText
                        ? <>
                            {line.slice(0, matchIdx)}
                            <mark className="bg-yellow-400/30 text-yellow-200 rounded-sm px-0.5">{line.slice(matchIdx, matchIdx + filterText.length)}</mark>
                            {line.slice(matchIdx + filterText.length)}
                          </>
                        : line
                      }
                    </p>
                  );
                })
            }
          </div>
        </div>
      )}
    </GlassCard>
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
  const [bootup, setBootup]               = useState<Record<string, boolean>>({});
  const [bulkLoading, setBulkLoading]     = useState(false);
  const [syncData, setSyncData]           = useState<SyncCheck | null>(null);
  const [syncLoading, setSyncLoading]     = useState(false);
  const [showSync, setShowSync]           = useState(false);

  const fetchStatus = useCallback(async () => {
    const res = await fetch('/api/admin/test-nodes/status', { credentials: 'include' });
    if (res.ok) setStatus(await res.json());
  }, []);

  const fetchBootup = useCallback(async () => {
    const res = await fetch('/api/admin/test-nodes/bootup', { credentials: 'include' });
    if (res.ok) setBootup(await res.json());
  }, []);

  useEffect(() => {
    fetchStatus();
    fetchBootup();
    const id = setInterval(fetchStatus, 5000);
    return () => clearInterval(id);
  }, [fetchStatus, fetchBootup]);

  // Parses a fetch Response into a normalized { ok, message } shape, surfacing
  // the *real* reason for a failure (HTTP status, server error text, or "not
  // JSON" for e.g. a stale server serving the SPA HTML for a missing route)
  // instead of a generic, undiagnosable toast.
  const describeFailure = async (res: Response): Promise<{ ok: boolean; message: string; data?: any }> => {
    const contentType = res.headers.get('content-type') ?? '';
    if (!contentType.includes('application/json')) {
      return { ok: false, message: `Server returned an unexpected response (HTTP ${res.status}, not JSON) — it may need to be restarted with the latest code.` };
    }
    let data: any = null;
    try { data = await res.json(); } catch {
      return { ok: false, message: `Server returned invalid JSON (HTTP ${res.status}).` };
    }
    if (!res.ok) {
      const reason = data?.error || data?.message || `HTTP ${res.status}`;
      if (res.status === 403 && /ban|block/i.test(String(reason))) {
        return { ok: false, message: `Blocked by firewall: ${reason}. If this is your own IP, clear it in Admin → Security.`, data };
      }
      return { ok: false, message: reason, data };
    }
    return { ok: !!data.ok, message: data.message ?? (data.ok ? 'Done' : 'Action failed'), data };
  };

  const onAction = async (network: Network, type: NodeType, act: 'start' | 'stop') => {
    const key = `${network}:${type}`;
    setLoading(l => ({ ...l, [key]: true }));
    try {
      const res = await fetch(`/api/admin/test-nodes/${network}/${type}/${act}`, { method: 'POST', credentials: 'include' });
      const { ok, message } = await describeFailure(res);
      toast({ title: message, variant: ok ? 'default' : 'destructive' });
      if (ok) await fetchStatus();
    } catch (e: any) {
      toast({ title: `Request failed: ${e?.message || 'network error'}`, variant: 'destructive' });
    } finally {
      setLoading(l => ({ ...l, [key]: false }));
    }
  };

  const onBulkAction = async (act: 'start-all' | 'stop-all') => {
    setBulkLoading(true);
    try {
      const res = await fetch(`/api/admin/test-nodes/${selectedNetwork}/${act}`, { method: 'POST', credentials: 'include' });
      const { ok, message } = await describeFailure(res);
      if (ok) {
        toast({ title: act === 'start-all' ? `Starting all ${selectedNetwork} nodes…` : `Stopping all ${selectedNetwork} nodes…` });
        await fetchStatus();
      } else {
        toast({ title: `Bulk action failed: ${message}`, variant: 'destructive' });
      }
    } catch (e: any) {
      toast({ title: `Request failed: ${e?.message || 'network error'}`, variant: 'destructive' });
    } finally {
      setBulkLoading(false);
    }
  };

  const onSyncCheck = async () => {
    setSyncLoading(true);
    setShowSync(true);
    try {
      const res = await fetch('/api/admin/test-nodes/sync-check', { credentials: 'include' });
      if (res.ok) setSyncData(await res.json());
      else toast({ title: 'Sync check failed', variant: 'destructive' });
    } catch {
      toast({ title: 'Sync check failed', variant: 'destructive' });
    } finally {
      setSyncLoading(false);
    }
  };

  const onBootupToggle = async (network: Network, type: NodeType, shouldRun: boolean) => {
    const key = `${network}:${type}`;
    setBootup(b => ({ ...b, [key]: shouldRun }));
    try {
      await fetch(`/api/admin/test-nodes/${network}/${type}/bootup`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shouldRun }),
      });
      toast({ title: shouldRun ? `${type} (${network}) will auto-start at boot` : `${type} (${network}) set to manual start`, variant: 'default' });
    } catch {
      setBootup(b => ({ ...b, [key]: !shouldRun }));
      toast({ title: 'Failed to save bootup setting', variant: 'destructive' });
    }
  };

  const totalRunning = NETWORKS.reduce((sum, n) => sum + NODE_TYPES.filter(t => status[n]?.[t]?.running).length, 0);
  const anyRunningGlobal = totalRunning > 0;
  const networkRunning = NODE_TYPES.filter(t => status[selectedNetwork]?.[t]?.running).length;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Server className="w-5 h-5 text-primary" /> Localhost Nodes
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            7 node types × 3 networks = 21 localhost nodes. Each binds to a real port, runs the correct chain ID, and responds to JSON-RPC.
            <span className="text-amber-400 font-medium ml-1">Admin / Founder only.</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={fetchStatus} className="gap-1.5">
            <RefreshCw className="w-3.5 h-3.5" />
          </Button>
          <Button
            variant="outline" size="sm"
            onClick={onSyncCheck}
            disabled={syncLoading || !anyRunningGlobal}
            className="gap-1.5 text-blue-400 border-blue-500/30 hover:bg-blue-500/10"
          >
            <Activity className="w-3.5 h-3.5" />
            {syncLoading ? 'Checking…' : 'Sync Check'}
          </Button>
        </div>
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

      {/* Sync check results */}
      {showSync && (
        <GlassCard className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <Activity className="w-4 h-4 text-blue-400" />
              Sync Status
              {syncData?.chainBlock && (
                <span className="text-xs text-muted-foreground font-normal">
                  — chain head: block #{syncData.chainBlock.toLocaleString()}
                </span>
              )}
            </h3>
            <button onClick={() => setShowSync(false)} className="text-muted-foreground hover:text-foreground">
              <XIcon className="w-4 h-4" />
            </button>
          </div>
          {syncLoading && (
            <p className="text-xs text-muted-foreground animate-pulse">Querying RPC endpoints…</p>
          )}
          {!syncLoading && syncData && syncData.nodes.length === 0 && (
            <p className="text-xs text-muted-foreground">No nodes are currently running. Start nodes first.</p>
          )}
          {!syncLoading && syncData && syncData.nodes.length > 0 && (
            <div className="grid gap-1.5">
              {!syncData.chainBlock && (
                <div className="flex items-center gap-2 text-xs text-amber-400 bg-amber-500/10 rounded p-2">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                  Could not reach rpc.netlifegy.com — showing local block heights only
                </div>
              )}
              {syncData.nodes.map(n => (
                <div key={`${n.network}:${n.type}`}
                  className="flex items-center justify-between text-xs px-3 py-2 rounded bg-muted/10 border border-border/20">
                  <span className="flex items-center gap-2">
                    {n.synced === true
                      ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                      : n.synced === false
                      ? <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                      : <Activity className="w-3.5 h-3.5 text-blue-400" />}
                    <span className="font-mono text-muted-foreground">{n.network}/{n.type}</span>
                  </span>
                  <span className="flex items-center gap-4 text-right">
                    <span className="text-muted-foreground">block <span className="text-foreground font-mono">#{n.localBlock.toLocaleString()}</span></span>
                    {n.lag !== null && (
                      <Badge variant="outline"
                        className={cn('text-[10px] h-4 px-1', n.lag <= 5 ? 'border-emerald-500/40 text-emerald-400' : 'border-amber-500/40 text-amber-400')}>
                        {n.synced ? 'synced' : `${n.lag} behind`}
                      </Badge>
                    )}
                    <span className="text-muted-foreground">{n.peers} peers</span>
                  </span>
                </div>
              ))}
            </div>
          )}
        </GlassCard>
      )}

      {/* Combined log file viewer */}
      <NodeLogFilePanel />

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

      {/* Bulk start/stop for selected network */}
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          onClick={() => onBulkAction('start-all')}
          disabled={bulkLoading || networkRunning === 7}
          className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
        >
          <PlayCircle className="w-3.5 h-3.5" />
          Start All ({selectedNetwork})
        </Button>
        <Button
          size="sm" variant="outline"
          onClick={() => onBulkAction('stop-all')}
          disabled={bulkLoading || networkRunning === 0}
          className="gap-1.5 border-red-500/40 text-red-400 hover:bg-red-500/10"
        >
          <StopCircle className="w-3.5 h-3.5" />
          Stop All ({selectedNetwork})
        </Button>
        {bulkLoading && <span className="text-xs text-muted-foreground animate-pulse">Working…</span>}
        <span className="ml-auto text-xs text-muted-foreground">{networkRunning}/7 running</span>
      </div>

      {/* Selected network panel */}
      {status[selectedNetwork] && (
        <NetworkPanel
          network={selectedNetwork}
          status={status[selectedNetwork]}
          loading={loading}
          onAction={onAction}
          bootup={bootup}
          onBootupToggle={onBootupToggle}
        />
      )}
    </div>
  );
}
