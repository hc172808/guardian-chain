import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { GlassCard } from '@/components/ui/GlassCard';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Blocks, Zap, Shield, Globe, TrendingUp, Users, Coins, Lock, ChevronRight, ExternalLink, Github, Twitter, Send, CheckCircle, ArrowRight, Cpu, Network } from 'lucide-react';

const STATS = [
  { label: 'Chain ID', value: '13370', icon: <Network className="w-5 h-5" /> },
  { label: 'Block Time', value: '~4s', icon: <Zap className="w-5 h-5" /> },
  { label: 'Consensus', value: 'PoS', icon: <Shield className="w-5 h-5" /> },
  { label: 'TPS', value: '3,000+', icon: <TrendingUp className="w-5 h-5" /> },
];

const TOKENOMICS = [
  { label: 'Total Supply', value: '1,000,000,000', unit: 'GYDS', color: 'text-primary' },
  { label: 'Validator Rewards', value: '30%', unit: '300M GYDS', color: 'text-violet-400' },
  { label: 'Ecosystem & DeFi', value: '25%', unit: '250M GYDS', color: 'text-blue-400' },
  { label: 'Team & Advisors', value: '15%', unit: '150M GYDS', color: 'text-amber-400' },
  { label: 'Public Sale', value: '20%', unit: '200M GYDS', color: 'text-emerald-400' },
  { label: 'Reserve', value: '10%', unit: '100M GYDS', color: 'text-rose-400' },
];

const ROADMAP = [
  {
    phase: 'Phase 1', title: 'Foundation', status: 'done', date: 'Q1 2025',
    items: ['Core blockchain (PoS)', 'Wallet & Explorer', 'Node installation system', 'Token launchpad'],
  },
  {
    phase: 'Phase 2', title: 'DeFi Ecosystem', status: 'done', date: 'Q2 2025',
    items: ['GYDSwap AMM DEX', 'LP farming & vaults', 'Cross-chain bridge (25 networks)', 'Insurance & prediction markets'],
  },
  {
    phase: 'Phase 3', title: 'Advanced Features', status: 'active', date: 'Q3 2025',
    items: ['NFT marketplace', 'Governance DAO', 'Identity & soulbound tokens', 'Real World Assets (RWA)'],
  },
  {
    phase: 'Phase 4', title: 'Mainnet & Growth', status: 'upcoming', date: 'Q4 2025',
    items: ['Mainnet genesis', 'Exchange listings', 'Mobile app', 'Enterprise SDK'],
  },
  {
    phase: 'Phase 5', title: 'Scaling', status: 'upcoming', date: '2026',
    items: ['Layer-2 ZK-rollup', 'Privacy transactions', 'Decentralized DNS (.gyds)', 'AI trading agents'],
  },
];

const TEAM = [
  { name: 'Netlifegy', role: 'Founder & CEO', bio: 'Blockchain architect with deep expertise in PoS consensus and DeFi protocol design.', avatar: 'N' },
  { name: 'Core Dev', role: 'Lead Engineer', bio: 'Full-stack blockchain developer specializing in smart contract security and EVM tooling.', avatar: 'D' },
  { name: 'DeFi Lead', role: 'Protocol Lead', bio: 'Former DEX liquidity strategist. Designed GYDSwap AMM and the LP farming architecture.', avatar: 'F' },
  { name: 'Security', role: 'Security Auditor', bio: 'Certified blockchain security expert. Led audits on 15+ DeFi protocols.', avatar: 'S' },
];

const FEATURES = [
  { icon: <Zap className="w-6 h-6 text-primary" />, title: 'Lightning Fast', desc: '~4 second block finality with PoS consensus. 3,000+ TPS at mainnet capacity.' },
  { icon: <Shield className="w-6 h-6 text-violet-400" />, title: 'Secure by Design', desc: 'BFT-tolerant PoS with slashing conditions, multi-sig governance, and on-chain insurance.' },
  { icon: <Globe className="w-6 h-6 text-blue-400" />, title: 'Cross-Chain', desc: 'Native bridge to 25+ networks including Ethereum, BSC, Polygon, Avalanche, and more.' },
  { icon: <Coins className="w-6 h-6 text-amber-400" />, title: 'Full DeFi Suite', desc: 'AMM DEX, LP farming, vaults, perpetuals, prediction markets, and token launchpad.' },
  { icon: <Lock className="w-6 h-6 text-emerald-400" />, title: 'Token Launchpad', desc: 'Launch your own token with configurable supply, liquidity, and LP lock in minutes.' },
  { icon: <Cpu className="w-6 h-6 text-rose-400" />, title: 'Node Network', desc: 'Run a full node, validator, or RPC node. One-click install with Docker or bare metal.' },
];

const Landing = () => {
  const [liveBlock, setLiveBlock] = useState<number | null>(null);
  const [liveNodes, setLiveNodes] = useState<number | null>(null);

  useEffect(() => {
    fetch('/api/network-stats')
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d?.stats) {
          setLiveNodes(d.stats.liveNodes ?? null);
        }
      })
      .catch(() => {});
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground overflow-x-hidden">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 border-b border-border/40 bg-background/80 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-primary/20">
              <Blocks className="h-5 w-5 text-primary" />
            </div>
            <span className="font-bold text-lg tracking-tight">GYDSchain</span>
          </div>
          <nav className="hidden md:flex items-center gap-6 text-sm text-muted-foreground">
            <a href="#features" className="hover:text-foreground transition-colors">Features</a>
            <a href="#tokenomics" className="hover:text-foreground transition-colors">Tokenomics</a>
            <a href="#roadmap" className="hover:text-foreground transition-colors">Roadmap</a>
            <a href="#team" className="hover:text-foreground transition-colors">Team</a>
            <a href="https://netlifegy.com" className="hover:text-foreground transition-colors flex items-center gap-1">
              Docs <ExternalLink className="w-3 h-3" />
            </a>
          </nav>
          <div className="flex items-center gap-2">
            <Link to="/auth">
              <Button variant="outline" size="sm">Sign In</Button>
            </Link>
            <Link to="/auth">
              <Button size="sm" className="gap-1">Launch App <ArrowRight className="w-3 h-3" /></Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="pt-32 pb-24 px-4 text-center relative overflow-hidden">
        {/* Background glow */}
        <div className="absolute inset-0 bg-gradient-to-b from-primary/5 via-transparent to-transparent pointer-events-none" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-primary/5 rounded-full blur-3xl pointer-events-none" />

        <div className="max-w-4xl mx-auto relative">
          <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
            <Badge variant="outline" className="mb-6 border-primary/30 text-primary bg-primary/10 px-4 py-1.5 text-sm gap-2">
              <span className="w-2 h-2 rounded-full bg-primary animate-pulse inline-block" />
              Testnet Live — Chain ID 13370
            </Badge>
            <h1 className="text-5xl md:text-7xl font-black tracking-tight mb-6 leading-none">
              The Future of
              <span className="block text-transparent bg-clip-text bg-gradient-to-r from-primary via-violet-400 to-blue-400">
                Decentralized Finance
              </span>
            </h1>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto mb-10 leading-relaxed">
              GYDSchain is a high-performance Layer-1 blockchain built for DeFi. PoS consensus, ~4s finality, 3,000+ TPS, and a full suite of DeFi tools — out of the box.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-4">
              <Link to="/auth">
                <Button size="lg" className="gap-2 text-base px-8">
                  Launch Dashboard <ArrowRight className="w-4 h-4" />
                </Button>
              </Link>
              <Link to="/explorer">
                <Button size="lg" variant="outline" className="gap-2 text-base px-8">
                  <Blocks className="w-4 h-4" /> Explorer
                </Button>
              </Link>
              <a href="/download">
                <Button size="lg" variant="ghost" className="gap-2 text-base px-8 text-muted-foreground">
                  Run a Node
                </Button>
              </a>
            </div>
          </motion.div>

          {/* Live stats ticker */}
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }}
            className="mt-16 grid grid-cols-2 md:grid-cols-4 gap-4">
            {STATS.map((s, i) => (
              <GlassCard key={i} className="p-4 text-center">
                <div className="flex justify-center mb-2 text-primary">{s.icon}</div>
                <p className="text-2xl font-bold font-mono">{s.value}</p>
                <p className="text-xs text-muted-foreground mt-1">{s.label}</p>
              </GlassCard>
            ))}
          </motion.div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-24 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-black mb-4">Built for the Next Generation of DeFi</h2>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto">Everything you need to build, trade, and earn — on one high-performance chain.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {FEATURES.map((f, i) => (
              <motion.div key={i} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.08 }}>
                <GlassCard className="p-6 h-full hover:border-primary/30 transition-colors">
                  <div className="p-3 rounded-xl bg-secondary/50 w-fit mb-4">{f.icon}</div>
                  <h3 className="font-bold text-lg mb-2">{f.title}</h3>
                  <p className="text-muted-foreground text-sm leading-relaxed">{f.desc}</p>
                </GlassCard>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Tokenomics */}
      <section id="tokenomics" className="py-24 px-4 bg-secondary/10">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-black mb-4">GYDS Tokenomics</h2>
            <p className="text-muted-foreground text-lg">A balanced supply designed for long-term network sustainability.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
            {/* Donut chart placeholder */}
            <GlassCard className="p-8 flex items-center justify-center">
              <div className="relative w-56 h-56">
                <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
                  {[
                    { pct: 30, color: '#8b5cf6', offset: 0 },
                    { pct: 25, color: '#3b82f6', offset: 30 },
                    { pct: 15, color: '#f59e0b', offset: 55 },
                    { pct: 20, color: '#10b981', offset: 70 },
                    { pct: 10, color: '#f43f5e', offset: 90 },
                  ].map((seg, i) => {
                    const r = 35;
                    const circ = 2 * Math.PI * r;
                    return (
                      <circle key={i} cx="50" cy="50" r={r}
                        fill="none" stroke={seg.color} strokeWidth="22"
                        strokeDasharray={`${seg.pct / 100 * circ} ${circ}`}
                        strokeDashoffset={-seg.offset / 100 * circ}
                      />
                    );
                  })}
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <p className="text-2xl font-black">1B</p>
                  <p className="text-xs text-muted-foreground">GYDS</p>
                </div>
              </div>
            </GlassCard>
            <div className="space-y-3">
              {TOKENOMICS.map((t, i) => (
                <div key={i} className="flex items-center justify-between p-3 rounded-xl bg-secondary/20 border border-border/30">
                  <div>
                    <p className="font-medium text-sm">{t.label}</p>
                    <p className="text-xs text-muted-foreground">{t.unit}</p>
                  </div>
                  <span className={`font-bold text-lg ${t.color}`}>{t.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Roadmap */}
      <section id="roadmap" className="py-24 px-4">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-black mb-4">Roadmap</h2>
            <p className="text-muted-foreground text-lg">From testnet to a full-featured L1 ecosystem.</p>
          </div>
          <div className="space-y-4">
            {ROADMAP.map((phase, i) => (
              <motion.div key={i} initial={{ opacity: 0, x: -20 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.1 }}>
                <GlassCard className={`p-6 ${phase.status === 'active' ? 'border-primary/50 bg-primary/5' : ''}`}>
                  <div className="flex items-start gap-4">
                    <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                      phase.status === 'done' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' :
                      phase.status === 'active' ? 'bg-primary/20 text-primary border border-primary/30 animate-pulse' :
                      'bg-secondary text-muted-foreground border border-border/50'
                    }`}>
                      {phase.status === 'done' ? <CheckCircle className="w-4 h-4" /> : i + 1}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2 flex-wrap">
                        <span className="text-xs text-muted-foreground">{phase.phase}</span>
                        <h3 className="font-bold">{phase.title}</h3>
                        <Badge variant="outline" className={`text-xs ${
                          phase.status === 'done' ? 'border-emerald-500/30 text-emerald-400' :
                          phase.status === 'active' ? 'border-primary/30 text-primary' :
                          'border-border/50 text-muted-foreground'
                        }`}>
                          {phase.status === 'done' ? '✓ Complete' : phase.status === 'active' ? '⚡ In Progress' : '⏳ Upcoming'}
                        </Badge>
                        <span className="text-xs text-muted-foreground ml-auto">{phase.date}</span>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {phase.items.map((item, j) => (
                          <span key={j} className="text-xs px-2 py-1 rounded-md bg-secondary/50 text-muted-foreground">{item}</span>
                        ))}
                      </div>
                    </div>
                  </div>
                </GlassCard>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Team */}
      <section id="team" className="py-24 px-4 bg-secondary/10">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-black mb-4">The Team</h2>
            <p className="text-muted-foreground text-lg">Blockchain builders with a passion for decentralization.</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {TEAM.map((member, i) => (
              <motion.div key={i} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.1 }}>
                <GlassCard className="p-6 text-center hover:border-primary/30 transition-colors">
                  <div className="w-16 h-16 rounded-full bg-gradient-to-br from-primary/30 to-violet-500/30 border border-primary/30 flex items-center justify-center text-2xl font-black mx-auto mb-4">
                    {member.avatar}
                  </div>
                  <h3 className="font-bold mb-1">{member.name}</h3>
                  <p className="text-xs text-primary mb-3">{member.role}</p>
                  <p className="text-xs text-muted-foreground leading-relaxed">{member.bio}</p>
                </GlassCard>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-24 px-4">
        <div className="max-w-3xl mx-auto text-center">
          <GlassCard className="p-12 border-primary/20 bg-gradient-to-br from-primary/5 to-violet-500/5">
            <h2 className="text-4xl font-black mb-4">Ready to Build on GYDSchain?</h2>
            <p className="text-muted-foreground text-lg mb-8">Join the testnet, launch your token, or run a validator node today.</p>
            <div className="flex flex-wrap items-center justify-center gap-4">
              <Link to="/auth">
                <Button size="lg" className="gap-2 px-8">
                  Get Started <ArrowRight className="w-4 h-4" />
                </Button>
              </Link>
              <Link to="/docs">
                <Button size="lg" variant="outline" className="gap-2 px-8">
                  Read the Docs
                </Button>
              </Link>
            </div>
            <div className="flex items-center justify-center gap-6 mt-8 text-muted-foreground">
              <a href="https://github.com" className="hover:text-foreground transition-colors flex items-center gap-1 text-sm">
                <Github className="w-4 h-4" /> GitHub
              </a>
              <a href="https://twitter.com" className="hover:text-foreground transition-colors flex items-center gap-1 text-sm">
                <Twitter className="w-4 h-4" /> Twitter
              </a>
              <a href="https://t.me" className="hover:text-foreground transition-colors flex items-center gap-1 text-sm">
                <Send className="w-4 h-4" /> Telegram
              </a>
            </div>
          </GlassCard>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/40 py-8 px-4">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <Blocks className="h-4 w-4 text-primary" />
            <span>GYDSchain © 2025 • Chain ID 13370</span>
          </div>
          <div className="flex items-center gap-6">
            <Link to="/explorer" className="hover:text-foreground transition-colors">Explorer</Link>
            <Link to="/docs" className="hover:text-foreground transition-colors">Docs</Link>
            <Link to="/press-kit" className="hover:text-foreground transition-colors">Press Kit</Link>
            <Link to="/blog" className="hover:text-foreground transition-colors">Blog</Link>
            <a href="https://netlifegy.com" className="hover:text-foreground transition-colors flex items-center gap-1">
              netlifegy.com <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Landing;
