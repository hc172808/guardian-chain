import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Layout } from '@/components/layout/Layout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import {
  Gift, Copy, Check, Users, Coins, Trophy, Share2, Link2,
  Crown, Star, Zap, TrendingUp, Clock, ChevronRight, Medal,
  Twitter, MessageCircle, ExternalLink, Sparkles,
} from 'lucide-react';

const api = {
  get: (url: string) => fetch(url, { credentials: 'include' }).then(r => r.json()),
  post: (url: string, body: any) =>
    fetch(url, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(r => r.json()),
};

type Tier = { name: string; min: number; max: number; pct: number; color: string; icon: React.ReactNode };

const TIERS: Tier[] = [
  { name: 'Standard', min: 0,  max: 4,   pct: 5,  color: 'text-slate-400',  icon: <Star className="h-4 w-4" /> },
  { name: 'Silver',   min: 5,  max: 19,  pct: 10, color: 'text-slate-300',  icon: <Medal className="h-4 w-4" /> },
  { name: 'Gold',     min: 20, max: 49,  pct: 15, color: 'text-yellow-400', icon: <Crown className="h-4 w-4" /> },
  { name: 'Diamond',  min: 50, max: 999, pct: 20, color: 'text-cyan-400',   icon: <Sparkles className="h-4 w-4" /> },
];

function getTier(count: number): Tier {
  return [...TIERS].reverse().find(t => count >= t.min) ?? TIERS[0];
}

function nextTier(count: number): Tier | null {
  const idx = TIERS.findIndex(t => count >= t.min && count <= t.max);
  return TIERS[idx + 1] ?? null;
}

function progressToNext(count: number): number {
  const tier = getTier(count);
  const next = nextTier(count);
  if (!next) return 100;
  return Math.round(((count - tier.min) / (next.min - tier.min)) * 100);
}

function fmt(n: number | string | null | undefined): string {
  const num = Number(n ?? 0);
  return num.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function timeAgo(iso: string): string {
  const d = Date.now() - new Date(iso).getTime();
  const m = Math.floor(d / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function ReferralsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [copied, setCopied] = useState(false);
  const [codeInput, setCodeInput] = useState('');

  const { data: stats } = useQuery({
    queryKey: ['referral-stats'],
    queryFn: () => api.get('/api/referral'),
    enabled: !!user,
    refetchInterval: 30000,
  });

  const { data: leaderboard = [] } = useQuery({
    queryKey: ['referral-leaderboard'],
    queryFn: () => api.get('/api/referral/leaderboard'),
    refetchInterval: 60000,
  });

  const useCodeMutation = useMutation({
    mutationFn: (code: string) => api.post('/api/referral/use', { code }),
    onSuccess: (data) => {
      if (data.ok) {
        toast({ title: 'Code applied!', description: data.message || 'Referral code applied successfully.' });
        setCodeInput('');
        qc.invalidateQueries({ queryKey: ['referral-stats'] });
      } else {
        toast({ title: 'Could not apply code', description: data.message || 'Invalid or already-used code.', variant: 'destructive' });
      }
    },
    onError: () => toast({ title: 'Error', description: 'Failed to apply code.', variant: 'destructive' }),
  });

  const code: string = stats?.code ?? '';
  const referredCount: number = stats?.referred_count ?? 0;
  const totalEarned: number = Number(stats?.total_earned ?? 0);
  const events: any[] = stats?.events ?? [];

  const appUrl = typeof window !== 'undefined' ? window.location.origin : 'https://netlifegy.com';
  const referralLink = `${appUrl}/auth?ref=${code}`;

  const copy = useCallback((text: string, label = 'Copied!') => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      toast({ title: label });
      setTimeout(() => setCopied(false), 2000);
    });
  }, [toast]);

  const tier = getTier(referredCount);
  const next = nextTier(referredCount);
  const prog = progressToNext(referredCount);

  const tweetText = encodeURIComponent(
    `Join the GYDS blockchain network! Get 500 GYDS tokens when you sign up with my referral link:\n${referralLink}\n\n#GYDS #blockchain #crypto`
  );

  return (
    <Layout>
      <div className="p-4 md:p-6 space-y-6 max-w-6xl mx-auto">

        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center gap-4">
          <div className="flex-1">
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Gift className="h-6 w-6 text-primary" /> Referral Program
            </h1>
            <p className="text-muted-foreground mt-1">
              Invite friends to GYDS and earn <span className="text-primary font-semibold">500 GYDS</span> per sign-up, plus XP bonuses.
            </p>
          </div>
          {user && tier && (
            <Badge
              variant="outline"
              className={`text-base px-4 py-2 gap-2 border-current ${tier.color}`}
            >
              {tier.icon} {tier.name} Referrer
            </Badge>
          )}
        </div>

        {!user ? (
          <Card className="border-dashed">
            <CardContent className="py-12 text-center text-muted-foreground">
              <Gift className="h-12 w-12 mx-auto mb-4 opacity-40" />
              <p className="text-lg font-medium">Sign in to access your referral link</p>
              <p className="text-sm mt-2">Create an account and start earning GYDS for every friend you invite.</p>
            </CardContent>
          </Card>
        ) : (
          <>
            {/* Stats Row */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Card>
                <CardContent className="pt-6 flex items-center gap-4">
                  <div className="p-3 rounded-xl bg-primary/10">
                    <Users className="h-6 w-6 text-primary" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{referredCount}</p>
                    <p className="text-sm text-muted-foreground">Friends Referred</p>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6 flex items-center gap-4">
                  <div className="p-3 rounded-xl bg-yellow-500/10">
                    <Coins className="h-6 w-6 text-yellow-500" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{fmt(totalEarned)}</p>
                    <p className="text-sm text-muted-foreground">GYDS Earned</p>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6 flex items-center gap-4">
                  <div className="p-3 rounded-xl bg-cyan-500/10">
                    <TrendingUp className="h-6 w-6 text-cyan-500" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{tier.pct}%</p>
                    <p className="text-sm text-muted-foreground">Commission Tier</p>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Tier Progress */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Trophy className="h-4 w-4 text-yellow-400" /> Tier Progress
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between text-sm">
                  <span className={`font-semibold flex items-center gap-1.5 ${tier.color}`}>
                    {tier.icon} {tier.name}
                  </span>
                  {next ? (
                    <span className={`font-semibold flex items-center gap-1.5 ${next.color}`}>
                      {next.icon} {next.name}
                      <span className="text-muted-foreground font-normal">({next.min} referrals)</span>
                    </span>
                  ) : (
                    <span className="text-cyan-400 font-semibold flex items-center gap-1.5">
                      <Sparkles className="h-4 w-4" /> Max Tier
                    </span>
                  )}
                </div>
                <Progress value={prog} className="h-2" />
                <p className="text-xs text-muted-foreground">
                  {next
                    ? `${next.min - referredCount} more referral${next.min - referredCount !== 1 ? 's' : ''} to reach ${next.name} (${next.pct}% commission)`
                    : 'You have reached the highest referral tier! 🎉'}
                </p>

                {/* All tiers */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
                  {TIERS.map(t => (
                    <div
                      key={t.name}
                      className={`rounded-lg border p-3 text-center space-y-1 transition-colors ${
                        t.name === tier.name ? 'border-primary/50 bg-primary/5' : 'border-border/50'
                      }`}
                    >
                      <div className={`flex justify-center ${t.color}`}>{t.icon}</div>
                      <p className={`text-sm font-semibold ${t.color}`}>{t.name}</p>
                      <p className="text-xs text-muted-foreground">{t.pct}% commission</p>
                      <p className="text-xs text-muted-foreground">{t.min}+ referrals</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Tabs defaultValue="share">
              <TabsList className="grid grid-cols-3 w-full max-w-md">
                <TabsTrigger value="share"><Share2 className="h-3.5 w-3.5 mr-1.5" />Share</TabsTrigger>
                <TabsTrigger value="history"><Clock className="h-3.5 w-3.5 mr-1.5" />History</TabsTrigger>
                <TabsTrigger value="leaderboard"><Trophy className="h-3.5 w-3.5 mr-1.5" />Leaderboard</TabsTrigger>
              </TabsList>

              {/* Share Tab */}
              <TabsContent value="share" className="space-y-4 mt-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <Link2 className="h-4 w-4" /> Your Referral Link
                    </CardTitle>
                    <CardDescription>Share this link — friends who sign up earn a welcome bonus and you earn 500 GYDS.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {/* Code display */}
                    <div className="flex items-center gap-2">
                      <div className="flex-1 rounded-lg border bg-muted/30 px-4 py-2 font-mono text-sm tracking-widest select-all">
                        {code || '…'}
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => copy(code, 'Code copied!')}
                        className="shrink-0"
                      >
                        {copied ? <Check className="h-4 w-4 text-green-400" /> : <Copy className="h-4 w-4" />}
                      </Button>
                    </div>

                    {/* Full link */}
                    <div className="flex items-center gap-2">
                      <Input value={referralLink} readOnly className="font-mono text-xs" />
                      <Button
                        size="sm"
                        onClick={() => copy(referralLink, 'Link copied!')}
                        className="shrink-0"
                      >
                        <Copy className="h-4 w-4 mr-1.5" /> Copy Link
                      </Button>
                    </div>

                    {/* Social share */}
                    <div className="flex flex-wrap gap-2 pt-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-2"
                        onClick={() => window.open(`https://twitter.com/intent/tweet?text=${tweetText}`, '_blank')}
                      >
                        <Twitter className="h-4 w-4 text-sky-400" /> Tweet
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-2"
                        onClick={() => window.open(`https://t.me/share/url?url=${encodeURIComponent(referralLink)}&text=${encodeURIComponent('Join GYDS blockchain and get 500 GYDS!')}`, '_blank')}
                      >
                        <MessageCircle className="h-4 w-4 text-blue-400" /> Telegram
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-2"
                        onClick={() => copy(`Join the GYDS blockchain network!\n\nSign up with my referral code: ${code}\n${referralLink}\n\nYou'll get a welcome bonus and I earn 500 GYDS. 🚀`, 'Message copied!')}
                      >
                        <Copy className="h-4 w-4" /> Copy Message
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                {/* Apply code */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <Zap className="h-4 w-4 text-yellow-400" /> Apply a Referral Code
                    </CardTitle>
                    <CardDescription>Got a code from a friend? Enter it here to apply it to your account.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex gap-2">
                      <Input
                        placeholder="GYDS-XXXXXX-XXXX"
                        value={codeInput}
                        onChange={e => setCodeInput(e.target.value.toUpperCase())}
                        className="font-mono"
                        maxLength={20}
                        onKeyDown={e => e.key === 'Enter' && codeInput.trim() && useCodeMutation.mutate(codeInput.trim())}
                      />
                      <Button
                        onClick={() => useCodeMutation.mutate(codeInput.trim())}
                        disabled={!codeInput.trim() || useCodeMutation.isPending}
                      >
                        Apply
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                {/* How it works */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">How It Works</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid sm:grid-cols-3 gap-4">
                      {[
                        { icon: <Share2 className="h-5 w-5 text-primary" />, step: '1', title: 'Share Your Link', desc: 'Send your unique referral link or code to friends.' },
                        { icon: <Users className="h-5 w-5 text-green-400" />, step: '2', title: 'Friend Signs Up', desc: 'They create an account using your link or code.' },
                        { icon: <Coins className="h-5 w-5 text-yellow-400" />, step: '3', title: 'Both Earn Rewards', desc: 'You get 500 GYDS + 100 XP. They get a welcome bonus.' },
                      ].map(({ icon, step, title, desc }) => (
                        <div key={step} className="flex flex-col items-center text-center gap-2">
                          <div className="relative">
                            <div className="p-3 rounded-full bg-muted">{icon}</div>
                            <span className="absolute -top-1 -right-1 bg-primary text-primary-foreground text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">{step}</span>
                          </div>
                          <p className="font-semibold text-sm">{title}</p>
                          <p className="text-xs text-muted-foreground">{desc}</p>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* History Tab */}
              <TabsContent value="history" className="mt-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <Clock className="h-4 w-4" /> Referral History
                    </CardTitle>
                    <CardDescription>{events.length} successful referral{events.length !== 1 ? 's' : ''}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {events.length === 0 ? (
                      <div className="py-12 text-center text-muted-foreground">
                        <Users className="h-10 w-10 mx-auto mb-3 opacity-30" />
                        <p>No referrals yet. Share your link to get started!</p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {events.map((ev: any, i: number) => (
                          <div key={ev.id ?? i} className="flex items-center justify-between rounded-lg border p-3">
                            <div className="flex items-center gap-3">
                              <div className="p-2 rounded-full bg-green-500/10">
                                <Users className="h-4 w-4 text-green-400" />
                              </div>
                              <div>
                                <p className="text-sm font-medium">
                                  {ev.referee_username
                                    ? `@${ev.referee_username} joined`
                                    : 'New user joined'}
                                </p>
                                <p className="text-xs text-muted-foreground">{ev.created_at ? timeAgo(ev.created_at) : ''}</p>
                              </div>
                            </div>
                            <Badge variant="outline" className="text-yellow-400 border-yellow-400/30">
                              +{fmt(ev.reward_amount ?? 500)} GYDS
                            </Badge>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Leaderboard Tab */}
              <TabsContent value="leaderboard" className="mt-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <Trophy className="h-4 w-4 text-yellow-400" /> Top Referrers
                    </CardTitle>
                    <CardDescription>All-time GYDS referral leaderboard</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {leaderboard.length === 0 ? (
                      <div className="py-12 text-center text-muted-foreground">
                        <Trophy className="h-10 w-10 mx-auto mb-3 opacity-30" />
                        <p>No referrals yet — be the first on the leaderboard!</p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {leaderboard.map((entry: any, i: number) => {
                          const entryTier = getTier(entry.referred_count ?? 0);
                          const isMe = entry.user_id === (user as any)?.id?.toString();
                          return (
                            <div
                              key={entry.user_id ?? i}
                              className={`flex items-center gap-3 rounded-lg border p-3 transition-colors ${isMe ? 'border-primary/40 bg-primary/5' : ''}`}
                            >
                              {/* Rank */}
                              <div className="w-8 text-center">
                                {i === 0 ? <Crown className="h-5 w-5 text-yellow-400 mx-auto" />
                                  : i === 1 ? <Medal className="h-5 w-5 text-slate-300 mx-auto" />
                                  : i === 2 ? <Medal className="h-5 w-5 text-amber-600 mx-auto" />
                                  : <span className="text-sm text-muted-foreground font-mono">#{i + 1}</span>}
                              </div>

                              {/* Name */}
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium truncate">
                                  {entry.username ?? `User ${String(entry.user_id).slice(0, 6)}`}
                                  {isMe && <span className="ml-2 text-xs text-primary">(you)</span>}
                                </p>
                                <p className={`text-xs flex items-center gap-1 ${entryTier.color}`}>
                                  {entryTier.icon} {entryTier.name}
                                </p>
                              </div>

                              {/* Stats */}
                              <div className="text-right shrink-0">
                                <p className="text-sm font-semibold text-yellow-400">{fmt(entry.total_earned)} GYDS</p>
                                <p className="text-xs text-muted-foreground">{entry.referred_count ?? 0} referral{(entry.referred_count ?? 0) !== 1 ? 's' : ''}</p>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </>
        )}
      </div>
    </Layout>
  );
}
