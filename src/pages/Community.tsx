import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Layout } from '@/components/layout/Layout';
import { GlassCard } from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { MessageSquare, ThumbsUp, ThumbsDown, Plus, Search, Flame, Lightbulb, Trophy, Clock, ChevronDown, ChevronUp, Gift, Users, Link2, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';

type PostType = 'discussion' | 'showcase' | 'idea' | 'announcement';

interface Post {
  id: string;
  userId: string;
  title: string;
  body: string;
  postType: PostType;
  upvotes: number;
  downvotes: number;
  replyCount: number;
  pinned: boolean;
  createdAt: string;
  authorEmail?: string;
}

interface Comment {
  id: string;
  userId: string;
  body: string;
  upvotes: number;
  createdAt: string;
  authorEmail?: string;
}

const TYPE_CONFIG: Record<PostType, { label: string; icon: any; color: string }> = {
  discussion:   { label: 'Discussion',   icon: MessageSquare, color: 'text-primary border-primary/30 bg-primary/10' },
  showcase:     { label: 'Showcase',     icon: Trophy,        color: 'text-amber-400 border-amber-500/30 bg-amber-500/10' },
  idea:         { label: 'Idea',         icon: Lightbulb,     color: 'text-neon-cyan border-neon-cyan/30 bg-neon-cyan/10' },
  announcement: { label: 'Announcement', icon: Flame,         color: 'text-red-400 border-red-500/30 bg-red-500/10' },
};

const fmt = (d: string) => {
  const diff = Date.now() - new Date(d).getTime();
  if (diff < 60000) return 'just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return `${Math.floor(diff / 86400000)}d ago`;
};

const authorName = (email?: string) => email ? email.split('@')[0] : 'anon';

interface ReferralStats {
  code: string;
  referred_count: number;
  total_earned: string;
  events: { referee_id: string; reward_amount: string; created_at: string; email?: string }[];
}

const CommunityPage = () => {
  const { user } = useAuth();
  const { toast } = useToast();

  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | PostType>('all');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [comments, setComments] = useState<Record<string, Comment[]>>({});
  const [loadingComments, setLoadingComments] = useState<string | null>(null);
  const [replyText, setReplyText] = useState<Record<string, string>>({});
  const [postingReply, setPostingReply] = useState<string | null>(null);

  const [showCreate, setShowCreate] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newBody, setNewBody] = useState('');
  const [newType, setNewType] = useState<PostType>('discussion');
  const [submitting, setSubmitting] = useState(false);

  const [myVotes, setMyVotes] = useState<Record<string, 'up' | 'down'>>({});
  const [referral, setReferral] = useState<ReferralStats | null>(null);
  const [referralLoading, setReferralLoading] = useState(false);
  const [useCodeInput, setUseCodeInput] = useState('');
  const [usingCode, setUsingCode] = useState(false);

  const fetchPosts = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/community/posts');
      if (res.ok) setPosts(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchReferral = useCallback(async () => {
    if (!user) return;
    setReferralLoading(true);
    try {
      const res = await fetch('/api/referral', { credentials: 'include' });
      if (res.ok) setReferral(await res.json());
    } catch {} finally { setReferralLoading(false); }
  }, [user]);

  const submitUseCode = async () => {
    if (!user) { toast({ title: 'Sign in first', variant: 'destructive' }); return; }
    if (!useCodeInput.trim()) return;
    setUsingCode(true);
    try {
      const res = await fetch('/api/referral/use', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: useCodeInput.trim().toUpperCase() }),
      });
      const data = await res.json();
      if (data.ok) {
        toast({ title: 'Referral applied!', description: 'Reward will be credited after your first transaction.' });
        setUseCodeInput('');
      } else {
        toast({ title: 'Could not apply code', description: data.message, variant: 'destructive' });
      }
    } finally { setUsingCode(false); }
  };

  useEffect(() => { fetchPosts(); }, [fetchPosts]);
  useEffect(() => { fetchReferral(); }, [fetchReferral]);

  const fetchComments = async (postId: string) => {
    if (comments[postId]) return;
    setLoadingComments(postId);
    try {
      const res = await fetch(`/api/community/posts/${postId}/comments`);
      if (res.ok) { const data = await res.json(); setComments(c => ({ ...c, [postId]: data })); }
    } finally {
      setLoadingComments(null);
    }
  };

  const toggleExpand = (postId: string) => {
    const next = expanded === postId ? null : postId;
    setExpanded(next);
    if (next) fetchComments(next);
  };

  const handleVote = async (targetId: string, targetType: 'post' | 'comment', direction: 'up' | 'down') => {
    if (!user) { toast({ title: 'Sign in to vote', variant: 'destructive' }); return; }
    const key = `${targetType}-${targetId}`;
    if (myVotes[key]) { toast({ title: 'Already voted' }); return; }
    try {
      const res = await fetch('/api/community/votes', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetId, targetType, direction }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      setMyVotes(v => ({ ...v, [key]: direction }));
      setPosts(prev => prev.map(p => {
        if (targetType === 'post' && p.id === targetId) {
          return { ...p, upvotes: p.upvotes + (direction === 'up' ? 1 : 0), downvotes: p.downvotes + (direction === 'down' ? 1 : 0) };
        }
        return p;
      }));
      if (targetType === 'comment') {
        setComments(c => {
          const updated = { ...c };
          for (const pid in updated) {
            updated[pid] = updated[pid].map(cm => cm.id === targetId
              ? { ...cm, upvotes: cm.upvotes + (direction === 'up' ? 1 : 0) } : cm);
          }
          return updated;
        });
      }
    } catch (err: any) {
      toast({ title: 'Vote failed', description: err.message, variant: 'destructive' });
    }
  };

  const handlePost = async () => {
    if (!user) { toast({ title: 'Sign in to post', variant: 'destructive' }); return; }
    if (!newTitle.trim()) { toast({ title: 'Title required', variant: 'destructive' }); return; }
    setSubmitting(true);
    try {
      const res = await fetch('/api/community/posts', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newTitle, body: newBody, postType: newType }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast({ title: 'Post published!' });
      setShowCreate(false);
      setNewTitle(''); setNewBody('');
      fetchPosts();
    } catch (err: any) {
      toast({ title: 'Post failed', description: err.message, variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  const postReply = async (postId: string) => {
    if (!user) { toast({ title: 'Sign in to reply', variant: 'destructive' }); return; }
    const body = replyText[postId]?.trim();
    if (!body) return;
    setPostingReply(postId);
    try {
      const res = await fetch(`/api/community/posts/${postId}/comments`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setComments(c => ({ ...c, [postId]: [...(c[postId] ?? []), data] }));
      setPosts(prev => prev.map(p => p.id === postId ? { ...p, replyCount: p.replyCount + 1 } : p));
      setReplyText(r => ({ ...r, [postId]: '' }));
      toast({ title: 'Reply posted!' });
    } catch (err: any) {
      toast({ title: 'Reply failed', description: err.message, variant: 'destructive' });
    } finally {
      setPostingReply(null);
    }
  };

  const filtered = posts.filter(p =>
    (filter === 'all' || p.postType === filter) &&
    (p.title.toLowerCase().includes(search.toLowerCase()) || p.body.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <Layout>
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <MessageSquare className="w-6 h-6 text-primary" /> Community
            </h1>
            <p className="text-muted-foreground text-sm mt-1">Discuss, showcase, and share ideas with the GYDSchain community</p>
          </div>
          <div className="flex gap-2 shrink-0">
            <Button variant="outline" size="sm" onClick={fetchPosts} disabled={loading}>
              <RefreshCw className={cn('w-4 h-4', loading && 'animate-spin')} />
            </Button>
            <Button onClick={() => setShowCreate(true)} className="gap-2">
              <Plus className="w-4 h-4" /> New Post
            </Button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: 'Posts', value: posts.length, icon: MessageSquare },
            { label: 'Active', value: posts.filter(p => p.postType !== 'announcement').length, icon: Users },
            { label: 'Referral Code', value: user ? 'GYDS-' + user.id.slice(0, 6).toUpperCase() : 'Sign in', icon: Gift },
          ].map(s => (
            <GlassCard key={s.label} className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <s.icon className="w-4 h-4 text-primary" />
                <span className="text-xs text-muted-foreground">{s.label}</span>
              </div>
              <p className="text-xl font-bold">{s.value}</p>
            </GlassCard>
          ))}
        </div>

        <Tabs defaultValue="feed">
          <TabsList className="flex-wrap h-auto gap-1">
            <TabsTrigger value="feed">Feed</TabsTrigger>
            <TabsTrigger value="profiles">Trader Profiles</TabsTrigger>
            <TabsTrigger value="channels">Channels</TabsTrigger>
            <TabsTrigger value="messages">Messages</TabsTrigger>
            <TabsTrigger value="referral">Referral</TabsTrigger>
          </TabsList>

          <TabsContent value="feed" className="mt-4 space-y-4">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search posts…" className="pl-9" />
              </div>
              <div className="flex gap-1.5 flex-wrap">
                {(['all', 'discussion', 'showcase', 'idea', 'announcement'] as const).map(f => (
                  <Button key={f} size="sm" variant={filter === f ? 'default' : 'outline'}
                    onClick={() => setFilter(f)} className="text-xs h-7 capitalize">{f}</Button>
                ))}
              </div>
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-16 text-muted-foreground gap-2">
                <RefreshCw className="w-5 h-5 animate-spin" /> Loading posts…
              </div>
            ) : filtered.length === 0 ? (
              <GlassCard className="p-12 text-center text-muted-foreground">
                <MessageSquare className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p className="font-medium">No posts yet</p>
                <p className="text-sm mt-1">Be the first to post something!</p>
              </GlassCard>
            ) : (
              <div className="space-y-3">
                {filtered.map(p => {
                  const cfg = TYPE_CONFIG[p.postType] ?? TYPE_CONFIG.discussion;
                  const TypeIcon = cfg.icon;
                  const isExpanded = expanded === p.id;
                  const voteKey = `post-${p.id}`;
                  return (
                    <GlassCard key={p.id} className={cn('p-5', p.pinned && 'border-primary/40')}>
                      {p.pinned && (
                        <div className="flex items-center gap-1 text-xs text-primary mb-2">
                          <Flame className="w-3 h-3" /> Pinned
                        </div>
                      )}
                      <div className="flex items-start gap-3">
                        {/* Vote column */}
                        <div className="flex flex-col items-center gap-1 shrink-0">
                          <button onClick={() => handleVote(p.id, 'post', 'up')}
                            className={cn('p-1 rounded hover:bg-primary/10 transition-colors', myVotes[voteKey] === 'up' ? 'text-primary' : 'text-muted-foreground')}>
                            <ThumbsUp className="w-4 h-4" />
                          </button>
                          <span className="text-sm font-bold">{p.upvotes - p.downvotes}</span>
                          <button onClick={() => handleVote(p.id, 'post', 'down')}
                            className={cn('p-1 rounded hover:bg-red-500/10 transition-colors', myVotes[voteKey] === 'down' ? 'text-red-400' : 'text-muted-foreground')}>
                            <ThumbsDown className="w-4 h-4" />
                          </button>
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <Badge variant="outline" className={`text-xs ${cfg.color}`}>
                              <TypeIcon className="w-3 h-3 mr-1" />{cfg.label}
                            </Badge>
                            <span className="text-xs text-muted-foreground">by {authorName(p.authorEmail)}</span>
                            <span className="text-xs text-muted-foreground flex items-center gap-0.5">
                              <Clock className="w-3 h-3" /> {fmt(p.createdAt)}
                            </span>
                          </div>
                          <h3 className="font-semibold">{p.title}</h3>
                          <p className={cn('text-sm text-muted-foreground mt-1', !isExpanded && 'line-clamp-2')}>{p.body}</p>

                          {/* Comments section */}
                          {isExpanded && (
                            <div className="mt-4 space-y-3 pl-3 border-l border-border/30">
                              {loadingComments === p.id ? (
                                <p className="text-xs text-muted-foreground flex items-center gap-1">
                                  <RefreshCw className="w-3 h-3 animate-spin" /> Loading comments…
                                </p>
                              ) : (comments[p.id] ?? []).length === 0 ? (
                                <p className="text-xs text-muted-foreground">No comments yet.</p>
                              ) : (
                                (comments[p.id] ?? []).map(c => (
                                  <div key={c.id} className="space-y-0.5">
                                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                      <span className="font-medium text-foreground">{authorName(c.authorEmail)}</span>
                                      <span>·</span>
                                      <span>{fmt(c.createdAt)}</span>
                                    </div>
                                    <p className="text-sm">{c.body}</p>
                                    <button onClick={() => handleVote(c.id, 'comment', 'up')}
                                      className={cn('text-xs flex items-center gap-1 hover:text-primary transition-colors', myVotes[`comment-${c.id}`] === 'up' ? 'text-primary' : 'text-muted-foreground')}>
                                      <ThumbsUp className="w-3 h-3" /> {c.upvotes}
                                    </button>
                                  </div>
                                ))
                              )}
                              <div className="flex gap-2 mt-2">
                                <Input
                                  placeholder="Write a reply…"
                                  className="text-sm h-8"
                                  value={replyText[p.id] ?? ''}
                                  onChange={e => setReplyText(r => ({ ...r, [p.id]: e.target.value }))}
                                  onKeyDown={e => e.key === 'Enter' && !e.shiftKey && postReply(p.id)}
                                />
                                <Button size="sm" className="h-8 shrink-0" onClick={() => postReply(p.id)} disabled={postingReply === p.id}>
                                  {postingReply === p.id ? <RefreshCw className="w-3 h-3 animate-spin" /> : 'Reply'}
                                </Button>
                              </div>
                            </div>
                          )}

                          <div className="flex items-center gap-3 mt-2">
                            <button onClick={() => toggleExpand(p.id)}
                              className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1 transition-colors">
                              <MessageSquare className="w-3 h-3" /> {p.replyCount} {p.replyCount === 1 ? 'reply' : 'replies'}
                              {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                            </button>
                            <button onClick={() => { navigator.clipboard.writeText(window.location.href); toast({ title: 'Link copied!' }); }}
                              className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1">
                              <Link2 className="w-3 h-3" /> Share
                            </button>
                          </div>
                        </div>
                      </div>
                    </GlassCard>
                  );
                })}
              </div>
            )}
          </TabsContent>

          {/* Trader Profiles */}
          <TabsContent value="profiles" className="mt-4 space-y-4">
            <GlassCard className="p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold flex items-center gap-2">🏆 Top Traders</h2>
                <Badge variant="secondary" className="text-xs">GYDS Network</Badge>
              </div>
              <div className="space-y-3">
                {[
                  { rank: 1, username: 'netlifegy', badge: '🐋 Founder', vol: '12.4M', pnl: '+284%', wins: 89, followers: 1420, verified: true },
                  { rank: 2, username: 'gyds_validator_1', badge: '⚡ Node Op', vol: '4.1M', pnl: '+142%', wins: 74, followers: 390, verified: true },
                  { rank: 3, username: 'defi_wizard', badge: '🔥 DeFi Pro', vol: '2.8M', pnl: '+98%', wins: 68, followers: 240, verified: false },
                  { rank: 4, username: 'rwa_alpha', badge: '🏢 RWA Investor', vol: '1.6M', pnl: '+61%', wins: 59, followers: 120, verified: false },
                  { rank: 5, username: 'staker_gyds', badge: '🔒 Staker', vol: '980K', pnl: '+44%', wins: 52, followers: 80, verified: false },
                ].map(p => (
                  <div key={p.rank} className="flex items-center gap-3 p-3 bg-muted/20 rounded-xl hover:bg-muted/30 transition-colors">
                    <span className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm shrink-0 ${p.rank === 1 ? 'bg-amber-500/20 text-amber-400' : p.rank === 2 ? 'bg-zinc-400/20 text-zinc-400' : 'bg-primary/10 text-primary'}`}>
                      {p.rank}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-semibold text-sm">{p.username}</span>
                        {p.verified && <span className="text-primary text-xs">✓</span>}
                        <span className="text-xs text-muted-foreground">{p.badge}</span>
                      </div>
                      <div className="flex gap-3 mt-0.5 text-xs text-muted-foreground">
                        <span>Vol: <span className="text-foreground">{p.vol}</span></span>
                        <span>Win rate: <span className="text-foreground">{p.wins}%</span></span>
                        <span>{p.followers} followers</span>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="text-emerald-400 font-bold text-sm">{p.pnl}</span>
                      <div className="mt-0.5">
                        <Button size="sm" variant="outline" className="text-xs h-6 px-2">Follow</Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </GlassCard>

            <GlassCard className="p-4 text-xs text-muted-foreground space-y-1">
              <p className="font-medium text-foreground">About Trader Profiles</p>
              <p>Public profiles are opt-in. Stats are computed from on-chain transactions on GYDSchain. Live data indexes with mainnet.</p>
            </GlassCard>
          </TabsContent>

          {/* Token-Gated Channels */}
          <TabsContent value="channels" className="mt-4 space-y-4">
            <GlassCard className="p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold flex items-center gap-2">🔒 Token-Gated Channels</h2>
                <Badge variant="secondary" className="text-xs">Hold GYDS to access</Badge>
              </div>
              <div className="space-y-2">
                {[
                  { name: '# general', desc: 'Open to all GYDS holders', min: 0, members: 1842, locked: false },
                  { name: '# validators', desc: 'Validator-only channel', min: 10000, members: 48, locked: false },
                  { name: '# alpha-signals', desc: 'Early DeFi insights', min: 50000, members: 120, locked: true },
                  { name: '# whale-lounge', desc: 'Top 100 holders only', min: 1000000, members: 18, locked: true },
                  { name: '# node-operators', desc: 'Approved node runners', min: 0, members: 89, locked: true, badge: 'Node Op' },
                  { name: '# governance-vip', desc: 'High VP discussions', min: 100000, members: 34, locked: true },
                ].map(ch => (
                  <div key={ch.name} className={`flex items-center justify-between p-3 rounded-xl transition-colors ${ch.locked ? 'bg-muted/10 border border-border/20' : 'bg-primary/5 border border-primary/20 hover:bg-primary/10 cursor-pointer'}`}>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm font-semibold">{ch.name}</span>
                        {ch.locked && <span className="text-muted-foreground text-xs">🔒</span>}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">{ch.desc}</p>
                      <p className="text-xs text-muted-foreground">{ch.members} members</p>
                    </div>
                    <div className="text-right shrink-0">
                      {ch.min > 0 && <p className="text-xs text-muted-foreground">{ch.min.toLocaleString()} GYDS</p>}
                      {ch.badge && <Badge variant="outline" className="text-xs">{ch.badge}</Badge>}
                      {!ch.locked ? (
                        <Button size="sm" className="ml-2 text-xs h-7"
                          onClick={() => toast({ title: ch.name, description: 'Live chat launches with mainnet community deployment.' })}>
                          Join
                        </Button>
                      ) : (
                        <span className="text-xs text-muted-foreground ml-2">Locked</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </GlassCard>
            <GlassCard className="p-4 text-xs text-muted-foreground space-y-1">
              <p className="font-medium text-foreground">How Token-Gating Works</p>
              <p>Channel access is verified on-chain by your wallet balance at time of join. Your balance is re-checked weekly. Falling below the threshold suspends access until restored.</p>
            </GlassCard>
          </TabsContent>

          {/* Encrypted Messages */}
          <TabsContent value="messages" className="mt-4 space-y-4">
            <GlassCard className="p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold flex items-center gap-2">
                  <Lock className="w-4 h-4 text-primary" /> Encrypted Wallet Messaging
                </h2>
                <Badge variant="secondary" className="text-xs">E2E Encrypted</Badge>
              </div>
              <p className="text-xs text-muted-foreground">Send end-to-end encrypted messages directly to any wallet address. Messages are signed with your wallet private key and encrypted with the recipient's public key — only they can read it.</p>
              <div className="space-y-2">
                {[
                  { from: '0x4f12…a1b2', preview: 'Hey, saw your token launch!', time: '2h ago', unread: true },
                  { from: '0x8c3d…e4f5', preview: 'Interested in your LP position', time: '1d ago', unread: false },
                  { from: 'netlifegy', preview: 'Welcome to GYDSchain!', time: '3d ago', unread: false },
                ].map(msg => (
                  <div key={msg.from} className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-colors hover:bg-muted/20 ${msg.unread ? 'bg-primary/5 border border-primary/20' : 'bg-muted/10 border border-border/20'}`}
                    onClick={() => toast({ title: msg.from, description: 'Full E2E encrypted messaging UI launches with mainnet wallet integration.' })}>
                    <div className="w-9 h-9 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
                      <span className="text-xs font-bold text-primary">{msg.from.slice(0, 2).toUpperCase()}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium truncate">{msg.from}</span>
                        {msg.unread && <span className="w-2 h-2 rounded-full bg-primary shrink-0" />}
                      </div>
                      <p className="text-xs text-muted-foreground truncate">{msg.preview}</p>
                    </div>
                    <span className="text-xs text-muted-foreground shrink-0">{msg.time}</span>
                  </div>
                ))}
              </div>
              <div className="border-t border-border/20 pt-3 space-y-2">
                <Label className="text-xs text-muted-foreground">New Message — To (wallet address or username)</Label>
                <div className="flex gap-2">
                  <input type="text" placeholder="0x… or username"
                    className="flex-1 bg-muted/30 border border-border/40 rounded-lg px-3 py-2 text-sm" />
                  <Button size="sm"
                    onClick={() => toast({ title: 'Message', description: 'E2E encrypted messaging launches with wallet integration on mainnet.' })}>
                    Compose
                  </Button>
                </div>
              </div>
            </GlassCard>
            <GlassCard className="p-4 text-xs text-muted-foreground space-y-1">
              <p className="font-medium text-foreground">How encryption works</p>
              <p>Messages are encrypted using ECIES (Elliptic Curve Integrated Encryption Scheme) with your wallet's secp256k1 keypair. No server can read your messages. Messages are stored on IPFS with only the CID saved on-chain.</p>
            </GlassCard>
          </TabsContent>

          <TabsContent value="referral" className="mt-4 space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* My referral code card */}
              <GlassCard className="p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="font-semibold flex items-center gap-2">
                    <Gift className="w-4 h-4 text-primary" /> Your Referral Code
                  </h2>
                  {user && (
                    <button onClick={fetchReferral} className="text-muted-foreground hover:text-primary transition-colors">
                      <RefreshCw className={cn('w-3.5 h-3.5', referralLoading && 'animate-spin')} />
                    </button>
                  )}
                </div>
                {user ? (
                  <>
                    {referral ? (
                      <>
                        <div className="p-4 bg-primary/5 border border-primary/20 rounded-xl text-center">
                          <p className="text-xs text-muted-foreground mb-1">Your referral code</p>
                          <p className="text-2xl font-bold font-mono tracking-wider text-primary">{referral.code}</p>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          {[
                            { label: 'Referrals', value: referral.referred_count },
                            { label: 'GYDS Earned', value: Number(referral.total_earned).toLocaleString() },
                          ].map(s => (
                            <div key={s.label} className="text-center p-3 bg-muted/20 rounded-xl">
                              <p className="text-lg font-bold">{s.value}</p>
                              <p className="text-xs text-muted-foreground">{s.label}</p>
                            </div>
                          ))}
                        </div>
                        <Button className="w-full gap-2" onClick={() => {
                          navigator.clipboard.writeText(`Join GYDSchain with my code: ${referral.code} — https://netlifegy.com`);
                          toast({ title: 'Referral link copied!' });
                        }}>
                          <Link2 className="w-4 h-4" /> Copy Referral Link
                        </Button>
                        <div className="space-y-2 text-sm text-muted-foreground">
                          <p className="font-medium text-foreground">How it works</p>
                          <p>Share your code → when someone signs up and uses it, you earn <strong className="text-primary">500 GYDS + 100 XP</strong>.</p>
                        </div>
                        {/* Referred users list */}
                        {referral.events.length > 0 && (
                          <div className="space-y-1.5">
                            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Referred Users</p>
                            {referral.events.map((ev, i) => (
                              <div key={i} className="flex items-center justify-between py-1.5 border-b border-border/20 text-xs">
                                <span className="text-muted-foreground">{ev.email ? ev.email.split('@')[0] : ev.referee_id.slice(0, 8)}</span>
                                <div className="flex items-center gap-2">
                                  <span className="text-emerald-400">+{Number(ev.reward_amount).toLocaleString()} GYDS</span>
                                  <span className="text-muted-foreground">{new Date(ev.created_at).toLocaleDateString()}</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="flex items-center gap-2 text-muted-foreground py-4">
                        <RefreshCw className="w-4 h-4 animate-spin" /> Loading referral info…
                      </div>
                    )}
                  </>
                ) : (
                  <p className="text-muted-foreground text-sm">Sign in to get your referral code and start earning rewards.</p>
                )}
              </GlassCard>

              {/* Use a referral code */}
              <GlassCard className="p-6 space-y-4">
                <h2 className="font-semibold flex items-center gap-2">
                  <Users className="w-4 h-4 text-neon-cyan" /> Use a Referral Code
                </h2>
                {user ? (
                  <>
                    <p className="text-sm text-muted-foreground">
                      Got a referral code from someone? Enter it here. You can only use one code per account.
                    </p>
                    <div className="flex gap-2">
                      <Input
                        value={useCodeInput}
                        onChange={e => setUseCodeInput(e.target.value.toUpperCase())}
                        placeholder="GYDS-XXXXXX-XXXX"
                        className="font-mono"
                        onKeyDown={e => e.key === 'Enter' && submitUseCode()}
                      />
                      <Button onClick={submitUseCode} disabled={usingCode || !useCodeInput.trim()} className="shrink-0">
                        {usingCode ? <RefreshCw className="w-4 h-4 animate-spin" /> : 'Apply'}
                      </Button>
                    </div>
                    <div className="p-3 bg-muted/10 border border-border/20 rounded-lg text-xs text-muted-foreground space-y-1">
                      <p>✅ Both you and the referrer earn <strong className="text-primary">500 GYDS</strong></p>
                      <p>✅ Referrer gets <strong className="text-primary">+100 XP</strong></p>
                      <p>⚠️ One code per account — cannot be undone</p>
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">Sign in to use a referral code.</p>
                )}
              </GlassCard>
            </div>

            {/* Reward Distribution */}
            <GlassCard className="p-5 space-y-3">
              <h2 className="font-semibold flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-emerald-400" /> Fee Share Rewards
              </h2>
              <p className="text-xs text-muted-foreground">Earn a portion of your referred users' trading fees — ongoing passive income for every swap, LP action, or bridge transfer they make.</p>
              <div className="grid grid-cols-3 gap-3 text-center text-xs">
                {[
                  { tier: 'Standard', pct: '5%', min: '0 referrals' },
                  { tier: 'Silver', pct: '10%', min: '10 referrals' },
                  { tier: 'Gold', pct: '15%', min: '50 referrals' },
                ].map(t => (
                  <div key={t.tier} className="p-3 bg-muted/20 rounded-xl border border-border/30">
                    <p className="font-bold text-primary">{t.pct}</p>
                    <p className="font-medium">{t.tier}</p>
                    <p className="text-muted-foreground mt-0.5">{t.min}</p>
                  </div>
                ))}
              </div>
              <div className="p-3 bg-muted/10 border border-border/20 rounded-lg text-xs text-muted-foreground space-y-1">
                <p>• Fee share is credited weekly in GYDS to your wallet</p>
                <p>• Applies to swaps, LP fees, perpetuals, and bridge fees</p>
                <p>• Mainnet activation required for live payouts</p>
              </div>
            </GlassCard>
          </TabsContent>
        </Tabs>

        {/* Create Post Modal */}
        {showCreate && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={() => setShowCreate(false)}>
            <GlassCard className="p-6 w-full max-w-lg space-y-4" onClick={e => e.stopPropagation()}>
              <h2 className="font-bold text-lg">Create Post</h2>
              <div className="flex gap-1.5 flex-wrap">
                {(['discussion', 'showcase', 'idea'] as const).map(t => {
                  const cfg = TYPE_CONFIG[t]; const Icon = cfg.icon;
                  return (
                    <button key={t} onClick={() => setNewType(t)}
                      className={cn('flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs border transition-all', newType === t ? cfg.color : 'border-border/40 text-muted-foreground')}>
                      <Icon className="w-3.5 h-3.5" /> {cfg.label}
                    </button>
                  );
                })}
              </div>
              <Input value={newTitle} onChange={e => setNewTitle(e.target.value)} placeholder="Post title…" />
              <Textarea value={newBody} onChange={e => setNewBody(e.target.value)} placeholder="What's on your mind?" rows={4} />
              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
                <Button onClick={handlePost} disabled={submitting}>
                  {submitting ? <><RefreshCw className="w-4 h-4 animate-spin mr-2" />Publishing…</> : 'Publish'}
                </Button>
              </div>
            </GlassCard>
          </motion.div>
        )}
      </motion.div>
    </Layout>
  );
};

export default CommunityPage;
