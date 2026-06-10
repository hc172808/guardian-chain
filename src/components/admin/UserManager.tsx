import { useState, useEffect } from 'react';
import { GlassCard } from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import {
  Users, RefreshCw, Shield, Crown, User,
  Ban, CheckCircle, Search, ChevronDown, Wallet
} from 'lucide-react';

interface AdminUser {
  id: string;
  email: string | null;
  username: string | null;
  walletAddress: string | null;
  firstName: string | null;
  lastName: string | null;
  isBanned: boolean | null;
  totpEnabled: boolean | null;
  createdAt: string | null;
  roles: string[];
  primaryRole: 'user' | 'admin' | 'founder';
}

export const UserManager = () => {
  const { user: me, isFounder } = useAuth();
  const { toast } = useToast();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/users', { credentials: 'include' });
      if (!res.ok) throw new Error(await res.text());
      setUsers(await res.json());
    } catch (e: any) {
      toast({ title: 'Failed to load users', description: e.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchUsers(); }, []);

  const setRole = async (userId: string, role: string) => {
    setActionLoading(userId + ':role');
    try {
      const res = await fetch(`/api/admin/users/${userId}/role`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      toast({ title: `Role updated to ${role}` });
      fetchUsers();
    } catch (e: any) {
      toast({ title: 'Failed to update role', description: e.message, variant: 'destructive' });
    } finally {
      setActionLoading(null);
    }
  };

  const toggleBan = async (userId: string, banned: boolean) => {
    setActionLoading(userId + ':ban');
    try {
      const res = await fetch(`/api/admin/users/${userId}/ban`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ banned }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      toast({ title: banned ? 'User banned' : 'User unbanned' });
      fetchUsers();
    } catch (e: any) {
      toast({ title: 'Failed', description: e.message, variant: 'destructive' });
    } finally {
      setActionLoading(null);
    }
  };

  const filtered = users.filter(u => {
    const q = search.toLowerCase();
    return !q || (u.email ?? '').toLowerCase().includes(q) ||
      (u.username ?? '').toLowerCase().includes(q) ||
      (u.walletAddress ?? '').toLowerCase().includes(q);
  });

  const roleColor = (r: string) =>
    r === 'founder' ? 'text-yellow-500 border-yellow-500' :
    r === 'admin' ? 'text-primary border-primary' :
    'text-muted-foreground border-muted-foreground';

  const roleIcon = (r: string) =>
    r === 'founder' ? <Crown className="h-3 w-3" /> :
    r === 'admin' ? <Shield className="h-3 w-3" /> :
    <User className="h-3 w-3" />;

  const stats = {
    total: users.length,
    founders: users.filter(u => u.primaryRole === 'founder').length,
    admins: users.filter(u => u.primaryRole === 'admin').length,
    banned: users.filter(u => u.isBanned).length,
    with2fa: users.filter(u => u.totpEnabled).length,
  };

  return (
    <div className="space-y-4">
      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { label: 'Total',   value: stats.total,    color: 'text-foreground' },
          { label: 'Founders',value: stats.founders, color: 'text-yellow-500' },
          { label: 'Admins',  value: stats.admins,   color: 'text-primary' },
          { label: 'Banned',  value: stats.banned,   color: 'text-destructive' },
          { label: '2FA On',  value: stats.with2fa,  color: 'text-green-400' },
        ].map(s => (
          <GlassCard key={s.label} className="p-3 text-center">
            <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
            <p className="text-xs text-muted-foreground">{s.label}</p>
          </GlassCard>
        ))}
      </div>

      {/* Search + Refresh */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by email, username, or wallet…"
            className="w-full pl-10 pr-4 py-2 rounded-lg bg-background border border-border focus:border-primary focus:outline-none text-sm"
          />
        </div>
        <Button variant="outline" size="sm" onClick={fetchUsers} disabled={loading} className="gap-2">
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* User list */}
      {loading ? (
        <GlassCard className="p-8 text-center text-muted-foreground">Loading users…</GlassCard>
      ) : filtered.length === 0 ? (
        <GlassCard className="p-8 text-center">
          <Users className="h-10 w-10 mx-auto text-muted-foreground mb-2" />
          <p className="text-muted-foreground">{search ? 'No users match your search' : 'No users yet'}</p>
        </GlassCard>
      ) : (
        <div className="space-y-2">
          {filtered.map(u => {
            const isSelf = u.id === me?.id;
            const banLoading = actionLoading === u.id + ':ban';
            const roleLoading = actionLoading === u.id + ':role';
            return (
              <GlassCard key={u.id} className={`p-4 ${u.isBanned ? 'border-destructive/30 opacity-70' : ''}`}>
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`p-2.5 rounded-lg shrink-0 ${
                      u.primaryRole === 'founder' ? 'bg-yellow-500/20' :
                      u.primaryRole === 'admin' ? 'bg-primary/20' : 'bg-secondary/50'
                    }`}>
                      {u.primaryRole === 'founder' ? <Crown className="h-5 w-5 text-yellow-500" /> :
                       u.primaryRole === 'admin' ? <Shield className="h-5 w-5 text-primary" /> :
                       <User className="h-5 w-5 text-muted-foreground" />}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold truncate">
                          {u.username ? `@${u.username}` : u.email ?? u.walletAddress?.slice(0, 12) ?? u.id.slice(0, 12)}
                        </p>
                        {isSelf && <span className="text-[10px] text-primary font-medium">(you)</span>}
                        <Badge variant="outline" className={`text-[10px] gap-1 ${roleColor(u.primaryRole)}`}>
                          {roleIcon(u.primaryRole)}
                          {u.primaryRole}
                        </Badge>
                        {u.isBanned && <Badge variant="destructive" className="text-[10px]">Banned</Badge>}
                        {u.totpEnabled && <Badge variant="outline" className="text-[10px] text-green-400 border-green-400">2FA</Badge>}
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
                        {u.email && <span>{u.email}</span>}
                        {u.walletAddress && (
                          <span className="flex items-center gap-1 font-mono">
                            <Wallet className="h-3 w-3" />
                            {u.walletAddress.slice(0, 8)}…{u.walletAddress.slice(-4)}
                          </span>
                        )}
                        {u.createdAt && <span>Joined {new Date(u.createdAt).toLocaleDateString()}</span>}
                      </div>
                    </div>
                  </div>

                  {/* Actions — not allowed on self */}
                  {!isSelf && (
                    <div className="flex items-center gap-2 shrink-0 flex-wrap">
                      {/* Role selector */}
                      <div className="relative">
                        <select
                          disabled={roleLoading || (!isFounder && u.primaryRole === 'founder')}
                          value={u.primaryRole}
                          onChange={e => setRole(u.id, e.target.value)}
                          className="appearance-none pl-3 pr-7 py-1.5 text-xs rounded-lg bg-background border border-border focus:border-primary focus:outline-none disabled:opacity-50 cursor-pointer"
                        >
                          <option value="user">User</option>
                          <option value="admin">Admin</option>
                          {isFounder && <option value="founder">Founder</option>}
                        </select>
                        <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground pointer-events-none" />
                      </div>

                      {/* Ban / Unban */}
                      <Button
                        size="sm"
                        variant={u.isBanned ? 'outline' : 'destructive'}
                        disabled={banLoading}
                        onClick={() => toggleBan(u.id, !u.isBanned)}
                        className="gap-1 text-xs h-7"
                      >
                        {u.isBanned
                          ? <><CheckCircle className="h-3 w-3" />Unban</>
                          : <><Ban className="h-3 w-3" />Ban</>
                        }
                      </Button>
                    </div>
                  )}
                </div>
              </GlassCard>
            );
          })}
        </div>
      )}
    </div>
  );
};
