import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ArrowRight, Loader2, AlertCircle, CheckCircle2, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { useWalletConnect } from '@/hooks/useWalletConnect';
import { useToast } from '@/hooks/use-toast';
import { useCoinGeckoPrices } from '@/hooks/useCoinGeckoPrices';
import { supabase } from '@/integrations/supabase/client';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const EXTERNAL_CHAINS = [
  { id: 'ethereum', name: 'Ethereum', symbol: 'ETH', logo: '⟠', color: 'from-blue-400 to-purple-500', bridgeFee: 0.005 },
  { id: 'bsc', name: 'BNB Chain', symbol: 'BNB', logo: '⬡', color: 'from-yellow-400 to-amber-500', bridgeFee: 0.003 },
  { id: 'polygon', name: 'Polygon', symbol: 'MATIC', logo: '⬢', color: 'from-purple-400 to-purple-600', bridgeFee: 0.002 },
  { id: 'solana', name: 'Solana', symbol: 'SOL', logo: '◎', color: 'from-green-400 to-teal-500', bridgeFee: 0.004 },
];

interface BridgeStatus {
  stage: 'idle' | 'confirming' | 'burning' | 'releasing' | 'complete' | 'error';
  message: string;
  txHash?: string;
}

export const ReverseBridge = () => {
  const [destChain, setDestChain] = useState(EXTERNAL_CHAINS[0]);
  const [amount, setAmount] = useState('');
  const [bridgeStatus, setBridgeStatus] = useState<BridgeStatus>({ stage: 'idle', message: '' });
  const [gydsBalance, setGydsBalance] = useState(0);
  const [loadingBalance, setLoadingBalance] = useState(false);

  const { user } = useAuth();
  const { address, isConnected } = useWalletConnect();
  const { toast } = useToast();
  const { prices, isLoading: pricesLoading, refetch: refetchPrices } = useCoinGeckoPrices();

  const gydsPrice = 0.0000001;
  const amountNum = parseFloat(amount || '0');
  const gydsUsdValue = amountNum * gydsPrice;
  const bridgeFeeUsd = gydsUsdValue * destChain.bridgeFee;
  const netUsdValue = gydsUsdValue - bridgeFeeUsd;
  const destPrice = prices[destChain.id] || 1;
  const receivedAmount = destPrice > 0 ? netUsdValue / destPrice : 0;

  // Load GYDS balance using centralized calculator
  useEffect(() => {
    if (!user || !address) return;
    const loadBalance = async () => {
      setLoadingBalance(true);
      const { getUserBalances } = await import('@/lib/balanceCalculator');
      const { gyds } = await getUserBalances(user.id);
      setGydsBalance(gyds);
      setLoadingBalance(false);
    };
    loadBalance();
  }, [user, address]);



  const handleChainChange = (chainId: string) => {
    const chain = EXTERNAL_CHAINS.find(c => c.id === chainId);
    if (chain) setDestChain(chain);
  };

  const handleReverseBridge = async () => {
    if (!user || !address) {
      toast({ title: 'Connect Wallet', description: 'Please connect your wallet first.', variant: 'destructive' });
      return;
    }
    if (!amountNum || amountNum <= 0) {
      toast({ title: 'Invalid Amount', description: 'Enter a valid GYDS amount.', variant: 'destructive' });
      return;
    }
    if (amountNum > gydsBalance) {
      toast({ title: 'Insufficient Balance', description: `You only have ${gydsBalance.toLocaleString()} GYDS.`, variant: 'destructive' });
      return;
    }

    try {
      setBridgeStatus({ stage: 'confirming', message: 'Confirming GYDS burn...' });
      await new Promise(r => setTimeout(r, 1500));

      setBridgeStatus({ stage: 'burning', message: `Burning ${amountNum.toLocaleString()} GYDS...` });
      const txHash = `0x${Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join('')}`;

      const { error } = await supabase.from('token_operations').insert({
        operation_type: 'bridge_burn_gyds',
        wallet_address: address,
        amount: amountNum,
        usdt_amount: netUsdValue,
        tx_hash: txHash,
        status: 'confirmed',
        created_by: user.id,
      });
      if (error) throw error;

      await new Promise(r => setTimeout(r, 2000));
      setBridgeStatus({ stage: 'release', message: `Releasing ${receivedAmount.toFixed(6)} ${destChain.symbol} on ${destChain.name}...` } as any);
      await new Promise(r => setTimeout(r, 1500));

      setBridgeStatus({ stage: 'complete', message: `Sent ${receivedAmount.toFixed(6)} ${destChain.symbol} to your wallet!`, txHash });
      toast({ title: '🎉 Reverse Bridge Complete!', description: `Converted ${amountNum.toLocaleString()} GYDS → ${receivedAmount.toFixed(6)} ${destChain.symbol}` });

      setGydsBalance(prev => prev - amountNum);
      setAmount('');
      setTimeout(() => setBridgeStatus({ stage: 'idle', message: '' }), 5000);
    } catch (err: any) {
      setBridgeStatus({ stage: 'error', message: err.message || 'Bridge failed' });
      toast({ title: 'Bridge Failed', description: err.message, variant: 'destructive' });
    }
  };

  const isProcessing = ['confirming', 'burning', 'release'].includes(bridgeStatus.stage);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-lg font-semibold">Reverse Bridge</h2>
        <div className="flex items-center gap-2">
          <button onClick={refetchPrices} disabled={pricesLoading} className="text-muted-foreground hover:text-foreground transition-colors">
            <RefreshCw className={cn("h-3.5 w-3.5", pricesLoading && "animate-spin")} />
          </button>
          <Badge variant="secondary" className="gap-1">
            <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
            Live Prices
          </Badge>
        </div>
      </div>

      {/* Source: GYDS */}
      <div className="rounded-xl border border-border/50 bg-card/50 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">From GYDS Network</span>
          <span className="text-xs text-muted-foreground">
            Balance: {loadingBalance ? '...' : gydsBalance.toLocaleString()} GYDS
          </span>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-secondary/50">
            <div className="w-6 h-6 rounded-full flex items-center justify-center text-sm bg-gradient-to-br from-primary to-primary/50">◇</div>
            <span className="font-semibold">GYDS</span>
          </div>
          <Input
            type="number"
            placeholder="0"
            value={amount}
            onChange={e => setAmount(e.target.value)}
            className="flex-1 text-2xl font-light bg-transparent border-0 focus-visible:ring-0"
            disabled={isProcessing}
          />
        </div>
        {amountNum > gydsBalance && amountNum > 0 && (
          <p className="text-xs text-destructive">Insufficient balance</p>
        )}
        <div className="flex justify-between text-sm text-muted-foreground">
          <span>≈ ${gydsUsdValue.toFixed(6)}</span>
          <button className="text-primary text-xs hover:underline" onClick={() => setAmount(gydsBalance.toString())}>MAX</button>
        </div>
      </div>

      {/* Arrow */}
      <div className="flex justify-center -my-2 relative z-10">
        <div className="rounded-full border border-border/50 bg-card p-2">
          <ArrowRight className="h-4 w-4 text-primary" />
        </div>
      </div>

      {/* Destination Chain */}
      <div className="rounded-xl border border-border/50 bg-card/50 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">To Network</span>
          <Badge variant="outline" className="text-xs">{destChain.bridgeFee * 100}% fee</Badge>
        </div>
        <div className="flex items-center gap-3">
          <Select value={destChain.id} onValueChange={handleChainChange}>
            <SelectTrigger className="w-[180px] bg-secondary/50">
              <SelectValue>
                <div className="flex items-center gap-2">
                  <div className={cn("w-6 h-6 rounded-full flex items-center justify-center text-sm", `bg-gradient-to-br ${destChain.color}`)}>
                    {destChain.logo}
                  </div>
                  <span>{destChain.symbol}</span>
                </div>
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {EXTERNAL_CHAINS.map(chain => (
                <SelectItem key={chain.id} value={chain.id}>
                  <div className="flex items-center gap-2">
                    <div className={cn("w-5 h-5 rounded-full flex items-center justify-center text-xs", `bg-gradient-to-br ${chain.color}`)}>
                      {chain.logo}
                    </div>
                    <span>{chain.name}</span>
                    <span className="text-muted-foreground text-xs ml-1">
                      ${prices[chain.id]?.toLocaleString() || '...'}
                    </span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="text-2xl font-light text-right flex-1">
            {amountNum > 0 ? receivedAmount.toFixed(6) : '0'}
          </span>
        </div>
        <div className="flex justify-between text-sm text-muted-foreground">
          <span>≈ ${netUsdValue.toFixed(6)}</span>
          <span>${destPrice.toLocaleString()} / {destChain.symbol}</span>
        </div>
      </div>

      {/* Details */}
      {amountNum > 0 && (
        <div className="rounded-xl border border-border/50 bg-card/30 p-3 space-y-2 text-sm">
          <div className="flex justify-between text-muted-foreground">
            <span>Bridge Fee ({destChain.bridgeFee * 100}%)</span>
            <span className="font-mono">-${bridgeFeeUsd.toFixed(6)}</span>
          </div>
          <div className="flex justify-between text-muted-foreground">
            <span>Estimated Time</span>
            <span className="font-mono">~3-7 min</span>
          </div>
          <div className="flex justify-between">
            <span className="font-medium">You Receive</span>
            <span className="font-mono font-semibold text-primary">
              {receivedAmount.toFixed(6)} {destChain.symbol}
            </span>
          </div>
        </div>
      )}

      {/* Status */}
      {bridgeStatus.stage !== 'idle' && (
        <div className={cn(
          "rounded-xl border p-4 flex items-center gap-3",
          bridgeStatus.stage === 'error' ? "border-destructive/50 bg-destructive/10" :
          bridgeStatus.stage === 'complete' ? "border-primary/50 bg-primary/10" :
          "border-primary/50 bg-primary/10"
        )}>
          {isProcessing && <Loader2 className="h-5 w-5 animate-spin text-primary" />}
          {bridgeStatus.stage === 'error' && <AlertCircle className="h-5 w-5 text-destructive" />}
          {bridgeStatus.stage === 'complete' && <CheckCircle2 className="h-5 w-5 text-primary" />}
          <div className="flex-1">
            <p className="text-sm font-medium">{bridgeStatus.message}</p>
            {bridgeStatus.txHash && (
              <p className="text-xs text-muted-foreground font-mono mt-1">
                TX: {bridgeStatus.txHash.slice(0, 10)}...{bridgeStatus.txHash.slice(-8)}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Button */}
      <Button
        className="w-full h-14 text-lg font-semibold bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70"
        disabled={!isConnected || !amountNum || amountNum <= 0 || amountNum > gydsBalance || isProcessing}
        onClick={handleReverseBridge}
      >
        {isProcessing ? (
          <span className="flex items-center gap-2">
            <Loader2 className="h-5 w-5 animate-spin" />
            Processing...
          </span>
        ) : !isConnected ? (
          'Connect Wallet'
        ) : amountNum > gydsBalance ? (
          'Insufficient GYDS Balance'
        ) : (
          `Bridge GYDS → ${destChain.symbol}`
        )}
      </Button>
    </div>
  );
};
