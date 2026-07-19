import { useState, useEffect } from 'react';
import { GlassCard } from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { TrendingUp, TrendingDown, Clock, Trophy, BarChart3, Zap, Target, AlertCircle, CheckCircle2, XCircle } from 'lucide-react';

interface Market {
  id: string;
  question: string;
  category: string;
  yes_pool: number;
  no_pool: number;
  volume: number;
  ends_at: string;
  resolved: boolean;
  outcome?: boolean;
}

interface Bet {
  id: string;
  market_id: string;
  side: 'yes' | 'no';
  amount: number;
  payout: number;
  status: 'pending' | 'won' | 'lost';
  question: string;
}

const CATEGORY_COLOR: Record<string, string> = {
  Price: 'bg-primary/20 text-primary border-primary/30',
  Network: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  DeFi: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
};

export const PredictionMarkets = () => {
  const { toast } = useToast();
  const [markets, setMarkets] = useState<Market[]>([]);
  const [myBets, setMyBets] = useState<Bet[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterCat, setFilterCat] = useState('All');
  const [betAmounts, setBetAmounts] = useState<Record<string, string>>({});
  const [isLoggedIn, setIsLoggedIn] = useState(true); // Mock auth state

  const fetchMarkets = async () => {
    try {
      const res = await fetch('/api/predict/markets');
      const data = await res.json();
      setMarkets(data);
    } catch (err) {
      console.error('Failed to fetch markets', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchBets = async () => {
    if (!isLoggedIn) return;
    try {
      const res = await fetch('/api/predict/bets');
      const data = await res.json();
      setMyBets(data);
    } catch (err) {
      console.error('Failed to fetch bets', err);
    }
  };

  useEffect(() => {
    fetchMarkets();
    fetchBets();
    const interval = setInterval(fetchMarkets, 20000);
    return () => clearInterval(interval);
  }, [isLoggedIn]);

  const placeBet = async (marketId: string, side: 'yes' | 'no') => {
    if (!isLoggedIn) {
      toast({ title: 'Sign in to bet', variant: 'destructive' });
      return;
    }
    const amountStr = betAmounts[marketId];
    const amount = parseFloat(amountStr);
    if (!amount || amount <= 0) {
      toast({ title: 'Enter a valid amount', variant: 'destructive' });
      return;
    }

    try {
      const res = await fetch('/api/predict/bets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ marketId, side, amount }),
      });
      const data = await res.json();
      toast({
        title: `Bet placed — ${side.toUpperCase()}`,
        description: `Potential payout: ${data.payout} GYDS`,
      });
      setBetAmounts(prev => ({ ...prev, [marketId]: '' }));
      fetchMarkets();
      fetchBets();
    } catch (err) {
      toast({ title: 'Failed to place bet', variant: 'destructive' });
    }
  };

  const categories = ['All', ...Array.from(new Set(markets.map(m => m.category)))];
  const filteredMarkets = filterCat === 'All' ? markets : markets.filter(m => m.category === filterCat);

  const getOdds = (market: Market) => {
    const total = market.yes_pool + market.no_pool;
    if (total === 0) return { yes: 50, no: 50 };
    const yes = Math.round((market.yes_pool / total) * 100);
    return { yes, no: 100 - yes };
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 w-full rounded-xl" />
        <Skeleton className="h-10 w-48" />
        {[1, 2].map(i => <Skeleton key={i} className="h-64 w-full rounded-xl" />)}
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-4">
      <GlassCard className="p-4 grid grid-cols-3 gap-3 text-center">
        {[
          { label: 'Open Markets', value: markets.filter(m => !m.resolved).length, icon: Target },
          { label: 'Total Volume', value: `$${(markets.reduce((a, m) => a + m.volume, 0) / 1e6).toFixed(2)}M`, icon: BarChart3 },
          { label: 'Your Bets', value: myBets.length, icon: Trophy },
        ].map(({ label, value, icon: Icon }) => (
          <div key={label}>
            <Icon className="w-4 h-4 mx-auto mb-1 text-primary" />
            <p className="font-bold text-sm">{value}</p>
            <p className="text-xs text-muted-foreground">{label}</p>
          </div>
        ))}
      </GlassCard>

      <Tabs defaultValue="markets" className="w-full">
        <TabsList className="grid w-full grid-cols-2 mb-4">
          <TabsTrigger value="markets">Markets</TabsTrigger>
          <TabsTrigger value="portfolio">Your Bets ({myBets.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="markets" className="space-y-4">
          <div className="flex gap-2 flex-wrap">
            {categories.map(c => (
              <Button key={c} size="sm" variant={filterCat === c ? 'default' : 'outline'}
                onClick={() => setFilterCat(c)} className="text-xs h-7">{c}</Button>
            ))}
          </div>

          {filteredMarkets.map(market => {
            const { yes, no } = getOdds(market);
            const amount = betAmounts[market.id] || '';

            return (
              <GlassCard key={market.id} className="p-5 space-y-4 relative overflow-hidden">
                {market.resolved && (
                  <div className="absolute top-2 right-2 z-10">
                    <Badge variant={market.outcome ? "default" : "destructive"} className="gap-1">
                      {market.outcome ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                      {market.outcome ? "YES wins ✅" : "NO wins ❌"}
                    </Badge>
                  </div>
                )}
                
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <Badge className={`text-xs ${CATEGORY_COLOR[market.category]}`}>{market.category}</Badge>
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Clock className="w-3 h-3" /> {market.resolved ? 'Ended' : `Ends ${market.ends_at}`}
                      </span>
                    </div>
                    <p className="font-medium text-sm leading-snug">{market.question}</p>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span className="flex items-center gap-1 text-emerald-400"><TrendingUp className="w-3 h-3" /> YES {yes}%</span>
                    <span className="flex items-center gap-1 text-red-400">NO {no}% <TrendingDown className="w-3 h-3" /></span>
                  </div>
                  <Progress value={yes} className="h-2" />
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Pool: {(market.yes_pool / 1000).toFixed(1)}K GYDS</span>
                    <span>Vol: {(market.volume / 1000).toFixed(0)}K GYDS</span>
                    <span>Pool: {(market.no_pool / 1000).toFixed(1)}K GYDS</span>
                  </div>
                </div>

                {!market.resolved && (
                  <div className="space-y-3">
                    <div className="flex gap-2 items-end">
                      <div className="flex-1">
                        <Label className="text-xs text-muted-foreground">Amount (GYDS)</Label>
                        <Input
                          type="number" placeholder="100" value={amount}
                          disabled={!isLoggedIn}
                          onChange={e => setBetAmounts(p => ({ ...p, [market.id]: e.target.value }))}
                          className="mt-1 h-9 text-sm"
                        />
                      </div>
                      <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1"
                        onClick={() => placeBet(market.id, 'yes')}>
                        YES ({yes}%)
                      </Button>
                      <Button size="sm" variant="destructive" className="gap-1"
                        onClick={() => placeBet(market.id, 'no')}>
                        NO ({no}%)
                      </Button>
                    </div>
                    {!isLoggedIn && (
                      <p className="text-[10px] text-amber-400 flex items-center gap-1">
                        <AlertCircle className="w-3 h-3" /> Sign in to place bets
                      </p>
                    )}
                  </div>
                )}
              </GlassCard>
            );
          })}
        </TabsContent>

        <TabsContent value="portfolio" className="space-y-3">
          {myBets.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground border border-dashed rounded-xl">
              No active bets found.
            </div>
          ) : (
            myBets.map(bet => (
              <GlassCard key={bet.id} className="p-4 flex flex-col gap-2">
                <div className="flex justify-between items-start">
                  <p className="text-sm font-medium flex-1">{bet.question}</p>
                  <Badge variant={bet.status === 'won' ? 'default' : bet.status === 'lost' ? 'destructive' : 'outline'} className="capitalize">
                    {bet.status}
                  </Badge>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Side: <strong className={bet.side === 'yes' ? 'text-emerald-400' : 'text-red-400'}>{bet.side.toUpperCase()}</strong></span>
                  <span className="text-muted-foreground">Amount: <strong>{bet.amount} GYDS</strong></span>
                  <span className="text-muted-foreground">Potential: <strong className="text-primary">{bet.payout} GYDS</strong></span>
                </div>
              </GlassCard>
            ))
          )}
        </TabsContent>
      </Tabs>

      <GlassCard className="p-4 text-xs text-muted-foreground space-y-1">
        <p className="font-medium text-foreground flex items-center gap-1.5"><Zap className="w-3 h-3 text-primary" /> How it works</p>
        <p>Prediction markets use an Automated Market Maker (AMM) — your payout depends on the pool size at resolution. A 3% platform fee is deducted. Markets resolve via oracle consensus.</p>
      </GlassCard>
    </div>
  );
};