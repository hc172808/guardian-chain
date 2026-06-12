import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Layout } from '@/components/layout/Layout';
import { GlassCard } from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/contexts/AuthContext';
import {
  Trophy, Medal, Zap, Star, ArrowRightLeft, RefreshCw,
  Users, Pickaxe, Crown, Activity, Coins, Shield, Award, Cpu
} from 'lucide-react';
import { cn } from '@/lib/utils';

// ── XP level thresholds ──────────────────────────────────────────────────────
const XP_LEVELS = [
  { level: 1, minXp: 0,     label: 'Newcomer',  color: 'text-muted-foreground' },
  { level: 2, minXp: 100,   label: 'Explorer',  color: 'text-emerald-400' },
  { level: 3, minXp: 300,   label: 'Builder',   color: 'text-primary' },
  { level: 4, minXp: 600,   label: 'Validator', color: 'text-neon-cyan' },
  { level: 5, minXp: 1200,  label: 'Pioneer',   color: 'text-amber-400' },
  { level: 6, minXp: 2500,  label: 'Guardian',  color: 'text-purple-400' },
  { level: 7, minXp: 5000,  label: 'Champion',  color: 'text-rose-400' },
  { level: 8, minXp: 10000, label: 'Legend',    color: 'text-yellow-300' },
];
const getLvl = (xp: number) => {
  for (let i = XP_LEVELS.length - 1; i >= 0; i--) if (xp >= XP_LEVELS[i].minXp) return XP_LEVELS[i];
  return XP_LEVELS[0];
};
const fmtBig = (n: string | number) => { const v = +n; if (v >= 1e6) return `${(v/1e6).toFixed(1)}M`; if (v >= 1e3) return `${(v/1e3).toFixed(1)}K`; return String(v); };
const nameFrom = (email: string) => email?.split('@')[0] ?? 'anon';

// ── Rank badge ────────────────────────────────────────────────────────────────
const RankBadge = ({ rank }: { rank: number }) => {
  if (rank === 1) return <span className="w-8 h-8 flex items-center justify-center rounded-full bg-yellow-400/10 border border-yellow-400/30"><Crown className="w-4 h-4 text-yellow-400" /></span>;
  if (rank === 2) return <span className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-300/10 border border-slate-300/30"><Medal className="w-4 h-4 text-slate-300" /></span>;
  if (rank === 3) return <span className="w-8 h-8 flex items-center justify-center rounded-full bg-amber-700/10 border border-amber-700/30"><Medal className="w-4 h-4 text-amber-700" /></span>;
  return <span className="w-8 h-8 flex items-center justify-center rounded-full bg-muted/30 border border-border/30 text-xs font-bold text-muted-foreground">{rank}</span>;
};

// ── Interfaces ────────────────────────────────────────────────────────────────
interface XpEntry   { rank: number; userId: string; email: string; totalXp: number; level: number; }
interface ListEntry { rank: number; userId: string; email: string; value: string | number; }
interface ValEntry  { rank: number; id: string; name: string; address: string; totalStaked: string; commission: string; uptime: number; status: string; }

const EmptyState = ({ label }: { label: string }) => (
  <GlassCard className="p-12 text-center text-muted-foreground">
    <Trophy className="w-12 h-12 mx-auto mb-3 opacity-30" />
    <p className="font-medium">No {label} yet — be first to the top!</p>
  </GlassCard>
);

// ── Page ─────────────────────────────────────────────────────────────────────
const LeaderboardPage = () => {
  const { user } = useAuth();
  const [xpBoard,    setXpBoard]    = useState<XpEntry[]>([]);
  const [txBoard,    setTxBoard]    = useState<ListEntry[]>([]);
  const [tokBoard,   setTokBoard]   = useState<ListEntry[]>([]);
  const [validators, setValidators] = useState<ValEntry[]>([]);
  const [myXp,       setMyXp]       = useState<XpEntry | null>(null);
  const [loading,    setLoading]    = useState(true);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [xpRes, txRes, tokRes, valRes] = await Promise.all([
        fetch('/api/leaderboard/xp'),
        fetch('/api/leaderboard/transactions'),
        fetch('/api/leaderboard/tokens'),
        fetch('/api/validators'),
      ]);
      if (xpRes.ok)  setXpBoard(await xpRes.json());
      if (txRes.ok)  setTxBoard(await txRes.json());
      if (tokRes.ok) setTokBoard(await tokRes.json());
      if (valRes.ok) {
        const vals = await valRes.json();
        setValidators((vals as any[]).sort((a,b) => +b.totalStaked - +a.totalStaked).slice(0,20).map((v,i) => ({ ...v, rank: i+1 })));
      }
      if (user) {
        const r = await fetch('/api/leaderboard/my-xp', { credentials: 'include' });
        if (r.ok) setMyXp(await r.json());
      }
    } finally { setLoading(false); }
  }, [user]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const myLvl = myXp ? getLvl(myXp.totalXp) : null;
  const nextLvlXp = myXp ? (XP_LEVELS[Math.min(myXp.level, XP_LEVELS.length - 1)]?.minXp ?? myXp.totalXp + 1) : 1;

  return (
    <Layout>
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">

        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Trophy className="w-6 h-6 text-amber-400" /> Leaderboard
            </h1>
            <p className="text-muted-foreground text-sm mt-1">Top contributors, validators, traders & builders on GYDSchain</p>
          </div>
          <Button variant="outline" size="sm" onClick={fetchAll} disabled={loading} className="gap-1.5">
            <RefreshCw className={cn('w-4 h-4', loading && 'animate-spin')} />
          </Button>
        </div>

        {/* My stats */}
        {user && (
          <GlassCard className="p-5">
            <div className="flex flex-wrap items-center gap-5">
              <div className="p-3 rounded-xl bg-primary/10 border border-primary/20 shrink-0">
                <Star className="w-6 h-6 text-primary" />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">Your rank</p>
                <p className="font-bold text-lg">{myXp ? `#${myXp.rank}` : 'Unranked'}</p>
              </div>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">Total XP</p>
                <p className="font-bold text-lg text-primary">{(myXp?.totalXp ?? 0).toLocaleString()}</p>
              </div>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">Level</p>
                <p className={cn('font-bold text-lg', myLvl?.color ?? 'text-muted-foreground')}>
                  {myLvl ? `${myLvl.level} — ${myLvl.label}` : 'Newcomer'}
                </p>
              </div>
              {myXp && (
                <div className="w-full sm:w-44">
                  <div className="flex justify-between text-xs text-muted-foreground mb-1">
                    <span>XP progress</span><span>{myXp.totalXp} / {nextLvlXp}</span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div className="h-full bg-primary rounded-full" style={{ width: `${Math.min(100,(myXp.totalXp/nextLvlXp)*100)}%` }} />
                  </div>
                </div>
              )}
            </div>
          </GlassCard>
        )}

        {/* Top-3 podium (XP) */}
        {xpBoard.length >= 3 && (
          <div className="grid grid-cols-3 gap-3">
            {[xpBoard[1], xpBoard[0], xpBoard[2]].map((e, i) => (
              <GlassCard key={e.userId} className={cn('p-4 text-center', i === 1 && 'border-yellow-400/30 bg-yellow-400/5 -mt-2')}>
                <div className="text-2xl mb-1">{i === 0 ? '🥈' : i === 1 ? '🥇' : '🥉'}</div>
                <p className="font-bold text-sm truncate">{nameFrom(e.email)}</p>
                <p className="text-xs text-primary font-bold mt-0.5">{e.totalXp.toLocaleString()} XP</p>
                <p className={cn('text-xs mt-0.5', getLvl(e.totalXp).color)}>{getLvl(e.totalXp).label}</p>
              </GlassCard>
            ))}
          </div>
        )}

        {/* XP earn summary */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'First Transaction', xp: '+50 XP',  icon: Activity },
            { label: 'Install a Node',    xp: '+200 XP', icon: Cpu },
            { label: 'Launch a Token',    xp: '+300 XP', icon: Coins },
            { label: 'Vote on Proposal',  xp: '+25 XP',  icon: Shield },
          ].map(a => (
            <GlassCard key={a.label} className="p-3 flex items-center gap-2.5">
              <div className="p-1.5 rounded-lg bg-primary/10 shrink-0"><a.icon className="w-3.5 h-3.5 text-primary" /></div>
              <div><p className="text-xs text-muted-foreground leading-tight">{a.label}</p><p className="text-sm font-bold text-emerald-400">{a.xp}</p></div>
            </GlassCard>
          ))}
        </div>

        {/* Main tabs */}
        <Tabs defaultValue="xp">
          <TabsList className="flex flex-wrap h-auto gap-1">
            <TabsTrigger value="xp"         className="gap-1.5 text-xs"><Star className="w-3.5 h-3.5" /> XP Rankings</TabsTrigger>
            <TabsTrigger value="validators" className="gap-1.5 text-xs"><Users className="w-3.5 h-3.5" /> Validators</TabsTrigger>
            <TabsTrigger value="traders"    className="gap-1.5 text-xs"><ArrowRightLeft className="w-3.5 h-3.5" /> Traders</TabsTrigger>
            <TabsTrigger value="builders"   className="gap-1.5 text-xs"><Pickaxe className="w-3.5 h-3.5" /> Builders</TabsTrigger>
          </TabsList>

          {/* XP */}
          <TabsContent value="xp" className="mt-4 space-y-2">
            {loading ? <div className="flex items-center gap-2 py-10 justify-center text-muted-foreground"><RefreshCw className="w-4 h-4 animate-spin" /> Loading…</div>
              : xpBoard.length === 0 ? <EmptyState label="XP rankings" /> : xpBoard.map(e => {
              const lvl = getLvl(e.totalXp);
              const isMe = user?.id === e.userId;
              return (
                <GlassCard key={e.userId} className={cn('p-4 flex items-center gap-4', isMe && 'border-primary/40 bg-primary/5')}>
                  <RankBadge rank={e.rank} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm truncate">{nameFrom(e.email)}</span>
                      {isMe && <Badge className="text-xs px-1.5 py-0">You</Badge>}
                      <span className={cn('text-xs', lvl.color)}>{lvl.label}</span>
                    </div>
                    <div className="h-1.5 bg-muted rounded-full overflow-hidden mt-1.5 max-w-32">
                      <div className={cn('h-full rounded-full', e.rank===1?'bg-yellow-400':e.rank===2?'bg-slate-300':e.rank===3?'bg-amber-600':'bg-primary')}
                        style={{ width:`${Math.min(100,(e.totalXp/(xpBoard[0]?.totalXp||1))*100)}%` }} />
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-bold text-primary">{e.totalXp.toLocaleString()} XP</p>
                    <p className="text-xs text-muted-foreground">Level {e.level}</p>
                  </div>
                </GlassCard>
              );
            })}
          </TabsContent>

          {/* Validators */}
          <TabsContent value="validators" className="mt-4 space-y-2">
            {loading ? <div className="flex items-center gap-2 py-10 justify-center text-muted-foreground"><RefreshCw className="w-4 h-4 animate-spin" /> Loading…</div>
              : validators.length === 0 ? <EmptyState label="validators" /> : validators.map(v => (
              <GlassCard key={v.id ?? v.address} className="p-4 flex items-center gap-4">
                <RankBadge rank={v.rank} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm truncate">{v.name}</span>
                    <Badge variant="outline" className={cn('text-xs', v.status==='active'?'text-emerald-400 border-emerald-500/30':'text-muted-foreground')}>{v.status}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground font-mono mt-0.5">{v.address.slice(0,10)}…{v.address.slice(-6)}</p>
                </div>
                <div className="text-right shrink-0 space-y-0.5">
                  <p className="font-bold text-sm">{fmtBig(v.totalStaked)} GYDS</p>
                  <p className="text-xs text-muted-foreground">{v.commission}% commission</p>
                  <div className="flex items-center gap-1 justify-end">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                    <span className="text-xs text-emerald-400">{v.uptime}% uptime</span>
                  </div>
                </div>
              </GlassCard>
            ))}
          </TabsContent>

          {/* Traders */}
          <TabsContent value="traders" className="mt-4 space-y-2">
            {loading ? <div className="flex items-center gap-2 py-10 justify-center text-muted-foreground"><RefreshCw className="w-4 h-4 animate-spin" /> Loading…</div>
              : txBoard.length === 0 ? <EmptyState label="traders" /> : txBoard.map(e => {
              const isMe = user?.id === e.userId;
              return (
                <GlassCard key={e.userId} className={cn('p-4 flex items-center gap-4', isMe && 'border-primary/40 bg-primary/5')}>
                  <RankBadge rank={e.rank} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm truncate">{nameFrom(e.email)}</span>
                      {isMe && <Badge className="text-xs px-1.5 py-0">You</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground">Total transactions sent</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-bold">{(+e.value).toLocaleString()}</p>
                    <p className="text-xs text-muted-foreground">txs</p>
                  </div>
                </GlassCard>
              );
            })}
          </TabsContent>

          {/* Builders */}
          <TabsContent value="builders" className="mt-4 space-y-2">
            {loading ? <div className="flex items-center gap-2 py-10 justify-center text-muted-foreground"><RefreshCw className="w-4 h-4 animate-spin" /> Loading…</div>
              : tokBoard.length === 0 ? <EmptyState label="builders" /> : tokBoard.map(e => {
              const isMe = user?.id === e.userId;
              return (
                <GlassCard key={e.userId} className={cn('p-4 flex items-center gap-4', isMe && 'border-primary/40 bg-primary/5')}>
                  <RankBadge rank={e.rank} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm truncate">{nameFrom(e.email)}</span>
                      {isMe && <Badge className="text-xs px-1.5 py-0">You</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground">Tokens launched on GYDSchain</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-bold">{e.value}</p>
                    <p className="text-xs text-muted-foreground">tokens</p>
                  </div>
                </GlassCard>
              );
            })}
          </TabsContent>
        </Tabs>

        {/* Monthly Reset + Seasonal Campaigns */}
        <GlassCard className="p-5 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h2 className="font-semibold flex items-center gap-2 text-sm">
              <RefreshCw className="w-4 h-4 text-primary" /> Monthly Leaderboard Reset
            </h2>
            <Badge className="text-xs bg-amber-500/20 text-amber-400 border-amber-500/30">Resets in 18 days</Badge>
          </div>
          <p className="text-xs text-muted-foreground">Rankings reset on the 1st of every month. Top 3 earners receive special season badges + GYDS bonuses.</p>
          <div className="grid grid-cols-3 gap-3 text-center text-xs">
            {[
              { place: '🥇 1st', reward: '5,000 GYDS + Legend badge', bg: 'bg-yellow-500/10 border-yellow-500/30' },
              { place: '🥈 2nd', reward: '2,000 GYDS + Champion badge', bg: 'bg-slate-400/10 border-slate-400/30' },
              { place: '🥉 3rd', reward: '500 GYDS + Guardian badge', bg: 'bg-amber-700/10 border-amber-700/30' },
            ].map(p => (
              <div key={p.place} className={`p-2.5 rounded-xl border ${p.bg}`}>
                <p className="text-sm mb-1">{p.place}</p>
                <p className="text-muted-foreground leading-tight">{p.reward}</p>
              </div>
            ))}
          </div>
        </GlassCard>

        <GlassCard className="p-5 space-y-3">
          <h2 className="font-semibold flex items-center gap-2 text-sm">
            <Star className="w-4 h-4 text-amber-400" /> Seasonal Campaigns
          </h2>
          <div className="space-y-2">
            {[
              { name: 'Genesis Season (Q2 2026)', status: 'active', bonus: '2× XP on all actions', end: 'Jun 30, 2026', color: 'border-emerald-500/30 bg-emerald-500/5' },
              { name: 'DeFi Summer (Q3 2026)', status: 'upcoming', bonus: '3× XP on swaps + liquidity', end: 'Sep 30, 2026', color: 'border-border/30 bg-muted/5' },
              { name: 'Validator Season (Q4 2026)', status: 'upcoming', bonus: '5× XP on node operations', end: 'Dec 31, 2026', color: 'border-border/30 bg-muted/5' },
            ].map(c => (
              <div key={c.name} className={`p-3 rounded-xl border ${c.color}`}>
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <p className="font-medium text-sm">{c.name}</p>
                  <Badge variant={c.status === 'active' ? 'default' : 'secondary'} className="text-xs capitalize">{c.status}</Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-1">🎁 {c.bonus} · Ends {c.end}</p>
              </div>
            ))}
          </div>
        </GlassCard>

        {/* XP levels legend */}
        <GlassCard className="p-5">
          <h2 className="font-semibold mb-4 flex items-center gap-2 text-sm">
            <Award className="w-4 h-4 text-primary" /> XP Level Tiers
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {XP_LEVELS.map(lvl => (
              <div key={lvl.level} className="flex items-center gap-2 p-2.5 rounded-lg bg-muted/20 border border-border/30">
                <span className={cn('text-xs font-bold w-5 text-center', lvl.color)}>{lvl.level}</span>
                <div>
                  <p className={cn('text-xs font-medium', lvl.color)}>{lvl.label}</p>
                  <p className="text-xs text-muted-foreground">{lvl.minXp.toLocaleString()} XP</p>
                </div>
              </div>
            ))}
          </div>
        </GlassCard>

        {/* Full how-to-earn */}
        <GlassCard className="p-5 space-y-3">
          <h2 className="font-semibold flex items-center gap-2 text-sm">
            <Zap className="w-4 h-4 text-primary" /> How to Earn XP
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
            {[
              { action: 'First transaction',  xp: '+50 XP' },
              { action: 'First delegation',   xp: '+100 XP' },
              { action: 'Deploy a node',      xp: '+200 XP' },
              { action: 'Create a token',     xp: '+300 XP' },
              { action: '30-day streak',      xp: '+500 XP' },
              { action: 'First swap',         xp: '+50 XP' },
              { action: 'Provide liquidity',  xp: '+150 XP' },
              { action: 'Vote on proposal',   xp: '+25 XP' },
              { action: 'Refer a user',       xp: '+200 XP' },
              { action: 'Win a prediction',   xp: '+100 XP' },
            ].map(r => (
              <div key={r.action} className="flex justify-between p-2 bg-muted/20 rounded-lg">
                <span className="text-muted-foreground">{r.action}</span>
                <span className="font-bold text-primary">{r.xp}</span>
              </div>
            ))}
          </div>
        </GlassCard>

      </motion.div>
    </Layout>
  );
};

export default LeaderboardPage;
