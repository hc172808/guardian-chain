import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { GlassCard } from '@/components/ui/GlassCard';
import { Badge } from '@/components/ui/badge';
import { Lock, Trophy, Star, RefreshCw, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Achievement {
  id: string;
  title: string;
  description: string;
  xpReward: number;
  icon: string;
  category: string;
  earned: boolean;
  unlockedAt: string | null;
}

const CATEGORY_META: Record<string, { label: string; color: string; borderColor: string }> = {
  transactions:   { label: 'Transactions',  color: 'text-blue-400',   borderColor: 'border-blue-500/30'   },
  infrastructure: { label: 'Infrastructure',color: 'text-violet-400', borderColor: 'border-violet-500/30' },
  defi:           { label: 'Tokens & DeFi', color: 'text-emerald-400',borderColor: 'border-emerald-500/30'},
  governance:     { label: 'Governance',    color: 'text-amber-400',  borderColor: 'border-amber-500/30'  },
  special:        { label: 'Special',       color: 'text-rose-400',   borderColor: 'border-rose-500/30'   },
};

const CATEGORY_ORDER = ['transactions', 'infrastructure', 'defi', 'governance', 'special'];

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function BadgeCard({ ach }: { ach: Achievement }) {
  const [hovered, setHovered] = useState(false);
  const cat = CATEGORY_META[ach.category] ?? CATEGORY_META.special;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={cn(
        'relative rounded-xl border p-4 flex flex-col items-center text-center gap-2 transition-all duration-200',
        ach.earned
          ? cn('bg-gradient-to-b from-background to-muted/20 shadow-sm', cat.borderColor, hovered && 'shadow-md scale-105')
          : 'bg-muted/10 border-border/20 opacity-50'
      )}
    >
      {/* Lock overlay for locked badges */}
      {!ach.earned && (
        <div className="absolute inset-0 flex items-center justify-center rounded-xl z-10">
          <div className="bg-background/60 backdrop-blur-sm rounded-full p-1.5">
            <Lock className="w-4 h-4 text-muted-foreground" />
          </div>
        </div>
      )}

      {/* Unlocked glow ring */}
      {ach.earned && (
        <div className={cn('absolute inset-0 rounded-xl opacity-10', `bg-gradient-to-b from-current to-transparent`, cat.color)} />
      )}

      {/* Emoji icon */}
      <div className={cn(
        'text-3xl leading-none relative z-10 transition-transform duration-200',
        hovered && ach.earned && 'scale-110'
      )}>
        {ach.icon}
      </div>

      {/* Title */}
      <div className="relative z-10 space-y-0.5">
        <p className={cn('text-xs font-semibold leading-tight', ach.earned ? 'text-foreground' : 'text-muted-foreground')}>
          {ach.title}
        </p>
        <p className="text-xs text-muted-foreground leading-snug line-clamp-2">{ach.description}</p>
      </div>

      {/* XP badge */}
      <div className={cn(
        'relative z-10 text-xs font-mono px-2 py-0.5 rounded-full border flex items-center gap-1',
        ach.earned
          ? cn('border-current/30 bg-current/10', cat.color)
          : 'border-border/20 text-muted-foreground'
      )}>
        <Zap className="w-2.5 h-2.5" />
        +{ach.xpReward} XP
      </div>

      {/* Unlocked date */}
      {ach.earned && ach.unlockedAt && (
        <p className="relative z-10 text-xs text-muted-foreground/70">
          {formatDate(ach.unlockedAt)}
        </p>
      )}

      {/* Earned checkmark */}
      {ach.earned && (
        <div className="absolute top-2 right-2 z-10">
          <div className="w-4 h-4 rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
          </div>
        </div>
      )}
    </motion.div>
  );
}

export function AchievementBadges() {
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('all');

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/achievements', { credentials: 'include' });
      if (res.ok) setAchievements(await res.json());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const earned = achievements.filter(a => a.earned);
  const total  = achievements.length;
  const pct    = total > 0 ? Math.round((earned.length / total) * 100) : 0;
  const totalXp = earned.reduce((s, a) => s + a.xpReward, 0);

  const grouped = CATEGORY_ORDER.reduce<Record<string, Achievement[]>>((acc, cat) => {
    acc[cat] = achievements.filter(a => a.category === cat);
    return acc;
  }, {});

  const displayCategories = filter === 'all' ? CATEGORY_ORDER : [filter];

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <RefreshCw className="w-5 h-5 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      {/* Summary card */}
      <GlassCard className="p-5 border-primary/20">
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-xl bg-primary/10 border border-primary/20">
              <Trophy className="w-6 h-6 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">
                {earned.length}<span className="text-muted-foreground text-base font-normal">/{total}</span>
              </p>
              <p className="text-xs text-muted-foreground">Badges earned</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20">
              <Zap className="w-6 h-6 text-amber-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{totalXp.toLocaleString()}</p>
              <p className="text-xs text-muted-foreground">XP from badges</p>
            </div>
          </div>

          <div className="ml-auto flex items-center gap-2">
            <Star className="w-4 h-4 text-amber-400" />
            <span className="text-sm font-semibold text-foreground">{pct}% complete</span>
          </div>
        </div>

        {/* Progress bar */}
        <div className="mt-4 space-y-1.5">
          <div className="h-2 bg-muted/40 rounded-full overflow-hidden">
            <motion.div
              className="h-full bg-gradient-to-r from-primary to-primary/60 rounded-full"
              initial={{ width: 0 }}
              animate={{ width: `${pct}%` }}
              transition={{ duration: 0.8, ease: 'easeOut' }}
            />
          </div>
          <p className="text-xs text-muted-foreground text-right">{earned.length} of {total} achievements unlocked</p>
        </div>
      </GlassCard>

      {/* Category filter pills */}
      <div className="flex gap-2 flex-wrap">
        <button
          onClick={() => setFilter('all')}
          className={cn(
            'px-3 py-1 rounded-full text-xs font-medium border transition-all',
            filter === 'all'
              ? 'bg-primary/20 border-primary/40 text-primary'
              : 'bg-muted/20 border-border/30 text-muted-foreground hover:text-foreground'
          )}
        >
          All ({total})
        </button>
        {CATEGORY_ORDER.map(cat => {
          const meta = CATEGORY_META[cat];
          const count = achievements.filter(a => a.category === cat && a.earned).length;
          const catTotal = achievements.filter(a => a.category === cat).length;
          return (
            <button
              key={cat}
              onClick={() => setFilter(cat)}
              className={cn(
                'px-3 py-1 rounded-full text-xs font-medium border transition-all',
                filter === cat
                  ? cn('bg-current/10 border-current/30', meta.color)
                  : 'bg-muted/20 border-border/30 text-muted-foreground hover:text-foreground'
              )}
            >
              {meta.label} ({count}/{catTotal})
            </button>
          );
        })}
      </div>

      {/* Category sections */}
      {displayCategories.map(cat => {
        const meta = CATEGORY_META[cat] ?? CATEGORY_META.special;
        const items = grouped[cat] ?? [];
        if (items.length === 0) return null;
        const catEarned = items.filter(a => a.earned).length;
        return (
          <div key={cat} className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className={cn('text-sm font-semibold flex items-center gap-2', meta.color)}>
                <span className="w-2 h-2 rounded-full bg-current" />
                {meta.label}
              </h3>
              <span className="text-xs text-muted-foreground">{catEarned}/{items.length}</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {items.map(ach => <BadgeCard key={ach.id} ach={ach} />)}
            </div>
          </div>
        );
      })}

      {/* Empty earned state */}
      {earned.length === 0 && (
        <GlassCard className="p-8 text-center border-dashed">
          <Trophy className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-sm font-medium text-muted-foreground">No badges earned yet</p>
          <p className="text-xs text-muted-foreground/60 mt-1">
            Send a transaction, install a node, or vote on a proposal to start earning badges.
          </p>
        </GlassCard>
      )}
    </motion.div>
  );
}
