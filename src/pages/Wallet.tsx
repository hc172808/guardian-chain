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
  Layers
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FounderWalletConfig } from '@/components/wallet/FounderWalletConfig';
import { cn } from '@/lib/utils';
import { useNavigate } from 'react-router-dom';

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

const WalletContent = () => {
  const navigate = useNavigate();
  const { user, isFounder } = useAuth();
  const { toast } = useToast();
  const [wallets, setWallets] = useState<WalletData[]>([]);
  const [loading, setLoading] = useState(true);
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

  // PIN rotation state
  const [rotatePinDialogOpen, setRotatePinDialogOpen] = useState(false);
  const [rotateWalletId, setRotateWalletId] = useState<string | null>(null);
  const [oldPin, setOldPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmNewPin, setConfirmNewPin] = useState('');
  const [rotateLoading, setRotateLoading] = useState(false);

  // PIN lock state
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

  useEffect(() => {
    isBiometricAvailable().then(setBiometricAvailable);
  }, []);

  useEffect(() => {
    fetchWallets();
    loadBalances();
  }, [user]);

  const fetchWallets = async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from('wallets')
      .select('id, address, created_at')
      .eq('user_id', user.id);
    if (!error && data) setWallets(data);
    setLoading(false);
  };

  const loadBalances = async () => {
    if (!user) { setBalancesLoading(false); return; }
    setBalancesLoading(true);

    // Get GYDS price
    const { data: priceData } = await supabase
      .from('token_price')
      .select('*')
      .limit(1)
      .single();

    // Get user wallets to find addresses
    const { data: userWallets } = await supabase
      .from('wallets')
      .select('address')
      .eq('user_id', user.id);

    const myAddresses = new Set((userWallets || []).map(w => w.address.toLowerCase()));

    // For founders, also check the founder wallet config
    const { data: founderConfig } = await supabase
      .from('admin_config')
      .select('config_value')
      .eq('config_key', 'founder_wallet')
      .maybeSingle();

    if (founderConfig?.config_value) {
      const fc = founderConfig.config_value as Record<string, string>;
      if (fc.address) myAddresses.add(fc.address.toLowerCase());
    }

    // Also include the reserved founder address for founder users
    if (user.email === 'netlifegy@gmail.com') {
      myAddresses.add('0x0000000000000000000000000000000000000001');
    }

    // Also check operations created_by this user (for pre-mine tracking)
    const isCreator = (createdBy: string | null) => createdBy === user.id;

    // Get all confirmed transactions involving user's addresses
    const { data: txData } = await supabase
      .from('transactions')
      .select('*')
      .eq('user_id', user.id)
      .eq('status', 'confirmed');

    // Get token operations (pre-mine / mint) for the user
    const { data: opsData } = await supabase
      .from('token_operations')
      .select('*')
      .eq('status', 'confirmed');

    // Get all active tokens
    const { data: tokensData } = await supabase
      .from('tokens')
      .select('*')
      .eq('is_active', true);

    // Get coin logos from admin_config
    const { data: logoConfig } = await supabase
      .from('admin_config')
      .select('config_key, config_value')
      .in('config_key', ['gyds_logo', 'gyd_logo']);

    const logos: Record<string, string> = {};
    (logoConfig || []).forEach(c => {
      const val = c.config_value as Record<string, string>;
      if (val?.url) logos[c.config_key] = val.url;
    });

    const gydsPrice = priceData?.price || 0.0000001;

    // Calculate balances from confirmed transactions
    let gydsBalance = 0;
    let gydBalance = 0;

    // Credits from token operations (pre-mine, mint)
    if (opsData) {
      opsData.forEach(op => {
        const addressMatch = myAddresses.has(op.wallet_address.toLowerCase());
        const creatorMatch = isCreator(op.created_by);
        if (!addressMatch && !creatorMatch) return;
        if (op.operation_type === 'mint_gyds' || op.operation_type === 'premine_gyds' || op.operation_type === 'mint') {
          gydsBalance += op.amount;
        } else if (op.operation_type === 'mint_gyd' || op.operation_type === 'premine_gyd') {
          gydBalance += op.amount;
        } else if (op.operation_type === 'burn_gyds' || op.operation_type === 'burn') {
          gydsBalance -= op.amount;
        } else if (op.operation_type === 'burn_gyd') {
          gydBalance -= op.amount;
        }
      });
    }

    // Net from transactions (sent = debit, received = credit)
    if (txData) {
      txData.forEach(tx => {
        const fromMe = myAddresses.has(tx.from_address.toLowerCase());
        const toMe = myAddresses.has(tx.to_address.toLowerCase());
        // For now, assume GYD for user transactions
        if (fromMe) {
          gydBalance -= tx.amount + tx.fee;
        }
        if (toMe) {
          gydBalance += tx.amount;
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
    const { error } = await supabase.from('wallets').insert({
      user_id: user!.id, address: wallet.address, encrypted_seed: encryptedSeed, pin_hash: pinHash,
    });
    if (error) {
      toast({ title: 'Failed to create wallet', variant: 'destructive' });
    } else {
      setNewWalletData({ address: wallet.address, seedPhrase: wallet.seedPhrase });
      fetchWallets();
    }
  };

  const handleImportWallet = async () => {
    if (pin.length < 4) { toast({ title: 'PIN must be at least 4 digits', variant: 'destructive' }); return; }
    if (pin !== confirmPin) { toast({ title: 'PINs do not match', variant: 'destructive' }); return; }
    if (!importSeed.trim()) { toast({ title: 'Please enter seed phrase', variant: 'destructive' }); return; }
    const wallet = generateSecureWallet();
    const encryptedSeed = await encryptWithPin(importSeed.trim(), pin);
    const pinHash = await hashPin(pin);
    const { error } = await supabase.from('wallets').insert({
      user_id: user!.id, address: wallet.address, encrypted_seed: encryptedSeed, pin_hash: pinHash,
    });
    if (error) {
      toast({ title: 'Failed to import wallet', variant: 'destructive' });
    } else {
      toast({ title: 'Wallet imported successfully!' });
      setImportDialogOpen(false); setPin(''); setConfirmPin(''); setImportSeed('');
      fetchWallets();
    }
  };

  const handleViewSeed = async () => {
    if (!selectedWallet) return;
    const { data } = await supabase.from('wallets').select('encrypted_seed, pin_hash').eq('id', selectedWallet).single();
    if (!data) { toast({ title: 'Wallet not found', variant: 'destructive' }); return; }
    const pinValid = await verifyPin(pin, data.pin_hash);
    if (pinValid) {
      const seed = await decryptWithPin(data.encrypted_seed, pin);
      if (seed) setRevealedSeed(seed);
      else toast({ title: 'Failed to decrypt', variant: 'destructive' });
    } else {
      toast({ title: 'Incorrect PIN', variant: 'destructive' });
    }
  };

  const handleDeleteWallet = async (id: string) => {
    const { error } = await supabase.from('wallets').delete().eq('id', id);
    if (!error) { toast({ title: 'Wallet deleted' }); fetchWallets(); }
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
    const { data } = await supabase.from('wallets').select('encrypted_seed, pin_hash').eq('id', rotateWalletId).single();
    if (!data) {
      toast({ title: 'Wallet not found', variant: 'destructive' });
      setRotateLoading(false);
      return;
    }
    const pinValid = await verifyPin(oldPin, data.pin_hash);
    if (!pinValid) {
      toast({ title: 'Current PIN is incorrect', variant: 'destructive' });
      setRotateLoading(false);
      return;
    }
    const result = await rotatePin(data.encrypted_seed, oldPin, newPin);
    if (!result) {
      toast({ title: 'Failed to rotate PIN', variant: 'destructive' });
      setRotateLoading(false);
      return;
    }
    const { error } = await supabase.from('wallets').update({
      encrypted_seed: result.newEncryptedSeed,
      pin_hash: result.newPinHash,
    }).eq('id', rotateWalletId);
    setRotateLoading(false);
    if (error) {
      toast({ title: 'Failed to save new PIN', variant: 'destructive' });
    } else {
      toast({ title: 'PIN rotated successfully!' });
      setRotatePinDialogOpen(false);
      setOldPin(''); setNewPin(''); setConfirmNewPin('');
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
    const { error } = await supabase.from('transactions').insert({
      user_id: user.id,
      from_address: wallets[0].address,
      to_address: sendTo.trim(),
      amount,
      fee,
      tx_hash: txHash,
      status: 'confirmed',
      confirmed_at: new Date().toISOString(),
      wallet_id: wallets[0].id,
    });
    setSendLoading(false);
    if (error) {
      toast({ title: 'Transaction failed', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: `Sent ${amount} ${sendAsset}`, description: `Fee: ${fee.toFixed(6)} ${sendAsset}` });
      setSendDialogOpen(false);
      setSendTo('');
      setSendAmount('');
      loadBalances();
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

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-3">
            <WalletIcon className="w-8 h-8 text-primary" />
            Wallet Manager
          </h1>
          <p className="text-muted-foreground mt-2">Create, import, and manage your wallets</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {isFounder && <FounderWalletConfig />}
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
                  <Input value={sendTo} onChange={(e) => setSendTo(e.target.value)} placeholder="0x..." />
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

      {/* Portfolio Overview */}
      <GlassCard className="p-6">
        <div className="flex items-center gap-3 mb-4">
          <Coins className="h-6 w-6 text-primary" />
          <h2 className="text-xl font-bold">Assets & Balances</h2>
        </div>
        <div className="mb-4">
          <p className="text-sm text-muted-foreground">Total Portfolio Value</p>
          <p className="text-3xl font-bold text-foreground">
            ${totalPortfolioValue < 0.01 && totalPortfolioValue > 0
              ? totalPortfolioValue.toFixed(7)
              : totalPortfolioValue.toFixed(2)}
          </p>
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
                        ${token.price < 1 ? token.price.toFixed(7) : token.price.toFixed(2)} per token
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
                      ${token.value < 0.01 && token.value > 0
                        ? token.value.toFixed(7)
                        : token.value.toFixed(2)}
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
                    {(token.symbol === 'GYD' || token.symbol === 'GYDS') && (
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
                        Created {new Date(wallet.created_at).toLocaleDateString()}
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
