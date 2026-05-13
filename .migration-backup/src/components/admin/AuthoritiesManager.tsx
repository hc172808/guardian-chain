import { useMemo, useState } from 'react';
import { GlassCard } from '@/components/ui/GlassCard';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useAuthorities, type Authority } from '@/hooks/useAuthorities';
import { useAuth } from '@/contexts/AuthContext';
import { Shield, AlertTriangle, Search, Lock } from 'lucide-react';

export const AuthoritiesManager = () => {
  const { rows, loading, byCategory, disabledCount, total, toggle } = useAuthorities();
  const { isFounder, isAdmin } = useAuth();
  const { toast } = useToast();
  const [filter, setFilter] = useState('');

  const canToggle = (a: Authority) => {
    if (a.required_role === 'founder') return isFounder;
    return isFounder || isAdmin;
  };

  const filtered = useMemo(() => {
    if (!filter.trim()) return byCategory;
    const f = filter.toLowerCase();
    const out: Record<string, Authority[]> = {};
    for (const [cat, list] of Object.entries(byCategory)) {
      const match = list.filter(
        (a) => a.name.toLowerCase().includes(f) || a.description.toLowerCase().includes(f) || a.id.toLowerCase().includes(f),
      );
      if (match.length) out[cat] = match;
    }
    return out;
  }, [byCategory, filter]);

  const handleToggle = async (a: Authority, next: boolean) => {
    if (!canToggle(a)) {
      toast({ title: 'Permission denied', description: `Only ${a.required_role}s can toggle ${a.name}.`, variant: 'destructive' });
      return;
    }
    const { error } = await toggle(a.id, next);
    if (error) {
      toast({ title: 'Update failed', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: `${a.name} ${next ? 'enabled' : 'disabled'}` });
    }
  };

  const setCategory = async (cat: string, enabled: boolean) => {
    const list = byCategory[cat] || [];
    for (const a of list) {
      if (a.enabled !== enabled && canToggle(a)) {
        await toggle(a.id, enabled);
      }
    }
    toast({ title: `Category "${cat}" ${enabled ? 'enabled' : 'disabled'}` });
  };

  return (
    <div className="space-y-4">
      <GlassCard className="p-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-lg bg-primary/20">
              <Shield className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h3 className="font-semibold text-lg">Chain Authorities</h3>
              <p className="text-sm text-muted-foreground">
                {total} authorities total · <span className={disabledCount > 0 ? 'text-yellow-500' : 'text-emerald-500'}>{disabledCount} disabled</span>
              </p>
            </div>
          </div>
          <div className="relative w-full md:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Search authorities…" className="pl-9" />
          </div>
        </div>
      </GlassCard>

      {loading && <GlassCard className="p-12 text-center text-muted-foreground">Loading authorities…</GlassCard>}

      {!loading && Object.entries(filtered).map(([cat, list]) => (
        <GlassCard key={cat} className="p-6 space-y-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2">
              <h4 className="font-semibold">{cat}</h4>
              <Badge variant="outline">{list.length}</Badge>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => setCategory(cat, true)}>Enable all</Button>
              <Button size="sm" variant="outline" onClick={() => setCategory(cat, false)}>Disable all</Button>
            </div>
          </div>
          <div className="grid gap-2">
            {list.map((a) => {
              const locked = !canToggle(a);
              const isCritical = a.id === 'emergency_shutdown' || a.id === 'validator' || a.id === 'consensus_rules';
              return (
                <div key={a.id} className="flex items-start justify-between gap-3 p-3 rounded-lg bg-secondary/30">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium truncate">{a.name}</span>
                      <Badge variant="outline" className="text-xs">{a.required_role}</Badge>
                      {isCritical && (
                        <Badge variant="outline" className="text-xs text-yellow-500 border-yellow-500 gap-1">
                          <AlertTriangle className="h-3 w-3" /> critical
                        </Badge>
                      )}
                      {!a.enabled && <Badge variant="destructive" className="text-xs">disabled</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">{a.description}</p>
                    <code className="text-[10px] text-muted-foreground/70">{a.id}</code>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {locked && <Lock className="h-3 w-3 text-muted-foreground" />}
                    <Switch checked={a.enabled} disabled={locked} onCheckedChange={(v) => handleToggle(a, v)} />
                  </div>
                </div>
              );
            })}
          </div>
        </GlassCard>
      ))}
    </div>
  );
};
