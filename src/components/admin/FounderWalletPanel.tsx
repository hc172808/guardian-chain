import { useState, useEffect } from 'react';
import { GlassCard } from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Wallet, Plus, Copy, Eye, EyeOff, RefreshCw, ShieldCheck, Key, Trash2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { api } from '@/lib/api';
import {
  generateSecureWallet,
  encryptWithPin,
  hashPin,
  decryptWithPin,
} from '@/lib/walletCrypto';

interface WalletRow {
  id: string;
  address: string;
  encryptedSeed?: string;
  encrypted_seed?: string;
  createdAt?: string;
  created_at?: string;
}

export const FounderWalletPanel = () => {
  const { user } = useAuth();
  const { toast } = useToast();

  const [wallets, setWallets] = useState<WalletRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [newWallet, setNewWallet] = useState<{ address: string; seedPhrase: string } | null>(null);
  const [revealedSeeds, setRevealedSeeds] = useState<Record<string, string | null>>({});
  const [revealPin, setRevealPin] = useState<Record<string, string>>({});
  const [revealingId, setRevealingId] = useState<string | null>(null);
  const [showPin, setShowPin] = useState(false);

  const fetchWallets = async () => {
    setLoading(true);
    try {
      const data = await api.get('/api/wallets');
      setWallets(Array.isArray(data) ? data : []);
    } catch {
      setWallets([]);
    }
    setLoading(false);
  };

  useEffect(() => { fetchWallets(); }, []);

  const copyToClipboard = (text: string, label = 'Copied') => {
    navigator.clipboard.writeText(text).then(() => {
      toast({ title: label });
    }).catch(() => {
      toast({ title: 'Copy failed', variant: 'destructive' });
    });
  };

  const handleCreate = async () => {
    if (pin.length < 4) {
      toast({ title: 'PIN must be at least 4 digits', variant: 'destructive' });
      return;
    }
    if (pin !== confirmPin) {
      toast({ title: 'PINs do not match', variant: 'destructive' });
      return;
    }
    setCreating(true);
    try {
      const wallet = generateSecureWallet();
      const encryptedSeed = await encryptWithPin(wallet.seedPhrase, pin);
      const pinHash = await hashPin(pin);
      await api.post('/api/wallets', {
        address: wallet.address,
        encrypted_seed: encryptedSeed,
        pin_hash: pinHash,
      });
      setNewWallet({ address: wallet.address, seedPhrase: wallet.seedPhrase });
      setPin('');
      setConfirmPin('');
      setShowForm(false);
      await fetchWallets();
      toast({ title: 'Wallet created!', description: `Address: ${wallet.address.slice(0, 10)}...` });
    } catch (err: any) {
      toast({ title: 'Failed to create wallet', description: err.message, variant: 'destructive' });
    }
    setCreating(false);
  };

  const handleRevealSeed = async (wallet: WalletRow) => {
    const id = wallet.id;
    const encSeed = wallet.encryptedSeed ?? wallet.encrypted_seed ?? '';
    const p = revealPin[id] ?? '';
    if (!p) {
      toast({ title: 'Enter your PIN first', variant: 'destructive' });
      return;
    }
    setRevealingId(id);
    const seed = await decryptWithPin(encSeed, p);
    setRevealingId(null);
    if (!seed) {
      toast({ title: 'Wrong PIN', variant: 'destructive' });
    } else {
      setRevealedSeeds(prev => ({ ...prev, [id]: seed }));
    }
  };

  const handleDelete = async (id: string, address: string) => {
    if (!confirm(`Delete wallet ${address.slice(0, 10)}...? This is permanent.`)) return;
    try {
      await api.delete(`/api/wallets/${id}`);
      setWallets(prev => prev.filter(w => w.id !== id));
      toast({ title: 'Wallet deleted' });
    } catch {
      toast({ title: 'Failed to delete wallet', variant: 'destructive' });
    }
  };

  return (
    <div className="space-y-6">
      <GlassCard className="p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-lg bg-primary/20">
              <Wallet className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h3 className="font-semibold text-lg">Founder Wallets</h3>
              <p className="text-sm text-muted-foreground">
                Create and manage GYDS wallets for your founder account
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={fetchWallets} disabled={loading}>
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
            <Button size="sm" onClick={() => setShowForm(v => !v)} className="gap-2">
              <Plus className="h-4 w-4" />
              New Wallet
            </Button>
          </div>
        </div>

        {showForm && (
          <div className="mb-6 p-4 rounded-xl border border-primary/30 bg-primary/5 space-y-4">
            <div className="flex items-center gap-2 text-primary font-medium">
              <Key className="h-4 w-4" />
              Create New Wallet
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground font-medium">Wallet PIN (min 4 digits)</label>
                <div className="relative">
                  <Input
                    type={showPin ? 'text' : 'password'}
                    placeholder="Enter PIN"
                    value={pin}
                    onChange={e => setPin(e.target.value.replace(/\D/g, ''))}
                    maxLength={16}
                    className="pr-10"
                  />
                  <button
                    type="button"
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    onClick={() => setShowPin(v => !v)}
                  >
                    {showPin ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground font-medium">Confirm PIN</label>
                <Input
                  type={showPin ? 'text' : 'password'}
                  placeholder="Confirm PIN"
                  value={confirmPin}
                  onChange={e => setConfirmPin(e.target.value.replace(/\D/g, ''))}
                  maxLength={16}
                />
              </div>
            </div>
            <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs text-amber-400">
              <strong>Important:</strong> Save your PIN securely — it's needed to view your seed phrase. If lost, the seed phrase cannot be recovered.
            </div>
            <div className="flex gap-2">
              <Button onClick={handleCreate} disabled={creating} className="gap-2">
                {creating ? <RefreshCw className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                {creating ? 'Creating…' : 'Generate Wallet'}
              </Button>
              <Button variant="outline" onClick={() => { setShowForm(false); setPin(''); setConfirmPin(''); }}>
                Cancel
              </Button>
            </div>
          </div>
        )}

        {newWallet && (
          <div className="mb-6 p-4 rounded-xl border border-green-500/40 bg-green-500/5 space-y-3">
            <div className="flex items-center gap-2 text-green-400 font-semibold">
              <ShieldCheck className="h-4 w-4" />
              Wallet Created — Save Your Seed Phrase!
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Address</p>
              <div className="flex items-center gap-2">
                <code className="font-mono text-sm bg-background/60 px-2 py-1 rounded flex-1 break-all">{newWallet.address}</code>
                <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" onClick={() => copyToClipboard(newWallet.address, 'Address copied')}>
                  <Copy className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Seed Phrase (write this down — shown once)</p>
              <div className="flex items-start gap-2">
                <code className="font-mono text-sm bg-background/60 px-2 py-2 rounded flex-1 leading-relaxed text-amber-400">{newWallet.seedPhrase}</code>
                <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" onClick={() => copyToClipboard(newWallet.seedPhrase, 'Seed phrase copied')}>
                  <Copy className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={() => setNewWallet(null)}>
              I've saved it — dismiss
            </Button>
          </div>
        )}

        {loading ? (
          <div className="text-center py-8 text-muted-foreground text-sm">Loading wallets…</div>
        ) : wallets.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Wallet className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p>No wallets yet</p>
            <p className="text-xs mt-1">Click "New Wallet" to generate your first GYDS wallet</p>
          </div>
        ) : (
          <div className="space-y-3">
            {wallets.map(wallet => {
              const addr = wallet.address;
              const id = wallet.id;
              const seed = revealedSeeds[id];
              const createdAt = wallet.createdAt ?? wallet.created_at;
              return (
                <div key={id} className="p-4 rounded-xl border border-border/50 bg-secondary/20 space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="p-2 rounded-lg bg-primary/20 shrink-0">
                        <Wallet className="h-4 w-4 text-primary" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <code className="font-mono text-sm truncate max-w-[200px] sm:max-w-xs">{addr}</code>
                          <Badge variant="outline" className="text-xs text-primary border-primary/40">GYDS</Badge>
                        </div>
                        {createdAt && (
                          <p className="text-xs text-muted-foreground mt-0.5">
                            Created {new Date(createdAt).toLocaleString()}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => copyToClipboard(addr, 'Address copied')}>
                        <Copy className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-red-400 hover:text-red-300" onClick={() => handleDelete(id, addr)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>

                  {seed ? (
                    <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 space-y-2">
                      <p className="text-xs font-medium text-amber-400">Seed Phrase</p>
                      <div className="flex items-start gap-2">
                        <code className="font-mono text-xs text-amber-400 flex-1 leading-relaxed">{seed}</code>
                        <Button size="icon" variant="ghost" className="h-6 w-6 shrink-0" onClick={() => copyToClipboard(seed, 'Seed copied')}>
                          <Copy className="h-3 w-3" />
                        </Button>
                      </div>
                      <Button variant="ghost" size="sm" className="text-xs h-6" onClick={() => setRevealedSeeds(prev => ({ ...prev, [id]: null }))}>
                        Hide
                      </Button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <Input
                        type="password"
                        placeholder="PIN to reveal seed"
                        value={revealPin[id] ?? ''}
                        onChange={e => setRevealPin(prev => ({ ...prev, [id]: e.target.value.replace(/\D/g, '') }))}
                        maxLength={16}
                        className="h-8 text-sm max-w-[160px]"
                        onKeyDown={e => e.key === 'Enter' && handleRevealSeed(wallet)}
                      />
                      <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs"
                        onClick={() => handleRevealSeed(wallet)}
                        disabled={revealingId === id}
                      >
                        {revealingId === id ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Eye className="h-3 w-3" />}
                        Reveal Seed
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </GlassCard>
    </div>
  );
};
