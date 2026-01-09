import { useState, useEffect } from 'react';
import { GlassCard } from '../ui/GlassCard';
import { Badge } from '../ui/badge';
import { Progress } from '../ui/progress';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { 
  Server, 
  Wifi, 
  WifiOff, 
  Activity, 
  Clock, 
  TrendingUp,
  AlertTriangle,
  Users
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface NodeHealth {
  id: string;
  node_type: string;
  is_online: boolean;
  is_synced: boolean;
  is_approved: boolean;
  uptime_seconds: number;
  connection_quality: number;
  sync_progress: number;
  blocks_synced: number;
  last_block_height: number;
  error_count: number;
  peer_count: number;
  last_heartbeat: string | null;
  created_at: string;
}

export const NodeHealthDashboard = () => {
  const { user } = useAuth();
  const [nodes, setNodes] = useState<NodeHealth[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) {
      fetchNodes();
      
      // Real-time subscription
      const channel = supabase
        .channel('node-health')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'node_installations',
            filter: `user_id=eq.${user.id}`,
          },
          (payload) => {
            if (payload.eventType === 'UPDATE' || payload.eventType === 'INSERT') {
              setNodes((prev) => {
                const updated = prev.filter((n) => n.id !== (payload.new as NodeHealth).id);
                return [...updated, payload.new as NodeHealth];
              });
            } else if (payload.eventType === 'DELETE') {
              setNodes((prev) => prev.filter((n) => n.id !== (payload.old as NodeHealth).id));
            }
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [user]);

  const fetchNodes = async () => {
    const { data } = await supabase
      .from('node_installations')
      .select('*')
      .eq('user_id', user!.id)
      .order('created_at', { ascending: false });
    
    if (data) setNodes(data as NodeHealth[]);
    setLoading(false);
  };

  const formatUptime = (seconds: number): string => {
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
    return `${Math.floor(seconds / 86400)}d`;
  };

  const getConnectionQualityColor = (quality: number): string => {
    if (quality >= 80) return 'text-neon-emerald';
    if (quality >= 50) return 'text-yellow-500';
    return 'text-destructive';
  };

  const getConnectionQualityLabel = (quality: number): string => {
    if (quality >= 80) return 'Excellent';
    if (quality >= 50) return 'Good';
    if (quality >= 30) return 'Fair';
    return 'Poor';
  };

  if (loading) {
    return (
      <GlassCard className="p-6">
        <div className="text-center py-8 text-muted-foreground">Loading node health data...</div>
      </GlassCard>
    );
  }

  if (nodes.length === 0) {
    return (
      <GlassCard className="p-6">
        <div className="text-center py-8">
          <Server className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <p className="text-muted-foreground">No nodes registered yet</p>
        </div>
      </GlassCard>
    );
  }

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold flex items-center gap-2">
        <Activity className="h-5 w-5 text-primary" />
        Node Health Dashboard
      </h3>

      <div className="grid gap-4">
        {nodes.map((node) => (
          <GlassCard key={node.id} className="p-4">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                {node.is_online ? (
                  <div className="relative">
                    <Wifi className="h-5 w-5 text-neon-emerald" />
                    <span className="absolute -top-1 -right-1 h-2 w-2 bg-neon-emerald rounded-full animate-pulse" />
                  </div>
                ) : (
                  <WifiOff className="h-5 w-5 text-muted-foreground" />
                )}
                <div>
                  <p className="font-mono text-sm">{node.id.slice(0, 12)}...</p>
                  <div className="flex items-center gap-2 mt-1">
                    <Badge variant="outline">{node.node_type}</Badge>
                    {node.is_approved ? (
                      <Badge variant="outline" className="text-neon-emerald border-neon-emerald">Approved</Badge>
                    ) : (
                      <Badge variant="outline" className="text-yellow-500 border-yellow-500">Pending</Badge>
                    )}
                  </div>
                </div>
              </div>
              
              <div className="text-right text-sm text-muted-foreground">
                {node.last_heartbeat && (
                  <p className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {formatDistanceToNow(new Date(node.last_heartbeat), { addSuffix: true })}
                  </p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
              <div className="text-center p-2 rounded-lg bg-secondary/30">
                <p className="text-xs text-muted-foreground mb-1">Uptime</p>
                <p className="font-mono font-bold">{formatUptime(node.uptime_seconds || 0)}</p>
              </div>
              
              <div className="text-center p-2 rounded-lg bg-secondary/30">
                <p className="text-xs text-muted-foreground mb-1">Connection</p>
                <p className={`font-mono font-bold ${getConnectionQualityColor(node.connection_quality || 0)}`}>
                  {getConnectionQualityLabel(node.connection_quality || 0)}
                </p>
              </div>
              
              <div className="text-center p-2 rounded-lg bg-secondary/30">
                <p className="text-xs text-muted-foreground mb-1">Peers</p>
                <p className="font-mono font-bold flex items-center justify-center gap-1">
                  <Users className="h-3 w-3" />
                  {node.peer_count || 0}
                </p>
              </div>
              
              <div className="text-center p-2 rounded-lg bg-secondary/30">
                <p className="text-xs text-muted-foreground mb-1">Errors</p>
                <p className={`font-mono font-bold ${(node.error_count || 0) > 0 ? 'text-destructive' : 'text-muted-foreground'}`}>
                  {(node.error_count || 0) > 0 && <AlertTriangle className="h-3 w-3 inline mr-1" />}
                  {node.error_count || 0}
                </p>
              </div>
            </div>

            {/* Sync Progress */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Sync Progress</span>
                <span className="font-mono">{node.sync_progress || 0}%</span>
              </div>
              <Progress value={node.sync_progress || 0} className="h-2" />
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Blocks: {(node.blocks_synced || 0).toLocaleString()}</span>
                <span className="flex items-center gap-1">
                  <TrendingUp className="h-3 w-3" />
                  Latest: #{(node.last_block_height || 0).toLocaleString()}
                </span>
              </div>
            </div>
          </GlassCard>
        ))}
      </div>
    </div>
  );
};
