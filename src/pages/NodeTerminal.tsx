import { useState, useEffect, useRef } from 'react';
import { Layout } from '@/components/layout/Layout';
import { GlassCard } from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { motion } from 'framer-motion';
import { Terminal, ArrowLeft, Wifi, WifiOff, HardDrive, Cpu, Clock, Users } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface NodeStats {
  id: string;
  user_id: string;
  node_type: string;
  is_online: boolean;
  is_synced: boolean;
  sync_progress: number;
  blocks_synced: number;
  last_block_height: number;
  peer_count: number;
  hash_rate: number;
  uptime_seconds: number;
  error_count: number;
  connection_quality: number;
  last_heartbeat: string | null;
}

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

  useEffect(() => {
    if (!user) { setLoading(false); return; }

    const load = async () => {
      addLog('Fetching node installations...');
      const { data } = await supabase
        .from('node_installations')
        .select('*')
        .eq('user_id', user.id);
      if (data) {
        setNodes(data as NodeStats[]);
        addLog(`Found ${data.length} node(s)`);
        data.forEach(n => {
          addLog(`  → ${n.node_type} | ${n.is_online ? 'ONLINE' : 'OFFLINE'} | sync: ${n.sync_progress}% | peers: ${n.peer_count}`);
        });
      } else {
        addLog('No nodes found for this account.');
      }
      setLoading(false);
    };

    load();

    const channel = supabase
      .channel('node-terminal')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'node_installations' }, (payload) => {
        const node = payload.new as NodeStats;
        if (node.user_id !== user.id) return;
        addLog(`Node ${node.node_type} updated — sync: ${node.sync_progress}% | peers: ${node.peer_count} | online: ${node.is_online}`);
        load();
      })
      .subscribe();

    // Simulate heartbeat logs
    const interval = setInterval(() => {
      addLog('♥ heartbeat OK');
    }, 15000);

    return () => { supabase.removeChannel(channel); clearInterval(interval); };
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

  // Simulated memory usage
  const memUsed = 847;
  const memTotal = 2048;
  const cpuPercent = 23;

  return (
    <Layout>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
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

        {/* System Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <GlassCard className="p-4 text-center">
            <Cpu className="h-5 w-5 mx-auto mb-2 text-primary" />
            <p className="text-xs text-muted-foreground">CPU</p>
            <p className="text-xl font-bold font-mono">{cpuPercent}%</p>
          </GlassCard>
          <GlassCard className="p-4 text-center">
            <HardDrive className="h-5 w-5 mx-auto mb-2 text-amber-400" />
            <p className="text-xs text-muted-foreground">Memory</p>
            <p className="text-xl font-bold font-mono">{memUsed}MB</p>
            <p className="text-[10px] text-muted-foreground">/ {memTotal}MB</p>
          </GlassCard>
          <GlassCard className="p-4 text-center">
            <Users className="h-5 w-5 mx-auto mb-2 text-emerald-400" />
            <p className="text-xs text-muted-foreground">Total Peers</p>
            <p className="text-xl font-bold font-mono">{nodes.reduce((a, n) => a + (n.peer_count || 0), 0)}</p>
          </GlassCard>
          <GlassCard className="p-4 text-center">
            <Clock className="h-5 w-5 mx-auto mb-2 text-blue-400" />
            <p className="text-xs text-muted-foreground">Uptime</p>
            <p className="text-sm font-bold font-mono">{nodes[0] ? formatUptime(nodes[0].uptime_seconds || 0) : '—'}</p>
          </GlassCard>
        </div>

        {/* Node Cards */}
        {nodes.length === 0 && !loading ? (
          <GlassCard className="p-8 text-center space-y-3">
            <Terminal className="h-10 w-10 mx-auto text-muted-foreground" />
            <p className="text-muted-foreground">No nodes installed yet.</p>
            <Button variant="outline" onClick={() => navigate('/download')}>Install a Node</Button>
          </GlassCard>
        ) : (
          nodes.map(node => (
            <GlassCard key={node.id} className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {node.is_online ? <Wifi className="h-4 w-4 text-emerald-400" /> : <WifiOff className="h-4 w-4 text-red-400" />}
                  <span className="font-semibold capitalize">{node.node_type}</span>
                  <Badge variant={node.is_online ? 'default' : 'destructive'} className="text-xs">
                    {node.is_online ? 'Online' : 'Offline'}
                  </Badge>
                </div>
                <Badge variant="outline" className="font-mono text-xs">
                  Block #{node.last_block_height?.toLocaleString() || 0}
                </Badge>
              </div>

              {/* Sync Progress */}
              <div>
                <div className="flex justify-between text-xs text-muted-foreground mb-1">
                  <span>Sync Progress</span>
                  <span>{node.sync_progress || 0}%</span>
                </div>
                <div className="h-2 rounded-full bg-secondary">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-primary to-emerald-400 transition-all"
                    style={{ width: `${node.sync_progress || 0}%` }}
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">Peers</p>
                  <p className="font-mono font-semibold">{node.peer_count || 0}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Hash Rate</p>
                  <p className="font-mono font-semibold">{(node.hash_rate || 0).toLocaleString()} H/s</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Errors</p>
                  <p className={`font-mono font-semibold ${(node.error_count || 0) > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                    {node.error_count || 0}
                  </p>
                </div>
              </div>
            </GlassCard>
          ))
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
