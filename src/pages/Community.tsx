import { useState } from 'react';
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
import {
  MessageSquare, ThumbsUp, ThumbsDown, Plus, Search,
  Flame, Lightbulb, Trophy, Clock, ChevronDown, ChevronUp,
  Gift, Users, Link2
} from 'lucide-react';

type PostType = 'discussion' | 'showcase' | 'idea' | 'announcement';

interface Post {
  id: string;
  title: string;
  body: string;
  type: PostType;
  author: string;
  upvotes: number;
  downvotes: number;
  replies: number;
  createdAt: string;
  pinned?: boolean;
  comments?: Comment[];
}

interface Comment {
  id: string;
  author: string;
  body: string;
  upvotes: number;
  createdAt: string;
}

const TYPE_CONFIG: Record<PostType, { label: string; icon: any; color: string }> = {
  discussion:    { label: 'Discussion',   icon: MessageSquare, color: 'text-primary border-primary/30 bg-primary/10' },
  showcase:      { label: 'Showcase',     icon: Trophy,        color: 'text-amber-400 border-amber-500/30 bg-amber-500/10' },
  idea:          { label: 'Idea',         icon: Lightbulb,     color: 'text-neon-cyan border-neon-cyan/30 bg-neon-cyan/10' },
  announcement:  { label: 'Announcement', icon: Flame,         color: 'text-red-400 border-red-500/30 bg-red-500/10' },
};

const DEMO_POSTS: Post[] = [
  {
    id: '1', type: 'announcement', pinned: true,
    title: 'GYDSchain Mainnet Launch — Date Confirmed!',
    body: 'We are excited to announce the GYDSchain mainnet launch is confirmed for Q4 2026. Validators will need to upgrade their nodes to v2.0.0 at least 24 hours before launch. Full migration guide coming soon.',
    author: 'Core Team', upvotes: 342, downvotes: 2, replies: 45,
    createdAt: '2 hours ago',
    comments: [
      { id: 'c1', author: 'validator_99', body: 'Amazing news! When will the node upgrade guide be released?', upvotes: 28, createdAt: '1h ago' },
      { id: 'c2', author: 'defi_whale',   body: 'Will the bridge contracts be audited before mainnet?', upvotes: 19, createdAt: '45m ago' },
    ],
  },
  {
    id: '2', type: 'showcase',
    title: 'I built a GYDS portfolio tracker — open source!',
    body: 'After using ChainCore for 3 months, I built a companion mobile app that tracks your GYDS holdings, validator rewards, and LP positions. Source on GitHub, feel free to contribute!',
    author: 'gyds_dev42', upvotes: 187, downvotes: 5, replies: 23,
    createdAt: '5 hours ago',
  },
  {
    id: '3', type: 'idea',
    title: 'Proposal: Add a Dark PoW mining pool for mobile devices',
    body: 'Mobile mining is growing. What if we optimized the kHeavyHash algorithm for ARM chips? We could have a lite mining mode that works on phones without draining battery in 2 minutes.',
    author: 'mobile_miner', upvotes: 124, downvotes: 18, replies: 31,
    createdAt: '1 day ago',
  },
  {
    id: '4', type: 'discussion',
    title: 'What\'s your GYDS staking strategy?',
    body: 'Been staking for 6 months. Currently using a validator with 5% commission. Thinking of switching to self-delegating once I have enough. What do others do for max rewards?',
    author: 'staking_nerd', upvotes: 89, downvotes: 3, replies: 67,
    createdAt: '2 days ago',
  },
];

const CommunityPage = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [posts, setPosts] = useState<Post[]>(DEMO_POSTS);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | PostType>('all');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newBody, setNewBody] = useState('');
  const [newType, setNewType] = useState<PostType>('discussion');
  const [votes, setVotes] = useState<Record<string, 'up' | 'down'>>({});

  const filtered = posts.filter(p =>
    (filter === 'all' || p.type === filter) &&
    (p.title.toLowerCase().includes(search.toLowerCase()) || p.body.toLowerCase().includes(search.toLowerCase()))
  );

  const handleVote = (id: string, dir: 'up' | 'down') => {
    if (!user) { toast({ title: 'Sign in to vote', variant: 'destructive' }); return; }
    setVotes(v => ({ ...v, [id]: dir }));
    toast({ title: dir === 'up' ? '👍 Upvoted' : '👎 Downvoted' });
  };

  const handlePost = () => {
    if (!user) { toast({ title: 'Sign in to post', variant: 'destructive' }); return; }
    if (!newTitle.trim()) { toast({ title: 'Title required', variant: 'destructive' }); return; }
    const p: Post = {
      id: Date.now().toString(), title: newTitle, body: newBody, type: newType,
      author: user.email?.split('@')[0] ?? 'anon',
      upvotes: 0, downvotes: 0, replies: 0, createdAt: 'Just now',
    };
    setPosts(prev => [p, ...prev]);
    setNewTitle(''); setNewBody('');
    setShowCreate(false);
    toast({ title: 'Post published!' });
  };

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
          <Button onClick={() => setShowCreate(true)} className="gap-2 shrink-0">
            <Plus className="w-4 h-4" /> New Post
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: 'Members', value: '2,847', icon: Users },
            { label: 'Posts', value: posts.length, icon: MessageSquare },
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
            {/* Search + filter */}
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

            {/* Posts */}
            <div className="space-y-3">
              {filtered.map(p => {
                const cfg = TYPE_CONFIG[p.type];
                const TypeIcon = cfg.icon;
                const isExpanded = expanded === p.id;
                return (
                  <GlassCard key={p.id} className={`p-5 ${p.pinned ? 'border-primary/40' : ''}`}>
                    {p.pinned && (
                      <div className="flex items-center gap-1 text-xs text-primary mb-2">
                        <Flame className="w-3 h-3" /> Pinned
                      </div>
                    )}
                    <div className="flex items-start gap-3">
                      {/* Vote column */}
                      <div className="flex flex-col items-center gap-1 shrink-0">
                        <button onClick={() => handleVote(p.id, 'up')} className={`p-1 rounded hover:bg-primary/10 transition-colors ${votes[p.id] === 'up' ? 'text-primary' : 'text-muted-foreground'}`}>
                          <ThumbsUp className="w-4 h-4" />
                        </button>
                        <span className="text-sm font-bold">{p.upvotes - p.downvotes + (votes[p.id] === 'up' ? 1 : votes[p.id] === 'down' ? -1 : 0)}</span>
                        <button onClick={() => handleVote(p.id, 'down')} className={`p-1 rounded hover:bg-red-500/10 transition-colors ${votes[p.id] === 'down' ? 'text-red-400' : 'text-muted-foreground'}`}>
                          <ThumbsDown className="w-4 h-4" />
                        </button>
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <Badge variant="outline" className={`text-xs ${cfg.color}`}>
                            <TypeIcon className="w-3 h-3 mr-1" />{cfg.label}
                          </Badge>
                          <span className="text-xs text-muted-foreground">by {p.author}</span>
                          <span className="text-xs text-muted-foreground flex items-center gap-0.5">
                            <Clock className="w-3 h-3" /> {p.createdAt}
                          </span>
                        </div>
                        <h3 className="font-semibold">{p.title}</h3>
                        <p className={`text-sm text-muted-foreground mt-1 ${isExpanded ? '' : 'line-clamp-2'}`}>{p.body}</p>

                        {/* Comments preview */}
                        {isExpanded && p.comments && (
                          <div className="mt-4 space-y-3 pl-3 border-l border-border/30">
                            {p.comments.map(c => (
                              <div key={c.id} className="space-y-0.5">
                                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                  <span className="font-medium text-foreground">{c.author}</span>
                                  <span>·</span>
                                  <span>{c.createdAt}</span>
                                </div>
                                <p className="text-sm">{c.body}</p>
                                <button className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1">
                                  <ThumbsUp className="w-3 h-3" /> {c.upvotes}
                                </button>
                              </div>
                            ))}
                            <div className="flex gap-2 mt-2">
                              <Input placeholder="Write a reply…" className="text-sm h-8" />
                              <Button size="sm" className="h-8" onClick={() => toast({ title: 'Reply posted!' })}>Reply</Button>
                            </div>
                          </div>
                        )}

                        <div className="flex items-center gap-3 mt-2">
                          <button
                            onClick={() => setExpanded(isExpanded ? null : p.id)}
                            className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1 transition-colors"
                          >
                            <MessageSquare className="w-3 h-3" /> {p.replies} replies
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
          </TabsContent>

          <TabsContent value="referral" className="mt-4">
            <GlassCard className="p-6 space-y-4 max-w-lg">
              <h2 className="font-semibold flex items-center gap-2">
                <Gift className="w-4 h-4 text-primary" /> Referral Program
              </h2>
              {user ? (
                <>
                  <div className="p-4 bg-primary/5 border border-primary/20 rounded-xl text-center">
                    <p className="text-xs text-muted-foreground mb-1">Your referral code</p>
                    <p className="text-2xl font-bold font-mono tracking-wider text-primary">
                      GYDS-{user.id.slice(0, 6).toUpperCase()}
                    </p>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    {[{ label: 'Referrals', value: 0 }, { label: 'Earned', value: '0 GYDS' }, { label: 'Pending', value: '0 GYDS' }].map(s => (
                      <div key={s.label} className="text-center p-3 bg-muted/20 rounded-xl">
                        <p className="text-lg font-bold">{s.value}</p>
                        <p className="text-xs text-muted-foreground">{s.label}</p>
                      </div>
                    ))}
                  </div>
                  <div className="space-y-2 text-sm text-muted-foreground">
                    <p className="font-medium text-foreground">How it works</p>
                    <p>Share your code → when someone signs up and makes their first transaction, you both earn <strong className="text-primary">500 GYDS</strong>.</p>
                    <p>When they stake for the first time, you earn <strong className="text-primary">1% of their first month's rewards</strong>.</p>
                  </div>
                  <Button className="w-full gap-2" onClick={() => { navigator.clipboard.writeText(`Join GYDSchain with my code: GYDS-${user.id.slice(0, 6).toUpperCase()} — https://netlifegy.com`); toast({ title: 'Referral link copied!' }); }}>
                    <Link2 className="w-4 h-4" /> Copy Referral Link
                  </Button>
                </>
              ) : (
                <p className="text-muted-foreground text-sm">Sign in to get your referral code and start earning rewards.</p>
              )}
            </GlassCard>
          </TabsContent>
        </Tabs>

        {/* Create Post Modal */}
        {showCreate && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={() => setShowCreate(false)}
          >
            <GlassCard className="p-6 w-full max-w-lg space-y-4" onClick={e => e.stopPropagation()}>
              <h2 className="font-bold text-lg">Create Post</h2>
              <div className="flex gap-1.5 flex-wrap">
                {(['discussion', 'showcase', 'idea'] as const).map(t => {
                  const cfg = TYPE_CONFIG[t]; const Icon = cfg.icon;
                  return (
                    <button key={t} onClick={() => setNewType(t)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs border transition-all ${newType === t ? cfg.color : 'border-border/40 text-muted-foreground'}`}>
                      <Icon className="w-3.5 h-3.5" /> {cfg.label}
                    </button>
                  );
                })}
              </div>
              <Input value={newTitle} onChange={e => setNewTitle(e.target.value)} placeholder="Post title…" />
              <Textarea value={newBody} onChange={e => setNewBody(e.target.value)} placeholder="What's on your mind?" rows={4} />
              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
                <Button onClick={handlePost}>Publish</Button>
              </div>
            </GlassCard>
          </motion.div>
        )}
      </motion.div>
    </Layout>
  );
};

export default CommunityPage;
