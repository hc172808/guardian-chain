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
import { supabase } from '@/integrations/supabase/client';
import { getNetworkStats } from '@/lib/blockchainApi';

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

  // Fetch real stats from blockchain API + DB fallback
  useEffect(() => {
    const fetchStats = async () => {
      // Try blockchain API first (Go RPC)
      try {
        const rpcStats = await getNetworkStats();
        setStats(prev => ({
          ...prev,
          blockHeight: rpcStats.blockHeight,
          networkHashRate: 0,
        }));
      } catch {
        // RPC offline, continue with DB stats
      }

      // DB stats for validators/miners/txs
      const [validatorsRes, minersRes, txRes] = await Promise.all([
        supabase.from('network_validators').select('id', { count: 'exact' }).eq('is_active', true),
        supabase.from('node_installations').select('hash_rate', { count: 'exact' }).eq('is_online', true),
        supabase.from('transactions').select('id', { count: 'exact' }),
      ]);

      const totalHash = minersRes.data?.reduce((acc, n) => acc + (Number(n.hash_rate) || 0), 0) || 0;

      setStats(prev => ({
        ...prev,
        activeValidators: validatorsRes.count || 0,
        activeMiners: minersRes.count || 0,
        totalTxs24h: txRes.count || 0,
        networkHashRate: totalHash / 1e12,
      }));
    };
    fetchStats();
    const interval = setInterval(fetchStats, 15000);
    return () => clearInterval(interval);
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