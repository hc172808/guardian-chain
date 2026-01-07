import { useState, useEffect } from 'react';
import { GlassCard } from '../ui/GlassCard';
import { Badge } from '../ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { Server, Wifi, WifiOff, Activity, Clock } from 'lucide-react';
import { formatHashRate } from '@/lib/blockchain';

interface NodeStatus {
  id: string;
  node_type: string;
  is_online: boolean;
  is_synced: boolean;
  is_approved: boolean;
  hash_rate: number;
  valid_shares: number;
  total_rewards: number;
  last_heartbeat: string | null;
}

export const NodeMonitor = () => {
  const [nodes, setNodes] = useState<NodeStatus[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchNodes();

    // Real-time subscription
    const channel = supabase
      .channel('node-status')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'node_installations',
        },
        (payload) => {
          if (payload.eventType === 'UPDATE' || payload.eventType === 'INSERT') {
            setNodes((prev) => {
              const updated = prev.filter((n) => n.id !== (payload.new as NodeStatus).id);
              return [...updated, payload.new as NodeStatus];
            });
          } else if (payload.eventType === 'DELETE') {
            setNodes((prev) => prev.filter((n) => n.id !== (payload.old as NodeStatus).id));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const fetchNodes = async () => {
    const { data } = await supabase
      .from('node_installations')
      .select('id, node_type, is_online, is_synced, is_approved, hash_rate, valid_shares, total_rewards, last_heartbeat')
      .order('created_at', { ascending: false });
    
    if (data) setNodes(data as NodeStatus[]);
    setLoading(false);
  };

  const onlineNodes = nodes.filter((n) => n.is_online);
  const syncedNodes = nodes.filter((n) => n.is_synced);
  const miningNodes = nodes.filter((n) => n.hash_rate > 0);
  const totalHashRate = nodes.reduce((acc, n) => acc + (n.hash_rate || 0), 0);

  return (
    <GlassCard>
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold flex items-center gap-2">
          <Server className="h-5 w-5 text-primary" />
          Network Nodes
        </h3>
        <Badge variant="outline" className="text-neon-emerald border-neon-emerald">
          Live
        </Badge>
      </div>

      <div className="grid grid-cols-4 gap-3 mb-4">
        <div className="text-center p-2 rounded-lg bg-secondary/30">
          <p className="text-2xl font-bold">{nodes.length}</p>
          <p className="text-xs text-muted-foreground">Total</p>
        </div>
        <div className="text-center p-2 rounded-lg bg-secondary/30">
          <p className="text-2xl font-bold text-neon-emerald">{onlineNodes.length}</p>
          <p className="text-xs text-muted-foreground">Online</p>
        </div>
        <div className="text-center p-2 rounded-lg bg-secondary/30">
          <p className="text-2xl font-bold text-primary">{syncedNodes.length}</p>
          <p className="text-xs text-muted-foreground">Synced</p>
        </div>
        <div className="text-center p-2 rounded-lg bg-secondary/30">
          <p className="text-2xl font-bold text-neon-amber">{miningNodes.length}</p>
          <p className="text-xs text-muted-foreground">Mining</p>
        </div>
      </div>

      <div className="p-3 rounded-lg bg-primary/5 border border-primary/20 mb-4">
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Network Hash Rate</span>
          <span className="font-mono font-bold text-gradient-primary">
            {formatHashRate(totalHashRate)}
          </span>
        </div>
      </div>

      <div className="space-y-2 max-h-48 overflow-y-auto">
        {loading ? (
          <div className="text-center py-4 text-muted-foreground">Loading...</div>
        ) : nodes.length === 0 ? (
          <div className="text-center py-4 text-muted-foreground">No nodes registered</div>
        ) : (
          nodes.slice(0, 5).map((node) => (
            <div key={node.id} className="flex items-center justify-between p-2 rounded bg-secondary/20">
              <div className="flex items-center gap-2">
                {node.is_online ? (
                  <Wifi className="h-4 w-4 text-neon-emerald" />
                ) : (
                  <WifiOff className="h-4 w-4 text-muted-foreground" />
                )}
                <span className="text-xs font-mono">{node.id.slice(0, 8)}...</span>
                <Badge variant="outline" className="text-xs">
                  {node.node_type}
                </Badge>
              </div>
              <div className="flex items-center gap-2">
                {node.hash_rate > 0 && (
                  <span className="text-xs text-muted-foreground">
                    {formatHashRate(node.hash_rate)}
                  </span>
                )}
                {node.is_synced && (
                  <Activity className="h-3 w-3 text-primary" />
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </GlassCard>
  );
};
