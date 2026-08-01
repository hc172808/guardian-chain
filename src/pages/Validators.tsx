import { useState, useEffect, useCallback } from 'react';
import { Layout } from '@/components/layout/Layout';
import { GlassCard } from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/button';
import { motion } from 'framer-motion';
import { Users, Shield, TrendingUp, Award, CheckCircle, XCircle, Loader2, ArrowUpRight, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Progress } from '@/components/ui/progress';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { DelegateModal } from '@/components/validators/DelegateModal';
import { MyDelegations } from '@/components/validators/MyDelegations';
import { StakingCalculator } from '@/components/validators/StakingCalculator';

interface Validator {
  id: string;
  address: string;
  name: string | null;
  stake: number;
  commission: number;
  is_active: boolean;
  is_jailed: boolean;
  uptime: number;
  blocks_proposed: number;
}

interface NetSnapshot {
  block_height: number;
  tps: number;
  active_validators: number;
  total_stake: string;
  captured_at: string;
}

const Validators = () => {
  const { user } = useAuth();
  const [validators, setValidators] = useState<Validator[]>([]);
  const [loading, setLoading] = useState(true);
  const [delegateTarget, setDelegateTarget] = useState<Validator | null>(null);
  const [delegateOpen, setDelegateOpen] = useState(false);
  const [snapshots, setSnapshots] = useState<NetSnapshot[]>([]);
  const [snapshotLoading, setSnapshotLoading] = useState(false);

  const fetchValidators = async () => {
    const { data } = await supabase
      .from('network_validators')
      .select('*')
      .order('stake', { ascending: false });
    if (data) setValidators(data as unknown as Validator[]);
    setLoading(false);
  };

  const fetchSnapshots = useCallback(async () => {
    setSnapshotLoading(true);
    try {
      const res = await fetch('/api/network-snapshots?hours=720', { credentials: 'include' });
      if (res.ok) setSnapshots(await res.json());
    } finally { setSnapshotLoading(false); }
  }, []);

  useEffect(() => { fetchValidators(); }, []);
  useEffect(() => { fetchSnapshots(); }, [fetchSnapshots]);

  const totalStake = validators.reduce((acc, v) => acc + Number(v.stake), 0);
  const activeValidators = validators.filter(v => v.is_active);
  const avgUptime = validators.length > 0
    ? validators.reduce((acc, v) => acc + Number(v.uptime), 0) / validators.length
    : 0;

  return (
    <Layout>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-3">
            <Users className="w-8 h-8 text-primary" />
            Validators
          </h1>
          <p className="text-muted-foreground mt-2">PoS validators securing the network — delegate GYDS to earn rewards</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <GlassCard className="flex items-center gap-4">
            <div className="p-3 rounded-lg bg-primary/10"><Users className="w-5 h-5 text-primary" /></div>
            <div>
              <p className="text-sm text-muted-foreground">Total Validators</p>
              <p className="text-2xl font-bold font-mono">{validators.length}</p>
            </div>
          </GlassCard>
          <GlassCard className="flex items-center gap-4">
            <div className="p-3 rounded-lg bg-primary/10"><CheckCircle className="w-5 h-5 text-primary" /></div>
            <div>
              <p className="text-sm text-muted-foreground">Active</p>
              <p className="text-2xl font-bold font-mono text-primary">{activeValidators.length}</p>
            </div>
          </GlassCard>
          <GlassCard className="flex items-center gap-4">
            <div className="p-3 rounded-lg bg-primary/10"><TrendingUp className="w-5 h-5 text-primary" /></div>
            <div>
              <p className="text-sm text-muted-foreground">Total Staked</p>
              <p className="text-2xl font-bold font-mono">{totalStake >= 1e6 ? `${(totalStake / 1e6).toFixed(2)}M` : totalStake.toLocaleString()}</p>
            </div>
          </GlassCard>
          <GlassCard className="flex items-center gap-4">
            <div className="p-3 rounded-lg bg-primary/10"><Award className="w-5 h-5 text-primary" /></div>
            <div>
              <p className="text-sm text-muted-foreground">Avg Uptime</p>
              <p className="text-2xl font-bold font-mono">{avgUptime.toFixed(2)}%</p>
            </div>
          </GlassCard>
        </div>

        {/* Staking Rewards Calculator */}
        <StakingCalculator validators={validators} />

        {/* My Delegations - only for logged-in users */}
        {user && (
          <MyDelegations validators={validators} onUpdate={fetchValidators} />
        )}

        <GlassCard className="p-0 overflow-hidden">
          <div className="p-4 border-b border-border/50 flex items-center gap-2">
            <Shield className="w-5 h-5 text-primary" />
            <h3 className="font-semibold">Validator Leaderboard</h3>
          </div>

          {loading ? (
            <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
          ) : validators.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Users className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>No validators registered yet</p>
              <p className="text-xs mt-1">Validators are managed by network administrators</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border/50 bg-secondary/20">
                    <th className="text-left p-4 text-sm font-medium text-muted-foreground">Rank</th>
                    <th className="text-left p-4 text-sm font-medium text-muted-foreground">Validator</th>
                    <th className="text-left p-4 text-sm font-medium text-muted-foreground">Status</th>
                    <th className="text-right p-4 text-sm font-medium text-muted-foreground">Stake</th>
                    <th className="text-right p-4 text-sm font-medium text-muted-foreground">Stake %</th>
                    <th className="text-right p-4 text-sm font-medium text-muted-foreground">Blocks</th>
                    <th className="text-right p-4 text-sm font-medium text-muted-foreground">Uptime</th>
                    {user && <th className="text-right p-4 text-sm font-medium text-muted-foreground">Action</th>}
                  </tr>
                </thead>
                <tbody>
                  {validators.map((validator, index) => (
                    <motion.tr
                      key={validator.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.02 }}
                      className="border-b border-border/30 hover:bg-secondary/20 transition-colors"
                    >
                      <td className="p-4">
                        <span className={cn('font-mono font-bold', index < 3 && 'text-primary')}>
                          #{index + 1}
                        </span>
                      </td>
                      <td className="p-4">
                        <div>
                          {validator.name && <p className="text-sm font-medium">{validator.name}</p>}
                          <span className="font-mono text-xs text-muted-foreground">
                            {(validator.address ?? '').slice(0, 10)}...{(validator.address ?? '').slice(-8)}
                          </span>
                        </div>
                      </td>
                      <td className="p-4">
                        {validator.is_jailed ? (
                          <span className="flex items-center gap-1.5 text-destructive text-sm">
                            <XCircle className="w-4 h-4" /> Jailed
                          </span>
                        ) : validator.is_active ? (
                          <span className="flex items-center gap-1.5 text-primary text-sm">
                            <CheckCircle className="w-4 h-4" /> Active
                          </span>
                        ) : (
                          <span className="flex items-center gap-1.5 text-muted-foreground text-sm">
                            <XCircle className="w-4 h-4" /> Inactive
                          </span>
                        )}
                      </td>
                      <td className="p-4 text-right font-mono">
                        {Number(validator.stake).toLocaleString()} GYDS
                      </td>
                      <td className="p-4 text-right">
                        <div className="flex items-center gap-2 justify-end">
                          <Progress
                            value={totalStake > 0 ? (Number(validator.stake) / totalStake) * 100 : 0}
                            className="w-16 h-1.5"
                          />
                          <span className="font-mono text-sm w-12 text-right">
                            {totalStake > 0 ? ((Number(validator.stake) / totalStake) * 100).toFixed(1) : '0.0'}%
                          </span>
                        </div>
                      </td>
                      <td className="p-4 text-right font-mono">
                        {Number(validator.blocks_proposed).toLocaleString()}
                      </td>
                      <td className="p-4 text-right">
                        <span className={cn(
                          'font-mono',
                          Number(validator.uptime) >= 99 ? 'text-primary' :
                          Number(validator.uptime) >= 95 ? 'text-yellow-500' : 'text-destructive'
                        )}>
                          {Number(validator.uptime).toFixed(2)}%
                        </span>
                      </td>
                      {user && (
                        <td className="p-4 text-right">
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-1 text-xs"
                            disabled={!validator.is_active || validator.is_jailed}
                            onClick={() => { setDelegateTarget(validator); setDelegateOpen(true); }}
                          >
                            <ArrowUpRight className="h-3 w-3" />
                            Delegate
                          </Button>
                        </td>
                      )}
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </GlassCard>

        {/* Validator Performance History — real network_snapshots data */}
        <GlassCard className="p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-primary" /> Network Performance History
            </h3>
            <Button variant="ghost" size="sm" onClick={fetchSnapshots} disabled={snapshotLoading} className="h-7 gap-1 text-xs">
              <RefreshCw className={`w-3 h-3 ${snapshotLoading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
          {snapshots.length === 0 ? (
            <p className="text-xs text-muted-foreground py-4 text-center">
              {snapshotLoading ? 'Loading…' : 'No snapshot data yet — data accumulates as the chain cron runs.'}
            </p>
          ) : (
            <div className="space-y-4">
              {/* Active Validators chart */}
              {(() => {
                const vals = snapshots.map(s => Number(s.active_validators));
                const max = Math.max(...vals, 1);
                const avg = (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1);
                return (
                  <div>
                    <div className="flex justify-between text-xs text-muted-foreground mb-1">
                      <span>Active Validators</span><span>{avg} avg</span>
                    </div>
                    <div className="flex items-end gap-px h-12 bg-muted/10 rounded-lg p-1">
                      {vals.map((v, i) => (
                        <div key={i} className="flex-1 flex flex-col justify-end h-full">
                          <div className="w-full rounded-t bg-emerald-500/60" style={{ height: `${(v / max) * 100}%`, minHeight: 2 }}
                            title={`${new Date(snapshots[i].captured_at).toLocaleDateString()}: ${v} validators`} />
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}
              {/* TPS chart */}
              {(() => {
                const vals = snapshots.map(s => Number(s.tps));
                const max = Math.max(...vals, 1);
                const avg = (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(2);
                return (
                  <div>
                    <div className="flex justify-between text-xs text-muted-foreground mb-1">
                      <span>TPS</span><span>{avg} avg</span>
                    </div>
                    <div className="flex items-end gap-px h-12 bg-muted/10 rounded-lg p-1">
                      {vals.map((v, i) => (
                        <div key={i} className="flex-1 flex flex-col justify-end h-full">
                          <div className="w-full rounded-t bg-primary/60" style={{ height: `${(v / max) * 100}%`, minHeight: 2 }}
                            title={`${new Date(snapshots[i].captured_at).toLocaleDateString()}: ${v} TPS`} />
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}
              {/* Total Stake chart */}
              {(() => {
                const vals = snapshots.map(s => Number(s.total_stake));
                const max = Math.max(...vals, 1);
                const latest = vals[vals.length - 1];
                const fmtStake = (v: number) => v >= 1e9 ? `${(v / 1e9).toFixed(2)}B` : v >= 1e6 ? `${(v / 1e6).toFixed(2)}M` : v.toLocaleString();
                return (
                  <div>
                    <div className="flex justify-between text-xs text-muted-foreground mb-1">
                      <span>Total Stake (GYDS)</span><span>{fmtStake(latest)} latest</span>
                    </div>
                    <div className="flex items-end gap-px h-12 bg-muted/10 rounded-lg p-1">
                      {vals.map((v, i) => (
                        <div key={i} className="flex-1 flex flex-col justify-end h-full">
                          <div className="w-full rounded-t bg-amber-500/60" style={{ height: `${(v / max) * 100}%`, minHeight: 2 }}
                            title={`${new Date(snapshots[i].captured_at).toLocaleDateString()}: ${fmtStake(v)} GYDS`} />
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}
            </div>
          )}
          <p className="text-xs text-muted-foreground">{snapshots.length} snapshots · last 30 days · populated by the DB pruner cron every hour.</p>
        </GlassCard>

        <GlassCard className="border-primary/30">
          <h3 className="font-semibold mb-3 flex items-center gap-2">
            <Shield className="w-5 h-5 text-primary" />
            PoS Security Model
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
            <div className="p-4 rounded-lg bg-secondary/30">
              <h4 className="font-medium text-primary mb-2">Block Finality</h4>
              <p className="text-muted-foreground">Blocks are finalized when 2/3+ of stake agrees. No reorganization possible after finality.</p>
            </div>
            <div className="p-4 rounded-lg bg-secondary/30">
              <h4 className="font-medium text-primary mb-2">51% Attack Prevention</h4>
              <p className="text-muted-foreground">Hash power cannot influence block production. Only staked validators control consensus.</p>
            </div>
            <div className="p-4 rounded-lg bg-secondary/30">
              <h4 className="font-medium text-primary mb-2">Slashing</h4>
              <p className="text-muted-foreground">Malicious validators lose their stake. Economic incentives align with network security.</p>
            </div>
          </div>
        </GlassCard>

        <DelegateModal
          open={delegateOpen}
          onOpenChange={setDelegateOpen}
          validator={delegateTarget}
          onSuccess={fetchValidators}
        />
      </motion.div>
    </Layout>
  );
};

export default Validators;
