import { useState } from 'react';
import { GlassCard } from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import { TrendingUp, TrendingDown, Clock, Trophy, BarChart3, Zap, Target } from 'lucide-react';

interface Market {
  id: string;
  question: string;
  category: string;
  yesPool: number;
  noPool: number;
  endsAt: string;
  resolved?: boolean;
  outcome?: boolean;
  volume: number;
}

const MARKETS: Market[] = [
  {
    id: 'm1',
    question: 'Will GYDS price exceed $1.00 by end of Q3 2026?',
    category: 'Price',
    yesPool: 182400,
    noPool: 94800,
    endsAt: '2026-09-30',
    volume: 277200,
  },
  {
    id: 'm2',
    question: 'Will GYDSchain reach 100 active validators by Dec 2026?',
    category: 'Network',
    yesPool: 56000,
    noPool: 88000,
    endsAt: '2026-12-31',
    volume: 144000,
  },
  {
    id: 'm3',
    question: 'Will ETH price be above $4,000 on Jul 1, 2026?',
    category: 'Price',
    yesPool: 410000,
    noPool: 230000,
    endsAt: '2026-07-01',
    volume: 640000,
  },
  {
    id: 'm4',
    question: 'Will GYDSchain TVL exceed $10M by mainnet launch?',
    category: 'DeFi',
    yesPool: 72000,
    noPool: 28000,
    endsAt: '2026-10-01',
    volume: 100000,
  },
  {
    id: 'm5',
    question: 'BTC above $120,000 on Jan 1, 2027?',
    category: 'Price',
    yesPool: 320000,
    noPool: 280000,
    endsAt: '2027-01-01',
    volume: 600000,
  },
];

const CATEGORY_COLOR: Record<string, string> = {
  Price: 'bg-primary/20 text-primary border-primary/30',
  Network: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  DeFi: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
};

export const PredictionMarkets = () => {
  const { toast } = useToast();
  const [bets, setBets] = useState<Record<string, { side: 'yes' | 'no'; amount: string }>>({});
  const [myBets, setMyBets] = useState<Record<string, { side: 'yes' | 'no'; amount: number; payout: number }>>({});
  const [filterCat, setFilterCat] = useState('All');

  const categories = ['All', ...Array.from(new Set(MARKETS.map(m => m.category)))];
  const filtered = filterCat === 'All' ? MARKETS : MARKETS.filter(m => m.category === filterCat);

  const yesOdds = (m: Market) => {
    const total = m.yesPool + m.noPool;
    return total === 0 ? 50 : Math.round((m.yesPool / total) * 100);
  };

  const placeBet = (market: Market, side: 'yes' | 'no', amount: string) => {
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) { toast({ title: 'Enter a valid amount', variant: 'destructive' }); return; }
    const pct = side === 'yes' ? yesOdds(market) : 100 - yesOdds(market);
    const payout = ((amt / (pct / 100)) * 0.97).toFixed(2);
    setMyBets(prev => ({ ...prev, [market.id]: { side, amount: amt, payout: parseFloat(payout) } }));
    setBets(prev => ({ ...prev, [market.id]: { side, amount: '' } }));
    toast({
      title: `Bet placed — ${side.toUpperCase()}`,
      description: `${amt} GYDS wagered. Potential payout: ${payout} GYDS`,
    });
  };

  return (
    <div className="space-y-4 pb-4">
      {/* Header stats */}
      <GlassCard className="p-4 grid grid-cols-3 gap-3 text-center">
        {[
          { label: 'Open Markets', value: MARKETS.length, icon: Target },
          { label: 'Total Volume', value: `$${(MARKETS.reduce((a, m) => a + m.volume, 0) / 1e6).toFixed(2)}M`, icon: BarChart3 },
          { label: 'Your Bets', value: Object.keys(myBets).length, icon: Trophy },
        ].map(({ label, value, icon: Icon }) => (
          <div key={label}>
            <Icon className="w-4 h-4 mx-auto mb-1 text-primary" />
            <p className="font-bold text-sm">{value}</p>
            <p className="text-xs text-muted-foreground">{label}</p>
          </div>
        ))}
      </GlassCard>

      {/* Category filter */}
      <div className="flex gap-2 flex-wrap">
        {categories.map(c => (
          <Button key={c} size="sm" variant={filterCat === c ? 'default' : 'outline'}
            onClick={() => setFilterCat(c)} className="text-xs h-7">{c}</Button>
        ))}
      </div>

      {/* Market cards */}
      {filtered.map(market => {
        const yesPct = yesOdds(market);
        const noPct = 100 - yesPct;
        const existing = myBets[market.id];
        const bet = bets[market.id] ?? { side: 'yes', amount: '' };

        return (
          <GlassCard key={market.id} className="p-5 space-y-4">
            {/* Header */}
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <Badge className={`text-xs ${CATEGORY_COLOR[market.category]}`}>{market.category}</Badge>
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Clock className="w-3 h-3" /> Ends {market.endsAt}
                  </span>
                </div>
                <p className="font-medium text-sm leading-snug">{market.question}</p>
              </div>
            </div>

            {/* Probability bar */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span className="flex items-center gap-1 text-emerald-400"><TrendingUp className="w-3 h-3" /> YES {yesPct}%</span>
                <span className="flex items-center gap-1 text-red-400">NO {noPct}% <TrendingDown className="w-3 h-3" /></span>
              </div>
              <div className="h-2 rounded-full overflow-hidden flex">
                <div className="bg-emerald-500 transition-all" style={{ width: `${yesPct}%` }} />
                <div className="bg-red-500 transition-all flex-1" />
              </div>
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Pool: {(market.yesPool / 1000).toFixed(1)}K GYDS</span>
                <span>Vol: {(market.volume / 1000).toFixed(0)}K GYDS</span>
                <span>Pool: {(market.noPool / 1000).toFixed(1)}K GYDS</span>
              </div>
            </div>

            {/* My existing bet */}
            {existing && (
              <div className={`p-2.5 rounded-lg text-xs flex justify-between items-center ${existing.side === 'yes' ? 'bg-emerald-500/10 border border-emerald-500/30' : 'bg-red-500/10 border border-red-500/30'}`}>
                <span>Your bet: <strong>{existing.amount} GYDS</strong> on {existing.side.toUpperCase()}</span>
                <span className="text-muted-foreground">Payout: <strong className="text-primary">{existing.payout} GYDS</strong></span>
              </div>
            )}

            {/* Bet form */}
            <div className="flex gap-2 flex-wrap items-end">
              <div className="flex-1 min-w-[120px]">
                <Label className="text-xs text-muted-foreground">Amount (GYDS)</Label>
                <Input
                  type="number" min="1" placeholder="100"
                  value={bet.amount}
                  onChange={e => setBets(prev => ({ ...prev, [market.id]: { ...bet, amount: e.target.value } }))}
                  className="mt-1 h-9 text-sm"
                />
              </div>
              <Button size="sm"
                className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1"
                onClick={() => placeBet(market, 'yes', bet.amount)}>
                <TrendingUp className="w-3 h-3" /> YES ({yesPct}%)
              </Button>
              <Button size="sm" variant="destructive" className="gap-1"
                onClick={() => placeBet(market, 'no', bet.amount)}>
                <TrendingDown className="w-3 h-3" /> NO ({noPct}%)
              </Button>
            </div>

            {bet.amount && parseFloat(bet.amount) > 0 && (
              <div className="text-xs text-muted-foreground flex gap-4">
                <span>YES payout: <strong className="text-emerald-400">{((parseFloat(bet.amount) / (yesPct / 100)) * 0.97).toFixed(2)} GYDS</strong></span>
                <span>NO payout: <strong className="text-red-400">{((parseFloat(bet.amount) / (noPct / 100)) * 0.97).toFixed(2)} GYDS</strong></span>
                <span className="text-muted-foreground/60">3% fee deducted</span>
              </div>
            )}
          </GlassCard>
        );
      })}

      <GlassCard className="p-4 text-xs text-muted-foreground space-y-1">
        <p className="font-medium text-foreground flex items-center gap-1.5"><Zap className="w-3 h-3 text-primary" /> How it works</p>
        <p>Prediction markets use an Automated Market Maker (AMM) — your payout depends on the pool size at resolution. A 3% platform fee is deducted. Markets resolve on the stated date via oracle consensus.</p>
      </GlassCard>
    </div>
  );
};
