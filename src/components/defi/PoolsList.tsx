import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { GlassCard } from '@/components/ui/GlassCard';
import { Plus, Search, Filter, Settings, Circle, AlertTriangle, MoreHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Pool {
  id: string;
  tokenA: { symbol: string; icon?: string };
  tokenB: { symbol: string; icon?: string };
  fee: string;
  tvl: number;
  volume24h: number;
  fees24h: number;
  yield: string;
  hasWarning?: boolean;
}

const mockPools: Pool[] = [
  {
    id: '1',
    tokenA: { symbol: 'GYD' },
    tokenB: { symbol: 'GYDS' },
    fee: '0.04%',
    tvl: 256236993,
    volume24h: 429919225,
    fees24h: 212962,
    yield: '32.5%',
  },
  {
    id: '2',
    tokenA: { symbol: 'NLGR' },
    tokenB: { symbol: 'GYD' },
    fee: '0.05%',
    tvl: 45623000,
    volume24h: 12500000,
    fees24h: 45000,
    yield: '18.2%',
  },
  {
    id: '3',
    tokenA: { symbol: 'BRGC' },
    tokenB: { symbol: 'GYD' },
    fee: '1.00%',
    tvl: 1250000,
    volume24h: 850000,
    fees24h: 8500,
    yield: '74.5%',
    hasWarning: true,
  },
  {
    id: '4',
    tokenA: { symbol: 'BRGC' },
    tokenB: { symbol: 'NETGY' },
    fee: '1.00%',
    tvl: 980000,
    volume24h: 620000,
    fees24h: 6200,
    yield: '62.3%',
    hasWarning: true,
  },
];

const formatValue = (value: number): string => {
  if (value >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
  if (value >= 1e6) return `$${(value / 1e6).toFixed(2)}M`;
  if (value >= 1e3) return `$${(value / 1e3).toFixed(0)}K`;
  return `$${value.toFixed(0)}`;
};

export const PoolsList = () => {
  const [searchQuery, setSearchQuery] = useState('');

  const totalTvl = mockPools.reduce((acc, pool) => acc + pool.tvl, 0);
  const totalVolume = mockPools.reduce((acc, pool) => acc + pool.volume24h, 0);
  const totalFees = mockPools.reduce((acc, pool) => acc + pool.fees24h, 0);

  const filteredPools = mockPools.filter(
    (pool) =>
      pool.tokenA.symbol.toLowerCase().includes(searchQuery.toLowerCase()) ||
      pool.tokenB.symbol.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Liquidity Pools</h1>
        <p className="text-muted-foreground">
          Explore pools and deploy capital to earn trading fees.
        </p>
      </div>

      {/* Create Pool Button */}
      <Button
        variant="outline"
        className="gap-2 border-amber-500/50 text-amber-500 hover:bg-amber-500/10 hover:text-amber-400"
      >
        <Plus className="h-4 w-4" />
        Create Pool
      </Button>

      {/* Stats Card */}
      <GlassCard className="p-4 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">TVL</span>
          <span className="font-semibold text-foreground">{formatValue(totalTvl)}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">24H Volume</span>
          <span className="font-semibold text-foreground">{formatValue(totalVolume)}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">24H Fees</span>
          <span className="font-semibold text-foreground">{formatValue(totalFees)}</span>
        </div>
      </GlassCard>

      {/* Search and Filters */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search pools..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 bg-secondary/30"
          />
        </div>
        <Button variant="secondary" size="icon">
          <Filter className="h-4 w-4" />
        </Button>
        <Button variant="secondary" size="icon">
          <Settings className="h-4 w-4" />
        </Button>
        <Button variant="secondary" size="icon">
          <Circle className="h-4 w-4" />
        </Button>
      </div>

      {/* Pool List Header */}
      <div className="flex items-center justify-between text-sm text-muted-foreground px-2">
        <span>Pool</span>
        <span>Yield / TVL</span>
      </div>

      {/* Pool Items */}
      <div className="space-y-2">
        {filteredPools.map((pool) => (
          <div
            key={pool.id}
            className="flex items-center justify-between p-4 rounded-xl bg-card/50 border border-border/30 hover:border-border/60 transition-colors cursor-pointer"
          >
            <div className="flex items-center gap-3">
              <div className="flex -space-x-2">
                <div className={cn(
                  "w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold border-2 border-background z-10",
                  pool.tokenA.symbol === 'GYD' ? "bg-gradient-to-br from-blue-500 to-cyan-500" :
                  pool.tokenA.symbol === 'BRGC' ? "bg-gradient-to-br from-amber-500 to-amber-600 text-black" :
                  "bg-gradient-to-br from-primary to-primary/50"
                )}>
                  {pool.tokenA.symbol[0]}
                </div>
                <div className={cn(
                  "w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold border-2 border-background",
                  pool.tokenB.symbol === 'GYD' ? "bg-gradient-to-br from-blue-500 to-cyan-500" :
                  pool.tokenB.symbol === 'GYDS' ? "bg-gradient-to-br from-primary to-primary/50" :
                  pool.tokenB.symbol === 'NETGY' ? "bg-gradient-to-br from-purple-500 to-purple-600" :
                  "bg-gradient-to-br from-amber-500 to-amber-600 text-black"
                )}>
                  {pool.tokenB.symbol[0]}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-semibold">
                  {pool.tokenA.symbol} / {pool.tokenB.symbol}
                </span>
                <Badge variant="secondary" className="text-xs font-mono">
                  {pool.fee}
                </Badge>
                {pool.hasWarning && (
                  <AlertTriangle className="h-4 w-4 text-amber-500" />
                )}
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-right">
                <div className="text-primary font-semibold">{pool.yield}</div>
                <div className="text-xs text-muted-foreground">{formatValue(pool.tvl)}</div>
              </div>
              <Button variant="ghost" size="icon" className="text-muted-foreground">
                <MoreHorizontal className="h-5 w-5" />
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
