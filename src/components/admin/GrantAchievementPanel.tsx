import { useState, useEffect } from 'react';
import { GlassCard } from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { Trophy, Search, ChevronDown, CheckCircle2, RefreshCw } from 'lucide-react';

interface Achievement {
  id: string;
  title: string;
  description: string;
  xp_reward: number;
  icon: string;
  category: string;
}

interface UserBasic {
  id: string;
  email: string;
  username?: string;
  total_xp: number;
  level: number;
  achievement_count: string;
}

const CATEGORY_COLORS: Record<string, string> = {
  transactions:   'text-blue-400 bg-blue-500/10 border-blue-500/30',
  infrastructure: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30',
  defi:           'text-amber-400 bg-amber-500/10 border-amber-500/30',
  governance:     'text-purple-400 bg-purple-500/10 border-purple-500/30',
  special:        'text-primary bg-primary/10 border-primary/30',
};

export const GrantAchievementPanel = () => {
  const { toast } = useToast();
  const [users, setUsers] = useState<UserBasic[]>([]);
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [selectedUser, setSelectedUser] = useState<UserBasic | null>(null);
  const [selectedAch, setSelectedAch] = useState<Achievement | null>(null);
  const [userSearch, setUserSearch] = useState('');
  const [achSearch, setAchSearch] = useState('');
  const [granting, setGranting] = useState(false);
  const [userOpen, setUserOpen] = useState(false);
  const [achOpen, setAchOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch('/api/admin/users-basic').then(r => r.json()),
      fetch('/api/admin/achievements-all').then(r => r.json()),
    ]).then(([u, a]) => {
      setUsers(Array.isArray(u) ? u : []);
      setAchievements(Array.isArray(a) ? a : []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const filteredUsers = users.filter(u =>
    (u.email ?? '').toLowerCase().includes(userSearch.toLowerCase()) ||
    (u.username ?? '').toLowerCase().includes(userSearch.toLowerCase())
  );

  const filteredAch = achievements.filter(a =>
    a.title.toLowerCase().includes(achSearch.toLowerCase()) ||
    a.category.toLowerCase().includes(achSearch.toLowerCase())
  );

  const grant = async () => {
    if (!selectedUser || !selectedAch) return;
    setGranting(true);
    try {
      const r = await fetch(`/api/achievements/${selectedAch.id}/unlock`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: selectedUser.id }),
      });
      const data = await r.json();
      if (data.ok) {
        toast({ title: `${selectedAch.icon} Achievement granted!`, description: `"${selectedAch.title}" → ${selectedUser.email}. +${selectedAch.xp_reward} XP awarded.` });
        setSelectedUser(null);
        setSelectedAch(null);
      } else {
        toast({ title: 'Could not grant', description: data.message, variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Error', variant: 'destructive' });
    } finally {
      setGranting(false);
    }
  };

  if (loading) {
    return (
      <GlassCard className="p-8 flex items-center justify-center gap-2 text-muted-foreground">
        <RefreshCw className="w-4 h-4 animate-spin" /> Loading…
      </GlassCard>
    );
  }

  return (
    <div className="space-y-6">
      <GlassCard className="p-5 space-y-4">
        <h2 className="font-semibold flex items-center gap-2">
          <Trophy className="w-4 h-4 text-amber-400" /> Grant Achievement to User
        </h2>
        <p className="text-xs text-muted-foreground">
          Manually award any achievement badge to a user. XP will be credited automatically. Use for Early Adopter, Whale, and other manually-triggered badges.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* User Picker */}
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">1. Select User</p>
            <div className="relative">
              <button
                onClick={() => { setUserOpen(v => !v); setAchOpen(false); }}
                className="w-full flex items-center justify-between px-3 py-2.5 bg-muted/20 border border-border/40 rounded-lg text-sm hover:border-primary/40 transition-colors"
              >
                {selectedUser ? (
                  <span className="truncate">{selectedUser.email}</span>
                ) : (
                  <span className="text-muted-foreground">Choose a user…</span>
                )}
                <ChevronDown className={`w-4 h-4 text-muted-foreground shrink-0 transition-transform ${userOpen ? 'rotate-180' : ''}`} />
              </button>
              {userOpen && (
                <div className="absolute z-20 top-full mt-1 w-full bg-background border border-border/60 rounded-xl shadow-xl overflow-hidden">
                  <div className="p-2 border-b border-border/30">
                    <div className="relative">
                      <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                      <Input value={userSearch} onChange={e => setUserSearch(e.target.value)}
                        placeholder="Search users…" className="pl-7 h-7 text-xs" />
                    </div>
                  </div>
                  <div className="max-h-52 overflow-y-auto">
                    {filteredUsers.map(u => (
                      <button key={u.id} onClick={() => { setSelectedUser(u); setUserOpen(false); setUserSearch(''); }}
                        className="w-full px-3 py-2.5 text-left hover:bg-muted/30 transition-colors flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm truncate">{u.email}</p>
                          <p className="text-xs text-muted-foreground">Lvl {u.level} · {u.total_xp} XP · {u.achievement_count} badges</p>
                        </div>
                        {selectedUser?.id === u.id && <CheckCircle2 className="w-3.5 h-3.5 text-primary shrink-0" />}
                      </button>
                    ))}
                    {filteredUsers.length === 0 && <p className="px-3 py-3 text-xs text-muted-foreground">No users found</p>}
                  </div>
                </div>
              )}
            </div>
            {selectedUser && (
              <div className="p-3 bg-muted/10 border border-border/20 rounded-lg text-xs space-y-1">
                <p className="font-medium">{selectedUser.email}</p>
                <p className="text-muted-foreground">Level {selectedUser.level} · {Number(selectedUser.total_xp).toLocaleString()} XP · {selectedUser.achievement_count} badges earned</p>
              </div>
            )}
          </div>

          {/* Achievement Picker */}
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">2. Select Achievement</p>
            <div className="relative">
              <button
                onClick={() => { setAchOpen(v => !v); setUserOpen(false); }}
                className="w-full flex items-center justify-between px-3 py-2.5 bg-muted/20 border border-border/40 rounded-lg text-sm hover:border-primary/40 transition-colors"
              >
                {selectedAch ? (
                  <span className="flex items-center gap-2">
                    <span>{selectedAch.icon}</span>
                    <span className="truncate">{selectedAch.title}</span>
                  </span>
                ) : (
                  <span className="text-muted-foreground">Choose an achievement…</span>
                )}
                <ChevronDown className={`w-4 h-4 text-muted-foreground shrink-0 transition-transform ${achOpen ? 'rotate-180' : ''}`} />
              </button>
              {achOpen && (
                <div className="absolute z-20 top-full mt-1 w-full bg-background border border-border/60 rounded-xl shadow-xl overflow-hidden">
                  <div className="p-2 border-b border-border/30">
                    <div className="relative">
                      <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                      <Input value={achSearch} onChange={e => setAchSearch(e.target.value)}
                        placeholder="Search achievements…" className="pl-7 h-7 text-xs" />
                    </div>
                  </div>
                  <div className="max-h-64 overflow-y-auto">
                    {filteredAch.map(a => (
                      <button key={a.id} onClick={() => { setSelectedAch(a); setAchOpen(false); setAchSearch(''); }}
                        className="w-full px-3 py-2.5 text-left hover:bg-muted/30 transition-colors flex items-center gap-2.5">
                        <span className="text-base shrink-0">{a.icon}</span>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium">{a.title}</p>
                          <p className="text-xs text-muted-foreground truncate">{a.description}</p>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <Badge variant="outline" className={`text-xs ${CATEGORY_COLORS[a.category] ?? ''}`}>{a.category}</Badge>
                          <span className="text-xs text-amber-400">+{a.xp_reward}</span>
                          {selectedAch?.id === a.id && <CheckCircle2 className="w-3.5 h-3.5 text-primary" />}
                        </div>
                      </button>
                    ))}
                    {filteredAch.length === 0 && <p className="px-3 py-3 text-xs text-muted-foreground">No achievements found</p>}
                  </div>
                </div>
              )}
            </div>
            {selectedAch && (
              <div className="p-3 bg-muted/10 border border-border/20 rounded-lg text-xs space-y-1">
                <p className="font-medium">{selectedAch.icon} {selectedAch.title}</p>
                <p className="text-muted-foreground">{selectedAch.description}</p>
                <p className="text-amber-400">+{selectedAch.xp_reward} XP reward</p>
              </div>
            )}
          </div>
        </div>

        {/* Summary + Grant */}
        {selectedUser && selectedAch && (
          <div className="flex items-center gap-3 p-4 bg-primary/5 border border-primary/20 rounded-xl">
            <div className="flex-1 text-sm">
              Grant <strong className="text-primary">{selectedAch.icon} {selectedAch.title}</strong> to{' '}
              <strong>{selectedUser.email}</strong> — they'll receive{' '}
              <span className="text-amber-400">+{selectedAch.xp_reward} XP</span>
            </div>
            <Button onClick={grant} disabled={granting} className="gap-2 shrink-0">
              {granting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Trophy className="w-4 h-4" />}
              Grant
            </Button>
          </div>
        )}

        {(!selectedUser || !selectedAch) && (
          <p className="text-xs text-muted-foreground text-center py-2">
            {!selectedUser && !selectedAch ? 'Select a user and an achievement above to continue.' :
             !selectedUser ? 'Select a user to continue.' : 'Select an achievement to continue.'}
          </p>
        )}
      </GlassCard>

      {/* Achievement catalog */}
      <GlassCard className="p-5 space-y-3">
        <h3 className="font-semibold text-sm flex items-center gap-2">
          <Trophy className="w-4 h-4 text-primary" /> All Achievements ({achievements.length})
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {achievements.map(a => (
            <div key={a.id} className="flex items-center gap-2.5 p-2.5 bg-muted/10 border border-border/20 rounded-lg text-xs hover:border-primary/30 transition-colors cursor-pointer"
              onClick={() => { setSelectedAch(a); setAchOpen(false); }}>
              <span className="text-xl shrink-0">{a.icon}</span>
              <div className="min-w-0 flex-1">
                <p className="font-medium truncate">{a.title}</p>
                <p className="text-muted-foreground truncate">{a.description}</p>
              </div>
              <span className="text-amber-400 shrink-0">+{a.xp_reward}</span>
            </div>
          ))}
        </div>
      </GlassCard>
    </div>
  );
};
