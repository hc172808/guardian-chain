/**
 * LocalRpcIndicator
 * Shows in the Explorer header:
 * - Whether a local test node is running (green dot / grey)
 * - Which network and type is active
 * - A toggle to switch between local and external RPC (stored in sessionStorage)
 */
import { useState, useEffect, useCallback } from 'react';
import { Cpu, Globe, ChevronDown, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';

type Network = 'mainnet' | 'testnet' | 'devnet';

interface NodeInfo {
  type: string;
  port: number;
  blockHeight: number;
  peers: number;
}
interface NetStatus {
  hasLocal: boolean;
  running: NodeInfo[];
  proxyUrl: string | null;
  bestType: string | null;
  externalUrl: string;
}
interface RpcStatus {
  mainnet: NetStatus;
  testnet: NetStatus;
  devnet: NetStatus;
  externalUrls: Record<string, string>;
}

const NET_LABELS: Record<Network, string> = { mainnet: 'Mainnet', testnet: 'Testnet', devnet: 'Devnet' };
const NET_COLORS: Record<Network, string> = {
  mainnet: 'text-emerald-400 border-emerald-400/40 bg-emerald-500/10',
  testnet: 'text-amber-400 border-amber-400/40 bg-amber-500/10',
  devnet:  'text-blue-400 border-blue-400/40 bg-blue-500/10',
};
const NET_DOT: Record<Network, string> = {
  mainnet: 'bg-emerald-400',
  testnet: 'bg-amber-400',
  devnet:  'bg-blue-400',
};

const SESSION_KEY = 'gyds_rpc_mode';   // 'local' | 'external'
const NET_KEY     = 'gyds_rpc_net';    // 'mainnet' | 'testnet' | 'devnet'

export function LocalRpcIndicator() {
  const [status, setStatus]     = useState<RpcStatus | null>(null);
  const [open, setOpen]         = useState(false);
  const [loading, setLoading]   = useState(false);
  const [mode, setMode]         = useState<'local' | 'external'>(
    () => (sessionStorage.getItem(SESSION_KEY) as any) ?? 'external'
  );
  const [activeNet, setActiveNet] = useState<Network>(
    () => (sessionStorage.getItem(NET_KEY) as any) ?? 'mainnet'
  );

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const r = await fetch('/api/nodes/rpc-status');
      if (r.ok) setStatus(await r.json());
    } catch { /* ignore */ }
    finally { if (!quiet) setLoading(false); }
  }, []);

  useEffect(() => { load(); const id = setInterval(() => load(true), 8000); return () => clearInterval(id); }, [load]);

  const setModeAndSave = (m: 'local' | 'external') => {
    setMode(m); sessionStorage.setItem(SESSION_KEY, m);
  };
  const setNetAndSave = (n: Network) => {
    setActiveNet(n); sessionStorage.setItem(NET_KEY, n);
  };

  if (!status) return null;

  const net = status[activeNet];
  const hasLocal = net?.hasLocal ?? false;
  const bestNode = net?.running?.[0] ?? null;
  const effectiveMode = mode === 'local' && !hasLocal ? 'external' : mode;
  const rpcUrl = effectiveMode === 'local' && net?.proxyUrl ? net.proxyUrl : net?.externalUrl ?? '';

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className={cn(
          'flex items-center gap-1.5 px-2 py-1 rounded-lg border text-xs font-medium transition-all hover:opacity-90',
          hasLocal && effectiveMode === 'local'
            ? NET_COLORS[activeNet]
            : 'text-muted-foreground border-border/40 bg-card/60 hover:border-border/70'
        )}
      >
        {/* Status dot */}
        <span className={cn(
          'w-1.5 h-1.5 rounded-full flex-shrink-0',
          hasLocal && effectiveMode === 'local'
            ? `${NET_DOT[activeNet]} animate-pulse`
            : 'bg-muted-foreground/50'
        )} />
        {/* Label */}
        {effectiveMode === 'local' && hasLocal
          ? <><Cpu className="h-3 w-3" /> Local · {NET_LABELS[activeNet]}</>
          : <><Globe className="h-3 w-3" /> External · {NET_LABELS[activeNet]}</>
        }
        <ChevronDown className={cn('h-3 w-3 transition-transform', open ? 'rotate-180' : '')} />
      </button>

      {open && (
        <>
          {/* Backdrop */}
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          {/* Dropdown */}
          <div className="absolute right-0 top-full mt-1.5 z-50 w-72 rounded-xl border border-border/50 bg-card/95 backdrop-blur-xl shadow-xl p-3 space-y-3">
            {/* Header */}
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">RPC Source</span>
              <button onClick={() => load()} disabled={loading} className="p-1 rounded hover:bg-muted/30 transition-colors">
                <RefreshCw className={cn('h-3 w-3 text-muted-foreground', loading && 'animate-spin')} />
              </button>
            </div>

            {/* Network selector */}
            <div className="flex gap-1">
              {(['mainnet', 'testnet', 'devnet'] as Network[]).map(n => {
                const nStatus = status[n];
                return (
                  <button
                    key={n}
                    onClick={() => setNetAndSave(n)}
                    className={cn(
                      'flex-1 py-1 px-2 rounded-lg text-xs font-medium border transition-all relative',
                      activeNet === n
                        ? NET_COLORS[n]
                        : 'border-border/30 text-muted-foreground hover:border-border/60 hover:text-foreground'
                    )}
                  >
                    {NET_LABELS[n]}
                    {nStatus?.hasLocal && (
                      <span className={cn('absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full', NET_DOT[n])} />
                    )}
                  </button>
                );
              })}
            </div>

            {/* Mode toggle */}
            <div className="grid grid-cols-2 gap-1.5">
              <button
                onClick={() => setModeAndSave('local')}
                disabled={!hasLocal}
                className={cn(
                  'flex items-center gap-1.5 px-2.5 py-2 rounded-lg text-xs font-medium border transition-all',
                  effectiveMode === 'local' && hasLocal
                    ? 'bg-primary/20 border-primary/50 text-primary'
                    : hasLocal
                    ? 'border-border/40 text-muted-foreground hover:border-border/60 hover:text-foreground'
                    : 'border-border/20 text-muted-foreground/40 cursor-not-allowed'
                )}
              >
                <Cpu className="h-3.5 w-3.5 flex-shrink-0" />
                <span>Local Node</span>
                {!hasLocal && <span className="ml-auto text-[10px] text-muted-foreground/50">offline</span>}
              </button>
              <button
                onClick={() => setModeAndSave('external')}
                className={cn(
                  'flex items-center gap-1.5 px-2.5 py-2 rounded-lg text-xs font-medium border transition-all',
                  effectiveMode === 'external'
                    ? 'bg-card border-border/70 text-foreground'
                    : 'border-border/40 text-muted-foreground hover:border-border/60 hover:text-foreground'
                )}
              >
                <Globe className="h-3.5 w-3.5 flex-shrink-0" />
                <span>External</span>
              </button>
            </div>

            {/* Current node info */}
            {effectiveMode === 'local' && hasLocal && bestNode && (
              <div className={cn('rounded-lg p-2.5 border space-y-1.5', NET_COLORS[activeNet])}>
                <div className="flex items-center gap-1.5">
                  <span className={cn('w-1.5 h-1.5 rounded-full animate-pulse flex-shrink-0', NET_DOT[activeNet])} />
                  <span className="text-xs font-semibold capitalize">{bestNode.type} Node running</span>
                </div>
                <div className="grid grid-cols-3 gap-1 text-[10px]">
                  <div className="text-center">
                    <p className="font-mono font-semibold">{bestNode.blockHeight.toLocaleString()}</p>
                    <p className="text-muted-foreground">blocks</p>
                  </div>
                  <div className="text-center">
                    <p className="font-mono font-semibold">{bestNode.peers}</p>
                    <p className="text-muted-foreground">peers</p>
                  </div>
                  <div className="text-center">
                    <p className="font-mono font-semibold">{bestNode.port}</p>
                    <p className="text-muted-foreground">port</p>
                  </div>
                </div>
                {net.running.length > 1 && (
                  <p className="text-[10px] text-muted-foreground">{net.running.length} nodes running</p>
                )}
              </div>
            )}

            {/* RPC URL */}
            <div className="rounded-lg bg-muted/20 border border-border/20 p-2 space-y-1">
              <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">Active RPC URL</p>
              <p className="text-[10px] font-mono text-foreground/80 break-all leading-relaxed">{rpcUrl}</p>
            </div>

            {/* No local node warning */}
            {!hasLocal && mode === 'local' && (
              <p className="text-[10px] text-amber-400/80 bg-amber-500/5 border border-amber-500/20 rounded-lg px-2 py-1.5">
                No local node running for {NET_LABELS[activeNet]}. Start one in Admin → Test Nodes.
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
