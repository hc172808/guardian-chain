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

  // Load user's balance and staked amount from transactions
  useEffect(() => {
    const loadBalances = async () => {
      if (!user || !address) return;
      
      // Get user wallets for address matching
      const { data: userWallets } = await supabase
        .from('wallets')
        .select('address')
        .eq('user_id', user.id);

      const myAddresses = new Set((userWallets || []).map(w => w.address.toLowerCase()));
      myAddresses.add(address.toLowerCase());

      // Check founder wallet
      const { data: founderConfig } = await supabase
        .from('admin_config')
        .select('config_value')
        .eq('config_key', 'founder_wallet')
        .maybeSingle();

      if (founderConfig?.config_value) {
        const fc = founderConfig.config_value as Record<string, string>;
        if (fc.address) myAddresses.add(fc.address.toLowerCase());
      }

      if (user.email === 'netlifegy@gmail.com') {
        myAddresses.add('0x0000000000000000000000000000000000000001');
      }

      // Get GYD balance from token_operations (mints/burns)
      const { data: opsData } = await supabase
        .from('token_operations')
        .select('*')
        .eq('status', 'confirmed');

      let gydFromOps = 0;
      if (opsData) {
        opsData.forEach(op => {
          const addressMatch = myAddresses.has(op.wallet_address.toLowerCase());
          const creatorMatch = op.created_by === user.id;
          if (!addressMatch && !creatorMatch) return;
          if (op.operation_type === 'mint_gyd' || op.operation_type === 'premine_gyd') {
            gydFromOps += op.amount;
          } else if (op.operation_type === 'burn_gyd') {
            gydFromOps -= op.amount;
          }
        });
      }

      // Get transaction-based balance
      const { data: txData } = await supabase
        .from('transactions')
        .select('from_address, to_address, amount, fee')
        .eq('user_id', user.id)
        .eq('status', 'confirmed');
      
      let staked = 0;
      let gydFromTx = 0;
      
      if (txData) {
        txData.forEach(tx => {
          const fromMe = myAddresses.has(tx.from_address.toLowerCase());
          const toMe = myAddresses.has(tx.to_address.toLowerCase());
          
          // Track staking deposits
          if (tx.to_address === 'staking-pool' && fromMe) {
            staked += tx.amount;
          }
          // Track unstaking withdrawals
          if (tx.from_address === 'staking-pool' && toMe) {
            staked -= tx.amount;
          }
          // Track general balance
          if (toMe && tx.to_address !== 'staking-pool') {
            gydFromTx += tx.amount;
          }
          if (fromMe) {
            gydFromTx -= tx.amount + (tx.fee || 0);
          }
        });
      }
      
      setUserStaked(Math.max(0, staked));
      setUserBalance(Math.max(0, gydFromOps + gydFromTx));
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
    try {
      const txHash = `0x${Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join('')}`;
      const { error } = await supabase.from('transactions').insert({
        user_id: user.id,
        from_address: type === 'stake' ? address : 'staking-pool',
        to_address: type === 'stake' ? 'staking-pool' : address,
        amount,
        fee: amount * 0.001,
        tx_hash: txHash,
        status: 'confirmed',
        confirmed_at: new Date().toISOString(),
        wallet_id: null,
      });
      if (error) throw error;
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
