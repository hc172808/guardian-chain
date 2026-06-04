import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { GlassCard } from '@/components/ui/GlassCard';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Wallet, Loader2, TrendingUp } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useWalletConnect } from '@/hooks/useWalletConnect';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface Launch {
  id: string;
  name: string;
  symbol: string;
  initial_price: number;
  bonding_curve_type: string;
  bonding_curve_steepness: number;
  raised_amount: number;
  target_raise: number;
  participants: number;
}

interface ContributeModalProps {
  launch: Launch;
  onBack: () => void;
}

export const ContributeModal = ({ launch, onBack }: ContributeModalProps) => {
  const [amount, setAmount] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { user } = useAuth();
  const { address, isConnected } = useWalletConnect();
  const { toast } = useToast();

  const gydsAmount = parseFloat(amount || '0');

  // Calculate tokens received based on bonding curve
  const calcTokens = (gyds: number): number => {
    if (gyds <= 0) return 0;
    const { initial_price, bonding_curve_type, bonding_curve_steepness, raised_amount } = launch;
    const currentSupply = raised_amount / initial_price;
    switch (bonding_curve_type) {
      case 'exponential':
        return gyds / (initial_price * Math.pow(bonding_curve_steepness, currentSupply / 1000));
      case 'sqrt':
        return gyds / (initial_price + bonding_curve_steepness * Math.sqrt(currentSupply));
      default: // linear
        return gyds / (initial_price + bonding_curve_steepness * currentSupply / 1000);
    }
  };

  const tokensReceived = calcTokens(gydsAmount);
  const pricePerToken = gydsAmount > 0 ? gydsAmount / tokensReceived : launch.initial_price;
  const progress = launch.target_raise > 0 ? ((launch.raised_amount + gydsAmount) / launch.target_raise) * 100 : 0;

  const handleContribute = async () => {
    if (!user || !address) {
      toast({ title: 'Login Required', description: 'Connect your wallet to contribute.', variant: 'destructive' });
      return;
    }
    if (gydsAmount <= 0) return;

    setIsSubmitting(true);
    try {
      const { submitTransaction } = await import('@/lib/mempool');
      await submitTransaction({
        userId: user.id,
        fromAddress: address,
        toAddress: `launch:${launch.id}`,
        amount: gydsAmount,
        fee: gydsAmount * 0.001,
      });

      // Update launch raised amount and participants
      const { error: updateError } = await supabase
        .from('token_launches')
        .update({
          raised_amount: launch.raised_amount + gydsAmount,
          participants: launch.participants + 1,
        })
        .eq('id', launch.id);
      if (updateError) throw updateError;

      toast({
        title: 'Contribution Successful!',
        description: `You contributed ${gydsAmount} GYDS and will receive ~${tokensReceived.toFixed(2)} ${launch.symbol}`,
      });
      onBack();
    } catch (err: any) {
      toast({ title: 'Contribution Failed', description: err.message, variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={onBack}><ArrowLeft className="h-5 w-5" /></Button>
        <div>
          <h1 className="text-xl font-bold">Buy {launch.symbol}</h1>
          <p className="text-sm text-muted-foreground">{launch.name} · {launch.bonding_curve_type} curve</p>
        </div>
      </div>

      {/* Progress */}
      <GlassCard className="p-4 space-y-3">
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Raised</span>
          <span className="font-medium">${launch.raised_amount.toLocaleString()} / ${launch.target_raise.toLocaleString()}</span>
        </div>
        <div className="h-2 bg-secondary rounded-full overflow-hidden">
          <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${Math.min(100, progress)}%` }} />
        </div>
        <div className="flex justify-between text-sm text-muted-foreground">
          <span>{launch.participants} participants</span>
          <span>{Math.min(100, progress).toFixed(1)}%</span>
        </div>
      </GlassCard>

      {/* Amount Input */}
      <GlassCard className="p-4 space-y-3">
        <span className="text-sm text-muted-foreground">You Pay (GYDS)</span>
        <div className="flex items-center justify-between gap-4">
          <Input
            type="number"
            placeholder="0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="border-0 bg-transparent text-3xl font-light p-0 h-auto focus-visible:ring-0 placeholder:text-muted-foreground/50"
          />
          <Badge variant="secondary" className="gap-2 px-4 py-2 text-base">
            <div className="w-5 h-5 rounded-full bg-gradient-to-br from-primary to-primary/50 flex items-center justify-center text-xs font-bold">G</div>
            GYDS
          </Badge>
        </div>
      </GlassCard>

      {/* You Receive */}
      <GlassCard className="p-4 space-y-3">
        <span className="text-sm text-muted-foreground">You Receive (est.)</span>
        <div className="flex items-center justify-between">
          <span className="text-2xl font-light">{tokensReceived.toFixed(2)}</span>
          <Badge variant="secondary" className="gap-2 px-4 py-2 text-base">
            <div className="w-5 h-5 rounded-full bg-gradient-to-br from-amber-500 to-amber-600 flex items-center justify-center text-xs font-bold text-black">
              {launch.symbol[0]}
            </div>
            {launch.symbol}
          </Badge>
        </div>
      </GlassCard>

      {/* Price Info */}
      {gydsAmount > 0 && (
        <div className="rounded-xl border border-border/50 bg-card/30 p-3 space-y-2 text-sm">
          <div className="flex justify-between text-muted-foreground">
            <span>Price per token</span>
            <span className="font-mono">{pricePerToken.toFixed(6)} GYDS</span>
          </div>
          <div className="flex justify-between text-muted-foreground">
            <span>Curve type</span>
            <span className="capitalize">{launch.bonding_curve_type}</span>
          </div>
          <div className="flex justify-between text-muted-foreground">
            <span>Fee (0.1%)</span>
            <span className="font-mono">{(gydsAmount * 0.001).toFixed(4)} GYDS</span>
          </div>
        </div>
      )}

      <Button
        className="w-full h-14 text-lg font-semibold bg-amber-600/80 hover:bg-amber-600 text-foreground"
        disabled={!isConnected || gydsAmount <= 0 || isSubmitting}
        onClick={handleContribute}
      >
        {isSubmitting ? (
          <span className="flex items-center gap-2"><Loader2 className="h-5 w-5 animate-spin" /> Contributing...</span>
        ) : !isConnected ? (
          'Connect Wallet'
        ) : (
          <span className="flex items-center gap-2"><TrendingUp className="h-5 w-5" /> Buy {launch.symbol}</span>
        )}
      </Button>
    </div>
  );
};
