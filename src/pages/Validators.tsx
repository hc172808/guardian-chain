import { useMemo } from 'react';
import { Layout } from '@/components/layout/Layout';
import { GlassCard } from '@/components/ui/GlassCard';
import { generateMockValidators } from '@/lib/blockchain';
import { motion } from 'framer-motion';
import { Users, Shield, TrendingUp, Award, CheckCircle, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Progress } from '@/components/ui/progress';

const Validators = () => {
  const validators = useMemo(() => generateMockValidators(20).sort((a, b) => b.stake - a.stake), []);
  const totalStake = validators.reduce((acc, v) => acc + v.stake, 0);
  const activeValidators = validators.filter(v => v.isActive);

  return (
    <Layout>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="space-y-6"
      >
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-3">
            <Users className="w-8 h-8 text-primary" />
            Validators
          </h1>
          <p className="text-muted-foreground mt-2">
            PoS validators securing the network
          </p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <GlassCard className="flex items-center gap-4">
            <div className="p-3 rounded-lg bg-primary/10">
              <Users className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Total Validators</p>
              <p className="text-2xl font-bold font-mono">{validators.length}</p>
            </div>
          </GlassCard>
          
          <GlassCard className="flex items-center gap-4">
            <div className="p-3 rounded-lg bg-neon-emerald/10">
              <CheckCircle className="w-5 h-5 text-neon-emerald" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Active</p>
              <p className="text-2xl font-bold font-mono text-neon-emerald">
                {activeValidators.length}
              </p>
            </div>
          </GlassCard>
          
          <GlassCard className="flex items-center gap-4">
            <div className="p-3 rounded-lg bg-neon-purple/10">
              <TrendingUp className="w-5 h-5 text-neon-purple" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Total Staked</p>
              <p className="text-2xl font-bold font-mono">
                {(totalStake / 1e6).toFixed(2)}M
              </p>
            </div>
          </GlassCard>
          
          <GlassCard className="flex items-center gap-4">
            <div className="p-3 rounded-lg bg-neon-amber/10">
              <Award className="w-5 h-5 text-neon-amber" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Avg Uptime</p>
              <p className="text-2xl font-bold font-mono">
                {(validators.reduce((acc, v) => acc + v.uptime, 0) / validators.length).toFixed(2)}%
              </p>
            </div>
          </GlassCard>
        </div>

        {/* Validator List */}
        <GlassCard className="p-0 overflow-hidden">
          <div className="p-4 border-b border-border/50 flex items-center gap-2">
            <Shield className="w-5 h-5 text-primary" />
            <h3 className="font-semibold">Validator Leaderboard</h3>
          </div>
          
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border/50 bg-secondary/20">
                  <th className="text-left p-4 text-sm font-medium text-muted-foreground">Rank</th>
                  <th className="text-left p-4 text-sm font-medium text-muted-foreground">Address</th>
                  <th className="text-left p-4 text-sm font-medium text-muted-foreground">Status</th>
                  <th className="text-right p-4 text-sm font-medium text-muted-foreground">Stake</th>
                  <th className="text-right p-4 text-sm font-medium text-muted-foreground">Stake %</th>
                  <th className="text-right p-4 text-sm font-medium text-muted-foreground">Blocks</th>
                  <th className="text-right p-4 text-sm font-medium text-muted-foreground">Uptime</th>
                </tr>
              </thead>
              <tbody>
                {validators.map((validator, index) => (
                  <motion.tr
                    key={validator.address}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.02 }}
                    className="border-b border-border/30 hover:bg-secondary/20 transition-colors"
                  >
                    <td className="p-4">
                      <span className={cn(
                        'font-mono font-bold',
                        index < 3 && 'text-neon-amber'
                      )}>
                        #{index + 1}
                      </span>
                    </td>
                    <td className="p-4">
                      <span className="font-mono text-sm">
                        {validator.address.slice(0, 10)}...{validator.address.slice(-8)}
                      </span>
                    </td>
                    <td className="p-4">
                      {validator.isActive ? (
                        <span className="flex items-center gap-1.5 text-neon-emerald text-sm">
                          <CheckCircle className="w-4 h-4" />
                          Active
                        </span>
                      ) : (
                        <span className="flex items-center gap-1.5 text-muted-foreground text-sm">
                          <XCircle className="w-4 h-4" />
                          Inactive
                        </span>
                      )}
                    </td>
                    <td className="p-4 text-right font-mono">
                      {validator.stake.toLocaleString()} CORE
                    </td>
                    <td className="p-4 text-right">
                      <div className="flex items-center gap-2 justify-end">
                        <Progress 
                          value={(validator.stake / totalStake) * 100} 
                          className="w-16 h-1.5"
                        />
                        <span className="font-mono text-sm w-12 text-right">
                          {((validator.stake / totalStake) * 100).toFixed(1)}%
                        </span>
                      </div>
                    </td>
                    <td className="p-4 text-right font-mono">
                      {validator.totalBlocks.toLocaleString()}
                    </td>
                    <td className="p-4 text-right">
                      <span className={cn(
                        'font-mono',
                        validator.uptime >= 99 ? 'text-neon-emerald' : 
                        validator.uptime >= 95 ? 'text-neon-amber' : 'text-neon-rose'
                      )}>
                        {validator.uptime.toFixed(2)}%
                      </span>
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        </GlassCard>

        {/* Info Card */}
        <GlassCard className="border-primary/30">
          <h3 className="font-semibold mb-3 flex items-center gap-2">
            <Shield className="w-5 h-5 text-primary" />
            PoS Security Model
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
            <div className="p-4 rounded-lg bg-secondary/30">
              <h4 className="font-medium text-neon-emerald mb-2">Block Finality</h4>
              <p className="text-muted-foreground">
                Blocks are finalized when 2/3+ of stake agrees. No reorganization possible after finality.
              </p>
            </div>
            <div className="p-4 rounded-lg bg-secondary/30">
              <h4 className="font-medium text-neon-amber mb-2">51% Attack Prevention</h4>
              <p className="text-muted-foreground">
                Hash power cannot influence block production. Only staked validators control consensus.
              </p>
            </div>
            <div className="p-4 rounded-lg bg-secondary/30">
              <h4 className="font-medium text-neon-purple mb-2">Slashing</h4>
              <p className="text-muted-foreground">
                Malicious validators lose their stake. Economic incentives align with network security.
              </p>
            </div>
          </div>
        </GlassCard>
      </motion.div>
    </Layout>
  );
};

export default Validators;
