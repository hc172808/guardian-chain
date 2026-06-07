import { useState } from 'react';
import { motion } from 'framer-motion';
import { Layout } from '@/components/layout/Layout';
import { GlassCard } from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import {
  Shield, Plus, Key, CheckCircle2, XCircle, Clock,
  Users, Send, Copy, Trash2, RefreshCw
} from 'lucide-react';

interface Signer { address: string; name: string; approved: boolean | null; }
interface MultisigWallet { id: string; name: string; address: string; threshold: number; signers: Signer[]; balance: number; }
interface MultisigTx { id: string; walletId: string; to: string; amount: number; symbol: string; desc: string; approvals: number; required: number; status: 'pending' | 'executed' | 'rejected'; createdAt: string; }

const DEMO_WALLETS: MultisigWallet[] = [
  {
    id: '1', name: 'Team Treasury', address: '0xmulti1…abc', threshold: 2, balance: 500_000,
    signers: [
      { address: '0xAlice…1234', name: 'Alice', approved: true },
      { address: '0xBob…5678', name: 'Bob', approved: null },
      { address: '0xCarol…9abc', name: 'Carol', approved: null },
    ],
  },
  {
    id: '2', name: 'Dev Fund (3-of-5)', address: '0xmulti2…def', threshold: 3, balance: 1_200_000,
    signers: [
      { address: '0xDave…1111', name: 'Dave', approved: true },
      { address: '0xEve…2222', name: 'Eve', approved: true },
      { address: '0xFrank…3333', name: 'Frank', approved: null },
      { address: '0xGrace…4444', name: 'Grace', approved: null },
      { address: '0xHank…5555', name: 'Hank', approved: null },
    ],
  },
];

const DEMO_TXS: MultisigTx[] = [
  { id: 't1', walletId: '1', to: '0xRecipient…abc', amount: 50_000, symbol: 'GYDS', desc: 'Q3 dev grant payment', approvals: 1, required: 2, status: 'pending', createdAt: '2h ago' },
  { id: 't2', walletId: '1', to: '0xAudit…def', amount: 20_000, symbol: 'GYDS', desc: 'Security audit deposit', approvals: 2, required: 2, status: 'executed', createdAt: '1d ago' },
  { id: 't3', walletId: '2', to: '0xMarketing…ghi', amount: 100_000, symbol: 'GYDS', desc: 'Marketing campaign', approvals: 2, required: 3, status: 'pending', createdAt: '3d ago' },
];

const MultisigPage = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [wallets] = useState<MultisigWallet[]>(DEMO_WALLETS);
  const [txs, setTxs] = useState<MultisigTx[]>(DEMO_TXS);
  const [selectedWallet, setSelectedWallet] = useState<MultisigWallet>(DEMO_WALLETS[0]);
  const [showCreate, setShowCreate] = useState(false);
  const [showPropose, setShowPropose] = useState(false);
  const [threshold, setThreshold] = useState('2');
  const [signerAddresses, setSignerAddresses] = useState(['', '', '']);
  const [propTo, setPropTo] = useState('');
  const [propAmount, setPropAmount] = useState('');
  const [propDesc, setPropDesc] = useState('');

  const approve = (txId: string) => {
    setTxs(prev => prev.map(t => t.id === txId ? { ...t, approvals: Math.min(t.approvals + 1, t.required) } : t));
    toast({ title: 'Signature added', description: 'Your approval has been recorded.' });
  };

  const reject = (txId: string) => {
    setTxs(prev => prev.map(t => t.id === txId ? { ...t, status: 'rejected' } : t));
    toast({ title: 'Transaction rejected' });
  };

  const propose = () => {
    if (!propTo || !propAmount) { toast({ title: 'Fill all fields', variant: 'destructive' }); return; }
    const t: MultisigTx = {
      id: Date.now().toString(), walletId: selectedWallet.id, to: propTo,
      amount: parseFloat(propAmount), symbol: 'GYDS', desc: propDesc,
      approvals: 1, required: selectedWallet.threshold, status: 'pending', createdAt: 'Just now',
    };
    setTxs(prev => [t, ...prev]);
    setPropTo(''); setPropAmount(''); setPropDesc('');
    setShowPropose(false);
    toast({ title: 'Transaction proposed', description: `Needs ${selectedWallet.threshold - 1} more signatures.` });
  };

  const walletTxs = txs.filter(t => t.walletId === selectedWallet.id);

  return (
    <Layout>
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Shield className="w-6 h-6 text-primary" /> Multi-Sig Wallet
            </h1>
            <p className="text-muted-foreground text-sm mt-1">Shared wallets requiring multiple signatures for transactions</p>
          </div>
          <Button onClick={() => setShowCreate(true)} className="gap-2 shrink-0">
            <Plus className="w-4 h-4" /> New Wallet
          </Button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Wallet list */}
          <div className="space-y-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Your Wallets</p>
            {wallets.map(w => (
              <GlassCard
                key={w.id}
                className={`p-4 cursor-pointer transition-colors ${selectedWallet.id === w.id ? 'border-primary/40' : 'hover:border-primary/20'}`}
                onClick={() => setSelectedWallet(w)}
              >
                <div className="flex items-center justify-between mb-2">
                  <p className="font-semibold text-sm">{w.name}</p>
                  <Badge variant="outline" className="text-xs">{w.threshold}-of-{w.signers.length}</Badge>
                </div>
                <p className="font-mono text-xs text-muted-foreground mb-2">{w.address}</p>
                <p className="text-sm font-bold text-primary">{w.balance.toLocaleString()} GYDS</p>
              </GlassCard>
            ))}
          </div>

          {/* Wallet detail */}
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
                <div className="p-3 bg-muted/20 rounded-xl text-center">
                  <p className="text-lg font-bold text-primary">{selectedWallet.balance.toLocaleString()}</p>
                  <p className="text-xs text-muted-foreground">GYDS Balance</p>
                </div>
                <div className="p-3 bg-muted/20 rounded-xl text-center">
                  <p className="text-lg font-bold">{selectedWallet.threshold}</p>
                  <p className="text-xs text-muted-foreground">Required Sigs</p>
                </div>
                <div className="p-3 bg-muted/20 rounded-xl text-center">
                  <p className="text-lg font-bold">{selectedWallet.signers.length}</p>
                  <p className="text-xs text-muted-foreground">Total Signers</p>
                </div>
              </div>

              {/* Signers */}
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Signers</p>
                <div className="space-y-2">
                  {selectedWallet.signers.map(s => (
                    <div key={s.address} className="flex items-center gap-3 p-2 bg-muted/20 rounded-lg">
                      <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold text-primary">{s.name[0]}</div>
                      <div className="flex-1">
                        <p className="text-sm font-medium">{s.name}</p>
                        <p className="text-xs font-mono text-muted-foreground">{s.address}</p>
                      </div>
                      <Badge variant="outline" className="text-xs">Signer</Badge>
                    </div>
                  ))}
                </div>
              </div>
            </GlassCard>

            {/* Transactions */}
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Transactions</p>
              {walletTxs.length === 0 && <p className="text-sm text-muted-foreground">No transactions yet.</p>}
              {walletTxs.map(t => (
                <GlassCard key={t.id} className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-0.5">
                        <Badge variant="outline" className={`text-xs ${t.status === 'pending' ? 'text-amber-400 border-amber-500/30' : t.status === 'executed' ? 'text-emerald-400 border-emerald-500/30' : 'text-red-400 border-red-500/30'}`}>
                          {t.status === 'pending' ? <Clock className="w-3 h-3 mr-1" /> : t.status === 'executed' ? <CheckCircle2 className="w-3 h-3 mr-1" /> : <XCircle className="w-3 h-3 mr-1" />}
                          {t.status}
                        </Badge>
                        <span className="text-xs text-muted-foreground">{t.createdAt}</span>
                      </div>
                      <p className="font-semibold">{t.amount.toLocaleString()} {t.symbol}</p>
                      <p className="text-xs text-muted-foreground">To: <span className="font-mono">{t.to}</span></p>
                      {t.desc && <p className="text-xs text-muted-foreground">{t.desc}</p>}
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-bold">{t.approvals}/{t.required}</p>
                      <p className="text-xs text-muted-foreground">signatures</p>
                      <div className="flex gap-1 mt-1 justify-end">
                        {Array.from({ length: t.required }).map((_, i) => (
                          <div key={i} className={`w-2 h-2 rounded-full ${i < t.approvals ? 'bg-primary' : 'bg-muted'}`} />
                        ))}
                      </div>
                    </div>
                  </div>
                  {t.status === 'pending' && (
                    <div className="flex gap-2 pt-1 border-t border-border/20">
                      <Button size="sm" onClick={() => approve(t.id)} className="gap-1 bg-emerald-600 hover:bg-emerald-700 text-xs">
                        <CheckCircle2 className="w-3 h-3" /> Approve
                      </Button>
                      <Button size="sm" variant="destructive" onClick={() => reject(t.id)} className="gap-1 text-xs">
                        <XCircle className="w-3 h-3" /> Reject
                      </Button>
                    </div>
                  )}
                </GlassCard>
              ))}
            </div>
          </div>
        </div>

        {/* Propose Modal */}
        {showPropose && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={() => setShowPropose(false)}>
            <GlassCard className="p-6 w-full max-w-md space-y-4" onClick={e => e.stopPropagation()}>
              <h2 className="font-bold text-lg">Propose Transaction</h2>
              <div className="space-y-3">
                <div><Label className="text-xs text-muted-foreground">To Address</Label>
                  <Input value={propTo} onChange={e => setPropTo(e.target.value)} placeholder="0x…" className="font-mono" /></div>
                <div><Label className="text-xs text-muted-foreground">Amount (GYDS)</Label>
                  <Input type="number" value={propAmount} onChange={e => setPropAmount(e.target.value)} placeholder="0.0" /></div>
                <div><Label className="text-xs text-muted-foreground">Description</Label>
                  <Input value={propDesc} onChange={e => setPropDesc(e.target.value)} placeholder="What is this for?" /></div>
                <div className="text-xs text-muted-foreground p-2 bg-muted/20 rounded-lg">
                  Needs <strong>{selectedWallet.threshold}</strong> of {selectedWallet.signers.length} signatures to execute.
                </div>
              </div>
              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => setShowPropose(false)}>Cancel</Button>
                <Button onClick={propose}>Propose</Button>
              </div>
            </GlassCard>
          </motion.div>
        )}
      </motion.div>
    </Layout>
  );
};

export default MultisigPage;
