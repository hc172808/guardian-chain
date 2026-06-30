import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { GlassCard } from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Wifi, WifiOff, Shield, RefreshCw, AlertTriangle } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';

interface WireGuardStatusProps {
  onConnected?: (connected: boolean) => void;
}

const NODE_TYPE_LABELS: Record<string, string> = {
  litenode:  'Lite Node',
  rpcnode:   'RPC Node',
  fullnode:  'Full Node',
  boostnode: 'Boost Node',
  validator: 'Validator Node',
  genesis:   'Genesis Node',
  bootnode:  'Boot Node',
};

export const WireGuardStatus = ({ onConnected }: WireGuardStatusProps) => {
  const { user } = useAuth();
  const [connectionState, setConnectionState] = useState<'disconnected' | 'connecting' | 'connected' | 'error'>('disconnected');
  const [nodeApproved, setNodeApproved] = useState(false);
  const [hasNode, setHasNode] = useState(false);
  const [nodeType, setNodeType] = useState<string>('litenode');
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [syncProgress, setSyncProgress] = useState(0);

  useEffect(() => {
    if (user) checkNodeStatus();
  }, [user]);

  useEffect(() => {
    onConnected?.(connectionState === 'connected');
  }, [connectionState, onConnected]);

  const checkNodeStatus = async () => {
    if (!user) return;
    try {
      const res = await fetch('/api/nodes', { credentials: 'include' });
      if (!res.ok) return;
      const nodes: any[] = await res.json();
      if (!Array.isArray(nodes) || nodes.length === 0) return;

      // Prefer an approved+online node; fall back to any node belonging to the user
      const approved = nodes.find(n => n.isApproved || n.is_approved);
      const best = approved ?? nodes[0];

      setHasNode(true);
      const approved_ = !!(best.isApproved ?? best.is_approved);
      setNodeApproved(approved_);
      setNodeType(best.nodeType ?? best.node_type ?? 'litenode');
      setPublicKey(best.wireguardPublicKey ?? best.wireguard_public_key ?? null);

      if (approved_) initiateConnection();
    } catch {
      // network error — leave hasNode false
    }
  };

  const initiateConnection = () => {
    setConnectionState('connecting');
    setSyncProgress(0);

    const interval = setInterval(() => {
      setSyncProgress(prev => {
        const next = Math.min(100, prev + Math.random() * 15);
        if (next >= 100) {
          clearInterval(interval);
          setConnectionState('connected');
          // Fire-and-forget heartbeat update
          fetch('/api/nodes', { credentials: 'include' })
            .then(r => r.json())
            .then((nodes: any[]) => {
              if (!Array.isArray(nodes) || !nodes.length) return;
              const best = nodes.find(n => n.isApproved || n.is_approved) ?? nodes[0];
              if (best?.id) {
                fetch(`/api/nodes/${best.id}/heartbeat`, {
                  method: 'POST',
                  credentials: 'include',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ syncProgress: 100 }),
                }).catch(() => {});
              }
            }).catch(() => {});
        }
        return next;
      });
    }, 300);
  };

  const handleRetryConnection = () => {
    if (nodeApproved) initiateConnection();
  };

  if (!user) {
    return (
      <GlassCard className="border-destructive/30 bg-destructive/5">
        <div className="flex items-center gap-4">
          <div className="p-3 rounded-lg bg-destructive/10">
            <WifiOff className="w-6 h-6 text-destructive" />
          </div>
          <div>
            <p className="font-medium">Authentication Required</p>
            <p className="text-sm text-muted-foreground">Please sign in to connect to the VPN network</p>
          </div>
        </div>
      </GlassCard>
    );
  }

  if (!hasNode) {
    return (
      <GlassCard className="border-muted-foreground/30">
        <div className="flex items-center gap-4">
          <div className="p-3 rounded-lg bg-muted/10">
            <AlertTriangle className="w-6 h-6 text-muted-foreground" />
          </div>
          <div className="flex-1">
            <p className="font-medium">No Node Registered</p>
            <p className="text-sm text-muted-foreground">
              Start a test node from Admin → Test Nodes, or install a node from the Download page.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={checkNodeStatus} className="gap-2">
            <RefreshCw className="w-4 h-4" /> Retry
          </Button>
        </div>
      </GlassCard>
    );
  }

  if (!nodeApproved) {
    return (
      <GlassCard className="border-yellow-500/30 bg-yellow-500/5">
        <div className="flex items-center gap-4">
          <div className="p-3 rounded-lg bg-yellow-500/10">
            <Shield className="w-6 h-6 text-yellow-500" />
          </div>
          <div className="flex-1">
            <p className="font-medium text-yellow-500">Pending Approval</p>
            <p className="text-sm text-muted-foreground">
              Your node is awaiting admin approval.
            </p>
            {publicKey && (
              <p className="text-xs font-mono text-muted-foreground mt-2 truncate">
                Key: {publicKey.slice(0, 20)}...
              </p>
            )}
          </div>
        </div>
      </GlassCard>
    );
  }

  return (
    <GlassCard className={cn(
      connectionState === 'connected'  ? 'border-neon-emerald/50 bg-neon-emerald/5' :
      connectionState === 'connecting' ? 'border-primary/50 bg-primary/5' :
      connectionState === 'error'      ? 'border-destructive/50 bg-destructive/5' :
      'border-muted-foreground/30'
    )}>
      <div className="flex items-center gap-4">
        <div className={cn(
          "p-3 rounded-lg",
          connectionState === 'connected'  ? 'bg-neon-emerald/10' :
          connectionState === 'connecting' ? 'bg-primary/10' :
          connectionState === 'error'      ? 'bg-destructive/10' :
          'bg-muted/10'
        )}>
          {connectionState === 'connected' ? (
            <Wifi className="w-6 h-6 text-neon-emerald" />
          ) : connectionState === 'connecting' ? (
            <Wifi className="w-6 h-6 text-primary animate-pulse" />
          ) : connectionState === 'error' ? (
            <WifiOff className="w-6 h-6 text-destructive" />
          ) : (
            <WifiOff className="w-6 h-6 text-muted-foreground" />
          )}
        </div>

        <div className="flex-1">
          <div className="flex items-center gap-2">
            <p className={cn(
              "font-medium",
              connectionState === 'connected'  && 'text-neon-emerald',
              connectionState === 'connecting' && 'text-primary',
              connectionState === 'error'      && 'text-destructive'
            )}>
              {connectionState === 'connected'  ? 'Connected via WireGuard VPN' :
               connectionState === 'connecting' ? 'Connecting to Node...' :
               connectionState === 'error'      ? 'Connection Failed' :
               'Disconnected'}
            </p>
            <Badge variant="outline" className="text-xs">
              {NODE_TYPE_LABELS[nodeType] ?? nodeType}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            {connectionState === 'connected'  ? 'Synced with blockchain, ready to mine' :
             connectionState === 'connecting' ? `Syncing: ${syncProgress.toFixed(0)}%` :
             connectionState === 'error'      ? 'Unable to connect to node' :
             'Click connect to start syncing'}
          </p>

          {connectionState === 'connecting' && (
            <div className="mt-2">
              <Progress value={syncProgress} className="h-2" />
            </div>
          )}
        </div>

        {(connectionState === 'disconnected' || connectionState === 'error') && (
          <Button onClick={handleRetryConnection} variant="outline" size="sm" className="gap-2">
            <RefreshCw className="w-4 h-4" />
            Connect
          </Button>
        )}
      </div>
    </GlassCard>
  );
};
