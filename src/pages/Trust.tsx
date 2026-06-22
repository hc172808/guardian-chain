import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Layout } from '@/components/layout/Layout';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import {
  Shield, Plus, Users, Lock, Unlock, FileText, Clock,
  ChevronRight, CheckCircle2, AlertCircle, Loader2, Copy,
  Trash2, Edit3, Eye, EyeOff, Coins, RefreshCw, X,
  ArrowRight, Star, HeartHandshake, Key, Calendar, TrendingUp
} from 'lucide-react';
import { cn } from '@/lib/utils';

const api = async (path: string, body?: object, method = 'POST') => {
  const res = await fetch(path, {
    method: body !== undefined ? method : 'GET',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? 'Request failed');
  return data;
};

type TrustType = 'revocable' | 'irrevocable' | 'testamentary' | 'special_needs' | 'spendthrift';
type TrustStatus = 'draft' | 'pending_payment' | 'active' | 'frozen' | 'closed';

interface Trust {
  id: string;
  name: string;
  type: TrustType;
  description: string;
  status: TrustStatus;
  feePaid: boolean;
  setupFeeTx?: string;
  trusteeAddress?: string;
  successorTrustee?: string;
  vaultBalance: string;
  totalBeneficiaries: number;
  createdAt: string;
  activatedAt?: string;
  expiresAt?: string;
}

interface Beneficiary {
  id: string;
  trustId: string;
  name: string;
  walletAddress: string;
  percentage: number;
  relationship: string;
  conditionNote?: string;
}

interface TrustCondition {
  id: string;
  trustId: string;
  type: 'time_lock' | 'age_check' | 'event' | 'multisig';
  description: string;
  triggerDate?: string;
  triggered: boolean;
}

const TRUST_TYPES: { id: TrustType; label: string; desc: string; icon: string }[] = [
  { id: 'revocable',      label: 'Revocable Trust',     desc: 'Can be changed or revoked at any time by the grantor.', icon: '🔄' },
  { id: 'irrevocable',    label: 'Irrevocable Trust',   desc: 'Cannot be changed once established. Maximum asset protection.', icon: '🔒' },
  { id: 'testamentary',   label: 'Testamentary Trust',  desc: 'Takes effect upon the grantor\'s passing.', icon: '📜' },
  { id: 'special_needs',  label: 'Special Needs Trust',  desc: 'Provides for a beneficiary with special needs without affecting benefits.', icon: '💚' },
  { id: 'spendthrift',    label: 'Spendthrift Trust',   desc: 'Protects beneficiaries from creditors and impulsive spending.', icon: '🛡️' },
];

const FEES = {
  setup: 50,
  annual: 10,
  emergency: 100,
  addBeneficiary: 5,
};

const STATUS_COLORS: Record<TrustStatus, string> = {
  draft:           'text-muted-foreground bg-muted/30',
  pending_payment: 'text-amber-400 bg-amber-500/10',
  active:          'text-green-400 bg-green-500/10',
  frozen:          'text-blue-400 bg-blue-500/10',
  closed:          'text-red-400 bg-red-500/10',
};

// ── Fee Badge ─────────────────────────────────────────────────────────────────
const FeeBadge = ({ amount, label }: { amount: number; label: string }) => (
  <div className="flex items-center justify-between p-3 rounded-lg border border-primary/20 bg-primary/5">
    <span className="text-sm text-muted-foreground">{label}</span>
    <span className="font-bold text-primary">{amount} GYDS</span>
  </div>
);

// ── Create Trust Wizard ───────────────────────────────────────────────────────
const CreateTrustWizard = ({ onDone }: { onDone: () => void }) => {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { toast } = useToast();

  const [form, setForm] = useState({
    name: '', type: '' as TrustType, description: '',
    trusteeAddress: '', successorTrustee: '',
    beneficiaries: [] as Omit<Beneficiary, 'id' | 'trustId'>[],
    conditions: [] as Omit<TrustCondition, 'id' | 'trustId' | 'triggered'>[],
    expiresAt: '',
  });

  // Beneficiary sub-form
  const [bForm, setBForm] = useState({ name: '', walletAddress: '', percentage: '', relationship: '', conditionNote: '' });
  const [cForm, setCForm] = useState({ type: 'time_lock' as TrustCondition['type'], description: '', triggerDate: '' });

  const set = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }));

  const addBeneficiary = () => {
    if (!bForm.name || !bForm.walletAddress || !bForm.percentage) { setError('Fill all beneficiary fields'); return; }
    const pct = parseFloat(bForm.percentage);
    const total = form.beneficiaries.reduce((s, b) => s + b.percentage, 0) + pct;
    if (total > 100) { setError('Total beneficiary percentages cannot exceed 100%'); return; }
    setForm(f => ({ ...f, beneficiaries: [...f.beneficiaries, { name: bForm.name, walletAddress: bForm.walletAddress, percentage: pct, relationship: bForm.relationship, conditionNote: bForm.conditionNote }] }));
    setBForm({ name: '', walletAddress: '', percentage: '', relationship: '', conditionNote: '' });
    setError('');
  };

  const addCondition = () => {
    if (!cForm.description) { setError('Enter a condition description'); return; }
    setForm(f => ({ ...f, conditions: [...f.conditions, { type: cForm.type, description: cForm.description, triggerDate: cForm.triggerDate }] }));
    setCForm({ type: 'time_lock', description: '', triggerDate: '' });
    setError('');
  };

  const handleCreate = async () => {
    setError(''); setLoading(true);
    try {
      await api('/api/trusts', form);
      toast({ title: 'Trust created!', description: 'Pay the setup fee to activate your trust.' });
      onDone();
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  };

  const totalPct = form.beneficiaries.reduce((s, b) => s + b.percentage, 0);

  const steps = [
    { n: 1, label: 'Type' },
    { n: 2, label: 'Details' },
    { n: 3, label: 'Beneficiaries' },
    { n: 4, label: 'Conditions' },
    { n: 5, label: 'Review & Pay' },
  ];

  return (
    <div className="space-y-6">
      {/* Progress */}
      <div className="flex items-center gap-1">
        {steps.map((s, i) => (
          <div key={s.n} className="flex items-center gap-1 flex-1">
            <div className={cn('w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 transition-all',
              step > s.n ? 'bg-green-500 text-white' : step === s.n ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground')}>
              {step > s.n ? '✓' : s.n}
            </div>
            <span className="text-[11px] text-muted-foreground hidden sm:block">{s.label}</span>
            {i < steps.length - 1 && <div className={cn('flex-1 h-0.5 mx-1', step > s.n ? 'bg-green-500' : 'bg-muted')} />}
          </div>
        ))}
      </div>

      {/* Step 1: Type */}
      {step === 1 && (
        <div className="space-y-3">
          <h3 className="font-semibold text-lg">Choose Trust Type</h3>
          <div className="grid gap-3">
            {TRUST_TYPES.map(t => (
              <button key={t.id} onClick={() => set('type', t.id)}
                className={cn('flex items-start gap-3 p-4 rounded-xl border text-left transition-all',
                  form.type === t.id ? 'border-primary bg-primary/10' : 'border-border hover:border-primary/50 bg-card')}>
                <span className="text-2xl shrink-0">{t.icon}</span>
                <div>
                  <p className="font-semibold text-sm">{t.label}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{t.desc}</p>
                </div>
                {form.type === t.id && <CheckCircle2 className="h-5 w-5 text-primary ml-auto shrink-0" />}
              </button>
            ))}
          </div>
          <div className="flex justify-end">
            <button disabled={!form.type} onClick={() => setStep(2)}
              className="px-6 py-2 rounded-lg bg-primary text-primary-foreground font-semibold text-sm disabled:opacity-50 flex items-center gap-2">
              Next <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* Step 2: Details */}
      {step === 2 && (
        <div className="space-y-4">
          <h3 className="font-semibold text-lg">Trust Details</h3>
          <div className="space-y-3">
            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Trust Name *</label>
              <input value={form.name} onChange={e => set('name', e.target.value)} placeholder="e.g. Smith Family Trust"
                className="w-full mt-1 px-3 py-2.5 rounded-lg bg-background border border-border focus:border-primary focus:outline-none text-sm" />
            </div>
            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Description</label>
              <textarea value={form.description} onChange={e => set('description', e.target.value)} rows={3}
                placeholder="Purpose and intent of this trust..."
                className="w-full mt-1 px-3 py-2 rounded-lg bg-background border border-border focus:border-primary focus:outline-none text-sm resize-none" />
            </div>
            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Primary Trustee Wallet Address</label>
              <input value={form.trusteeAddress} onChange={e => set('trusteeAddress', e.target.value)} placeholder="0x..."
                className="w-full mt-1 px-3 py-2.5 rounded-lg bg-background border border-border focus:border-primary focus:outline-none text-sm font-mono" />
              <p className="text-xs text-muted-foreground mt-1">Leave blank to use your own wallet as trustee</p>
            </div>
            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Successor Trustee Address <span className="normal-case text-muted-foreground/60">(optional)</span></label>
              <input value={form.successorTrustee} onChange={e => set('successorTrustee', e.target.value)} placeholder="0x..."
                className="w-full mt-1 px-3 py-2.5 rounded-lg bg-background border border-border focus:border-primary focus:outline-none text-sm font-mono" />
            </div>
            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Expiry Date <span className="normal-case text-muted-foreground/60">(optional)</span></label>
              <input type="date" value={form.expiresAt} onChange={e => set('expiresAt', e.target.value)}
                className="w-full mt-1 px-3 py-2.5 rounded-lg bg-background border border-border focus:border-primary focus:outline-none text-sm" />
            </div>
          </div>
          <div className="flex justify-between">
            <button onClick={() => setStep(1)} className="px-4 py-2 rounded-lg bg-muted text-muted-foreground text-sm font-medium hover:bg-muted/70">← Back</button>
            <button disabled={!form.name} onClick={() => setStep(3)}
              className="px-6 py-2 rounded-lg bg-primary text-primary-foreground font-semibold text-sm disabled:opacity-50 flex items-center gap-2">
              Next <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Beneficiaries */}
      {step === 3 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-lg">Beneficiaries</h3>
            <span className={cn('text-sm font-bold', totalPct > 100 ? 'text-destructive' : totalPct === 100 ? 'text-green-400' : 'text-muted-foreground')}>
              {totalPct}% / 100%
            </span>
          </div>

          {form.beneficiaries.length > 0 && (
            <div className="space-y-2">
              {form.beneficiaries.map((b, i) => (
                <div key={i} className="flex items-center gap-3 p-3 rounded-lg bg-card border border-border">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm">{b.name} <span className="text-muted-foreground text-xs">· {b.relationship}</span></p>
                    <p className="text-xs text-muted-foreground font-mono truncate">{b.walletAddress}</p>
                  </div>
                  <span className="font-bold text-primary text-sm">{b.percentage}%</span>
                  <button onClick={() => setForm(f => ({ ...f, beneficiaries: f.beneficiaries.filter((_, j) => j !== i) }))}
                    className="text-muted-foreground hover:text-destructive transition-colors"><Trash2 className="h-4 w-4" /></button>
                </div>
              ))}
            </div>
          )}

          <div className="p-4 rounded-xl border border-dashed border-border space-y-3">
            <p className="text-sm font-medium text-muted-foreground">Add Beneficiary</p>
            <div className="grid grid-cols-2 gap-2">
              <input value={bForm.name} onChange={e => setBForm(f => ({ ...f, name: e.target.value }))} placeholder="Full name"
                className="px-3 py-2 rounded-lg bg-background border border-border text-sm focus:border-primary focus:outline-none" />
              <input value={bForm.relationship} onChange={e => setBForm(f => ({ ...f, relationship: e.target.value }))} placeholder="Relationship"
                className="px-3 py-2 rounded-lg bg-background border border-border text-sm focus:border-primary focus:outline-none" />
            </div>
            <input value={bForm.walletAddress} onChange={e => setBForm(f => ({ ...f, walletAddress: e.target.value }))} placeholder="Wallet address (0x...)"
              className="w-full px-3 py-2 rounded-lg bg-background border border-border text-sm font-mono focus:border-primary focus:outline-none" />
            <div className="grid grid-cols-2 gap-2">
              <input type="number" value={bForm.percentage} onChange={e => setBForm(f => ({ ...f, percentage: e.target.value }))} placeholder="Share %"
                className="px-3 py-2 rounded-lg bg-background border border-border text-sm focus:border-primary focus:outline-none" />
              <input value={bForm.conditionNote} onChange={e => setBForm(f => ({ ...f, conditionNote: e.target.value }))} placeholder="Conditions (optional)"
                className="px-3 py-2 rounded-lg bg-background border border-border text-sm focus:border-primary focus:outline-none" />
            </div>
            <button onClick={addBeneficiary} className="w-full py-2 rounded-lg border border-primary/30 text-primary text-sm font-medium hover:bg-primary/5 flex items-center justify-center gap-2">
              <Plus className="h-4 w-4" /> Add Beneficiary
            </button>
          </div>
          {error && <p className="text-destructive text-xs">{error}</p>}
          <div className="flex justify-between">
            <button onClick={() => setStep(2)} className="px-4 py-2 rounded-lg bg-muted text-muted-foreground text-sm font-medium hover:bg-muted/70">← Back</button>
            <button onClick={() => { setError(''); setStep(4); }}
              className="px-6 py-2 rounded-lg bg-primary text-primary-foreground font-semibold text-sm flex items-center gap-2">
              Next <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* Step 4: Conditions */}
      {step === 4 && (
        <div className="space-y-4">
          <h3 className="font-semibold text-lg">Trust Conditions <span className="text-muted-foreground font-normal text-base">(optional)</span></h3>
          <p className="text-sm text-muted-foreground">Add rules that must be met before funds are distributed to beneficiaries.</p>

          {form.conditions.map((c, i) => (
            <div key={i} className="flex items-start gap-3 p-3 rounded-lg bg-card border border-border">
              <div className="flex-1">
                <span className="text-xs font-semibold text-primary uppercase">{c.type.replace('_', ' ')}</span>
                <p className="text-sm mt-0.5">{c.description}</p>
                {c.triggerDate && <p className="text-xs text-muted-foreground mt-0.5">Trigger date: {c.triggerDate}</p>}
              </div>
              <button onClick={() => setForm(f => ({ ...f, conditions: f.conditions.filter((_, j) => j !== i) }))}
                className="text-muted-foreground hover:text-destructive"><Trash2 className="h-4 w-4" /></button>
            </div>
          ))}

          <div className="p-4 rounded-xl border border-dashed border-border space-y-3">
            <p className="text-sm font-medium text-muted-foreground">Add Condition</p>
            <select value={cForm.type} onChange={e => setCForm(f => ({ ...f, type: e.target.value as any }))}
              className="w-full px-3 py-2 rounded-lg bg-background border border-border text-sm focus:border-primary focus:outline-none">
              <option value="time_lock">⏰ Time Lock — release after a date</option>
              <option value="age_check">🎂 Age Check — release when beneficiary reaches age</option>
              <option value="event">📋 Event — release upon specified event</option>
              <option value="multisig">🔐 Multi-Sig — requires multiple trustees to sign</option>
            </select>
            <textarea value={cForm.description} onChange={e => setCForm(f => ({ ...f, description: e.target.value }))} rows={2}
              placeholder="Describe the condition..."
              className="w-full px-3 py-2 rounded-lg bg-background border border-border text-sm focus:border-primary focus:outline-none resize-none" />
            {(cForm.type === 'time_lock' || cForm.type === 'age_check') && (
              <input type="date" value={cForm.triggerDate} onChange={e => setCForm(f => ({ ...f, triggerDate: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg bg-background border border-border text-sm focus:border-primary focus:outline-none" />
            )}
            <button onClick={addCondition} className="w-full py-2 rounded-lg border border-primary/30 text-primary text-sm font-medium hover:bg-primary/5 flex items-center justify-center gap-2">
              <Plus className="h-4 w-4" /> Add Condition
            </button>
          </div>
          {error && <p className="text-destructive text-xs">{error}</p>}
          <div className="flex justify-between">
            <button onClick={() => setStep(3)} className="px-4 py-2 rounded-lg bg-muted text-muted-foreground text-sm font-medium hover:bg-muted/70">← Back</button>
            <button onClick={() => setStep(5)} className="px-6 py-2 rounded-lg bg-primary text-primary-foreground font-semibold text-sm flex items-center gap-2">
              Review <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* Step 5: Review & Pay */}
      {step === 5 && (
        <div className="space-y-4">
          <h3 className="font-semibold text-lg">Review &amp; Pay Setup Fee</h3>

          <div className="grid grid-cols-2 gap-3">
            {[
              ['Trust Name', form.name],
              ['Type', TRUST_TYPES.find(t => t.id === form.type)?.label ?? form.type],
              ['Beneficiaries', `${form.beneficiaries.length} persons (${totalPct}%)`],
              ['Conditions', `${form.conditions.length} rule(s)`],
              ['Expires', form.expiresAt || 'No expiry'],
              ['Successor', form.successorTrustee ? form.successorTrustee.slice(0, 10) + '...' : 'None'],
            ].map(([k, v]) => (
              <div key={k} className="p-3 rounded-lg bg-muted/30 border border-border">
                <p className="text-xs text-muted-foreground">{k}</p>
                <p className="text-sm font-medium mt-0.5 break-all">{v}</p>
              </div>
            ))}
          </div>

          <div className="p-4 rounded-xl border border-primary/20 bg-primary/5 space-y-3">
            <p className="font-semibold text-sm">Setup Fee Breakdown</p>
            <FeeBadge amount={FEES.setup} label="Trust Setup (one-time)" />
            <FeeBadge amount={FEES.annual} label="Annual Maintenance (year 1)" />
            <div className="flex items-center justify-between p-3 rounded-lg bg-primary/10 border border-primary/30">
              <span className="font-bold text-sm">Total Due Now</span>
              <span className="font-bold text-lg text-primary">{FEES.setup + FEES.annual} GYDS</span>
            </div>
            <p className="text-xs text-muted-foreground">Fees are non-refundable after trust activation. Annual maintenance renews automatically from the trust vault.</p>
          </div>

          {error && <div className="flex items-center gap-2 text-destructive text-sm bg-destructive/10 rounded-lg px-3 py-2"><AlertCircle className="h-4 w-4 shrink-0" />{error}</div>}
          <div className="flex justify-between">
            <button onClick={() => setStep(4)} className="px-4 py-2 rounded-lg bg-muted text-muted-foreground text-sm font-medium hover:bg-muted/70">← Back</button>
            <button onClick={handleCreate} disabled={loading}
              className="px-6 py-2 rounded-lg bg-primary text-primary-foreground font-semibold text-sm disabled:opacity-50 flex items-center gap-2">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Shield className="h-4 w-4" />}
              {loading ? 'Creating…' : 'Create & Pay Fee'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

// ── Trust Card ────────────────────────────────────────────────────────────────
const TrustCard = ({ trust, onView }: { trust: Trust; onView: (t: Trust) => void }) => {
  const typeInfo = TRUST_TYPES.find(t => t.id === trust.type);
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
      className="p-5 rounded-xl border border-border bg-card hover:border-primary/40 transition-all cursor-pointer group"
      onClick={() => onView(trust)}>
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-xl shrink-0">
            {typeInfo?.icon ?? '🏛️'}
          </div>
          <div>
            <h3 className="font-semibold text-sm">{trust.name}</h3>
            <p className="text-xs text-muted-foreground">{typeInfo?.label}</p>
          </div>
        </div>
        <span className={cn('text-xs font-semibold px-2.5 py-1 rounded-full capitalize', STATUS_COLORS[trust.status])}>
          {trust.status.replace('_', ' ')}
        </span>
      </div>
      <div className="grid grid-cols-3 gap-3 mt-4">
        <div className="text-center p-2 rounded-lg bg-muted/30">
          <p className="text-lg font-bold">{trust.totalBeneficiaries}</p>
          <p className="text-xs text-muted-foreground">Beneficiaries</p>
        </div>
        <div className="text-center p-2 rounded-lg bg-muted/30">
          <p className="text-lg font-bold text-primary">{trust.vaultBalance}</p>
          <p className="text-xs text-muted-foreground">Vault (GYDS)</p>
        </div>
        <div className="text-center p-2 rounded-lg bg-muted/30">
          <p className="text-xs font-mono text-muted-foreground mt-1">{trust.feePaid ? '✅ Paid' : '⚠️ Unpaid'}</p>
          <p className="text-xs text-muted-foreground">Fee</p>
        </div>
      </div>
      <div className="flex items-center justify-between mt-3 pt-3 border-t border-border">
        <p className="text-xs text-muted-foreground">Created {new Date(trust.createdAt).toLocaleDateString()}</p>
        <span className="text-xs text-primary font-medium flex items-center gap-1 group-hover:gap-2 transition-all">View <ArrowRight className="h-3 w-3" /></span>
      </div>
    </motion.div>
  );
};

// ── Trust Detail Panel ────────────────────────────────────────────────────────
const TrustDetail = ({ trust, onClose, onRefresh }: { trust: Trust; onClose: () => void; onRefresh: () => void }) => {
  const [loading, setLoading] = useState(false);
  const [depositAmt, setDepositAmt] = useState('');
  const [txHash, setTxHash] = useState('');
  const { toast } = useToast();

  const handlePayFee = async () => {
    setLoading(true);
    try {
      await api(`/api/trusts/${trust.id}/pay-fee`, { txHash: txHash || 'auto' });
      toast({ title: 'Fee paid!', description: 'Your trust is now active.' });
      onRefresh();
    } catch (e: any) { toast({ title: 'Error', description: e.message, variant: 'destructive' }); }
    finally { setLoading(false); }
  };

  const handleDeposit = async () => {
    if (!depositAmt) return;
    setLoading(true);
    try {
      await api(`/api/trusts/${trust.id}/deposit`, { amount: depositAmt });
      toast({ title: 'Deposited!', description: `${depositAmt} GYDS added to trust vault.` });
      setDepositAmt('');
      onRefresh();
    } catch (e: any) { toast({ title: 'Error', description: e.message, variant: 'destructive' }); }
    finally { setLoading(false); }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <button onClick={onClose} className="p-2 rounded-lg hover:bg-muted transition-colors"><X className="h-4 w-4" /></button>
        <div>
          <h2 className="font-bold text-lg">{trust.name}</h2>
          <p className="text-sm text-muted-foreground">{TRUST_TYPES.find(t => t.id === trust.type)?.label}</p>
        </div>
        <span className={cn('ml-auto text-xs font-semibold px-2.5 py-1 rounded-full capitalize', STATUS_COLORS[trust.status])}>
          {trust.status.replace('_', ' ')}
        </span>
      </div>

      {!trust.feePaid && (
        <div className="p-4 rounded-xl border border-amber-500/30 bg-amber-500/5 space-y-3">
          <p className="font-semibold text-sm text-amber-400">⚠️ Setup Fee Required</p>
          <p className="text-xs text-muted-foreground">Your trust is in draft mode until the setup fee is paid. Pay {FEES.setup + FEES.annual} GYDS to activate.</p>
          <input value={txHash} onChange={e => setTxHash(e.target.value)} placeholder="Transaction hash (optional)"
            className="w-full px-3 py-2 rounded-lg bg-background border border-border text-sm focus:border-primary focus:outline-none font-mono" />
          <button onClick={handlePayFee} disabled={loading}
            className="w-full py-2 rounded-lg bg-amber-500 text-black font-semibold text-sm disabled:opacity-50 flex items-center justify-center gap-2">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Coins className="h-4 w-4" />}
            Pay {FEES.setup + FEES.annual} GYDS Setup Fee
          </button>
        </div>
      )}

      {trust.status === 'active' && (
        <div className="p-4 rounded-xl border border-green-500/20 bg-green-500/5 space-y-3">
          <p className="font-semibold text-sm text-green-400">Vault Balance: {trust.vaultBalance} GYDS</p>
          <div className="flex gap-2">
            <input value={depositAmt} onChange={e => setDepositAmt(e.target.value)} placeholder="Amount to deposit"
              type="number" className="flex-1 px-3 py-2 rounded-lg bg-background border border-border text-sm focus:border-primary focus:outline-none" />
            <button onClick={handleDeposit} disabled={loading || !depositAmt}
              className="px-4 py-2 rounded-lg bg-green-500/20 text-green-400 border border-green-500/30 text-sm font-medium hover:bg-green-500/30 disabled:opacity-50 flex items-center gap-2">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Deposit
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        {[
          ['Trust ID', trust.id.slice(0, 12) + '...'],
          ['Type', TRUST_TYPES.find(t => t.id === trust.type)?.label ?? trust.type],
          ['Beneficiaries', `${trust.totalBeneficiaries} persons`],
          ['Created', new Date(trust.createdAt).toLocaleDateString()],
          ['Fee Status', trust.feePaid ? '✅ Paid' : '❌ Unpaid'],
          ['Expires', trust.expiresAt ? new Date(trust.expiresAt).toLocaleDateString() : 'No expiry'],
        ].map(([k, v]) => (
          <div key={k} className="p-3 rounded-lg bg-muted/30 border border-border">
            <p className="text-xs text-muted-foreground">{k}</p>
            <p className="text-sm font-medium mt-0.5">{v}</p>
          </div>
        ))}
      </div>

      <div className="p-4 rounded-xl border border-primary/20 bg-primary/5">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Fee Schedule</p>
        <div className="space-y-2">
          <FeeBadge amount={FEES.annual} label="Annual maintenance renewal" />
          <FeeBadge amount={FEES.addBeneficiary} label="Add beneficiary (after activation)" />
          <FeeBadge amount={FEES.emergency} label="Emergency unlock (multi-sig override)" />
        </div>
      </div>
    </div>
  );
};

// ── Main Trust Page ───────────────────────────────────────────────────────────
export default function TrustPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [tab, setTab] = useState<'overview' | 'create' | 'my-trusts' | 'beneficiary'>('overview');
  const [trusts, setTrusts] = useState<Trust[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Trust | null>(null);

  const fetchTrusts = async () => {
    setLoading(true);
    try {
      const data = await api('/api/trusts', undefined, 'GET');
      setTrusts(data.trusts ?? []);
    } catch {
      setTrusts([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchTrusts(); }, []);

  const activeTrusts = trusts.filter(t => t.status === 'active');
  const totalVault = trusts.reduce((s, t) => s + parseFloat(t.vaultBalance || '0'), 0);

  return (
    <Layout>
      <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center">
                <HeartHandshake className="h-5 w-5 text-white" />
              </div>
              Living Trust
            </h1>
            <p className="text-muted-foreground mt-1 text-sm">Secure on-chain trust management with GYDS-powered smart conditions</p>
          </div>
          <button onClick={() => setTab('create')}
            className="px-4 py-2 rounded-lg bg-primary text-primary-foreground font-semibold text-sm flex items-center gap-2 hover:bg-primary/90 transition-colors">
            <Plus className="h-4 w-4" /> New Trust
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: 'Total Trusts', value: trusts.length, icon: Shield, color: 'text-purple-400' },
            { label: 'Active', value: activeTrusts.length, icon: CheckCircle2, color: 'text-green-400' },
            { label: 'Vault Balance', value: `${totalVault.toFixed(0)} GYDS`, icon: Coins, color: 'text-primary' },
            { label: 'Beneficiaries', value: trusts.reduce((s, t) => s + t.totalBeneficiaries, 0), icon: Users, color: 'text-blue-400' },
          ].map(s => (
            <div key={s.label} className="p-4 rounded-xl border border-border bg-card">
              <div className="flex items-center gap-2 mb-2">
                <s.icon className={cn('h-4 w-4', s.color)} />
                <p className="text-xs text-muted-foreground">{s.label}</p>
              </div>
              <p className="text-xl font-bold">{s.value}</p>
            </div>
          ))}
        </div>

        {/* How it works */}
        {trusts.length === 0 && !loading && tab === 'overview' && (
          <div className="p-6 rounded-xl border border-border bg-card space-y-4">
            <h2 className="font-bold text-lg">How Living Trust Works</h2>
            <div className="grid sm:grid-cols-3 gap-4">
              {[
                { icon: '🏗️', title: 'Create', desc: 'Set up your trust type, name beneficiaries, and define conditions for fund release.' },
                { icon: '💳', title: 'Pay & Activate', desc: `Pay a one-time ${FEES.setup} GYDS setup fee. Annual maintenance is ${FEES.annual} GYDS/year.` },
                { icon: '🏦', title: 'Fund & Manage', desc: 'Deposit GYDS into your trust vault. Funds are released per your conditions automatically.' },
              ].map(s => (
                <div key={s.title} className="p-4 rounded-lg bg-muted/30 text-center">
                  <div className="text-3xl mb-2">{s.icon}</div>
                  <p className="font-semibold text-sm">{s.title}</p>
                  <p className="text-xs text-muted-foreground mt-1">{s.desc}</p>
                </div>
              ))}
            </div>
            <div className="p-4 rounded-lg bg-primary/5 border border-primary/20">
              <p className="text-sm font-semibold text-primary mb-2">Trust Features</p>
              <ul className="text-xs text-muted-foreground space-y-1.5 grid sm:grid-cols-2 gap-1">
                {[
                  '✅ 5 trust types (revocable, irrevocable, testamentary, special needs, spendthrift)',
                  '✅ Multi-beneficiary support with custom share percentages',
                  '✅ Time-lock, age-check, event, and multi-sig conditions',
                  '✅ On-chain vault for GYDS token storage',
                  '✅ Successor trustee designation',
                  '✅ Emergency unlock via multi-sig (100 GYDS fee)',
                  '✅ Annual auto-renewal from vault balance',
                  '✅ Full audit trail and trust history',
                ].map(f => <li key={f}>{f}</li>)}
              </ul>
            </div>
            <button onClick={() => setTab('create')}
              className="w-full py-3 rounded-lg bg-primary text-primary-foreground font-semibold text-sm flex items-center justify-center gap-2">
              <Plus className="h-4 w-4" /> Create Your First Trust
            </button>
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 p-1 rounded-lg bg-muted/50 w-fit">
          {([['overview', 'Overview'], ['my-trusts', 'My Trusts'], ['beneficiary', 'As Beneficiary'], ['create', 'Create New']] as const).map(([id, label]) => (
            <button key={id} onClick={() => { setTab(id); setSelected(null); }}
              className={cn('px-4 py-1.5 rounded-md text-sm font-medium transition-all',
                tab === id ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}>
              {label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <AnimatePresence mode="wait">
          <motion.div key={tab} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>

            {tab === 'create' && (
              <div className="p-6 rounded-xl border border-border bg-card">
                <CreateTrustWizard onDone={() => { fetchTrusts(); setTab('my-trusts'); }} />
              </div>
            )}

            {(tab === 'my-trusts' || tab === 'overview') && (
              <div className="space-y-4">
                {selected ? (
                  <div className="p-6 rounded-xl border border-border bg-card">
                    <TrustDetail trust={selected} onClose={() => setSelected(null)} onRefresh={() => { fetchTrusts(); setSelected(null); }} />
                  </div>
                ) : loading ? (
                  <div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
                ) : trusts.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <Shield className="h-12 w-12 mx-auto mb-3 opacity-20" />
                    <p className="font-medium">No trusts yet</p>
                    <p className="text-sm mt-1">Create your first trust to protect and distribute your assets.</p>
                    <button onClick={() => setTab('create')} className="mt-4 px-5 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold">Create Trust</button>
                  </div>
                ) : (
                  <div className="grid sm:grid-cols-2 gap-4">
                    {trusts.map(t => <TrustCard key={t.id} trust={t} onView={setSelected} />)}
                  </div>
                )}
              </div>
            )}

            {tab === 'beneficiary' && (
              <div className="p-6 rounded-xl border border-border bg-card">
                <div className="text-center py-8 text-muted-foreground">
                  <Users className="h-12 w-12 mx-auto mb-3 opacity-20" />
                  <p className="font-medium">No beneficiary trusts found</p>
                  <p className="text-sm mt-1">When someone adds you as a beneficiary to their trust, it will appear here.</p>
                  <p className="text-xs text-muted-foreground mt-3">Your wallet: <span className="font-mono text-foreground">{user?.walletAddress ?? 'Not linked'}</span></p>
                </div>
              </div>
            )}

          </motion.div>
        </AnimatePresence>
      </div>
    </Layout>
  );
}
