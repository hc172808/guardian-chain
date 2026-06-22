import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { QRScanner } from '@/components/wallet/QRScanner';
import {
  LayoutDashboard, Search, ArrowLeftRight, Wallet, MoreHorizontal,
  Send, Download, RefreshCw, TrendingUp, Zap, Shield,
  Blocks, Pickaxe, Coins, Vote, Trophy, Droplets,
  Bell, Settings, LogIn, ChevronRight, Activity, Copy,
  ArrowUp, ArrowDown, MonitorSmartphone, Globe, ArrowLeft,
  Wifi, Battery, Signal, Eye, EyeOff, QrCode, Star,
  ChevronDown, Check, CircleDollarSign, Flame, Users,
  BarChart3, Layers, BookOpen, Lock, Fingerprint, Smartphone
} from 'lucide-react';
import {
  isBiometricAvailable,
  isBiometricEnabled,
  registerBiometric,
  authenticateBiometric,
  disableBiometric,
} from '@/lib/biometric';
import { cn } from '@/lib/utils';

type Tab = 'home' | 'explorer' | 'defi' | 'wallet' | 'more';

function useMobileNavigate() {
  const navigate = useNavigate();
  return (path: string, options?: Parameters<typeof navigate>[1]) => {
    sessionStorage.setItem('fromMobileHub', 'true');
    navigate(path, options as any);
  };
}

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

// ── Pull-to-refresh hook ──────────────────────────────────────────────────────
const PULL_THRESHOLD = 72; // px to trigger refresh

function usePullToRefresh(onRefresh: () => Promise<void>) {
  const scrollRef = useRef<HTMLElement | null>(null);
  const startYRef = useRef(0);
  const [pullDistance, setPullDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  const onTouchStart = useCallback((e: TouchEvent) => {
    const el = scrollRef.current;
    if (!el || el.scrollTop > 0) return;
    startYRef.current = e.touches[0].clientY;
  }, []);

  const onTouchMove = useCallback((e: TouchEvent) => {
    const el = scrollRef.current;
    if (!el || el.scrollTop > 0 || refreshing) return;
    const delta = e.touches[0].clientY - startYRef.current;
    if (delta > 0) {
      e.preventDefault();
      setPullDistance(Math.min(delta * 0.45, PULL_THRESHOLD + 24));
    }
  }, [refreshing]);

  const onTouchEnd = useCallback(async () => {
    if (pullDistance >= PULL_THRESHOLD && !refreshing) {
      setRefreshing(true);
      setPullDistance(0);
      try { await onRefresh(); } finally { setRefreshing(false); }
    } else {
      setPullDistance(0);
    }
  }, [pullDistance, refreshing, onRefresh]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('touchend', onTouchEnd, { passive: true });
    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
    };
  }, [onTouchStart, onTouchMove, onTouchEnd]);

  return { scrollRef, pullDistance, refreshing };
}

// ── Status Bar ────────────────────────────────────────────────────────────────
const StatusBar = () => {
  const [time, setTime] = useState('');
  useEffect(() => {
    const update = () => {
      const now = new Date();
      setTime(now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    };
    update();
    const t = setInterval(update, 10000);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="flex items-center justify-between px-5 pt-2 pb-1 text-xs font-semibold">
      <span className="text-foreground">{time}</span>
      <div className="flex items-center gap-1.5 text-foreground">
        <Signal className="h-3 w-3" />
        <Wifi className="h-3.5 w-3.5" />
        <div className="flex items-center gap-0.5">
          <Battery className="h-3.5 w-3.5" />
          <span className="text-[10px]">87%</span>
        </div>
      </div>
    </div>
  );
};

// ── Copy helper ───────────────────────────────────────────────────────────────
const useCopy = () => {
  const [copied, setCopied] = useState(false);
  const copy = (text: string) => {
    navigator.clipboard.writeText(text).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return { copied, copy };
};

// ── Home Tab ──────────────────────────────────────────────────────────────────
const HomeTab = () => {
  const { user } = useAuth();
  const go = useMobileNavigate();
  const [balanceHidden, setBalanceHidden] = useState(false);
  const [showQRScanner, setShowQRScanner] = useState(false);
  const { copied, copy } = useCopy();

  // Real wallet address — prefer user.walletAddress, fall back to first saved wallet
  const [walletAddr, setWalletAddr] = useState<string>(user?.walletAddress ?? '');
  const [recentTxReal, setRecentTxReal] = useState<any[]>([]);

  useEffect(() => {
    if (!user?.walletAddress) {
      fetch('/api/wallets').then(r => r.json()).then((ws: any[]) => {
        if (ws?.[0]?.address) setWalletAddr(ws[0].address);
      }).catch(() => {});
    } else {
      setWalletAddr(user.walletAddress);
    }
    fetch('/api/transactions').then(r => r.json()).then((txs: any[]) => {
      if (Array.isArray(txs)) setRecentTxReal(txs.slice(0, 4));
    }).catch(() => {});
  }, [user]);

  const address = walletAddr || '—';
  const shortAddr = address.length > 10 ? `${address.slice(0, 6)}...${address.slice(-4)}` : address;

  const tokens = [
    { symbol: 'GYDS', name: 'GYDSchain', balance: '12,450.00', usd: '$1,054.49', change: '+4.2%', up: true, color: 'from-primary/80 to-primary/40' },
    { symbol: 'GYD',  name: 'GYD Stable', balance: '500.00',    usd: '$500.00',   change: '+0.0%', up: null, color: 'from-blue-500/80 to-blue-500/40' },
  ];

  const quickActions = [
    { icon: Send,           label: 'Send',    path: '/wallet',  state: undefined,           color: 'text-primary',   bg: 'bg-primary/10',   onPress: undefined as (() => void) | undefined },
    { icon: Download,       label: 'Receive', path: '/wallet',  state: undefined,           color: 'text-green-400', bg: 'bg-green-400/10', onPress: undefined as (() => void) | undefined },
    { icon: ArrowLeftRight, label: 'Swap',    path: '/defi',    state: { tab: 'swap' },     color: 'text-purple-400',bg: 'bg-purple-400/10',onPress: undefined as (() => void) | undefined },
    { icon: Globe,          label: 'Bridge',  path: '/defi',    state: { tab: 'bridge' },   color: 'text-amber-400', bg: 'bg-amber-400/10', onPress: undefined as (() => void) | undefined },
    { icon: TrendingUp,     label: 'Stake',   path: '/defi',    state: { tab: 'stake' },    color: 'text-cyan-400',  bg: 'bg-cyan-400/10',  onPress: undefined as (() => void) | undefined },
    { icon: Droplets,       label: 'Faucet',  path: '/faucet',  state: undefined,           color: 'text-pink-400',  bg: 'bg-pink-400/10',  onPress: undefined as (() => void) | undefined },
    { icon: Pickaxe,        label: 'Mine',    path: '/mining',  state: undefined,           color: 'text-orange-400',bg: 'bg-orange-400/10',onPress: undefined as (() => void) | undefined },
    { icon: QrCode,         label: 'QR Pay',  path: '',         state: undefined,           color: 'text-indigo-400',bg: 'bg-indigo-400/10',onPress: () => setShowQRScanner(true) },
  ];

  const networkStats = [
    { label: 'Block Height', value: '1,234,567', sub: '+12/min',  icon: Blocks,    color: 'text-primary' },
    { label: 'GYDS Price',   value: '$0.0847',   sub: '+4.2% 24h',icon: TrendingUp,color: 'text-green-400' },
    { label: 'TPS',          value: '1,250',     sub: 'avg/min',  icon: Zap,       color: 'text-amber-400' },
    { label: 'Validators',   value: '42',        sub: 'active',   icon: Shield,    color: 'text-cyan-400' },
  ];

  const dummyTx = [
    { type: 'send',    label: 'Sent GYDS',      amount: '-250 GYDS',   usd: '-$21.18', time: '2m ago',  hash: '0xab12…ef34' },
    { type: 'receive', label: 'Received GYDS',  amount: '+1,000 GYDS', usd: '+$84.70', time: '1h ago',  hash: '0xcd56…gh78' },
    { type: 'swap',    label: 'Swapped → GYD',  amount: '500 GYDS',    usd: '$42.35',  time: '3h ago',  hash: '0xij90…kl12' },
    { type: 'stake',   label: 'Staked GYDS',    amount: '5,000 GYDS',  usd: '$423.50', time: '1d ago',  hash: '0xmn34…op56' },
  ];

  const recentTx = recentTxReal.length > 0
    ? recentTxReal.map((tx: any) => ({
        type: tx.transactionType ?? tx.type ?? 'send',
        label: tx.description ?? tx.transactionType ?? 'Transaction',
        amount: `${tx.amount ?? ''} ${tx.tokenSymbol ?? 'GYDS'}`,
        usd: tx.usdValue ? `$${tx.usdValue}` : '',
        time: tx.createdAt ? new Date(tx.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '',
        hash: tx.txHash ? `${tx.txHash.slice(0, 6)}…${tx.txHash.slice(-4)}` : '—',
      }))
    : dummyTx;

  return (
    <div className="space-y-4 pb-2">
      {/* Balance card */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-primary/90 via-primary/70 to-primary/50 p-5 shadow-lg">
        <div className="absolute -top-8 -right-8 w-32 h-32 rounded-full bg-white/10 blur-xl" />
        <div className="absolute -bottom-4 -left-4 w-24 h-24 rounded-full bg-white/5 blur-lg" />
        <div className="relative">
          <div className="flex items-center justify-between mb-1">
            <p className="text-xs font-medium text-white/70 uppercase tracking-wider">Total Balance</p>
            <button onClick={() => setBalanceHidden(v => !v)} className="text-white/60 hover:text-white transition-colors">
              {balanceHidden ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          <p className="text-4xl font-bold text-white mb-1 tracking-tight">
            {balanceHidden ? '••••••' : '$1,554.49'}
          </p>
          <p className="text-xs text-white/60 flex items-center gap-1">
            <ArrowUp className="h-3 w-3 text-green-300" />
            <span className="text-green-300 font-medium">+$63.24</span>
            <span className="ml-0.5">today</span>
          </p>

          {/* Address */}
          <button
            onClick={() => copy(address)}
            className="mt-4 flex items-center gap-2 bg-white/10 hover:bg-white/20 transition-colors rounded-xl px-3 py-2 text-xs text-white/80"
          >
            <span className="font-mono">{shortAddr}</span>
            {copied ? <Check className="h-3 w-3 text-green-300" /> : <Copy className="h-3 w-3" />}
          </button>

          {/* Token breakdown */}
          <div className="flex gap-2 mt-3">
            {tokens.map(t => (
              <div key={t.symbol} className="flex-1 bg-white/10 rounded-xl p-2.5">
                <p className="text-[10px] text-white/60 uppercase tracking-wider">{t.symbol}</p>
                <p className="text-sm font-bold text-white mt-0.5">
                  {balanceHidden ? '••••' : t.balance}
                </p>
                <p className={cn('text-[10px] mt-0.5', t.up ? 'text-green-300' : t.up === false ? 'text-red-300' : 'text-white/50')}>
                  {t.change}
                </p>
              </div>
            ))}
            <div className="flex-1 bg-white/10 rounded-xl p-2.5">
              <p className="text-[10px] text-white/60 uppercase tracking-wider">Staked</p>
              <p className="text-sm font-bold text-white mt-0.5">{balanceHidden ? '••••' : '5,000'}</p>
              <p className="text-[10px] text-cyan-300 mt-0.5">12.4% APY</p>
            </div>
          </div>
        </div>
      </div>

      {/* QR Scanner overlay */}
      {showQRScanner && (
        <QRScanner
          onScan={(val) => {
            setShowQRScanner(false);
            go('/wallet', { state: { prefillAddress: val } });
          }}
          onClose={() => setShowQRScanner(false)}
        />
      )}

      {/* Quick actions */}
      <div className="grid grid-cols-4 gap-2">
        {quickActions.map(a => (
          <button key={a.label}
            onClick={() => a.onPress ? a.onPress() : go(a.path, a.state ? { state: a.state } : undefined)}
            className="flex flex-col items-center gap-1.5 p-3 rounded-2xl bg-card border border-border/60 hover:border-primary/40 active:scale-95 transition-all"
          >
            <div className={cn('p-2 rounded-xl', a.bg)}>
              <a.icon className={cn('h-4 w-4', a.color)} />
            </div>
            <span className="text-[10px] font-medium text-muted-foreground">{a.label}</span>
          </button>
        ))}
      </div>

      {/* Market banner */}
      <div className="flex items-center gap-3 p-3 rounded-2xl bg-gradient-to-r from-green-500/10 to-primary/5 border border-green-500/20">
        <div className="p-2 rounded-xl bg-green-500/15">
          <TrendingUp className="h-4 w-4 text-green-400" />
        </div>
        <div className="flex-1">
          <p className="text-xs font-semibold">GYDSchain is trending</p>
          <p className="text-[10px] text-muted-foreground">+4.2% in the last 24h</p>
        </div>
        <button onClick={() => go('/analytics')} className="text-[10px] text-primary font-medium">View →</button>
      </div>

      {/* Network stats */}
      <div>
        <div className="flex items-center justify-between mb-2.5">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Network</p>
          <div className="flex items-center gap-1 text-[10px] text-green-400">
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse inline-block" />
            Live
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {networkStats.map(s => (
            <div key={s.label} className="p-3 rounded-2xl bg-card border border-border/60">
              <s.icon className={cn('h-4 w-4 mb-2', s.color)} />
              <p className="text-sm font-bold">{s.value}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">{s.label}</p>
              <p className="text-[10px] text-muted-foreground/70">{s.sub}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Recent activity */}
      <div>
        <div className="flex items-center justify-between mb-2.5">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Activity</p>
          <button onClick={() => go('/transactions')} className="text-[10px] text-primary font-medium">See all</button>
        </div>
        <div className="space-y-1.5">
          {recentTx.length === 0 ? (
            <div className="flex flex-col items-center py-6 rounded-2xl bg-card border border-border/60 text-muted-foreground">
              <Activity className="h-7 w-7 mb-2 opacity-30" />
              <p className="text-xs">No transactions yet</p>
              <button onClick={() => go('/transactions')} className="mt-2 text-[10px] text-primary font-medium underline underline-offset-2">Go to Transactions →</button>
            </div>
          ) : recentTx.map((tx, i) => (
            <button
              key={i}
              onClick={() => go('/transactions')}
              className="w-full flex items-center gap-3 p-3 rounded-2xl bg-card border border-border/60 hover:border-primary/40 active:scale-[0.98] transition-all text-left"
            >
              <div className={cn('p-2 rounded-xl shrink-0',
                tx.type === 'send'    ? 'bg-red-400/10'    :
                tx.type === 'receive' ? 'bg-green-400/10'  :
                tx.type === 'swap'    ? 'bg-purple-400/10' : 'bg-cyan-400/10'
              )}>
                {tx.type === 'send'    && <ArrowUp       className="h-4 w-4 text-red-400" />}
                {tx.type === 'receive' && <ArrowDown      className="h-4 w-4 text-green-400" />}
                {tx.type === 'swap'    && <ArrowLeftRight className="h-4 w-4 text-purple-400" />}
                {tx.type === 'stake'   && <TrendingUp     className="h-4 w-4 text-cyan-400" />}
                {!['send','receive','swap','stake'].includes(tx.type) && <Activity className="h-4 w-4 text-muted-foreground" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{tx.label}</p>
                <p className="text-[10px] text-muted-foreground font-mono truncate">{tx.hash} · {tx.time}</p>
              </div>
              <div className="text-right shrink-0">
                <p className={cn('text-sm font-semibold',
                  tx.type === 'send' ? 'text-red-400' :
                  tx.type === 'receive' ? 'text-green-400' : 'text-foreground'
                )}>{tx.amount}</p>
                {tx.usd && <p className="text-[10px] text-muted-foreground">{tx.usd}</p>}
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

// ── Explorer Tab ──────────────────────────────────────────────────────────────
const ExplorerTab = () => {
  const go = useMobileNavigate();
  const [query, setQuery] = useState('');
  const handleSearch = () => {
    const q = query.trim();
    if (!q) return;
    go(`/explorer?q=${encodeURIComponent(q)}`);
  };

  const latestBlocks = [
    { height: 1234567, txs: 12, time: '2s ago', miner: '0xabcd…ef12' },
    { height: 1234566, txs: 8,  time: '14s ago', miner: '0x3456…7890' },
    { height: 1234565, txs: 21, time: '26s ago', miner: '0xcdef…0123' },
  ];

  const items = [
    { label: 'Blocks',        icon: Blocks,     path: '/explorer',      color: 'text-primary',    bg: 'bg-primary/10' },
    { label: 'Transactions',  icon: Activity,   path: '/transactions',  color: 'text-blue-400',   bg: 'bg-blue-400/10' },
    { label: 'Validators',    icon: Shield,     path: '/validators',    color: 'text-green-400',  bg: 'bg-green-400/10' },
    { label: 'Mining',        icon: Pickaxe,    path: '/mining',        color: 'text-amber-400',  bg: 'bg-amber-400/10' },
    { label: 'Token Factory', icon: Coins,      path: '/tokens',        color: 'text-purple-400', bg: 'bg-purple-400/10' },
    { label: 'Analytics',     icon: BarChart3,  path: '/analytics',     color: 'text-cyan-400',   bg: 'bg-cyan-400/10' },
  ];

  return (
    <div className="space-y-4 pb-2">
      {/* Search */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSearch()}
            placeholder="Block, tx, address…"
            className="w-full pl-10 pr-4 py-3 rounded-2xl bg-card border border-border/60 text-sm focus:outline-none focus:border-primary transition-colors"
          />
        </div>
        <button onClick={handleSearch}
          className="px-5 rounded-2xl bg-primary text-primary-foreground text-sm font-semibold active:scale-95 transition-all">
          Go
        </button>
      </div>

      {/* Latest blocks */}
      <div>
        <div className="flex items-center justify-between mb-2.5">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Latest Blocks</p>
          <button onClick={() => go('/explorer')} className="text-[10px] text-primary font-medium">All →</button>
        </div>
        <div className="space-y-1.5">
          {latestBlocks.map(b => (
            <div key={b.height} className="flex items-center gap-3 p-3 rounded-2xl bg-card border border-border/60">
              <div className="p-2 rounded-xl bg-primary/10">
                <Blocks className="h-4 w-4 text-primary" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold">#{b.height.toLocaleString()}</p>
                <p className="text-[10px] text-muted-foreground font-mono">{b.miner}</p>
              </div>
              <div className="text-right">
                <p className="text-xs font-medium text-primary">{b.txs} txs</p>
                <p className="text-[10px] text-muted-foreground">{b.time}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Browse */}
      <div>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2.5">Browse</p>
        <div className="grid grid-cols-2 gap-2">
          {items.map(item => (
            <button key={item.label} onClick={() => go(item.path)}
              className="flex items-center gap-3 p-3.5 rounded-2xl bg-card border border-border/60 hover:border-primary/40 active:scale-95 transition-all text-left"
            >
              <div className={cn('p-2 rounded-xl', item.bg)}>
                <item.icon className={cn('h-4 w-4', item.color)} />
              </div>
              <span className="text-sm font-medium">{item.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

// ── DeFi Tab ──────────────────────────────────────────────────────────────────
const DefiTab = () => {
  const go = useMobileNavigate();

  const stats = [
    { label: 'TVL',     value: '$2.4M',  icon: CircleDollarSign, color: 'text-green-400' },
    { label: 'Vol 24h', value: '$183K',  icon: BarChart3,         color: 'text-primary' },
    { label: 'Pools',   value: '24',     icon: Layers,            color: 'text-purple-400' },
    { label: 'Your APY',value: '12.4%',  icon: Flame,             color: 'text-amber-400' },
  ];

  const items = [
    { label: 'Swap Tokens',       icon: ArrowLeftRight, desc: 'Instant GYDS ↔ GYD swap',          tab: 'swap',      color: 'text-purple-400', bg: 'bg-purple-400/10', badge: 'HOT' },
    { label: 'Liquidity Pools',   icon: Droplets,       desc: 'Add LP & earn trading fees',        tab: 'pools',     color: 'text-blue-400',   bg: 'bg-blue-400/10',   badge: null },
    { label: 'Stake GYDS',        icon: TrendingUp,     desc: '12.4% APY rewards',                 tab: 'stake',     color: 'text-green-400',  bg: 'bg-green-400/10',  badge: '12.4%' },
    { label: 'Order Book',        icon: Activity,       desc: 'Limit & market orders',             tab: 'orderbook', color: 'text-amber-400',  bg: 'bg-amber-400/10',  badge: null },
    { label: 'Yield Vaults',      icon: Zap,            desc: 'Auto-compound strategies',          tab: 'vaults',    color: 'text-cyan-400',   bg: 'bg-cyan-400/10',   badge: 'NEW' },
    { label: 'Cross-Chain Bridge',icon: Globe,          desc: '25 supported networks',             tab: 'bridge',    color: 'text-pink-400',   bg: 'bg-pink-400/10',   badge: null },
    { label: 'Launchpad',         icon: RefreshCw,      desc: 'New token launches',                tab: 'launchpad', color: 'text-orange-400', bg: 'bg-orange-400/10', badge: null },
    { label: 'Portfolio',         icon: BarChart3,      desc: 'Your DeFi positions',               tab: 'portfolio', color: 'text-indigo-400', bg: 'bg-indigo-400/10', badge: null },
  ];

  return (
    <div className="space-y-4 pb-2">
      {/* Stats row */}
      <div className="grid grid-cols-4 gap-2">
        {stats.map(s => (
          <div key={s.label} className="p-2.5 rounded-2xl bg-card border border-border/60 text-center">
            <s.icon className={cn('h-3.5 w-3.5 mx-auto mb-1', s.color)} />
            <p className="text-xs font-bold">{s.value}</p>
            <p className="text-[9px] text-muted-foreground">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Items */}
      <div className="space-y-2">
        {items.map(item => (
          <button key={item.label}
            onClick={() => go('/defi', { state: { tab: item.tab } })}
            className="w-full flex items-center gap-3 p-3.5 rounded-2xl bg-card border border-border/60 hover:border-primary/40 active:scale-[0.98] transition-all text-left"
          >
            <div className={cn('p-2.5 rounded-xl', item.bg)}>
              <item.icon className={cn('h-5 w-5', item.color)} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-sm font-semibold">{item.label}</p>
                {item.badge && (
                  <span className={cn('text-[9px] font-bold px-1.5 py-0.5 rounded-full',
                    item.badge === 'HOT'  ? 'bg-orange-400/20 text-orange-400' :
                    item.badge === 'NEW'  ? 'bg-blue-400/20 text-blue-400' :
                    'bg-green-400/20 text-green-400'
                  )}>{item.badge}</span>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground">{item.desc}</p>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
          </button>
        ))}
      </div>
    </div>
  );
};

// ── Wallet Tab ────────────────────────────────────────────────────────────────
const WalletTab = () => {
  const go = useMobileNavigate();
  const { user } = useAuth();
  const { copied, copy } = useCopy();
  const [walletAddr, setWalletAddr] = useState<string>(user?.walletAddress ?? '');

  useEffect(() => {
    if (!user?.walletAddress) {
      fetch('/api/wallets').then(r => r.json()).then((ws: any[]) => {
        if (ws?.[0]?.address) setWalletAddr(ws[0].address);
      }).catch(() => {});
    } else {
      setWalletAddr(user.walletAddress);
    }
  }, [user]);

  const address = walletAddr || '—';

  const assets = [
    { symbol: 'GYDS', name: 'GYDSchain', balance: '12,450.00', usd: '$1,054.49', change: '+4.2%', up: true,  icon: Zap,             color: 'text-primary',    bg: 'bg-primary/10' },
    { symbol: 'GYD',  name: 'GYD Stable',balance: '500.00',    usd: '$500.00',   change: '+0.0%', up: null,  icon: CircleDollarSign,color: 'text-blue-400',   bg: 'bg-blue-400/10' },
    { symbol: 'sGYDS',name: 'Staked',    balance: '5,000.00',  usd: '$423.50',   change: '+12.4%',up: true,  icon: Lock,            color: 'text-cyan-400',   bg: 'bg-cyan-400/10' },
  ];

  return (
    <div className="space-y-4 pb-2">
      {/* Wallet card */}
      <div className="p-4 rounded-3xl bg-gradient-to-br from-card to-secondary/50 border border-border/60">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-primary/20 flex items-center justify-center">
              <Wallet className="h-4 w-4 text-primary" />
            </div>
            <div>
              <p className="text-xs font-semibold">My Wallet</p>
              <p className="text-[10px] text-muted-foreground">GYDSchain Network</p>
            </div>
          </div>
          <span className="text-[10px] font-medium px-2 py-1 rounded-full bg-green-400/10 text-green-400 border border-green-400/20">
            Connected
          </span>
        </div>
        <button
          onClick={() => copy(address)}
          className="w-full flex items-center justify-between bg-background/60 rounded-xl px-3 py-2.5 text-xs font-mono"
        >
          <span className="text-muted-foreground truncate font-mono">
            {address.length > 26 ? `${address.slice(0, 20)}…${address.slice(-6)}` : address}
          </span>
          {copied ? <Check className="h-3.5 w-3.5 text-green-400 shrink-0" /> : <Copy className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
        </button>

        <div className="grid grid-cols-3 gap-2 mt-3">
          {[
            { label: 'Send',    icon: Send,     go: () => go('/wallet') },
            { label: 'Receive', icon: Download, go: () => go('/wallet') },
            { label: 'Swap',    icon: ArrowLeftRight, go: () => go('/defi', { state: { tab: 'swap' } }) },
          ].map(btn => (
            <button key={btn.label} onClick={btn.go}
              className="flex flex-col items-center gap-1 py-2.5 rounded-xl bg-primary/10 hover:bg-primary/20 active:scale-95 transition-all">
              <btn.icon className="h-4 w-4 text-primary" />
              <span className="text-[10px] font-medium text-primary">{btn.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Assets */}
      <div>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2.5">Assets</p>
        <div className="space-y-1.5">
          {assets.map(a => (
            <div key={a.symbol} className="flex items-center gap-3 p-3.5 rounded-2xl bg-card border border-border/60">
              <div className={cn('p-2.5 rounded-xl', a.bg)}>
                <a.icon className={cn('h-4 w-4', a.color)} />
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold">{a.symbol}</p>
                <p className="text-[10px] text-muted-foreground">{a.name}</p>
              </div>
              <div className="text-right">
                <p className="text-sm font-semibold">{a.balance}</p>
                <div className="flex items-center gap-1 justify-end">
                  <p className="text-[10px] text-muted-foreground">{a.usd}</p>
                  <p className={cn('text-[10px] font-medium',
                    a.up === true ? 'text-green-400' : a.up === false ? 'text-red-400' : 'text-muted-foreground'
                  )}>{a.change}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Quick links */}
      <div className="grid grid-cols-2 gap-2">
        {[
          { label: 'Tx History',    icon: Activity,   path: '/transactions' },
          { label: 'Watchlist',     icon: Star,       path: '/watchlist' },
          { label: 'Faucet',        icon: Droplets,   path: '/faucet' },
          { label: 'Network',       icon: Globe,      path: '/network' },
        ].map(item => (
          <button key={item.label} onClick={() => go(item.path)}
            className="flex items-center gap-2.5 p-3 rounded-2xl bg-card border border-border/60 hover:border-primary/40 active:scale-95 transition-all"
          >
            <div className="p-1.5 rounded-lg bg-primary/10">
              <item.icon className="h-3.5 w-3.5 text-primary" />
            </div>
            <span className="text-xs font-medium">{item.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
};

// ── More Tab ──────────────────────────────────────────────────────────────────
const MoreTab = () => {
  const go = useMobileNavigate();
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const [biometricAvail, setBiometricAvail] = useState(false);
  const [biometricOn, setBiometricOn] = useState(isBiometricEnabled());
  const [biometricLoading, setBiometricLoading] = useState(false);
  const [pushOn, setPushOn] = useState(false);
  const [pushLoading, setPushLoading] = useState(false);

  useEffect(() => {
    isBiometricAvailable().then(setBiometricAvail);
    if ('serviceWorker' in navigator && 'PushManager' in window) {
      navigator.serviceWorker.ready.then(reg =>
        reg.pushManager.getSubscription().then(sub => setPushOn(!!sub))
      ).catch(() => {});
    }
  }, []);

  const toggleBiometric = async () => {
    if (!user || biometricLoading) return;
    setBiometricLoading(true);
    if (biometricOn) {
      disableBiometric();
      setBiometricOn(false);
    } else {
      const ok = await registerBiometric(user.id);
      if (ok) setBiometricOn(true);
    }
    setBiometricLoading(false);
  };

  const togglePush = async () => {
    if (pushLoading || !('serviceWorker' in navigator)) return;
    setPushLoading(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      if (pushOn) {
        const sub = await reg.pushManager.getSubscription();
        if (sub) { await sub.unsubscribe(); await fetch('/api/push/subscribe', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ endpoint: sub.endpoint }) }); }
        setPushOn(false);
      } else {
        const keyRes = await fetch('/api/push/vapid-key');
        const { publicKey } = await keyRes.json();
        if (publicKey) {
          const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: publicKey });
          await fetch('/api/push/subscribe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ subscription: sub }) });
          setPushOn(true);
        }
      }
    } catch {}
    setPushLoading(false);
  };

  const sections = [
    {
      title: 'Ecosystem',
      items: [
        { label: 'Governance',      icon: Vote,      path: '/governance',  color: 'text-purple-400', bg: 'bg-purple-400/10' },
        { label: 'NFT Marketplace', icon: Layers,    path: '/nft',         color: 'text-pink-400',   bg: 'bg-pink-400/10' },
        { label: 'Leaderboard',     icon: Trophy,    path: '/leaderboard', color: 'text-amber-400',  bg: 'bg-amber-400/10' },
        { label: 'Community',       icon: Users,     path: '/community',   color: 'text-blue-400',   bg: 'bg-blue-400/10' },
      ],
    },
    {
      title: 'Tools',
      items: [
        { label: 'Analytics',       icon: BarChart3, path: '/analytics',   color: 'text-cyan-400',   bg: 'bg-cyan-400/10' },
        { label: 'Developer API',   icon: Settings,  path: '/developer',   color: 'text-green-400',  bg: 'bg-green-400/10' },
        { label: 'Protocol Docs',   icon: BookOpen,  path: '/protocol',    color: 'text-indigo-400', bg: 'bg-indigo-400/10' },
        { label: 'Security',        icon: Shield,    path: '/security',    color: 'text-red-400',    bg: 'bg-red-400/10' },
      ],
    },
    {
      title: 'Resources',
      items: [
        { label: 'Download Nodes',  icon: Download,  path: '/download',    color: 'text-primary',    bg: 'bg-primary/10' },
        { label: 'CLI Reference',   icon: Activity,  path: '/cli',         color: 'text-muted-foreground', bg: 'bg-muted/40' },
      ],
    },
  ];

  return (
    <div className="space-y-5 pb-2">
      {/* Profile card */}
      {user ? (
        <div className="flex items-center gap-3 p-4 rounded-2xl bg-card border border-border/60">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-primary/60 to-primary/20 flex items-center justify-center text-lg font-bold text-primary">
            {(user.firstName?.[0] ?? user.email?.[0] ?? 'U').toUpperCase()}
          </div>
          <div className="flex-1">
            <p className="font-semibold">{user.firstName ?? user.email ?? 'User'}</p>
            <p className="text-[11px] text-muted-foreground">{user.email ?? 'No email'}</p>
            <div className="flex gap-1 mt-1">
              {(user.roles ?? []).map((r: string) => (
                <span key={r} className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-primary/15 text-primary capitalize">{r}</span>
              ))}
            </div>
          </div>
          <button onClick={() => go('/profile')} className="p-2 rounded-xl bg-primary/10">
            <ChevronRight className="h-4 w-4 text-primary" />
          </button>
        </div>
      ) : (
        <button onClick={() => go('/auth')}
          className="w-full flex items-center justify-center gap-2 p-4 rounded-2xl bg-primary text-primary-foreground font-semibold text-sm active:scale-95 transition-all">
          <LogIn className="h-4 w-4" /> Sign In to GYDSchain
        </button>
      )}

      {/* Sections */}
      {sections.map(sec => (
        <div key={sec.title}>
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-2">{sec.title}</p>
          <div className="space-y-1.5">
            {sec.items.map(item => (
              <button key={item.label} onClick={() => go(item.path)}
                className="w-full flex items-center gap-3 p-3.5 rounded-2xl bg-card border border-border/60 hover:border-primary/40 active:scale-[0.98] transition-all text-left"
              >
                <div className={cn('p-2 rounded-xl', item.bg)}>
                  <item.icon className={cn('h-4 w-4', item.color)} />
                </div>
                <span className="flex-1 text-sm font-medium">{item.label}</span>
                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
            ))}
          </div>
        </div>
      ))}

      {/* Security & Notifications */}
      {user && (
        <div>
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-2">Security & Notifications</p>
          <div className="rounded-2xl bg-card border border-border/60 overflow-hidden divide-y divide-border/40">
            {biometricAvail && (
              <div className="flex items-center gap-3 p-3.5">
                <div className="p-2 rounded-xl bg-primary/10">
                  <Fingerprint className="h-4 w-4 text-primary" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium">Biometric Unlock</p>
                  <p className="text-[10px] text-muted-foreground">Face ID / fingerprint</p>
                </div>
                <button
                  onClick={toggleBiometric}
                  disabled={biometricLoading}
                  className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${biometricOn ? 'bg-primary' : 'bg-muted'}`}
                >
                  <span className={`block h-4 w-4 rounded-full bg-background shadow transition-transform ${biometricOn ? 'translate-x-4' : 'translate-x-0.5'}`} />
                </button>
              </div>
            )}
            {'PushManager' in window && (
              <div className="flex items-center gap-3 p-3.5">
                <div className="p-2 rounded-xl bg-blue-400/10">
                  <Smartphone className="h-4 w-4 text-blue-400" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium">Push Notifications</p>
                  <p className="text-[10px] text-muted-foreground">Browser alerts</p>
                </div>
                <button
                  onClick={togglePush}
                  disabled={pushLoading}
                  className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${pushOn ? 'bg-primary' : 'bg-muted'}`}
                >
                  <span className={`block h-4 w-4 rounded-full bg-background shadow transition-transform ${pushOn ? 'translate-x-4' : 'translate-x-0.5'}`} />
                </button>
              </div>
            )}
            <button onClick={() => go('/security')}
              className="w-full flex items-center gap-3 p-3.5 hover:bg-muted/40 active:scale-[0.98] transition-all text-left">
              <div className="p-2 rounded-xl bg-red-400/10">
                <Lock className="h-4 w-4 text-red-400" />
              </div>
              <span className="flex-1 text-sm font-medium">Security Settings</span>
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
          </div>
        </div>
      )}

      {/* Switch + Sign out */}
      <div className="space-y-2 pt-1">
        <button
          onClick={() => { sessionStorage.setItem('preferDesktop', 'true'); sessionStorage.removeItem('fromMobileHub'); navigate('/', { replace: true }); }}
          className="w-full flex items-center justify-center gap-2 p-3 rounded-2xl bg-secondary/50 border border-border/60 text-sm font-medium hover:border-primary/40 transition-all"
        >
          <MonitorSmartphone className="h-4 w-4" /> Switch to Desktop View
        </button>
        {user && (
          <button onClick={() => signOut()}
            className="w-full py-3 rounded-2xl border border-destructive/30 text-destructive text-sm font-medium hover:bg-destructive/5 transition-all">
            Sign Out
          </button>
        )}
      </div>
    </div>
  );
};

// ── Nav config ────────────────────────────────────────────────────────────────
const navTabs: { id: Tab; icon: any; label: string }[] = [
  { id: 'home',     icon: LayoutDashboard, label: 'Home' },
  { id: 'explorer', icon: Search,          label: 'Explorer' },
  { id: 'defi',     icon: ArrowLeftRight,  label: 'DeFi' },
  { id: 'wallet',   icon: Wallet,          label: 'Wallet' },
  { id: 'more',     icon: MoreHorizontal,  label: 'More' },
];

// ── App titles ────────────────────────────────────────────────────────────────
const titles: Record<Tab, string> = {
  home:     'GYDSchain',
  explorer: 'Explorer',
  defi:     'GydsSwap',
  wallet:   'Wallet',
  more:     'More',
};

// ── Main Page ─────────────────────────────────────────────────────────────────
const MobilePage = () => {
  const [tab, setTab] = useState<Tab>('home');
  const [refreshKey, setRefreshKey] = useState(0);
  const { user } = useAuth();
  const go = useMobileNavigate();

  useEffect(() => {
    sessionStorage.removeItem('fromMobileHub');
  }, []);

  const handleRefresh = useCallback(async () => {
    // Simulate async data refresh — bump key to remount active tab
    await new Promise<void>(res => setTimeout(res, 800));
    setRefreshKey(k => k + 1);
  }, []);

  const { scrollRef, pullDistance, refreshing } = usePullToRefresh(handleRefresh);

  const clampedPull = Math.min(pullDistance, PULL_THRESHOLD + 24);
  const showPullIndicator = clampedPull > 8 || refreshing;
  const pullProgress = Math.min(clampedPull / PULL_THRESHOLD, 1);

  return (
    <div className="min-h-screen max-w-md mx-auto bg-background flex flex-col relative overflow-hidden">
      {/* Status bar */}
      <StatusBar />

      {/* App header */}
      <header className="sticky top-0 z-40 bg-background/95 backdrop-blur-xl px-4 py-2.5 flex items-center justify-between border-b border-border/30">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-primary to-primary/50 flex items-center justify-center shadow-lg shadow-primary/20">
            <Zap className="h-4 w-4 text-primary-foreground" />
          </div>
          <div>
            <span className="font-bold text-base leading-none">{titles[tab]}</span>
            {tab === 'home' && (
              <p className="text-[10px] text-muted-foreground leading-none mt-0.5">Chain ID: 13370</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-green-400/10 border border-green-400/20">
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
            <span className="text-[10px] text-green-400 font-medium">Live</span>
          </div>
          <button onClick={() => go('/auth')} className="p-1.5 rounded-xl bg-card border border-border/60">
            {user
              ? <div className="w-5 h-5 rounded-lg bg-primary/20 flex items-center justify-center text-[10px] font-bold text-primary">{(user.firstName?.[0] ?? 'U').toUpperCase()}</div>
              : <Bell className="h-4 w-4 text-muted-foreground" />
            }
          </button>
        </div>
      </header>

      {/* Pull-to-refresh indicator */}
      <AnimatePresence>
        {showPullIndicator && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: refreshing ? 44 : Math.max(clampedPull * 0.5, 8) }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.15 }}
            className="flex items-center justify-center overflow-hidden bg-primary/5"
          >
            <RefreshCw
              className={cn('h-5 w-5 text-primary transition-transform', refreshing && 'animate-spin')}
              style={!refreshing ? { transform: `rotate(${pullProgress * 270}deg)` } : undefined}
            />
            <span className="text-xs text-primary font-medium ml-2">
              {refreshing ? 'Refreshing…' : pullProgress >= 1 ? 'Release to refresh' : 'Pull to refresh'}
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Scrollable content */}
      <main
        ref={el => { scrollRef.current = el; }}
        className="flex-1 overflow-y-auto px-4 pt-4 pb-28 scrollbar-none"
        style={{ transform: clampedPull > 0 ? `translateY(${clampedPull * 0.3}px)` : undefined, transition: clampedPull === 0 ? 'transform 0.25s ease' : undefined }}
      >
        <AnimatePresence mode="wait">
          <motion.div
            key={`${tab}-${refreshKey}`}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
          >
            {tab === 'home'     && <HomeTab />}
            {tab === 'explorer' && <ExplorerTab />}
            {tab === 'defi'     && <DefiTab />}
            {tab === 'wallet'   && <WalletTab />}
            {tab === 'more'     && <MoreTab />}
          </motion.div>
        </AnimatePresence>
      </main>

      {/* Bottom nav */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 max-w-md mx-auto bg-card/95 backdrop-blur-xl border-t border-border/40">
        <div className="flex items-center justify-around h-16 px-1">
          {navTabs.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                'flex flex-col items-center justify-center gap-1 flex-1 h-full relative transition-colors',
                tab === t.id ? 'text-primary' : 'text-muted-foreground/60'
              )}
            >
              {tab === t.id && (
                <motion.div
                  layoutId="nav-pill"
                  className="absolute top-1.5 w-12 h-0.5 rounded-full bg-primary"
                  transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                />
              )}
              <div className={cn('p-1.5 rounded-xl transition-colors mt-1', tab === t.id && 'bg-primary/10')}>
                <t.icon className="h-5 w-5" />
              </div>
              <span className="text-[10px] font-medium pb-0.5">{t.label}</span>
            </button>
          ))}
        </div>
        {/* iOS home indicator */}
        <div className="flex justify-center pb-1.5 pt-0.5">
          <div className="w-28 h-1 rounded-full bg-foreground/20" />
        </div>
      </nav>
    </div>
  );
};

export default MobilePage;
