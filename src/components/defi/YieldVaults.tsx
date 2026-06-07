import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { GlassCard } from '@/components/ui/GlassCard';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { TrendingUp, Lock, RefreshCw, Zap, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Vault {
  id: string;
  name: string;
  strategy: string;
  apy: number;
  tvl: number;
  token: string;
  risk: 'low' | 'medium' | 'high';
  autoCompound: boolean;
  lockDays?: number;
  capacity: number;
  filled: number;
  icon: string;
}

const VAULTS: Vault[] = [
  {
    id: 'gyds-stake', name: 'GYDS Auto-Stake', icon: '◇', token: 'GYDS',
    strategy: 'Stake GYDS, auto-compound rewards every 24h. No lock-up.',
    apy: 18.5, tvl: 8_500_000, risk: 'low', autoCompound: true,
    capacity: 20_000_000, filled: 8_500_000,
  },
  {
    id: 'lp-compound', name: 'GYDS/GYD LP Vault', icon: '🔄', token: 'GYDS-GYD LP',
    strategy: 'Deposit GYDS/GYD LP tokens. Vault auto-compounds swap fees + farming rewards.',
    apy: 42.3, tvl: 3_200_000, risk: 'medium', autoCompound: true, lockDays: 7,
    capacity: 10_000_000, filled: 3_200_000,
  },
  {
    id: 'gyd-stable', name: 'GYD Stablecoin Yield', icon: '$', token: 'GYD',
    strategy: 'Deposit GYD stablecoin, earn yield from protocol revenue sharing.',
    apy: 8.2, tvl: 1_800_000, risk: 'low', autoCompound: true,
    capacity: 5_000_000, filled: 1_800_000,
  },
  {
    id: 'gyds-boost', name: 'GYDS Boosted Vault', icon: '⚡', token: 'GYDS',
    strategy: '30-day lock for boosted rewards. 3× multiplier on staking APY.',
    apy: 55.5, tvl: 2_100_000, risk: 'medium', autoCompound: false, lockDays: 30,
    capacity: 5_000_000, filled: 2_100_000,
  },
  {
    id: 'validator-boost', name: 'Validator Rewards Vault', icon: '🛡️', token: 'GYDS',
    strategy: 'Delegate to top validators via the vault. Vault optimizes delegation automatically.',
    apy: 25.8, tvl: 12_000_000, risk: 'low', autoCompound: true,
    capacity: 50_000_000, filled: 12_000_000,
  },
];

const RISK_CONFIG = {
  low:    { label: 'Low Risk',    color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30' },
  medium: { label: 'Medium Risk', color: 'text-amber-400 bg-amber-500/10 border-amber-500/30' },
  high:   { label: 'High Risk',   color: 'text-red-400 bg-red-500/10 border-red-500/30' },
};

export const YieldVaults = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [depositAmount, setDepositAmount] = useState<Record<string, string>>({});
  const [depositing, setDepositing] = useState<string | null>(null);

  const deposit = async (vault: Vault) => {
    if (!user) { toast({ title: 'Sign in to deposit', variant: 'destructive' }); return; }
    const amt = depositAmount[vault.id];
    if (!amt || parseFloat(amt) <= 0) { toast({ title: 'Enter deposit amount', variant: 'destructive' }); return; }
    setDepositing(vault.id);
    await new Promise(r => setTimeout(r, 1200));
    setDepositing(null);
    toast({
      title: `Deposited ${parseFloat(amt).toLocaleString()} ${vault.token}`,
      description: `Now earning ${vault.apy}% APY in ${vault.name}`,
    });
    setDepositAmount(prev => ({ ...prev, [vault.id]: '' }));
  };

  const totalTvl = VAULTS.reduce((s, v) => s + v.tvl, 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-primary" /> Yield Vaults
        </h2>
        <Badge variant="secondary" className="text-xs">
          TVL: {(totalTvl / 1_000_000).toFixed(1)}M GYDS
        </Badge>
      </div>

      {/* Stats strip */}
      <div className="grid grid-cols-3 gap-2 text-center">
        {[
          { label: 'Best APY',  value: `${Math.max(...VAULTS.map(v => v.apy))}%` },
          { label: 'Vaults',    value: VAULTS.length },
          { label: 'Auto-comp', value: `${VAULTS.filter(v => v.autoCompound).length}` },
        ].map(s => (
          <GlassCard key={s.label} className="p-2">
            <p className="text-sm font-bold text-primary">{s.value}</p>
            <p className="text-[10px] text-muted-foreground">{s.label}</p>
          </GlassCard>
        ))}
      </div>

      {/* Vault cards */}
      <div className="space-y-3">
        {VAULTS.map((vault, i) => {
          const risk = RISK_CONFIG[vault.risk];
          const isExpanded = expanded === vault.id;
          const fillPct = (vault.filled / vault.capacity) * 100;

          return (
            <motion.div key={vault.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}>
              <GlassCard className="overflow-hidden">
                {/* Header */}
                <button
                  className="w-full p-4 flex items-center gap-3 text-left hover:bg-sidebar-accent/30 transition-colors"
                  onClick={() => setExpanded(isExpanded ? null : vault.id)}
                >
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary/20 to-neon-cyan/10 flex items-center justify-center text-xl shrink-0">
                    {vault.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <p className="font-semibold text-sm">{vault.name}</p>
                      {vault.autoCompound && (
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0 gap-0.5">
                          <RefreshCw className="w-2.5 h-2.5" /> Auto
                        </Badge>
                      )}
                      {vault.lockDays && (
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 gap-0.5 text-amber-400 border-amber-500/30">
                          <Lock className="w-2.5 h-2.5" /> {vault.lockDays}d
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">{vault.token}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-lg font-bold text-emerald-400">{vault.apy}%</p>
                    <p className="text-[10px] text-muted-foreground">APY</p>
                  </div>
                  {isExpanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                </button>

                {/* Expanded */}
                <AnimatePresence>
                  {isExpanded && (
                    <motion.div
                      initial={{ height: 0 }}
                      animate={{ height: 'auto' }}
                      exit={{ height: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="px-4 pb-4 space-y-3 border-t border-border/20">
                        <p className="text-xs text-muted-foreground pt-3">{vault.strategy}</p>

                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div className="p-2 bg-muted/20 rounded-lg">
                            <p className="text-muted-foreground">TVL</p>
                            <p className="font-bold">{(vault.tvl / 1_000_000).toFixed(1)}M {vault.token}</p>
                          </div>
                          <div className="p-2 bg-muted/20 rounded-lg">
                            <p className="text-muted-foreground">Capacity</p>
                            <div className="flex items-center gap-1 mt-1">
                              <Progress value={fillPct} className="h-1 flex-1" />
                              <span className="font-bold">{fillPct.toFixed(0)}%</span>
                            </div>
                          </div>
                          <div className="p-2 bg-muted/20 rounded-lg">
                            <p className="text-muted-foreground">Risk level</p>
                            <Badge variant="outline" className={cn('text-[10px] mt-0.5', risk.color)}>{risk.label}</Badge>
                          </div>
                          <div className="p-2 bg-muted/20 rounded-lg">
                            <p className="text-muted-foreground">Lock-up</p>
                            <p className="font-bold">{vault.lockDays ? `${vault.lockDays} days` : 'None'}</p>
                          </div>
                        </div>

                        <div className="space-y-2">
                          <div className="flex gap-2">
                            <Input
                              type="number"
                              placeholder={`Amount in ${vault.token}`}
                              value={depositAmount[vault.id] ?? ''}
                              onChange={e => setDepositAmount(prev => ({ ...prev, [vault.id]: e.target.value }))}
                              className="text-sm"
                            />
                            <Button onClick={() => deposit(vault)} disabled={depositing === vault.id} className="shrink-0">
                              {depositing === vault.id
                                ? <RefreshCw className="w-4 h-4 animate-spin" />
                                : <Zap className="w-4 h-4" />
                              }
                            </Button>
                          </div>
                          {depositAmount[vault.id] && parseFloat(depositAmount[vault.id]) > 0 && (
                            <p className="text-xs text-muted-foreground">
                              Est. annual yield:{' '}
                              <span className="text-emerald-400 font-bold">
                                {(parseFloat(depositAmount[vault.id]) * vault.apy / 100).toLocaleString(undefined, { maximumFractionDigits: 2 })} {vault.token}
                              </span>
                            </p>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </GlassCard>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
};
