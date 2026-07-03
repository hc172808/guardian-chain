import { useState, useEffect } from 'react';
import { Layout } from '@/components/layout/Layout';
import { RequireAuth } from '@/components/auth/RequireAuth';
import { GlassCard } from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { motion } from 'framer-motion';
import { 
  Wallet as WalletIcon, 
  Plus, 
  Download, 
  Upload, 
  Eye, 
  EyeOff, 
  Copy, 
  Trash2,
  Key,
  Lock,
  Coins,
  ArrowUpDown,
  TrendingUp,
  Loader2,
  Send,
  ArrowRight,
  RefreshCw,
  Shield,
  ShieldCheck,
  ShieldAlert,
  ArrowRightLeft,
  Layers,
  Banknote,
  ShoppingCart,
  ArrowDownLeft,
  ArrowUpRight,
  CreditCard,
  Smartphone,
  Building,
  DollarSign,
  Info
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { api } from '@/lib/api';
import { useCurrency } from '@/contexts/CurrencyContext';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FounderWalletConfig } from '@/components/wallet/FounderWalletConfig';
import { cn } from '@/lib/utils';
import { useNavigate, useLocation } from 'react-router-dom';
import { Web3ConnectModal } from '@/components/Web3ConnectModal';
import { QRScanner } from '@/components/wallet/QRScanner';
import { useRpcBalance } from '@/hooks/useRpcBalance';
import { QrCode, Wifi, WifiOff, Activity, CheckCircle2, Clock, XCircle, ExternalLink } from 'lucide-react';

interface WalletData {
  id: string;
  address: string;
  created_at: string;
}

interface TokenBalance {
  symbol: string;
  name: string;
  balance: number;
  value: number;
  price: number;
  change24h: number;
  decimals?: number;
  logo?: string;
}

import {
  generateSecureWallet,
  walletFromSeed,
  hashPin,
  verifyPin,
  encryptWithPin,
  decryptWithPin,
  rotatePin,
  enablePinLock,
  disablePinLock,
  isPinLockEnabled,
  verifyPinLock,
  getPinLockStatus,
} from '@/lib/walletCrypto';
import {
  isBiometricAvailable,
  isBiometricEnabled,
  registerBiometric,
  authenticateBiometric,
  disableBiometric,
} from '@/lib/biometric';
import { Fingerprint } from 'lucide-react';
import { LedgerConnect } from '@/components/wallet/LedgerConnect';

const WalletContent = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, isFounder } = useAuth();
  const { toast } = useToast();
  const [wallets, setWallets] = useState<WalletData[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedNetwork, setSelectedNetwork] = useState<string>(
    () => localStorage.getItem('gyds_network') || 'Testnet'
  );
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [viewSeedDialogOpen, setViewSeedDialogOpen] = useState(false);
  const [selectedWallet, setSelectedWallet] = useState<string | null>(null);
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [importSeed, setImportSeed] = useState('');
  const [revealedSeed, setRevealedSeed] = useState<string | null>(null);
  const [newWalletData, setNewWalletData] = useState<{ address: string; seedPhrase: string } | null>(null);
  const [balances, setBalances] = useState<TokenBalance[]>([]);
  const [balancesLoading, setBalancesLoading] = useState(true);
  const [sendDialogOpen, setSendDialogOpen] = useState(false);
  const [sendAsset, setSendAsset] = useState<string>('GYD');
  const [sendTo, setSendTo] = useState('');
  const [sendAmount, setSendAmount] = useState('');
  const [sendLoading, setSendLoading] = useState(false);
  const [linkWalletOpen, setLinkWalletOpen] = useState(false);
  const [showQRScanner, setShowQRScanner] = useState(false);

  // PIN rotation state
  const [rotatePinDialogOpen, setRotatePinDialogOpen] = useState(false);
  const [rotateWalletId, setRotateWalletId] = useState<string | null>(null);
  const [oldPin, setOldPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmNewPin, setConfirmNewPin] = useState('');
  const [rotateLoading, setRotateLoading] = useState(false);

  // PIN lock state
  const [cashOutOpen, setCashOutOpen] = useState(false);
  const [cashOutAsset, setCashOutAsset] = useState('GYD');
  const [cashOutAmount, setCashOutAmount] = useState('');
  const [cashOutDest, setCashOutDest] = useState('');
  const [cashOutNote, setCashOutNote] = useState('');
  const [cashOutLoading, setCashOutLoading] = useState(false);
  const [cashOutPaymentMethod, setCashOutPaymentMethod] = useState('');

  // Buy tokens state
  const [buyOpen, setBuyOpen] = useState(false);
  const [buyToken, setBuyToken] = useState('GYD');
  const [buyAmount, setBuyAmount] = useState('');
  const [buyFiat, setBuyFiat] = useState('');
  const [buyPaymentMethod, setBuyPaymentMethod] = useState<any>(null);
  const [buyNote, setBuyNote] = useState('');
  const [buyLoading, setBuyLoading] = useState(false);
  const [buyStep, setBuyStep] = useState<'select' | 'confirm' | 'done'>('select');
  const [buyReference, setBuyReference] = useState('');

  // Payment methods
  const [paymentMethods, setPaymentMethods] = useState<any[]>([]);

  // Activity / transaction state
  const [activityTxList, setActivityTxList] = useState<any[]>([]);
  const [activityLoading, setActivityLoading] = useState(false);
  const [selectedTx, setSelectedTx] = useState<any | null>(null);
  const [txDetailOpen, setTxDetailOpen] = useState(false);

  const loadPaymentMethods = async () => {
    try {
      const res = await fetch('/api/payment-methods', { credentials: 'include' });
      if (res.ok) setPaymentMethods(await res.json());
    } catch {}
  };

  const loadActivity = async () => {
    if (!user) return;
    setActivityLoading(true);
    try {
      const [txRes, cashoutRes, buyRes] = await Promise.all([
        fetch('/api/transactions', { credentials: 'include' }),
        fetch('/api/wallet/cashouts', { credentials: 'include' }),
        fetch('/api/buy-tokens', { credentials: 'include' }),
      ]);
      const txs = txRes.ok ? await txRes.json() : [];
      const cashouts = cashoutRes.ok ? await cashoutRes.json() : [];
      const buys = buyRes.ok ? await buyRes.json() : [];
      const combined: any[] = [
        ...txs.map((t: any) => ({ ...t, _kind: 'tx' })),
        ...cashouts.map((c: any) => ({ ...c, _kind: 'cashout' })),
        ...buys.map((b: any) => ({ ...b, _kind: 'buy' })),
      ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      setActivityTxList(combined);
    } finally { setActivityLoading(false); }
  };

  const handleCashOut = async () => {
    if (!cashOutAmount || !cashOutDest || !cashOutPaymentMethod) return;
    setCashOutLoading(true);
    try {
      const res = await fetch('/api/wallet/cashout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ asset: cashOutAsset, amount: cashOutAmount, destination: cashOutDest, note: cashOutNote, payment_method: cashOutPaymentMethod }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Cash out failed');
      toast({ title: 'Cash out request submitted', description: `Reference: ${data.reference}` });
      setCashOutOpen(false);
      setCashOutAmount(''); setCashOutDest(''); setCashOutNote(''); setCashOutPaymentMethod('');
      loadActivity();
    } catch (e: any) {
      toast({ title: 'Cash out failed', description: e.message, variant: 'destructive' });
    } finally {
      setCashOutLoading(false);
    }
  };

  const handleBuySubmit = async () => {
    if (!buyAmount || !buyPaymentMethod) return;
    setBuyLoading(true);
    try {
      const res = await fetch('/api/buy-tokens', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          payment_method_id: buyPaymentMethod.id,
          payment_method_name: buyPaymentMethod.name,
          token_symbol: buyToken,
          token_amount: buyAmount,
          fiat_amount: buyFiat || null,
          fiat_currency: 'USD',
          notes: buyNote,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Buy request failed');
      setBuyReference(data.reference);
      setBuyStep('done');
      loadActivity();
    } catch (e: any) {
      toast({ title: 'Buy request failed', description: e.message, variant: 'destructive' });
    } finally { setBuyLoading(false); }
  };

  const openTxDetail = (item: any) => {
    setSelectedTx(item);
    setTxDetailOpen(true);
  };

  const [pinLockEnabled, setPinLockEnabled] = useState(isPinLockEnabled());
  const [pinLockDialogOpen, setPinLockDialogOpen] = useState(false);
  const [pinLockInput, setPinLockInput] = useState('');
  const [pinLockConfirm, setPinLockConfirm] = useState('');
  const [appLocked, setAppLocked] = useState(isPinLockEnabled());
  const [unlockPin, setUnlockPin] = useState('');
  const [unlockError, setUnlockError] = useState('');

  // Biometric state
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricEnabled, setBiometricEnabled] = useState(isBiometricEnabled());

  // Bridge history
  const [bridgeHistory, setBridgeHistory] = useState<any[]>([]);
  const [bridgeLoading, setBridgeLoading] = useState(false);

  // On-chain RPC balance
  const walletAddresses = wallets.map(w => w.address);
  const { gydsBalance: rpcGydsBalance, loading: rpcLoading, error: rpcError, lastFetched: rpcLastFetched, refresh: refreshRpc } = useRpcBalance(walletAddresses);

  useEffect(() => {
    isBiometricAvailable().then(setBiometricAvailable);
  }, []);

  useEffect(() => {
    fetchWallets();
    loadBalances();
    fetchBridgeHistory();
    loadPaymentMethods();
    loadActivity();
    const balanceInterval = setInterval(loadBalances, 5000);
    return () => clearInterval(balanceInterval);
  }, [user]);

  const fetchBridgeHistory = async () => {
    if (!user) return;
    setBridgeLoading(true);
    try {
      const res = await fetch('/api/bridge/history', { credentials: 'include' });
      if (res.ok) setBridgeHistory(await res.json());
    } finally { setBridgeLoading(false); }
  };

  // Pre-fill send dialog when navigated from Mobile QR scanner
  useEffect(() => {
    const state = location.state as { prefillAddress?: string } | null;
    if (state?.prefillAddress) {
      setSendTo(state.prefillAddress);
      setSendDialogOpen(true);
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [location.state]);

  const fetchWallets = async () => {
    if (!user) return;
    try {
      const data = await api.get('/api/wallets');
      setWallets(data || []);
    } catch { }
    setLoading(false);
  };

  const loadBalances = async () => {
    if (!user) { setBalancesLoading(false); return; }
    setBalancesLoading(true);

    const [priceData, userWallets, allTx, opsRaw, allTokensRaw, founderCfg, gydsCfg, gydCfg, gusdCfg] = await Promise.all([
      api.get('/api/token-price').catch(() => null),
      api.get('/api/wallets').catch(() => []),
      api.get('/api/transactions').catch(() => []),
      api.get('/api/token-operations').catch(() => []),
      api.get('/api/tokens').catch(() => []),
      api.get('/api/config/founder_wallet').catch(() => null),
      api.get('/api/config/gyds_logo').catch(() => null),
      api.get('/api/config/gyd_logo').catch(() => null),
      api.get('/api/config/gusd_logo').catch(() => null),
    ]);

    // Get user wallets to find addresses
    const myAddresses = new Set((userWallets || []).map((w: any) => w.address.toLowerCase()));

    // For founders, also check the founder wallet config
    const fcVal = founderCfg?.configValue ?? founderCfg?.config_value;
    if (fcVal) {
      const fc = fcVal as Record<string, string>;
      if (fc.address) myAddresses.add(fc.address.toLowerCase());
    }

    // Actual wallet addresses are loaded from /api/wallets above

    // Also check operations created_by this user (for pre-mine tracking)
    const isCreator = (createdBy: string | null) => createdBy === user.id;

    // Get all confirmed transactions involving user's addresses (sent OR received)
    const txData = (allTx || []).filter((tx: any) => tx.status === 'confirmed');

    // Get token operations (pre-mine / mint) for the user
    const opsData = (opsRaw || []).filter((op: any) => op.status === 'confirmed');

    // Get all active tokens + user's blocked tokens
    const activeTokens = (allTokensRaw || []).filter((t: any) =>
      t.isActive !== false && t.is_active !== false
    );
    const myBlockedTokens = (allTokensRaw || []).filter((t: any) =>
      (t.isActive === false || t.is_active === false) &&
      (t.creatorId === user.id || t.creator_id === user.id)
    );

    // Merge active + user's blocked tokens (deduped)
    const tokensData = [...activeTokens];
    myBlockedTokens.forEach((bt: any) => {
      if (!tokensData.find((t: any) => t.id === bt.id)) tokensData.push(bt);
    });

    // Get coin logos from admin_config
    const logos: Record<string, string> = {};
    const gydsLogoVal = gydsCfg?.configValue ?? gydsCfg?.config_value;
    const gydLogoVal = gydCfg?.configValue ?? gydCfg?.config_value;
    const gusdLogoVal = gusdCfg?.configValue ?? gusdCfg?.config_value;
    if (gydsLogoVal?.url) logos['gyds_logo'] = gydsLogoVal.url;
    if (gydLogoVal?.url) logos['gyd_logo'] = gydLogoVal.url;
    if (gusdLogoVal?.url) logos['gusd_logo'] = gusdLogoVal.url;

    const gydsPrice = priceData?.price || 0.0000001;

    // Calculate balances from confirmed transactions
    let gydsBalance = 0;
    let gydBalance = 0;
    let gusdBalance = 0;

    // Credits from token operations (pre-mine, mint, faucet)
    // API returns camelCase from Drizzle — handle both camelCase and snake_case defensively
    if (opsData) {
      opsData.forEach(op => {
        const walletAddr    = (op.walletAddress ?? op.wallet_address ?? '').toLowerCase();
        const opType        = op.operationType ?? op.operation_type ?? '';
        const opCreatedBy   = op.createdBy ?? op.created_by ?? null;
        const amt           = Number(op.amount ?? 0);
        const addressMatch  = walletAddr ? myAddresses.has(walletAddr) : false;
        const creatorMatch  = isCreator(opCreatedBy);
        if (!addressMatch && !creatorMatch) return;
        if (opType === 'mint_gyds' || opType === 'premine_gyds' || opType === 'mint') {
          gydsBalance += amt;
        } else if (opType === 'mint_gyd' || opType === 'premine_gyd') {
          gydBalance += amt;
        } else if (opType === 'mint_gusd' || opType === 'premine_gusd') {
          gusdBalance += amt;
        } else if (opType === 'burn_gyds' || opType === 'burn') {
          gydsBalance -= amt;
        } else if (opType === 'burn_gyd') {
          gydBalance -= amt;
        } else if (opType === 'burn_gusd') {
          gusdBalance -= amt;
        }
      });
    }

    // Net from transactions (sent = debit, received = credit), respecting token type
    if (txData) {
      txData.forEach(tx => {
        const fromMe = myAddresses.has((tx.from_address ?? tx.fromAddress ?? '').toLowerCase());
        const toMe   = myAddresses.has((tx.to_address   ?? tx.toAddress   ?? '').toLowerCase());
        const symbol = (tx.token_symbol ?? tx.tokenSymbol ?? 'GYD').toUpperCase();
        const amt    = Number(tx.amount ?? 0);
        const fee    = Number(tx.fee ?? 0);
        if (symbol === 'GYDS') {
          if (fromMe) gydsBalance -= amt + fee;
          if (toMe)   gydsBalance += amt;
        } else if (symbol === 'GUSD') {
          if (fromMe) gusdBalance -= amt + fee;
          if (toMe)   gusdBalance += amt;
        } else {
          if (fromMe) gydBalance -= amt + fee;
          if (toMe)   gydBalance += amt;
        }
      });
    }

    const tokenBalances: TokenBalance[] = [
      {
        symbol: 'GYDS',
        name: 'GYDSchain',
        balance: gydsBalance,
        value: gydsBalance * gydsPrice,
        price: gydsPrice,
        change24h: 0,
        decimals: 18,
        logo: logos['gyds_logo'],
      },
      {
        symbol: 'GYD',
        name: 'GYDchain (Stablecoin)',
        balance: gydBalance,
        value: gydBalance * 1.00,
        price: 1.00,
        change24h: 0,
        decimals: 6,
        logo: logos['gyd_logo'],
      },
      {
        symbol: 'GUSD',
        name: 'Guardian Dollar',
        balance: gusdBalance,
        value: gusdBalance * 1.00,
        price: 1.00,
        change24h: 0,
        decimals: 18,
        logo: logos['gusd_logo'],
      },
    ];

    // Add custom tokens
    if (tokensData) {
      tokensData.forEach(token => {
        if (token.creator_id === user.id) {
          tokenBalances.push({
            symbol: token.symbol,
            name: token.name,
            balance: token.total_supply - token.burned_supply,
            value: (token.total_supply - token.burned_supply) * 0.01,
            price: 0.01,
            change24h: 0,
            logo: token.logo_url || undefined,
          });
        }
      });
    }

    setBalances(tokenBalances);
    setBalancesLoading(false);
  };

  const totalPortfolioValue = balances.reduce((sum, b) => sum + b.value, 0);

  const handleCreateWallet = async () => {
    if (pin.length < 4) {
      toast({ title: 'PIN must be at least 4 digits', variant: 'destructive' });
      return;
    }
    if (pin !== confirmPin) {
      toast({ title: 'PINs do not match', variant: 'destructive' });
      return;
    }
    const wallet = generateSecureWallet();
    const encryptedSeed = await encryptWithPin(wallet.seedPhrase, pin);
    const pinHash = await hashPin(pin);
    try {
      await api.post('/api/wallets', { address: wallet.address, encrypted_seed: encryptedSeed, pin_hash: pinHash });
      setNewWalletData({ address: wallet.address, seedPhrase: wallet.seedPhrase });
      fetchWallets();
      // Notify DeFi / other components that a wallet is now available
      window.dispatchEvent(new CustomEvent('wallet-created', { detail: { address: wallet.address } }));
    } catch (err: any) {
      toast({ title: 'Failed to create wallet', description: err?.message ?? 'Unknown error', variant: 'destructive' });
    }
  };

  const handleImportWallet = async () => {
    if (pin.length < 4) { toast({ title: 'PIN must be at least 4 digits', variant: 'destructive' }); return; }
    if (pin !== confirmPin) { toast({ title: 'PINs do not match', variant: 'destructive' }); return; }
    if (!importSeed.trim()) { toast({ title: 'Please enter seed phrase', variant: 'destructive' }); return; }
    // Derive a deterministic address from the seed phrase so the same seed always
    // produces the same address instead of a random one.
    const { address, seedPhrase: normalizedSeed } = await walletFromSeed(importSeed);
    const encryptedSeed = await encryptWithPin(normalizedSeed, pin);
    const pinHash = await hashPin(pin);
    try {
      await api.post('/api/wallets', { address, encrypted_seed: encryptedSeed, pin_hash: pinHash });
      toast({ title: 'Wallet imported successfully!', description: `Address: ${address.slice(0, 8)}...` });
      setImportDialogOpen(false); setPin(''); setConfirmPin(''); setImportSeed('');
      fetchWallets();
      // Notify DeFi / other components that a wallet is now available
      window.dispatchEvent(new CustomEvent('wallet-created', { detail: { address } }));
    } catch (err: any) {
      toast({ title: 'Failed to import wallet', description: err?.message ?? 'Unknown error', variant: 'destructive' });
    }
  };

  const handleViewSeed = async () => {
    if (!selectedWallet) return;
    const walletList = await api.get('/api/wallets').catch(() => []);
    const data = walletList.find((w: any) => w.id === selectedWallet);
    if (!data) { toast({ title: 'Wallet not found', variant: 'destructive' }); return; }
    const pinValid = await verifyPin(pin, data.pin_hash ?? data.pinHash);
    if (pinValid) {
      const seed = await decryptWithPin(data.encrypted_seed ?? data.encryptedSeed, pin);
      if (seed) setRevealedSeed(seed);
      else toast({ title: 'Failed to decrypt', variant: 'destructive' });
    } else {
      toast({ title: 'Incorrect PIN', variant: 'destructive' });
    }
  };

  const handleDeleteWallet = async (id: string) => {
    try {
      await api.delete(`/api/wallets/${id}`);
      toast({ title: 'Wallet deleted' });
      fetchWallets();
    } catch { }
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: `${label} copied!` });
  };

  // ─── PIN Rotation Handler ─────────────────────────────
  const handleRotatePin = async () => {
    if (!rotateWalletId) return;
    if (newPin.length < 4) {
      toast({ title: 'New PIN must be at least 4 digits', variant: 'destructive' });
      return;
    }
    if (newPin !== confirmNewPin) {
      toast({ title: 'New PINs do not match', variant: 'destructive' });
      return;
    }
    setRotateLoading(true);
    const walletList2 = await api.get('/api/wallets').catch(() => []);
    const data = walletList2.find((w: any) => w.id === rotateWalletId);
    if (!data) {
      toast({ title: 'Wallet not found', variant: 'destructive' });
      setRotateLoading(false);
      return;
    }
    const pinValid = await verifyPin(oldPin, data.pin_hash ?? data.pinHash);
    if (!pinValid) {
      toast({ title: 'Current PIN is incorrect', variant: 'destructive' });
      setRotateLoading(false);
      return;
    }
    const result = await rotatePin(data.encrypted_seed ?? data.encryptedSeed, oldPin, newPin);
    if (!result) {
      toast({ title: 'Failed to rotate PIN', variant: 'destructive' });
      setRotateLoading(false);
      return;
    }
    setRotateLoading(false);
    try {
      await api.patch(`/api/wallets/${rotateWalletId}`, {
        encrypted_seed: result.newEncryptedSeed,
        pin_hash: result.newPinHash,
      });
      toast({ title: 'PIN rotated successfully!' });
      setRotatePinDialogOpen(false);
      setOldPin(''); setNewPin(''); setConfirmNewPin('');
    } catch {
      toast({ title: 'Failed to save new PIN', variant: 'destructive' });
    }
  };

  // ─── PIN Lock Handlers ────────────────────────────────
  const handleEnablePinLock = async () => {
    if (pinLockInput.length < 4) {
      toast({ title: 'PIN must be at least 4 digits', variant: 'destructive' });
      return;
    }
    if (pinLockInput !== pinLockConfirm) {
      toast({ title: 'PINs do not match', variant: 'destructive' });
      return;
    }
    await enablePinLock(pinLockInput);
    setPinLockEnabled(true);
    setPinLockDialogOpen(false);
    setPinLockInput(''); setPinLockConfirm('');
    toast({ title: 'PIN lock enabled', description: 'Your wallet is now protected with a PIN lock.' });
  };

  const handleDisablePinLock = () => {
    disablePinLock();
    setPinLockEnabled(false);
    toast({ title: 'PIN lock disabled' });
  };

  const handleUnlock = async () => {
    const status = getPinLockStatus();
    if (status.locked) {
      const mins = Math.ceil(status.remainingMs / 60000);
      setUnlockError(`Too many attempts. Try again in ${mins} minute(s).`);
      return;
    }
    const valid = await verifyPinLock(unlockPin);
    if (valid) {
      setAppLocked(false);
      setUnlockPin('');
      setUnlockError('');
    } else {
      const newStatus = getPinLockStatus();
      if (newStatus.locked) {
        setUnlockError('Too many failed attempts. Locked for 5 minutes.');
      } else {
        setUnlockError(`Incorrect PIN. ${MAX_PIN_ATTEMPTS_DISPLAY - newStatus.attempts} attempt(s) remaining.`);
      }
    }
  };

  const handleBiometricUnlock = async () => {
    const ok = await authenticateBiometric();
    if (ok) {
      setAppLocked(false);
      setUnlockError('');
    } else {
      setUnlockError('Biometric authentication failed. Try PIN instead.');
    }
  };

  const handleEnableBiometric = async () => {
    if (!user) return;
    const ok = await registerBiometric(user.id);
    if (ok) {
      setBiometricEnabled(true);
      toast({ title: 'Biometric unlock enabled', description: 'You can now unlock with fingerprint or face.' });
    } else {
      toast({ title: 'Biometric setup failed', description: 'Your device may not support this feature.', variant: 'destructive' });
    }
  };

  const handleDisableBiometric = () => {
    disableBiometric();
    setBiometricEnabled(false);
    toast({ title: 'Biometric unlock disabled' });
  };

  const MAX_PIN_ATTEMPTS_DISPLAY = 5;
  const { fmt, symbol: currencySymbol, ratesUnavailable } = useCurrency();

  const handleSendTransaction = async () => {
    if (!user || !sendTo.trim() || !sendAmount || wallets.length === 0) {
      toast({ title: 'Please fill all fields and create a wallet first', variant: 'destructive' });
      return;
    }
    const amount = parseFloat(sendAmount);
    if (isNaN(amount) || amount <= 0) {
      toast({ title: 'Invalid amount', variant: 'destructive' });
      return;
    }
    if (!/^0x[a-fA-F0-9]{40}$/.test(sendTo.trim())) {
      toast({ title: 'Invalid address format (0x + 40 hex)', variant: 'destructive' });
      return;
    }
    setSendLoading(true);
    const fee = amount * 0.001;
    const txHash = '0x' + Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
    setSendLoading(false);
    try {
      await api.post('/api/transactions', {
        from_address: wallets[0].address,
        to_address: sendTo.trim(),
        amount,
        fee,
        tx_hash: txHash,
        status: 'confirmed',
        confirmed_at: new Date().toISOString(),
        wallet_id: wallets[0].id,
        token_symbol: sendAsset,
      });
      toast({ title: `Sent ${amount} ${sendAsset}`, description: `Fee: ${fee.toFixed(6)} ${sendAsset}` });
      setSendDialogOpen(false);
      setSendTo('');
      setSendAmount('');
      loadBalances();
    } catch (err: any) {
      toast({ title: 'Transaction failed', description: err.message, variant: 'destructive' });
    }
  };

  // ─── PIN Lock Screen ───────────────────────────────────
  if (appLocked) {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center justify-center min-h-[60vh]">
        <GlassCard className="p-8 max-w-sm w-full text-center">
          <ShieldAlert className="h-16 w-16 mx-auto text-primary mb-4" />
          <h2 className="text-2xl font-bold mb-2">Wallet Locked</h2>
          <p className="text-muted-foreground mb-6">Enter your PIN or use biometrics to access your wallet</p>
          <div className="space-y-4">
            {biometricEnabled && (
              <Button onClick={handleBiometricUnlock} variant="outline" className="w-full gap-2">
                <Fingerprint className="h-5 w-5" /> Unlock with Biometrics
              </Button>
            )}
            {biometricEnabled && <div className="relative"><div className="absolute inset-0 flex items-center"><span className="w-full border-t border-border" /></div><div className="relative flex justify-center text-xs"><span className="bg-card px-2 text-muted-foreground">or use PIN</span></div></div>}
            <Input
              type="password"
              value={unlockPin}
              onChange={(e) => { setUnlockPin(e.target.value); setUnlockError(''); }}
              placeholder="Enter PIN"
              maxLength={6}
              className="text-center text-lg tracking-widest"
              onKeyDown={(e) => e.key === 'Enter' && handleUnlock()}
            />
            {unlockError && <p className="text-sm text-destructive">{unlockError}</p>}
            <Button onClick={handleUnlock} className="w-full gap-2">
              <Lock className="h-4 w-4" /> Unlock with PIN
            </Button>
          </div>
        </GlassCard>
      </motion.div>
    );
  }

  const NETWORKS = ['Testnet', 'Mainnet', 'Devnet'] as const;
  const NETWORK_COLORS: Record<string, string> = {
    Testnet: 'text-amber-400 border-amber-400/40 bg-amber-400/10',
    Mainnet: 'text-emerald-400 border-emerald-400/40 bg-emerald-400/10',
    Devnet:  'text-blue-400 border-blue-400/40 bg-blue-400/10',
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-3">
            <WalletIcon className="w-8 h-8 text-primary" />
            Wallet Manager
          </h1>
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            <p className="text-muted-foreground text-sm">Create, import, and manage your wallets</p>
            <div className="flex gap-1">
              {NETWORKS.map(n => (
                <button
                  key={n}
                  onClick={() => { setSelectedNetwork(n); localStorage.setItem('gyds_network', n); }}
                  className={`text-xs px-2 py-0.5 rounded-full border font-medium transition-all ${
                    selectedNetwork === n
                      ? NETWORK_COLORS[n]
                      : 'text-muted-foreground border-muted-foreground/20 hover:border-muted-foreground/40'
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          {isFounder && <FounderWalletConfig />}
          <LedgerConnect compact onConnect={(addr) => toast({ title: 'Ledger connected', description: addr })} />
          <Button variant="outline" className="gap-2" onClick={() => setLinkWalletOpen(true)}>
            <WalletIcon className="h-4 w-4" /> Link Web3 Wallet
          </Button>
          <Dialog open={sendDialogOpen} onOpenChange={setSendDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" className="gap-2"><Send className="h-4 w-4" /> Send</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle className="flex items-center gap-2"><Send className="h-5 w-5" /> Send Transaction</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label>Select Asset</Label>
                  <Select value={sendAsset} onValueChange={setSendAsset}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="GYDS">GYDS — Gas & Staking (18 decimals)</SelectItem>
                      <SelectItem value="GYD">GYD — Stablecoin (6 decimals)</SelectItem>
                      {balances.filter(b => b.symbol !== 'GYDS' && b.symbol !== 'GYD').map(t => (
                        <SelectItem key={t.symbol} value={t.symbol}>{t.symbol} — {t.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Recipient Address</Label>
                  <div className="flex gap-2">
                    <Input value={sendTo} onChange={(e) => setSendTo(e.target.value)} placeholder="0x..." className="flex-1" />
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      title="Scan QR code"
                      onClick={() => { setSendDialogOpen(false); setShowQRScanner(true); }}
                    >
                      <QrCode className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <div>
                  <Label>Amount ({sendAsset})</Label>
                  <Input type="number" value={sendAmount} onChange={(e) => setSendAmount(e.target.value)} placeholder="0.00" min="0" step="any" />
                </div>
                {sendAmount && parseFloat(sendAmount) > 0 && (
                  <div className="p-3 rounded-lg bg-secondary/30 text-sm space-y-1">
                    <div className="flex justify-between"><span className="text-muted-foreground">Amount</span><span>{sendAmount} {sendAsset}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Fee (0.1%)</span><span>{(parseFloat(sendAmount) * 0.001).toFixed(6)} {sendAsset}</span></div>
                    <div className="flex justify-between font-semibold border-t border-border/50 pt-1 mt-1"><span>Total</span><span>{(parseFloat(sendAmount) * 1.001).toFixed(6)} {sendAsset}</span></div>
                  </div>
                )}
                <Button onClick={handleSendTransaction} className="w-full gap-2" disabled={sendLoading}>
                  {sendLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
                  {sendLoading ? 'Sending...' : `Send ${sendAsset}`}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
          <Button className="gap-2 bg-blue-600 hover:bg-blue-700 text-white" onClick={() => { setBuyStep('select'); setBuyAmount(''); setBuyFiat(''); setBuyPaymentMethod(null); setBuyNote(''); setBuyOpen(true); }}>
            <ShoppingCart className="h-4 w-4" /> Buy
          </Button>
          <Button className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => setCashOutOpen(true)}>
            <Banknote className="h-4 w-4" /> Cash Out
          </Button>

          {/* ── Buy Tokens Dialog ── */}
          <Dialog open={buyOpen} onOpenChange={(o) => { setBuyOpen(o); if (!o) setBuyStep('select'); }}>
            <DialogContent className="max-w-md">
              <DialogHeader><DialogTitle className="flex items-center gap-2"><ShoppingCart className="h-5 w-5 text-blue-400" /> Buy Tokens</DialogTitle></DialogHeader>
              {buyStep === 'done' ? (
                <div className="space-y-4">
                  <div className="p-4 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-center space-y-2">
                    <CheckCircle2 className="h-10 w-10 text-emerald-400 mx-auto" />
                    <p className="font-semibold text-emerald-300">Buy Request Submitted!</p>
                    <p className="text-xs text-muted-foreground">Reference: <span className="font-mono">{buyReference}</span></p>
                    <p className="text-sm text-muted-foreground">{buyPaymentMethod?.instructions}</p>
                  </div>
                  <Button className="w-full" onClick={() => setBuyOpen(false)}>Done</Button>
                </div>
              ) : buyStep === 'confirm' ? (
                <div className="space-y-4">
                  <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/20 space-y-2">
                    <p className="text-sm font-semibold text-blue-300">Payment Instructions</p>
                    <p className="text-sm text-muted-foreground">{buyPaymentMethod?.instructions}</p>
                  </div>
                  <div className="p-3 rounded-lg bg-secondary/30 text-sm space-y-2">
                    <div className="flex justify-between"><span className="text-muted-foreground">Token</span><span className="font-semibold">{buyToken}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Amount</span><span className="font-semibold">{buyAmount} {buyToken}</span></div>
                    {buyFiat && <div className="flex justify-between"><span className="text-muted-foreground">Fiat equiv.</span><span>USD {buyFiat}</span></div>}
                    <div className="flex justify-between"><span className="text-muted-foreground">Payment via</span><span>{buyPaymentMethod?.name}</span></div>
                  </div>
                  <div>
                    <Label>Note / Transaction ID (optional)</Label>
                    <Input value={buyNote} onChange={e => setBuyNote(e.target.value)} placeholder="e.g. PayPal transaction ID" />
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" className="flex-1" onClick={() => setBuyStep('select')}>Back</Button>
                    <Button className="flex-1 gap-2 bg-blue-600 hover:bg-blue-700" onClick={handleBuySubmit} disabled={buyLoading}>
                      {buyLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShoppingCart className="h-4 w-4" />}
                      {buyLoading ? 'Submitting...' : 'Confirm & Submit'}
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>Token</Label>
                      <Select value={buyToken} onValueChange={setBuyToken}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="GYD">GYD — Stablecoin</SelectItem>
                          <SelectItem value="GYDS">GYDS — Gas Token</SelectItem>
                          {balances.filter(b => b.symbol !== 'GYDS' && b.symbol !== 'GYD').map(t => (
                            <SelectItem key={t.symbol} value={t.symbol}>{t.symbol}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Amount</Label>
                      <Input type="number" value={buyAmount} onChange={e => setBuyAmount(e.target.value)} placeholder="100" min="0" step="any" />
                    </div>
                  </div>
                  <div>
                    <Label>Fiat amount (USD, optional)</Label>
                    <Input type="number" value={buyFiat} onChange={e => setBuyFiat(e.target.value)} placeholder="0.00" min="0" step="0.01" />
                  </div>
                  <div>
                    <Label>Payment Method</Label>
                    {paymentMethods.length === 0 ? (
                      <p className="text-sm text-muted-foreground mt-2">No payment methods enabled yet. Contact admin.</p>
                    ) : (
                      <div className="space-y-2 mt-2">
                        {paymentMethods.map(m => (
                          <button
                            key={m.id}
                            onClick={() => setBuyPaymentMethod(m)}
                            className={`w-full text-left p-3 rounded-lg border transition-colors ${buyPaymentMethod?.id === m.id ? 'border-primary bg-primary/10' : 'border-border/40 bg-card/50 hover:border-primary/50'}`}
                          >
                            <p className="font-semibold text-sm">{m.name}</p>
                            <p className="text-xs text-muted-foreground">{m.description}</p>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <Button
                    className="w-full gap-2 bg-blue-600 hover:bg-blue-700"
                    disabled={!buyAmount || !buyPaymentMethod}
                    onClick={() => setBuyStep('confirm')}
                  >
                    <ArrowDownLeft className="h-4 w-4" /> Continue
                  </Button>
                </div>
              )}
            </DialogContent>
          </Dialog>

          {/* ── Cash Out Dialog ── */}
          <Dialog open={cashOutOpen} onOpenChange={setCashOutOpen}>
            <DialogContent>
              <DialogHeader><DialogTitle className="flex items-center gap-2"><Banknote className="h-5 w-5 text-emerald-400" /> Cash Out</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-sm text-emerald-300">
                  Submit a cash-out request to convert your on-chain tokens to fiat.
                </div>
                <div>
                  <Label>Asset</Label>
                  <Select value={cashOutAsset} onValueChange={setCashOutAsset}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="GYD">GYD — Stablecoin (1 USD each)</SelectItem>
                      <SelectItem value="GYDS">GYDS — Gas & Staking Token</SelectItem>
                      {balances.filter(b => b.symbol !== 'GYDS' && b.symbol !== 'GYD').map(t => (
                        <SelectItem key={t.symbol} value={t.symbol}>{t.symbol} — {t.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Amount ({cashOutAsset})</Label>
                  <Input type="number" value={cashOutAmount} onChange={e => setCashOutAmount(e.target.value)} placeholder="0.00" min="0" step="any" />
                </div>
                <div>
                  <Label>Payment Method</Label>
                  {paymentMethods.length === 0 ? (
                    <p className="text-sm text-muted-foreground mt-1">No payment methods available. Contact admin.</p>
                  ) : (
                    <div className="space-y-2 mt-2">
                      {paymentMethods.map(m => (
                        <button
                          key={m.id}
                          onClick={() => setCashOutPaymentMethod(m.name)}
                          className={`w-full text-left p-3 rounded-lg border transition-colors ${cashOutPaymentMethod === m.name ? 'border-emerald-500 bg-emerald-500/10' : 'border-border/40 bg-card/50 hover:border-emerald-500/50'}`}
                        >
                          <p className="font-semibold text-sm">{m.name}</p>
                          <p className="text-xs text-muted-foreground">{m.description}</p>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div>
                  <Label>Destination (account / wallet address)</Label>
                  <Input value={cashOutDest} onChange={e => setCashOutDest(e.target.value)} placeholder="PayPal email, MMG number, bank ref, 0x..." />
                </div>
                <div>
                  <Label>Note (optional)</Label>
                  <Input value={cashOutNote} onChange={e => setCashOutNote(e.target.value)} placeholder="Purpose or reference" />
                </div>
                {cashOutAmount && parseFloat(cashOutAmount) > 0 && (
                  <div className="p-3 rounded-lg bg-secondary/30 text-sm space-y-1">
                    <div className="flex justify-between"><span className="text-muted-foreground">Amount</span><span>{cashOutAmount} {cashOutAsset}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Processing fee (0.5%)</span><span>{(parseFloat(cashOutAmount) * 0.005).toFixed(6)} {cashOutAsset}</span></div>
                    <div className="flex justify-between font-semibold border-t border-border/50 pt-1 mt-1"><span>Net payout</span><span>{(parseFloat(cashOutAmount) * 0.995).toFixed(6)} {cashOutAsset}</span></div>
                    <p className="text-xs text-muted-foreground pt-1">Processing time: 1–3 business days</p>
                  </div>
                )}
                <Button onClick={handleCashOut} className="w-full gap-2 bg-emerald-600 hover:bg-emerald-700" disabled={cashOutLoading || !cashOutAmount || !cashOutDest || !cashOutPaymentMethod}>
                  {cashOutLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Banknote className="h-4 w-4" />}
                  {cashOutLoading ? 'Submitting...' : 'Submit Cash Out Request'}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
          <Dialog open={importDialogOpen} onOpenChange={setImportDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" className="gap-2"><Upload className="h-4 w-4" /> Import</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Import Wallet</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <div><Label>Seed Phrase</Label>
                  <Input value={importSeed} onChange={(e) => setImportSeed(e.target.value)} placeholder="Enter your 12-word seed phrase" /></div>
                <div><Label>Create PIN (min 4 digits)</Label>
                  <Input type="password" value={pin} onChange={(e) => setPin(e.target.value)} placeholder="Enter PIN" maxLength={6} /></div>
                <div><Label>Confirm PIN</Label>
                  <Input type="password" value={confirmPin} onChange={(e) => setConfirmPin(e.target.value)} placeholder="Confirm PIN" maxLength={6} /></div>
                <Button onClick={handleImportWallet} className="w-full">Import Wallet</Button>
              </div>
            </DialogContent>
          </Dialog>
          <Dialog open={createDialogOpen} onOpenChange={(open) => { setCreateDialogOpen(open); if (!open) { setNewWalletData(null); setPin(''); setConfirmPin(''); } }}>
            <DialogTrigger asChild>
              <Button className="gap-2"><Plus className="h-4 w-4" /> Create Wallet</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>{newWalletData ? 'Wallet Created!' : 'Create New Wallet'}</DialogTitle></DialogHeader>
              {newWalletData ? (
                <div className="space-y-4">
                  <div className="p-4 rounded-lg bg-destructive/10 border border-destructive/30">
                    <p className="text-sm text-destructive font-medium mb-2">⚠️ Save your seed phrase now! It won't be shown again.</p>
                    <div className="p-3 rounded bg-background font-mono text-sm break-all">{newWalletData.seedPhrase}</div>
                    <Button size="sm" variant="outline" className="mt-2 gap-2" onClick={() => copyToClipboard(newWalletData.seedPhrase, 'Seed phrase')}>
                      <Copy className="h-3 w-3" /> Copy
                    </Button>
                  </div>
                  <div><Label>Address</Label>
                    <div className="flex gap-2">
                      <Input value={newWalletData.address} readOnly />
                      <Button size="icon" variant="outline" onClick={() => copyToClipboard(newWalletData.address, 'Address')}><Copy className="h-4 w-4" /></Button>
                    </div>
                  </div>
                  <Button onClick={() => setCreateDialogOpen(false)} className="w-full">Done</Button>
                </div>
              ) : (
                <div className="space-y-4">
                  <div><Label>Create PIN (min 4 digits)</Label>
                    <Input type="password" value={pin} onChange={(e) => setPin(e.target.value)} placeholder="Enter PIN to encrypt wallet" maxLength={6} /></div>
                  <div><Label>Confirm PIN</Label>
                    <Input type="password" value={confirmPin} onChange={(e) => setConfirmPin(e.target.value)} placeholder="Confirm PIN" maxLength={6} /></div>
                  <Button onClick={handleCreateWallet} className="w-full">Create Wallet</Button>
                </div>
              )}
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* QR Scanner overlay */}
      {showQRScanner && (
        <QRScanner
          onScan={(val) => {
            setSendTo(val);
            setShowQRScanner(false);
            setSendDialogOpen(true);
          }}
          onClose={() => setShowQRScanner(false)}
        />
      )}

      {/* Portfolio Overview */}
      <GlassCard className="p-6">
        <div className="flex items-center gap-3 mb-4">
          <Coins className="h-6 w-6 text-primary" />
          <h2 className="text-xl font-bold">Assets & Balances</h2>
        </div>
        <div className="mb-4 space-y-2">
          {ratesUnavailable && (
            <div className="text-xs text-amber-400/80 bg-amber-400/5 border border-amber-400/20 rounded px-2 py-1">
              Using estimated rates — live exchange data unavailable
            </div>
          )}
          <div>
            <div className="flex items-center gap-2 mb-1">
              <p className="text-sm text-muted-foreground">Total Portfolio Value ({currencySymbol})</p>
              <span className={`text-xs px-1.5 py-0.5 rounded-full border font-medium ${NETWORK_COLORS[selectedNetwork]}`}>
                {selectedNetwork} · Chain 13370
              </span>
            </div>
            <p className="text-3xl font-bold text-foreground">
              {fmt(totalPortfolioValue)}
            </p>
          </div>
          {/* On-chain RPC balance */}
          {walletAddresses.length > 0 && (
            <div className="flex items-center gap-2 text-sm">
              {rpcError ? (
                <span className="flex items-center gap-1 text-muted-foreground">
                  <WifiOff className="h-3.5 w-3.5" />
                  On-chain: RPC offline
                </span>
              ) : rpcLoading ? (
                <span className="flex items-center gap-1 text-muted-foreground">
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                  Checking on-chain…
                </span>
              ) : rpcGydsBalance !== null ? (
                <span className="flex items-center gap-1 text-emerald-400">
                  <Wifi className="h-3.5 w-3.5" />
                  On-chain: {parseFloat(rpcGydsBalance).toLocaleString(undefined, { maximumFractionDigits: 4 })} GYDS
                  {rpcLastFetched && <span className="text-muted-foreground text-xs ml-1">· {rpcLastFetched.toLocaleTimeString()}</span>}
                </span>
              ) : null}
              {!rpcLoading && (
                <button onClick={refreshRpc} className="text-muted-foreground hover:text-primary transition-colors" title="Refresh on-chain balance">
                  <RefreshCw className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          )}
        </div>

        {balancesLoading ? (
          <div className="flex items-center justify-center py-6 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading balances...
          </div>
        ) : (
          <div className="space-y-3">
            {balances.map(token => (
              <div key={token.symbol} className="p-3 rounded-lg bg-card/50 border border-border/30">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {token.logo ? (
                      <img src={token.logo} alt={token.symbol} className="w-10 h-10 rounded-full object-cover" />
                    ) : (
                      <div className={cn(
                        "w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold",
                        token.symbol === 'GYD' ? "bg-gradient-to-br from-blue-500 to-cyan-500" :
                        token.symbol === 'GYDS' ? "bg-gradient-to-br from-primary to-primary/50" :
                        token.symbol === 'GUSD' ? "bg-gradient-to-br from-[#0A4FFF] to-[#082567]" :
                        "bg-gradient-to-br from-amber-500 to-amber-600 text-black"
                      )}>
                        {token.symbol[0]}
                      </div>
                    )}
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold">{token.symbol}</span>
                        <span className="text-xs text-muted-foreground">{token.name}</span>
                      </div>
                      <p className="text-xs text-muted-foreground font-mono">
                        {fmt(token.price ?? 0)} per token
                        {token.decimals !== undefined && <span className="ml-2 text-muted-foreground/60">({token.decimals} decimals)</span>}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold font-mono">
                      {token.balance >= 1000000 ? `${(token.balance / 1000000).toFixed(2)}M`
                        : token.balance >= 1000 ? `${(token.balance / 1000).toFixed(2)}K`
                        : token.balance.toFixed(4)}
                    </p>
                    <p className="text-xs text-muted-foreground font-mono">
                      {fmt(token.value)}
                    </p>
                  </div>
                </div>
                {/* DeFi Action Buttons */}
                {token.balance > 0 && (
                  <div className="flex gap-2 mt-3 pt-3 border-t border-border/30">
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1 text-xs flex-1"
                      onClick={() => navigate('/defi')}
                    >
                      <ArrowRightLeft className="h-3 w-3" /> Swap
                    </Button>
                    {(token.symbol === 'GYD' || token.symbol === 'GYDS' || token.symbol === 'GUSD') && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1 text-xs flex-1"
                        onClick={() => navigate('/defi')}
                      >
                        <Layers className="h-3 w-3" /> Stake
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1 text-xs flex-1"
                      onClick={() => navigate('/defi')}
                    >
                      <Coins className="h-3 w-3" /> Pool
                    </Button>
                  </div>
                )}
              </div>
            ))}

            {balances.length === 0 && (
              <div className="text-center py-6 text-muted-foreground">
                <Coins className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>No assets found. Create a wallet and start transacting.</p>
              </div>
            )}
          </div>
        )}
      </GlassCard>

      {/* Wallets List */}
      <div>
        <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
          <Key className="h-5 w-5 text-primary" />
          Your Wallets
        </h2>
        <div className="grid gap-4">
          {loading ? (
            <GlassCard className="p-6 text-center text-muted-foreground">Loading wallets...</GlassCard>
          ) : wallets.length === 0 ? (
            <GlassCard className="p-12 text-center">
              <WalletIcon className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">No wallets yet. Create or import one to get started.</p>
            </GlassCard>
          ) : (
            wallets.map((wallet) => (
              <GlassCard key={wallet.id} className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="p-3 rounded-lg bg-primary/20">
                      <Key className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <p className="font-mono text-sm">{wallet.address}</p>
                      <p className="text-xs text-muted-foreground">
                        Created {wallet.created_at && !isNaN(new Date(wallet.created_at).getTime()) ? new Date(wallet.created_at).toLocaleDateString() : 'recently'}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => copyToClipboard(wallet.address, 'Address')}>
                      <Copy className="h-4 w-4" />
                    </Button>
                    <Dialog open={viewSeedDialogOpen && selectedWallet === wallet.id} onOpenChange={(open) => {
                      setViewSeedDialogOpen(open);
                      if (!open) { setRevealedSeed(null); setPin(''); }
                    }}>
                      <DialogTrigger asChild>
                        <Button size="sm" variant="outline" onClick={() => setSelectedWallet(wallet.id)}>
                          <Eye className="h-4 w-4" />
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle className="flex items-center gap-2"><Lock className="h-5 w-5" /> View Seed Phrase</DialogTitle>
                        </DialogHeader>
                        {revealedSeed ? (
                          <div className="space-y-4">
                            <div className="p-4 rounded-lg bg-destructive/10 border border-destructive/30">
                              <p className="text-sm text-destructive font-medium mb-2">⚠️ Never share your seed phrase!</p>
                              <div className="p-3 rounded bg-background font-mono text-sm break-all">{revealedSeed}</div>
                            </div>
                            <Button onClick={() => setViewSeedDialogOpen(false)} className="w-full">Close</Button>
                          </div>
                        ) : (
                          <div className="space-y-4">
                            <div><Label>Enter PIN</Label>
                              <Input type="password" value={pin} onChange={(e) => setPin(e.target.value)} placeholder="Enter your PIN" maxLength={6} /></div>
                            <Button onClick={handleViewSeed} className="w-full">Reveal Seed</Button>
                          </div>
                        )}
                      </DialogContent>
                    </Dialog>
                    <Button size="sm" variant="outline" onClick={() => handleDeleteWallet(wallet.id)} className="text-destructive hover:text-destructive">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                    <Dialog open={rotatePinDialogOpen && rotateWalletId === wallet.id} onOpenChange={(open) => {
                      setRotatePinDialogOpen(open);
                      if (!open) { setOldPin(''); setNewPin(''); setConfirmNewPin(''); }
                    }}>
                      <DialogTrigger asChild>
                        <Button size="sm" variant="outline" onClick={() => setRotateWalletId(wallet.id)}>
                          <RefreshCw className="h-4 w-4" />
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle className="flex items-center gap-2"><RefreshCw className="h-5 w-5" /> Change Wallet PIN</DialogTitle>
                        </DialogHeader>
                        <div className="space-y-4">
                          <div><Label>Current PIN</Label>
                            <Input type="password" value={oldPin} onChange={(e) => setOldPin(e.target.value)} placeholder="Enter current PIN" maxLength={6} /></div>
                          <div><Label>New PIN (min 4 digits)</Label>
                            <Input type="password" value={newPin} onChange={(e) => setNewPin(e.target.value)} placeholder="Enter new PIN" maxLength={6} /></div>
                          <div><Label>Confirm New PIN</Label>
                            <Input type="password" value={confirmNewPin} onChange={(e) => setConfirmNewPin(e.target.value)} placeholder="Confirm new PIN" maxLength={6} /></div>
                          <Button onClick={handleRotatePin} className="w-full gap-2" disabled={rotateLoading}>
                            {rotateLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                            {rotateLoading ? 'Rotating...' : 'Change PIN'}
                          </Button>
                        </div>
                      </DialogContent>
                    </Dialog>
                  </div>
                </div>
              </GlassCard>
            ))
          )}
        </div>
      </div>
      {/* Security Settings */}
      <GlassCard className="p-6">
        <div className="flex items-center gap-3 mb-4">
          <Shield className="h-6 w-6 text-primary" />
          <h2 className="text-xl font-bold">Security Settings</h2>
        </div>
        <div className="space-y-4">
          <div className="flex items-center justify-between p-4 rounded-lg bg-card/50 border border-border/30">
            <div className="flex items-center gap-3">
              {pinLockEnabled ? (
                <ShieldCheck className="h-5 w-5 text-green-500" />
              ) : (
                <ShieldAlert className="h-5 w-5 text-muted-foreground" />
              )}
              <div>
                <p className="font-semibold">App PIN Lock</p>
                <p className="text-sm text-muted-foreground">
                  {pinLockEnabled
                    ? 'PIN required to access wallet page'
                    : 'Protect your wallet with a PIN on each visit'}
                </p>
              </div>
            </div>
            {pinLockEnabled ? (
              <Button variant="outline" size="sm" onClick={handleDisablePinLock}>Disable</Button>
            ) : (
              <Dialog open={pinLockDialogOpen} onOpenChange={setPinLockDialogOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-2"><Lock className="h-4 w-4" /> Enable</Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle className="flex items-center gap-2"><Shield className="h-5 w-5" /> Set App PIN Lock</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4">
                    <p className="text-sm text-muted-foreground">This PIN will be required every time you visit the wallet page. After 5 failed attempts, you'll be locked out for 5 minutes.</p>
                    <div><Label>PIN (min 4 digits)</Label>
                      <Input type="password" value={pinLockInput} onChange={(e) => setPinLockInput(e.target.value)} placeholder="Enter PIN" maxLength={6} /></div>
                    <div><Label>Confirm PIN</Label>
                      <Input type="password" value={pinLockConfirm} onChange={(e) => setPinLockConfirm(e.target.value)} placeholder="Confirm PIN" maxLength={6} /></div>
                    <Button onClick={handleEnablePinLock} className="w-full gap-2">
                      <ShieldCheck className="h-4 w-4" /> Enable PIN Lock
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            )}
          </div>
          <div className="p-4 rounded-lg bg-card/50 border border-border/30">
            <div className="flex items-center gap-3">
              <RefreshCw className="h-5 w-5 text-primary" />
              <div>
                <p className="font-semibold">PIN Rotation</p>
                <p className="text-sm text-muted-foreground">Change individual wallet PINs using the <RefreshCw className="h-3 w-3 inline" /> button on each wallet card above.</p>
              </div>
            </div>
          </div>
          {/* Biometric Unlock */}
          {biometricAvailable && (
            <div className="flex items-center justify-between p-4 rounded-lg bg-card/50 border border-border/30">
              <div className="flex items-center gap-3">
                <Fingerprint className={cn("h-5 w-5", biometricEnabled ? "text-green-500" : "text-muted-foreground")} />
                <div>
                  <p className="font-semibold">Biometric Unlock</p>
                  <p className="text-sm text-muted-foreground">
                    {biometricEnabled
                      ? 'Fingerprint or face unlock enabled'
                      : 'Use fingerprint or face to unlock wallet'}
                  </p>
                </div>
              </div>
              {biometricEnabled ? (
                <Button variant="outline" size="sm" onClick={handleDisableBiometric}>Disable</Button>
              ) : (
                <Button variant="outline" size="sm" className="gap-2" onClick={handleEnableBiometric} disabled={!pinLockEnabled}>
                  <Fingerprint className="h-4 w-4" /> Enable
                </Button>
              )}
            </div>
          )}
          {biometricAvailable && !pinLockEnabled && !biometricEnabled && (
            <p className="text-xs text-muted-foreground pl-1">Enable PIN lock first to use biometric unlock.</p>
          )}
        </div>
      </GlassCard>

      {/* ── Activity Feed ── */}
      <GlassCard className="p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <Activity className="h-6 w-6 text-primary" />
            <h2 className="text-xl font-bold">Activity</h2>
          </div>
          <Button variant="outline" size="sm" onClick={loadActivity} disabled={activityLoading}>
            <RefreshCw className={`h-4 w-4 ${activityLoading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
        {activityLoading ? (
          <div className="flex items-center gap-2 justify-center py-8 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" /> Loading activity…
          </div>
        ) : activityTxList.length === 0 ? (
          <div className="text-center py-10 text-muted-foreground">
            <Activity className="h-8 w-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm">No activity yet.</p>
            <p className="text-xs mt-1">Transactions, buy requests, and cash outs will appear here.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {activityTxList.map((item: any) => {
              const kind = item._kind;
              let icon = <ArrowRightLeft className="h-4 w-4 text-primary" />;
              let label = '';
              let subLabel = '';
              let amountStr = '';
              let statusColor = '';

              if (kind === 'tx') {
                icon = item.to_address === user?.id ? <ArrowDownLeft className="h-4 w-4 text-emerald-400" /> : <ArrowUpRight className="h-4 w-4 text-red-400" />;
                label = 'Transfer';
                subLabel = item.tx_hash ? `${item.tx_hash.slice(0, 10)}…` : (item.reference || '');
                amountStr = `${Number(item.amount).toLocaleString(undefined, { maximumFractionDigits: 4 })} ${item.asset || 'GYD'}`;
                statusColor = item.status === 'confirmed' ? 'text-emerald-400' : item.status === 'failed' ? 'text-red-400' : 'text-amber-400';
              } else if (kind === 'cashout') {
                icon = <ArrowUpRight className="h-4 w-4 text-amber-400" />;
                label = 'Cash Out';
                subLabel = item.reference || '';
                amountStr = `${Number(item.amount).toLocaleString(undefined, { maximumFractionDigits: 4 })} ${item.asset}`;
                statusColor = item.status === 'approved' || item.status === 'completed' ? 'text-emerald-400' : item.status === 'rejected' ? 'text-red-400' : 'text-amber-400';
              } else if (kind === 'buy') {
                icon = <ArrowDownLeft className="h-4 w-4 text-blue-400" />;
                label = 'Buy';
                subLabel = item.reference || '';
                amountStr = `${Number(item.token_amount).toLocaleString(undefined, { maximumFractionDigits: 4 })} ${item.token_symbol}`;
                statusColor = item.status === 'approved' || item.status === 'completed' ? 'text-emerald-400' : item.status === 'rejected' ? 'text-red-400' : 'text-amber-400';
              }

              return (
                <button
                  key={`${kind}-${item.id}`}
                  onClick={() => openTxDetail(item)}
                  className="w-full text-left p-3 rounded-lg bg-card/50 border border-border/30 hover:border-primary/40 hover:bg-card/80 transition-colors flex items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="p-2 rounded-lg bg-primary/10 flex-shrink-0">{icon}</div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm">{label}</span>
                        <span className={`text-xs capitalize ${statusColor}`}>{item.status}</span>
                      </div>
                      <p className="text-xs text-muted-foreground font-mono truncate">{subLabel}</p>
                      <p className="text-xs text-muted-foreground">{new Date(item.created_at).toLocaleString()}</p>
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-sm font-semibold font-mono">{amountStr}</p>
                    {kind === 'cashout' && item.payment_method && (
                      <p className="text-xs text-muted-foreground">{item.payment_method}</p>
                    )}
                    {kind === 'buy' && item.payment_method_name && (
                      <p className="text-xs text-muted-foreground">{item.payment_method_name}</p>
                    )}
                    <Info className="h-3 w-3 text-muted-foreground ml-auto mt-0.5" />
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </GlassCard>

      {/* Transaction Detail Modal */}
      <Dialog open={txDetailOpen} onOpenChange={setTxDetailOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {selectedTx?._kind === 'buy' ? <ShoppingCart className="h-5 w-5 text-blue-400" /> :
               selectedTx?._kind === 'cashout' ? <Banknote className="h-5 w-5 text-emerald-400" /> :
               <ArrowRightLeft className="h-5 w-5 text-primary" />}
              {selectedTx?._kind === 'buy' ? 'Buy Request' :
               selectedTx?._kind === 'cashout' ? 'Cash Out Request' : 'Transaction'} Details
            </DialogTitle>
          </DialogHeader>
          {selectedTx && (
            <div className="space-y-3">
              {/* Status banner */}
              <div className={`p-3 rounded-lg text-sm flex items-center gap-2 ${
                (selectedTx.status === 'confirmed' || selectedTx.status === 'approved' || selectedTx.status === 'completed')
                  ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-300'
                  : (selectedTx.status === 'rejected' || selectedTx.status === 'failed')
                  ? 'bg-red-500/10 border border-red-500/20 text-red-300'
                  : 'bg-amber-500/10 border border-amber-500/20 text-amber-300'
              }`}>
                {(selectedTx.status === 'confirmed' || selectedTx.status === 'approved' || selectedTx.status === 'completed')
                  ? <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
                  : (selectedTx.status === 'rejected' || selectedTx.status === 'failed')
                  ? <XCircle className="h-4 w-4 flex-shrink-0" />
                  : <Clock className="h-4 w-4 flex-shrink-0" />}
                <span className="capitalize font-medium">{selectedTx.status}</span>
              </div>

              {/* Fields */}
              <div className="space-y-2 text-sm">
                {selectedTx.reference && (
                  <div className="flex justify-between gap-4 py-2 border-b border-border/30">
                    <span className="text-muted-foreground flex-shrink-0">Reference</span>
                    <span className="font-mono text-xs break-all text-right">{selectedTx.reference}</span>
                  </div>
                )}
                {selectedTx.tx_hash && (
                  <div className="flex justify-between gap-4 py-2 border-b border-border/30">
                    <span className="text-muted-foreground flex-shrink-0">TX Hash</span>
                    <span className="font-mono text-xs break-all text-right">{selectedTx.tx_hash}</span>
                  </div>
                )}
                {selectedTx._kind === 'tx' && (
                  <>
                    {selectedTx.from_address && (
                      <div className="flex justify-between gap-4 py-2 border-b border-border/30">
                        <span className="text-muted-foreground flex-shrink-0">From</span>
                        <span className="font-mono text-xs break-all text-right">{selectedTx.from_address}</span>
                      </div>
                    )}
                    {selectedTx.to_address && (
                      <div className="flex justify-between gap-4 py-2 border-b border-border/30">
                        <span className="text-muted-foreground flex-shrink-0">To</span>
                        <span className="font-mono text-xs break-all text-right">{selectedTx.to_address}</span>
                      </div>
                    )}
                    <div className="flex justify-between gap-4 py-2 border-b border-border/30">
                      <span className="text-muted-foreground">Amount</span>
                      <span className="font-semibold">{Number(selectedTx.amount).toLocaleString()} {selectedTx.asset || 'GYD'}</span>
                    </div>
                    {selectedTx.fee !== undefined && (
                      <div className="flex justify-between gap-4 py-2 border-b border-border/30">
                        <span className="text-muted-foreground">Fee</span>
                        <span>{Number(selectedTx.fee).toFixed(6)} {selectedTx.asset || 'GYD'}</span>
                      </div>
                    )}
                    {selectedTx.block_height && (
                      <div className="flex justify-between gap-4 py-2 border-b border-border/30">
                        <span className="text-muted-foreground">Block</span>
                        <span className="font-mono">#{Number(selectedTx.block_height).toLocaleString()}</span>
                      </div>
                    )}
                  </>
                )}
                {selectedTx._kind === 'cashout' && (
                  <>
                    <div className="flex justify-between gap-4 py-2 border-b border-border/30">
                      <span className="text-muted-foreground">Asset</span>
                      <span className="font-semibold">{selectedTx.asset}</span>
                    </div>
                    <div className="flex justify-between gap-4 py-2 border-b border-border/30">
                      <span className="text-muted-foreground">Amount</span>
                      <span className="font-semibold">{Number(selectedTx.amount).toLocaleString()} {selectedTx.asset}</span>
                    </div>
                    <div className="flex justify-between gap-4 py-2 border-b border-border/30">
                      <span className="text-muted-foreground">Net payout</span>
                      <span>{(Number(selectedTx.amount) * 0.995).toFixed(6)} {selectedTx.asset}</span>
                    </div>
                    {selectedTx.payment_method && (
                      <div className="flex justify-between gap-4 py-2 border-b border-border/30">
                        <span className="text-muted-foreground">Via</span>
                        <span>{selectedTx.payment_method}</span>
                      </div>
                    )}
                    {selectedTx.destination && (
                      <div className="flex justify-between gap-4 py-2 border-b border-border/30">
                        <span className="text-muted-foreground flex-shrink-0">Destination</span>
                        <span className="font-mono text-xs break-all text-right">{selectedTx.destination}</span>
                      </div>
                    )}
                    {selectedTx.note && (
                      <div className="flex justify-between gap-4 py-2 border-b border-border/30">
                        <span className="text-muted-foreground">Note</span>
                        <span>{selectedTx.note}</span>
                      </div>
                    )}
                    {selectedTx.processed_at && (
                      <div className="flex justify-between gap-4 py-2 border-b border-border/30">
                        <span className="text-muted-foreground">Processed</span>
                        <span>{new Date(selectedTx.processed_at).toLocaleString()}</span>
                      </div>
                    )}
                  </>
                )}
                {selectedTx._kind === 'buy' && (
                  <>
                    <div className="flex justify-between gap-4 py-2 border-b border-border/30">
                      <span className="text-muted-foreground">Token</span>
                      <span className="font-semibold">{selectedTx.token_symbol}</span>
                    </div>
                    <div className="flex justify-between gap-4 py-2 border-b border-border/30">
                      <span className="text-muted-foreground">Amount</span>
                      <span className="font-semibold">{Number(selectedTx.token_amount).toLocaleString()} {selectedTx.token_symbol}</span>
                    </div>
                    {selectedTx.fiat_amount && (
                      <div className="flex justify-between gap-4 py-2 border-b border-border/30">
                        <span className="text-muted-foreground">Fiat value</span>
                        <span>{selectedTx.fiat_currency} {Number(selectedTx.fiat_amount).toFixed(2)}</span>
                      </div>
                    )}
                    <div className="flex justify-between gap-4 py-2 border-b border-border/30">
                      <span className="text-muted-foreground">Via</span>
                      <span>{selectedTx.payment_method_name}</span>
                    </div>
                    {selectedTx.notes && (
                      <div className="flex justify-between gap-4 py-2 border-b border-border/30">
                        <span className="text-muted-foreground">Note</span>
                        <span>{selectedTx.notes}</span>
                      </div>
                    )}
                    {selectedTx.processed_at && (
                      <div className="flex justify-between gap-4 py-2 border-b border-border/30">
                        <span className="text-muted-foreground">Processed</span>
                        <span>{new Date(selectedTx.processed_at).toLocaleString()}</span>
                      </div>
                    )}
                  </>
                )}
                <div className="flex justify-between gap-4 py-2">
                  <span className="text-muted-foreground">Date</span>
                  <span>{new Date(selectedTx.created_at).toLocaleString()}</span>
                </div>
              </div>

              <Button variant="outline" className="w-full mt-2" onClick={() => setTxDetailOpen(false)}>Close</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Bridge Transfer History */}
      <GlassCard className="p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <ArrowRightLeft className="h-6 w-6 text-primary" />
            <h2 className="text-xl font-bold">Bridge History</h2>
          </div>
          <Button variant="outline" size="sm" onClick={fetchBridgeHistory} disabled={bridgeLoading}>
            <RefreshCw className={`h-4 w-4 ${bridgeLoading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
        {bridgeLoading ? (
          <div className="flex items-center gap-2 justify-center py-6 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" /> Loading bridge history…
          </div>
        ) : bridgeHistory.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <ArrowRightLeft className="h-8 w-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm">No bridge transfers yet.</p>
            <p className="text-xs mt-1">Transfers made via the <a className="text-primary underline cursor-pointer" href="/defi">DeFi Bridge</a> will appear here.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {bridgeHistory.map((tx: any) => (
              <div key={tx.id} className="p-4 rounded-lg bg-card/50 border border-border/30 flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className="p-2 rounded-lg bg-primary/10 mt-0.5">
                    <ArrowRightLeft className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm">{tx.from_chain} → {tx.to_chain}</span>
                      {tx.status === 'completed' && <CheckCircle2 className="h-4 w-4 text-emerald-400" />}
                      {tx.status === 'pending' && <Clock className="h-4 w-4 text-amber-400" />}
                      {tx.status === 'failed' && <XCircle className="h-4 w-4 text-red-400" />}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {Number(tx.amount).toFixed(4)} {tx.from_token}
                      {tx.received && ` → ${Number(tx.received).toFixed(4)} ${tx.to_token}`}
                      {tx.fee > 0 && ` (fee: ${Number(tx.fee).toFixed(4)})`}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">{new Date(tx.created_at).toLocaleString()}</p>
                    {tx.tx_hash && (
                      <p className="text-xs font-mono text-muted-foreground mt-0.5 flex items-center gap-1">
                        {tx.tx_hash.slice(0, 10)}…{tx.tx_hash.slice(-8)}
                        <ExternalLink className="h-3 w-3" />
                      </p>
                    )}
                  </div>
                </div>
                <span className={`text-xs font-medium capitalize px-2 py-0.5 rounded-full flex-shrink-0 ${
                  tx.status === 'completed' ? 'bg-emerald-500/20 text-emerald-400' :
                  tx.status === 'pending' ? 'bg-amber-500/20 text-amber-400' :
                  'bg-red-500/20 text-red-400'
                }`}>{tx.status}</span>
              </div>
            ))}
          </div>
        )}
      </GlassCard>

      <Web3ConnectModal
        open={linkWalletOpen}
        onClose={() => setLinkWalletOpen(false)}
        mode="link"
        userId={user?.id}
        onSuccess={(address) => {
          toast({ title: 'Wallet Linked!', description: `${address.slice(0, 6)}...${address.slice(-4)} connected.` });
          fetchWallets();
        }}
      />
    </motion.div>
  );
};

const WalletPage = () => (
  <Layout>
    <RequireAuth>
      <WalletContent />
    </RequireAuth>
  </Layout>
);

export default WalletPage;
