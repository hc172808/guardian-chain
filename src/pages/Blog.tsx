import { useState } from 'react';
import { GlassCard } from '@/components/ui/GlassCard';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Newspaper, Search, Clock, User, Tag, ArrowRight, Rss, Blocks, Zap, Shield, Coins, Globe } from 'lucide-react';
import { Layout } from '@/components/layout/Layout';
import { motion } from 'framer-motion';

const POSTS = [
  {
    id: 1, title: 'GYDSchain Testnet is Live: What You Need to Know',
    excerpt: 'Our testnet is now accepting validators and users. Learn how to connect, get test GYDS from the faucet, and start building your first dApp on GYDSchain.',
    author: 'Netlifegy', date: '2025-06-10', readTime: '5 min',
    category: 'Announcement', tags: ['Testnet', 'Launch'],
    icon: <Blocks className="w-5 h-5 text-primary" />,
    featured: true,
  },
  {
    id: 2, title: 'How GYDSwap AMM Achieves Deep Liquidity Without Impermanent Loss',
    excerpt: 'We dive deep into the math behind GYDSwap\'s concentrated liquidity pools, dynamic fee model, and how our IL calculator helps LPs manage risk before committing capital.',
    author: 'DeFi Lead', date: '2025-06-08', readTime: '8 min',
    category: 'Technical', tags: ['DeFi', 'AMM', 'Liquidity'],
    icon: <Coins className="w-5 h-5 text-amber-400" />,
    featured: false,
  },
  {
    id: 3, title: 'Understanding GYDSchain\'s PoS Consensus Mechanism',
    excerpt: 'A technical walkthrough of our Proof-of-Stake implementation: validator selection, slashing conditions, BFT finality, and how we achieve 99.99% uptime targets.',
    author: 'Core Dev', date: '2025-06-05', readTime: '12 min',
    category: 'Technical', tags: ['Consensus', 'Validators', 'PoS'],
    icon: <Shield className="w-5 h-5 text-emerald-400" />,
    featured: false,
  },
  {
    id: 4, title: 'Bridge Guide: Transferring Assets Across 25+ Networks',
    excerpt: 'Step-by-step guide to using the GYDSchain cross-chain bridge. Covers Ethereum, BSC, Polygon, Avalanche, Arbitrum, and 20 more networks with fee comparisons.',
    author: 'Core Dev', date: '2025-06-02', readTime: '6 min',
    category: 'Guide', tags: ['Bridge', 'Cross-Chain'],
    icon: <Globe className="w-5 h-5 text-blue-400" />,
    featured: false,
  },
  {
    id: 5, title: 'Token Launchpad: Launch Your Token in 3 Minutes',
    excerpt: 'Our token launchpad makes it trivially easy to create a GYDS-native token with configurable supply, liquidity, LP lock, and mint/freeze controls.',
    author: 'Netlifegy', date: '2025-05-28', readTime: '4 min',
    category: 'Guide', tags: ['Tokens', 'Launchpad'],
    icon: <Zap className="w-5 h-5 text-violet-400" />,
    featured: false,
  },
  {
    id: 6, title: 'Running a GYDSchain Validator: Hardware, Setup, Rewards',
    excerpt: 'Everything you need to know about becoming a validator: minimum stake requirements, hardware specs, expected APY, uptime requirements, and slashing risks.',
    author: 'Security', date: '2025-05-22', readTime: '10 min',
    category: 'Guide', tags: ['Validators', 'Nodes', 'Staking'],
    icon: <Shield className="w-5 h-5 text-rose-400" />,
    featured: false,
  },
];

const CATEGORIES = ['All', 'Announcement', 'Technical', 'Guide', 'Community'];

const Blog = () => {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('All');

  const filtered = POSTS.filter(p => {
    const matchCat = category === 'All' || p.category === category;
    const q = search.toLowerCase();
    const matchSearch = !q || p.title.toLowerCase().includes(q) || p.excerpt.toLowerCase().includes(q) || p.tags.some(t => t.toLowerCase().includes(q));
    return matchCat && matchSearch;
  });

  const featured = filtered.find(p => p.featured);
  const rest = filtered.filter(p => !p.featured || category !== 'All' || search);

  const categoryColors: Record<string, string> = {
    Announcement: 'bg-primary/20 text-primary border-primary/30',
    Technical: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    Guide: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
    Community: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  };

  return (
    <Layout>
      <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-primary/20">
              <Newspaper className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-black">Blog &amp; News</h1>
              <p className="text-sm text-muted-foreground">Updates, guides, and technical deep-dives</p>
            </div>
          </div>
          <Button variant="outline" size="sm" className="gap-2">
            <Rss className="w-3.5 h-3.5 text-amber-400" /> Subscribe to RSS
          </Button>
        </div>

        {/* Search + Category Filter */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search posts..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9 bg-secondary/50 border-border/50"
            />
          </div>
          <div className="flex gap-1.5 flex-wrap">
            {CATEGORIES.map(c => (
              <button key={c} onClick={() => setCategory(c)}
                className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${category === c ? 'bg-primary text-primary-foreground' : 'bg-secondary/50 text-muted-foreground hover:text-foreground'}`}>
                {c}
              </button>
            ))}
          </div>
        </div>

        {/* Featured Post */}
        {featured && !search && category === 'All' && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
            <GlassCard className="p-6 border-primary/20 bg-gradient-to-br from-primary/5 to-violet-500/5">
              <div className="flex items-start gap-4">
                <div className="p-3 rounded-xl bg-primary/10 flex-shrink-0">{featured.icon}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-2">
                    <Badge className={`text-xs ${categoryColors[featured.category] || ''}`}>{featured.category}</Badge>
                    <Badge variant="outline" className="text-xs border-primary/30 text-primary">⭐ Featured</Badge>
                    {featured.tags.map(t => (
                      <Badge key={t} variant="secondary" className="text-xs">{t}</Badge>
                    ))}
                  </div>
                  <h2 className="text-xl font-bold mb-2 leading-tight">{featured.title}</h2>
                  <p className="text-muted-foreground text-sm leading-relaxed mb-4">{featured.excerpt}</p>
                  <div className="flex items-center justify-between gap-4 flex-wrap">
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1"><User className="w-3 h-3" />{featured.author}</span>
                      <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{featured.readTime} read</span>
                      <span>{new Date(featured.date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</span>
                    </div>
                    <Button size="sm" className="gap-1 h-8">
                      Read More <ArrowRight className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
              </div>
            </GlassCard>
          </motion.div>
        )}

        {/* Post Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {(search || category !== 'All' ? filtered : rest).map((post, i) => (
            <motion.div key={post.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
              <GlassCard className="p-5 h-full flex flex-col hover:border-primary/30 transition-colors">
                <div className="flex items-start gap-3 mb-3">
                  <div className="p-2 rounded-lg bg-secondary/50 flex-shrink-0">{post.icon}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap mb-1">
                      <Badge className={`text-xs ${categoryColors[post.category] || ''}`}>{post.category}</Badge>
                    </div>
                    <h3 className="font-bold text-sm leading-snug">{post.title}</h3>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed flex-1 mb-4">{post.excerpt}</p>
                <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground pt-3 border-t border-border/30">
                  <div className="flex items-center gap-3">
                    <span className="flex items-center gap-1"><User className="w-3 h-3" />{post.author}</span>
                    <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{post.readTime}</span>
                  </div>
                  <Button variant="ghost" size="sm" className="h-6 text-xs gap-1 text-primary hover:text-primary/80">
                    Read <ArrowRight className="w-3 h-3" />
                  </Button>
                </div>
              </GlassCard>
            </motion.div>
          ))}
        </div>

        {filtered.length === 0 && (
          <div className="text-center py-16 text-muted-foreground">
            <Newspaper className="w-12 h-12 mx-auto mb-3 opacity-40" />
            <p>No posts match your search.</p>
          </div>
        )}

        {/* Newsletter signup */}
        <GlassCard className="p-6 border-primary/20 bg-gradient-to-r from-primary/5 to-transparent">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
            <div className="flex-1">
              <h3 className="font-bold mb-1">Stay Updated</h3>
              <p className="text-sm text-muted-foreground">Get the latest GYDSchain news and technical updates in your inbox.</p>
            </div>
            <div className="flex gap-2 flex-shrink-0 w-full sm:w-auto">
              <Input placeholder="your@email.com" className="bg-background/60 border-border/50 h-9 text-sm w-full sm:w-48" />
              <Button size="sm" className="h-9 px-4">Subscribe</Button>
            </div>
          </div>
        </GlassCard>
      </div>
    </Layout>
  );
};

export default Blog;
