import { useState, useEffect } from 'react';
import { GlassCard } from '../ui/GlassCard';
import { formatHashRate, MINING_REWARDS } from '@/lib/blockchain';
import { supabase } from '@/integrations/supabase/client';
import { Activity, Cpu, MonitorPlay, Loader2, Pickaxe } from 'lucide-react';

export const MiningActivity = () => {
  const [minerCount, setMinerCount] = useState(0);
  const [totalHashRate, setTotalHashRate] = useState(0);
  const [holdersCount, setHoldersCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const [nodesRes, opsRes] = await Promise.all([
        supabase
          .from('node_installations')
          .select('hash_rate, valid_shares, is_online')
          .eq('is_online', true),
        supabase
          .from('token_operations')
          .select('wallet_address')
          .eq('status', 'confirmed'),
      ]);
      if (nodesRes.data) {
        setMinerCount(nodesRes.data.length);
        setTotalHashRate(nodesRes.data.reduce((acc, n) => acc + (Number(n.hash_rate) || 0), 0));
      }
      if (opsRes.data) {
        const unique = new Set(opsRes.data.map((o) => o.wallet_address).filter(Boolean));
        setHoldersCount(unique.size);
      }
      setLoading(false);
    };
    load();
  }, []);

  return (
    <GlassCard>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <Activity className="w-5 h-5 text-primary" />
          <h3 className="text-lg font-semibold">Mining Activity</h3>
        </div>
        <div className="text-right">
          <p className="text-sm text-muted-foreground">Network Hash Rate</p>
          <p className="font-mono font-bold text-primary">
            {totalHashRate > 0 ? formatHashRate(totalHashRate) : '0 H/s'}
          </p>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : minerCount === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          <Pickaxe className="h-10 w-10 mx-auto mb-3 opacity-50" />
          <p>No active miners</p>
          <p className="text-xs mt-1">Miners will appear here once nodes are online</p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <p className="text-xs text-muted-foreground">Active Miners</p>
              <p className="font-mono font-bold">{minerCount.toLocaleString()}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Network Hash Rate</p>
              <p className="font-mono font-bold text-primary">{formatHashRate(totalHashRate)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Status</p>
              <p className="font-mono font-bold text-primary">Active</p>
            </div>
          </div>
        </div>
      )}

      {/* Mining Reward Rates - always show */}
      <div className="grid grid-cols-2 gap-3 pt-3 mt-4 border-t border-border/50">
        <div className="p-2 rounded bg-secondary/30">
          <div className="flex items-center gap-1 mb-1">
            <Cpu className="w-3 h-3 text-primary" />
            <p className="text-xs text-muted-foreground">RandomX (1 KH/s)</p>
          </div>
          <p className="font-mono text-sm text-primary">
            {MINING_REWARDS.randomx.referenceRates.dailyReward.toFixed(8)}/day
          </p>
        </div>
        <div className="p-2 rounded bg-secondary/30">
          <div className="flex items-center gap-1 mb-1">
            <MonitorPlay className="w-3 h-3 text-primary" />
            <p className="text-xs text-muted-foreground">kHeavyHash (1 TH/s)</p>
          </div>
          <p className="font-mono text-sm text-primary">
            {MINING_REWARDS.kheavyhash.referenceRates.dailyReward.toFixed(8)}/day
          </p>
        </div>
      </div>
    </GlassCard>
  );
};