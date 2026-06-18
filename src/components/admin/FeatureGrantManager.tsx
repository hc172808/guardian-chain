import { useState, useEffect, useCallback } from 'react';
import { GlassCard } from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { Search, Key, Check, X, Shield, Crown, User } from 'lucide-react';

interface AdminUser {
  id: string;
  email: string | null;
  username: string | null;
  firstName: string | null;
  lastName: string | null;
  isBanned: boolean | null;
  roles: string[];
  primaryRole: 'user' | 'admin' | 'founder';
}

interface FeatureDef {
  key: string;
  label: string;
  group: string;
}

interface UserFeature {
  feature_key: string;
  enabled: boolean;
}

export const FeatureGrantManager = () => {
  const { toast } = useToast();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);
  const [features, setFeatures] = useState<FeatureDef[]>([]);
  const [userFeatures, setUserFeatures] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [bulkAction, setBulkAction] = useState(false);

  const loadUsers = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/users', { credentials: 'include' });
      if (res.ok) setUsers(await res.json());
    } catch {}
    setLoading(false);
  };

  const loadFeatures = async () => {
    try {
      const res = await fetch('/api/admin/feature-definitions', { credentials: 'include' });
      if (res.ok) setFeatures(await res.json());
    } catch {}
  };

  const loadUserFeatures = async (userId: string) => {
    try {
      const res = await fetch(`/api/admin/user-features/${userId}`, { credentials: 'include' });
      if (res.ok) {
        const rows: UserFeature[] = await res.json();
        const map: Record<string, boolean> = {};
        rows.forEach((r) => {
          if (r.enabled) map[r.feature_key] = true;
        });
        setUserFeatures(map);
      }
    } catch {}
  };

  useEffect(() => { loadUsers(); loadFeatures(); }, []);

  const selectUser = useCallback((u: AdminUser) => {
    setSelectedUser(u);
    setUserFeatures({});
    loadUserFeatures(u.id);
  }, []);

  const toggleFeature = async (featureKey: string) => {
    if (!selectedUser) return;
    const next = !userFeatures[featureKey];
    setSaving(featureKey);
    try {
      const res = await fetch(`/api/admin/user-features/${selectedUser.id}`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ featureKey, enabled: next }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      setUserFeatures(prev => ({ ...prev, [featureKey]: next }));
      toast({
        title: next ? 'Feature Granted' : 'Feature Revoked',
        description: `${featureKey} ${next ? 'enabled' : 'disabled'} for ${selectedUser.username || selectedUser.email || 'user'}.`,
      });
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally {
      setSaving(null);
    }
  };

  const grantAll = async () => {
    if (!selectedUser) return;
    setBulkAction(true);
    try {
      const res = await fetch(`/api/admin/user-features/${selectedUser.id}/grant-all`, {
        method: 'POST', credentials: 'include',
      });
      if (!res.ok) throw new Error((await res.json()).error);
      const map: Record<string, boolean> = {};
      features.forEach(f => map[f.key] = true);
      setUserFeatures(map);
      toast({ title: 'All Features Granted', description: `${selectedUser.username || selectedUser.email} can now access all features.` });
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally { setBulkAction(false); }
  };

  const revokeAll = async () => {
    if (!selectedUser) return;
    setBulkAction(true);
    try {
      const res = await fetch(`/api/admin/user-features/${selectedUser.id}/revoke-all`, {
        method: 'POST', credentials: 'include',
      });
      if (!res.ok) throw new Error((await res.json()).error);
      setUserFeatures({});
      toast({ title: 'All Features Revoked', description: `${selectedUser.username || selectedUser.email} can no longer access any features.` });
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally { setBulkAction(false); }
  };

  const filtered = users.filter(u =>
    (u.username?.toLowerCase() || '').includes(search.toLowerCase()) ||
    (u.email?.toLowerCase() || '').includes(search.toLowerCase()) ||
    (u.firstName?.toLowerCase() || '').includes(search.toLowerCase()) ||
    (u.lastName?.toLowerCase() || '').includes(search.toLowerCase())
  );

  const groups = features.reduce<Record<string, FeatureDef[]>>((acc, f) => {
    (acc[f.group] ||= []).push(f);
    return acc;
  }, {});

  const getRoleIcon = (role: string) => {
    if (role === 'founder') return <Crown className="w-3 h-3 text-amber-400" />;
    if (role === 'admin') return <Shield className="w-3 h-3 text-primary" />;
    return <User className="w-3 h-3 text-muted-foreground" />;
  };

  return (
    <div className="space-y-6">
      <GlassCard className="p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-3 rounded-lg bg-primary/20">
            <Key className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h3 className="font-semibold text-lg">Feature Grant Manager</h3>
            <p className="text-sm text-muted-foreground">
              Grant or revoke individual features per user. Admins and founders always see everything.
            </p>
          </div>
        </div>

        {/* User search */}
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search users by username, email, or name..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-10 bg-secondary/30"
          />
        </div>

        {/* User list */}
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading users...</p>
        ) : (
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {filtered.length === 0 ? (
              <p className="text-sm text-muted-foreground">No users found.</p>
            ) : (
              filtered.map(u => (
                <button
                  key={u.id}
                  onClick={() => selectUser(u)}
                  className={`w-full flex items-center gap-3 p-3 rounded-lg text-left transition-colors ${
                    selectedUser?.id === u.id
                      ? 'bg-primary/10 border border-primary/30'
                      : 'bg-secondary/30 hover:bg-secondary/50 border border-transparent'
                  }`}
                >
                  {getRoleIcon(u.primaryRole)}
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm truncate">
                      {u.username || u.email || 'Unnamed'}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {u.email || u.id.slice(0, 8)} · {u.primaryRole}
                    </div>
                  </div>
                  {u.isBanned && <Badge variant="destructive" className="text-xs">Banned</Badge>}
                </button>
              ))
            )}
          </div>
        )}
      </GlassCard>

      {/* Feature grid for selected user */}
      {selectedUser && (
        <GlassCard className="p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-semibold text-lg">
                Features for {selectedUser.username || selectedUser.email || selectedUser.id.slice(0, 8)}
              </h3>
              <p className="text-sm text-muted-foreground">
                Toggle each feature to grant or revoke access.
              </p>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" className="text-xs gap-1" onClick={grantAll} disabled={bulkAction}>
                <Check className="w-3 h-3" /> Grant All
              </Button>
              <Button size="sm" variant="outline" className="text-xs gap-1 text-destructive hover:bg-destructive/10" onClick={revokeAll} disabled={bulkAction}>
                <X className="w-3 h-3" /> Revoke All
              </Button>
            </div>
          </div>

          <div className="space-y-6">
            {Object.entries(groups).map(([group, items]) => (
              <div key={group}>
                <h4 className="text-sm font-medium text-muted-foreground mb-2">{group}</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {items.map(f => {
                    const isGranted = userFeatures[f.key] || false;
                    return (
                      <div
                        key={f.key}
                        className="flex items-center justify-between p-3 rounded-lg bg-secondary/30 hover:bg-secondary/50 transition-colors"
                      >
                        <div className="flex items-center gap-2">
                          <div className={`w-2 h-2 rounded-full ${isGranted ? 'bg-emerald-400' : 'bg-destructive'}`} />
                          <span className="text-sm">{f.label}</span>
                        </div>
                        <Switch
                          checked={isGranted}
                          onCheckedChange={() => toggleFeature(f.key)}
                          disabled={saving === f.key}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </GlassCard>
      )}
    </div>
  );
};
