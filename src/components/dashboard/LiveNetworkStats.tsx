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
import { api } from '@/lib/api';

interface NetworkStatsData {
  blockHeight: number;
  activeValidators: number;
  activeMiners: number;
  totalTxs24h: number;
  networkHashRate: number;
  posFinality: number;
}

export const LiveNetworkStats = () => {
  const { isConnected, latestBlock } = useBlockchainWebSocket();
  
  const [stats, setStats] = useState<NetworkStatsData>({
    blockHeight: 0,
    activeValidators: 0,
    activeMiners: 0,
    totalTxs24h: 0,
    networkHashRate: 0,
    posFinality: 99.99,
  });

  // Fetch real stats from DB
  useEffect(() => {
    const fetchStats = async () => {
      const [validatorsData, minersData, txData] = await Promise.all([
        api.get('/api/validators?active=true').catch(() => []),
        api.get('/api/node-installations?online=true').catch(() => []),
        api.get('/api/transactions/count').catch(() => ({ count: 0 })),
      ]);

      const validators = Array.isArray(validatorsData) ? validatorsData : [];
      const miners = Array.isArray(minersData) ? minersData : [];
      const totalHash = miners.reduce((acc: number, n: any) => acc + (Number(n.hash_rate || n.hashRate) || 0), 0);

      setStats(prev => ({
        ...prev,
        activeValidators: validators.length,
        activeMiners: miners.length,
        totalTxs24h: txData?.count || 0,
        networkHashRate: totalHash / 1e12,
      }));
    };
    fetchStats();
  }, []);

  // Update block height from WebSocket
  useEffect(() => {
    if (latestBlock) {
      setStats(prev => ({
        ...prev,
        blockHeight: latestBlock.height,
      }));
    }
  }, [latestBlock]);

  const formatNumber = (num: number): string => {
    if (num >= 1e6) return `${(num / 1e6).toFixed(1)}M`;
    if (num >= 1e3) return `${(num / 1e3).toFixed(1)}K`;
    return num.toLocaleString();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end">
        <Badge 
          variant="outline" 
          className={`gap-2 ${isConnected ? 'text-primary border-primary' : 'text-yellow-500 border-yellow-500'}`}
        >
          {isConnected ? (
            <>
              <Wifi className="h-3 w-3" />
              Live Data
            </>
          ) : (
            <>
              <WifiOff className="h-3 w-3" />
              Offline
            </>
          )}
        </Badge>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        <StatCard
          title="Block Height"
          value={formatNumber(stats.blockHeight)}
          icon={Blocks}
        />
        <StatCard
          title="Active Validators"
          value={formatNumber(stats.activeValidators)}
          icon={Users}
        />
        <StatCard
          title="Active Miners"
          value={formatNumber(stats.activeMiners)}
          icon={Pickaxe}
        />
        <StatCard
          title="Total Transactions"
          value={formatNumber(stats.totalTxs24h)}
          icon={ArrowRightLeft}
        />
        <StatCard
          title="Network Hash Rate"
          value={stats.networkHashRate.toFixed(1)}
          icon={TrendingUp}
          suffix="TH/s"
        />
        <StatCard
          title="PoS Finality"
          value={stats.posFinality.toFixed(2)}
          icon={Shield}
          suffix="%"
        />
      </div>
    </div>
  );
};