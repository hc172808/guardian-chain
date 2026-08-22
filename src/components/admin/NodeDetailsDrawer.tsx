import { useState, useEffect, useCallback } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { GlassCard } from '@/components/ui/GlassCard';
import { useToast } from '@/hooks/use-toast';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Area, AreaChart
} from 'recharts';
import { Input } from '@/components/ui/input';
import {
  Server, Wifi, WifiOff, Activity, Copy, Key, Clock, Network,
  MonitorDot, RefreshCw, ExternalLink, Loader2, TrendingUp, Users,
  HardDrive, Check, X as XIcon
} from 'lucide-react';

interface PingEntry {
  ts: number;
  online: boolean;
  latencyMs: number | null;
  blockHeight: number | null;
  peerCount: number | null;
}

interface NodeDetails {
  id: string;
  nodeType: string;
  ipAddress: string | null;
  hostname: string | null;
  rpcPort: number | null;
  wireguardPublicKey: string | null;
  isOnline: boolean;
  isApproved: boolean;
  isSynced: boolean;
  lastBlockHeight: number | null;
  peerCount: number | null;
  lastHeartbeat: string | null;
  createdAt: string;
  storageSizeGb: number;
  diskUsedGb: number;
  profiles?: { email: string | null };
}

interface Props {
  nodeId: string | null;
  vpnTunnelIp: string | null;
  isMain: boolean;
  onClose: () => void;
}

const CHART_COLORS = { online: '#10b981', offline: '#ef4444', block: '#6366f1', peers: '#f59e0b' };

function copyText(text: string, toast: any) {
  navigator.clipboard.writeText(text).then(() => toast({ title: 'Copied!' }));
}

export function NodeDetailsDrawer({ nodeId, vpnTunnelIp, isMain, onClose }: Props) {
  const { toast } = useToast();
  const [node, setNode] = useState<NodeDetails | null>(null);
  const [history, setHistory] = useState<PingEntry[]>([]);
  const [pinging, setPinging] = useState(false);
  const [loading, setLoading] = useState(true);
  const [editingStorage, setEditingStorage] = useState(false);
  const [storageGbDraft, setStorageGbDraft] = useState('');
  const [editingWireguardKey, setEditingWireguardKey] = useState(false);
  const [wireguardKeyDraft, setWireguardKeyDraft] = useState('');

  const load = useCallback(async () => {
    if (!nodeId) return;
    setLoading(true);
    try {
      const [nodeRes, histRes] = await Promise.all([
        fetch(`/api/nodes/${nodeId}`, { credentials: 'include' }).then(r => r.ok ? r.json() : null),
        fetch(`/api/nodes/${nodeId}/ping-history`, { credentials: 'include' }).then(r => r.ok ? r.json() : []),
      ]);
      if (nodeRes) setNode(nodeRes);
      if (Array.isArray(histRes)) setHistory(histRes);
    } catch {}
    finally { setLoading(false); }
  }, [nodeId]);

  useEffect(() => { if (nodeId) { setNode(null); setHistory([]); load(); } }, [nodeId, load]);

  const handleSetStorage = async (sizeGb: number) => {
    if (!nodeId) return;
    try {
      const res = await fetch(`/api/nodes/${nodeId}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storageSizeGb: sizeGb }),
      });
      if (!res.ok) throw new Error(await res.text());
      toast({ title: '💾 Storage quota updated', description: `${sizeGb} GB allocated` });
      setEditingStorage(false);
      await load();
    } catch (e: any) {
      toast({ title: 'Failed', description: e.message, variant: 'destructive' });
    }
  };

  const handleSetWireguardKey = async () => {
    if (!nodeId || !wireguardKeyDraft.trim()) return;
    try {
      const res = await fetch(`/api/nodes/${nodeId}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wireguardPublicKey: wireguardKeyDraft.trim() }),
      });
      if (!res.ok) throw new Error(await res.text());
      toast({ title: 'WireGuard key saved', description: 'Refresh the WireGuard Peer Manager to generate the peer block.' });
      setEditingWireguardKey(false);
      await load();
    } catch (e: any) {
      toast({ title: 'Failed to save WireGuard key', description: e.message, variant: 'destructive' });
    }
  };

  const handlePing = async () => {
    if (!nodeId) return;
    setPinging(true);
    try {
      const res = await fetch(`/api/nodes/${nodeId}/ping`, { method: 'POST', credentials: 'include' });
      const data = await res.json();
      if (data.online) {
        toast({ title: '🟢 Online', description: `Block #${data.blockHeight?.toLocaleString() ?? '?'} · ${data.latencyMs ?? '?'}ms` });
      } else {
        toast({ title: '🔴 Unreachable', description: data.error ?? 'No response', variant: 'destructive' });
      }
      await load();
    } catch (e: any) {
      toast({ title: 'Ping failed', description: e.message, variant: 'destructive' });
    } finally { setPinging(false); }
  };

  const host = node?.ipAddress || node?.hostname;
  const rpcPort = node?.rpcPort || 8545;
  const rpcUrl = host ? `http://${host}:${rpcPort}` : null;
  const isLocalNode = node?.wireguardPublicKey?.startsWith('LOCAL:');

  const wgPeerConfig = node && vpnTunnelIp && node.wireguardPublicKey && !isLocalNode
    ? `[Peer]\nPublicKey = ${node.wireguardPublicKey}\nAllowedIPs = ${vpnTunnelIp}/32`
    : null;

  const latencyData = history.map(h => ({
    time: new Date(h.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    latency: h.online ? (h.latencyMs ?? 0) : null,
    status: h.online ? 1 : 0,
  }));

  const blockData = history.filter(h => h.blockHeight != null).map(h => ({
    time: new Date(h.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    block: h.blockHeight,
  }));

  const peerData = history.filter(h => h.peerCount != null).map(h => ({
    time: new Date(h.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    peers: h.peerCount,
  }));

  return (
    <Sheet open={!!nodeId} onOpenChange={open => { if (!open) onClose(); }}>
      <SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto bg-background border-border/50">
        {loading || !node ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (
          <>
            <SheetHeader className="mb-6">
              <div className="flex items-center gap-3">
                <div className={`p-2.5 rounded-lg ${isMain ? 'bg-yellow-400/20' : 'bg-primary/20'}`}>
                  {isLocalNode
                    ? <MonitorDot className="h-5 w-5 text-primary" />
                    : <Server className={`h-5 w-5 ${isMain ? 'text-yellow-400' : 'text-primary'}`} />
                  }
                </div>
                <div>
                  <SheetTitle className="capitalize flex items-center gap-2">
                    {node.nodeType.replace('node', ' Node')}
                    {isMain && <span className="text-sm text-yellow-400">⭐ Main</span>}
                  </SheetTitle>
                  <SheetDescription>{host ?? 'No host configured'}</SheetDescription>
                </div>
              </div>
            </SheetHeader>

            {/* Status Row */}
            <div className="flex flex-wrap gap-2 mb-6">
              {node.isOnline
                ? <Badge variant="outline" className="text-emerald-400 border-emerald-400/60 bg-emerald-500/10 gap-1"><Wifi className="h-3 w-3" /> Online</Badge>
                : <Badge variant="outline" className="text-muted-foreground border-border/40 gap-1"><WifiOff className="h-3 w-3" /> Offline</Badge>
              }
              {node.isApproved
                ? <Badge variant="outline" className="text-green-400 border-green-400">Approved</Badge>
                : <Badge variant="outline" className="text-yellow-500 border-yellow-500">Pending</Badge>
              }
              {node.isSynced && <Badge variant="outline" className="text-primary border-primary">Synced</Badge>}
              <Button size="sm" variant="outline" className="gap-1 ml-auto" onClick={handlePing} disabled={pinging || !host}>
                {pinging ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Pinging…</> : <><Activity className="h-3.5 w-3.5" /> Ping Now</>}
              </Button>
              <Button size="sm" variant="ghost" onClick={load} disabled={loading}>
                <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              </Button>
            </div>

            {/* Info Grid */}
            <GlassCard className="p-4 mb-4 space-y-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Node Info</p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                {host && (
                  <>
                    <span className="text-muted-foreground">Host</span>
                    <span className="font-mono text-xs truncate">{host}</span>
                  </>
                )}
                <span className="text-muted-foreground">RPC Port</span>
                <span className="font-mono text-xs">{rpcPort}</span>
                {vpnTunnelIp && (
                  <>
                    <span className="text-muted-foreground flex items-center gap-1"><Network className="h-3 w-3" /> VPN IP</span>
                    <span className="font-mono text-xs text-primary">{vpnTunnelIp}</span>
                  </>
                )}
                {node.lastBlockHeight != null && (
                  <>
                    <span className="text-muted-foreground">Block Height</span>
                    <span className="font-mono text-xs">{node.lastBlockHeight.toLocaleString()}</span>
                  </>
                )}
                {node.peerCount != null && (
                  <>
                    <span className="text-muted-foreground">Peers</span>
                    <span className="font-mono text-xs">{node.peerCount}</span>
                  </>
                )}
                {node.lastHeartbeat && (
                  <>
                    <span className="text-muted-foreground flex items-center gap-1"><Clock className="h-3 w-3" /> Last Seen</span>
                    <span className="text-xs">{new Date(node.lastHeartbeat).toLocaleString()}</span>
                  </>
                )}
              </div>
              {rpcUrl && (
                <a href={rpcUrl} target="_blank" rel="noreferrer"
                  className="flex items-center gap-1 text-xs text-primary hover:underline font-mono mt-1">
                  <ExternalLink className="h-3 w-3" /> {rpcUrl}
                </a>
              )}
            </GlassCard>

            {/* Latency Chart */}
            {latencyData.length > 0 && (
              <GlassCard className="p-4 mb-4">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1">
                  <Activity className="h-3.5 w-3.5" /> Ping Latency (last {latencyData.length} checks)
                </p>
                <ResponsiveContainer width="100%" height={100}>
                  <AreaChart data={latencyData} margin={{ top: 5, right: 5, left: -30, bottom: 0 }}>
                    <defs>
                      <linearGradient id="latGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={CHART_COLORS.online} stopOpacity={0.3} />
                        <stop offset="95%" stopColor={CHART_COLORS.online} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                    <XAxis dataKey="time" tick={{ fontSize: 9, fill: '#888' }} />
                    <YAxis tick={{ fontSize: 9, fill: '#888' }} />
                    <Tooltip contentStyle={{ background: '#1a1a2e', border: '1px solid #333', borderRadius: 6, fontSize: 11 }}
                      formatter={(v: any) => v != null ? [`${v}ms`, 'Latency'] : ['Timeout', 'Status']} />
                    <Area type="monotone" dataKey="latency" stroke={CHART_COLORS.online} fill="url(#latGrad)" strokeWidth={2} dot={false} connectNulls={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </GlassCard>
            )}

            {/* Block Height Chart */}
            {blockData.length > 1 && (
              <GlassCard className="p-4 mb-4">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1">
                  <TrendingUp className="h-3.5 w-3.5" /> Block Height
                </p>
                <ResponsiveContainer width="100%" height={90}>
                  <LineChart data={blockData} margin={{ top: 5, right: 5, left: -30, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                    <XAxis dataKey="time" tick={{ fontSize: 9, fill: '#888' }} />
                    <YAxis tick={{ fontSize: 9, fill: '#888' }} tickFormatter={(v) => `${(v/1000).toFixed(1)}k`} />
                    <Tooltip contentStyle={{ background: '#1a1a2e', border: '1px solid #333', borderRadius: 6, fontSize: 11 }}
                      formatter={(v: any) => [Number(v).toLocaleString(), 'Block']} />
                    <Line type="monotone" dataKey="block" stroke={CHART_COLORS.block} strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </GlassCard>
            )}

            {/* Peer Count Chart */}
            {peerData.length > 1 && (
              <GlassCard className="p-4 mb-4">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1">
                  <Users className="h-3.5 w-3.5" /> Peer Count
                </p>
                <ResponsiveContainer width="100%" height={80}>
                  <LineChart data={peerData} margin={{ top: 5, right: 5, left: -30, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                    <XAxis dataKey="time" tick={{ fontSize: 9, fill: '#888' }} />
                    <YAxis tick={{ fontSize: 9, fill: '#888' }} allowDecimals={false} />
                    <Tooltip contentStyle={{ background: '#1a1a2e', border: '1px solid #333', borderRadius: 6, fontSize: 11 }}
                      formatter={(v: any) => [v, 'Peers']} />
                    <Line type="monotone" dataKey="peers" stroke={CHART_COLORS.peers} strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </GlassCard>
            )}

            {/* Storage Card */}
            <GlassCard className="p-4 mb-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                  <HardDrive className="h-3.5 w-3.5" /> Storage
                </p>
                {!editingStorage && (
                  <Button size="sm" variant="ghost" className="h-6 text-xs gap-1"
                    onClick={() => { setEditingStorage(true); setStorageGbDraft(String(node.storageSizeGb || '')); }}>
                    Set Quota
                  </Button>
                )}
              </div>

              {editingStorage ? (
                <div className="flex items-center gap-2">
                  <Input
                    type="number" min={0}
                    className="h-7 w-24 text-xs font-mono"
                    placeholder="GB"
                    value={storageGbDraft}
                    onChange={e => setStorageGbDraft(e.target.value)}
                    autoFocus
                    onKeyDown={e => {
                      if (e.key === 'Enter') handleSetStorage(Number(storageGbDraft));
                      if (e.key === 'Escape') setEditingStorage(false);
                    }}
                  />
                  <span className="text-xs text-muted-foreground">GB</span>
                  <Button size="icon" variant="ghost" className="h-6 w-6"
                    onClick={() => handleSetStorage(Number(storageGbDraft))}>
                    <Check className="h-3 w-3 text-emerald-400" />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-6 w-6"
                    onClick={() => setEditingStorage(false)}>
                    <XIcon className="h-3 w-3" />
                  </Button>
                </div>
              ) : node.storageSizeGb > 0 ? (
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>{Number(node.diskUsedGb).toFixed(1)} GB used</span>
                    <span>{node.storageSizeGb} GB quota</span>
                  </div>
                  <div className="w-full bg-secondary/60 rounded-full h-2 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${
                        (node.diskUsedGb / node.storageSizeGb) > 0.9 ? 'bg-red-500' :
                        (node.diskUsedGb / node.storageSizeGb) > 0.7 ? 'bg-yellow-500' : 'bg-primary'
                      }`}
                      style={{ width: `${Math.min(100, (node.diskUsedGb / node.storageSizeGb) * 100)}%` }}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {((node.diskUsedGb / node.storageSizeGb) * 100).toFixed(1)}% used ·{' '}
                    {(node.storageSizeGb - node.diskUsedGb).toFixed(1)} GB free
                  </p>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground/60 italic">No storage quota set — click "Set Quota" to configure</p>
              )}
            </GlassCard>

            {/* WireGuard Peer Config */}
            {!isLocalNode && !node.wireguardPublicKey && (
              <GlassCard className="p-4 mb-4">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1">
                  <Key className="h-3.5 w-3.5" /> Register WireGuard Peer
                </p>
                <p className="text-xs text-muted-foreground mb-3">
                  Paste this node's public key. Do not use the VPN server public key.
                </p>
                {editingWireguardKey ? (
                  <div className="space-y-2">
                    <Input
                      value={wireguardKeyDraft}
                      onChange={e => setWireguardKeyDraft(e.target.value)}
                      placeholder="Node WireGuard public key"
                      className="font-mono text-xs"
                      autoFocus
                    />
                    <div className="flex gap-2">
                      <Button size="sm" onClick={handleSetWireguardKey} disabled={!wireguardKeyDraft.trim()}>Save Key</Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditingWireguardKey(false)}>Cancel</Button>
                    </div>
                  </div>
                ) : (
                  <Button size="sm" variant="outline" className="gap-1.5"
                    onClick={() => { setWireguardKeyDraft(''); setEditingWireguardKey(true); }}>
                    <Key className="h-3.5 w-3.5" /> Add Node Public Key
                  </Button>
                )}
              </GlassCard>
            )}

            {wgPeerConfig && (
              <GlassCard className="p-4 mb-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                    <Key className="h-3.5 w-3.5" /> WireGuard Peer Config
                  </p>
                  <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs"
                    onClick={() => copyText(wgPeerConfig, toast)}>
                    <Copy className="h-3 w-3" /> Copy
                  </Button>
                </div>
                <pre className="text-xs font-mono bg-background/60 rounded p-3 text-primary/80 whitespace-pre-wrap break-all">
                  {wgPeerConfig}
                </pre>
                {vpnTunnelIp && (
                  <p className="text-xs text-muted-foreground mt-2">
                    Add this block to your server's <code className="text-primary">wg0.conf</code> then run <code className="text-primary">wg addconf wg0 &lt;(wg-quick strip wg0)</code>
                  </p>
                )}
              </GlassCard>
            )}

            {/* WireGuard Public Key */}
            {!isLocalNode && node.wireguardPublicKey && !wgPeerConfig && (
              <GlassCard className="p-4 mb-4">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1">
                  <Key className="h-3.5 w-3.5" /> WireGuard Public Key
                </p>
                <div className="flex items-center gap-2">
                  <code className="text-xs font-mono bg-background/60 rounded px-2 py-1 flex-1 break-all">
                    {node.wireguardPublicKey}
                  </code>
                  <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0"
                    onClick={() => copyText(node.wireguardPublicKey!, toast)}>
                    <Copy className="h-3 w-3" />
                  </Button>
                </div>
              </GlassCard>
            )}

            {history.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-4">
                No ping history yet — click "Ping Now" or wait for the auto-pinger (every 5 min)
              </p>
            )}
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
