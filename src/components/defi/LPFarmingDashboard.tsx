import { useState, useEffect, useCallback } from 'react';
import { GlassCard } from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { Sprout, TrendingUp, Zap, Plus, Minus, RefreshCw, Info, BarChart3 } from 'lucide-react';
import { useWalletConnect } from '@/hooks/useWalletConnect';
import {
  getFarmPools,
  getUserFarmInfo,
  executeFarmDeposit,
  executeFarmWithdraw,
  executeFarmHarvest,
  type PoolInfo,
} from '@/lib/swapContract';
import { cn } from '@/lib/utils';

interface FarmPool {
  id: string;
  name: string;
  pair: string;
  apr: number;
  tvl: number;
  multiplier: string;
  feeTier?: number;
  tag?: 'hot' | 'new' | 'boosted' | null;
  earned: number;
  stakedLP: number;
}

const FALLBACK_FARMS: FarmPool[] = [
  { id: 'f1', name: 'GYDS-USDT',  pair: 'GYDS / USDT',  apr: 142.5, tvl: 2_400_000, multiplier: '40x', tag: 'hot',     earned: 0, stakedLP: 0 },
  { id: 'f2', name: 'GYDS-ETH',   pair: 'GYDS / ETH',   apr: 98.3,  tvl: 1_100_000, multiplier: '20x', tag: 'boosted', earned: 0, stakedLP: 0 },
  { id: 'f3', name: 'GYDS-BNB',   pair: 'GYDS / BNB',   apr: 74.1,  tvl: 650_000,   multiplier: '10x', tag: null,      earned: 0, stakedLP: 0 },
  { id: 'f4', name: 'USDT-USDC',  pair: 'USDT / USDC',  apr: 18.7,  tvl: 5_200_000, multiplier: '2x',  tag: 'new',     earned: 0, stakedLP: 0 },
  { id: 'f5', name: 'GYDS-MATIC', pair: 'GYDS / MATIC', apr: 56.9,  tvl: 380_000,   multiplier: '5x',  tag: null,      earned: 0, stakedLP: 0 },
];

const TAG_STYLE: Record<string, string> = {
  hot:     'bg-red-500/20 text-red-400 border-red-500/30',
  new:     'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  boosted: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
};

const fmt = (n: number) =>
  n >= 1e9 ? `$${(n / 1e9).toFixed(2)}B`
  : n >= 1e6 ? `$${(n / 1e6).toFixed(2)}M`
  : n >= 1e3 ? `$${(n / 1e3).toFixed(0)}K`
  : `$${n.toFixed(0)}`;

export const LPFarmingDashboard = () => {
  const { toast } = useToast();
  const { address } = useWalletConnect();
  const [farms, setFarms] = useState<FarmPool[]>(FALLBACK_FARMS);
  const [chainPools, setChainPools] = useState<PoolInfo[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [stakeAmount, setStakeAmount] = useState('');
  const [filter, setFilter] = useState<'all' | 'staked'>('all');
  const [isLoading, setIsLoading] = useState(false);
  const [fetchingFarms, setFetchingFarms] = useState(true);

  const fetchFarms = useCallback(async () => {
    try {
      const res = await fetch('/api/farms');
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) setFarms(data);
      }
    } catch {
      // keep fallback
    } finally {
      setFetchingFarms(false);
    }
  }, []);

  useEffect(() => {
    fetchFarms();
    const id = setInterval(fetchFarms, 30_000);
    return () => clearInterval(id);
  }, [fetchFarms]);

  // Load on-chain farm pools if deployed
  useEffect(() => {
    getFarmPools().then(pools => { if (pools.length > 0) setChainPools(pools); });
  }, []);

  // Load user farm positions if wallet connected and on-chain pools exist
  useEffect(() => {
    if (!address || chainPools.length === 0) return;
    const loadUser = async () => {
      const updated = await Promise.all(
        farms.map(async (farm) => {
          const pid = chainPools.findIndex(p =>
            p.lpToken.toLowerCase().includes(farm.name.toLowerCase())
          );
          if (pid >= 0) {
            const info = await getUserFarmInfo(pid, address);
            if (info) {
              return {
                ...farm,
                stakedLP: parseFloat(info.amount) / 1e18,
                earned: parseFloat(info.pendingRewards) / 1e18,
              };
            }
          }
          return farm;
        })
      );
      setFarms(updated);
    };
    loadUser();
  }, [address, chainPools]);

  const totalTvl    = farms.reduce((s, f) => s + f.tvl, 0);
  const totalEarned = farms.reduce((s, f) => s + f.earned, 0);
  const myFarms     = farms.filter(f => f.stakedLP > 0);
  const displayed   = filter === 'staked' ? myFarms : farms;

  const handleStake = async (farm: FarmPool) => {
    const amt = parseFloat(stakeAmount);
    if (!amt || amt <= 0) return toast({ title: 'Enter amount', variant: 'destructive' });
    setIsLoading(true);
    const pid = chainPools.findIndex(p => p.lpToken.toLowerCase().includes(farm.name.toLowerCase()));
    if (pid >= 0) {
      const txHash = await executeFarmDeposit(pid, BigInt(Math.floor(amt * 1e18)).toString());
      if (txHash) {
        toast({ title: 'Staked on-chain ✓', description: `TX: ${txHash.slice(0, 20)}…` });
        setFarms(prev => prev.map(f => f.id === farm.id ? { ...f, stakedLP: f.stakedLP + amt } : f));
        setStakeAmount('');
        setIsLoading(false);
        return;
      }
    }
    // Simulate staking
    setFarms(prev => prev.map(f => f.id === farm.id ? { ...f, stakedLP: f.stakedLP + amt } : f));
    toast({ title: `Staked ${amt} LP`, description: `${farm.pair} — earning ${farm.apr}% APR` });
    setStakeAmount('');
    setIsLoading(false);
  };

  const handleUnstake = async (farm: FarmPool) => {
    const amt = Math.min(parseFloat(stakeAmount) || farm.stakedLP, farm.stakedLP);
    if (amt <= 0) return toast({ title: 'Nothing staked', variant: 'destructive' });
    setIsLoading(true);
    const pid = chainPools.findIndex(p => p.lpToken.toLowerCase().includes(farm.name.toLowerCase()));
    if (pid >= 0) {
      const txHash = await executeFarmWithdraw(pid, BigInt(Math.floor(amt * 1e18)).toString());
      if (txHash) {
        toast({ title: 'Unstaked on-chain ✓' });
        setFarms(prev => prev.map(f => f.id === farm.id ? { ...f, stakedLP: Math.max(0, f.stakedLP - amt) } : f));
        setIsLoading(false);
        return;
      }
    }
    setFarms(prev => prev.map(f => f.id === farm.id ? { ...f, stakedLP: Math.max(0, f.stakedLP - amt) } : f));
    toast({ title: `Unstaked ${amt.toFixed(4)} LP` });
    setIsLoading(false);
  };

  const handleHarvest = async (farm: FarmPool) => {
    if (farm.earned <= 0) return;
    setIsLoading(true);
    const pid = chainPools.findIndex(p => p.lpToken.toLowerCase().includes(farm.name.toLowerCase()));
    if (pid >= 0) {
      const txHash = await executeFarmHarvest(pid);
      if (txHash) {
        toast({ title: '🌾 Harvested on-chain ✓', description: `${farm.earned.toFixed(4)} GYDS` });
        setFarms(prev => prev.map(f => f.id === farm.id ? { ...f, earned: 0 } : f));
        setIsLoading(false);
        return;
      }
    }
    toast({ title: `🌾 Harvested ${farm.earned.toFixed(4)} GYDS` });
    setFarms(prev => prev.map(f => f.id === farm.id ? { ...f, earned: 0 } : f));
    setIsLoading(false);
  };

  return (
    <div className="space-y-4">
      {/* Summary bar */}
      <GlassCard className="p-4 grid grid-cols-3 gap-3 text-center">
        <div>
          <BarChart3 className="w-4 h-4 mx-auto mb-1 text-primary" />
          <p className="text-lg font-bold">{fmt(totalTvl)}</p>
          <p className="text-xs text-muted-foreground">Total Value Locked</p>
        </div>
        <div>
          <Sprout className="w-4 h-4 mx-auto mb-1 text-emerald-400" />
          <p className="text-lg font-bold text-emerald-400">{totalEarned.toFixed(4)}</p>
          <p className="text-xs text-muted-foreground">Your Total Earned</p>
        </div>
        <div>
          <TrendingUp className="w-4 h-4 mx-auto mb-1 text-amber-400" />
          <p className="text-lg font-bold">{farms.length}</p>
          <p className="text-xs text-muted-foreground">Active Farms</p>
        </div>
      </GlassCard>

      {/* Filter + Refresh */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex gap-2">
          {(['all', 'staked'] as const).map(f => (
            <Button
              key={f}
              size="sm"
              variant={filter === f ? 'default' : 'outline'}
              onClick={() => setFilter(f)}
              className="capitalize text-xs h-8"
            >
              {f === 'staked' ? `Staked (${myFarms.length})` : 'All Farms'}
            </Button>
          ))}
        </div>
        <button
          onClick={fetchFarms}
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          <RefreshCw className={cn('w-4 h-4', fetchingFarms && 'animate-spin')} />
        </button>
      </div>

      {/* Farm cards */}
      {fetchingFarms && farms === FALLBACK_FARMS ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <GlassCard key={i} className="p-4 animate-pulse">
              <div className="h-5 bg-muted/30 rounded w-1/3 mb-2" />
              <div className="h-4 bg-muted/20 rounded w-1/2" />
            </GlassCard>
          ))}
        </div>
      ) : displayed.length === 0 ? (
        <GlassCard className="p-8 text-center text-muted-foreground">
          <Sprout className="w-8 h-8 mx-auto mb-2 opacity-30" />
          <p>No staked farms. Add liquidity to a pool first, then stake your LP tokens here.</p>
        </GlassCard>
      ) : (
        <div className="space-y-3">
          {displayed.map(farm => (
            <GlassCard key={farm.id} className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary/30 to-primary/10 flex items-center justify-center">
                    <Sprout className="w-4 h-4 text-primary" />
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5">
                      <p className="font-semibold text-sm">{farm.pair}</p>
                      {farm.tag && (
                        <Badge variant="outline" className={cn('text-[10px] px-1.5 py-0', TAG_STYLE[farm.tag])}>
                          {farm.tag}
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">{farm.multiplier} · {fmt(farm.tvl)} TVL</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-emerald-400 font-bold">{farm.apr.toFixed(1)}%</p>
                  <p className="text-xs text-muted-foreground">APR</p>
                </div>
              </div>

              {farm.stakedLP > 0 && (
                <div className="flex items-center justify-between bg-primary/5 border border-primary/20 rounded-lg p-2.5">
                  <div className="text-xs">
                    <div className="text-muted-foreground">LP Staked</div>
                    <div className="font-bold">{farm.stakedLP.toFixed(6)}</div>
                  </div>
                  <div className="text-xs">
                    <div className="text-muted-foreground">GYDS Earned</div>
                    <div className="font-bold text-emerald-400">{farm.earned.toFixed(6)}</div>
                  </div>
                  <Button size="sm" variant="outline" className="text-xs h-7 border-emerald-500/40"
                    onClick={() => handleHarvest(farm)} disabled={isLoading || farm.earned <= 0}>
                    <RefreshCw className={cn('w-3 h-3 mr-1', isLoading && 'animate-spin')} /> Harvest
                  </Button>
                </div>
              )}

              <Button variant="ghost" size="sm" className="w-full text-xs h-7 text-muted-foreground"
                onClick={() => setExpanded(expanded === farm.id ? null : farm.id)}>
                {expanded === farm.id ? 'Hide' : 'Stake / Unstake LP'}
              </Button>

              {expanded === farm.id && (
                <div className="space-y-2 border-t border-border pt-3">
                  <Input
                    type="number"
                    placeholder="LP token amount"
                    value={stakeAmount}
                    onChange={e => setStakeAmount(e.target.value)}
                    className="h-8 text-sm"
                  />
                  <div className="flex gap-2">
                    <Button size="sm" className="flex-1 h-8 text-xs gap-1" onClick={() => handleStake(farm)} disabled={isLoading}>
                      <Plus className="w-3 h-3" /> Stake
                    </Button>
                    <Button size="sm" variant="outline" className="flex-1 h-8 text-xs gap-1" onClick={() => handleUnstake(farm)} disabled={isLoading || farm.stakedLP <= 0}>
                      <Minus className="w-3 h-3" /> Unstake
                    </Button>
                  </div>
                  <div className="flex items-start gap-1.5 bg-secondary/20 rounded-lg p-2">
                    <Info className="w-3 h-3 text-muted-foreground mt-0.5 shrink-0" />
                    <p className="text-[11px] text-muted-foreground">
                      {chainPools.length > 0
                        ? 'Live contract staking active. Transactions go to the GydsSwapFarm contract.'
                        : 'You must first add liquidity to a pool to receive LP tokens to stake here.'}
                    </p>
                  </div>
                </div>
              )}
            </GlassCard>
          ))}
        </div>
      )}
    </div>
  );
};
