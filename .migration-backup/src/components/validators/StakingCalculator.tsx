import { useState, useEffect } from 'react';
import { GlassCard } from '@/components/ui/GlassCard';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Calculator, TrendingUp, Coins, Percent } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface Validator {
  id: string;
  name: string | null;
  address: string;
  commission: number;
  stake: number;
  is_active: boolean;
}

interface Props {
  validators: Validator[];
}

const BASE_APY = 12; // Base network APY %

export const StakingCalculator = ({ validators }: Props) => {
  const [amount, setAmount] = useState('10000');
  const [selectedValidator, setSelectedValidator] = useState('');
  const [lockMonths, setLockMonths] = useState([6]);

  const activeValidators = validators.filter(v => v.is_active);
  const validator = activeValidators.find(v => v.id === selectedValidator);
  const commission = validator?.commission ?? 10;

  const delegateAmount = parseFloat(amount) || 0;
  const effectiveAPY = BASE_APY * (1 - commission / 100);
  const lockBonus = lockMonths[0] >= 12 ? 1.5 : lockMonths[0] >= 6 ? 1.2 : 1.0;
  const finalAPY = effectiveAPY * lockBonus;

  const dailyReward = (delegateAmount * finalAPY / 100) / 365;
  const monthlyReward = dailyReward * 30;
  const yearlyReward = delegateAmount * finalAPY / 100;
  const afterLock = delegateAmount + (yearlyReward * lockMonths[0] / 12);

  return (
    <GlassCard className="p-5">
      <h3 className="font-semibold flex items-center gap-2 mb-4">
        <Calculator className="h-5 w-5 text-primary" />
        Staking Rewards Calculator
      </h3>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Delegation Amount (GYDS)</Label>
            <Input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="10000"
              min="0"
            />
          </div>

          <div className="space-y-2">
            <Label>Validator</Label>
            <Select value={selectedValidator} onValueChange={setSelectedValidator}>
              <SelectTrigger>
                <SelectValue placeholder="Select validator" />
              </SelectTrigger>
              <SelectContent>
                {activeValidators.map((v) => (
                  <SelectItem key={v.id} value={v.id}>
                    {v.name || v.address.slice(0, 10) + '...'} ({v.commission}% commission)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Lock Period: {lockMonths[0]} months</Label>
            <Slider
              value={lockMonths}
              onValueChange={setLockMonths}
              min={1}
              max={24}
              step={1}
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>1 mo</span>
              <span>6 mo (1.2x)</span>
              <span>12 mo (1.5x)</span>
              <span>24 mo</span>
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <div className="p-3 rounded-lg bg-secondary/30 flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Percent className="h-4 w-4" />
              Base APY
            </div>
            <span className="font-mono font-bold">{BASE_APY}%</span>
          </div>
          <div className="p-3 rounded-lg bg-secondary/30 flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Percent className="h-4 w-4" />
              Effective APY
            </div>
            <span className="font-mono font-bold text-primary">{finalAPY.toFixed(2)}%</span>
          </div>
          <div className="p-3 rounded-lg bg-secondary/30 flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Coins className="h-4 w-4" />
              Daily Reward
            </div>
            <span className="font-mono">{dailyReward.toFixed(4)} GYDS</span>
          </div>
          <div className="p-3 rounded-lg bg-secondary/30 flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Coins className="h-4 w-4" />
              Monthly Reward
            </div>
            <span className="font-mono">{monthlyReward.toFixed(2)} GYDS</span>
          </div>
          <div className="p-3 rounded-lg bg-primary/10 border border-primary/30 flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-medium">
              <TrendingUp className="h-4 w-4 text-primary" />
              After {lockMonths[0]} months
            </div>
            <span className="font-mono font-bold text-primary">{afterLock.toLocaleString(undefined, { maximumFractionDigits: 2 })} GYDS</span>
          </div>
        </div>
      </div>
    </GlassCard>
  );
};
