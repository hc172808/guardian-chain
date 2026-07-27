import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { GlassCard } from '@/components/ui/GlassCard';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  HelpCircle, Wallet, ArrowLeftRight, ChevronDown, ChevronUp,
  Loader2, Users, TrendingUp, RefreshCw, Zap,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { useWalletConnect } from '@/hooks/useWalletConnect';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { getUserAddresses, computeUserBalances } from '@/lib/balances';
import {
  getFarmPools,
  executeFarmDeposit,
  executeFarmWithdraw,
  executeFarmHarvest,
} from '@/lib/swapContract';

interface StakingStats {
  totalStaked: number;
  totalStakedUsd: number;
  stakers: number;
  stakes24h: number;
  apr: number;
  exchangeRate: number;
  buybacks24h: number;
  updatedAt: string;
}

const FALLBACK_STATS: StakingStats = {
  totalStaked: 0,
  totalStakedUsd: 0,
  stakers: 0,
  stakes24h: 0,
  apr: 18.5,
  exchangeRate: 1.0,
  buybacks24h: 0,
  updatedAt: new Date().toISOString(),
};

export const StakeInterface = () => {
  const [stakeAmount, setStakeAmount] = useState('');
  const [unstakeAmount, setUnstakeAmount] = useState('');
  const [showDetails, setShowDetails] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [userBalance, setUserBalance] = useState(0);
  const [userStaked, setUserStaked] = useState(0);
  const [stats, setStats] = useState<StakingStats>(FALLBACK_STATS);
  const [loadingStats, setLoadingStats] = useState(true);
  const { user } = useAuth();
  const { address, isConnected } = useWalletConnect();
  const { toast } = useToast();
  // Allow staking with DB wallet when no browser wallet is connected
  const effectiveAddress = address || user?.walletAddress || null;

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch('/api/staking/stats');
      if (res.ok) {
        const data = await res.json();
        setStats(data);
      }
    } catch {
      // keep fallback
    } finally {
      setLoadingStats(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
    const id = setInterval(fetchStats, 30_000);
    return () => clearInterval(id);
  }, [fetchStats]);

  useEffect(() => {
    const loadBalances = async () => {
      if (!user) return;
      const myAddresses = await getUserAddresses(user.id, address ?? undefined, user.email ?? undefined);
      const { gydBalance } = await computeUserBalances(user.id, myAddresses);
      const { data: txData } = await supabase
        .from('transactions')
        .select('from_address, to_address, amount')
        .eq('user_id', user.id)
        .eq('status', 'confirmed');
      let staked = 0;
      if (txData) {
        txData.forEach((tx) => {
          const fromMe = myAddresses.has(tx.from_address.toLowerCase());
          const toMe = myAddresses.has(tx.to_address.toLowerCase());
          if (tx.to_address === 'staking-pool' && fromMe) staked += tx.amount;
          if (tx.from_address === 'staking-pool' && toMe) staked -= tx.amount;
        });
      }
      setUserStaked(Math.max(0, staked));
      setUserBalance(Math.max(0, gydBalance));
    };
    loadBalances();
    const channel = supabase
      .channel('stake-balances')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'transactions' }, () => loadBalances())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'token_operations' }, () => loadBalances())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, address]);

  const { apr, exchangeRate, totalStaked, stakers, buybacks24h } = stats;
  const userXgyd = userStaked > 0 ? userStaked / exchangeRate : 0;
  const stakeReceive = parseFloat(stakeAmount || '0') / exchangeRate;
  const unstakeReceive = parseFloat(unstakeAmount || '0') * exchangeRate;

  const executeStake = async (type: 'stake' | 'unstake') => {
    if (!user || !effectiveAddress) {
      toast({ title: 'Login Required', description: 'Sign in first.', variant: 'destructive' });
      return;
    }
    const amount = parseFloat(type === 'stake' ? stakeAmount : unstakeAmount);
    if (!amount || amount <= 0) return;

    if (type === 'stake' && amount > userBalance) {
      toast({ title: 'Insufficient Balance', description: `You only have ${userBalance.toFixed(4)} GYD available.`, variant: 'destructive' });
      return;
    }
    if (type === 'unstake' && amount > userXgyd) {
      toast({ title: 'Insufficient xGYD', description: `You only have ${userXgyd.toFixed(4)} xGYD staked.`, variant: 'destructive' });
      return;
    }

    setIsProcessing(true);
    try {
      // Try on-chain Farm contract first (if deployed)
      const pools = await getFarmPools();
      if (pools.length > 0) {
        const pid = 0;
        const wei = BigInt(Math.floor(amount * 1e18)).toString();
        let txHash: string | null = null;
        if (type === 'stake') {
          txHash = await executeFarmDeposit(pid, wei);
        } else {
          txHash = await executeFarmWithdraw(pid, wei);
        }
        if (txHash) {
          toast({ title: type === 'stake' ? '🔒 Staked on-chain' : '🔓 Unstaked on-chain', description: `TX: ${txHash.slice(0, 20)}…` });
          type === 'stake' ? setStakeAmount('') : setUnstakeAmount('');
          setIsProcessing(false);
          return;
        }
      }

      // Fallback: record in DB via API
      const res = await fetch('/api/transactions', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from_address: type === 'stake' ? effectiveAddress : 'staking-pool',
          to_address:   type === 'stake' ? 'staking-pool' : effectiveAddress,
          amount,
          fee: 0,
          token_symbol: type === 'stake' ? 'GYD' : 'xGYD',
          status: 'confirmed',
          tx_hash: `sim-${type}-${Date.now()}`,
          network: 'testnet',
        }),
      });
      if (!res.ok) {
        const { error } = await res.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(error ?? 'Failed to record stake transaction');
      }

      toast({
        title: type === 'stake' ? '🔒 Staked Successfully' : '🔓 Unstaked Successfully',
        description: `${amount.toFixed(4)} ${type === 'stake' ? 'GYD → xGYD' : 'xGYD → GYD'}`,
      });
      type === 'stake' ? setStakeAmount('') : setUnstakeAmount('');
      fetchStats();
    } catch (e: any) {
      toast({ title: 'Transaction Failed', description: e.message, variant: 'destructive' });
    } finally {
      setIsProcessing(false);
    }
  };

  const StatCard = ({ label, value, sub }: { label: string; value: string; sub?: string }) => (
    <div className="text-center">
      {loadingStats
        ? <div className="h-6 w-20 mx-auto bg-muted/30 animate-pulse rounded mb-1" />
        : <p className="text-lg font-bold text-foreground">{value}</p>
      }
      <p className="text-xs text-muted-foreground">{label}</p>
      {sub && <p className="text-[10px] text-muted-foreground/60">{sub}</p>}
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Stats bar */}
      <GlassCard className="p-4">
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 divide-x divide-border/30">
          <StatCard label="APR" value={`${apr.toFixed(2)}%`} />
          <StatCard
            label="Total Staked"
            value={totalStaked >= 1e6
              ? `${(totalStaked / 1e6).toFixed(2)}M GYDS`
              : totalStaked >= 1e3
              ? `${(totalStaked / 1e3).toFixed(1)}K GYDS`
              : `${totalStaked.toFixed(0)} GYDS`}
          />
          <StatCard label="Stakers" value={stakers.toLocaleString()} />
          <StatCard label="Exchange Rate" value={`1 GYD = ${exchangeRate.toFixed(4)} xGYD`} />
          <StatCard
            label="24h Buybacks"
            value={buybacks24h >= 1000
              ? `$${(buybacks24h / 1000).toFixed(1)}K`
              : `$${buybacks24h.toFixed(2)}`}
          />
        </div>
        <div className="flex justify-end mt-2">
          <button
            onClick={fetchStats}
            className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
          >
            <RefreshCw className={cn('w-3 h-3', loadingStats && 'animate-spin')} />
            Refresh
          </button>
        </div>
      </GlassCard>

      {/* Stake / Unstake tabs */}
      <div className="space-y-3">
        <Tabs defaultValue="stake">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="stake">Stake GYD</TabsTrigger>
            <TabsTrigger value="unstake">Unstake xGYD</TabsTrigger>
          </TabsList>

          {/* STAKE TAB */}
          <TabsContent value="stake" className="space-y-3 mt-4">
            <GlassCard className="p-4">
              <div className="flex items-center justify-between gap-3">
                <Input
                  type="number"
                  placeholder="0"
                  value={stakeAmount}
                  onChange={(e) => setStakeAmount(e.target.value)}
                  className="border-0 bg-transparent text-3xl font-light p-0 h-auto focus-visible:ring-0 placeholder:text-muted-foreground/50"
                />
                <Button variant="secondary" className="gap-2 rounded-lg px-4 py-2 h-auto shrink-0">
                  <div className="w-6 h-6 rounded-full bg-gradient-to-br from-primary to-primary/50 flex items-center justify-center text-xs font-bold">
                    G
                  </div>
                  <span className="font-semibold">GYD</span>
                </Button>
              </div>
              <div className="flex items-center justify-between text-sm text-muted-foreground mt-2">
                <span className="text-xs">{parseFloat(stakeAmount || '0') > 0 ? `≈ ${stakeReceive.toFixed(4)} xGYD` : ''}</span>
                <div className="flex items-center gap-2">
                  <Wallet className="h-3 w-3" />
                  <span>{userBalance.toFixed(4)} GYD</span>
                  <button
                    className="text-primary text-xs hover:underline"
                    onClick={() => setStakeAmount(String(userBalance))}
                  >
                    Max
                  </button>
                </div>
              </div>
            </GlassCard>

            {/* Arrow */}
            <div className="flex justify-center">
              <div className="w-8 h-8 rounded-full bg-muted/30 flex items-center justify-center">
                <ArrowLeftRight className="w-4 h-4 text-muted-foreground rotate-90" />
              </div>
            </div>

            {/* You receive */}
            <GlassCard className="p-4">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground text-sm">You Receive ~</span>
                <div className="flex items-center gap-2">
                  <div className="w-5 h-5 rounded-full bg-gradient-to-br from-amber-500 to-amber-600 flex items-center justify-center text-xs font-bold text-black">
                    x
                  </div>
                  <span className="font-semibold">{stakeReceive.toFixed(4)} xGYD</span>
                </div>
              </div>
            </GlassCard>

            <Button
              className="w-full h-14 text-lg font-semibold"
              disabled={isProcessing || !stakeAmount || parseFloat(stakeAmount) <= 0 || !user || !effectiveAddress}
              onClick={() => executeStake('stake')}
            >
              {isProcessing
                ? <span className="flex items-center gap-2"><Loader2 className="h-5 w-5 animate-spin" /> Staking...</span>
                : !user ? 'Sign In to Stake' : 'Stake GYD'}
            </Button>
          </TabsContent>

          {/* UNSTAKE TAB */}
          <TabsContent value="unstake" className="space-y-3 mt-4">
            <GlassCard className="p-4">
              <div className="flex items-center justify-between gap-3">
                <Input
                  type="number"
                  placeholder="0"
                  value={unstakeAmount}
                  onChange={(e) => setUnstakeAmount(e.target.value)}
                  className="border-0 bg-transparent text-3xl font-light p-0 h-auto focus-visible:ring-0 placeholder:text-muted-foreground/50"
                />
                <Button variant="secondary" className="gap-2 rounded-lg px-4 py-2 h-auto shrink-0">
                  <div className="w-6 h-6 rounded-full bg-gradient-to-br from-amber-500 to-amber-600 flex items-center justify-center text-xs font-bold text-black">
                    x
                  </div>
                  <span className="font-semibold">xGYD</span>
                </Button>
              </div>
              <div className="flex items-center justify-between text-sm text-muted-foreground mt-2">
                <span className="text-xs">{parseFloat(unstakeAmount || '0') > 0 ? `≈ ${unstakeReceive.toFixed(4)} GYD` : ''}</span>
                <div className="flex items-center gap-2">
                  <Wallet className="h-3 w-3" />
                  <span>{userXgyd.toFixed(4)} xGYD</span>
                  <button
                    className="text-primary text-xs hover:underline"
                    onClick={() => setUnstakeAmount(String(userXgyd))}
                  >
                    Max
                  </button>
                </div>
              </div>
            </GlassCard>

            <div className="flex justify-center">
              <div className="w-8 h-8 rounded-full bg-muted/30 flex items-center justify-center">
                <ArrowLeftRight className="w-4 h-4 text-muted-foreground rotate-90" />
              </div>
            </div>

            <GlassCard className="p-4">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground text-sm">You Receive ~</span>
                <div className="flex items-center gap-2">
                  <div className="w-5 h-5 rounded-full bg-gradient-to-br from-primary to-primary/50 flex items-center justify-center text-xs font-bold">
                    G
                  </div>
                  <span className="font-semibold">{unstakeReceive.toFixed(4)} GYD</span>
                </div>
              </div>
            </GlassCard>

            <Button
              className="w-full h-14 text-lg font-semibold bg-amber-600/80 hover:bg-amber-600 text-foreground"
              disabled={isProcessing || !unstakeAmount || parseFloat(unstakeAmount) <= 0 || !user || !effectiveAddress}
              onClick={() => executeStake('unstake')}
            >
              {isProcessing
                ? <span className="flex items-center gap-2"><Loader2 className="h-5 w-5 animate-spin" /> Unstaking...</span>
                : !user ? 'Sign In to Unstake' : 'Unstake xGYD'}
            </Button>
          </TabsContent>
        </Tabs>

        {/* Details toggle */}
        <GlassCard className="p-4">
          <button
            onClick={() => setShowDetails(!showDetails)}
            className="flex items-center justify-between w-full text-sm"
          >
            <span className="font-medium flex items-center gap-2">
              <Zap className="w-4 h-4 text-primary" /> Staking Details
            </span>
            {showDetails ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
          </button>
          {showDetails && (
            <div className="mt-3 space-y-2 text-sm">
              {[
                ['Protocol', 'GYDSchain Native Staking'],
                ['Token In',  'GYD (Governance Token)'],
                ['Token Out', 'xGYD (Staked Receipt)'],
                ['APR', `${apr.toFixed(2)}% (dynamic)`],
                ['Exchange Rate', `1 GYD = ${exchangeRate.toFixed(6)} xGYD`],
                ['Unstake Delay', 'Instant (no lock-up)'],
                ['Rewards', 'Protocol fees + validator rewards'],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between">
                  <span className="text-muted-foreground">{k}</span>
                  <span className="font-medium">{v}</span>
                </div>
              ))}
            </div>
          )}
        </GlassCard>
      </div>
    </div>
  );
};
