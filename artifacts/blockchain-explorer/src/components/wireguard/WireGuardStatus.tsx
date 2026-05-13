import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { GlassCard } from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/button';
import { Wifi, WifiOff, Shield, RefreshCw, AlertTriangle } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';

interface WireGuardStatusProps {
  onConnected?: (connected: boolean) => void;
}

export const WireGuardStatus = ({ onConnected }: WireGuardStatusProps) => {
  const { user } = useAuth();
  const [connectionState, setConnectionState] = useState<'disconnected' | 'connecting' | 'connected' | 'error'>('disconnected');
  const [nodeApproved, setNodeApproved] = useState(false);
  const [hasNode, setHasNode] = useState(false);
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [syncProgress, setSyncProgress] = useState(0);

  useEffect(() => {
    if (user) {
      checkNodeStatus();
    }
  }, [user]);

  useEffect(() => {
    onConnected?.(connectionState === 'connected');
  }, [connectionState, onConnected]);

  const checkNodeStatus = async () => {
    if (!user) return;

    const { data, error } = await supabase
      .from('node_installations')
      .select('*')
      .eq('user_id', user.id)
      .eq('node_type', 'litenode')
      .maybeSingle();

    if (data) {
      setHasNode(true);
      setNodeApproved(data.is_approved || false);
      setPublicKey(data.wireguard_public_key);
      
      if (data.is_approved) {
        initiateConnection();
      }
    }
  };

  const initiateConnection = () => {
    setConnectionState('connecting');
    setSyncProgress(0);

    // Simulate VPN connection and sync
    const interval = setInterval(() => {
      setSyncProgress(prev => {
        const newProgress = Math.min(100, prev + Math.random() * 15);
        if (newProgress >= 100) {
          clearInterval(interval);
          setConnectionState('connected');
          
          // Update node status in database
          if (user) {
            supabase
              .from('node_installations')
              .update({ 
                is_online: true, 
                is_synced: true,
                last_heartbeat: new Date().toISOString(),
                last_sync_at: new Date().toISOString()
              })
              .eq('user_id', user.id)
              .eq('node_type', 'litenode');
          }
        }
        return newProgress;
      });
    }, 300);
  };

  const handleRetryConnection = () => {
    if (nodeApproved) {
      initiateConnection();
    }
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
            <p className="text-sm text-muted-foreground">
              Please sign in to connect to the VPN network
            </p>
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
              Install a lite node from the Download page to get started
            </p>
          </div>
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
              Your node is awaiting admin approval. You'll be able to connect once approved.
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
      connectionState === 'connected' ? 'border-neon-emerald/50 bg-neon-emerald/5' : 
      connectionState === 'connecting' ? 'border-primary/50 bg-primary/5' :
      connectionState === 'error' ? 'border-destructive/50 bg-destructive/5' :
      'border-muted-foreground/30'
    )}>
      <div className="flex items-center gap-4">
        <div className={cn(
          "p-3 rounded-lg",
          connectionState === 'connected' ? 'bg-neon-emerald/10' :
          connectionState === 'connecting' ? 'bg-primary/10' :
          connectionState === 'error' ? 'bg-destructive/10' :
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
          <p className={cn(
            "font-medium",
            connectionState === 'connected' && 'text-neon-emerald',
            connectionState === 'connecting' && 'text-primary',
            connectionState === 'error' && 'text-destructive'
          )}>
            {connectionState === 'connected' ? 'Connected via WireGuard VPN' :
             connectionState === 'connecting' ? 'Connecting to Full Node...' :
             connectionState === 'error' ? 'Connection Failed' :
             'Disconnected'}
          </p>
          <p className="text-sm text-muted-foreground">
            {connectionState === 'connected' ? 'Synced with blockchain, ready to mine' :
             connectionState === 'connecting' ? `Syncing: ${syncProgress.toFixed(0)}%` :
             connectionState === 'error' ? 'Unable to connect to full node' :
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
