import { useState, useEffect } from 'react';
import { GlassCard } from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { api } from '@/lib/api';
import { logAuditEvent } from '@/lib/auditLog';
import {
  DollarSign, Coins, Shield, AlertTriangle, Loader2, CheckCircle,
  Plus, ChevronRight, ChevronLeft, Info, Lock, TrendingUp, Globe,
  Twitter, ArrowRight, Flame, BarChart3, XCircle, Check
} from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

// ─── Types ───────────────────────────────────────────────────────────────────

type PegType = 'usd' | 'eur' | 'gbp' | 'btc' | 'eth' | 'gold' | 'custom' | 'basket';
type CollateralType = 'over_collateralized' | 'algorithmic' | 'hybrid' | 'fiat_backed';
type StablecoinStatus = 'pending_review' | 'active' | 'paused' | 'deprecated' | 'draft';

interface UserStablecoin {
  id: string;
  name: string;
  symbol: string;
  peg_type: string;
  peg_value: string;
  collateral_type: string;
  collateral_ratio: string;
  stability_fee: string;
  minting_fee: string;
  total_supply: string;
  status: StablecoinStatus;
  is_approved: boolean;
  created_at: string;
  logo_url: string | null;
  description: string | null;
}

interface CreateParams {
  // Step 1 — identity
  name: string;
  symbol: string;
  description: string;
  logoUrl: string;
  // Step 2 — peg
  pegType: PegType;
  pegValue: string;
  customAssetName: string;
  basketWeights: { asset: string; weight: number }[];
  // Step 3 — collateral
  collateralType: CollateralType;
  collateralRatio: string;
  liquidationThreshold: string;
  reserveAssets: string[];
  // Step 4 — fees
  stabilityFee: string;
  mintingFee: string;
  burnFee: string;
  // Step 5 — links
  websiteUrl: string;
  twitterUrl: string;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const RESERVED_SYMBOLS = ['GYDS', 'GYD', 'ETH', 'BTC', 'USDC', 'USDT', 'DAI', 'BNB', 'SOL', 'MATIC'];

const PEG_OPTIONS: { key: PegType; label: string; value: string; icon: string }[] = [
  { key: 'usd', label: 'US Dollar', value: '$1.00', icon: '💵' },
  { key: 'eur', label: 'Euro', value: '~$1.08', icon: '💶' },
  { key: 'gbp', label: 'British Pound', value: '~$1.27', icon: '💷' },
  { key: 'btc', label: 'Bitcoin', value: '~$65,000', icon: '₿' },
  { key: 'eth', label: 'Ethereum', value: '~$3,500', icon: 'Ξ' },
  { key: 'gold', label: 'Gold (XAU)', value: '~$2,000/oz', icon: '🥇' },
  { key: 'custom', label: 'Custom Asset', value: 'User-defined', icon: '🔗' },
  { key: 'basket', label: 'Basket', value: 'Weighted mix', icon: '🧺' },
];

const COLLATERAL_OPTIONS: {
  key: CollateralType; label: string; minRatio: number; minLiq: number;
  risk: 'Low' | 'Medium' | 'High'; desc: string; icon: string;
}[] = [
  {
    key: 'over_collateralized', label: 'Over-Collateralized', minRatio: 150, minLiq: 110,
    risk: 'Low', icon: '🛡️',
    desc: 'CDP model — collateral > value minted. Safest but capital-intensive.',
  },
  {
    key: 'algorithmic', label: 'Algorithmic', minRatio: 100, minLiq: 100,
    risk: 'High', icon: '⚙️',
    desc: 'Algorithm maintains peg via expansion/contraction. No collateral required.',
  },
  {
    key: 'hybrid', label: 'Hybrid', minRatio: 120, minLiq: 110,
    risk: 'Medium', icon: '⚖️',
    desc: 'Partial collateral backed with algorithmic stabilisation mechanism.',
  },
  {
    key: 'fiat_backed', label: 'Fiat-Backed', minRatio: 100, minLiq: 100,
    risk: 'Low', icon: '🏦',
    desc: 'Off-chain USD/fiat reserves. Requires documentation and admin review.',
  },
];

const RESERVE_ASSET_OPTIONS = ['GYD', 'GYDS', 'ETH', 'BTC', 'USDC', 'USDT', 'DAI', 'WBTC'];

const DEFAULT_PARAMS: CreateParams = {
  name: '', symbol: '', description: '', logoUrl: '',
  pegType: 'usd', pegValue: '1.00', customAssetName: '',
  basketWeights: [{ asset: 'GYD', weight: 50 }, { asset: 'GYDS', weight: 50 }],
  collateralType: 'over_collateralized', collateralRatio: '150', liquidationThreshold: '120',
  reserveAssets: ['GYD', 'GYDS'],
  stabilityFee: '2.50', mintingFee: '0.50', burnFee: '0.10',
  websiteUrl: '', twitterUrl: '',
};

// ─── Validation helper ────────────────────────────────────────────────────────

function validateStep(step: number, p: CreateParams, existingSymbols: string[]): string[] {
  const errs: string[] = [];
  if (step === 1) {
    if (!p.name || p.name.trim().length < 3) errs.push('Name must be at least 3 characters');
    if (p.name.trim().length > 50) errs.push('Name must be 50 characters or less');
    if (!p.symbol) errs.push('Symbol is required');
    if (!/^[A-Z0-9]{2,10}$/.test(p.symbol)) errs.push('Symbol must be 2–10 uppercase letters/numbers');
    if (RESERVED_SYMBOLS.includes(p.symbol)) errs.push(`Symbol "${p.symbol}" is reserved`);
    if (existingSymbols.includes(p.symbol)) errs.push(`Symbol "${p.symbol}" already exists`);
    if (p.description.length > 500) errs.push('Description must be 500 characters or less');
  }
  if (step === 2) {
    if (p.pegType === 'custom' && !p.customAssetName) errs.push('Custom asset name is required');
    if (p.pegType === 'custom' && (isNaN(parseFloat(p.pegValue)) || parseFloat(p.pegValue) <= 0))
      errs.push('Peg value must be a positive number');
    if (p.pegType === 'basket') {
      const total = p.basketWeights.reduce((s, b) => s + b.weight, 0);
      if (Math.abs(total - 100) > 0.1) errs.push('Basket weights must sum to 100%');
      if (p.basketWeights.some(b => !b.asset)) errs.push('All basket assets must be named');
    }
  }
  if (step === 3) {
    const model = COLLATERAL_OPTIONS.find(c => c.key === p.collateralType)!;
    const ratio = parseFloat(p.collateralRatio);
    const liq = parseFloat(p.liquidationThreshold);
    if (isNaN(ratio) || ratio < model.minRatio)
      errs.push(`Collateral ratio must be ≥ ${model.minRatio}% for ${model.label}`);
    if (isNaN(liq) || liq < model.minLiq)
      errs.push(`Liquidation threshold must be ≥ ${model.minLiq}%`);
    if (liq >= ratio) errs.push('Liquidation threshold must be less than collateral ratio');
    if (p.reserveAssets.length === 0) errs.push('At least one reserve asset is required');
  }
  if (step === 4) {
    const sf = parseFloat(p.stabilityFee);
    const mf = parseFloat(p.mintingFee);
    const bf = parseFloat(p.burnFee);
    if (isNaN(sf) || sf < 0 || sf > 25) errs.push('Stability fee must be 0%–25%');
    if (isNaN(mf) || mf < 0 || mf > 5) errs.push('Minting fee must be 0%–5%');
    if (isNaN(bf) || bf < 0 || bf > 2) errs.push('Burn fee must be 0%–2%');
  }
  return errs;
}

// ─── Main Component ───────────────────────────────────────────────────────────

export const StablecoinFactory = () => {
  const { toast } = useToast();
  const { user } = useAuth();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [params, setParams] = useState<CreateParams>(DEFAULT_PARAMS);
  const [stepErrors, setStepErrors] = useState<string[]>([]);
  const [existingSymbols, setExistingSymbols] = useState<string[]>([]);
  const [myStablecoins, setMyStablecoins] = useState<UserStablecoin[]>([]);
  const [allStablecoins, setAllStablecoins] = useState<UserStablecoin[]>([]);
  const [loading, setLoading] = useState(true);
  const [creationFee, setCreationFee] = useState(10000);
  const [maxPerUser, setMaxPerUser] = useState(3);
  const [userGydsBalance, setUserGydsBalance] = useState(0);

  useEffect(() => { loadData(); }, [user]);

  const loadData = async () => {
    setLoading(true);
    try {
      // Load all stablecoins
      const res = await fetch('/api/stablecoins');
      if (res.ok) {
        const data = await res.json();
        setAllStablecoins(data);
      }
      // Load user's stablecoins
      if (user) {
        const myRes = await fetch('/api/stablecoins/my', { credentials: 'include' });
        if (myRes.ok) setMyStablecoins(await myRes.json());
      }
      // Load config
      const [feeRow, maxRow, tokensData] = await Promise.all([
        api.get('/api/config/stablecoin_creation_fee').catch(() => null),
        api.get('/api/config/stablecoin_max_per_user').catch(() => null),
        api.get('/api/tokens').catch(() => []),
      ]);
      if (feeRow?.configValue) setCreationFee(Number(feeRow.configValue) || 10000);
      if (maxRow?.configValue) setMaxPerUser(Number(maxRow.configValue) || 3);
      const tokens = Array.isArray(tokensData) ? tokensData : [];
      const symbols = [...RESERVED_SYMBOLS, ...tokens.map((t: any) => t.symbol)];
      setExistingSymbols(symbols.map(s => s.toUpperCase()));
    } finally {
      setLoading(false);
    }
  };

  const openWizard = () => {
    setParams(DEFAULT_PARAMS);
    setStep(1);
    setStepErrors([]);
    setDialogOpen(true);
  };

  const nextStep = () => {
    const errs = validateStep(step, params, existingSymbols);
    if (errs.length) { setStepErrors(errs); return; }
    setStepErrors([]);
    setStep(s => s + 1);
  };

  const prevStep = () => { setStepErrors([]); setStep(s => s - 1); };

  const handleSubmit = async () => {
    // Final validation all steps
    for (let s = 1; s <= 4; s++) {
      const errs = validateStep(s, params, existingSymbols);
      if (errs.length) { setStep(s); setStepErrors(errs); return; }
    }
    if (!user) { toast({ title: 'Sign in required', variant: 'destructive' }); return; }
    if (myStablecoins.length >= maxPerUser) {
      toast({ title: `Max ${maxPerUser} stablecoins per user`, variant: 'destructive' }); return;
    }

    setSubmitting(true);
    try {
      const body = {
        name: params.name.trim(),
        symbol: params.symbol.trim().toUpperCase(),
        description: params.description,
        logoUrl: params.logoUrl,
        pegType: params.pegType,
        pegValue: params.pegType === 'usd' ? '1.00'
          : params.pegType === 'eur' ? '1.08'
          : params.pegType === 'gbp' ? '1.27'
          : params.pegType === 'btc' ? '65000'
          : params.pegType === 'eth' ? '3500'
          : params.pegType === 'gold' ? '2000'
          : params.pegValue,
        basketWeights: params.pegType === 'basket' ? params.basketWeights : [],
        collateralType: params.collateralType,
        collateralRatio: params.collateralRatio,
        liquidationThreshold: params.liquidationThreshold,
        reserveAssets: params.reserveAssets,
        stabilityFee: params.stabilityFee,
        mintingFee: params.mintingFee,
        burnFee: params.burnFee,
        websiteUrl: params.websiteUrl,
        twitterUrl: params.twitterUrl,
      };

      const res = await fetch('/api/stablecoins', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Creation failed');

      toast({ title: `✅ ${params.symbol} submitted for review!`, description: 'Admin will review and approve your stablecoin.' });
      logAuditEvent(user.id, user.email ?? null, { action: 'stablecoin_create', category: 'token', target_type: 'stablecoin', details: { symbol: params.symbol, peg: params.pegType } });
      setDialogOpen(false);
      loadData();
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  const toggleReserveAsset = (asset: string) => {
    setParams(p => ({
      ...p,
      reserveAssets: p.reserveAssets.includes(asset)
        ? p.reserveAssets.filter(a => a !== asset)
        : [...p.reserveAssets, asset],
    }));
  };

  const statusColor = (s: StablecoinStatus) => ({
    active: 'text-green-400 border-green-400',
    pending_review: 'text-yellow-400 border-yellow-400',
    paused: 'text-orange-400 border-orange-400',
    deprecated: 'text-red-400 border-red-400',
    draft: 'text-muted-foreground border-border',
  }[s] ?? 'text-muted-foreground');

  const selectedModel = COLLATERAL_OPTIONS.find(c => c.key === params.collateralType)!;

  // ─── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <DollarSign className="h-5 w-5 text-primary" />
            Stablecoin Factory
          </h3>
          <p className="text-sm text-muted-foreground mt-0.5">Create your own pegged token on the GYDS network</p>
        </div>
        {user && (
          <Button onClick={openWizard} disabled={myStablecoins.length >= maxPerUser} className="gap-2">
            <Plus className="h-4 w-4" /> Create Stablecoin
          </Button>
        )}
      </div>

      {/* Rules summary */}
      <GlassCard className="p-4 border-primary/20 bg-primary/5">
        <h4 className="text-sm font-medium mb-2 flex items-center gap-2"><Info className="h-4 w-4 text-primary" /> Creation Rules</h4>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
          {[
            { icon: '💰', label: 'Creation Fee', value: `${creationFee.toLocaleString()} GYDS` },
            { icon: '📊', label: 'Max per User', value: `${maxPerUser} stablecoins` },
            { icon: '🛡️', label: 'Min Collateral', value: '150% (over-col.)' },
            { icon: '⚖️', label: 'Stability Fee', value: '0% – 25% annual' },
          ].map(({ icon, label, value }) => (
            <div key={label} className="flex items-start gap-2">
              <span className="text-base">{icon}</span>
              <div>
                <p className="text-muted-foreground">{label}</p>
                <p className="font-medium">{value}</p>
              </div>
            </div>
          ))}
        </div>
      </GlassCard>

      {/* All active stablecoins */}
      <div>
        <h4 className="text-sm font-medium text-muted-foreground mb-3">Active Stablecoins ({allStablecoins.filter(s => s.status === 'active').length})</h4>
        {loading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : allStablecoins.filter(s => s.status === 'active').length === 0 ? (
          <GlassCard className="p-8 text-center text-muted-foreground">
            <Coins className="h-8 w-8 mx-auto mb-2 opacity-40" />
            <p className="text-sm">No active stablecoins yet. Be the first to create one!</p>
          </GlassCard>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {allStablecoins.filter(s => s.status === 'active').map(sc => (
              <GlassCard key={sc.id} className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center text-lg font-bold">
                      {sc.logo_url ? <img src={sc.logo_url} className="w-full h-full rounded-full object-cover" /> : sc.symbol[0]}
                    </div>
                    <div>
                      <p className="font-semibold">{sc.symbol}</p>
                      <p className="text-xs text-muted-foreground">{sc.name}</p>
                    </div>
                  </div>
                  <Badge variant="outline" className={`text-xs ${statusColor(sc.status)}`}>{sc.status}</Badge>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                  <div><p className="text-muted-foreground">Peg</p><p className="font-mono">{sc.peg_type.toUpperCase()}</p></div>
                  <div><p className="text-muted-foreground">Collateral</p><p>{parseFloat(sc.collateral_ratio).toFixed(0)}%</p></div>
                  <div><p className="text-muted-foreground">Fee</p><p>{parseFloat(sc.stability_fee).toFixed(2)}%/yr</p></div>
                </div>
              </GlassCard>
            ))}
          </div>
        )}
      </div>

      {/* My stablecoins */}
      {user && myStablecoins.length > 0 && (
        <div>
          <h4 className="text-sm font-medium text-muted-foreground mb-3">My Stablecoins ({myStablecoins.length}/{maxPerUser})</h4>
          <div className="space-y-2">
            {myStablecoins.map(sc => (
              <GlassCard key={sc.id} className="p-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-lg font-bold w-9 h-9 rounded-full bg-secondary/50 flex items-center justify-center">{sc.symbol[0]}</span>
                    <div>
                      <p className="font-medium text-sm">{sc.symbol} — {sc.name}</p>
                      <p className="text-xs text-muted-foreground capitalize">{sc.peg_type} peg · {sc.collateral_type.replace(/_/g, ' ')}</p>
                    </div>
                  </div>
                  <Badge variant="outline" className={`text-xs ${statusColor(sc.status)}`}>
                    {sc.status === 'pending_review' ? '⏳ Pending' : sc.status === 'active' ? '✅ Active' : sc.status}
                  </Badge>
                </div>
              </GlassCard>
            ))}
          </div>
        </div>
      )}

      {/* ── Creation Wizard Dialog ── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-primary" />
              Create Stablecoin — Step {step} of 5
            </DialogTitle>
            <DialogDescription>
              {['', 'Identity & Branding', 'Peg Configuration', 'Collateral & Risk Rules',
                'Fee Structure', 'Review & Submit'][step]}
            </DialogDescription>
          </DialogHeader>

          {/* Step progress */}
          <div className="flex gap-1.5 mb-4">
            {[1,2,3,4,5].map(s => (
              <div key={s} className={`h-1.5 flex-1 rounded-full transition-all ${s <= step ? 'bg-primary' : 'bg-secondary'}`} />
            ))}
          </div>

          {/* ── Step 1: Identity ── */}
          {step === 1 && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label>Token Name <span className="text-destructive">*</span></Label>
                <Input value={params.name} onChange={e => setParams(p => ({ ...p, name: e.target.value }))}
                  placeholder="e.g. MyStable Dollar" maxLength={50} />
                <p className="text-xs text-muted-foreground">{params.name.length}/50</p>
              </div>
              <div className="space-y-1.5">
                <Label>Symbol <span className="text-destructive">*</span></Label>
                <Input value={params.symbol} onChange={e => setParams(p => ({ ...p, symbol: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '') }))}
                  placeholder="e.g. MYSD" maxLength={10} className="font-mono" />
                <p className="text-xs text-muted-foreground">2–10 uppercase letters/numbers · Reserved: {RESERVED_SYMBOLS.join(', ')}</p>
              </div>
              <div className="space-y-1.5">
                <Label>Description</Label>
                <Textarea value={params.description} onChange={e => setParams(p => ({ ...p, description: e.target.value }))}
                  placeholder="What is this stablecoin for?" maxLength={500} rows={3} />
                <p className="text-xs text-muted-foreground">{params.description.length}/500</p>
              </div>
              <div className="space-y-1.5">
                <Label>Logo URL <span className="text-xs text-muted-foreground">(optional)</span></Label>
                <Input value={params.logoUrl} onChange={e => setParams(p => ({ ...p, logoUrl: e.target.value }))}
                  placeholder="https://..." />
              </div>
            </div>
          )}

          {/* ── Step 2: Peg ── */}
          {step === 2 && (
            <div className="space-y-4">
              <div>
                <Label className="mb-2 block">Peg Type <span className="text-destructive">*</span></Label>
                <div className="grid grid-cols-2 gap-2">
                  {PEG_OPTIONS.map(opt => (
                    <button key={opt.key} onClick={() => setParams(p => ({ ...p, pegType: opt.key }))}
                      className={cn('p-3 rounded-lg border text-left transition-all text-sm', params.pegType === opt.key ? 'border-primary bg-primary/10' : 'border-border bg-secondary/20 hover:border-primary/50')}>
                      <span className="text-base">{opt.icon}</span>
                      <p className="font-medium mt-1">{opt.label}</p>
                      <p className="text-xs text-muted-foreground">{opt.value}</p>
                    </button>
                  ))}
                </div>
              </div>

              {params.pegType === 'custom' && (
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <Label>Custom Asset Name</Label>
                    <Input value={params.customAssetName} onChange={e => setParams(p => ({ ...p, customAssetName: e.target.value }))} placeholder="e.g. Silver, Oil, Custom Index" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Target Price (USD)</Label>
                    <Input type="number" step="0.01" min="0.01" value={params.pegValue}
                      onChange={e => setParams(p => ({ ...p, pegValue: e.target.value }))} />
                  </div>
                </div>
              )}

              {params.pegType === 'basket' && (
                <div className="space-y-2">
                  <Label>Basket Weights (must sum to 100%)</Label>
                  {params.basketWeights.map((bw, i) => (
                    <div key={i} className="flex gap-2 items-center">
                      <Input value={bw.asset} onChange={e => {
                        const w = [...params.basketWeights];
                        w[i] = { ...w[i], asset: e.target.value.toUpperCase() };
                        setParams(p => ({ ...p, basketWeights: w }));
                      }} placeholder="Asset" className="flex-1 font-mono" />
                      <Input type="number" min="1" max="99" value={bw.weight} onChange={e => {
                        const w = [...params.basketWeights];
                        w[i] = { ...w[i], weight: Number(e.target.value) };
                        setParams(p => ({ ...p, basketWeights: w }));
                      }} className="w-20" />
                      <span className="text-sm text-muted-foreground">%</span>
                      {params.basketWeights.length > 2 && (
                        <button onClick={() => setParams(p => ({ ...p, basketWeights: p.basketWeights.filter((_, j) => j !== i) }))}
                          className="text-destructive hover:text-destructive/80"><XCircle className="h-4 w-4" /></button>
                      )}
                    </div>
                  ))}
                  <div className="flex items-center justify-between text-xs">
                    <span className={`font-mono ${Math.abs(params.basketWeights.reduce((s, b) => s + b.weight, 0) - 100) < 0.1 ? 'text-green-400' : 'text-destructive'}`}>
                      Total: {params.basketWeights.reduce((s, b) => s + b.weight, 0)}%
                    </span>
                    <Button variant="outline" size="sm" onClick={() => setParams(p => ({ ...p, basketWeights: [...p.basketWeights, { asset: '', weight: 0 }] }))}>
                      <Plus className="h-3 w-3 mr-1" /> Add Asset
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Step 3: Collateral ── */}
          {step === 3 && (
            <div className="space-y-4">
              <div>
                <Label className="mb-2 block">Collateral Model <span className="text-destructive">*</span></Label>
                <div className="grid grid-cols-2 gap-2">
                  {COLLATERAL_OPTIONS.map(opt => (
                    <button key={opt.key} onClick={() => {
                      setParams(p => ({
                        ...p, collateralType: opt.key,
                        collateralRatio: String(opt.minRatio),
                        liquidationThreshold: String(opt.minLiq),
                      }));
                    }}
                      className={cn('p-3 rounded-lg border text-left transition-all text-sm', params.collateralType === opt.key ? 'border-primary bg-primary/10' : 'border-border bg-secondary/20 hover:border-primary/50')}>
                      <div className="flex items-center justify-between">
                        <span>{opt.icon}</span>
                        <Badge variant="outline" className={`text-[10px] ${opt.risk === 'Low' ? 'text-green-400' : opt.risk === 'Medium' ? 'text-yellow-400' : 'text-red-400'}`}>{opt.risk}</Badge>
                      </div>
                      <p className="font-medium mt-1 text-xs">{opt.label}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">{opt.desc}</p>
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Collateral Ratio (%)</Label>
                  <Input type="number" min={selectedModel.minRatio} max="500" value={params.collateralRatio}
                    onChange={e => setParams(p => ({ ...p, collateralRatio: e.target.value }))} />
                  <p className="text-xs text-muted-foreground">Min: {selectedModel.minRatio}%</p>
                </div>
                <div className="space-y-1.5">
                  <Label>Liquidation Threshold (%)</Label>
                  <Input type="number" min={selectedModel.minLiq} max="200" value={params.liquidationThreshold}
                    onChange={e => setParams(p => ({ ...p, liquidationThreshold: e.target.value }))} />
                  <p className="text-xs text-muted-foreground">Min: {selectedModel.minLiq}%</p>
                </div>
              </div>

              <div>
                <Label className="mb-2 block">Accepted Reserve Assets</Label>
                <div className="flex flex-wrap gap-2">
                  {RESERVE_ASSET_OPTIONS.map(asset => (
                    <button key={asset} onClick={() => toggleReserveAsset(asset)}
                      className={cn('px-3 py-1 rounded-full border text-xs font-mono transition-all', params.reserveAssets.includes(asset) ? 'border-primary bg-primary/20 text-primary' : 'border-border bg-secondary/30 text-muted-foreground hover:border-primary/50')}>
                      {params.reserveAssets.includes(asset) && <Check className="h-2.5 w-2.5 inline mr-1" />}
                      {asset}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground mt-1.5">Selected: {params.reserveAssets.join(', ') || 'None'}</p>
              </div>
            </div>
          )}

          {/* ── Step 4: Fees ── */}
          {step === 4 && (
            <div className="space-y-4">
              <GlassCard className="p-3 border-amber-500/20 bg-amber-500/5">
                <p className="text-xs text-amber-400 flex items-start gap-2">
                  <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                  Fees are collected from minters and redeemers. Higher fees may deter adoption but generate more protocol revenue.
                </p>
              </GlassCard>

              <div className="space-y-1.5">
                <Label className="flex items-center gap-2">
                  <TrendingUp className="h-3.5 w-3.5" /> Stability Fee (annual %)
                </Label>
                <div className="flex items-center gap-3">
                  <Input type="number" min="0" max="25" step="0.25" value={params.stabilityFee}
                    onChange={e => setParams(p => ({ ...p, stabilityFee: e.target.value }))} className="flex-1" />
                  <span className="text-sm font-mono w-12 text-right">{parseFloat(params.stabilityFee || '0').toFixed(2)}%</span>
                </div>
                <p className="text-xs text-muted-foreground">Charged annually to minters holding open positions. Range: 0%–25%</p>
              </div>

              <div className="space-y-1.5">
                <Label className="flex items-center gap-2">
                  <Plus className="h-3.5 w-3.5" /> Minting Fee (per-mint %)
                </Label>
                <div className="flex items-center gap-3">
                  <Input type="number" min="0" max="5" step="0.1" value={params.mintingFee}
                    onChange={e => setParams(p => ({ ...p, mintingFee: e.target.value }))} className="flex-1" />
                  <span className="text-sm font-mono w-12 text-right">{parseFloat(params.mintingFee || '0').toFixed(2)}%</span>
                </div>
                <p className="text-xs text-muted-foreground">One-time fee charged when minting new tokens. Range: 0%–5%</p>
              </div>

              <div className="space-y-1.5">
                <Label className="flex items-center gap-2">
                  <Flame className="h-3.5 w-3.5" /> Burn/Redemption Fee (%)
                </Label>
                <div className="flex items-center gap-3">
                  <Input type="number" min="0" max="2" step="0.05" value={params.burnFee}
                    onChange={e => setParams(p => ({ ...p, burnFee: e.target.value }))} className="flex-1" />
                  <span className="text-sm font-mono w-12 text-right">{parseFloat(params.burnFee || '0').toFixed(2)}%</span>
                </div>
                <p className="text-xs text-muted-foreground">Fee charged on redemptions/burns. Range: 0%–2%</p>
              </div>

              <div className="space-y-1.5">
                <Label className="flex items-center gap-2"><Globe className="h-3.5 w-3.5" /> Website URL <span className="text-xs text-muted-foreground">(optional)</span></Label>
                <Input value={params.websiteUrl} onChange={e => setParams(p => ({ ...p, websiteUrl: e.target.value }))} placeholder="https://yourstable.io" />
              </div>
              <div className="space-y-1.5">
                <Label className="flex items-center gap-2"><Twitter className="h-3.5 w-3.5" /> Twitter URL <span className="text-xs text-muted-foreground">(optional)</span></Label>
                <Input value={params.twitterUrl} onChange={e => setParams(p => ({ ...p, twitterUrl: e.target.value }))} placeholder="https://twitter.com/yourstable" />
              </div>
            </div>
          )}

          {/* ── Step 5: Review ── */}
          {step === 5 && (
            <div className="space-y-4">
              <GlassCard className="p-4 space-y-3 divide-y divide-border/30">
                {[
                  { label: 'Name', value: params.name },
                  { label: 'Symbol', value: <span className="font-mono">{params.symbol}</span> },
                  { label: 'Peg', value: `${params.pegType.toUpperCase()}${params.pegType === 'custom' ? ` (${params.customAssetName})` : ''}` },
                  { label: 'Collateral Model', value: selectedModel.label },
                  { label: 'Collateral Ratio', value: `${params.collateralRatio}% (liquidation at ${params.liquidationThreshold}%)` },
                  { label: 'Reserve Assets', value: params.reserveAssets.join(', ') },
                  { label: 'Stability Fee', value: `${params.stabilityFee}% / year` },
                  { label: 'Minting Fee', value: `${params.mintingFee}%` },
                  { label: 'Burn Fee', value: `${params.burnFee}%` },
                ].map(({ label, value }) => (
                  <div key={label} className="flex justify-between pt-2 first:pt-0 text-sm">
                    <span className="text-muted-foreground">{label}</span>
                    <span className="font-medium text-right">{value}</span>
                  </div>
                ))}
              </GlassCard>

              <GlassCard className="p-4 border-primary/30 bg-primary/5">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Creation Fee</span>
                  <span className="text-lg font-bold font-mono text-primary">{creationFee.toLocaleString()} GYDS</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">Deducted from your GYDS balance on submission</p>
              </GlassCard>

              <GlassCard className="p-3 border-amber-500/20 bg-amber-500/5">
                <p className="text-xs text-amber-400 flex items-start gap-2">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                  Your stablecoin will be reviewed by an admin before going live. This usually takes 24–48 hours.
                  Once approved, it will be deployed on-chain and listed in the DeFi ecosystem.
                </p>
              </GlassCard>
            </div>
          )}

          {/* Step errors */}
          {stepErrors.length > 0 && (
            <div className="rounded-lg bg-destructive/10 border border-destructive/30 p-3 space-y-1">
              {stepErrors.map(e => (
                <p key={e} className="text-xs text-destructive flex items-start gap-1.5">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />{e}
                </p>
              ))}
            </div>
          )}

          {/* Nav buttons */}
          <div className="flex gap-2 justify-between pt-2">
            <Button variant="outline" onClick={step === 1 ? () => setDialogOpen(false) : prevStep} className="gap-1.5">
              {step === 1 ? 'Cancel' : <><ChevronLeft className="h-4 w-4" /> Back</>}
            </Button>
            {step < 5 ? (
              <Button onClick={nextStep} className="gap-1.5">
                Next <ChevronRight className="h-4 w-4" />
              </Button>
            ) : (
              <Button onClick={handleSubmit} disabled={submitting} className="gap-1.5">
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
                Submit for Review
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
