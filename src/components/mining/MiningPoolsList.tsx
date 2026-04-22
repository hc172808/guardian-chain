import { useEffect, useState } from 'react';
import { GlassCard } from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Pickaxe, Users, User, LogOut, Wallet } from 'lucide-react';
import {
  listPools, getMembership, getPoolStats, joinPool, leavePool, getUserPayout,
  MiningPool, PoolStats, UserPayoutLedger,
} from '@/lib/miningPools';
import { mineBlock } from '@/lib/miner';
import { getNetworkStatus } from '@/lib/networkGuard';

interface PoolWithStats extends MiningPool { stats: PoolStats; }

export const MiningPoolsList = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [pools, setPools] = useState<PoolWithStats[]>([]);
  const [membership, setMembership] = useState<string | null>(null);
  const [payout, setPayout] = useState<UserPayoutLedger | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [mining, setMining] = useState(false);
  const [liveNodes, setLiveNodes] = useState(0);

  const load = async () => {
    const all = await listPools();
    const enriched: PoolWithStats[] = await Promise.all(
      all.map(async (p) => ({ ...p, stats: await getPoolStats(p.id) })),
    );
    setPools(enriched);
    if (user) {
      const m = await getMembership(user.id);
      setMembership(m?.pool_id ?? null);
      setPayout(await getUserPayout(user.id));
    }
    const net = await getNetworkStatus();
    setLiveNodes(net.liveNodes.length);
    setLoading(false);
  };

  useEffect(() => { load(); }, [user]);

  const handleJoin = async (poolId: string) => {
    if (!user) return;
    setBusyId(poolId);
    try {
      await joinPool(user.id, poolId);
      toast({ title: 'Joined pool', description: 'You can now mine blocks for this pool.' });
      await load();
    } catch (e: any) {
      toast({ title: 'Join failed', description: e.message, variant: 'destructive' });
    } finally {
      setBusyId(null);
    }
  };

  const handleLeave = async () => {
    if (!user) return;
    setBusyId('leave');
    try {
      await leavePool(user.id);
      toast({ title: 'Left pool' });
      await load();
    } catch (e: any) {
      toast({ title: 'Leave failed', description: e.message, variant: 'destructive' });
    } finally {
      setBusyId(null);
    }
  };

  const handleMine = async () => {
    if (!user) return;
    setMining(true);
    try {
      const block = await mineBlock(user.id);
      toast({
        title: `Block #${block.height} mined`,
        description: `Confirmed ${block.tx_count} tx, reward ${block.reward.toFixed(2)} GYDS${block.rejected.length ? `, ${block.rejected.length} rejected` : ''}.`,
      });
      await load();
    } catch (e: any) {
      toast({ title: 'Mining failed', description: e.message, variant: 'destructive' });
    } finally {
      setMining(false);
    }
  };

  if (loading) return <GlassCard className="p-6 text-center text-muted-foreground">Loading pools...</GlassCard>;

  return (
    <div className="space-y-4">
      {/* Network status + miner controls */}
      <GlassCard className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Badge variant={liveNodes > 0 ? 'default' : 'destructive'} data-testid="badge-live-nodes">
              {liveNodes > 0 ? `${liveNodes} node(s) online` : 'Network offline'}
            </Badge>
            {payout && (
              <span className="text-sm text-muted-foreground flex items-center gap-1">
                <Wallet className="h-3 w-3" /> Accrued: <span className="font-mono">{payout.accrued_gyds.toFixed(4)} GYDS</span>
              </span>
            )}
          </div>
          <Button
            onClick={handleMine}
            disabled={mining || liveNodes === 0 || !membership}
            className="gap-2"
            data-testid="button-mine-block"
          >
            {mining ? <Loader2 className="h-4 w-4 animate-spin" /> : <Pickaxe className="h-4 w-4" />}
            Mine Next Block
          </Button>
        </div>
        {!membership && (
          <p className="text-xs text-muted-foreground mt-2">Join a pool below to start mining.</p>
        )}
        {liveNodes === 0 && (
          <p className="text-xs text-destructive mt-2">No nodes are online. Mining and transactions are paused.</p>
        )}
      </GlassCard>

      {/* Pools */}
      {pools.length === 0 && (
        <GlassCard className="p-6 text-center text-sm text-muted-foreground">
          No pools have been created yet. Ask an admin to add one.
        </GlassCard>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {pools.map((p) => {
          const joined = membership === p.id;
          const Icon = p.type === 'solo' ? User : Users;
          return (
            <GlassCard
              key={p.id}
              className={`p-5 ${joined ? 'border-primary/50 ring-1 ring-primary/30' : ''} ${!p.enabled ? 'opacity-60' : ''}`}
              data-testid={`pool-card-${p.id}`}
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-primary/20"><Icon className="h-5 w-5 text-primary" /></div>
                  <div>
                    <h4 className="font-semibold">{p.name}</h4>
                    <Badge variant="outline" className="text-xs mt-1">{p.type.toUpperCase()} • {p.payout_scheme}</Badge>
                  </div>
                </div>
                {joined && <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/40">Joined</Badge>}
                {!p.enabled && <Badge variant="destructive">Disabled</Badge>}
              </div>

              {p.description && <p className="text-sm text-muted-foreground mb-3">{p.description}</p>}

              <div className="grid grid-cols-2 gap-2 text-xs mb-4">
                <Stat label="Fee" value={`${p.fee_pct}%`} />
                <Stat label="Min Payout" value={`${p.min_payout_gyds} GYDS`} />
                <Stat label="Members" value={p.stats.members} />
                <Stat label="Blocks" value={p.stats.blocks_found} />
                <Stat label="Rewards Paid" value={`${p.stats.total_rewards.toFixed(2)} GYDS`} />
                <Stat label="Capacity" value={p.max_members > 0 ? `${p.stats.members}/${p.max_members}` : '∞'} />
              </div>

              {joined ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleLeave}
                  disabled={busyId === 'leave'}
                  className="gap-2 w-full"
                  data-testid={`button-leave-${p.id}`}
                >
                  {busyId === 'leave' ? <Loader2 className="h-3 w-3 animate-spin" /> : <LogOut className="h-3 w-3" />}
                  Leave Pool
                </Button>
              ) : (
                <Button
                  size="sm"
                  disabled={!p.enabled || busyId === p.id}
                  onClick={() => handleJoin(p.id)}
                  className="w-full gap-2"
                  data-testid={`button-join-${p.id}`}
                >
                  {busyId === p.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Pickaxe className="h-3 w-3" />}
                  Join {p.type === 'solo' ? 'Solo' : 'Pool'}
                </Button>
              )}
            </GlassCard>
          );
        })}
      </div>
    </div>
  );
};

const Stat = ({ label, value }: { label: string; value: number | string }) => (
  <div className="flex items-center justify-between p-2 rounded bg-secondary/30">
    <span className="text-muted-foreground">{label}</span>
    <span className="font-mono">{value}</span>
  </div>
);
