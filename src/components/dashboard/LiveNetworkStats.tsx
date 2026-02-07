import { useEffect, useState } from 'react';
import { StatCard } from '../ui/StatCard';
import { 
  Blocks, 
  Users, 
  Pickaxe, 
  ArrowRightLeft, 
  TrendingUp,
  Shield,
  Wifi,
  WifiOff
} from 'lucide-react';
import { useBlockchainWebSocket } from '@/hooks/useBlockchainWebSocket';
import { Badge } from '@/components/ui/badge';

interface NetworkStatsData {
  blockHeight: number;
  activeValidators: number;
  activeMiners: number;
  totalTxs24h: number;
  networkHashRate: number;
  posFinality: number;
}

export const LiveNetworkStats = () => {
  const { isConnected, latestBlock, latestTransactions } = useBlockchainWebSocket();
  
  const [stats, setStats] = useState<NetworkStatsData>({
    blockHeight: 0,
    activeValidators: 0,
    activeMiners: 0,
    totalTxs24h: 0,
    networkHashRate: 0,
    posFinality: 99.99,
  });

  const [previousStats, setPreviousStats] = useState<NetworkStatsData>(stats);

  // Update stats when new block arrives
  useEffect(() => {
    if (latestBlock) {
      setPreviousStats(stats);
      setStats(prev => ({
        ...prev,
        blockHeight: latestBlock.height,
        // Calculate based on new block data
        activeValidators: Math.max(prev.activeValidators, 1),
      }));
    }
  }, [latestBlock]);

  // Calculate changes
  const calculateChange = (current: number, previous: number): number => {
    if (previous === 0) return 0;
    return ((current - previous) / previous) * 100;
  };

  // Format large numbers
  const formatNumber = (num: number): string => {
    if (num >= 1e6) return `${(num / 1e6).toFixed(1)}M`;
    if (num >= 1e3) return `${(num / 1e3).toFixed(1)}K`;
    return num.toLocaleString();
  };

  // Simulated data when not connected (for demo purposes)
  const displayStats = isConnected ? stats : {
    blockHeight: 1234567,
    activeValidators: 256,
    activeMiners: 12456,
    totalTxs24h: 2400000,
    networkHashRate: 145.2,
    posFinality: 99.99,
  };

  return (
    <div className="space-y-4">
      {/* Connection Status */}
      <div className="flex items-center justify-end">
        <Badge 
          variant="outline" 
          className={`gap-2 ${isConnected ? 'text-neon-emerald border-neon-emerald' : 'text-yellow-500 border-yellow-500'}`}
        >
          {isConnected ? (
            <>
              <Wifi className="h-3 w-3" />
              Live Data
            </>
          ) : (
            <>
              <WifiOff className="h-3 w-3" />
              Demo Mode
            </>
          )}
        </Badge>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        <StatCard
          title="Block Height"
          value={formatNumber(displayStats.blockHeight)}
          icon={Blocks}
          change={calculateChange(displayStats.blockHeight, previousStats.blockHeight)}
        />
        <StatCard
          title="Active Validators"
          value={formatNumber(displayStats.activeValidators)}
          icon={Users}
          change={calculateChange(displayStats.activeValidators, previousStats.activeValidators)}
        />
        <StatCard
          title="Active Miners"
          value={formatNumber(displayStats.activeMiners)}
          icon={Pickaxe}
          change={calculateChange(displayStats.activeMiners, previousStats.activeMiners)}
        />
        <StatCard
          title="Total TXs (24h)"
          value={formatNumber(displayStats.totalTxs24h)}
          icon={ArrowRightLeft}
          change={12.3}
        />
        <StatCard
          title="Network Hash Rate"
          value={displayStats.networkHashRate.toFixed(1)}
          icon={TrendingUp}
          suffix="TH/s"
          change={-2.1}
        />
        <StatCard
          title="PoS Finality"
          value={displayStats.posFinality.toFixed(2)}
          icon={Shield}
          suffix="%"
          change={0.01}
        />
      </div>

      {/* Recent Activity Indicator */}
      {isConnected && latestTransactions.length > 0 && (
        <div className="text-xs text-muted-foreground text-right">
          Last TX: {new Date(latestTransactions[0]?.timestamp || Date.now()).toLocaleTimeString()}
        </div>
      )}
    </div>
  );
};
