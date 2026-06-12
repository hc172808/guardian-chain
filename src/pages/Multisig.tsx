import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Layout } from '@/components/layout/Layout';
import { GlassCard } from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import {
  Shield, Plus, CheckCircle2, XCircle, Clock,
  Users, Send, Copy, RefreshCw, Trash2
} from 'lucide-react';

interface Signer { id: string; address: string; name: string; user_id: string; }
interface MSWallet { id: string; name: string; address: string; threshold: number; balance: string; signers: Signer[]; created_at: string; }
interface MSTx {
  id: string; wallet_id: string; proposer_id: string;
  to_address: string; amount: string; symbol: string; description: string;
  approvals: number; rejections: number; status: 'pending' | 'executed' | 'rejected';
  created_at: string; signatures: { signer_id: string; action: string; signed_at: string }[];
}

const fmtRelative = (d: string) => {
  const diff = Date.now() - new Date(d).getTime();
  if (diff < 60000) return 'just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return new Date(d).toLocaleDateString();
};

const MultisigPage = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [wallets, setWallets] = useState<MSWallet[]>([]);
  const [txs, setTxs] = useState<MSTx[]>([]);
  const [selectedWalletId, setSelectedWalletId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [txLoading, setTxLoading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [showPropose, setShowPropose] = useState(false);
  const [signing, setSigning] = useState<string | null>(null);

  // Create wallet form
  const [newName, setNewName] = useState('');
  const [newThreshold, setNewThreshold] = useState('2');
  const [signerFields, setSignerFields] = useState([
    { address: '', name: '' }, { address: '', name: '' }, { address: '', name: '' },
  ]);
  const [creating, setCreating] = useState(false);

  // Propose tx form
  const [propTo, setPropTo] = useState('');
  const [propAmount, setPropAmount] = useState('');
  const [propDesc, setPropDesc] = useState('');
  const [proposing, setProposing] = useState(false);

  const selectedWallet = wallets.find(w => w.id === selectedWalletId) ?? wallets[0] ?? null;

  const fetchWallets = useCallback(async () => {
    if (!user) { setLoading(false); return; }
    setLoading(true);
    try {
      const res = await fetch('/api/multisig/wallets', { credentials: 'include' });
      if (res.ok) {
        const data: MSWallet[] = await res.json();
        setWallets(data);
        if (data.length > 0 && !selectedWalletId) setSelectedWalletId(data[0].id);
      }
    } finally { setLoading(false); }
  }, [user]);

  const fetchTxs = useCallback(async (walletId: string) => {
    setTxLoading(true);
    try {
      const res = await fetch(`/api/multisig/wallets/${walletId}/transactions`, { credentials: 'include' });
      if (res.ok) setTxs(await res.json());
    } finally { setTxLoading(false); }
  }, []);

  useEffect(() => { fetchWallets(); }, [fetchWallets]);
  useEffect(() => { if (selectedWalletId) fetchTxs(selectedWalletId); }, [selectedWalletId, fetchTxs]);

  const createWallet = async () => {
    const signers = signerFields.filter(s => s.address.trim());
    if (!newName.trim() || signers.length < 2) {
      toast({ title: 'Need a name and at least 2 signers', variant: 'destructive' }); return;
    }
    setCreating(true);
    try {
      const res = await fetch('/api/multisig/wallets', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim(), threshold: parseInt(newThreshold), signers }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast({ title: '✅ Multi-sig wallet created!', description: `${newThreshold}-of-${signers.length} wallet ready` });
      setShowCreate(false); setNewName('');
      fetchWallets();
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally { setCreating(false); }
  };

  const proposeTx = async () => {
    if (!selectedWallet || !propTo || !propAmount) {
      toast({ title: 'Fill all required fields', variant: 'destructive' }); return;
    }
    setProposing(true);
    try {
      const res = await fetch('/api/multisig/transactions', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ walletId: selectedWallet.id, toAddress: propTo, amount: parseFloat(propAmount), description: propDesc }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast({ title: 'Transaction proposed', description: `Needs ${selectedWallet.threshold - 1} more signature(s).` });
      setPropTo(''); setPropAmount(''); setPropDesc('');
      setShowPropose(false);
      fetchTxs(selectedWallet.id);
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally { setProposing(false); }
  };

  const signTx = async (txId: string, action: 'approve' | 'reject') => {
    setSigning(txId);
    try {
      const res = await fetch(`/api/multisig/transactions/${txId}/sign`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      toast({ title: action === 'approve' ? 'Signature added ✅' : 'Transaction rejected' });
      if (selectedWalletId) fetchTxs(selectedWalletId);
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally { setSigning(null); }
  };

  if (!user) {
    return (
      <Layout>
        <GlassCard className="p-8 text-center">
          <Shield className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
          <p className="font-semibold">Sign in to use Multi-Sig Wallet</p>
        </GlassCard>
      </Layout>
    );
  }

  return (
    <Layout>
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Shield className="w-6 h-6 text-primary" /> Multi-Sig Wallet
            </h1>
            <p className="text-muted-foreground text-sm mt-1">Shared wallets requiring multiple signatures</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={fetchWallets} disabled={loading}>
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
            <Button onClick={() => setShowCreate(true)} className="gap-2 shrink-0">
              <Plus className="w-4 h-4" /> New Wallet
            </Button>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 text-muted-foreground py-8 justify-center">
            <RefreshCw className="w-5 h-5 animate-spin" /> Loading wallets…
          </div>
        ) : wallets.length === 0 ? (
          <GlassCard className="p-10 text-center space-y-3">
            <Shield className="w-12 h-12 text-muted-foreground mx-auto opacity-30" />
            <p className="font-semibold">No multi-sig wallets yet</p>
            <p className="text-sm text-muted-foreground">Create one to share control of funds with multiple signers.</p>
            <Button onClick={() => setShowCreate(true)} className="gap-2">
              <Plus className="w-4 h-4" /> Create Multi-Sig Wallet
            </Button>
          </GlassCard>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Wallet list */}
            <div className="space-y-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Your Wallets</p>
              {wallets.map(w => (
                <GlassCard
                  key={w.id}
                  className={`p-4 cursor-pointer transition-colors ${selectedWalletId === w.id ? 'border-primary/40 bg-primary/5' : 'hover:border-primary/20'}`}
                  onClick={() => setSelectedWalletId(w.id)}
                >
                  <div className="flex items-center justify-between mb-2">
                    <p className="font-semibold text-sm">{w.name}</p>
                    <Badge variant="outline" className="text-xs">{w.threshold}-of-{w.signers?.length ?? '?'}</Badge>
                  </div>
                  <p className="font-mono text-xs text-muted-foreground mb-2 truncate">{w.address}</p>
                  <p className="text-sm font-bold text-primary">{Number(w.balance).toLocaleString()} GYDS</p>
                </GlassCard>
              ))}
            </div>

            {/* Wallet detail */}
            {selectedWallet && (
              <div className="lg:col-span-2 space-y-4">
                <GlassCard className="p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="font-bold text-lg">{selectedWallet.name}</h2>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="font-mono text-xs text-muted-foreground">{selectedWallet.address}</span>
                        <button onClick={() => { navigator.clipboard.writeText(selectedWallet.address); toast({ title: 'Copied!' }); }}>
                          <Copy className="w-3 h-3 text-muted-foreground hover:text-primary" />
                        </button>
                      </div>
                    </div>
                    <Button size="sm" onClick={() => setShowPropose(true)} className="gap-2">
                      <Send className="w-3.5 h-3.5" /> Propose Tx
                    </Button>
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { label: 'GYDS Balance', value: Number(selectedWallet.balance).toLocaleString() },
                      { label: 'Required Sigs', value: selectedWallet.threshold },
                      { label: 'Total Signers', value: selectedWallet.signers?.length ?? 0 },
                    ].map(s => (
                      <div key={s.label} className="p-3 bg-muted/20 rounded-xl text-center">
                        <p className="text-lg font-bold text-primary">{s.value}</p>
                        <p className="text-xs text-muted-foreground">{s.label}</p>
                      </div>
                    ))}
                  </div>

                  {/* Signers */}
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Signers</p>
                    <div className="space-y-2">
                      {(selectedWallet.signers ?? []).map(s => (
                        <div key={s.id ?? s.address} className="flex items-center gap-3 p-2 bg-muted/20 rounded-lg">
                          <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold text-primary">
                            {(s.name ?? s.address)?.[0]?.toUpperCase() ?? '?'}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium">{s.name ?? 'Unknown'}</p>
                            <p className="text-xs font-mono text-muted-foreground truncate">{s.address}</p>
                          </div>
                          <Badge variant="outline" className="text-xs shrink-0">Signer</Badge>
                        </div>
                      ))}
                    </div>
                  </div>
                </GlassCard>

                {/* Transactions */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Transactions</p>
                    {txLoading && <RefreshCw className="w-3.5 h-3.5 text-muted-foreground animate-spin" />}
                  </div>
                  {txs.length === 0 && !txLoading && (
                    <GlassCard className="p-6 text-center text-muted-foreground text-sm">
                      No transactions yet. Propose one above.
                    </GlassCard>
                  )}
                  {txs.map(t => {
                    const mySignature = t.signatures?.find(s => s.signer_id === user.id);
                    return (
                      <GlassCard key={t.id} className="p-4 space-y-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                              <Badge variant="outline" className={`text-xs ${t.status === 'pending' ? 'text-amber-400 border-amber-500/30' : t.status === 'executed' ? 'text-emerald-400 border-emerald-500/30' : 'text-red-400 border-red-500/30'}`}>
                                {t.status === 'pending' ? <Clock className="w-3 h-3 mr-1" /> : t.status === 'executed' ? <CheckCircle2 className="w-3 h-3 mr-1" /> : <XCircle className="w-3 h-3 mr-1" />}
                                {t.status}
                              </Badge>
                              <span className="text-xs text-muted-foreground">{fmtRelative(t.created_at)}</span>
                            </div>
                            <p className="font-semibold">{Number(t.amount).toLocaleString()} {t.symbol}</p>
                            <p className="text-xs text-muted-foreground truncate">To: <span className="font-mono">{t.to_address}</span></p>
                            {t.description && <p className="text-xs text-muted-foreground">{t.description}</p>}
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-sm font-bold">{t.approvals}/{selectedWallet.threshold}</p>
                            <p className="text-xs text-muted-foreground">signatures</p>
                            <div className="flex gap-1 mt-1 justify-end">
                              {Array.from({ length: selectedWallet.threshold }).map((_, i) => (
                                <div key={i} className={`w-2 h-2 rounded-full ${i < t.approvals ? 'bg-primary' : 'bg-muted'}`} />
                              ))}
                            </div>
                          </div>
                        </div>
                        {t.status === 'pending' && !mySignature && (
                          <div className="flex gap-2 pt-1 border-t border-border/20">
                            <Button size="sm" onClick={() => signTx(t.id, 'approve')} disabled={signing === t.id}
                              className="gap-1 bg-emerald-600 hover:bg-emerald-700 text-xs">
                              {signing === t.id ? <RefreshCw className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />} Approve
                            </Button>
                            <Button size="sm" variant="destructive" onClick={() => signTx(t.id, 'reject')} disabled={signing === t.id}
                              className="gap-1 text-xs">
                              <XCircle className="w-3 h-3" /> Reject
                            </Button>
                          </div>
                        )}
                        {mySignature && (
                          <p className="text-xs text-muted-foreground pt-1 border-t border-border/20">
                            You {mySignature.action === 'approve' ? '✅ approved' : '❌ rejected'} {fmtRelative(mySignature.signed_at)}
                          </p>
                        )}
                      </GlassCard>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Create Wallet Modal */}
        {showCreate && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={() => setShowCreate(false)}>
            <GlassCard className="p-6 w-full max-w-md space-y-4" onClick={e => e.stopPropagation()}>
              <h2 className="font-bold text-lg flex items-center gap-2">
                <Shield className="w-5 h-5 text-primary" /> Create Multi-Sig Wallet
              </h2>
              <div>
                <Label className="text-xs text-muted-foreground">Wallet Name</Label>
                <Input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Team Treasury" className="mt-1" />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Required Signatures (threshold)</Label>
                <select value={newThreshold} onChange={e => setNewThreshold(e.target.value)}
                  className="w-full mt-1 bg-muted/30 border border-border/40 rounded-lg px-3 py-2 text-sm">
                  {['1', '2', '3', '4', '5'].map(v => <option key={v}>{v}</option>)}
                </select>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground mb-2 block">Signers</Label>
                {signerFields.map((s, i) => (
                  <div key={i} className="grid grid-cols-2 gap-2 mb-2">
                    <Input value={s.address} onChange={e => setSignerFields(prev => prev.map((x, j) => j === i ? { ...x, address: e.target.value } : x))}
                      placeholder={`Signer ${i + 1} address`} className="font-mono text-xs" />
                    <Input value={s.name} onChange={e => setSignerFields(prev => prev.map((x, j) => j === i ? { ...x, name: e.target.value } : x))}
                      placeholder="Name (optional)" className="text-xs" />
                  </div>
                ))}
                <button onClick={() => setSignerFields(prev => [...prev, { address: '', name: '' }])}
                  className="text-xs text-primary hover:underline">+ Add signer</button>
              </div>
              <div className="flex gap-2 justify-end pt-2">
                <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
                <Button onClick={createWallet} disabled={creating}>
                  {creating ? <><RefreshCw className="w-4 h-4 animate-spin mr-2" />Creating…</> : 'Create Wallet'}
                </Button>
              </div>
            </GlassCard>
          </motion.div>
        )}

        {/* Propose Tx Modal */}
        {showPropose && selectedWallet && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={() => setShowPropose(false)}>
            <GlassCard className="p-6 w-full max-w-md space-y-4" onClick={e => e.stopPropagation()}>
              <h2 className="font-bold text-lg">Propose Transaction</h2>
              <p className="text-xs text-muted-foreground">
                From: <strong>{selectedWallet.name}</strong> · Needs {selectedWallet.threshold} of {selectedWallet.signers?.length ?? '?'} signatures
              </p>
              <div className="space-y-3">
                <div>
                  <Label className="text-xs text-muted-foreground">To Address *</Label>
                  <Input value={propTo} onChange={e => setPropTo(e.target.value)} placeholder="0x…" className="font-mono mt-1" />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Amount (GYDS) *</Label>
                  <Input type="number" value={propAmount} onChange={e => setPropAmount(e.target.value)} placeholder="0.0" className="mt-1" />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Description</Label>
                  <Input value={propDesc} onChange={e => setPropDesc(e.target.value)} placeholder="What is this for?" className="mt-1" />
                </div>
              </div>
              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => setShowPropose(false)}>Cancel</Button>
                <Button onClick={proposeTx} disabled={proposing}>
                  {proposing ? <><RefreshCw className="w-4 h-4 animate-spin mr-2" />Proposing…</> : 'Propose'}
                </Button>
              </div>
            </GlassCard>
          </motion.div>
        )}
      </motion.div>
    </Layout>
  );
};

export default MultisigPage;
