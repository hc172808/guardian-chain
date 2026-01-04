import { useState, useEffect, useCallback } from 'react';
import { Layout } from '@/components/layout/Layout';
import { GlassCard } from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/button';
import { ANTI_BOT_FORMULAS, DIFFICULTY_FORMULAS, formatHashRate, generateHash } from '@/lib/blockchain';
import { motion, AnimatePresence } from 'framer-motion';
import { Pickaxe, Play, Pause, RefreshCw, Zap, Shield, Activity, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Progress } from '@/components/ui/progress';

interface MiningState {
  isActive: boolean;
  hashRate: number;
  validShares: number;
  invalidShares: number;
  totalReward: number;
  currentDifficulty: number;
  humanScore: number;
  sessionDuration: number;
  lastShareHash: string;
}

const Mining = () => {
  const [mining, setMining] = useState<MiningState>({
    isActive: false,
    hashRate: 0,
    validShares: 0,
    invalidShares: 0,
    totalReward: 0,
    currentDifficulty: 1000000,
    humanScore: 85,
    sessionDuration: 0,
    lastShareHash: '',
  });

  const [shareHistory, setShareHistory] = useState<{ hash: string; valid: boolean; reward: number; time: number }[]>([]);

  // Simulate mining
  useEffect(() => {
    if (!mining.isActive) return;

    const interval = setInterval(() => {
      setMining(prev => {
        const isValid = Math.random() > 0.05; // 95% valid shares
        const reward = isValid ? (0.001 / (prev.currentDifficulty / 1000000)) : 0;
        const newHashRate = 1e6 + Math.random() * 5e5; // ~1-1.5 MH/s simulated
        
        // Calculate session reward cap
        const sessionCap = ANTI_BOT_FORMULAS.sessionRewardCap(prev.sessionDuration, 10);
        const actualReward = prev.totalReward < sessionCap ? reward : 0;

        if (isValid) {
          setShareHistory(h => [{
            hash: generateHash().slice(0, 16),
            valid: true,
            reward: actualReward,
            time: Date.now(),
          }, ...h.slice(0, 9)]);
        }

        return {
          ...prev,
          hashRate: newHashRate,
          validShares: prev.validShares + (isValid ? 1 : 0),
          invalidShares: prev.invalidShares + (isValid ? 0 : 1),
          totalReward: prev.totalReward + actualReward,
          sessionDuration: prev.sessionDuration + 500,
          lastShareHash: generateHash(),
          // Adjust difficulty based on hash rate
          currentDifficulty: DIFFICULTY_FORMULAS.minerDifficulty(
            prev.currentDifficulty,
            newHashRate,
            1e6
          ),
        };
      });
    }, 500);

    return () => clearInterval(interval);
  }, [mining.isActive]);

  const toggleMining = () => {
    setMining(prev => ({ ...prev, isActive: !prev.isActive }));
  };

  const resetMining = () => {
    setMining({
      isActive: false,
      hashRate: 0,
      validShares: 0,
      invalidShares: 0,
      totalReward: 0,
      currentDifficulty: 1000000,
      humanScore: 85,
      sessionDuration: 0,
      lastShareHash: '',
    });
    setShareHistory([]);
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
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-3">
              <Pickaxe className="w-8 h-8 text-primary" />
              Mining Simulator
            </h1>
            <p className="text-muted-foreground mt-2">
              CPU/Browser mining demonstration (rewards only, no consensus influence)
            </p>
          </div>
          
          <div className="flex gap-3">
            <Button
              onClick={toggleMining}
              variant={mining.isActive ? "destructive" : "default"}
              size="lg"
              className={cn(
                mining.isActive && 'animate-mining'
              )}
            >
              {mining.isActive ? (
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

        {/* Mining Stats */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <GlassCard glow={mining.isActive}>
            <div className="flex items-center gap-3 mb-3">
              <Zap className={cn(
                'w-5 h-5',
                mining.isActive ? 'text-neon-amber animate-pulse' : 'text-muted-foreground'
              )} />
              <span className="text-sm text-muted-foreground">Hash Rate</span>
            </div>
            <p className="text-2xl font-bold font-mono text-gradient-primary">
              {formatHashRate(mining.hashRate)}
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
              {mining.totalReward.toFixed(6)} <span className="text-sm text-muted-foreground">CORE</span>
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
                        +{share.reward.toFixed(6)} CORE
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
                  <p className="text-xs text-muted-foreground">Max Shares/Min</p>
                  <p className="font-mono text-lg font-bold">
                    {ANTI_BOT_FORMULAS.maxSharesPerMinute(mining.currentDifficulty, mining.humanScore)}
                  </p>
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

export default Mining;
