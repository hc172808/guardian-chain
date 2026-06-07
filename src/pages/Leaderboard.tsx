import { useState } from 'react';
import { motion } from 'framer-motion';
import { Layout } from '@/components/layout/Layout';
import { GlassCard } from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/contexts/AuthContext';
import {
  Trophy, Medal, Zap, Star, Server, ArrowRightLeft,
  TrendingUp, Users, Pickaxe
} from 'lucide-react';

const genLeaders = (n: number, scoreBase: number, scoreLabel: string) =>
  Array.from({ length: n }, (_, i) => ({
    rank: i + 1,
    name: ['CryptoKing', 'NodeMaster', 'DefiWhale', 'SatoshiClone', 'BlockWizard',
           'HashLord', 'StakePro', 'Validator1', 'MoonFarmer', 'GYDSHolder',
           'TxSpammer', 'LiquidityPro', 'MinePro', 'DeFiGod', 'ChainPunk',
           'ValidatorX', 'PoolMaster', 'MEVBot', 'StakeKing', 'NodePro'][i] ?? `User${i}`,
    address: '0x' + Math.random().toString(16).slice(2, 10) + '…',
    score: Math.floor(scoreBase * (1 - i * 0.07) * (0.9 + Math.random() * 0.2)),
    scoreLabel,
    change: i < 5 ? `+${Math.floor(Math.random() * 5 + 1)}` : i < 10 ? `−${Math.floor(Math.random() * 3 + 1)}` : '—',
    badge: i === 0 ? 'gold' : i === 1 ? 'silver' : i === 2 ? 'bronze' : null,
    xp: Math.floor(50000 * (1 - i * 0.06)),
  }));

const BADGE_STYLE: Record<string, string> = {
  gold:   'text-amber-400 bg-amber-500/10 border-amber-500/30',
  silver: 'text-gray-300 bg-gray-500/10 border-gray-400/30',
  bronze: 'text-amber-700 bg-amber-800/10 border-amber-700/30',
};

const RANK_ICON = (rank: number) => {
  if (rank === 1) return <Trophy className="w-5 h-5 text-amber-400" />;
  if (rank === 2) return <Medal className="w-5 h-5 text-gray-300" />;
  if (rank === 3) return <Medal className="w-5 h-5 text-amber-700" />;
  return <span className="w-5 h-5 flex items-center justify-center text-sm font-bold text-muted-foreground">#{rank}</span>;
};

const LeaderRow = ({ entry, userAddr, highlight }: { entry: ReturnType<typeof genLeaders>[0]; userAddr?: string; highlight?: boolean }) => (
  <motion.div
    initial={{ opacity: 0, x: -10 }}
    animate={{ opacity: 1, x: 0 }}
    transition={{ delay: entry.rank * 0.025 }}
  >
    <div className={`flex items-center gap-3 p-3 rounded-xl border transition-colors ${highlight ? 'border-primary/40 bg-primary/5' : 'border-border/20 bg-muted/10 hover:border-primary/20'}`}>
      <div className="w-8 flex justify-center shrink-0">{RANK_ICON(entry.rank)}</div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-sm truncate">{entry.name}</span>
          {entry.badge && (
            <Badge variant="outline" className={`text-xs ${BADGE_STYLE[entry.badge]}`}>
              {entry.badge === 'gold' ? '🥇' : entry.badge === 'silver' ? '🥈' : '🥉'}
            </Badge>
          )}
        </div>
        <span className="text-xs text-muted-foreground font-mono">{entry.address}</span>
      </div>
      <div className="text-right shrink-0">
        <p className="font-bold text-sm">{entry.score.toLocaleString()}</p>
        <p className="text-xs text-muted-foreground">{entry.scoreLabel}</p>
      </div>
      <div className={`text-xs font-medium w-8 text-right shrink-0 ${entry.change.startsWith('+') ? 'text-emerald-400' : entry.change.startsWith('−') ? 'text-red-400' : 'text-muted-foreground'}`}>
        {entry.change}
      </div>
    </div>
  </motion.div>
);

const LeaderboardPage = () => {
  const { user } = useAuth();
  const [period, setPeriod] = useState<'weekly' | 'monthly' | 'all'>('monthly');

  const traders    = genLeaders(20, 15_000_000, 'GYDS traded');
  const validators = genLeaders(20, 500_000,    'GYDS staked');
  const miners     = genLeaders(20, 250_000,    'blocks mined');
  const xp         = genLeaders(20, 95_000,     'XP earned');

  return (
    <Layout>
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Trophy className="w-6 h-6 text-amber-400" /> Leaderboard
            </h1>
            <p className="text-muted-foreground text-sm mt-1">Top performers on GYDSchain — updated hourly</p>
          </div>
          <div className="flex gap-1.5">
            {(['weekly', 'monthly', 'all'] as const).map(p => (
              <Button key={p} size="sm" variant={period === p ? 'default' : 'outline'}
                onClick={() => setPeriod(p)} className="text-xs h-7 capitalize">{p}</Button>
            ))}
          </div>
        </div>

        {/* Top 3 podium */}
        <div className="grid grid-cols-3 gap-3">
          {[xp[1], xp[0], xp[2]].map((e, i) => (
            <GlassCard key={e.rank} className={`p-4 text-center ${i === 1 ? 'border-amber-500/40 bg-amber-500/5 -mt-2' : ''}`}>
              <div className="text-2xl mb-1">{i === 0 ? '🥈' : i === 1 ? '🥇' : '🥉'}</div>
              <p className="font-bold text-sm truncate">{e.name}</p>
              <p className="text-xs text-primary font-bold mt-0.5">{e.xp.toLocaleString()} XP</p>
              <p className="text-xs text-muted-foreground mt-0.5">Rank #{e.rank}</p>
            </GlassCard>
          ))}
        </div>

        <Tabs defaultValue="xp">
          <TabsList className="grid grid-cols-4 w-full">
            <TabsTrigger value="xp" className="gap-1.5 text-xs"><Star className="w-3.5 h-3.5" /> XP</TabsTrigger>
            <TabsTrigger value="traders" className="gap-1.5 text-xs"><ArrowRightLeft className="w-3.5 h-3.5" /> Traders</TabsTrigger>
            <TabsTrigger value="validators" className="gap-1.5 text-xs"><Users className="w-3.5 h-3.5" /> Validators</TabsTrigger>
            <TabsTrigger value="miners" className="gap-1.5 text-xs"><Pickaxe className="w-3.5 h-3.5" /> Miners</TabsTrigger>
          </TabsList>

          {[
            { key: 'xp',         data: xp,         label: 'XP Leaderboard' },
            { key: 'traders',    data: traders,    label: 'Top Traders' },
            { key: 'validators', data: validators, label: 'Top Validators' },
            { key: 'miners',     data: miners,     label: 'Top Miners' },
          ].map(tab => (
            <TabsContent key={tab.key} value={tab.key} className="mt-4 space-y-2">
              <div className="flex items-center justify-between text-xs text-muted-foreground px-1 mb-2">
                <span>Player</span>
                <span>Score · Change</span>
              </div>
              {tab.data.map(e => (
                <LeaderRow key={e.rank} entry={e} userAddr={user?.id} />
              ))}
            </TabsContent>
          ))}
        </Tabs>

        {/* XP breakdown */}
        <GlassCard className="p-5 space-y-3">
          <h2 className="font-semibold flex items-center gap-2">
            <Zap className="w-4 h-4 text-primary" /> How to Earn XP
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
            {[
              { action: 'First transaction', xp: '+50 XP' },
              { action: 'First delegation',  xp: '+100 XP' },
              { action: 'Deploy a node',     xp: '+200 XP' },
              { action: 'Create a token',    xp: '+300 XP' },
              { action: '30-day streak',     xp: '+500 XP' },
              { action: 'First swap',        xp: '+50 XP' },
              { action: 'Provide liquidity', xp: '+150 XP' },
              { action: 'Vote on proposal',  xp: '+25 XP' },
              { action: 'Refer a user',      xp: '+200 XP' },
              { action: 'Win a prediction',  xp: '+100 XP' },
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
