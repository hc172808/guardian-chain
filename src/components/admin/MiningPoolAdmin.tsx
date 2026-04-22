import { useEffect, useState } from 'react';
import { GlassCard } from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { Loader2, Plus, Save, Trash2, Pickaxe, Users, User } from 'lucide-react';
import { listPools, savePools, MiningPool, PoolType, PayoutScheme } from '@/lib/miningPools';

const newBlankPool = (): MiningPool => ({
  id: `pool-${Date.now().toString(36)}`,
  name: 'New Pool',
  type: 'group',
  fee_pct: 1,
  min_payout_gyds: 10,
  payout_scheme: 'PPS',
  enabled: true,
  max_members: 0,
  description: '',
  created_at: new Date().toISOString(),
});

export const MiningPoolAdmin = () => {
  const { toast } = useToast();
  const { user } = useAuth();
  const [pools, setPools] = useState<MiningPool[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      setPools(await listPools());
      setLoading(false);
    })();
  }, []);

  const update = (id: string, patch: Partial<MiningPool>) =>
    setPools((p) => p.map((x) => (x.id === id ? { ...x, ...patch } : x)));

  const remove = (id: string) => setPools((p) => p.filter((x) => x.id !== id));
  const addPool = () => setPools((p) => [...p, newBlankPool()]);

  const save = async () => {
    if (!user) return;
    setSaving(true);
    try {
      await savePools(pools, user.id);
      toast({ title: 'Pools saved', description: `${pools.length} mining pool(s) updated.` });
    } catch (e: any) {
      toast({ title: 'Save failed', description: e.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <GlassCard className="p-6 text-center text-muted-foreground">Loading pools...</GlassCard>;

  return (
    <GlassCard className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/20"><Pickaxe className="h-5 w-5 text-primary" /></div>
          <div>
            <h3 className="font-semibold text-lg">Mining Pools</h3>
            <p className="text-sm text-muted-foreground">Create, configure, and disable mining pools that users can join.</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={addPool} className="gap-2" data-testid="button-add-pool">
            <Plus className="h-4 w-4" /> Add Pool
          </Button>
          <Button size="sm" onClick={save} disabled={saving} className="gap-2" data-testid="button-save-pools">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save All
          </Button>
        </div>
      </div>

      {pools.length === 0 && (
        <div className="text-center py-8 text-muted-foreground text-sm">No pools defined. Click "Add Pool".</div>
      )}

      <div className="space-y-4">
        {pools.map((p) => (
          <div
            key={p.id}
            className={`p-4 rounded-lg border ${p.enabled ? 'border-border bg-secondary/30' : 'border-border/50 bg-secondary/10 opacity-70'}`}
            data-testid={`pool-row-${p.id}`}
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                {p.type === 'solo' ? <User className="h-4 w-4 text-muted-foreground" /> : <Users className="h-4 w-4 text-muted-foreground" />}
                <Input
                  value={p.name}
                  onChange={(e) => update(p.id, { name: e.target.value })}
                  className="font-semibold w-64"
                  data-testid={`input-pool-name-${p.id}`}
                />
                <Badge variant="outline">{p.id}</Badge>
              </div>
              <div className="flex items-center gap-3">
                <Switch
                  checked={p.enabled}
                  onCheckedChange={(v) => update(p.id, { enabled: v })}
                  data-testid={`switch-pool-enabled-${p.id}`}
                />
                <Button size="icon" variant="ghost" onClick={() => remove(p.id)} data-testid={`button-delete-pool-${p.id}`}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Type</Label>
                <Select value={p.type} onValueChange={(v: PoolType) => update(p.id, { type: v })}>
                  <SelectTrigger data-testid={`select-pool-type-${p.id}`}><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="solo">Solo</SelectItem>
                    <SelectItem value="group">Group</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Fee %</Label>
                <Input
                  type="number" min={0} max={100} step="0.1"
                  value={p.fee_pct}
                  onChange={(e) => update(p.id, { fee_pct: parseFloat(e.target.value) || 0 })}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Min Payout (GYDS)</Label>
                <Input
                  type="number" min={0}
                  value={p.min_payout_gyds}
                  onChange={(e) => update(p.id, { min_payout_gyds: parseFloat(e.target.value) || 0 })}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Payout Scheme</Label>
                <Select value={p.payout_scheme} onValueChange={(v: PayoutScheme) => update(p.id, { payout_scheme: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PPS">PPS — Pay Per Share</SelectItem>
                    <SelectItem value="PPLNS">PPLNS — Pay Per Last N Shares</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Max Members (0 = ∞)</Label>
                <Input
                  type="number" min={0}
                  value={p.max_members}
                  onChange={(e) => update(p.id, { max_members: parseInt(e.target.value) || 0 })}
                />
              </div>
            </div>

            <div className="mt-3 space-y-1">
              <Label className="text-xs">Description</Label>
              <Input
                value={p.description ?? ''}
                onChange={(e) => update(p.id, { description: e.target.value })}
                placeholder="What is this pool for?"
              />
            </div>
          </div>
        ))}
      </div>
    </GlassCard>
  );
};
