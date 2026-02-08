import { useState } from 'react';
import { Button } from '@/components/ui/button';
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
  BarChart3
} from 'lucide-react';
import { cn } from '@/lib/utils';

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

  // Default mock position
  const pos = position || {
    tokenA: { symbol: 'NETGY' },
    tokenB: { symbol: 'BRGC' },
    balance: 9.07,
    pendingYield: 0.14,
    priceRatio: 11720.903,
    rangeMin: 0,
    rangeMax: Infinity,
    address: '5n2K...VjsQ',
    fee: '1.000%',
  };

  const priceProgress = 75; // Mock: current price position in range

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

        <TabsContent value="deposit" className="pt-4">
          <GlassCard className="p-6">
            <p className="text-center text-muted-foreground">
              Deposit liquidity to increase your position
            </p>
            {/* Add deposit form here */}
          </GlassCard>
        </TabsContent>

        <TabsContent value="withdraw" className="pt-4">
          <GlassCard className="p-6">
            <p className="text-center text-muted-foreground">
              Withdraw liquidity from your position
            </p>
            {/* Add withdraw form here */}
          </GlassCard>
        </TabsContent>
      </Tabs>
    </div>
  );
};
