import { useState, useMemo } from 'react';
import { GlassCard } from '@/components/ui/GlassCard';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import { TOKENOMICS } from '@/config/wallets';
import { MINING_REWARDS, MiningAlgorithm } from '@/lib/blockchain';
import { 
  Calculator, 
  Cpu, 
  MonitorPlay, 
  Zap, 
  DollarSign,
  TrendingUp,
  AlertTriangle
} from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';

interface HardwareSpecs {
  // CPU specs for RandomX
  cpuCores: number;
  cpuHashRate: number; // H/s
  cpuPower: number; // Watts
  
  // GPU specs for kHeavyHash
  gpuCount: number;
  gpuHashRate: number; // GH/s per GPU
  gpuPower: number; // Watts per GPU
}

interface CostSettings {
  electricityCost: number; // $/kWh
  poolFee: number; // %
  tokenPrice: number; // USD per token
}

interface ProfitResult {
  dailyReward: number;
  monthlyReward: number;
  yearlyReward: number;
  dailyPowerCost: number;
  monthlyPowerCost: number;
  yearlyPowerCost: number;
  dailyProfit: number;
  monthlyProfit: number;
  yearlyProfit: number;
  dailyProfitUSD: number;
  monthlyProfitUSD: number;
  yearlyProfitUSD: number;
  breakEvenDays: number;
  isProfitable: boolean;
}

export const ProfitabilityCalculator = () => {
  const [algorithm, setAlgorithm] = useState<MiningAlgorithm>('randomx');
  const [hardware, setHardware] = useState<HardwareSpecs>({
    cpuCores: 8,
    cpuHashRate: 5000, // 5 KH/s
    cpuPower: 95,
    gpuCount: 1,
    gpuHashRate: 500, // 500 GH/s
    gpuPower: 250,
  });
  const [costs, setCosts] = useState<CostSettings>({
    electricityCost: 0.10, // $0.10/kWh
    poolFee: 1.0,
    tokenPrice: TOKENOMICS.initialPrice,
  });

  const [hardwareCost, setHardwareCost] = useState(500); // Initial hardware investment

  const profit = useMemo<ProfitResult>(() => {
    const hoursPerDay = 24;
    const daysPerMonth = 30;
    const daysPerYear = 365;

    let dailyReward: number;
    let powerWatts: number;

    if (algorithm === 'randomx') {
      // RandomX: hashRate in H/s
      const hashRateKHs = hardware.cpuHashRate / 1000;
      dailyReward = hashRateKHs * MINING_REWARDS.randomx.referenceRates.dailyReward;
      powerWatts = hardware.cpuPower;
    } else {
      // kHeavyHash: hashRate in GH/s per GPU
      const totalGHs = hardware.gpuCount * hardware.gpuHashRate;
      dailyReward = (totalGHs / 1000) * MINING_REWARDS.kheavyhash.referenceRates.dailyReward;
      powerWatts = hardware.gpuCount * hardware.gpuPower;
    }

    // Apply pool fee
    dailyReward = dailyReward * (1 - costs.poolFee / 100);

    // Calculate power costs
    const dailyKWh = (powerWatts * hoursPerDay) / 1000;
    const dailyPowerCost = dailyKWh * costs.electricityCost;
    const monthlyPowerCost = dailyPowerCost * daysPerMonth;
    const yearlyPowerCost = dailyPowerCost * daysPerYear;

    // Calculate rewards
    const monthlyReward = dailyReward * daysPerMonth;
    const yearlyReward = dailyReward * daysPerYear;

    // Calculate profits
    const dailyProfitToken = dailyReward;
    const monthlyProfitToken = monthlyReward;
    const yearlyProfitToken = yearlyReward;

    const dailyProfitUSD = (dailyReward * costs.tokenPrice) - dailyPowerCost;
    const monthlyProfitUSD = (monthlyReward * costs.tokenPrice) - monthlyPowerCost;
    const yearlyProfitUSD = (yearlyReward * costs.tokenPrice) - yearlyPowerCost;

    // Break-even calculation
    const breakEvenDays = dailyProfitUSD > 0 
      ? Math.ceil(hardwareCost / dailyProfitUSD)
      : Infinity;

    return {
      dailyReward,
      monthlyReward,
      yearlyReward,
      dailyPowerCost,
      monthlyPowerCost,
      yearlyPowerCost,
      dailyProfit: dailyProfitToken,
      monthlyProfit: monthlyProfitToken,
      yearlyProfit: yearlyProfitToken,
      dailyProfitUSD,
      monthlyProfitUSD,
      yearlyProfitUSD,
      breakEvenDays,
      isProfitable: dailyProfitUSD > 0,
    };
  }, [algorithm, hardware, costs, hardwareCost]);

  return (
    <div className="space-y-6">
      <GlassCard>
        <div className="flex items-center gap-3 mb-6">
          <Calculator className="w-6 h-6 text-primary" />
          <div>
            <h3 className="font-semibold">Mining Profitability Calculator</h3>
            <p className="text-sm text-muted-foreground">
              Estimate your mining earnings based on hardware and electricity costs
            </p>
          </div>
        </div>

        <Tabs value={algorithm} onValueChange={(v) => setAlgorithm(v as MiningAlgorithm)}>
          <TabsList className="grid w-full grid-cols-2 mb-6">
            <TabsTrigger value="randomx" className="flex items-center gap-2">
              <Cpu className="w-4 h-4" />
              RandomX (CPU)
            </TabsTrigger>
            <TabsTrigger value="kheavyhash" className="flex items-center gap-2">
              <MonitorPlay className="w-4 h-4" />
              kHeavyHash (GPU)
            </TabsTrigger>
          </TabsList>

          <TabsContent value="randomx" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="cpuCores">CPU Cores</Label>
                <Input
                  id="cpuCores"
                  type="number"
                  value={hardware.cpuCores}
                  onChange={(e) => setHardware({ ...hardware, cpuCores: parseInt(e.target.value) || 0 })}
                  min={1}
                  max={128}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cpuHashRate">Hash Rate (H/s)</Label>
                <Input
                  id="cpuHashRate"
                  type="number"
                  value={hardware.cpuHashRate}
                  onChange={(e) => setHardware({ ...hardware, cpuHashRate: parseFloat(e.target.value) || 0 })}
                  min={0}
                />
                <p className="text-xs text-muted-foreground">
                  {(hardware.cpuHashRate / 1000).toFixed(2)} KH/s
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="cpuPower">Power Consumption (Watts)</Label>
                <Input
                  id="cpuPower"
                  type="number"
                  value={hardware.cpuPower}
                  onChange={(e) => setHardware({ ...hardware, cpuPower: parseFloat(e.target.value) || 0 })}
                  min={0}
                />
              </div>
            </div>
          </TabsContent>

          <TabsContent value="kheavyhash" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="gpuCount">Number of GPUs</Label>
                <Input
                  id="gpuCount"
                  type="number"
                  value={hardware.gpuCount}
                  onChange={(e) => setHardware({ ...hardware, gpuCount: parseInt(e.target.value) || 0 })}
                  min={1}
                  max={16}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="gpuHashRate">Hash Rate per GPU (GH/s)</Label>
                <Input
                  id="gpuHashRate"
                  type="number"
                  value={hardware.gpuHashRate}
                  onChange={(e) => setHardware({ ...hardware, gpuHashRate: parseFloat(e.target.value) || 0 })}
                  min={0}
                />
                <p className="text-xs text-muted-foreground">
                  Total: {(hardware.gpuCount * hardware.gpuHashRate).toFixed(0)} GH/s
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="gpuPower">Power per GPU (Watts)</Label>
                <Input
                  id="gpuPower"
                  type="number"
                  value={hardware.gpuPower}
                  onChange={(e) => setHardware({ ...hardware, gpuPower: parseFloat(e.target.value) || 0 })}
                  min={0}
                />
                <p className="text-xs text-muted-foreground">
                  Total: {(hardware.gpuCount * hardware.gpuPower).toFixed(0)}W
                </p>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </GlassCard>

      {/* Cost Settings */}
      <GlassCard>
        <h4 className="font-medium mb-4 flex items-center gap-2">
          <DollarSign className="w-5 h-5 text-neon-amber" />
          Cost Settings
        </h4>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label htmlFor="electricityCost">Electricity Cost ($/kWh)</Label>
            <Input
              id="electricityCost"
              type="number"
              step="0.01"
              value={costs.electricityCost}
              onChange={(e) => setCosts({ ...costs, electricityCost: parseFloat(e.target.value) || 0 })}
              min={0}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="poolFee">Pool Fee (%)</Label>
            <Input
              id="poolFee"
              type="number"
              step="0.1"
              value={costs.poolFee}
              onChange={(e) => setCosts({ ...costs, poolFee: parseFloat(e.target.value) || 0 })}
              min={0}
              max={10}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="tokenPrice">{TOKENOMICS.symbol} Price (USD)</Label>
            <Input
              id="tokenPrice"
              type="number"
              step="0.0000001"
              value={costs.tokenPrice}
              onChange={(e) => setCosts({ ...costs, tokenPrice: parseFloat(e.target.value) || 0 })}
              min={0}
            />
          </div>
        </div>

        <div className="mt-4 space-y-2">
          <Label>Hardware Investment ($)</Label>
          <div className="flex items-center gap-4">
            <Slider
              value={[hardwareCost]}
              onValueChange={([v]) => setHardwareCost(v)}
              min={100}
              max={10000}
              step={100}
              className="flex-1"
            />
            <span className="font-mono w-20 text-right">${hardwareCost}</span>
          </div>
        </div>
      </GlassCard>

      {/* Results */}
      <GlassCard className={profit.isProfitable ? 'border-neon-emerald/30' : 'border-neon-rose/30'}>
        <div className="flex items-center justify-between mb-4">
          <h4 className="font-medium flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-primary" />
            Estimated Earnings
          </h4>
          <Badge variant={profit.isProfitable ? 'default' : 'destructive'}>
            {profit.isProfitable ? 'PROFITABLE' : 'NOT PROFITABLE'}
          </Badge>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Daily */}
          <div className="p-4 rounded-lg bg-secondary/30 text-center">
            <p className="text-xs text-muted-foreground mb-2">Daily</p>
            <p className="text-lg font-bold font-mono text-neon-emerald">
              {profit.dailyReward.toFixed(10)}
            </p>
            <p className="text-xs text-muted-foreground">{TOKENOMICS.symbol}</p>
            <div className="mt-2 pt-2 border-t border-border/50">
              <p className="text-sm font-mono">
                <span className="text-muted-foreground">Power: </span>
                <span className="text-neon-rose">-${profit.dailyPowerCost.toFixed(4)}</span>
              </p>
              <p className={`text-sm font-mono font-bold ${profit.dailyProfitUSD >= 0 ? 'text-neon-emerald' : 'text-neon-rose'}`}>
                Net: ${profit.dailyProfitUSD.toFixed(6)}
              </p>
            </div>
          </div>

          {/* Monthly */}
          <div className="p-4 rounded-lg bg-secondary/30 text-center">
            <p className="text-xs text-muted-foreground mb-2">Monthly</p>
            <p className="text-lg font-bold font-mono text-neon-emerald">
              {profit.monthlyReward.toFixed(8)}
            </p>
            <p className="text-xs text-muted-foreground">{TOKENOMICS.symbol}</p>
            <div className="mt-2 pt-2 border-t border-border/50">
              <p className="text-sm font-mono">
                <span className="text-muted-foreground">Power: </span>
                <span className="text-neon-rose">-${profit.monthlyPowerCost.toFixed(2)}</span>
              </p>
              <p className={`text-sm font-mono font-bold ${profit.monthlyProfitUSD >= 0 ? 'text-neon-emerald' : 'text-neon-rose'}`}>
                Net: ${profit.monthlyProfitUSD.toFixed(4)}
              </p>
            </div>
          </div>

          {/* Yearly */}
          <div className="p-4 rounded-lg bg-secondary/30 text-center">
            <p className="text-xs text-muted-foreground mb-2">Yearly</p>
            <p className="text-lg font-bold font-mono text-neon-emerald">
              {profit.yearlyReward.toFixed(6)}
            </p>
            <p className="text-xs text-muted-foreground">{TOKENOMICS.symbol}</p>
            <div className="mt-2 pt-2 border-t border-border/50">
              <p className="text-sm font-mono">
                <span className="text-muted-foreground">Power: </span>
                <span className="text-neon-rose">-${profit.yearlyPowerCost.toFixed(2)}</span>
              </p>
              <p className={`text-sm font-mono font-bold ${profit.yearlyProfitUSD >= 0 ? 'text-neon-emerald' : 'text-neon-rose'}`}>
                Net: ${profit.yearlyProfitUSD.toFixed(2)}
              </p>
            </div>
          </div>
        </div>

        {/* Break-even */}
        <div className="mt-4 p-4 rounded-lg bg-primary/5 border border-primary/20">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Break-even Time</p>
              <p className="text-xs text-muted-foreground">
                Time to recover ${hardwareCost} hardware investment
              </p>
            </div>
            <div className="text-right">
              <p className="text-xl font-bold font-mono">
                {profit.breakEvenDays === Infinity 
                  ? 'Never' 
                  : `${profit.breakEvenDays} days`
                }
              </p>
              {profit.breakEvenDays !== Infinity && (
                <p className="text-xs text-muted-foreground">
                  ≈ {(profit.breakEvenDays / 30).toFixed(1)} months
                </p>
              )}
            </div>
          </div>
        </div>

        {!profit.isProfitable && (
          <div className="mt-4 flex items-start gap-2 p-3 rounded-lg bg-destructive/10 text-destructive">
            <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <p className="text-sm">
              At current settings, mining is not profitable. Consider reducing electricity costs, 
              increasing hash rate, or waiting for {TOKENOMICS.symbol} price appreciation.
            </p>
          </div>
        )}
      </GlassCard>
    </div>
  );
};
