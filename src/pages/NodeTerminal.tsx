import { useState, useEffect, useRef } from 'react';
import { Layout } from '@/components/layout/Layout';
import { GlassCard } from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/contexts/AuthContext';
import { motion } from 'framer-motion';
import { Terminal, ArrowLeft, Wifi, WifiOff, HardDrive, Cpu, Clock, Users, RefreshCw } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface NodeStats {
  id: string;
  nodeType: string;
  node_type?: string;
  isOnline: boolean;
  is_online?: boolean;
  isSynced: boolean;
  syncProgress: number;
  blockssynced?: number;
  lastBlockHeight: number;
  peerCount: number;
  hashRate: number;
  uptimeSeconds: number;
  errorCount: number;
  connectionQuality: number;
  lastHeartbeat: string | null;
  isApproved: boolean;
}

// Normalize API response (handles both camelCase from Drizzle and legacy snake_case)
function normalise(raw: any): NodeStats {
  return {
    id:               raw.id,
    nodeType:         raw.nodeType         ?? raw.node_type         ?? 'unknown',
    isOnline:         !!(raw.isOnline      ?? raw.is_online         ?? false),
    isSynced:         !!(raw.isSynced      ?? raw.is_synced         ?? false),
    syncProgress:     Number(raw.syncProgress    ?? raw.sync_progress    ?? 0),
    blockssynced:     Number(raw.blocksSynced    ?? raw.blocks_synced    ?? 0),
    lastBlockHeight:  Number(raw.lastBlockHeight ?? raw.last_block_height ?? 0),
    peerCount:        Number(raw.peerCount       ?? raw.peer_count       ?? 0),
    hashRate:         Number(raw.hashRate        ?? raw.hash_rate        ?? 0),
    uptimeSeconds:    Number(raw.uptimeSeconds   ?? raw.uptime_seconds   ?? 0),
    errorCount:       Number(raw.errorCount      ?? raw.error_count      ?? 0),
    connectionQuality:Number(raw.connectionQuality ?? raw.connection_quality ?? 100),
    lastHeartbeat:    raw.lastHeartbeat ?? raw.last_heartbeat ?? null,
    isApproved:       !!(raw.isApproved ?? raw.is_approved ?? false),
  };
}

const NODE_TYPE_LABELS: Record<string, string> = {
  litenode:  'Lite Node',
  rpcnode:   'RPC Node',
  fullnode:  'Full Node',
  boostnode: 'Boost Node',
  validator: 'Validator',
  genesis:   'Genesis',
  bootnode:  'Boot Node',
};

const NodeTerminalPage = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [nodes, setNodes] = useState<NodeStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [logs, setLogs] = useState<string[]>([]);
  const logRef = useRef<HTMLDivElement>(null);

  const addLog = (msg: string) => {
    const ts = new Date().toLocaleTimeString('en-US', { hour12: false });
    setLogs(prev => [...prev.slice(-100), `[${ts}] ${msg}`]);
  };

  const load = async () => {
    addLog('Fetching node installations...');
    try {
      const raw: any[] = await fetch('/api/nodes', { credentials: 'include' })
        .then(r => r.ok ? r.json() : []);
      const data = (raw || []).map(normalise);
      setNodes(data);
      const online  = data.filter(n => n.isOnline).length;
      const offline = data.length - online;
      addLog(`Found ${data.length} node(s) — ${online} online, ${offline} offline`);
      data.forEach(n => {
        const label = NODE_TYPE_LABELS[n.nodeType] ?? n.nodeType;
        addLog(`  → ${label} | ${n.isOnline ? '✅ ONLINE' : '❌ OFFLINE'} | sync: ${n.syncProgress}% | peers: ${n.peerCount} | block: #${n.lastBlockHeight}`);
      });
    } catch (e) {
      addLog('Error fetching nodes: ' + (e as any).message);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (!user) { setLoading(false); return; }
    load();
    const interval = setInterval(() => {
      addLog('♥ heartbeat check');
      load();
    }, 15000);
    return () => clearInterval(interval);
  }, [user]);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [logs]);

  const formatUptime = (seconds: number) => {
    const d = Math.floor(seconds / 86400);
    const h = Math.floor((seconds % 86400) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return `${d}d ${h}h ${m}m`;
  };

  const onlineNodes  = nodes.filter(n => n.isOnline);
  const totalPeers   = nodes.reduce((a, n) => a + n.peerCount, 0);
  const maxUptime    = nodes.reduce((a, n) => Math.max(a, n.uptimeSeconds), 0);

  return (
    <Layout>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-3xl font-bold flex items-center gap-3">
                <Terminal className="w-8 h-8 text-primary" />
                Node Terminal
              </h1>
              <p className="text-muted-foreground mt-1">Real-time node performance monitoring</p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={load} className="gap-2">
            <RefreshCw className="h-4 w-4" />
            Refresh
          </Button>
        </div>

        {/* System Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <GlassCard className="p-4 text-center">
            <Wifi className="h-5 w-5 mx-auto mb-2 text-emerald-400" />
            <p className="text-xs text-muted-foreground">Online Nodes</p>
            <p className="text-xl font-bold font-mono text-emerald-400">{onlineNodes.length}</p>
            <p className="text-[10px] text-muted-foreground">/ {nodes.length} total</p>
          </GlassCard>
          <GlassCard className="p-4 text-center">
            <HardDrive className="h-5 w-5 mx-auto mb-2 text-amber-400" />
            <p className="text-xs text-muted-foreground">Approved</p>
            <p className="text-xl font-bold font-mono text-amber-400">{nodes.filter(n => n.isApproved).length}</p>
            <p className="text-[10px] text-muted-foreground">nodes</p>
          </GlassCard>
          <GlassCard className="p-4 text-center">
            <Users className="h-5 w-5 mx-auto mb-2 text-blue-400" />
            <p className="text-xs text-muted-foreground">Total Peers</p>
            <p className="text-xl font-bold font-mono">{totalPeers}</p>
          </GlassCard>
          <GlassCard className="p-4 text-center">
            <Clock className="h-5 w-5 mx-auto mb-2 text-primary" />
            <p className="text-xs text-muted-foreground">Max Uptime</p>
            <p className="text-sm font-bold font-mono">{maxUptime > 0 ? formatUptime(maxUptime) : '—'}</p>
          </GlassCard>
        </div>

        {/* Node Cards */}
        {nodes.length === 0 && !loading ? (
          <GlassCard className="p-8 text-center space-y-3">
            <Terminal className="h-10 w-10 mx-auto text-muted-foreground" />
            <p className="text-muted-foreground">No nodes installed yet.</p>
            <p className="text-xs text-muted-foreground">Start test nodes from Admin → Test Nodes, or install a real node from the Download page.</p>
            <Button variant="outline" onClick={() => navigate('/download')}>Install a Node</Button>
          </GlassCard>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {nodes.map(node => (
              <GlassCard key={node.id} className={`p-4 space-y-3 border ${node.isOnline ? 'border-emerald-500/20' : 'border-destructive/20'}`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {node.isOnline
                      ? <Wifi className="h-4 w-4 text-emerald-400" />
                      : <WifiOff className="h-4 w-4 text-red-400" />}
                    <span className="font-semibold capitalize">
                      {NODE_TYPE_LABELS[node.nodeType] ?? node.nodeType}
                    </span>
                    <Badge variant={node.isOnline ? 'default' : 'destructive'} className="text-xs">
                      {node.isOnline ? 'Online' : 'Offline'}
                    </Badge>
                    {node.isApproved && (
                      <Badge variant="outline" className="text-xs text-emerald-400 border-emerald-400/30">Approved</Badge>
                    )}
                  </div>
                  <Badge variant="outline" className="font-mono text-xs">
                    Block #{node.lastBlockHeight.toLocaleString()}
                  </Badge>
                </div>

                {/* Sync Progress */}
                <div>
                  <div className="flex justify-between text-xs text-muted-foreground mb-1">
                    <span>Sync Progress</span>
                    <span>{node.syncProgress}%</span>
                  </div>
                  <div className="h-2 rounded-full bg-secondary">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-primary to-emerald-400 transition-all"
                      style={{ width: `${node.syncProgress}%` }}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3 text-sm">
                  <div>
                    <p className="text-xs text-muted-foreground">Peers</p>
                    <p className="font-mono font-semibold">{node.peerCount}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Hash Rate</p>
                    <p className="font-mono font-semibold">{node.hashRate.toLocaleString()} H/s</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Errors</p>
                    <p className={`font-mono font-semibold ${node.errorCount > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                      {node.errorCount}
                    </p>
                  </div>
                </div>

                {node.lastHeartbeat && (
                  <p className="text-[10px] text-muted-foreground">
                    Last heartbeat: {new Date(node.lastHeartbeat).toLocaleTimeString()}
                  </p>
                )}
              </GlassCard>
            ))}
          </div>
        )}

        {/* Terminal Log */}
        <GlassCard className="p-0 overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-2 bg-secondary/50 border-b border-border/50">
            <Terminal className="h-4 w-4 text-primary" />
            <span className="text-sm font-semibold">Console Output</span>
            <div className="flex-1" />
            <Button variant="ghost" size="sm" onClick={() => setLogs([])}>Clear</Button>
          </div>
          <div
            ref={logRef}
            className="h-64 overflow-y-auto p-4 font-mono text-xs text-emerald-400 bg-black/80 space-y-0.5"
          >
            {logs.length === 0 ? (
              <span className="text-muted-foreground">Waiting for events...</span>
            ) : (
              logs.map((line, i) => <div key={i}>{line}</div>)
            )}
          </div>
        </GlassCard>
      </motion.div>
    </Layout>
  );
};

export default NodeTerminalPage;
