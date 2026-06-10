import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { 
  LayoutDashboard, Search, ArrowLeftRight, Wallet, MoreHorizontal,
  Send, Download, RefreshCw, TrendingUp, Zap, Shield,
  Blocks, Pickaxe, Coins, Vote, Trophy, Droplets,
  Bell, Settings, LogIn, ChevronRight, Activity,
  ArrowUp, ArrowDown, MonitorSmartphone, Globe, ArrowLeft
} from 'lucide-react';
import { cn } from '@/lib/utils';

type Tab = 'home' | 'explorer' | 'defi' | 'wallet' | 'more';

/** Set the flag so MobileRedirect allows the navigation, then navigate */
function useMobileNavigate() {
  const navigate = useNavigate();
  return (path: string, options?: Parameters<typeof navigate>[1]) => {
    sessionStorage.setItem('fromMobileHub', 'true');
    navigate(path, options as any);
  };
}

// ── Back button shown on pages reached from mobile hub ──────────────────────
export const MobileBackButton = () => {
  const navigate = useNavigate();
  const fromMobile = sessionStorage.getItem('fromMobileHub') === 'true';
  if (!fromMobile) return null;
  return (
    <button
      onClick={() => { sessionStorage.removeItem('fromMobileHub'); navigate('/mobile'); }}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-card border border-border text-sm font-medium hover:border-primary/40 transition-all mb-4"
    >
      <ArrowLeft className="h-4 w-4" />
      Back to Mobile
    </button>
  );
};

const MobileHome = () => {
  const { user } = useAuth();
  const go = useMobileNavigate();

  const quickActions = [
    { icon: Send,          label: 'Send',    color: 'text-blue-400',   bg: 'bg-blue-400/10',   path: '/wallet',  state: undefined },
    { icon: Download,      label: 'Receive', color: 'text-green-400',  bg: 'bg-green-400/10',  path: '/wallet',  state: undefined },
    { icon: ArrowLeftRight,label: 'Swap',    color: 'text-purple-400', bg: 'bg-purple-400/10', path: '/defi',    state: { tab: 'swap' } },
    { icon: Globe,         label: 'Bridge',  color: 'text-amber-400',  bg: 'bg-amber-400/10',  path: '/defi',    state: { tab: 'bridge' } },
    { icon: TrendingUp,    label: 'Stake',   color: 'text-cyan-400',   bg: 'bg-cyan-400/10',   path: '/defi',    state: { tab: 'stake' } },
    { icon: Droplets,      label: 'Faucet',  color: 'text-pink-400',   bg: 'bg-pink-400/10',   path: '/faucet',  state: undefined },
  ];

  const networkStats = [
    { label: 'Block Height', value: '1,234,567', sub: '+12 last min', icon: Blocks,      up: true },
    { label: 'GYDS Price',   value: '$0.0847',   sub: '+4.2%',        icon: TrendingUp,  up: true },
    { label: 'TPS',          value: '1,250',     sub: 'avg/min',      icon: Zap,         up: true },
    { label: 'Validators',   value: '42',        sub: 'active',       icon: Shield,      up: null },
  ];

  const recentTx = [
    { type: 'send',    label: 'Sent GYDS',       amount: '-250 GYDS',    usd: '-$21.18',  time: '2m ago' },
    { type: 'receive', label: 'Received GYDS',   amount: '+1,000 GYDS',  usd: '+$84.70',  time: '1h ago' },
    { type: 'swap',    label: 'Swapped to GYD',  amount: '500 GYDS',     usd: '$42.35',   time: '3h ago' },
    { type: 'stake',   label: 'Staked GYDS',     amount: '5,000 GYDS',   usd: '$423.50',  time: '1d ago' },
  ];

  return (
    <div className="space-y-5 pb-2">
      {/* Wallet balance card */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary/80 via-primary/60 to-primary/40 p-5">
        <div className="absolute inset-0 opacity-20" style={{
          backgroundImage: 'radial-gradient(circle at 80% 20%, rgba(255,255,255,0.3) 0%, transparent 60%)'
        }} />
        <p className="text-xs text-white/70 mb-1">Total Portfolio Value</p>
        <p className="text-3xl font-bold text-white mb-1">$0.00</p>
        <p className="text-xs text-white/60">{user ? user.email : 'Sign in to view your balance'}</p>
        <div className="flex gap-3 mt-4">
          {['GYDS', 'GYD', 'Staked'].map(label => (
            <div key={label} className="flex-1 bg-white/10 rounded-lg p-2 text-center">
              <p className="text-xs text-white/60">{label}</p>
              <p className="font-bold text-white text-sm">0.00</p>
            </div>
          ))}
        </div>
      </div>

      {/* Quick actions */}
      <div>
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Quick Actions</h3>
        <div className="grid grid-cols-3 gap-3">
          {quickActions.map(action => (
            <button
              key={action.label}
              onClick={() => go(action.path, action.state ? { state: action.state } : undefined)}
              className="flex flex-col items-center gap-2 p-3 rounded-xl bg-card border border-border hover:border-primary/40 transition-all active:scale-95"
            >
              <div className={cn('p-2.5 rounded-xl', action.bg)}>
                <action.icon className={cn('h-5 w-5', action.color)} />
              </div>
              <span className="text-xs font-medium">{action.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Network stats */}
      <div>
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Network Status</h3>
        <div className="grid grid-cols-2 gap-3">
          {networkStats.map(stat => (
            <div key={stat.label} className="p-3 rounded-xl bg-card border border-border">
              <div className="flex items-center justify-between mb-1">
                <stat.icon className="h-4 w-4 text-muted-foreground" />
                {stat.up !== null && (
                  stat.up
                    ? <ArrowUp className="h-3 w-3 text-green-400" />
                    : <ArrowDown className="h-3 w-3 text-red-400" />
                )}
              </div>
              <p className="font-bold text-sm">{stat.value}</p>
              <p className="text-xs text-muted-foreground">{stat.label}</p>
              <p className="text-xs text-green-400 mt-0.5">{stat.sub}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Recent activity */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Recent Activity</h3>
          <button
            onClick={() => go('/transactions')}
            className="text-xs text-primary font-medium"
          >
            See all
          </button>
        </div>
        <div className="space-y-2">
          {recentTx.map((tx, i) => (
            <div key={i} className="flex items-center gap-3 p-3 rounded-xl bg-card border border-border">
              <div className={cn(
                'p-2 rounded-lg',
                tx.type === 'send'    ? 'bg-red-400/10'    :
                tx.type === 'receive' ? 'bg-green-400/10'  :
                tx.type === 'swap'    ? 'bg-purple-400/10' : 'bg-cyan-400/10'
              )}>
                {tx.type === 'send'    && <ArrowUp        className="h-4 w-4 text-red-400" />}
                {tx.type === 'receive' && <ArrowDown       className="h-4 w-4 text-green-400" />}
                {tx.type === 'swap'    && <ArrowLeftRight  className="h-4 w-4 text-purple-400" />}
                {tx.type === 'stake'   && <TrendingUp      className="h-4 w-4 text-cyan-400" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{tx.label}</p>
                <p className="text-xs text-muted-foreground">{tx.time}</p>
              </div>
              <div className="text-right">
                <p className="text-sm font-medium">{tx.amount}</p>
                <p className="text-xs text-muted-foreground">{tx.usd}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

const MobileExplorer = () => {
  const go = useMobileNavigate();
  const [query, setQuery] = useState('');

  const handleSearch = () => {
    const q = query.trim();
    if (!q) return;
    go(`/explorer?q=${encodeURIComponent(q)}`);
  };

  return (
    <div className="space-y-4">
      <div className="relative flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSearch()}
            placeholder="Search block, tx, address…"
            className="w-full pl-10 pr-4 py-3 rounded-xl bg-card border border-border text-sm focus:outline-none focus:border-primary"
          />
        </div>
        <button
          onClick={handleSearch}
          className="px-4 rounded-xl bg-primary text-primary-foreground text-sm font-semibold shrink-0"
        >
          Go
        </button>
      </div>
      {[
        { label: 'Latest Blocks',  icon: Blocks,    path: '/explorer' },
        { label: 'Transactions',   icon: Activity,  path: '/transactions' },
        { label: 'Validators',     icon: Shield,    path: '/validators' },
        { label: 'Mining',         icon: Pickaxe,   path: '/mining' },
        { label: 'Token Factory',  icon: Coins,     path: '/tokens' },
        { label: 'Analytics',      icon: TrendingUp,path: '/analytics' },
      ].map(item => (
        <button
          key={item.label}
          onClick={() => go(item.path)}
          className="w-full flex items-center gap-4 p-4 rounded-xl bg-card border border-border hover:border-primary/40 transition-all text-left active:scale-[0.98]"
        >
          <div className="p-2.5 rounded-lg bg-primary/10">
            <item.icon className="h-5 w-5 text-primary" />
          </div>
          <span className="flex-1 font-medium">{item.label}</span>
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        </button>
      ))}
    </div>
  );
};

const MobileDefi = () => {
  const go = useMobileNavigate();

  const items = [
    { label: 'Swap Tokens',       icon: ArrowLeftRight, desc: 'Instantly swap between GYDS and GYD',  tab: 'swap',       color: 'text-purple-400', bg: 'bg-purple-400/10' },
    { label: 'Liquidity Pools',   icon: Droplets,       desc: 'Add liquidity and earn trading fees',  tab: 'pools',      color: 'text-blue-400',   bg: 'bg-blue-400/10' },
    { label: 'Stake GYDS',        icon: TrendingUp,     desc: 'Earn rewards by staking your GYDS',    tab: 'stake',      color: 'text-green-400',  bg: 'bg-green-400/10' },
    { label: 'Order Book',        icon: Activity,       desc: 'Limit and market orders',              tab: 'orderbook',  color: 'text-amber-400',  bg: 'bg-amber-400/10' },
    { label: 'Yield Vaults',      icon: Zap,            desc: 'Auto-compound strategies',             tab: 'vaults',     color: 'text-cyan-400',   bg: 'bg-cyan-400/10' },
    { label: 'Cross-Chain Bridge',icon: Globe,          desc: 'Bridge from 25 external chains',       tab: 'bridge',     color: 'text-pink-400',   bg: 'bg-pink-400/10' },
    { label: 'Launchpad',         icon: RefreshCw,      desc: 'Participate in new token launches',    tab: 'launchpad',  color: 'text-orange-400', bg: 'bg-orange-400/10' },
    { label: 'Portfolio',         icon: Wallet,         desc: 'View your DeFi positions and P&L',     tab: 'portfolio',  color: 'text-indigo-400', bg: 'bg-indigo-400/10' },
  ];

  return (
    <div className="space-y-3">
      {items.map(item => (
        <button
          key={item.label}
          onClick={() => go('/defi', { state: { tab: item.tab } })}
          className="w-full flex items-center gap-4 p-4 rounded-xl bg-card border border-border hover:border-primary/40 transition-all text-left active:scale-[0.98]"
        >
          <div className={cn('p-2.5 rounded-lg', item.bg)}>
            <item.icon className={cn('h-5 w-5', item.color)} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-medium text-sm">{item.label}</p>
            <p className="text-xs text-muted-foreground">{item.desc}</p>
          </div>
          <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
        </button>
      ))}
    </div>
  );
};

const MobileWallet = () => {
  const go = useMobileNavigate();
  return (
    <div className="space-y-4">
      <div className="p-5 rounded-2xl bg-gradient-to-br from-card to-secondary border border-border text-center">
        <Wallet className="h-8 w-8 text-primary mx-auto mb-2" />
        <p className="text-sm text-muted-foreground mb-1">Connected Wallet</p>
        <p className="font-mono text-sm">Not connected</p>
      </div>
      <button
        onClick={() => go('/wallet')}
        className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-semibold text-sm"
      >
        Open Full Wallet
      </button>
      {[
        { label: 'Transaction History', icon: Activity,    path: '/transactions' },
        { label: 'Watchlist',           icon: TrendingUp,  path: '/watchlist' },
        { label: 'Testnet Faucet',      icon: Droplets,    path: '/faucet' },
        { label: 'Network Config',      icon: Settings,    path: '/network' },
      ].map(item => (
        <button key={item.label} onClick={() => go(item.path)}
          className="w-full flex items-center gap-4 p-4 rounded-xl bg-card border border-border text-left active:scale-[0.98] hover:border-primary/40 transition-all"
        >
          <div className="p-2.5 rounded-lg bg-primary/10">
            <item.icon className="h-5 w-5 text-primary" />
          </div>
          <span className="flex-1 font-medium text-sm">{item.label}</span>
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        </button>
      ))}
    </div>
  );
};

const MobileMore = () => {
  const go = useMobileNavigate();
  const navigate = useNavigate();
  const { user, signOut } = useAuth();

  const handleSwitchToDesktop = () => {
    sessionStorage.setItem('preferDesktop', 'true');
    sessionStorage.removeItem('fromMobileHub');
    navigate('/', { replace: true });
  };

  return (
    <div className="space-y-3">
      {[
        { label: 'Governance',     icon: Vote,        path: '/governance' },
        { label: 'Leaderboard',    icon: Trophy,      path: '/leaderboard' },
        { label: 'Community',      icon: Bell,        path: '/community' },
        { label: 'NFT Marketplace',icon: Coins,       path: '/nft' },
        { label: 'Analytics',      icon: Activity,    path: '/analytics' },
        { label: 'Developer',      icon: Settings,    path: '/developer' },
        { label: 'Protocol Docs',  icon: Shield,      path: '/protocol' },
        { label: 'Security Audit', icon: Shield,      path: '/security' },
        { label: 'Download',       icon: Download,    path: '/download' },
        { label: 'CLI Reference',  icon: RefreshCw,   path: '/cli' },
      ].map(item => (
        <button key={item.label} onClick={() => go(item.path)}
          className="w-full flex items-center gap-4 p-4 rounded-xl bg-card border border-border text-left active:scale-[0.98] hover:border-primary/40 transition-all"
        >
          <div className="p-2.5 rounded-lg bg-primary/10">
            <item.icon className="h-5 w-5 text-primary" />
          </div>
          <span className="flex-1 font-medium text-sm">{item.label}</span>
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        </button>
      ))}

      <div className="mt-2 pt-4 border-t border-border space-y-3">
        <button
          onClick={handleSwitchToDesktop}
          className="w-full flex items-center justify-center gap-2 p-3 rounded-xl bg-secondary/50 border border-border text-sm font-medium hover:border-primary/40 transition-all"
        >
          <MonitorSmartphone className="h-4 w-4" />
          Switch to Desktop View
        </button>
        {user ? (
          <button
            onClick={() => signOut()}
            className="w-full py-3 rounded-xl border border-destructive/40 text-destructive text-sm font-medium"
          >
            Sign Out
          </button>
        ) : (
          <button
            onClick={() => go('/auth')}
            className="w-full py-3 rounded-xl bg-primary text-primary-foreground text-sm font-semibold flex items-center justify-center gap-2"
          >
            <LogIn className="h-4 w-4" /> Sign In
          </button>
        )}
      </div>
    </div>
  );
};

const navTabs: { id: Tab; icon: any; label: string }[] = [
  { id: 'home',     icon: LayoutDashboard, label: 'Home' },
  { id: 'explorer', icon: Search,          label: 'Explorer' },
  { id: 'defi',     icon: ArrowLeftRight,  label: 'DeFi' },
  { id: 'wallet',   icon: Wallet,          label: 'Wallet' },
  { id: 'more',     icon: MoreHorizontal,  label: 'More' },
];

const MobilePage = () => {
  const [tab, setTab] = useState<Tab>('home');

  // Clear the mobile navigation flag whenever we return to the hub
  useEffect(() => {
    sessionStorage.removeItem('fromMobileHub');
  }, []);

  const titles: Record<Tab, string> = {
    home:     'ChainCore',
    explorer: 'Explorer',
    defi:     'DeFi',
    wallet:   'Wallet',
    more:     'More',
  };

  const renderContent = () => {
    switch (tab) {
      case 'home':     return <MobileHome />;
      case 'explorer': return <MobileExplorer />;
      case 'defi':     return <MobileDefi />;
      case 'wallet':   return <MobileWallet />;
      case 'more':     return <MobileMore />;
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-background/95 backdrop-blur-lg border-b border-border px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center">
              <Zap className="h-4 w-4 text-primary-foreground" />
            </div>
            <span className="font-bold text-base">{titles[tab]}</span>
          </div>
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-green-400/10 border border-green-400/20">
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
            <span className="text-xs text-green-400 font-medium">Live</span>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 overflow-y-auto px-4 pt-4 pb-24">
        <AnimatePresence mode="wait">
          <motion.div
            key={tab}
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -10 }}
            transition={{ duration: 0.15 }}
          >
            {renderContent()}
          </motion.div>
        </AnimatePresence>
      </main>

      {/* Bottom nav */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 bg-card/95 backdrop-blur-lg border-t border-border">
        <div className="flex items-center justify-around h-16 px-2">
          {navTabs.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                'flex flex-col items-center justify-center gap-0.5 flex-1 h-full transition-colors',
                tab === t.id ? 'text-primary' : 'text-muted-foreground'
              )}
            >
              <div className={cn('p-1.5 rounded-lg transition-colors', tab === t.id && 'bg-primary/10')}>
                <t.icon className="h-5 w-5" />
              </div>
              <span className="text-[10px] font-medium">{t.label}</span>
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
};

export default MobilePage;
