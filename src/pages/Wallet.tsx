import { useState, useEffect } from 'react';
import { Layout } from '@/components/layout/Layout';
import { RequireAuth } from '@/components/auth/RequireAuth';
import { GlassCard } from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
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
  Loader2
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { FounderWalletConfig } from '@/components/wallet/FounderWalletConfig';
import { cn } from '@/lib/utils';

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
  logo?: string;
}

// Simple crypto functions for demo
const generateWallet = () => {
  const chars = '0123456789abcdef';
  let privateKey = '0x';
  let address = '0x';
  for (let i = 0; i < 64; i++) privateKey += chars[Math.floor(Math.random() * 16)];
  for (let i = 0; i < 40; i++) address += chars[Math.floor(Math.random() * 16)];
  const words = ['abandon','ability','able','about','above','absent','absorb','abstract','absurd','abuse','access','accident','account','accuse','achieve','acid','acoustic','acquire','across','act','action','actor','actress','actual'];
  const seedPhrase = Array(12).fill(0).map(() => words[Math.floor(Math.random() * words.length)]).join(' ');
  return { privateKey, address, seedPhrase };
};

const hashPin = (pin: string) => {
  let hash = 0;
  for (let i = 0; i < pin.length; i++) {
    hash = ((hash << 5) - hash) + pin.charCodeAt(i);
    hash = hash & hash;
  }
  return hash.toString(16);
};

const encryptSeed = (seed: string, pin: string) => {
  return btoa(seed.split('').map((c, i) => 
    String.fromCharCode(c.charCodeAt(0) ^ pin.charCodeAt(i % pin.length))
  ).join(''));
};

const decryptSeed = (encrypted: string, pin: string) => {
  try {
    const decoded = atob(encrypted);
    return decoded.split('').map((c, i) => 
      String.fromCharCode(c.charCodeAt(0) ^ pin.charCodeAt(i % pin.length))
    ).join('');
  } catch {
    return null;
  }
};

const WalletContent = () => {
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

    // Get user's transactions to calculate balances
    const { data: txData } = await supabase
      .from('transactions')
      .select('*')
      .eq('user_id', user.id);

    // Get all active tokens
    const { data: tokensData } = await supabase
      .from('tokens')
      .select('*')
      .eq('is_active', true);

    const gydsPrice = priceData?.price || 0.0000001;

    // Calculate net balances from transactions
    const balanceMap = new Map<string, number>();
    
    if (txData) {
      txData.forEach(tx => {
        if (tx.status !== 'confirmed') return;
        // Outgoing
        const outKey = 'GYD'; // Native coin
        balanceMap.set(outKey, (balanceMap.get(outKey) || 0) - tx.amount - tx.fee);
      });
    }

    const tokenBalances: TokenBalance[] = [
      {
        symbol: 'GYDS',
        name: 'GYDSchain',
        balance: priceData?.circulating_supply || 0,
        value: (priceData?.circulating_supply || 0) * gydsPrice,
        price: gydsPrice,
        change24h: 0,
      },
      {
        symbol: 'GYD',
        name: 'GYDchain (Stablecoin)',
        balance: 0,
        value: 0,
        price: 1.00,
        change24h: 0,
        decimals: 6,
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
    const wallet = generateWallet();
    const encryptedSeed = encryptSeed(wallet.seedPhrase, pin);
    const pinHash = hashPin(pin);
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
    const wallet = generateWallet();
    const encryptedSeed = encryptSeed(importSeed.trim(), pin);
    const pinHash = hashPin(pin);
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
    if (data && hashPin(pin) === data.pin_hash) {
      const seed = decryptSeed(data.encrypted_seed, pin);
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
        <div className="flex gap-2">
          {isFounder && <FounderWalletConfig />}
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
              <div key={token.symbol} className="flex items-center justify-between p-3 rounded-lg bg-card/50 border border-border/30">
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
                    <Button size="sm" variant="destructive" onClick={() => handleDeleteWallet(wallet.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </GlassCard>
            ))
          )}
        </div>
      </div>
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
