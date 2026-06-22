import { useState, useRef } from 'react';
import { Layout } from '@/components/layout/Layout';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Blocks, Users, Pickaxe, Coins, ArrowRightLeft,
  Wallet, ArrowUpDown, Star, BellRing, Webhook, Network, Terminal,
  Droplets, Vote, Image, TrendingUp, MessageSquare, Trophy,
  ShieldCheck, Fingerprint, Building2, HeartHandshake, ScrollText,
  Code2, FileText, Shield, Download, Settings, BookOpen,
  Smartphone, ExternalLink, RefreshCw, Eye, Search, Filter,
  Globe, Github, Zap, MonitorSmartphone, Laptop, Maximize2,
  ChevronRight, CheckCircle, Clock, AlertCircle, X, Layers
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';

// ── All pages catalog ─────────────────────────────────────────────────────────
const PAGES = [
  // Core / Dashboard
  { route: '/',              label: 'Dashboard',         icon: LayoutDashboard, group: 'core',      desc: 'Main overview — chain stats, portfolio, quick actions, network health',              status: 'done' },
  { route: '/explorer',      label: 'Block Explorer',    icon: Blocks,          group: 'core',      desc: 'Search blocks, transactions, addresses. Real-time chain data.',                    status: 'done' },
  { route: '/validators',    label: 'Validators',        icon: Users,           group: 'core',      desc: 'Validator set, delegation, voting power, PoS rewards.',                            status: 'done' },
  { route: '/mining',        label: 'Mining',            icon: Pickaxe,         group: 'core',      desc: 'Mining dashboard, hashrate, pool stats, miner rewards.',                          status: 'done' },
  { route: '/transactions',  label: 'Transactions',      icon: ArrowUpDown,     group: 'core',      desc: 'All chain transactions with filtering, export, and detail view.',                  status: 'done' },
  { route: '/network',       label: 'Network Config',    icon: Network,         group: 'core',      desc: 'Add GYDS chain to MetaMask / Trust Wallet / Rabby / Coinbase Wallet.',             status: 'done' },
  { route: '/node-terminal', label: 'Node Terminal',     icon: Terminal,        group: 'core',      desc: 'Live in-browser terminal to interact with any running GYDS node.',                 status: 'done' },
  { route: '/faucet',        label: 'Testnet Faucet',    icon: Droplets,        group: 'core',      desc: 'Drip testnet GYDS tokens. Rate-limited per address. Push notification on drip.',  status: 'done' },

  // Wallet & Finance
  { route: '/wallet',        label: 'Wallet',            icon: Wallet,          group: 'finance',   desc: 'Create / import wallets. Send, receive GYDS. AES-256-GCM encrypted seeds.',       status: 'done' },
  { route: '/watchlist',     label: 'Watchlist',         icon: Star,            group: 'finance',   desc: 'Track token prices, set alerts, watch portfolio movements.',                      status: 'done' },
  { route: '/price-alerts',  label: 'Price Alerts',      icon: BellRing,        group: 'finance',   desc: 'Push alerts when GYDS / GYD cross price thresholds.',                             status: 'done' },
  { route: '/webhooks',      label: 'Webhooks',          icon: Webhook,         group: 'finance',   desc: 'Subscribe to on-chain events via webhook — transfers, contract events, blocks.',  status: 'done' },

  // DeFi
  { route: '/defi',          label: 'DeFi Hub',          icon: ArrowRightLeft,  group: 'defi',      desc: '13-tab DeFi platform: Swap, Pools, Stake, Farm, Order Book, Vaults, Bridge, Stablecoin, Perps, Predict, Launchpad, Portfolio, IL Calc.', status: 'done' },
  { route: '/tokens',        label: 'Token Factory',     icon: Coins,           group: 'defi',      desc: 'Deploy ERC-20 tokens on GYDS chain. Launchpad, creator XP leaderboard.',          status: 'done' },

  // Ecosystem
  { route: '/governance',    label: 'Governance',        icon: Vote,            group: 'ecosystem', desc: 'Create proposals, vote, delegate voting power. Push notifications on new proposals.', status: 'done' },
  { route: '/nft',           label: 'NFT Marketplace',   icon: Image,           group: 'ecosystem', desc: 'Browse, list, and buy NFTs on GYDS chain.',                                       status: 'done' },
  { route: '/analytics',     label: 'Analytics',         icon: TrendingUp,      group: 'ecosystem', desc: 'Chain analytics — TPS, volume, active wallets, token charts.',                   status: 'done' },
  { route: '/community',     label: 'Community',         icon: MessageSquare,   group: 'ecosystem', desc: 'Posts, comments, community votes. Social feed for GYDS ecosystem.',               status: 'done' },
  { route: '/leaderboard',   label: 'Leaderboard',       icon: Trophy,          group: 'ecosystem', desc: 'XP leaderboard, achievements, top token creators.',                              status: 'done' },
  { route: '/multisig',      label: 'Multi-Sig',         icon: ShieldCheck,     group: 'ecosystem', desc: 'Create multi-signature wallets. Propose and sign transactions with N-of-M keys.', status: 'done' },
  { route: '/identity',      label: 'Identity (DID)',     icon: Fingerprint,     group: 'ecosystem', desc: 'Decentralised Identity — manage DIDs, verifiable credentials.',                  status: 'done' },
  { route: '/rwa',           label: 'Real-World Assets', icon: Building2,       group: 'ecosystem', desc: 'Tokenised real-world assets — invest, track, and redeem on-chain RWAs.',         status: 'done' },
  { route: '/insurance',     label: 'Insurance',         icon: HeartHandshake,  group: 'ecosystem', desc: 'Parametric insurance policies with oracle-triggered payouts.',                   status: 'done' },
  { route: '/trust',         label: 'Living Trust',      icon: ScrollText,      group: 'ecosystem', desc: '5 trust types, 5-step wizard, beneficiaries, conditions, vault deposit.',        status: 'done' },

  // Resources
  { route: '/developer',     label: 'Developer Portal',  icon: Code2,           group: 'resources', desc: 'API docs, SDK (JS/TS, Python), CLI reference, feature matrix, rate limits.',     status: 'done' },
  { route: '/protocol',      label: 'Protocol Docs',     icon: FileText,        group: 'resources', desc: 'Full protocol documentation — consensus, tokenomics, chain specs.',               status: 'done' },
  { route: '/security',      label: 'Security Audit',    icon: Shield,          group: 'resources', desc: 'Security audit page — CSP, rate limits, firewall, TOTP, active sessions.',       status: 'done' },
  { route: '/download',      label: 'Download',          icon: Download,        group: 'resources', desc: 'Download nodes, wallets, SDKs. Docker, install scripts, binaries.',              status: 'done' },
  { route: '/docs',          label: 'Documentation',     icon: BookOpen,        group: 'resources', desc: 'Full documentation editor — powered by ChainCore CMS.',                         status: 'done' },
  { route: '/cli',           label: 'CLI Reference',     icon: Terminal,        group: 'resources', desc: 'Complete CLI reference with examples for the GYDS node CLI.',                    status: 'done' },

  // Marketing
  { route: '/landing',       label: 'Landing Page',      icon: Globe,           group: 'marketing', desc: 'Public landing page — hero, features, tokenomics, roadmap, CTA.',               status: 'done' },
  { route: '/press-kit',     label: 'Press Kit',         icon: Layers,          group: 'marketing', desc: 'Brand assets, logo downloads, media kit for press coverage.',                    status: 'done' },
  { route: '/blog',          label: 'Blog',              icon: FileText,        group: 'marketing', desc: 'Ecosystem blog — announcements, tutorials, ecosystem updates.',                  status: 'done' },

  // Admin
  { route: '/admin',         label: 'Admin Dashboard',   icon: Settings,        group: 'admin',     desc: 'Full admin panel — users, nodes, cron jobs, payments, monitoring, GitHub sync.', status: 'done' },
  { route: '/profile',       label: 'Profile',           icon: Users,           group: 'admin',     desc: 'User profile — 2FA, biometrics, active sessions, privacy toggle.',              status: 'done' },
  { route: '/mobile',        label: 'Mobile Hub',        icon: Smartphone,      group: 'mobile',    desc: 'Full mobile app experience — balance, quick actions, DeFi, explorer, QR pay.',  status: 'done' },
];

const GROUP_META: Record<string, { label: string; color: string }> = {
  core:      { label: 'Core / Chain',  color: 'text-primary' },
  finance:   { label: 'Wallet & Finance', color: 'text-blue-400' },
  defi:      { label: 'DeFi',          color: 'text-purple-400' },
  ecosystem: { label: 'Ecosystem',     color: 'text-green-400' },
  resources: { label: 'Resources',     color: 'text-amber-400' },
  marketing: { label: 'Marketing',     color: 'text-pink-400' },
  admin:     { label: 'Admin',         color: 'text-orange-400' },
  mobile:    { label: 'Mobile',        color: 'text-cyan-400' },
};

const STATUS_ICON = {
  done:     <CheckCircle className="h-3.5 w-3.5 text-green-400" />,
  progress: <Clock className="h-3.5 w-3.5 text-amber-400" />,
  planned:  <AlertCircle className="h-3.5 w-3.5 text-muted-foreground" />,
};

// ── Phone Frame ───────────────────────────────────────────────────────────────
const PhoneFrame = ({ url, label }: { url: string; label: string }) => {
  const [reload, setReload] = useState(0);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative" style={{ width: 280, height: 580 }}>
        {/* Phone shell */}
        <div className="absolute inset-0 rounded-[44px] border-4 border-border bg-card shadow-2xl z-10 pointer-events-none">
          {/* Notch */}
          <div className="absolute top-3 left-1/2 -translate-x-1/2 w-20 h-6 rounded-full bg-background z-20" />
          {/* Home bar */}
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 w-24 h-1 rounded-full bg-border z-20" />
          {/* Side buttons */}
          <div className="absolute -left-[5px] top-20 w-1.5 h-8 rounded-l-sm bg-border" />
          <div className="absolute -left-[5px] top-32 w-1.5 h-8 rounded-l-sm bg-border" />
          <div className="absolute -right-[5px] top-28 w-1.5 h-12 rounded-r-sm bg-border" />
        </div>
        {/* Iframe content */}
        <div className="absolute inset-[5px] rounded-[40px] overflow-hidden z-0">
          <iframe
            key={reload}
            ref={iframeRef}
            src={url}
            className="w-full h-full border-0"
            title={label}
            style={{ transform: 'scale(1)', transformOrigin: 'top left' }}
          />
        </div>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">{label}</span>
        <button
          onClick={() => setReload(r => r + 1)}
          className="p-1 rounded-md hover:bg-card text-muted-foreground hover:text-foreground transition-colors"
          title="Reload"
        >
          <RefreshCw className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
};

// ── Desktop Frame ─────────────────────────────────────────────────────────────
const DesktopFrame = ({ url, label }: { url: string; label: string }) => {
  const [reload, setReload] = useState(0);
  return (
    <div className="flex flex-col items-center gap-3 w-full max-w-2xl">
      <div className="w-full rounded-2xl border border-border overflow-hidden shadow-2xl bg-card">
        {/* Browser chrome */}
        <div className="flex items-center gap-2 px-4 py-3 bg-card border-b border-border">
          <div className="flex gap-1.5">
            <div className="w-3 h-3 rounded-full bg-red-500/60" />
            <div className="w-3 h-3 rounded-full bg-amber-500/60" />
            <div className="w-3 h-3 rounded-full bg-green-500/60" />
          </div>
          <div className="flex-1 flex items-center gap-2 mx-2 px-3 py-1 rounded-lg bg-background border border-border text-xs text-muted-foreground font-mono">
            <Shield className="h-3 w-3 text-green-400 shrink-0" />
            <span className="truncate">chaincore.netlifegy.com{url}</span>
          </div>
          <button onClick={() => setReload(r => r + 1)} className="p-1 rounded text-muted-foreground hover:text-foreground transition-colors">
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
        </div>
        {/* Page iframe */}
        <div className="relative" style={{ height: 420 }}>
          <iframe
            key={reload}
            src={url}
            className="w-full h-full border-0"
            title={label}
          />
        </div>
      </div>
      <p className="text-sm text-muted-foreground">{label}</p>
    </div>
  );
};

// ── Fullscreen Preview Overlay ────────────────────────────────────────────────
const FullscreenPreview = ({ route, label, onClose }: { route: string; label: string; onClose: () => void }) => (
  <motion.div
    initial={{ opacity: 0 }}
    animate={{ opacity: 1 }}
    exit={{ opacity: 0 }}
    className="fixed inset-0 z-50 bg-black/90 flex flex-col"
  >
    <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-card/80 backdrop-blur">
      <div className="flex items-center gap-3">
        <MonitorSmartphone className="h-5 w-5 text-primary" />
        <div>
          <p className="font-semibold text-sm">{label}</p>
          <p className="text-xs text-muted-foreground font-mono">{route}</p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <a href={route} target="_blank" rel="noreferrer">
          <Button variant="outline" size="sm" className="gap-1.5">
            <ExternalLink className="h-3.5 w-3.5" />
            Open in tab
          </Button>
        </a>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
    <iframe src={route} className="flex-1 border-0" title={label} />
  </motion.div>
);

// ── Page Card ─────────────────────────────────────────────────────────────────
const PageCard = ({
  page,
  onPreview,
}: {
  page: typeof PAGES[0];
  onPreview: (route: string, label: string) => void;
}) => {
  const navigate = useNavigate();
  const Icon = page.icon;
  const group = GROUP_META[page.group];

  return (
    <motion.div
      whileHover={{ y: -2 }}
      className="group relative flex flex-col gap-3 p-4 rounded-2xl bg-card border border-border/60 hover:border-primary/40 transition-all cursor-pointer"
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-primary/10 shrink-0">
            <Icon className="h-4 w-4 text-primary" />
          </div>
          <div>
            <p className="text-sm font-semibold leading-tight">{page.label}</p>
            <p className={cn('text-[10px] font-medium', group?.color)}>{group?.label}</p>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0 mt-0.5">
          {STATUS_ICON[page.status as keyof typeof STATUS_ICON]}
        </div>
      </div>

      {/* Description */}
      <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">{page.desc}</p>

      {/* Route */}
      <code className="text-[10px] text-muted-foreground/70 font-mono bg-background px-2 py-1 rounded-lg border border-border/40">
        {page.route}
      </code>

      {/* Actions */}
      <div className="flex gap-2 pt-1">
        <Button
          size="sm"
          variant="outline"
          className="flex-1 h-7 text-xs gap-1.5"
          onClick={() => onPreview(page.route, page.label)}
        >
          <Eye className="h-3 w-3" />
          Preview
        </Button>
        <Button
          size="sm"
          className="flex-1 h-7 text-xs gap-1.5"
          onClick={() => navigate(page.route)}
        >
          <ChevronRight className="h-3 w-3" />
          Open
        </Button>
      </div>
    </motion.div>
  );
};

// ── Wallet App Card ───────────────────────────────────────────────────────────
const WalletAppSection = () => {
  const features = [
    'Send / Receive GYDS & GYD',
    'Token Swap (DEX)',
    'NFT Gallery',
    'WalletConnect v2',
    'DApp Browser connector',
    'Hardware Wallet (Ledger)',
    'Multi-Account',
    'Price Alerts (background SW)',
    'Earn / Staking',
    'Perpetuals & Prediction',
    'Buy GYDS',
    'QR Scanner',
    'Import / Export wallet',
    'Session lock / PIN',
    'Admin panel',
    'Push Notifications',
    'PWA (installable)',
  ];

  const buildMethods = [
    { method: 'Capacitor + Android Studio', platform: 'Android', type: 'Native APK / AAB', icon: '🤖', recommend: false },
    { method: 'Bubblewrap TWA', platform: 'Android', type: 'Lightest APK', icon: '🤖', recommend: true },
    { method: 'PWABuilder', platform: 'Android + iOS', type: 'No toolchain', icon: '📦', recommend: false },
    { method: 'Capacitor + Xcode', platform: 'iOS', type: 'Native IPA (macOS)', icon: '🍎', recommend: false },
  ];

  return (
    <div className="space-y-6">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-primary/20 via-primary/10 to-card border border-primary/20 p-6">
        <div className="absolute -top-12 -right-12 w-48 h-48 rounded-full bg-primary/10 blur-3xl" />
        <div className="relative">
          <div className="flex items-center gap-4 mb-4">
            <div className="p-3 rounded-2xl bg-primary/20">
              <Smartphone className="h-7 w-7 text-primary" />
            </div>
            <div>
              <h3 className="text-xl font-bold">GYDS Wallet</h3>
              <p className="text-sm text-muted-foreground">Mobile App — Android & iOS</p>
            </div>
            <div className="ml-auto">
              <Badge className="bg-green-500/20 text-green-400 border-green-500/30">
                <CheckCircle className="h-3 w-3 mr-1" />
                GYDS Chain Ready
              </Badge>
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
            {[
              { label: 'Chain ID', value: '13370' },
              { label: 'App ID', value: 'io.netlifegy.gyds' },
              { label: 'RPC', value: 'rpc.netlifegy.com' },
              { label: 'Theme', value: '#0f1318 dark' },
            ].map(item => (
              <div key={item.label} className="px-3 py-2 rounded-xl bg-background/60 border border-border/40">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{item.label}</p>
                <p className="text-xs font-semibold font-mono mt-0.5">{item.value}</p>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <a href="https://github.com/hc172808/your-digital-wallet" target="_blank" rel="noreferrer">
              <Button variant="outline" size="sm" className="gap-2">
                <Github className="h-4 w-4" />
                View Repo
              </Button>
            </a>
            <a href="https://github.com/hc172808/your-digital-wallet/archive/refs/heads/main.zip">
              <Button size="sm" className="gap-2">
                <Download className="h-4 w-4" />
                Download ZIP
              </Button>
            </a>
          </div>
        </div>
      </div>

      {/* Two columns: features + build methods */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* Features */}
        <div className="rounded-2xl bg-card border border-border/60 p-5">
          <div className="flex items-center gap-2 mb-4">
            <Zap className="h-4 w-4 text-primary" />
            <h4 className="font-semibold">Features (all built)</h4>
          </div>
          <div className="grid grid-cols-1 gap-1.5">
            {features.map(f => (
              <div key={f} className="flex items-center gap-2 text-sm">
                <CheckCircle className="h-3.5 w-3.5 text-green-400 shrink-0" />
                <span className="text-muted-foreground">{f}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Build methods */}
        <div className="space-y-4">
          <div className="rounded-2xl bg-card border border-border/60 p-5">
            <div className="flex items-center gap-2 mb-4">
              <MonitorSmartphone className="h-4 w-4 text-primary" />
              <h4 className="font-semibold">Build Methods</h4>
            </div>
            <div className="space-y-2.5">
              {buildMethods.map(m => (
                <div key={m.method} className={cn(
                  'flex items-center gap-3 p-3 rounded-xl border transition-all',
                  m.recommend ? 'border-primary/40 bg-primary/5' : 'border-border/60 bg-background/40'
                )}>
                  <span className="text-xl">{m.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium">{m.method}</p>
                      {m.recommend && <Badge className="text-[9px] px-1.5 py-0 bg-primary/20 text-primary border-primary/30">Recommended</Badge>}
                    </div>
                    <p className="text-[11px] text-muted-foreground">{m.platform} · {m.type}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Setup commands */}
          <div className="rounded-2xl bg-card border border-border/60 p-5">
            <div className="flex items-center gap-2 mb-3">
              <Terminal className="h-4 w-4 text-primary" />
              <h4 className="font-semibold text-sm">Quick Setup</h4>
            </div>
            <div className="space-y-2 font-mono text-xs">
              {[
                '# Clone & configure',
                'bash mobile-wallet/configure.sh',
                '',
                '# Android build',
                'bash mobile-wallet/android-build.sh',
                '',
                '# iOS build (macOS)',
                'bash mobile-wallet/ios-build.sh',
              ].map((line, i) => (
                <div key={i} className={cn(
                  'px-3 py-0.5 rounded',
                  line.startsWith('#') ? 'text-muted-foreground/60' : line === '' ? '' : 'text-green-400 bg-green-400/5'
                )}>
                  {line || '\u00A0'}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// ── Main Preview Page ─────────────────────────────────────────────────────────
export default function Preview() {
  const [search, setSearch] = useState('');
  const [filterGroup, setFilterGroup] = useState<string>('all');
  const [fullscreen, setFullscreen] = useState<{ route: string; label: string } | null>(null);
  const navigate = useNavigate();

  const filtered = PAGES.filter(p => {
    const matchSearch = !search || p.label.toLowerCase().includes(search.toLowerCase()) || p.desc.toLowerCase().includes(search.toLowerCase());
    const matchGroup = filterGroup === 'all' || p.group === filterGroup;
    return matchSearch && matchGroup;
  });

  const groupedFiltered = Object.keys(GROUP_META).filter(g =>
    (filterGroup === 'all' || filterGroup === g) && filtered.some(p => p.group === g)
  );

  return (
    <Layout>
      <AnimatePresence>
        {fullscreen && (
          <FullscreenPreview
            route={fullscreen.route}
            label={fullscreen.label}
            onClose={() => setFullscreen(null)}
          />
        )}
      </AnimatePresence>

      <div className="max-w-7xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Eye className="h-6 w-6 text-primary" />
              App Preview
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              Preview all {PAGES.length} pages live before pushing — click any card to open or preview.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Badge variant="outline" className="gap-1.5 text-green-400 border-green-500/30 bg-green-500/10">
              <CheckCircle className="h-3 w-3" />
              {PAGES.filter(p => p.status === 'done').length} pages live
            </Badge>
            <Button variant="outline" size="sm" onClick={() => navigate('/mobile')} className="gap-1.5">
              <Smartphone className="h-4 w-4" />
              Mobile Hub
            </Button>
          </div>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="pages">
          <TabsList className="w-full sm:w-auto flex-wrap h-auto gap-1 p-1">
            <TabsTrigger value="pages" className="gap-1.5 text-xs">
              <Laptop className="h-3.5 w-3.5" />
              All Pages ({PAGES.length})
            </TabsTrigger>
            <TabsTrigger value="mobile" className="gap-1.5 text-xs">
              <Smartphone className="h-3.5 w-3.5" />
              Mobile App Preview
            </TabsTrigger>
            <TabsTrigger value="landing" className="gap-1.5 text-xs">
              <Globe className="h-3.5 w-3.5" />
              Landing Page
            </TabsTrigger>
            <TabsTrigger value="wallet-app" className="gap-1.5 text-xs">
              <MonitorSmartphone className="h-3.5 w-3.5" />
              Wallet App (Android/iOS)
            </TabsTrigger>
          </TabsList>

          {/* ── Tab: All Pages ──────────────────────────────────────────────── */}
          <TabsContent value="pages" className="mt-6 space-y-6">
            {/* Filters */}
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search pages…"
                  className="pl-10"
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => setFilterGroup('all')}
                  className={cn(
                    'px-3 py-1.5 rounded-lg text-xs font-medium transition-all border',
                    filterGroup === 'all' ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:border-primary/40'
                  )}
                >
                  All
                </button>
                {Object.entries(GROUP_META).map(([key, meta]) => (
                  <button
                    key={key}
                    onClick={() => setFilterGroup(key)}
                    className={cn(
                      'px-3 py-1.5 rounded-lg text-xs font-medium transition-all border',
                      filterGroup === key ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:border-primary/40'
                    )}
                  >
                    {meta.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Stats row */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {Object.entries(GROUP_META).slice(0, 4).map(([key, meta]) => {
                const count = PAGES.filter(p => p.group === key).length;
                return (
                  <button
                    key={key}
                    onClick={() => setFilterGroup(key === filterGroup ? 'all' : key)}
                    className="p-3 rounded-2xl bg-card border border-border/60 hover:border-primary/40 transition-all text-left"
                  >
                    <p className={cn('text-lg font-bold', meta.color)}>{count}</p>
                    <p className="text-xs text-muted-foreground">{meta.label}</p>
                  </button>
                );
              })}
            </div>

            {/* Page grid grouped */}
            {groupedFiltered.length === 0 ? (
              <div className="text-center py-16 text-muted-foreground">
                <Search className="h-8 w-8 mx-auto mb-3 opacity-30" />
                <p>No pages match your search.</p>
              </div>
            ) : (
              <div className="space-y-8">
                {groupedFiltered.map(group => {
                  const pages = filtered.filter(p => p.group === group);
                  const meta = GROUP_META[group];
                  return (
                    <div key={group}>
                      <div className="flex items-center gap-3 mb-4">
                        <h3 className={cn('text-sm font-semibold uppercase tracking-wider', meta.color)}>{meta.label}</h3>
                        <div className="flex-1 h-px bg-border/40" />
                        <span className="text-xs text-muted-foreground">{pages.length} pages</span>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                        {pages.map(page => (
                          <PageCard
                            key={page.route}
                            page={page}
                            onPreview={(route, label) => setFullscreen({ route, label })}
                          />
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </TabsContent>

          {/* ── Tab: Mobile App Preview ─────────────────────────────────────── */}
          <TabsContent value="mobile" className="mt-6">
            <div className="flex flex-col items-center gap-8">
              <div className="text-center max-w-lg">
                <h3 className="text-lg font-bold mb-2">Mobile Hub — Live Preview</h3>
                <p className="text-sm text-muted-foreground">
                  This is the full GYDS mobile app experience — exactly what users see on Android/iPhone.
                  Interact with it directly: tap, scroll, try all 5 tabs.
                </p>
              </div>

              <div className="flex flex-col sm:flex-row gap-10 items-start justify-center">
                <PhoneFrame url="/mobile" label="GYDS Mobile App (/mobile)" />

                {/* Feature callouts */}
                <div className="max-w-xs space-y-3 pt-4">
                  <h4 className="font-semibold text-sm">5 Tabs in the app:</h4>
                  {[
                    { tab: 'Home',     desc: 'Balance card, quick actions (Send/Receive/Swap/Bridge/Stake/Faucet/Mine/QR Pay), live network stats, recent transactions' },
                    { tab: 'Explorer', desc: 'Block search, latest blocks, browse all chain sections' },
                    { tab: 'DeFi',     desc: 'Swap, Pools, Staking, Order Book, Vaults, Bridge, Launchpad — all 8 DeFi actions' },
                    { tab: 'Wallet',   desc: 'Portfolio chart, full asset list, send/receive, staking, governance, community' },
                    { tab: 'More',     desc: 'Settings, DeFi deep links, analytics, profile, admin, biometric, QR connect' },
                  ].map(item => (
                    <div key={item.tab} className="p-3 rounded-xl bg-card border border-border/60">
                      <p className="text-sm font-semibold text-primary mb-1">{item.tab}</p>
                      <p className="text-xs text-muted-foreground leading-relaxed">{item.desc}</p>
                    </div>
                  ))}

                  <Button
                    className="w-full gap-2 mt-2"
                    onClick={() => navigate('/mobile')}
                  >
                    <Maximize2 className="h-4 w-4" />
                    Open Full Screen
                  </Button>
                </div>
              </div>
            </div>
          </TabsContent>

          {/* ── Tab: Landing Page ───────────────────────────────────────────── */}
          <TabsContent value="landing" className="mt-6">
            <div className="flex flex-col items-center gap-6">
              <div className="text-center max-w-lg">
                <h3 className="text-lg font-bold mb-2">Public Landing Page</h3>
                <p className="text-sm text-muted-foreground">
                  The public-facing homepage at /landing — hero section, features, tokenomics, roadmap, CTAs. No login required.
                </p>
              </div>
              <DesktopFrame url="/landing" label="GYDS Landing Page (/landing)" />
              <div className="flex gap-3">
                <Button variant="outline" onClick={() => setFullscreen({ route: '/landing', label: 'Landing Page' })} className="gap-2">
                  <Maximize2 className="h-4 w-4" />
                  Fullscreen
                </Button>
                <Button onClick={() => navigate('/landing')} className="gap-2">
                  <ExternalLink className="h-4 w-4" />
                  Open Page
                </Button>
              </div>
            </div>
          </TabsContent>

          {/* ── Tab: Wallet App ─────────────────────────────────────────────── */}
          <TabsContent value="wallet-app" className="mt-6">
            <WalletAppSection />
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}
