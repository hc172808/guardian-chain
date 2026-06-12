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
          <TabsList>
            <TabsTrigger value="feed">Feed</TabsTrigger>
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
