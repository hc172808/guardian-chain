import { useEffect, useState, useCallback } from 'react';
import { StatCard } from '../ui/StatCard';
import {
  Blocks,
  Users,
  Pickaxe,
  ArrowRightLeft,
  TrendingUp,
  Shield,
  Wifi,
  WifiOff,
  Link as LinkIcon,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { api } from '@/lib/api';
import { useNetwork, NetworkKind, NETWORK_BADGE } from '@/contexts/NetworkContext';

// Chain IDs per network
const NET_CHAIN: Record<NetworkKind, number> = { mainnet: 198282, testnet: 13371, devnet: 13372 };

interface NetworkStatsData {
  blockHeight:      number;
  chainId:          number;
  activeValidators: number;
  activeMiners:     number;
  totalTxs:         number;
  networkHashRate:  number;
  posFinality:      number;
  tps:              number;
  peerCount:        number;
  runningNodes:     number;
  onchain:          boolean;
}

export const LiveNetworkStats = () => {
  const { selectedNetwork } = useNetwork();
  const network: NetworkKind = selectedNetwork === 'all' ? 'mainnet' : selectedNetwork;
  const badge   = NETWORK_BADGE[network];
  const chainId = NET_CHAIN[network];

  const [stats, setStats] = useState<NetworkStatsData>({
    blockHeight:      0,
    chainId,
    activeValidators: 0,
    activeMiners:     0,
    totalTxs:         0,
    networkHashRate:  0,
    posFinality:      99.99,
    tps:              0,
    peerCount:        0,
    runningNodes:     0,
    onchain:          false,
  });

  const fetchStats = useCallback(async () => {
    try {
      // All three fetches pass the selected network so the server reads the
      // correct chain state and filters the DB by the right network label.
      const [netStatsData, validatorsData, minersData] = await Promise.all([
        api.get(`/api/network-stats?network=${network}`).catch(() => null),
        api.get(`/api/validators?active=true&network=${network}`).catch(() => []),
        api.get(`/api/node-installations?online=true&network=${network}`).catch(() => []),
      ]);

      const s = netStatsData?.stats ?? {};
      const validators = Array.isArray(validatorsData) ? validatorsData : [];
      const miners     = Array.isArray(minersData)     ? minersData     : [];
      const totalHash  = miners.reduce((acc: number, n: any) => acc + (Number(n.hash_rate || n.hashRate) || 0), 0);

      setStats({
        blockHeight:      s.blockHeight      ?? 0,
        chainId:          s.chainId          ?? chainId,
        activeValidators: validators.length  || (s.activeValidators ?? 0),
        activeMiners:     miners.length      || (s.activeMiners     ?? 0),
        totalTxs:         s.totalTransactions ?? 0,
        networkHashRate:  totalHash / 1e12   || (s.networkHashRateThps ?? 0),
        posFinality:      s.posFinality      ?? 99.99,
        tps:              s.tps              ?? 0,
        peerCount:        s.peerCount        ?? 0,
        runningNodes:     s.runningNodes     ?? 0,
        onchain:          s.onchain          ?? false,
      });
    } catch {}
  }, [network, chainId]);

  // Re-fetch whenever the network changes or on a 6 s poll
  useEffect(() => {
    fetchStats();
    const iv = setInterval(fetchStats, 6_000);
    return () => clearInterval(iv);
  }, [fetchStats]);

  const fmt = (num: number): string => {
    if (num >= 1e6) return `${(num / 1e6).toFixed(1)}M`;
    if (num >= 1e3) return `${(num / 1e3).toFixed(1)}K`;
    return num.toLocaleString();
  };

  return (
    <div className="space-y-4">
      {/* Status bar */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        {/* Active network badge */}
        <span className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border font-medium ${badge.border} ${badge.bg} ${badge.text}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${badge.dot}`} />
          {badge.label} · Chain {stats.chainId}
        </span>

        <div className="flex items-center gap-2">
          {/* Running node indicator */}
          {stats.runningNodes > 0 && (
            <Badge variant="outline" className="gap-1.5 text-xs text-sky-400 border-sky-400/40">
              <LinkIcon className="h-3 w-3" />
              {stats.runningNodes} node{stats.runningNodes !== 1 ? 's' : ''} running
            </Badge>
          )}
          {/* On-chain vs DB badge */}
          <Badge
            variant="outline"
            className={`gap-1.5 ${stats.onchain ? 'text-primary border-primary' : 'text-yellow-500 border-yellow-500'}`}
          >
            {stats.onchain ? (
              <><Wifi className="h-3 w-3" /> On-chain</>
            ) : (
              <><WifiOff className="h-3 w-3" /> DB</>
            )}
          </Badge>
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        <StatCard title="Block Height"       value={fmt(stats.blockHeight)}      icon={Blocks}         />
        <StatCard title="Active Validators"  value={fmt(stats.activeValidators)} icon={Users}          />
        <StatCard title="Active Miners"      value={fmt(stats.activeMiners)}     icon={Pickaxe}        />
        <StatCard title="Total Transactions" value={fmt(stats.totalTxs)}         icon={ArrowRightLeft} />
        <StatCard title="Network Hash Rate"  value={stats.networkHashRate.toFixed(1)} icon={TrendingUp} suffix="TH/s" />
        <StatCard title="PoS Finality"       value={stats.posFinality.toFixed(2)} icon={Shield}        suffix="%"    />
      </div>
    </div>
  );
};
