import { useState, useEffect, useCallback } from 'react';
import { GlassCard } from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import {
  Users,
  RefreshCw,
  ShieldCheck,
  UserCheck,
  User,
  Search,
  Crown,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

type Role = 'user' | 'admin' | 'founder';

interface WalletUser {
  id: string;
  wallet_address: string;
  ens_name: string | null;
  role: string;
  created_at: string;
  updated_at: string;
}

const ROLE_META: Record<Role, { label: string; color: string; icon: React.ReactNode }> = {
  user:    { label: 'User',    color: 'text-muted-foreground border-muted-foreground', icon: <User className="h-3 w-3" /> },
  admin:   { label: 'Admin',   color: 'text-primary border-primary',                  icon: <ShieldCheck className="h-3 w-3" /> },
  founder: { label: 'Founder', color: 'text-yellow-500 border-yellow-500',            icon: <Crown className="h-3 w-3" /> },
};

export const RoleManager = () => {
  const { walletUser } = useAuth();
  const { toast } = useToast();
  const [users, setUsers] = useState<WalletUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/wallet-users', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();
      setUsers(data.users);
    } catch {
      toast({ title: 'Failed to load wallet users', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  const handleRoleChange = async (userId: string, newRole: Role) => {
    if (userId === walletUser?.id && newRole !== 'founder') {
      toast({ title: 'Cannot demote yourself', variant: 'destructive' });
      return;
    }
    setUpdating(userId);
    try {
      const res = await fetch(`/api/admin/wallet-users/${userId}/role`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: newRole }),
      });
      if (!res.ok) throw new Error('Failed to update');
      setUsers((prev) => prev.map((u) => u.id === userId ? { ...u, role: newRole } : u));
      toast({ title: `Role updated to ${newRole}` });
    } catch {
      toast({ title: 'Failed to update role', variant: 'destructive' });
    } finally {
      setUpdating(null);
    }
  };

  const filtered = users.filter((u) => {
    const q = search.toLowerCase();
    return (
      u.wallet_address.toLowerCase().includes(q) ||
      (u.ens_name ?? '').toLowerCase().includes(q) ||
      u.role.toLowerCase().includes(q)
    );
  });

  const counts = { user: 0, admin: 0, founder: 0 } as Record<string, number>;
  users.forEach((u) => { counts[u.role] = (counts[u.role] ?? 0) + 1; });

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4">
        {(Object.entries(ROLE_META) as [Role, typeof ROLE_META[Role]][]).map(([role, meta]) => (
          <GlassCard key={role} className="p-4 text-center">
            <div className="flex justify-center mb-2">
              <div className={`p-2 rounded-lg ${role === 'founder' ? 'bg-yellow-500/10' : role === 'admin' ? 'bg-primary/10' : 'bg-muted/20'}`}>
                {role === 'founder' ? <Crown className="h-5 w-5 text-yellow-500" /> :
                 role === 'admin'   ? <ShieldCheck className="h-5 w-5 text-primary" /> :
                 <User className="h-5 w-5 text-muted-foreground" />}
              </div>
            </div>
            <p className="text-2xl font-bold">{counts[role] ?? 0}</p>
            <p className="text-sm text-muted-foreground">{meta.label}s</p>
          </GlassCard>
        ))}
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by address or ENS name…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Button variant="outline" onClick={fetchUsers} className="gap-2 shrink-0">
          <RefreshCw className="h-4 w-4" />
          Refresh
        </Button>
      </div>

      {/* User list */}
      {loading ? (
        <GlassCard className="p-8 text-center">
          <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-2 text-muted-foreground" />
          <p className="text-muted-foreground text-sm">Loading wallet users…</p>
        </GlassCard>
      ) : filtered.length === 0 ? (
        <GlassCard className="p-12 text-center">
          <Users className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <p className="text-muted-foreground">{search ? 'No users match your search' : 'No wallet users yet'}</p>
        </GlassCard>
      ) : (
        <div className="space-y-3">
          {filtered.map((u) => {
            const meta = ROLE_META[u.role as Role] ?? ROLE_META.user;
            const isSelf = u.id === walletUser?.id;
            return (
              <GlassCard key={u.id} className={`p-4 ${isSelf ? 'border-primary/30' : ''}`}>
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-4 min-w-0">
                    <div className={`p-2.5 rounded-lg shrink-0 ${
                      u.role === 'founder' ? 'bg-yellow-500/10' :
                      u.role === 'admin'   ? 'bg-primary/10' : 'bg-muted/20'
                    }`}>
                      <UserCheck className={`h-5 w-5 ${
                        u.role === 'founder' ? 'text-yellow-500' :
                        u.role === 'admin'   ? 'text-primary' : 'text-muted-foreground'
                      }`} />
                    </div>

                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <code className="text-sm font-mono text-foreground truncate">
                          {u.wallet_address.slice(0, 8)}…{u.wallet_address.slice(-6)}
                        </code>
                        {u.ens_name && (
                          <span className="text-xs text-primary">{u.ens_name}</span>
                        )}
                        {isSelf && (
                          <Badge variant="outline" className="text-xs text-primary border-primary">You</Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-1">
                        <Badge variant="outline" className={`text-xs gap-1 ${meta.color}`}>
                          {meta.icon}
                          {meta.label}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          Joined {new Date(u.created_at).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                  </div>

                  <Select
                    value={u.role}
                    onValueChange={(v) => handleRoleChange(u.id, v as Role)}
                    disabled={updating === u.id}
                  >
                    <SelectTrigger className="w-32 shrink-0">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="user">User</SelectItem>
                      <SelectItem value="admin">Admin</SelectItem>
                      <SelectItem value="founder">Founder</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </GlassCard>
            );
          })}
        </div>
      )}
    </div>
  );
};
