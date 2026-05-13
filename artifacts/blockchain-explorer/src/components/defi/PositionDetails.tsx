import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { GlassCard } from '@/components/ui/GlassCard';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Slider } from '@/components/ui/slider';
import { 
  Sprout, 
  Bell, 
  ArrowLeftRight, 
  ChevronDown, 
  Copy, 
  ExternalLink,
  BarChart3,
  Wallet,
  Loader2,
  AlertTriangle
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { useWalletConnect } from '@/hooks/useWalletConnect';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface PositionDetailsProps {
  position?: {
    tokenA: { symbol: string };
    tokenB: { symbol: string };
    balance: number;
    pendingYield: number;
    priceRatio: number;
    rangeMin: number;
    rangeMax: number;
    address: string;
    fee: string;
  };
}

export const PositionDetails = ({ position }: PositionDetailsProps) => {
  const [yieldPeriod, setYieldPeriod] = useState<'24H' | '7D' | '30D'>('24H');
  const [depositAmountA, setDepositAmountA] = useState('');
  const [depositAmountB, setDepositAmountB] = useState('');
  const [withdrawPercent, setWithdrawPercent] = useState([50]);
  const [isProcessing, setIsProcessing] = useState(false);
  const { user } = useAuth();
  const { address, isConnected } = useWalletConnect();
  const { toast } = useToast();

  // Default empty position when none provided
  const pos = position || {
    tokenA: { symbol: 'TOKEN_A' },
    tokenB: { symbol: 'TOKEN_B' },
    balance: 0,
    pendingYield: 0,
    priceRatio: 0,
    rangeMin: 0,
    rangeMax: Infinity,
    address: '—',
    fee: '0.000%',
  };

  const priceProgress = 0;

  return (
    <div className="space-y-6">
      {/* Tabs Header */}
      <Tabs defaultValue="details">
        <TabsList className="w-full bg-transparent border-b border-border rounded-none p-0 h-auto">
          <TabsTrigger 
            value="details" 
            className="flex-1 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent pb-3"
          >
            Details
          </TabsTrigger>
          <TabsTrigger 
            value="deposit" 
            className="flex-1 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent pb-3"
          >
            Deposit
          </TabsTrigger>
          <TabsTrigger 
            value="withdraw" 
            className="flex-1 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent pb-3"
          >
            Withdraw
          </TabsTrigger>
          <Button variant="ghost" size="icon" className="text-muted-foreground">
            <Bell className="h-5 w-5" />
          </Button>
        </TabsList>

        <TabsContent value="details" className="space-y-6 pt-4">
          {/* Adaptive Fees Banner */}
          <GlassCard className="p-3 bg-secondary/30">
            <div className="flex items-center justify-center gap-2 text-sm">
              <BarChart3 className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium">Adaptive Fees Enabled!</span>
            </div>
            <p className="text-center text-sm text-muted-foreground">
              Earning <span className="underline">{pos.fee}</span> from trading fees.
            </p>
          </GlassCard>

          {/* Balance & Yield */}
          <div className="grid grid-cols-2 gap-4">
            <GlassCard className="p-4">
              <p className="text-sm text-muted-foreground mb-1">Balance</p>
              <p className="text-2xl font-bold">${pos.balance.toFixed(2)}</p>
            </GlassCard>
            <GlassCard className="p-4">
              <div className="flex items-center justify-between mb-1">
                <p className="text-sm text-muted-foreground">Estimated Yield</p>
                <Badge variant="secondary" className="gap-1 text-xs">
                  <Sprout className="h-3 w-3" />
                  {yieldPeriod}
                </Badge>
              </div>
              <p className="text-2xl font-bold">-</p>
            </GlassCard>
          </div>

          <GlassCard className="p-4 flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground mb-1">Pending Yield</p>
              <p className="text-2xl font-bold">${pos.pendingYield.toFixed(2)}</p>
            </div>
            <Button className="gap-2 bg-primary/20 text-primary hover:bg-primary/30 border border-primary/50">
              <Sprout className="h-4 w-4" />
              Harvest Yield
            </Button>
          </GlassCard>

          {/* Position Price */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Your Position</h3>
              <Button variant="ghost" size="sm" className="gap-1 text-muted-foreground">
                <ArrowLeftRight className="h-4 w-4" />
                {pos.tokenA.symbol} per {pos.tokenB.symbol}
              </Button>
            </div>

            <GlassCard className="p-4 space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Current Price</span>
                <span className="font-mono font-semibold">
                  {pos.priceRatio.toFixed(3)} <span className="text-muted-foreground">{pos.tokenA.symbol} per {pos.tokenB.symbol}</span>
                </span>
              </div>

              {/* Price Range Slider */}
              <div className="space-y-2">
                <div className="relative pt-6">
                  <Slider
                    value={[priceProgress]}
                    max={100}
                    step={1}
                    disabled
                    className="[&_[role=slider]]:hidden"
                  />
                  <div 
                    className="absolute top-0 w-3 h-3 rounded-full bg-primary border-2 border-background"
                    style={{ left: `${priceProgress}%`, transform: 'translateX(-50%)' }}
                  />
                </div>
                <div className="flex items-center justify-between text-sm text-primary font-mono">
                  <span>{pos.rangeMin}</span>
                  <span>∞</span>
                </div>
              </div>
            </GlassCard>
          </div>

          {/* Position Stats */}
          <div className="space-y-3">
            <div className="flex items-center justify-between py-2">
              <span className="text-muted-foreground">Position Range</span>
              <span className="font-medium">{pos.rangeMin} — ∞ (Full Range)</span>
            </div>
            <div className="flex items-center justify-between py-2">
              <span className="text-muted-foreground">Balance</span>
              <Button variant="ghost" size="sm" className="gap-1 h-auto p-0 font-medium">
                ${pos.balance.toFixed(2)}
                <ChevronDown className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex items-center justify-between py-2">
              <span className="text-muted-foreground">Pending Yield</span>
              <Button variant="ghost" size="sm" className="gap-1 h-auto p-0 font-medium">
                ${pos.pendingYield.toFixed(2)}
                <ChevronDown className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex items-center justify-between py-2">
              <span className="text-muted-foreground underline">Position Address</span>
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="font-mono gap-1">
                  {pos.address}
                  <Copy className="h-3 w-3" />
                </Badge>
                <Button variant="ghost" size="icon" className="h-6 w-6">
                  <ExternalLink className="h-3 w-3" />
                </Button>
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="deposit" className="pt-4 space-y-4">
          <GlassCard className="p-4 space-y-3">
            <p className="text-sm text-muted-foreground">Deposit {pos.tokenA.symbol}</p>
            <div className="flex items-center justify-between gap-4">
              <Input
                type="number"
                placeholder="0"
                value={depositAmountA}
                onChange={(e) => setDepositAmountA(e.target.value)}
                className="border-0 bg-transparent text-2xl font-light p-0 h-auto focus-visible:ring-0 placeholder:text-muted-foreground/50"
              />
              <Badge variant="secondary" className="font-semibold px-3 py-1">{pos.tokenA.symbol}</Badge>
            </div>
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>${(parseFloat(depositAmountA || '0') * 86.8).toFixed(2)}</span>
              <div className="flex items-center gap-1">
                <Wallet className="h-3 w-3" />
                <span>0.0000</span>
                <span className="text-primary cursor-pointer hover:underline" onClick={() => setDepositAmountA('0')}>Max</span>
              </div>
            </div>
          </GlassCard>

          <GlassCard className="p-4 space-y-3">
            <p className="text-sm text-muted-foreground">Deposit {pos.tokenB.symbol}</p>
            <div className="flex items-center justify-between gap-4">
              <Input
                type="number"
                placeholder="0"
                value={depositAmountB}
                onChange={(e) => setDepositAmountB(e.target.value)}
                className="border-0 bg-transparent text-2xl font-light p-0 h-auto focus-visible:ring-0 placeholder:text-muted-foreground/50"
              />
              <Badge variant="secondary" className="font-semibold px-3 py-1">{pos.tokenB.symbol}</Badge>
            </div>
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>${(parseFloat(depositAmountB || '0') * 1).toFixed(2)}</span>
              <div className="flex items-center gap-1">
                <Wallet className="h-3 w-3" />
                <span>0.0000</span>
                <span className="text-primary cursor-pointer hover:underline" onClick={() => setDepositAmountB('0')}>Max</span>
              </div>
            </div>
          </GlassCard>

          <GlassCard className="p-3 space-y-1 text-sm">
            <div className="flex justify-between text-muted-foreground">
              <span>Estimated Share</span>
              <span className="font-mono">~0.01%</span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>Fee Tier</span>
              <span className="font-mono">{pos.fee}</span>
            </div>
          </GlassCard>

          <Button
            className="w-full h-14 text-lg font-semibold bg-amber-600/80 hover:bg-amber-600 text-foreground"
            disabled={isProcessing || (!depositAmountA && !depositAmountB) || !isConnected}
            onClick={async () => {
              if (!user || !address) return;
              setIsProcessing(true);
              try {
                const amount = parseFloat(depositAmountA || '0') + parseFloat(depositAmountB || '0');
                const txHash = `0x${Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join('')}`;
                const { error } = await supabase.from('transactions').insert({
                  user_id: user.id, from_address: address, to_address: 'liquidity-pool',
                  amount, fee: amount * 0.001, tx_hash: txHash, status: 'confirmed',
                  confirmed_at: new Date().toISOString(), wallet_id: null,
                });
                if (error) throw error;
                toast({ title: 'Deposit Successful', description: `Added liquidity to ${pos.tokenA.symbol}/${pos.tokenB.symbol}` });
                setDepositAmountA(''); setDepositAmountB('');
              } catch (err: any) {
                toast({ title: 'Deposit Failed', description: err.message, variant: 'destructive' });
              } finally { setIsProcessing(false); }
            }}
          >
            {isProcessing ? <span className="flex items-center gap-2"><Loader2 className="h-5 w-5 animate-spin" /> Depositing...</span>
              : !isConnected ? 'Connect Wallet' : 'Deposit Liquidity'}
          </Button>
        </TabsContent>

        <TabsContent value="withdraw" className="pt-4 space-y-4">
          <GlassCard className="p-4 space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Withdraw Amount</span>
              <span className="font-semibold text-lg">{withdrawPercent[0]}%</span>
            </div>
            <Slider value={withdrawPercent} onValueChange={setWithdrawPercent} max={100} step={1} />
            <div className="flex gap-2">
              {[25, 50, 75, 100].map(v => (
                <Button key={v} variant={withdrawPercent[0] === v ? 'secondary' : 'ghost'} size="sm" className="flex-1"
                  onClick={() => setWithdrawPercent([v])}>{v}%</Button>
              ))}
            </div>
          </GlassCard>

          <GlassCard className="p-4 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">You Receive ({pos.tokenA.symbol})</span>
              <span className="font-mono">{((pos.balance * withdrawPercent[0] / 100) / 2).toFixed(4)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">You Receive ({pos.tokenB.symbol})</span>
              <span className="font-mono">{((pos.balance * withdrawPercent[0] / 100) / 2).toFixed(4)}</span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>Withdrawal Fee</span>
              <span className="font-mono">0.1%</span>
            </div>
          </GlassCard>

          {withdrawPercent[0] === 100 && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-sm text-amber-400">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>Withdrawing 100% will close this position.</span>
            </div>
          )}

          <Button
            className="w-full h-14 text-lg font-semibold bg-amber-600/80 hover:bg-amber-600 text-foreground"
            disabled={isProcessing || withdrawPercent[0] === 0 || !isConnected}
            onClick={async () => {
              if (!user || !address) return;
              setIsProcessing(true);
              try {
                const amount = pos.balance * withdrawPercent[0] / 100;
                const txHash = `0x${Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join('')}`;
                const { error } = await supabase.from('transactions').insert({
                  user_id: user.id, from_address: 'liquidity-pool', to_address: address,
                  amount, fee: amount * 0.001, tx_hash: txHash, status: 'confirmed',
                  confirmed_at: new Date().toISOString(), wallet_id: null,
                });
                if (error) throw error;
                toast({ title: 'Withdrawal Successful', description: `Removed ${withdrawPercent[0]}% liquidity from ${pos.tokenA.symbol}/${pos.tokenB.symbol}` });
                setWithdrawPercent([50]);
              } catch (err: any) {
                toast({ title: 'Withdrawal Failed', description: err.message, variant: 'destructive' });
              } finally { setIsProcessing(false); }
            }}
          >
            {isProcessing ? <span className="flex items-center gap-2"><Loader2 className="h-5 w-5 animate-spin" /> Withdrawing...</span>
              : !isConnected ? 'Connect Wallet' : `Withdraw ${withdrawPercent[0]}%`}
          </Button>
        </TabsContent>
      </Tabs>
    </div>
  );
};
