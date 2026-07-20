import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate, type NavigateOptions } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { QRScanner } from '@/components/wallet/QRScanner';
import QRCode from 'qrcode';
import {
  LayoutDashboard, Search, ArrowLeftRight, Wallet, MoreHorizontal,
  Send, Download, RefreshCw, TrendingUp, Zap, Shield,
  Blocks, Pickaxe, Coins, Vote, Trophy, Droplets,
  Bell, Settings, LogIn, ChevronRight, Activity, Copy,
  ArrowUp, ArrowDown, MonitorSmartphone, Globe, ArrowLeft,
  Wifi, Battery, Signal, Eye, EyeOff, QrCode, Star,
  ChevronDown, Check, CircleDollarSign, Flame, Users,
  BarChart3, Layers, BookOpen, Lock, Fingerprint, Smartphone,
  X, Gift, CreditCard, Image as ImageIcon, ScanLine, Percent, Clock
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
  return (path: string, options?: NavigateOptions) => {
    sessionStorage.setItem('fromMobileHub', 'true');
    navigate(path, options);
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
  const [batteryLevel, setBatteryLevel] = useState<number | null>(null);

  useEffect(() => {
    const update = () => {
      const now = new Date();
      setTime(now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    };
    update();
    const t = setInterval(update, 10000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    // Use Battery Status API where available
    const nav = navigator as any;
    if (nav.getBattery) {
      nav.getBattery().then((bat: any) => {
        setBatteryLevel(Math.round(bat.level * 100));
        bat.addEventListener('levelchange', () => setBatteryLevel(Math.round(bat.level * 100)));
      }).catch(() => {});
    }
  }, []);

  return (
    <div className="flex items-center justify-between px-5 pt-2 pb-1 text-xs font-semibold">
      <span className="text-foreground">{time}</span>
      <div className="flex items-center gap-1.5 text-foreground">
        <Signal className="h-3 w-3" />
        <Wifi className="h-3.5 w-3.5" />
        <div className="flex items-center gap-0.5">
          <Battery className="h-3.5 w-3.5" />
          {batteryLevel !== null && <span className="text-[10px]">{batteryLevel}%</span>}
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

// ── Receive QR Modal ──────────────────────────────────────────────────────────
const ReceiveModal = ({ address, onClose }: { address: string; onClose: () => void }) => {
  const { copied, copy } = useCopy();
  const [qrUrl, setQrUrl] = useState('');
  useEffect(() => {
    if (address && address !== '—') {
      QRCode.toDataURL(address, { width: 240, margin: 2 }).then(setQrUrl).catch(() => {});
    }
  }, [address]);
  const share = () => {
    if (navigator.share) navigator.share({ title: 'My GYDS Wallet Address', text: address }).catch(() => {});
    else copy(address);
  };
  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <motion.div
        initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
        transition={{ type: 'spring', stiffness: 320, damping: 32 }}
        onClick={e => e.stopPropagation()}
        className="relative z-10 w-full max-w-md bg-card rounded-t-3xl border-t border-border/40 p-6 pb-10"
      >
        <div className="w-10 h-1 rounded-full bg-border/60 mx-auto mb-5" />
        <div className="flex items-center justify-between mb-5">
          <div>
            <h3 className="text-base font-bold">Receive GYDS</h3>
            <p className="text-[11px] text-muted-foreground">GYDSchain · Chain ID 13370</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-xl hover:bg-muted/60 transition-colors">
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>
        <div className="flex flex-col items-center gap-4">
          {qrUrl ? (
            <div className="p-3.5 rounded-2xl bg-white shadow-xl">
              <img src={qrUrl} alt="Wallet QR Code" className="w-44 h-44" />
            </div>
          ) : (
            <div className="w-44 h-44 rounded-2xl bg-muted animate-pulse" />
          )}
          <div className="text-center w-full">
            <p className="text-[10px] text-muted-foreground mb-2 uppercase tracking-wider">Your wallet address</p>
            <button
              onClick={() => copy(address)}
              className="flex items-center gap-2 bg-muted/60 hover:bg-muted rounded-xl px-4 py-2.5 text-xs font-mono w-full justify-center transition-colors"
            >
              <span className="truncate">{address}</span>
              {copied ? <Check className="h-3.5 w-3.5 text-green-400 shrink-0" /> : <Copy className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2.5 w-full pt-1">
            <button onClick={() => copy(address)}
              className="py-3 rounded-2xl bg-primary text-primary-foreground text-sm font-semibold active:scale-95 transition-all">
              {copied ? '✓ Copied!' : 'Copy Address'}
            </button>
            <button onClick={share}
              className="py-3 rounded-2xl bg-secondary/60 border border-border/60 text-sm font-semibold active:scale-95 transition-all">
              Share
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

// ── Home Tab ──────────────────────────────────────────────────────────────────
const HomeTab = () => {
  const { user } = useAuth();
  const go = useMobileNavigate();
  const [balanceHidden, setBalanceHidden] = useState(false);
  const [showQRScanner, setShowQRScanner] = useState(false);
  const [showReceive, setShowReceive] = useState(false);
  const { copied, copy } = useCopy();

  const [walletAddr, setWalletAddr] = useState<string>(user?.walletAddress ?? '');
  const [walletBalance, setWalletBalance] = useState<string>('');
  const [recentTxReal, setRecentTxReal] = useState<any[]>([]);
  const [netStats, setNetStats] = useState<any>(null);
  const [stakingStats, setStakingStats] = useState<{ apr: number; exchangeRate: number } | null>(null);
  const [stakedAmount, setStakedAmount] = useState<number>(0);
  const [faucetInfo, setFaucetInfo] = useState<{ canClaim: boolean; lastClaim?: string }>({ canClaim: false });
  const [claiming, setClaiming] = useState(false);

  useEffect(() => {
    // Always fetch wallet address + live balance
    fetch('/api/wallets').then(r => r.json()).then((ws: any[]) => {
      if (ws?.[0]?.address) setWalletAddr(ws[0].address);
    }).catch(() => {});
    // Fetch authoritative balance from /api/user/balance (testnet — faucet is testnet-only)
    fetch('/api/user/balance?network=testnet').then(r => r.json()).then((b: any) => {
      if (b && (b.gyds !== undefined || b.gyd !== undefined)) {
        const gyds = Number(b.gyds ?? 0);
        setWalletBalance(gyds > 0 ? gyds.toLocaleString(undefined, { maximumFractionDigits: 4 }) : '0.00');
      }
    }).catch(() => {});
    if (user?.walletAddress) setWalletAddr(user.walletAddress);
    fetch('/api/transactions').then(r => r.json()).then((txs: any[]) => {
      if (Array.isArray(txs)) setRecentTxReal(txs.slice(0, 4));
    }).catch(() => {});
    fetch('/api/network-stats').then(r => r.json()).then(d => {
      if (d?.stats) setNetStats(d.stats);
    }).catch(() => {});
    fetch('/api/staking/stats').then(r => r.json()).then(d => {
      if (d?.apr !== undefined) setStakingStats({ apr: d.apr, exchangeRate: d.exchangeRate ?? 1 });
    }).catch(() => {});
    fetch('/api/validator-delegations').then(r => r.json()).then((d: any[]) => {
      if (Array.isArray(d)) setStakedAmount(d.reduce((s, x) => s + Number(x.amount ?? 0), 0));
    }).catch(() => {});
    fetch('/api/faucet/claims').then(r => r.json()).then((claims: any[]) => {
      if (!Array.isArray(claims) || claims.length === 0) { setFaucetInfo({ canClaim: true }); return; }
      const last = claims[0];
      const lastAt = new Date(last.createdAt ?? last.claimed_at ?? 0).getTime();
      const cooldown = 24 * 60 * 60 * 1000;
      setFaucetInfo({ canClaim: Date.now() - lastAt > cooldown, lastClaim: last.createdAt ?? last.claimed_at });
    }).catch(() => setFaucetInfo({ canClaim: true }));
  }, [user]);

  const address = walletAddr || '—';
  const shortAddr = address.length > 10 ? `${address.slice(0, 6)}...${address.slice(-4)}` : address;

  const gydsBalance = walletBalance || '0.00';
  const totalUsd = walletBalance && parseFloat(walletBalance.replace(/,/g, '')) > 0
    ? `$${(parseFloat(walletBalance.replace(/,/g, '')) * 0.0847).toFixed(2)}`
    : '$0.00';

  const tokens = [
    { symbol: 'GYDS', name: 'GYDSchain', balance: gydsBalance, change: '', up: null },
    { symbol: 'GYD',  name: 'GYD Stable', balance: '0.00',  change: '', up: null },
  ];

  const quickActions = [
    { icon: Send,           label: 'Send',    path: '/wallet',  state: undefined,           color: 'text-primary',    bg: 'bg-primary/10',    onPress: undefined as (() => void) | undefined },
    { icon: Download,       label: 'Receive', path: '',         state: undefined,           color: 'text-green-400',  bg: 'bg-green-400/10',  onPress: () => setShowReceive(true) },
    { icon: ArrowLeftRight, label: 'Swap',    path: '/defi',    state: { tab: 'swap' },     color: 'text-purple-400', bg: 'bg-purple-400/10', onPress: undefined },
    { icon: Globe,          label: 'Bridge',  path: '/defi',    state: { tab: 'bridge' },   color: 'text-amber-400',  bg: 'bg-amber-400/10',  onPress: undefined },
    { icon: TrendingUp,     label: 'Stake',   path: '/defi',    state: { tab: 'stake' },    color: 'text-cyan-400',   bg: 'bg-cyan-400/10',   onPress: undefined },
    { icon: Droplets,       label: 'Faucet',  path: '/faucet',  state: undefined,           color: 'text-pink-400',   bg: 'bg-pink-400/10',   onPress: undefined },
    { icon: Pickaxe,        label: 'Mine',    path: '/mining',  state: undefined,           color: 'text-orange-400', bg: 'bg-orange-400/10', onPress: undefined },
    { icon: QrCode,         label: 'QR Pay',  path: '',         state: undefined,           color: 'text-indigo-400', bg: 'bg-indigo-400/10', onPress: () => setShowQRScanner(true) },
  ];

  const liveNetworkStats = [
    { label: 'Block Height', value: netStats?.blockHeight ? `#${Number(netStats.blockHeight).toLocaleString()}` : '…', sub: 'latest', icon: Blocks, color: 'text-primary' },
    { label: 'GYDS Price',   value: netStats?.tokenPrice  ? `$${Number(netStats.tokenPrice).toFixed(4)}` : '$0.0847', sub: netStats?.priceChange24h ? `${netStats.priceChange24h > 0 ? '+' : ''}${netStats.priceChange24h}% 24h` : '+4.2% 24h', icon: TrendingUp, color: 'text-green-400' },
    { label: 'TPS',          value: netStats?.tps          ? String(netStats.tps) : '1,250',    sub: 'avg/min',  icon: Zap,    color: 'text-amber-400' },
    { label: 'Validators',   value: netStats?.validatorCount ? String(netStats.validatorCount) : '42', sub: 'active', icon: Shield, color: 'text-cyan-400' },
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

  const claimFaucet = async () => {
    if (!faucetInfo.canClaim || claiming) return;
    setClaiming(true);
    try {
      const r = await fetch('/api/faucet/claim', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tokenSymbol: 'GYDS' }) });
      if (r.ok) setFaucetInfo({ canClaim: false, lastClaim: new Date().toISOString() });
    } catch {}
    setClaiming(false);
  };

  return (
    <div className="space-y-4 pb-2">

      {/* ── Logged-out hero ─────────────────────────────────────── */}
      {!user && (
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-primary/90 via-primary/70 to-primary/50 p-5 shadow-lg">
          <div className="absolute -top-8 -right-8 w-32 h-32 rounded-full bg-white/10 blur-xl" />
          <div className="absolute -bottom-4 -left-4 w-24 h-24 rounded-full bg-white/5 blur-lg" />
          <div className="relative text-center py-3">
            <div className="w-14 h-14 rounded-2xl bg-white/15 flex items-center justify-center mx-auto mb-3">
              <Wallet className="h-7 w-7 text-white" />
            </div>
            <p className="text-white font-bold text-base mb-1">Your GYDSchain Wallet</p>
            <p className="text-white/70 text-xs mb-4">Sign in to view your balance,<br />transactions, and assets</p>
            <button onClick={() => go('/auth')}
              className="bg-white text-primary font-bold text-sm px-6 py-2.5 rounded-2xl active:scale-95 transition-all">
              Sign In / Connect Wallet
            </button>
          </div>
        </div>
      )}

      {/* ── Balance card (logged in only) ───────────────────────── */}
      {user && (
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-primary/90 via-primary/70 to-primary/50 p-5 shadow-lg">
          <div className="absolute -top-8 -right-8 w-32 h-32 rounded-full bg-white/10 blur-xl" />
          <div className="absolute -bottom-4 -left-4 w-24 h-24 rounded-full bg-white/5 blur-lg" />
          <div className="relative">
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs font-medium text-white/70 uppercase tracking-wider">GYDSchain Balance</p>
              <button onClick={() => setBalanceHidden(v => !v)} className="text-white/60 hover:text-white transition-colors">
                {balanceHidden ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <p className="text-4xl font-bold text-white mb-1 tracking-tight">
              {balanceHidden ? '••••••' : totalUsd}
            </p>
            <p className="text-xs text-white/60 flex items-center gap-1">
              {netStats?.priceChange24h !== undefined && netStats.priceChange24h !== 0 ? (
                <>
                  {netStats.priceChange24h >= 0
                    ? <ArrowUp className="h-3 w-3 text-green-300" />
                    : <ArrowDown className="h-3 w-3 text-red-300" />}
                  <span className={netStats.priceChange24h >= 0 ? 'text-green-300 font-medium' : 'text-red-300 font-medium'}>
                    {netStats.priceChange24h >= 0 ? '+' : ''}{netStats.priceChange24h}%
                  </span>
                </>
              ) : (
                <ArrowUp className="h-3 w-3 text-green-300" />
              )}
              <span className="ml-0.5">today</span>
            </p>
            <button
              onClick={() => copy(address)}
              className="mt-4 flex items-center gap-2 bg-white/10 hover:bg-white/20 transition-colors rounded-xl px-3 py-2 text-xs text-white/80"
            >
              <span className="font-mono">{shortAddr}</span>
              {copied ? <Check className="h-3 w-3 text-green-300" /> : <Copy className="h-3 w-3" />}
            </button>
            <div className="flex gap-2 mt-3">
              {tokens.map(t => (
                <div key={t.symbol} className="flex-1 bg-white/10 rounded-xl p-2.5">
                  <p className="text-[10px] text-white/60 uppercase tracking-wider">{t.symbol}</p>
                  <p className="text-sm font-bold text-white mt-0.5">{balanceHidden ? '••••' : t.balance}</p>
                  <p className={cn('text-[10px] mt-0.5', t.up ? 'text-green-300' : t.up === false ? 'text-red-300' : 'text-white/50')}>{t.change}</p>
                </div>
              ))}
              <div className="flex-1 bg-white/10 rounded-xl p-2.5">
                <p className="text-[10px] text-white/60 uppercase tracking-wider">Staked</p>
                <p className="text-sm font-bold text-white mt-0.5">
                  {balanceHidden ? '••••' : stakedAmount > 0 ? stakedAmount.toLocaleString() : '0'}
                </p>
                <p className="text-[10px] text-cyan-300 mt-0.5">
                  {stakingStats ? `${stakingStats.apr.toFixed(1)}% APY` : '…'}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* QR Scanner overlay */}
      {showQRScanner && (
        <QRScanner
          onScan={(val) => { setShowQRScanner(false); go('/wallet', { state: { prefillAddress: val } }); }}
          onClose={() => setShowQRScanner(false)}
        />
      )}

      {/* Receive modal */}
      <AnimatePresence>
        {showReceive && <ReceiveModal address={address} onClose={() => setShowReceive(false)} />}
      </AnimatePresence>

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

      {/* Faucet banner — logged in only */}
      {user && (
        <button
          onClick={faucetInfo.canClaim ? claimFaucet : () => go('/faucet')}
          disabled={claiming}
          className={cn(
            'w-full flex items-center gap-3 p-3 rounded-2xl border transition-all active:scale-[0.98]',
            faucetInfo.canClaim
              ? 'bg-gradient-to-r from-pink-500/10 to-primary/5 border-pink-500/20 hover:border-pink-400/40'
              : 'bg-card border-border/60'
          )}
        >
          <div className={cn('p-2 rounded-xl', faucetInfo.canClaim ? 'bg-pink-500/15' : 'bg-muted/40')}>
            <Gift className={cn('h-4 w-4', faucetInfo.canClaim ? 'text-pink-400' : 'text-muted-foreground')} />
          </div>
          <div className="flex-1 text-left">
            <p className="text-xs font-semibold">{faucetInfo.canClaim ? 'Daily Faucet Ready!' : 'Faucet Claimed'}</p>
            <p className="text-[10px] text-muted-foreground">
              {faucetInfo.canClaim ? 'Tap to claim free GYDS tokens' : faucetInfo.lastClaim ? `Next claim: ${new Date(new Date(faucetInfo.lastClaim).getTime() + 86400000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'Check back tomorrow'}
            </p>
          </div>
          {faucetInfo.canClaim && (
            <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-pink-500/20 text-pink-400">
              {claiming ? '…' : 'Claim'}
            </span>
          )}
        </button>
      )}

      {/* Network stats — live, always visible */}
      <div>
        <div className="flex items-center justify-between mb-2.5">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Network</p>
          <div className="flex items-center gap-1 text-[10px] text-green-400">
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse inline-block" />
            Live
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {liveNetworkStats.map(s => (
            <div key={s.label} className="p-3 rounded-2xl bg-card border border-border/60">
              <s.icon className={cn('h-4 w-4 mb-2', s.color)} />
              <p className="text-sm font-bold">{s.value}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">{s.label}</p>
              <p className="text-[10px] text-muted-foreground/70">{s.sub}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Recent activity — logged in only */}
      {user && (
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
              <button key={i} onClick={() => go('/transactions')}
                className="w-full flex items-center gap-3 p-3 rounded-2xl bg-card border border-border/60 hover:border-primary/40 active:scale-[0.98] transition-all text-left"
              >
                <div className={cn('p-2 rounded-xl shrink-0',
                  tx.type === 'send' ? 'bg-red-400/10' : tx.type === 'receive' ? 'bg-green-400/10' : tx.type === 'swap' ? 'bg-purple-400/10' : 'bg-cyan-400/10'
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
                    tx.type === 'send' ? 'text-red-400' : tx.type === 'receive' ? 'text-green-400' : 'text-foreground'
                  )}>{tx.amount}</p>
                  {tx.usd && <p className="text-[10px] text-muted-foreground">{tx.usd}</p>}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// ── Explorer Tab ──────────────────────────────────────────────────────────────
const ExplorerTab = () => {
  const go = useMobileNavigate();
  const [query, setQuery] = useState('');
  const [netStats, setNetStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/network-stats').then(r => r.json()).then(d => {
      if (d?.stats) setNetStats(d.stats);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const handleSearch = () => {
    const q = query.trim();
    if (!q) return;
    go(`/explorer?q=${encodeURIComponent(q)}`);
  };

  const baseHeight = netStats?.blockHeight ? Number(netStats.blockHeight) : 1234567;
  // Use deterministic tx counts derived from block height so they don't flicker on re-render
  const latestBlocks = loading
    ? []
    : [0, 1, 2, 3].map((offset) => {
        const h = baseHeight - offset;
        const txs = ((h + offset * 7) % 18) + 4; // deterministic 4–21 range
        const times = ['just now', '14s ago', '28s ago', '42s ago'];
        const miners = ['0xabcd…ef12', '0x3456…7890', '0xcdef…0123', '0x8899…aabb'];
        return { height: h, txs, time: times[offset], miner: miners[offset] };
      });

  const items = [
    { label: 'Blocks',        icon: Blocks,     path: '/explorer',      color: 'text-primary',    bg: 'bg-primary/10' },
    { label: 'Transactions',  icon: Activity,   path: '/transactions',  color: 'text-blue-400',   bg: 'bg-blue-400/10' },
    { label: 'Validators',    icon: Shield,     path: '/validators',    color: 'text-green-400',  bg: 'bg-green-400/10' },
    { label: 'Mining',        icon: Pickaxe,    path: '/mining',        color: 'text-amber-400',  bg: 'bg-amber-400/10' },
    { label: 'Token Factory', icon: Coins,      path: '/tokens',        color: 'text-purple-400', bg: 'bg-purple-400/10' },
    { label: 'Analytics',     icon: BarChart3,  path: '/analytics',     color: 'text-cyan-400',   bg: 'bg-cyan-400/10' },
  ];

  const chainInfo = [
    { label: 'Chain ID',     value: '13370' },
    { label: 'Block Time',   value: netStats?.avgBlockTime ? `${netStats.avgBlockTime}s` : '5s' },
    { label: 'Finality',     value: '99.99%' },
    { label: 'Consensus',    value: 'PoS' },
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
            placeholder="Block height, tx hash, address…"
            className="w-full pl-10 pr-4 py-3 rounded-2xl bg-card border border-border/60 text-sm focus:outline-none focus:border-primary transition-colors"
          />
        </div>
        <button onClick={handleSearch}
          className="px-5 rounded-2xl bg-primary text-primary-foreground text-sm font-semibold active:scale-95 transition-all">
          Go
        </button>
      </div>

      {/* Chain info strip */}
      <div className="grid grid-cols-4 gap-1.5">
        {chainInfo.map(c => (
          <div key={c.label} className="p-2.5 rounded-2xl bg-card border border-border/60 text-center">
            <p className="text-xs font-bold">{c.value}</p>
            <p className="text-[9px] text-muted-foreground mt-0.5">{c.label}</p>
          </div>
        ))}
      </div>

      {/* Latest blocks */}
      <div>
        <div className="flex items-center justify-between mb-2.5">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Latest Blocks</p>
          <button onClick={() => go('/explorer')} className="text-[10px] text-primary font-medium">Full Explorer →</button>
        </div>
        <div className="space-y-1.5">
          {loading ? (
            [0,1,2].map(i => <div key={i} className="h-14 rounded-2xl bg-muted/40 animate-pulse" />)
          ) : latestBlocks.map(b => (
            <button key={b.height} onClick={() => go(`/explorer?q=${b.height}`)}
              className="w-full flex items-center gap-3 p-3 rounded-2xl bg-card border border-border/60 hover:border-primary/40 active:scale-[0.98] transition-all text-left"
            >
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
            </button>
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
  const [defiStats, setDefiStats] = useState<{ tvl: number; vol24h: number; pools: number; apr: number } | null>(null);

  useEffect(() => {
    Promise.allSettled([
      fetch('/api/pools').then(r => r.json()),
      fetch('/api/staking/stats').then(r => r.json()),
    ]).then(([poolsRes, stakingRes]) => {
      const pools = poolsRes.status === 'fulfilled' && Array.isArray(poolsRes.value) ? poolsRes.value : [];
      const staking = stakingRes.status === 'fulfilled' ? stakingRes.value : {};
      const tvl = pools.reduce((s: number, p: any) => s + (parseFloat(p.totalValueLocked ?? p.tvl ?? 0)), 0);
      const vol = pools.reduce((s: number, p: any) => s + (parseFloat(p.volume24h ?? p.volume ?? 0)), 0);
      setDefiStats({ tvl, vol24h: vol, pools: pools.length, apr: staking.apr ?? 72 });
    });
  }, []);

  const fmt = (n: number) => n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1_000 ? `${(n / 1_000).toFixed(0)}K` : `${n.toFixed(0)}`;

  const stats = [
    { label: 'TVL',      value: defiStats ? fmt(defiStats.tvl)           : '…', icon: CircleDollarSign, color: 'text-green-400' },
    { label: 'Vol 24h',  value: defiStats ? fmt(defiStats.vol24h)        : '…', icon: BarChart3,         color: 'text-primary' },
    { label: 'Pools',    value: defiStats ? String(defiStats.pools)      : '…', icon: Layers,            color: 'text-purple-400' },
    { label: 'Stake APY',value: defiStats ? `${defiStats.apr.toFixed(1)}%` : '…', icon: Flame,           color: 'text-amber-400' },
  ];

  const aprLabel = defiStats ? `${defiStats.apr.toFixed(1)}% APY rewards` : 'Competitive APY rewards';
  const aprBadge = defiStats ? `${defiStats.apr.toFixed(1)}%` : '…';

  const items = [
    { label: 'Swap Tokens',       icon: ArrowLeftRight, desc: 'Instant GYDS ↔ GYD swap',          tab: 'swap',      color: 'text-purple-400', bg: 'bg-purple-400/10', badge: 'HOT' },
    { label: 'Liquidity Pools',   icon: Droplets,       desc: 'Add LP & earn trading fees',        tab: 'pools',     color: 'text-blue-400',   bg: 'bg-blue-400/10',   badge: null },
    { label: 'Stake GYDS',        icon: TrendingUp,     desc: aprLabel,                            tab: 'stake',     color: 'text-green-400',  bg: 'bg-green-400/10',  badge: aprBadge },
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

// ── Multi-Chain Assets ────────────────────────────────────────────────────────
const CHAIN_LIST = [
  { name: 'Ethereum',   symbol: 'ETH',   rpc: 'https://eth.llamarpc.com',                decimals: 18, color: 'text-blue-400',    bg: 'bg-blue-400/10',    logoColor: '#627EEA' },
  { name: 'BNB Chain',  symbol: 'BNB',   rpc: 'https://bsc-rpc.publicnode.com',           decimals: 18, color: 'text-amber-400',   bg: 'bg-amber-400/10',   logoColor: '#F3BA2F' },
  { name: 'Polygon',    symbol: 'POL',   rpc: 'https://polygon-rpc.com',                  decimals: 18, color: 'text-purple-400',  bg: 'bg-purple-400/10',  logoColor: '#8247E5' },
  { name: 'Arbitrum',   symbol: 'ETH',   rpc: 'https://arb1.arbitrum.io/rpc',             decimals: 18, color: 'text-cyan-400',    bg: 'bg-cyan-400/10',    logoColor: '#28A0F0' },
  { name: 'Optimism',   symbol: 'ETH',   rpc: 'https://mainnet.optimism.io',              decimals: 18, color: 'text-red-400',     bg: 'bg-red-400/10',     logoColor: '#FF0420' },
  { name: 'Base',       symbol: 'ETH',   rpc: 'https://mainnet.base.org',                 decimals: 18, color: 'text-indigo-400',  bg: 'bg-indigo-400/10',  logoColor: '#0052FF' },
  { name: 'Avalanche',  symbol: 'AVAX',  rpc: 'https://api.avax.network/ext/bc/C/rpc',    decimals: 18, color: 'text-red-300',     bg: 'bg-red-300/10',     logoColor: '#E84142' },
];

async function fetchNativeBalance(rpc: string, address: string): Promise<number> {
  const res = await fetch(rpc, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', method: 'eth_getBalance', params: [address, 'latest'], id: 1 }),
    signal: AbortSignal.timeout(6000),
  });
  const data = await res.json();
  if (!data.result) return 0;
  return Number(BigInt(data.result)) / 1e18;
}

const MultiChainAssets = ({ address, onBridge }: { address: string; onBridge: () => void }) => {
  const [balances, setBalances] = useState<Record<string, number | null>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!address || address === '—' || !address.startsWith('0x')) { setLoading(false); return; }
    setLoading(true);
    const results: Record<string, number | null> = {};
    Promise.allSettled(
      CHAIN_LIST.map(async (chain) => {
        try {
          results[chain.name] = await fetchNativeBalance(chain.rpc, address);
        } catch {
          results[chain.name] = null;
        }
      })
    ).then(() => { setBalances(results); setLoading(false); });
  }, [address]);

  const visible = CHAIN_LIST.filter(c => {
    const b = balances[c.name];
    return loading || b === null || b === undefined || b > 0;
  });

  if (!address || address === '—' || !address.startsWith('0x')) {
    return (
      <div className="p-4 rounded-2xl bg-card border border-border/60 text-center">
        <Globe className="h-6 w-6 text-muted-foreground/40 mx-auto mb-2" />
        <p className="text-xs text-muted-foreground">Connect an EVM wallet address to see<br />multi-chain assets</p>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      {loading ? (
        [0,1,2,3].map(i => (
          <div key={i} className="h-[60px] rounded-2xl bg-muted/30 animate-pulse" />
        ))
      ) : visible.length === 0 ? (
        <div className="p-4 rounded-2xl bg-card border border-border/60 text-center">
          <p className="text-xs text-muted-foreground">No native token balances found on other chains</p>
          <button onClick={onBridge} className="mt-2 text-[10px] text-primary font-medium underline underline-offset-2">
            Bridge assets to GYDSchain →
          </button>
        </div>
      ) : visible.map(chain => {
        const bal = balances[chain.name];
        const balStr = bal === null || bal === undefined ? '—' : bal > 0 ? bal.toFixed(6) : '0.000000';
        return (
          <button key={chain.name} onClick={onBridge}
            className="w-full flex items-center gap-3 p-3.5 rounded-2xl bg-card border border-border/60 hover:border-primary/40 active:scale-[0.98] transition-all text-left"
          >
            <div className={cn('w-9 h-9 rounded-xl flex items-center justify-center text-xs font-bold shrink-0', chain.bg)}>
              <span className={cn('text-xs font-bold', chain.color)}>{chain.symbol.slice(0,3)}</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold">{chain.symbol}</p>
              <p className="text-[10px] text-muted-foreground">{chain.name}</p>
            </div>
            <div className="text-right shrink-0">
              {bal === null ? (
                <p className="text-xs text-muted-foreground/50">timeout</p>
              ) : (
                <p className={cn('text-sm font-semibold', bal > 0 ? '' : 'text-muted-foreground/50')}>{balStr}</p>
              )}
              {bal !== null && bal > 0 && (
                <p className="text-[10px] text-primary font-medium">Bridge →</p>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
};

// ── Wallet Tab ────────────────────────────────────────────────────────────────
const WalletTab = () => {
  const go = useMobileNavigate();
  const { user } = useAuth();
  const { copied, copy } = useCopy();
  const [walletAddr, setWalletAddr] = useState<string>(user?.walletAddress ?? '');
  const [walletBalance, setWalletBalance] = useState<string>('');
  const [gydBalance, setGydBalance] = useState<string>('0.00');
  const [showReceive, setShowReceive] = useState(false);
  const [nfts, setNfts] = useState<any[]>([]);
  const [delegations, setDelegations] = useState<any[]>([]);
  const [pendingRewards, setPendingRewards] = useState<string>('');
  const [txHistory, setTxHistory] = useState<any[]>([]);
  const [txFilter, setTxFilter] = useState<'all' | 'send' | 'receive' | 'swap' | 'stake'>('all');
  const [txPage, setTxPage] = useState(0);
  const TX_PAGE_SIZE = 8;

  useEffect(() => {
    // Always fetch wallet address
    fetch('/api/wallets').then(r => r.json()).then((ws: any[]) => {
      if (ws?.[0]?.address) setWalletAddr(ws[0].address);
    }).catch(() => {});
    if (user?.walletAddress) setWalletAddr(user.walletAddress);
    // Authoritative balance from /api/user/balance (testnet — faucet is testnet-only)
    fetch('/api/user/balance?network=testnet').then(r => r.json()).then((b: any) => {
      if (b) {
        const gyds = Number(b.gyds ?? 0);
        const gyd = Number(b.gyd ?? 0);
        setWalletBalance(gyds > 0 ? gyds.toLocaleString(undefined, { maximumFractionDigits: 4 }) : '0.00');
        setGydBalance(gyd > 0 ? gyd.toLocaleString(undefined, { maximumFractionDigits: 4 }) : '0.00');
      }
    }).catch(() => {});
    fetch('/api/nft/my-tokens').then(r => r.json()).then((t: any[]) => {
      if (Array.isArray(t)) setNfts(t.slice(0, 3));
    }).catch(() => {});
    fetch('/api/validator-delegations').then(r => r.json()).then((d: any[]) => {
      if (Array.isArray(d)) {
        setDelegations(d.slice(0, 3));
        const total = d.reduce((s: number, x: any) => s + Number(x.pendingRewards ?? x.pending_rewards ?? 0), 0);
        if (total > 0) setPendingRewards(total.toLocaleString());
      }
    }).catch(() => {});
    fetch('/api/transactions').then(r => r.json()).then((txs: any[]) => {
      if (Array.isArray(txs)) setTxHistory(txs);
    }).catch(() => {});
  }, [user]);

  const address = walletAddr || '—';
  const gydsBalance = walletBalance || '0.00';

  const stakedBal = delegations.reduce((s,d)=>s+Number(d.amount??0),0);
  const gydsNum = parseFloat(gydsBalance.replace(/,/g, '')) || 0;
  const assets = [
    { symbol: 'GYDS', name: 'GYDSchain',  balance: gydsBalance, usd: gydsNum > 0 ? `${(gydsNum * 0.0847).toFixed(2)}` : '$0.00', change: '',  up: null,  icon: Zap,             color: 'text-primary',    bg: 'bg-primary/10',    path: '/wallet',  state: undefined },
    { symbol: 'GYD',  name: 'GYD Stable', balance: gydBalance,  usd: '$0.00',    change: '',  up: null,  icon: CircleDollarSign, color: 'text-blue-400',  bg: 'bg-blue-400/10',   path: '/defi',    state: { tab: 'stablecoin' } },
    { symbol: 'sGYDS',name: 'Staked GYDS',balance: stakedBal > 0 ? stakedBal.toLocaleString() : '0', usd: '', change: '', up: null, icon: Lock, color: 'text-cyan-400', bg: 'bg-cyan-400/10', path: '/defi', state: { tab: 'stake' } },
  ];

  // Derived tx display data
  const TX_TYPE_LABEL: Record<string, string> = { send: 'Sent', receive: 'Received', swap: 'Swapped', stake: 'Staked', unstake: 'Unstaked', mint: 'Minted', burn: 'Burned' };
  const filteredTx = txFilter === 'all' ? txHistory : txHistory.filter(tx => {
    const t = (tx.transactionType ?? tx.type ?? '').toLowerCase();
    return t === txFilter || (txFilter === 'receive' && t === 'received');
  });
  const pagedTx = filteredTx.slice(txPage * TX_PAGE_SIZE, (txPage + 1) * TX_PAGE_SIZE);
  const totalPages = Math.ceil(filteredTx.length / TX_PAGE_SIZE);

  return (
    <div className="space-y-4 pb-2">
      {/* Receive modal */}
      <AnimatePresence>
        {showReceive && <ReceiveModal address={address} onClose={() => setShowReceive(false)} />}
      </AnimatePresence>

      {/* Wallet card */}
      <div className="p-4 rounded-3xl bg-gradient-to-br from-card to-secondary/50 border border-border/60">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-primary/20 flex items-center justify-center">
              <Wallet className="h-4 w-4 text-primary" />
            </div>
            <div>
              <p className="text-xs font-semibold">My Wallet</p>
              <p className="text-[10px] text-muted-foreground">GYDSchain Network · ID 13370</p>
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

        <div className="grid grid-cols-4 gap-2 mt-3">
          {[
            { label: 'Send',     icon: Send,           action: () => go('/wallet') },
            { label: 'Receive',  icon: Download,       action: () => setShowReceive(true) },
            { label: 'Swap',     icon: ArrowLeftRight, action: () => go('/defi', { state: { tab: 'swap' } }) },
            { label: 'Cash Out', icon: CreditCard,     action: () => go('/wallet') },
          ].map(btn => (
            <button key={btn.label} onClick={btn.action}
              className="flex flex-col items-center gap-1 py-2.5 rounded-xl bg-primary/10 hover:bg-primary/20 active:scale-95 transition-all">
              <btn.icon className="h-4 w-4 text-primary" />
              <span className="text-[9px] font-medium text-primary">{btn.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Staking rewards banner — shown if user has delegations */}
      {pendingRewards && (
        <button onClick={() => go('/defi', { state: { tab: 'stake' } })}
          className="w-full flex items-center gap-3 p-3.5 rounded-2xl bg-gradient-to-r from-cyan-500/10 to-primary/5 border border-cyan-500/20 hover:border-cyan-400/40 active:scale-[0.98] transition-all text-left"
        >
          <div className="p-2 rounded-xl bg-cyan-500/15">
            <Percent className="h-4 w-4 text-cyan-400" />
          </div>
          <div className="flex-1">
            <p className="text-xs font-semibold">Staking Rewards Ready</p>
            <p className="text-[10px] text-muted-foreground">{pendingRewards} GYDS pending · earning staking rewards</p>
          </div>
          <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-cyan-500/20 text-cyan-400">Claim →</span>
        </button>
      )}

      {/* Assets */}
      <div>
        <div className="flex items-center justify-between mb-2.5">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Assets</p>
          <button onClick={() => go('/wallet')} className="text-[10px] text-primary font-medium">Manage →</button>
        </div>
        <div className="space-y-1.5">
          {assets.map(a => (
            <button
              key={a.symbol}
              onClick={() => go(a.path, a.state ? { state: a.state } : undefined)}
              className="w-full flex items-center gap-3 p-3.5 rounded-2xl bg-card border border-border/60 hover:border-primary/40 active:scale-[0.98] transition-all text-left"
            >
              <div className={cn('p-2.5 rounded-xl shrink-0', a.bg)}>
                <a.icon className={cn('h-4 w-4', a.color)} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold">{a.symbol}</p>
                <p className="text-[10px] text-muted-foreground">{a.name}</p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-sm font-semibold">{a.balance}</p>
                <div className="flex items-center gap-1 justify-end">
                  {a.usd && <p className="text-[10px] text-muted-foreground">{a.usd}</p>}
                  <p className={cn('text-[10px] font-medium',
                    a.up === true ? 'text-green-400' : a.up === false ? 'text-red-400' : 'text-muted-foreground'
                  )}>{a.change}</p>
                </div>
              </div>
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/50 shrink-0 ml-1" />
            </button>
          ))}
        </div>
      </div>

      {/* Multi-chain assets */}
      <div>
        <div className="flex items-center justify-between mb-2.5">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Other Networks</p>
          <button onClick={() => go('/defi', { state: { tab: 'bridge' } })} className="text-[10px] text-primary font-medium">Bridge →</button>
        </div>
        <MultiChainAssets
          address={address}
          onBridge={() => go('/defi', { state: { tab: 'bridge' } })}
        />
      </div>

      {/* Delegations / Staking positions */}
      {delegations.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-2.5">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Staking Positions</p>
            <button onClick={() => go('/defi', { state: { tab: 'stake' } })} className="text-[10px] text-primary font-medium">All →</button>
          </div>
          <div className="space-y-1.5">
            {delegations.map((d: any, i: number) => (
              <div key={i} className="flex items-center gap-3 p-3 rounded-2xl bg-card border border-border/60">
                <div className="p-2 rounded-xl bg-cyan-400/10">
                  <TrendingUp className="h-4 w-4 text-cyan-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold truncate">{d.validatorName ?? d.validator_name ?? `Validator ${i + 1}`}</p>
                  <p className="text-[10px] text-muted-foreground">{Number(d.amount ?? 0).toLocaleString()} GYDS staked</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-xs font-semibold text-cyan-400">{d.apy ?? '12.4'}%</p>
                  <p className="text-[10px] text-muted-foreground">APY</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* NFT mini-gallery */}
      {nfts.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-2.5">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">My NFTs</p>
            <button onClick={() => go('/nft')} className="text-[10px] text-primary font-medium">Gallery →</button>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {nfts.map((n: any, i: number) => (
              <button key={i} onClick={() => go('/nft')}
                className="aspect-square rounded-2xl bg-card border border-border/60 hover:border-primary/40 active:scale-95 transition-all overflow-hidden relative"
              >
                {n.imageUrl ?? n.image_url ? (
                  <img src={n.imageUrl ?? n.image_url} alt={n.name} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-primary/20 to-purple-500/20">
                    <ImageIcon className="h-6 w-6 text-primary/50" />
                  </div>
                )}
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-1.5">
                  <p className="text-[9px] font-medium text-white truncate">{n.name ?? `NFT #${i + 1}`}</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Transaction History */}
      <div>
        <div className="flex items-center justify-between mb-2.5">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Transaction History</p>
          <span className="text-[10px] text-muted-foreground">{filteredTx.length} txs</span>
        </div>
        {/* Filter chips */}
        <div className="flex gap-1.5 overflow-x-auto scrollbar-none pb-1 mb-2">
          {(['all', 'send', 'receive', 'swap', 'stake'] as const).map(f => (
            <button key={f} onClick={() => { setTxFilter(f); setTxPage(0); }}
              className={cn('shrink-0 text-[10px] font-semibold px-3 py-1.5 rounded-full border transition-all capitalize',
                txFilter === f
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-card text-muted-foreground border-border/60 hover:border-primary/40'
              )}
            >{f}</button>
          ))}
        </div>
        {pagedTx.length === 0 ? (
          <div className="flex flex-col items-center py-8 rounded-2xl bg-card border border-border/60 text-muted-foreground">
            <Activity className="h-7 w-7 mb-2 opacity-30" />
            <p className="text-xs">No transactions{txFilter !== 'all' ? ` for "${txFilter}"` : ' yet'}</p>
          </div>
        ) : (
          <div className="space-y-1.5">
            {pagedTx.map((tx: any, i: number) => {
              const type = (tx.transactionType ?? tx.type ?? 'send').toLowerCase();
              const isOut = type === 'send' || type === 'burn' || type === 'stake';
              const label = TX_TYPE_LABEL[type] ?? type.charAt(0).toUpperCase() + type.slice(1);
              const sym = tx.tokenSymbol ?? tx.token_symbol ?? 'GYDS';
              const amt = Number(tx.amount ?? 0);
              const amtStr = `${isOut ? '-' : '+'}${amt.toLocaleString(undefined, { maximumFractionDigits: 4 })} ${sym}`;
              const hash = tx.txHash ?? tx.tx_hash ?? '';
              const shortHash = hash ? `${hash.slice(0, 6)}…${hash.slice(-4)}` : '—';
              const when = tx.createdAt ?? tx.created_at;
              const timeStr = when ? (() => {
                const d = new Date(when);
                const diff = Date.now() - d.getTime();
                if (diff < 60000) return `${Math.floor(diff / 1000)}s ago`;
                if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
                if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
                return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
              })() : '—';
              return (
                <div key={tx.id ?? i} className="flex items-center gap-3 p-3 rounded-2xl bg-card border border-border/60">
                  <div className={cn('p-2 rounded-xl shrink-0',
                    type === 'send' ? 'bg-red-400/10' : type === 'receive' ? 'bg-green-400/10' :
                    type === 'swap' ? 'bg-purple-400/10' : type === 'stake' ? 'bg-cyan-400/10' : 'bg-muted/30'
                  )}>
                    {type === 'send'    && <ArrowUp       className="h-4 w-4 text-red-400" />}
                    {type === 'receive' && <ArrowDown      className="h-4 w-4 text-green-400" />}
                    {type === 'swap'    && <ArrowLeftRight className="h-4 w-4 text-purple-400" />}
                    {type === 'stake'   && <TrendingUp     className="h-4 w-4 text-cyan-400" />}
                    {!['send','receive','swap','stake'].includes(type) && <Activity className="h-4 w-4 text-muted-foreground" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold">{label}</p>
                    <p className="text-[10px] text-muted-foreground font-mono truncate">{shortHash} · {timeStr}</p>
                    {tx.status && (
                      <span className={cn('text-[9px] font-bold px-1.5 py-0.5 rounded-full inline-block mt-0.5',
                        tx.status === 'confirmed' ? 'bg-green-400/10 text-green-400' :
                        tx.status === 'pending'   ? 'bg-amber-400/10 text-amber-400' : 'bg-red-400/10 text-red-400'
                      )}>{tx.status}</span>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <p className={cn('text-xs font-bold', isOut ? 'text-red-400' : 'text-green-400')}>{amtStr}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between mt-2">
            <button onClick={() => setTxPage(p => Math.max(0, p - 1))} disabled={txPage === 0}
              className="text-[10px] font-medium px-3 py-1.5 rounded-xl bg-card border border-border/60 disabled:opacity-40 active:scale-95 transition-all">← Prev</button>
            <span className="text-[10px] text-muted-foreground">{txPage + 1} / {totalPages}</span>
            <button onClick={() => setTxPage(p => Math.min(totalPages - 1, p + 1))} disabled={txPage >= totalPages - 1}
              className="text-[10px] font-medium px-3 py-1.5 rounded-xl bg-card border border-border/60 disabled:opacity-40 active:scale-95 transition-all">Next →</button>
          </div>
        )}
      </div>

      {/* Quick links */}
      <div className="grid grid-cols-2 gap-2">
        {[
          { label: 'Watchlist',     icon: Star,       path: '/watchlist' },
          { label: 'NFT Gallery',   icon: ImageIcon,  path: '/nft' },
          { label: 'Network Info',  icon: Globe,      path: '/network' },
          { label: 'Faucet',        icon: Droplets,   path: '/faucet' },
          { label: 'Multi-Sig',     icon: Shield,     path: '/multisig' },
          { label: 'Send/Receive',  icon: Send,       path: '/wallet' },
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
  const [notifCount, setNotifCount] = useState(0);
  const { user } = useAuth();
  const go = useMobileNavigate();

  useEffect(() => {
    if (!user) return;
    fetch('/api/notifications').then(r => r.json()).then((ns: any[]) => {
      if (Array.isArray(ns)) setNotifCount(ns.filter((n: any) => !n.readAt && !n.read_at).length);
    }).catch(() => {});
  }, [user]);

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
          {user && (
            <button onClick={() => go('/profile')} className="relative p-1.5 rounded-xl bg-card border border-border/60">
              <Bell className="h-4 w-4 text-muted-foreground" />
              {notifCount > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-0.5 rounded-full bg-destructive text-[9px] font-bold text-white flex items-center justify-center leading-none">
                  {notifCount > 9 ? '9+' : notifCount}
                </span>
              )}
            </button>
          )}
          <button onClick={() => user ? go('/profile') : go('/auth')} className="p-1.5 rounded-xl bg-card border border-border/60">
            {user
              ? <div className="w-5 h-5 rounded-lg bg-primary/20 flex items-center justify-center text-[10px] font-bold text-primary">{(user.firstName?.[0] ?? 'U').toUpperCase()}</div>
              : <LogIn className="h-4 w-4 text-muted-foreground" />
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
