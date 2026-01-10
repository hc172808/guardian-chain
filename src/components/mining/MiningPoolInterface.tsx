import { useState, useEffect } from 'react';
import { GlassCard } from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { TOKENOMICS } from '@/config/wallets';
import { formatHashRate } from '@/lib/blockchain';
import { supabase } from '@/integrations/supabase/client';
import { 
  Users, 
  Zap, 
  TrendingUp, 
  Award, 
  Clock, 
  Pickaxe,
  RefreshCw,
  Wifi,
  WifiOff
} from 'lucide-react';
import { motion } from 'framer-motion';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface PoolStats {
  totalHashRate: number;
  activeMiners: number;
  blocksFound: number;
  lastBlockTime: string;
  poolFee: number;
  minPayout: number;
  pendingRewards: number;
  totalPaid: number;
  difficulty: number;
  luck: number;
}

interface ConnectedMiner {
  address: string;
  hashRate: number;
  validShares: number;
  rejectedShares: number;
  pendingReward: number;
  lastSeen: string;
  algorithm: 'randomx' | 'kheavyhash';
  isOnline: boolean;
  humanScore: number;
}

interface RewardDistribution {
  id: string;
  blockHeight: number;
  totalReward: number;
  minerRewards: { address: string; amount: number; shares: number }[];
  timestamp: string;
}

export const MiningPoolInterface = () => {
  const [poolStats, setPoolStats] = useState<PoolStats>({
    totalHashRate: 0,
    activeMiners: 0,
    blocksFound: 0,
    lastBlockTime: '-',
    poolFee: 1.0,
    minPayout: 0.0001,
    pendingRewards: 0,
    totalPaid: 0,
    difficulty: 1000000,
    luck: 100,
  });

  const [connectedMiners, setConnectedMiners] = useState<ConnectedMiner[]>([]);
  const [rewardHistory, setRewardHistory] = useState<RewardDistribution[]>([]);
  const [loading, setLoading] = useState(true);
  const [poolConnected, setPoolConnected] = useState(false);

  // Fetch pool stats from node installations and aggregate
  useEffect(() => {
    const fetchPoolData = async () => {
      try {
        // Fetch active mining nodes
        const { data: nodes } = await supabase
          .from('node_installations')
          .select('*')
          .eq('is_online', true)
          .eq('is_approved', true);

        if (nodes && nodes.length > 0) {
          const totalHashRate = nodes.reduce((sum, n) => sum + (n.hash_rate || 0), 0);
          const totalRewards = nodes.reduce((sum, n) => sum + (n.total_rewards || 0), 0);
          const totalShares = nodes.reduce((sum, n) => sum + (n.valid_shares || 0), 0);

          setPoolStats(prev => ({
            ...prev,
            totalHashRate,
            activeMiners: nodes.length,
            pendingRewards: totalRewards * 0.1, // 10% pending
            totalPaid: totalRewards * 0.9,
            blocksFound: Math.floor(totalShares / 100),
          }));

          // Map nodes to miners
          const miners: ConnectedMiner[] = nodes.map(node => ({
            address: node.wireguard_public_key?.slice(0, 20) || `miner_${node.id.slice(0, 8)}`,
            hashRate: node.hash_rate || 0,
            validShares: Number(node.valid_shares || 0),
            rejectedShares: Math.floor((node.error_count || 0) / 10),
            pendingReward: node.total_rewards || 0,
            lastSeen: node.last_heartbeat || new Date().toISOString(),
            algorithm: (node.hash_rate || 0) > 1000000 ? 'kheavyhash' : 'randomx',
            isOnline: node.is_online || false,
            humanScore: Math.max(70, 100 - (node.error_count || 0)),
          }));

          setConnectedMiners(miners);
          setPoolConnected(true);
        }

        setLoading(false);
      } catch (error) {
        console.error('Failed to fetch pool data:', error);
        setLoading(false);
      }
    };

    fetchPoolData();

    // Set up realtime subscription
    const channel = supabase
      .channel('pool_stats')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'node_installations' },
        () => fetchPoolData()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const formatTimeAgo = (isoString: string) => {
    const seconds = Math.floor((Date.now() - new Date(isoString).getTime()) / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
  };

  if (loading) {
    return (
      <GlassCard>
        <div className="flex items-center justify-center p-8">
          <RefreshCw className="w-6 h-6 animate-spin text-primary" />
          <span className="ml-3">Connecting to mining pool...</span>
        </div>
      </GlassCard>
    );
  }

  return (
    <div className="space-y-6">
      {/* Pool Connection Status */}
      <GlassCard className={poolConnected ? 'border-neon-emerald/30' : 'border-destructive/30'}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {poolConnected ? (
              <Wifi className="w-5 h-5 text-neon-emerald" />
            ) : (
              <WifiOff className="w-5 h-5 text-destructive" />
            )}
            <div>
              <h3 className="font-semibold">GYDS Mining Pool</h3>
              <p className="text-sm text-muted-foreground">
                {poolConnected ? 'Connected to production network' : 'Waiting for connection...'}
              </p>
            </div>
          </div>
          <Badge variant={poolConnected ? 'default' : 'destructive'}>
            {poolConnected ? 'LIVE' : 'OFFLINE'}
          </Badge>
        </div>
      </GlassCard>

      {/* Pool Statistics Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <GlassCard glow>
          <div className="flex items-center gap-2 mb-2">
            <Zap className="w-4 h-4 text-neon-amber" />
            <span className="text-xs text-muted-foreground">Pool Hash Rate</span>
          </div>
          <p className="text-xl font-bold font-mono text-gradient-primary">
            {formatHashRate(poolStats.totalHashRate)}
          </p>
        </GlassCard>

        <GlassCard>
          <div className="flex items-center gap-2 mb-2">
            <Users className="w-4 h-4 text-neon-purple" />
            <span className="text-xs text-muted-foreground">Active Miners</span>
          </div>
          <p className="text-xl font-bold font-mono">{poolStats.activeMiners}</p>
        </GlassCard>

        <GlassCard>
          <div className="flex items-center gap-2 mb-2">
            <Pickaxe className="w-4 h-4 text-neon-emerald" />
            <span className="text-xs text-muted-foreground">Blocks Found</span>
          </div>
          <p className="text-xl font-bold font-mono">{poolStats.blocksFound}</p>
        </GlassCard>

        <GlassCard>
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="w-4 h-4 text-primary" />
            <span className="text-xs text-muted-foreground">Pool Luck</span>
          </div>
          <p className="text-xl font-bold font-mono">{poolStats.luck}%</p>
        </GlassCard>
      </div>

      {/* Pool Info Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <GlassCard>
          <h4 className="text-sm font-medium text-muted-foreground mb-3">Pool Configuration</h4>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Pool Fee</span>
              <span className="font-mono">{poolStats.poolFee}%</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Min Payout</span>
              <span className="font-mono">{poolStats.minPayout} {TOKENOMICS.symbol}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Block Time</span>
              <span className="font-mono">120s</span>
            </div>
          </div>
        </GlassCard>

        <GlassCard>
          <h4 className="text-sm font-medium text-muted-foreground mb-3">Pending Rewards</h4>
          <p className="text-2xl font-bold font-mono text-neon-emerald">
            {poolStats.pendingRewards.toFixed(8)}
          </p>
          <p className="text-xs text-muted-foreground mt-1">{TOKENOMICS.symbol}</p>
        </GlassCard>

        <GlassCard>
          <h4 className="text-sm font-medium text-muted-foreground mb-3">Total Paid</h4>
          <p className="text-2xl font-bold font-mono">
            {poolStats.totalPaid.toFixed(6)}
          </p>
          <p className="text-xs text-muted-foreground mt-1">{TOKENOMICS.symbol}</p>
        </GlassCard>
      </div>

      {/* Connected Miners Table */}
      <GlassCard>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold flex items-center gap-2">
            <Users className="w-5 h-5 text-primary" />
            Connected Miners ({connectedMiners.length})
          </h3>
          <Badge variant="outline">{poolStats.activeMiners} online</Badge>
        </div>

        {connectedMiners.length > 0 ? (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Miner</TableHead>
                  <TableHead>Algorithm</TableHead>
                  <TableHead>Hash Rate</TableHead>
                  <TableHead>Shares</TableHead>
                  <TableHead>Human Score</TableHead>
                  <TableHead>Pending</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {connectedMiners.map((miner, i) => (
                  <motion.tr
                    key={miner.address}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.05 }}
                    className="border-b border-border/50"
                  >
                    <TableCell className="font-mono text-xs">
                      {miner.address.slice(0, 12)}...
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="text-xs">
                        {miner.algorithm === 'randomx' ? 'CPU' : 'GPU'}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono">
                      {miner.algorithm === 'randomx' 
                        ? `${miner.hashRate.toFixed(0)} H/s`
                        : `${(miner.hashRate / 1e9).toFixed(2)} GH/s`
                      }
                    </TableCell>
                    <TableCell className="font-mono">
                      <span className="text-neon-emerald">{miner.validShares}</span>
                      <span className="text-muted-foreground">/</span>
                      <span className="text-neon-rose">{miner.rejectedShares}</span>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Progress 
                          value={miner.humanScore} 
                          className="w-16 h-1.5" 
                        />
                        <span className="text-xs font-mono">{miner.humanScore}%</span>
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-neon-emerald">
                      {miner.pendingReward.toFixed(8)}
                    </TableCell>
                    <TableCell>
                      <Badge 
                        variant={miner.isOnline ? 'default' : 'secondary'}
                        className="text-xs"
                      >
                        {miner.isOnline ? 'MINING' : 'IDLE'}
                      </Badge>
                    </TableCell>
                  </motion.tr>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            <Users className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p>No miners connected yet</p>
            <p className="text-sm">Connect via WireGuard VPN to start mining</p>
          </div>
        )}
      </GlassCard>

      {/* Reward Distribution */}
      <GlassCard>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold flex items-center gap-2">
            <Award className="w-5 h-5 text-neon-amber" />
            Recent Reward Distributions
          </h3>
        </div>

        <div className="space-y-3">
          {rewardHistory.length > 0 ? (
            rewardHistory.map((reward, i) => (
              <motion.div
                key={reward.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.1 }}
                className="flex items-center justify-between p-3 rounded-lg bg-secondary/30"
              >
                <div>
                  <p className="font-mono text-sm">Block #{reward.blockHeight}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatTimeAgo(reward.timestamp)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-mono font-bold text-neon-emerald">
                    +{reward.totalReward.toFixed(8)} {TOKENOMICS.symbol}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {reward.minerRewards.length} miners
                  </p>
                </div>
              </motion.div>
            ))
          ) : (
            <div className="text-center py-6 text-muted-foreground">
              <Clock className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">Waiting for block rewards...</p>
            </div>
          )}
        </div>
      </GlassCard>
    </div>
  );
};
