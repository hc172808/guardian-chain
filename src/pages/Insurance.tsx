import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Layout } from '@/components/layout/Layout';
import { GlassCard } from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import {
  Shield, HeartHandshake, RefreshCw, AlertTriangle,
  CheckCircle, Clock, XCircle, TrendingUp, Lock,
  FileText, Zap, ChevronRight
} from 'lucide-react';

interface InsurancePool {
  id: string;
  name: string;
  coverage_type: string;
  description: string;
  total_coverage: string;
  total_staked: string;
  premium_rate: string;
  claim_period: number;
  min_coverage: string;
  max_coverage: string;
  image_emoji: string;
}

interface InsurancePolicy {
  id: string;
  pool_id: string;
  pool_name: string;
  coverage_type: string;
  image_emoji: string;
  coverage_amount: string;
  premium_paid: string;
  starts_at: string;
  ends_at: string;
  status: 'active' | 'expired' | 'claimed' | 'cancelled';
  claim_reason: string | null;
  claim_submitted_at: string | null;
}

const COVERAGE_TYPE_LABEL: Record<string, string> = {
  smart_contract: 'Smart Contract',
  exchange_hack: 'Exchange Hack',
  stablecoin_depeg: 'Stablecoin Depeg',
  slashing: 'Validator Slashing',
  bridge: 'Bridge Risk',
  general: 'General',
};

const STATUS_CONFIG = {
  active:    { color: 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10', icon: CheckCircle, label: 'Active' },
  expired:   { color: 'text-muted-foreground border-border/40 bg-muted/10', icon: Clock, label: 'Expired' },
  claimed:   { color: 'text-amber-400 border-amber-500/30 bg-amber-500/10', icon: AlertTriangle, label: 'Claimed' },
  cancelled: { color: 'text-red-400 border-red-500/30 bg-red-500/10', icon: XCircle, label: 'Cancelled' },
};

const DURATION_OPTIONS = [
  { days: 30, label: '30 days' },
  { days: 90, label: '90 days' },
  { days: 180, label: '6 months' },
  { days: 365, label: '1 year' },
];

const InsurancePage = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [pools, setPools] = useState<InsurancePool[]>([]);
  const [policies, setPolicies] = useState<InsurancePolicy[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPool, setSelectedPool] = useState<InsurancePool | null>(null);
  const [coverageAmount, setCoverageAmount] = useState('10000');
  const [durationDays, setDurationDays] = useState(90);
  const [buying, setBuying] = useState(false);
  const [claimPolicy, setClaimPolicy] = useState<InsurancePolicy | null>(null);
  const [claimReason, setClaimReason] = useState('');
  const [submittingClaim, setSubmittingClaim] = useState(false);

  const fetchPools = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/insurance/pools');
      if (res.ok) setPools(await res.json());
    } finally { setLoading(false); }
  }, []);

  const fetchPolicies = useCallback(async () => {
    if (!user) return;
    const res = await fetch('/api/insurance/my-policies', { credentials: 'include' });
    if (res.ok) setPolicies(await res.json());
  }, [user]);

  useEffect(() => { fetchPools(); }, [fetchPools]);
  useEffect(() => { fetchPolicies(); }, [fetchPolicies]);

  const totalCoverage = pools.reduce((a, p) => a + Number(p.total_coverage), 0);
  const totalStaked = pools.reduce((a, p) => a + Number(p.total_staked), 0);
  const activePolicies = policies.filter(p => p.status === 'active').length;

  const calcPremium = (pool: InsurancePool, amount: number, days: number) => {
    return Math.ceil(amount * Number(pool.premium_rate) * (days / 365));
  };

  const handleBuy = async () => {
    if (!user) { toast({ title: 'Sign in to buy coverage', variant: 'destructive' }); return; }
    if (!selectedPool) return;
    const amount = Number(coverageAmount);
    if (!amount || amount < Number(selectedPool.min_coverage) || amount > Number(selectedPool.max_coverage)) {
      toast({
        title: 'Invalid coverage amount',
        description: `Must be between ${Number(selectedPool.min_coverage).toLocaleString()} and ${Number(selectedPool.max_coverage).toLocaleString()} GYDS`,
        variant: 'destructive'
      });
      return;
    }
    setBuying(true);
    try {
      const res = await fetch('/api/insurance/buy', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ poolId: selectedPool.id, coverageAmount: amount, durationDays }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast({
        title: '🛡️ Coverage Active!',
        description: `${amount.toLocaleString()} GYDS insured via ${selectedPool.name}. Premium: ${Number(data.premium).toLocaleString()} GYDS`,
      });
      setSelectedPool(null);
      setCoverageAmount('10000');
      fetchPolicies();
      fetchPools();
    } catch (e: any) {
      toast({ title: 'Purchase failed', description: e.message, variant: 'destructive' });
    } finally { setBuying(false); }
  };

  const handleClaim = async () => {
    if (!claimPolicy || !claimReason.trim()) {
      toast({ title: 'Claim reason required', variant: 'destructive' });
      return;
    }
    setSubmittingClaim(true);
    try {
      const res = await fetch(`/api/insurance/claim/${claimPolicy.id}`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: claimReason }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast({ title: '📋 Claim Submitted', description: 'Your claim is under review.' });
      setClaimPolicy(null);
      setClaimReason('');
      fetchPolicies();
    } catch (e: any) {
      toast({ title: 'Claim failed', description: e.message, variant: 'destructive' });
    } finally { setSubmittingClaim(false); }
  };

  return (
    <Layout>
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <HeartHandshake className="w-6 h-6 text-primary" /> Insurance Protocol
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              Protect your assets against smart contract exploits, bridge failures, and slashing events
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => { fetchPools(); fetchPolicies(); }} disabled={loading}>
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'Total Coverage', value: `${(totalCoverage / 1_000_000).toFixed(1)}M GYDS`, icon: Shield },
            { label: 'Total Staked', value: `${(totalStaked / 1_000_000).toFixed(1)}M GYDS`, icon: Lock },
            { label: 'Insurance Pools', value: pools.length, icon: HeartHandshake },
            { label: 'My Active Policies', value: activePolicies, icon: CheckCircle },
          ].map(s => (
            <GlassCard key={s.label} className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <s.icon className="w-4 h-4 text-primary" />
                <span className="text-xs text-muted-foreground">{s.label}</span>
              </div>
              <p className="text-xl font-bold">{s.value}</p>
            </GlassCard>
          ))}
        </div>

        <Tabs defaultValue="pools">
          <TabsList className="flex-wrap h-auto gap-1">
            <TabsTrigger value="pools">Coverage Pools</TabsTrigger>
            <TabsTrigger value="my-policies">My Policies {activePolicies > 0 && `(${activePolicies})`}</TabsTrigger>
            <TabsTrigger value="underwriter">Underwriter</TabsTrigger>
            <TabsTrigger value="parametric">Parametric</TabsTrigger>
            <TabsTrigger value="how-it-works">How It Works</TabsTrigger>
          </TabsList>

          {/* Coverage Pools */}
          <TabsContent value="pools" className="mt-4 space-y-4">
            {loading ? (
              <div className="flex items-center gap-2 text-muted-foreground py-10 justify-center">
                <RefreshCw className="w-5 h-5 animate-spin" /> Loading pools…
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {pools.map((pool, i) => (
                  <motion.div key={pool.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}>
                    <GlassCard
                      className="p-5 cursor-pointer hover:border-primary/40 transition-colors"
                      onClick={() => setSelectedPool(pool)}
                    >
                      <div className="flex items-start gap-4">
                        <div className="text-3xl">{pool.image_emoji}</div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="font-semibold">{pool.name}</h3>
                            <Badge variant="outline" className="text-xs">
                              {COVERAGE_TYPE_LABEL[pool.coverage_type] ?? pool.coverage_type}
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{pool.description}</p>
                          <div className="grid grid-cols-3 gap-2 mt-3 text-xs">
                            <div>
                              <p className="text-muted-foreground">Coverage</p>
                              <p className="font-bold text-sm">{(Number(pool.total_coverage) / 1_000_000).toFixed(1)}M GYDS</p>
                            </div>
                            <div>
                              <p className="text-muted-foreground">Premium Rate</p>
                              <p className="font-bold text-sm text-emerald-400">{(Number(pool.premium_rate) * 100).toFixed(1)}% / yr</p>
                            </div>
                            <div>
                              <p className="text-muted-foreground">Claim Period</p>
                              <p className="font-bold text-sm">{pool.claim_period}d</p>
                            </div>
                          </div>
                          <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
                            <span>Min: {Number(pool.min_coverage).toLocaleString()} GYDS</span>
                            <span>Max: {Number(pool.max_coverage).toLocaleString()} GYDS</span>
                          </div>
                          {/* Utilization bar */}
                          <div className="mt-2">
                            <div className="w-full bg-muted/30 rounded-full h-1.5">
                              <div
                                className="bg-primary rounded-full h-1.5 transition-all"
                                style={{ width: `${Math.min(100, (Number(pool.total_staked) / Number(pool.total_coverage)) * 100).toFixed(0)}%` }}
                              />
                            </div>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {((Number(pool.total_staked) / Number(pool.total_coverage)) * 100).toFixed(1)}% utilization
                            </p>
                          </div>
                        </div>
                        <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0 mt-1" />
                      </div>
                    </GlassCard>
                  </motion.div>
                ))}
              </div>
            )}
          </TabsContent>

          {/* My Policies */}
          <TabsContent value="my-policies" className="mt-4 space-y-3">
            {!user ? (
              <GlassCard className="p-10 text-center text-muted-foreground">
                <Lock className="w-10 h-10 mx-auto mb-2 opacity-30" />
                <p>Sign in to view your policies.</p>
              </GlassCard>
            ) : policies.length === 0 ? (
              <GlassCard className="p-10 text-center text-muted-foreground">
                <Shield className="w-10 h-10 mx-auto mb-2 opacity-30" />
                <p>No policies yet. Buy coverage from the Pools tab.</p>
              </GlassCard>
            ) : (
              policies.map((policy, i) => {
                const cfg = STATUS_CONFIG[policy.status] ?? STATUS_CONFIG.expired;
                const StatusIcon = cfg.icon;
                const daysLeft = Math.max(0, Math.ceil((new Date(policy.ends_at).getTime() - Date.now()) / 86400000));
                return (
                  <motion.div key={policy.id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }}>
                    <GlassCard className="p-4">
                      <div className="flex items-start gap-4">
                        <div className="text-2xl">{policy.image_emoji}</div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-semibold">{policy.pool_name}</p>
                            <Badge variant="outline" className={`text-xs ${cfg.color}`}>
                              <StatusIcon className="w-3 h-3 mr-1" /> {cfg.label}
                            </Badge>
                          </div>
                          <div className="grid grid-cols-3 gap-3 mt-2 text-xs">
                            <div>
                              <p className="text-muted-foreground">Coverage</p>
                              <p className="font-bold">{Number(policy.coverage_amount).toLocaleString()} GYDS</p>
                            </div>
                            <div>
                              <p className="text-muted-foreground">Premium Paid</p>
                              <p className="font-bold">{Number(policy.premium_paid).toLocaleString()} GYDS</p>
                            </div>
                            <div>
                              <p className="text-muted-foreground">{policy.status === 'active' ? 'Days Left' : 'Expired'}</p>
                              <p className="font-bold">{policy.status === 'active' ? `${daysLeft}d` : new Date(policy.ends_at).toLocaleDateString()}</p>
                            </div>
                          </div>
                          {policy.claim_reason && (
                            <p className="text-xs text-amber-400 mt-2 italic">
                              Claim: {policy.claim_reason}
                            </p>
                          )}
                        </div>
                        {policy.status === 'active' && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="shrink-0 text-amber-400 border-amber-500/30"
                            onClick={() => setClaimPolicy(policy)}
                          >
                            <FileText className="w-3 h-3 mr-1" /> Claim
                          </Button>
                        )}
                      </div>
                    </GlassCard>
                  </motion.div>
                );
              })
            )}
          </TabsContent>

          {/* Underwriter Staking */}
          <TabsContent value="underwriter" className="mt-4 space-y-4">
            <GlassCard className="p-5 space-y-3">
              <h2 className="font-semibold flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-emerald-400" /> Underwriter Staking
              </h2>
              <p className="text-xs text-muted-foreground">Earn premiums by providing capital to insurance pools. As an underwriter, you back coverage claims and earn a share of all premiums paid into the pool.</p>
              <div className="grid grid-cols-2 gap-3 text-xs">
                {[
                  { label: 'Your Staked', value: '0 GYDS', color: 'text-foreground' },
                  { label: 'Premiums Earned', value: '0 GYDS', color: 'text-emerald-400' },
                  { label: 'Coverage Backed', value: '$0', color: 'text-primary' },
                  { label: 'Current APY', value: '12–28%', color: 'text-amber-400' },
                ].map(s => (
                  <div key={s.label} className="p-3 bg-muted/20 rounded-xl">
                    <p className={`text-base font-bold ${s.color}`}>{s.value}</p>
                    <p className="text-muted-foreground">{s.label}</p>
                  </div>
                ))}
              </div>
            </GlassCard>
            <div className="space-y-3">
              {[
                { name: 'Smart Contract Pool', apy: '12%', staked: '2.4M GYDS', utilization: 68, minStake: '1,000' },
                { name: 'Bridge Risk Pool', apy: '28%', staked: '800K GYDS', utilization: 81, minStake: '5,000' },
                { name: 'Stablecoin Depeg Pool', apy: '18%', staked: '1.1M GYDS', utilization: 55, minStake: '2,000' },
                { name: 'Validator Slashing Pool', apy: '22%', staked: '500K GYDS', utilization: 42, minStake: '500' },
              ].map(pool => (
                <GlassCard key={pool.name} className="p-4 space-y-3">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <p className="font-medium text-sm">{pool.name}</p>
                    <Badge className="text-xs bg-emerald-500/20 text-emerald-400 border-emerald-500/30">{pool.apy} APY</Badge>
                  </div>
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Pool Utilization</span>
                      <span>{pool.utilization}%</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-muted/30 overflow-hidden">
                      <div className={`h-full rounded-full transition-all ${pool.utilization > 75 ? 'bg-amber-500' : 'bg-primary'}`} style={{ width: `${pool.utilization}%` }} />
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>Staked: {pool.staked}</span>
                    <span>Min: {pool.minStake} GYDS</span>
                    <Button size="sm" className="h-6 text-xs"
                      onClick={() => toast({ title: 'Underwriter Staking', description: 'Live underwriter staking launches with mainnet.' })}>
                      Stake
                    </Button>
                  </div>
                </GlassCard>
              ))}
            </div>
            <GlassCard className="p-4 text-xs text-muted-foreground space-y-1">
              <p className="font-medium text-foreground">⚠️ Risk Warning</p>
              <p>As an underwriter, your staked capital may be used to pay out approved claims. High-utilization pools carry higher claim risk. Premiums are credited weekly.</p>
            </GlassCard>
          </TabsContent>

          {/* Parametric Insurance */}
          <TabsContent value="parametric" className="mt-4 space-y-4">
            <GlassCard className="p-5 space-y-3">
              <h2 className="font-semibold flex items-center gap-2">
                <Zap className="w-4 h-4 text-amber-400" /> Parametric Insurance
              </h2>
              <p className="text-xs text-muted-foreground">Parametric policies auto-trigger payouts when oracle-verified conditions are met — no manual claim required. Payouts are instant and trustless.</p>
            </GlassCard>
            <div className="space-y-3">
              {[
                {
                  name: 'Price Crash Protection',
                  trigger: 'GYDS drops >40% in 24h vs. 7-day MA',
                  payout: '80% of coverage',
                  premium: '2.5%/yr',
                  oracle: 'Chainlink + GYDSchain oracle',
                  status: 'available',
                },
                {
                  name: 'Bridge Delay Cover',
                  trigger: 'Cross-chain transfer delayed >2 hours',
                  payout: '0.1% of bridge amount per hour',
                  premium: '0.5%/yr',
                  oracle: 'GYDSchain bridge monitor',
                  status: 'available',
                },
                {
                  name: 'Uptime SLA Protection',
                  trigger: 'Validator uptime <95% in any epoch',
                  payout: '50% of staked amount',
                  premium: '3%/yr',
                  oracle: 'GYDSchain validator metrics',
                  status: 'available',
                },
                {
                  name: 'Stablecoin Depeg Cover',
                  trigger: 'USDT/USDC pegged token <$0.97',
                  payout: '90% of exposure',
                  premium: '1.8%/yr',
                  oracle: 'Chainlink USD feeds',
                  status: 'available',
                },
              ].map(plan => (
                <GlassCard key={plan.name} className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2 flex-wrap">
                    <p className="font-semibold text-sm">{plan.name}</p>
                    <Badge variant={plan.status === 'available' ? 'default' : 'secondary'} className="text-xs capitalize">
                      {plan.status === 'available' ? '✓ Available' : 'Coming Soon'}
                    </Badge>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <p className="text-muted-foreground">Trigger</p>
                      <p className="font-medium leading-snug">{plan.trigger}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Payout</p>
                      <p className="font-medium text-emerald-400">{plan.payout}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Premium</p>
                      <p className="font-medium">{plan.premium}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Oracle</p>
                      <p className="font-medium truncate">{plan.oracle}</p>
                    </div>
                  </div>
                  {plan.status === 'available' && (
                    <Button size="sm" className="w-full text-xs h-7"
                      onClick={() => toast({ title: plan.name, description: 'Parametric insurance launches with mainnet oracle integration.' })}>
                      Get Coverage
                    </Button>
                  )}
                </GlassCard>
              ))}
            </div>
            <GlassCard className="p-4 text-xs text-muted-foreground space-y-1">
              <p className="font-medium text-foreground">How Parametric Works</p>
              <p>Oracle data is verified by 3-of-5 independent oracles. When the trigger condition is confirmed, smart contracts automatically release the payout — no claims committee, no waiting period.</p>
            </GlassCard>
          </TabsContent>

          {/* How It Works */}
          <TabsContent value="how-it-works" className="mt-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[
                {
                  icon: '1️⃣', title: 'Choose a Pool',
                  desc: 'Select the coverage type that matches your risk profile — smart contracts, bridges, validators, or stablecoins.'
                },
                {
                  icon: '2️⃣', title: 'Set Coverage Amount',
                  desc: 'Enter the amount of GYDS you want covered. Pay a small annual premium proportional to the risk.'
                },
                {
                  icon: '3️⃣', title: 'Stay Protected',
                  desc: 'Your policy is active immediately. Coverage runs until expiry. You can hold multiple policies.'
                },
                {
                  icon: '4️⃣', title: 'Submit a Claim',
                  desc: 'If a covered event occurs, submit a claim with evidence. DAO governance votes on approval within the claim period.'
                },
              ].map((step) => (
                <GlassCard key={step.icon} className="p-5 space-y-2">
                  <div className="text-2xl">{step.icon}</div>
                  <p className="font-semibold">{step.title}</p>
                  <p className="text-sm text-muted-foreground">{step.desc}</p>
                </GlassCard>
              ))}
              <GlassCard className="p-5 md:col-span-2 space-y-2 border-amber-500/20">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-400" />
                  <p className="font-semibold text-amber-400">Important Disclaimer</p>
                </div>
                <p className="text-sm text-muted-foreground">
                  GYDSchain Insurance Protocol is a decentralized, community-governed protocol.
                  Claim payouts are subject to DAO governance vote and available pool liquidity.
                  This is not traditional insurance and does not carry regulatory protections.
                  Always review the coverage terms before purchasing.
                </p>
              </GlassCard>
            </div>
          </TabsContent>
        </Tabs>

        {/* Buy Coverage Modal */}
        {selectedPool && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={() => setSelectedPool(null)}
          >
            <GlassCard className="p-6 w-full max-w-md space-y-5" onClick={e => e.stopPropagation()}>
              <div className="flex items-center gap-3">
                <span className="text-3xl">{selectedPool.image_emoji}</span>
                <div>
                  <h2 className="text-lg font-bold">{selectedPool.name}</h2>
                  <p className="text-xs text-muted-foreground">{selectedPool.description}</p>
                </div>
              </div>

              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">
                  Coverage Amount (GYDS) · Min {Number(selectedPool.min_coverage).toLocaleString()} — Max {Number(selectedPool.max_coverage).toLocaleString()}
                </Label>
                <Input
                  type="number"
                  value={coverageAmount}
                  onChange={e => setCoverageAmount(e.target.value)}
                  min={selectedPool.min_coverage}
                  max={selectedPool.max_coverage}
                  className="mt-1"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Duration</Label>
                <div className="grid grid-cols-4 gap-2 mt-1">
                  {DURATION_OPTIONS.map(opt => (
                    <button
                      key={opt.days}
                      onClick={() => setDurationDays(opt.days)}
                      className={`text-xs py-2 rounded-lg border transition-all ${durationDays === opt.days ? 'border-primary bg-primary/10 text-primary font-semibold' : 'border-border/40 text-muted-foreground hover:border-primary/40'}`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5 text-sm p-3 bg-muted/20 rounded-lg">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Annual premium rate</span>
                  <span>{(Number(selectedPool.premium_rate) * 100).toFixed(1)}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Coverage amount</span>
                  <span>{Number(coverageAmount || 0).toLocaleString()} GYDS</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Duration</span>
                  <span>{durationDays} days</span>
                </div>
                <div className="border-t border-border/30 pt-1.5 flex justify-between font-bold">
                  <span>Premium due</span>
                  <span className="text-primary">
                    {Number(coverageAmount || 0) > 0
                      ? calcPremium(selectedPool, Number(coverageAmount), durationDays).toLocaleString()
                      : '0'
                    } GYDS
                  </span>
                </div>
              </div>

              <div className="flex gap-2">
                <Button className="flex-1 gap-2" onClick={handleBuy} disabled={buying || !user}>
                  {buying ? <><RefreshCw className="w-4 h-4 animate-spin" /> Processing…</> : <><Shield className="w-4 h-4" /> Buy Coverage</>}
                </Button>
                <Button variant="outline" onClick={() => setSelectedPool(null)}>Cancel</Button>
              </div>
              {!user && <p className="text-xs text-center text-muted-foreground">Sign in to purchase coverage</p>}
            </GlassCard>
          </motion.div>
        )}

        {/* Submit Claim Modal */}
        {claimPolicy && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={() => setClaimPolicy(null)}
          >
            <GlassCard className="p-6 w-full max-w-md space-y-5" onClick={e => e.stopPropagation()}>
              <div className="flex items-center gap-3">
                <AlertTriangle className="w-6 h-6 text-amber-400" />
                <div>
                  <h2 className="text-lg font-bold">Submit Claim</h2>
                  <p className="text-xs text-muted-foreground">{claimPolicy.pool_name}</p>
                </div>
              </div>
              <div className="p-3 bg-muted/20 rounded-lg text-sm space-y-1">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Coverage</span>
                  <span className="font-bold">{Number(claimPolicy.coverage_amount).toLocaleString()} GYDS</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Policy expires</span>
                  <span>{new Date(claimPolicy.ends_at).toLocaleDateString()}</span>
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Describe the incident *</Label>
                <Textarea
                  value={claimReason}
                  onChange={e => setClaimReason(e.target.value)}
                  placeholder="Describe what happened, when it occurred, and any transaction hashes or evidence..."
                  className="mt-1 min-h-[100px]"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Claims are reviewed by GYDSchain governance DAO within the claim period ({claimPolicy.pool_name}).
              </p>
              <div className="flex gap-2">
                <Button
                  className="flex-1 gap-2"
                  onClick={handleClaim}
                  disabled={submittingClaim || !claimReason.trim()}
                >
                  {submittingClaim ? <><RefreshCw className="w-4 h-4 animate-spin" /> Submitting…</> : <><FileText className="w-4 h-4" /> Submit Claim</>}
                </Button>
                <Button variant="outline" onClick={() => setClaimPolicy(null)}>Cancel</Button>
              </div>
            </GlassCard>
          </motion.div>
        )}
      </motion.div>
    </Layout>
  );
};

export default InsurancePage;
