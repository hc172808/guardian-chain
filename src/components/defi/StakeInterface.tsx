import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { GlassCard } from '@/components/ui/GlassCard';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { HelpCircle, Wallet, ArrowLeftRight, ChevronDown, ChevronUp, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { useWalletConnect } from '@/hooks/useWalletConnect';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { getUserAddresses, computeUserBalances } from '@/lib/balances';
import { getFarmPools, getUserFarmInfo, executeFarmDeposit, executeFarmWithdraw, executeFarmHarvest } from '@/lib/swapContract';

export const StakeInterface = () => {
  const [stakeAmount, setStakeAmount] = useState('');
  const [unstakeAmount, setUnstakeAmount] = useState('');
  const [showDetails, setShowDetails] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [userBalance, setUserBalance] = useState(0);
  const [userStaked, setUserStaked] = useState(0);
  const { user } = useAuth();
  const { address, isConnected } = useWalletConnect();
  const { toast } = useToast();

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

  const executeStake = async (type: 'stake' | 'unstake') => {
    if (!user || !address) {
      toast({ title: 'Login Required', description: 'Connect your wallet first.', variant: 'destructive' });
      return;
    }
    const amount = parseFloat(type === 'stake' ? stakeAmount : unstakeAmount);
    if (!amount || amount <= 0) return;

    if (type === 'stake' && amount > userBalance) {
      toast({ title: 'Insufficient Balance', description: `You only have ${userBalance.toFixed(4)} GYD available.`, variant: 'destructive' });
      return;
    }
    if (type === 'unstake' && amount > userStaked / exchangeRate) {
      toast({ title: 'Insufficient xGYD', description: `You only have ${(userStaked / exchangeRate).toFixed(4)} xGYD staked.`, variant: 'destructive' });
      return;
    }

    setIsProcessing(true);

    // Try on-chain Farm contract first (if deployed)
    try {
      const pools = await getFarmPools();
      if (pools.length > 0) {
        const pid = 0; // GYD pool is pid 0
        const wei = BigInt(Math.floor(amount * 1e18)).toString();
        let txHash: string | null = null;

        if (type === 'stake') {
          txHash = await executeFarmDeposit(pid, wei);
        } else {
          txHash = await executeFarmWithdraw(pid, wei);
        }

        if (txHash) {
          toast({
            title: type === 'stake' ? 'Staked On-Chain!' : 'Unstaked On-Chain!',
            description: `Tx: ${txHash.slice(0, 14)}...\n${type === 'stake' ? amount : amount * exchangeRate} ${type === 'stake' ? 'GYD' : 'GYD'} ${type === 'stake' ? 'staked' : 'unstaked'}.`,
          });
          if (type === 'stake') setStakeAmount(''); else setUnstakeAmount('');
          setIsProcessing(false);
          return;
        }
      }
    } catch {
      // Farm contract not deployed or call failed — fall through to mempool simulation
    }

    // Fallback: mempool simulation (until contracts are deployed)
    try {
      const { submitTransaction } = await import('@/lib/mempool');
      await submitTransaction({
        userId: user.id,
        fromAddress: type === 'stake' ? address : 'staking-pool',
        toAddress: type === 'stake' ? 'staking-pool' : address,
        amount,
        fee: amount * 0.001,
      });
      toast({
        title: type === 'stake' ? 'Staked Successfully!' : 'Unstaked Successfully!',
        description: type === 'stake'
          ? `Staked ${amount} GYD → ${(amount / exchangeRate).toFixed(4)} xGYD`
          : `Unstaked ${amount} xGYD → ${(amount * exchangeRate).toFixed(4)} GYD`,
      });
      if (type === 'stake') setStakeAmount(''); else setUnstakeAmount('');
    } catch (err: any) {
      toast({ title: 'Transaction Failed', description: err.message, variant: 'destructive' });
    } finally { setIsProcessing(false); }
  };

  const apr = 74.87;
  const stakedTotal = 7439000;
  const buybacks24h = 12400;
  const exchangeRate = 1.3626;

  const receiveAmount = parseFloat(stakeAmount || '0') / exchangeRate;
  const unstakeReceive = parseFloat(unstakeAmount || '0') * exchangeRate;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Stake</h1>
          <p className="text-muted-foreground">
            Liquid stake your GYD to receive xGYD and earn rewards funded by protocol fees.
          </p>
        </div>
        <Button variant="ghost" className="gap-1 text-muted-foreground">
          How it Works
          <HelpCircle className="h-4 w-4" />
        </Button>
      </div>

      {/* APR Card */}
      <GlassCard className="p-4">
        <div className="flex items-center justify-between mb-4">
          <span className="text-lg font-medium">xGYD Earning</span>
          <Badge className="bg-primary/20 text-primary text-lg px-4 py-1 gap-1">
            {apr}% APR
            <HelpCircle className="h-4 w-4" />
          </Badge>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="text-center">
            <p className="text-sm text-muted-foreground mb-1">Staked GYD</p>
            <p className="text-2xl font-bold">
              {(stakedTotal / 1e6).toFixed(3)}m
            </p>
          </div>
          <div className="text-center">
            <p className="text-sm text-muted-foreground mb-1 flex items-center justify-center gap-1">
              24h Buybacks
              <HelpCircle className="h-3 w-3" />
            </p>
            <div className="flex items-center justify-center gap-2">
              <span className="text-2xl font-bold">{(buybacks24h / 1000).toFixed(1)}k</span>
              <div className="w-6 h-6 rounded-full bg-gradient-to-br from-primary to-primary/50 flex items-center justify-center text-xs font-bold">
                G
              </div>
            </div>
          </div>
        </div>
      </GlassCard>

      {/* Stake/Unstake Tabs */}
      <Tabs defaultValue="stake" className="space-y-6">
        <TabsList className="w-full bg-secondary/50 p-1">
          <TabsTrigger value="stake" className="flex-1">
            Stake
          </TabsTrigger>
          <TabsTrigger value="unstake" className="flex-1">
            Unstake
          </TabsTrigger>
        </TabsList>

        <TabsContent value="stake" className="space-y-4">
          {/* Stake Input */}
          <GlassCard className="p-4 space-y-3">
            <div className="flex items-center justify-between gap-4">
              <Input
                type="number"
                placeholder="0"
                value={stakeAmount}
                onChange={(e) => setStakeAmount(e.target.value)}
                className="border-0 bg-transparent text-3xl font-light p-0 h-auto focus-visible:ring-0 placeholder:text-muted-foreground/50"
              />
              <Button variant="secondary" className="gap-2 rounded-lg px-4 py-2 h-auto">
                <div className="w-6 h-6 rounded-full bg-gradient-to-br from-primary to-primary/50 flex items-center justify-center text-xs font-bold">
                  G
                </div>
                <span className="font-semibold">GYD</span>
              </Button>
            </div>
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>${(parseFloat(stakeAmount || '0') * 86.8).toFixed(2)}</span>
              <div className="flex items-center gap-2">
                <Wallet className="h-3 w-3" />
                <span>{userBalance}</span>
                <span className="text-primary cursor-pointer hover:underline">| Max</span>
              </div>
            </div>
          </GlassCard>

          {/* You Receive */}
          <GlassCard className="p-4">
            <div 
              className="flex items-center justify-between cursor-pointer"
              onClick={() => setShowDetails(!showDetails)}
            >
              <span className="text-muted-foreground">You Receive ~</span>
              <div className="flex items-center gap-2">
                <div className="w-5 h-5 rounded-full bg-gradient-to-br from-amber-500 to-amber-600 flex items-center justify-center text-xs font-bold text-black">
                  x
                </div>
                <span className="font-semibold">{receiveAmount.toFixed(4)} xGYD</span>
                {showDetails ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </div>
            </div>
            {showDetails && (
              <div className="mt-4 pt-4 border-t border-border/50">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground underline">Staking Exchange Rate</span>
                  <div className="flex items-center gap-2 text-sm">
                    <span>1 xGYD ≈ {exchangeRate} GYD</span>
                    <ArrowLeftRight className="h-4 w-4" />
                  </div>
                </div>
              </div>
            )}
          </GlassCard>

          {/* Stake Button */}
          <Button
            className="w-full h-14 text-lg font-semibold bg-amber-600/80 hover:bg-amber-600 text-foreground"
            disabled={isProcessing || !stakeAmount || parseFloat(stakeAmount) <= 0 || !isConnected}
            onClick={() => executeStake('stake')}
          >
            {isProcessing ? <span className="flex items-center gap-2"><Loader2 className="h-5 w-5 animate-spin" /> Staking...</span>
              : !isConnected ? 'Connect Wallet' : 'Stake'}
          </Button>
        </TabsContent>

        <TabsContent value="unstake" className="space-y-4">
          {/* Unstake Input */}
          <GlassCard className="p-4 space-y-3">
            <div className="flex items-center justify-between gap-4">
              <Input
                type="number"
                placeholder="0"
                value={unstakeAmount}
                onChange={(e) => setUnstakeAmount(e.target.value)}
                className="border-0 bg-transparent text-3xl font-light p-0 h-auto focus-visible:ring-0 placeholder:text-muted-foreground/50"
              />
              <Button variant="secondary" className="gap-2 rounded-lg px-4 py-2 h-auto">
                <div className="w-6 h-6 rounded-full bg-gradient-to-br from-amber-500 to-amber-600 flex items-center justify-center text-xs font-bold text-black">
                  x
                </div>
                <span className="font-semibold">xGYD</span>
              </Button>
            </div>
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>${(parseFloat(unstakeAmount || '0') * 86.8 * exchangeRate).toFixed(2)}</span>
              <div className="flex items-center gap-2">
                <Wallet className="h-3 w-3" />
                <span>{userStaked}</span>
                <span className="text-primary cursor-pointer hover:underline">| Max</span>
              </div>
            </div>
          </GlassCard>

          {/* You Receive */}
          <GlassCard className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">You Receive ~</span>
              <div className="flex items-center gap-2">
                <div className="w-5 h-5 rounded-full bg-gradient-to-br from-primary to-primary/50 flex items-center justify-center text-xs font-bold">
                  G
                </div>
                <span className="font-semibold">{unstakeReceive.toFixed(4)} GYD</span>
              </div>
            </div>
          </GlassCard>

          {/* Unstake Button */}
          <Button
            className="w-full h-14 text-lg font-semibold bg-amber-600/80 hover:bg-amber-600 text-foreground"
            disabled={isProcessing || !unstakeAmount || parseFloat(unstakeAmount) <= 0 || !isConnected}
            onClick={() => executeStake('unstake')}
          >
            {isProcessing ? <span className="flex items-center gap-2"><Loader2 className="h-5 w-5 animate-spin" /> Unstaking...</span>
              : !isConnected ? 'Connect Wallet' : 'Unstake'}
          </Button>
        </TabsContent>
      </Tabs>
    </div>
  );
};
