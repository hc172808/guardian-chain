import { useState } from 'react';
import { GlassCard } from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { Sprout, TrendingUp, Zap, Lock, Plus, Minus, RefreshCw, Info } from 'lucide-react';

interface FarmPool {
  id: string;
  name: string;
  pair: string;
  apr: number;
  tvl: number;
  multiplier: string;
  earned: number;
  stakedLP: number;
  tag?: 'hot' | 'new' | 'boosted';
}

const DEMO_FARMS: FarmPool[] = [
  { id: '1', name: 'GYDS-USDT',  pair: 'GYDS / USDT',  apr: 142.5, tvl: 2_400_000, multiplier: '40x', earned: 0, stakedLP: 0, tag: 'hot' },
  { id: '2', name: 'GYDS-ETH',   pair: 'GYDS / ETH',   apr: 98.3,  tvl: 1_100_000, multiplier: '20x', earned: 0, stakedLP: 0, tag: 'boosted' },
  { id: '3', name: 'GYDS-BNB',   pair: 'GYDS / BNB',   apr: 74.1,  tvl: 650_000,   multiplier: '10x', earned: 0, stakedLP: 0 },
  { id: '4', name: 'USDT-USDC',  pair: 'USDT / USDC',  apr: 18.7,  tvl: 5_200_000, multiplier: '2x',  earned: 0, stakedLP: 0, tag: 'new' },
  { id: '5', name: 'GYDS-MATIC', pair: 'GYDS / MATIC', apr: 56.9,  tvl: 380_000,   multiplier: '5x',  earned: 0, stakedLP: 0 },
];

const TAG_STYLE: Record<string, string> = {
  hot:     'bg-red-500/20 text-red-400 border-red-500/30',
  new:     'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  boosted: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
};

export const LPFarmingDashboard = () => {
  const { toast } = useToast();
  const [farms, setFarms] = useState<FarmPool[]>(DEMO_FARMS);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [stakeAmount, setStakeAmount] = useState('');
  const [filter, setFilter] = useState<'all' | 'staked'>('all');

  const totalEarned = farms.reduce((s, f) => s + f.earned, 0);
  const totalStakedLP = farms.reduce((s, f) => s + f.stakedLP, 0);

  const handleStake = (farm: FarmPool) => {
    const amt = parseFloat(stakeAmount);
    if (!amt || amt <= 0) return toast({ title: 'Enter amount', variant: 'destructive' });
    setFarms(prev => prev.map(f => f.id === farm.id ? { ...f, stakedLP: f.stakedLP + amt } : f));
    setStakeAmount('');
    toast({ title: `Staked ${amt} ${farm.name} LP`, description: 'You are now earning GYDS rewards.' });
  };

  const handleUnstake = (farm: FarmPool) => {
    const amt = parseFloat(stakeAmount);
    if (!amt || amt <= 0) return toast({ title: 'Enter amount', variant: 'destructive' });
    if (amt > farm.stakedLP) return toast({ title: 'Insufficient staked LP', variant: 'destructive' });
    setFarms(prev => prev.map(f => f.id === farm.id ? { ...f, stakedLP: f.stakedLP - amt } : f));
    setStakeAmount('');
    toast({ title: `Unstaked ${amt} ${farm.name} LP` });
  };

  const handleHarvest = (farm: FarmPool) => {
    if (farm.earned <= 0) return toast({ title: 'Nothing to harvest' });
    setFarms(prev => prev.map(f => f.id === farm.id ? { ...f, earned: 0 } : f));
    toast({ title: `Harvested ${farm.earned.toFixed(4)} GYDS`, description: 'Sent to your wallet.' });
  };

  const handleHarvestAll = () => {
    const total = farms.reduce((s, f) => s + f.earned, 0);
    if (total <= 0) return toast({ title: 'Nothing to harvest' });
    setFarms(prev => prev.map(f => ({ ...f, earned: 0 })));
    toast({ title: `Harvested ${total.toFixed(4)} GYDS total` });
  };

  const visible = filter === 'staked' ? farms.filter(f => f.stakedLP > 0) : farms;

  return (
    <div className="space-y-4">
      {/* Summary bar */}
      <GlassCard className="p-4">
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <Sprout className="w-5 h-5 text-emerald-400" />
            <span className="font-semibold text-foreground">LP Farming</span>
            <Badge variant="outline" className="text-xs ml-auto">Mainnet: Coming Soon</Badge>
          </div>
          <p className="text-xs text-muted-foreground">Stake LP tokens to earn GYDS rewards. Higher multiplier pools earn proportionally more.</p>
          <div className="grid grid-cols-3 gap-3">
            <div className="text-center">
              <div className="text-xs text-muted-foreground">Staked LP</div>
              <div className="text-sm font-bold text-foreground">{totalStakedLP.toFixed(2)}</div>
            </div>
            <div className="text-center">
              <div className="text-xs text-muted-foreground">GYDS Earned</div>
              <div className="text-sm font-bold text-emerald-400">{totalEarned.toFixed(4)}</div>
            </div>
            <div className="text-center">
              <Button size="sm" variant="outline" className="text-xs h-7 w-full" onClick={handleHarvestAll}>
                <RefreshCw className="w-3 h-3 mr-1" /> Harvest All
              </Button>
            </div>
          </div>
        </div>
      </GlassCard>

      {/* Filter */}
      <div className="flex gap-2">
        {(['all', 'staked'] as const).map(f => (
          <Button key={f} size="sm" variant={filter === f ? 'default' : 'outline'} className="text-xs h-7"
            onClick={() => setFilter(f)}>
            {f === 'all' ? 'All Farms' : 'My Farms'}
          </Button>
        ))}
      </div>

      {/* Farm list */}
      {visible.length === 0 && (
        <GlassCard className="p-6 text-center text-muted-foreground text-sm">
          No staked positions. Add LP tokens to start earning.
        </GlassCard>
      )}
      {visible.map(farm => (
        <GlassCard key={farm.id} className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="flex -space-x-1">
                <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold">G</div>
                <div className="w-7 h-7 rounded-full bg-secondary/40 flex items-center justify-center text-xs font-bold">U</div>
              </div>
              <div>
                <div className="font-medium text-sm text-foreground">{farm.pair}</div>
                <div className="text-xs text-muted-foreground">{farm.multiplier} multiplier</div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {farm.tag && (
                <Badge variant="outline" className={`text-[10px] ${TAG_STYLE[farm.tag]}`}>{farm.tag.toUpperCase()}</Badge>
              )}
              <div className="text-right">
                <div className="text-sm font-bold text-emerald-400">{farm.apr.toFixed(1)}%</div>
                <div className="text-xs text-muted-foreground">APR</div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="bg-secondary/20 rounded-lg p-2">
              <div className="text-muted-foreground">TVL</div>
              <div className="font-medium text-foreground">${(farm.tvl / 1e6).toFixed(2)}M</div>
            </div>
            <div className="bg-secondary/20 rounded-lg p-2">
              <div className="text-muted-foreground">Your LP Staked</div>
              <div className="font-medium text-foreground">{farm.stakedLP.toFixed(4)}</div>
            </div>
          </div>

          {farm.earned > 0 && (
            <div className="flex items-center justify-between bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-2">
              <div className="text-xs">
                <div className="text-muted-foreground">GYDS Earned</div>
                <div className="font-bold text-emerald-400">{farm.earned.toFixed(6)}</div>
              </div>
              <Button size="sm" variant="outline" className="text-xs h-7 border-emerald-500/40"
                onClick={() => handleHarvest(farm)}>
                <RefreshCw className="w-3 h-3 mr-1" /> Harvest
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
                placeholder="LP amount"
                value={stakeAmount}
                onChange={e => setStakeAmount(e.target.value)}
                className="h-8 text-sm"
              />
              <div className="flex gap-2">
                <Button size="sm" className="flex-1 h-8 text-xs gap-1" onClick={() => handleStake(farm)}>
                  <Plus className="w-3 h-3" /> Stake
                </Button>
                <Button size="sm" variant="outline" className="flex-1 h-8 text-xs gap-1" onClick={() => handleUnstake(farm)}
                  disabled={farm.stakedLP <= 0}>
                  <Minus className="w-3 h-3" /> Unstake
                </Button>
              </div>
              <div className="flex items-start gap-1.5 bg-secondary/20 rounded-lg p-2">
                <Info className="w-3 h-3 text-muted-foreground mt-0.5 flex-shrink-0" />
                <p className="text-[11px] text-muted-foreground">
                  Staking is simulated in this demo. Live contract staking activates on mainnet launch. You must first add liquidity to receive LP tokens.
                </p>
              </div>
            </div>
          )}
        </GlassCard>
      ))}
    </div>
  );
};
