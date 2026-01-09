import { useState, useEffect, useCallback } from 'react';
import { Layout } from '@/components/layout/Layout';
import { GlassCard } from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/button';
import { 
  ANTI_BOT_FORMULAS, 
  DIFFICULTY_FORMULAS, 
  formatHashRate, 
  generateHash,
  MINING_REWARDS,
  calculateMiningReward,
  estimateMiningEarnings,
  MiningAlgorithm 
} from '@/lib/blockchain';
import { TOKENOMICS } from '@/config/wallets';
import { motion, AnimatePresence } from 'framer-motion';
import { Pickaxe, Play, Pause, RefreshCw, Zap, Shield, Activity, AlertTriangle, Lock, Cpu, MonitorPlay } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Progress } from '@/components/ui/progress';
import { useAuth } from '@/contexts/AuthContext';
import { RequireAuth } from '@/components/auth/RequireAuth';
import { WireGuardStatus } from '@/components/wireguard/WireGuardStatus';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';

interface MiningState {
  isActive: boolean;
  algorithm: MiningAlgorithm;
  hashRate: number;
  validShares: number;
  invalidShares: number;
  totalReward: number;
  currentDifficulty: number;
  humanScore: number;
  sessionDuration: number;
  lastShareHash: string;
  lastShareTime: number;
}

const MiningContent = () => {
  const { user } = useAuth();
  const [isVpnConnected, setIsVpnConnected] = useState(false);
  const [selectedAlgorithm, setSelectedAlgorithm] = useState<MiningAlgorithm>('randomx');
  const [mining, setMining] = useState<MiningState>({
    isActive: false,
    algorithm: 'randomx',
    hashRate: 0,
    validShares: 0,
    invalidShares: 0,
    totalReward: 0,
    currentDifficulty: 1000000,
    humanScore: 85,
    sessionDuration: 0,
    lastShareHash: '',
    lastShareTime: 0,
  });

  // Estimated earnings based on current hash rate
  const estimatedEarnings = estimateMiningEarnings(
    mining.algorithm,
    mining.hashRate,
    mining.humanScore
  );

  const [shareHistory, setShareHistory] = useState<{ hash: string; valid: boolean; reward: number; time: number }[]>([]);

  const handleVpnConnection = useCallback((connected: boolean) => {
    setIsVpnConnected(connected);
    if (!connected && mining.isActive) {
      setMining(prev => ({ ...prev, isActive: false }));
    }
  }, [mining.isActive]);

  // Mining with rate limiting (120s block time)
  useEffect(() => {
    if (!mining.isActive || !isVpnConnected) return;

    // Rate-limited interval: check every 5 seconds minimum
    const interval = setInterval(() => {
      setMining(prev => {
        const now = Date.now();
        
        // Enforce rate limiting - minimum 5 seconds between shares
        if (DIFFICULTY_FORMULAS.isRateLimited(prev.lastShareTime)) {
          return prev; // Skip this tick
        }

        const isValid = Math.random() > 0.08; // 92% valid shares
        
        // Calculate hash rate based on algorithm
        let newHashRate: number;
        if (prev.algorithm === 'randomx') {
          // RandomX CPU: simulate 800-1200 H/s
          newHashRate = 800 + Math.random() * 400;
        } else {
          // kHeavyHash GPU: simulate 800-1200 GH/s
          newHashRate = 800 + Math.random() * 400;
        }
        
        // Calculate actual reward using the formula
        const reward = isValid 
          ? calculateMiningReward(prev.algorithm, newHashRate, 5, prev.humanScore) 
          : 0;
        
        // Calculate session reward cap
        const sessionCap = ANTI_BOT_FORMULAS.sessionRewardCap(prev.sessionDuration, 0.001);
        const actualReward = prev.totalReward < sessionCap ? reward : 0;

        if (isValid && actualReward > 0) {
          setShareHistory(h => [{
            hash: generateHash().slice(0, 16),
            valid: true,
            reward: actualReward,
            time: now,
          }, ...h.slice(0, 9)]);
        }

        return {
          ...prev,
          hashRate: newHashRate,
          validShares: prev.validShares + (isValid ? 1 : 0),
          invalidShares: prev.invalidShares + (isValid ? 0 : 1),
          totalReward: prev.totalReward + actualReward,
          sessionDuration: prev.sessionDuration + 5000, // 5 seconds per tick
          lastShareHash: generateHash(),
          lastShareTime: now,
          currentDifficulty: DIFFICULTY_FORMULAS.minerDifficulty(
            prev.currentDifficulty,
            newHashRate,
            1000
          ),
        };
      });
    }, 5000); // Rate limited: 5 seconds minimum

    return () => clearInterval(interval);
  }, [mining.isActive, isVpnConnected]);

  const toggleMining = () => {
    if (!isVpnConnected) return;
    setMining(prev => ({ ...prev, isActive: !prev.isActive, algorithm: selectedAlgorithm }));
  };

  const resetMining = () => {
    setMining({
      isActive: false,
      algorithm: selectedAlgorithm,
      hashRate: 0,
      validShares: 0,
      invalidShares: 0,
      totalReward: 0,
      currentDifficulty: 1000000,
      humanScore: 85,
      sessionDuration: 0,
      lastShareHash: '',
      lastShareTime: 0,
    });
    setShareHistory([]);
  };

  const handleAlgorithmChange = (algo: string) => {
    if (!mining.isActive) {
      setSelectedAlgorithm(algo as MiningAlgorithm);
    }
  };

  const sessionCap = ANTI_BOT_FORMULAS.sessionRewardCap(mining.sessionDuration, 10);
  const capProgress = Math.min(100, (mining.totalReward / sessionCap) * 100);

  return (
    <Layout>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="space-y-6"
      >
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-3">
              <Pickaxe className="w-7 h-7 sm:w-8 sm:h-8 text-primary" />
              Mining
            </h1>
            <p className="text-muted-foreground mt-2 text-sm">
              Block time: 120s • Rate limited • WireGuard VPN sync required
            </p>
          </div>
          
          <div className="flex gap-3">
            <Button
              onClick={toggleMining}
              variant={mining.isActive ? "destructive" : "default"}
              size="lg"
              disabled={!isVpnConnected}
              className={cn(
                mining.isActive && 'animate-mining'
              )}
            >
              {!isVpnConnected ? (
                <>
                  <Lock className="w-4 h-4 mr-2" />
                  VPN Required
                </>
              ) : mining.isActive ? (
                <>
                  <Pause className="w-4 h-4 mr-2" />
                  Stop Mining
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 mr-2" />
                  Start Mining
                </>
              )}
            </Button>
            <Button variant="outline" onClick={resetMining}>
              <RefreshCw className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Algorithm Selection */}
        <GlassCard>
          <h3 className="font-semibold mb-4">Select Mining Algorithm</h3>
          <Tabs value={selectedAlgorithm} onValueChange={handleAlgorithmChange} className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="randomx" disabled={mining.isActive} className="flex items-center gap-2">
                <Cpu className="w-4 h-4" />
                RandomX (CPU)
              </TabsTrigger>
              <TabsTrigger value="kheavyhash" disabled={mining.isActive} className="flex items-center gap-2">
                <MonitorPlay className="w-4 h-4" />
                kHeavyHash (GPU)
              </TabsTrigger>
            </TabsList>
            
            <TabsContent value="randomx" className="mt-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="p-3 rounded-lg bg-secondary/30 text-center">
                  <p className="text-xs text-muted-foreground">1 KH/s Daily</p>
                  <p className="font-mono font-bold text-neon-emerald">
                    {MINING_REWARDS.randomx.referenceRates.dailyReward.toFixed(8)} {TOKENOMICS.symbol}
                  </p>
                </div>
                <div className="p-3 rounded-lg bg-secondary/30 text-center">
                  <p className="text-xs text-muted-foreground">1 KH/s Monthly</p>
                  <p className="font-mono font-bold text-neon-emerald">
                    {MINING_REWARDS.randomx.referenceRates.monthlyReward.toFixed(8)} {TOKENOMICS.symbol}
                  </p>
                </div>
                <div className="p-3 rounded-lg bg-secondary/30 text-center">
                  <p className="text-xs text-muted-foreground">1000 H/s Daily</p>
                  <p className="font-mono font-bold">
                    {MINING_REWARDS.randomx.lowHashRates.dailyReward.toExponential(1)} {TOKENOMICS.symbol}
                  </p>
                </div>
                <div className="p-3 rounded-lg bg-secondary/30 text-center">
                  <p className="text-xs text-muted-foreground">1000 H/s Monthly</p>
                  <p className="font-mono font-bold">
                    {MINING_REWARDS.randomx.lowHashRates.monthlyReward.toFixed(8)} {TOKENOMICS.symbol}
                  </p>
                </div>
              </div>
            </TabsContent>
            
            <TabsContent value="kheavyhash" className="mt-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="p-3 rounded-lg bg-secondary/30 text-center">
                  <p className="text-xs text-muted-foreground">1000 GH/s Daily</p>
                  <p className="font-mono font-bold text-neon-emerald">
                    {MINING_REWARDS.kheavyhash.referenceRates.dailyReward.toFixed(8)} {TOKENOMICS.symbol}
                  </p>
                </div>
                <div className="p-3 rounded-lg bg-secondary/30 text-center">
                  <p className="text-xs text-muted-foreground">1000 GH/s Monthly</p>
                  <p className="font-mono font-bold text-neon-emerald">
                    {MINING_REWARDS.kheavyhash.referenceRates.monthlyReward.toFixed(7)} {TOKENOMICS.symbol}
                  </p>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </GlassCard>

        {/* WireGuard VPN Status */}
        <WireGuardStatus onConnected={handleVpnConnection} />

        {/* Mining Stats */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <GlassCard glow={mining.isActive}>
            <div className="flex items-center gap-3 mb-3">
              <Zap className={cn(
                'w-5 h-5',
                mining.isActive ? 'text-neon-amber animate-pulse' : 'text-muted-foreground'
              )} />
              <span className="text-sm text-muted-foreground">Hash Rate ({MINING_REWARDS[mining.algorithm].type})</span>
            </div>
            <p className="text-2xl font-bold font-mono text-gradient-primary">
              {mining.algorithm === 'randomx' 
                ? `${mining.hashRate.toFixed(0)} H/s`
                : `${mining.hashRate.toFixed(0)} GH/s`
              }
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {MINING_REWARDS[mining.algorithm].name}
            </p>
          </GlassCard>

          <GlassCard>
            <div className="flex items-center gap-3 mb-3">
              <Activity className="w-5 h-5 text-neon-emerald" />
              <span className="text-sm text-muted-foreground">Valid Shares</span>
            </div>
            <p className="text-2xl font-bold font-mono text-neon-emerald">
              {mining.validShares.toLocaleString()}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Rejected: <span className="text-neon-rose">{mining.invalidShares}</span>
            </p>
          </GlassCard>

          <GlassCard>
            <div className="flex items-center gap-3 mb-3">
              <Pickaxe className="w-5 h-5 text-neon-purple" />
              <span className="text-sm text-muted-foreground">Total Reward</span>
            </div>
            <p className="text-2xl font-bold font-mono">
              {mining.totalReward.toFixed(10)} <span className="text-sm text-muted-foreground">{TOKENOMICS.symbol}</span>
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Est. Daily: {estimatedEarnings.daily.toFixed(10)}
            </p>
          </GlassCard>

          <GlassCard>
            <div className="flex items-center gap-3 mb-3">
              <Shield className="w-5 h-5 text-primary" />
              <span className="text-sm text-muted-foreground">Human Score</span>
            </div>
            <p className="text-2xl font-bold font-mono text-gradient-primary">
              {mining.humanScore}%
            </p>
            <p className="text-xs text-muted-foreground mt-1">Anti-bot verification</p>
          </GlassCard>
        </div>

        {/* Earnings Estimate Card */}
        <GlassCard>
          <h3 className="font-semibold mb-4 flex items-center gap-2">
            <Zap className="w-5 h-5 text-neon-amber" />
            Estimated Earnings at Current Hash Rate
          </h3>
          <div className="grid grid-cols-3 gap-4 text-center">
            <div className="p-4 rounded-lg bg-secondary/30">
              <p className="text-xs text-muted-foreground mb-1">Daily</p>
              <p className="font-mono font-bold text-lg text-neon-emerald">
                {estimatedEarnings.daily.toFixed(10)}
              </p>
              <p className="text-xs text-muted-foreground">{TOKENOMICS.symbol}</p>
            </div>
            <div className="p-4 rounded-lg bg-secondary/30">
              <p className="text-xs text-muted-foreground mb-1">Monthly</p>
              <p className="font-mono font-bold text-lg text-neon-emerald">
                {estimatedEarnings.monthly.toFixed(8)}
              </p>
              <p className="text-xs text-muted-foreground">{TOKENOMICS.symbol}</p>
            </div>
            <div className="p-4 rounded-lg bg-secondary/30">
              <p className="text-xs text-muted-foreground mb-1">Yearly</p>
              <p className="font-mono font-bold text-lg text-neon-emerald">
                {estimatedEarnings.yearly.toFixed(6)}
              </p>
              <p className="text-xs text-muted-foreground">{TOKENOMICS.symbol}</p>
            </div>
          </div>
        </GlassCard>

        {/* Session Cap Warning */}
        {capProgress > 80 && (
          <GlassCard className="border-neon-amber/50 bg-neon-amber/5">
            <div className="flex items-center gap-3">
              <AlertTriangle className="w-5 h-5 text-neon-amber" />
              <div className="flex-1">
                <p className="text-sm font-medium text-neon-amber">Session Reward Cap</p>
                <p className="text-xs text-muted-foreground">
                  You're approaching the session reward limit. Start a new session to continue earning.
                </p>
              </div>
              <div className="text-right">
                <p className="text-sm font-mono">{capProgress.toFixed(1)}%</p>
                <Progress value={capProgress} className="w-24 h-1.5 mt-1" />
              </div>
            </div>
          </GlassCard>
        )}

        {/* Main Content */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Live Mining */}
          <GlassCard>
            <h3 className="font-semibold mb-4 flex items-center gap-2">
              <Activity className="w-5 h-5 text-primary" />
              Live Mining Activity
            </h3>
            
            <div className="space-y-4">
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-muted-foreground">Current Difficulty</span>
                  <span className="font-mono">{(mining.currentDifficulty / 1e6).toFixed(2)}M</span>
                </div>
                <Progress value={50} className="h-2" />
              </div>

              <div className="p-4 rounded-lg bg-secondary/30 font-mono text-sm">
                <p className="text-muted-foreground mb-2">Last Share Hash:</p>
                <p className="text-primary break-all text-xs">
                  {mining.lastShareHash || 'Not mining...'}
                </p>
              </div>

              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">Recent Shares</p>
                <AnimatePresence>
                  {shareHistory.map((share, i) => (
                    <motion.div
                      key={share.hash + share.time}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 20 }}
                      className="flex items-center justify-between p-2 rounded bg-secondary/20 text-xs"
                    >
                      <span className="font-mono text-muted-foreground">{share.hash}...</span>
                      <span className="text-neon-emerald font-mono">
                        +{share.reward.toFixed(10)} {TOKENOMICS.symbol}
                      </span>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            </div>
          </GlassCard>

          {/* Anti-Bot Protection */}
          <GlassCard>
            <h3 className="font-semibold mb-4 flex items-center gap-2">
              <Shield className="w-5 h-5 text-neon-emerald" />
              Anti-Bot Protection Active
            </h3>
            
            <div className="space-y-4">
              <div className="p-4 rounded-lg bg-secondary/30">
                <p className="text-sm font-medium mb-3">Protection Mechanisms</p>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Human Score Verification</span>
                    <span className="text-neon-emerald">✓ Active</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Rate Limiting</span>
                    <span className="text-neon-emerald">✓ Active</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Session Reward Cap</span>
                    <span className="text-neon-emerald">✓ Active</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Difficulty Adjustment</span>
                    <span className="text-neon-emerald">✓ Active</span>
                  </div>
                </div>
              </div>

              <div className="p-4 rounded-lg bg-primary/5 border border-primary/20">
                <p className="text-xs text-muted-foreground mb-2">
                  <span className="text-primary font-medium">Note:</span> This mining simulation 
                  affects <span className="text-neon-amber">rewards only</span>. Block production 
                  and transaction ordering remain under exclusive control of PoS validators.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4 text-center">
                <div className="p-3 rounded-lg bg-secondary/30">
                  <p className="text-xs text-muted-foreground">Block Time</p>
                  <p className="font-mono text-lg font-bold">120s</p>
                </div>
                <div className="p-3 rounded-lg bg-secondary/30">
                  <p className="text-xs text-muted-foreground">Min Share Interval</p>
                  <p className="font-mono text-lg font-bold">5s</p>
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4 text-center mt-4">
                <div className="p-3 rounded-lg bg-secondary/30">
                  <p className="text-xs text-muted-foreground">Max Shares/Min</p>
                  <p className="font-mono text-lg font-bold">12</p>
                </div>
                <div className="p-3 rounded-lg bg-secondary/30">
                  <p className="text-xs text-muted-foreground">Session Cap</p>
                  <p className="font-mono text-lg font-bold">{sessionCap.toFixed(2)}</p>
                </div>
              </div>
            </div>
          </GlassCard>
        </div>
      </motion.div>
    </Layout>
  );
};

const Mining = () => (
  <RequireAuth>
    <MiningContent />
  </RequireAuth>
);

export default Mining;
