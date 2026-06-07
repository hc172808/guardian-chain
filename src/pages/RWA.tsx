import { useState } from 'react';
import { motion } from 'framer-motion';
import { Layout } from '@/components/layout/Layout';
import { GlassCard } from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import {
  Building2, TrendingUp, Coins, Search, Globe,
  Lock, BarChart3, FileText, CheckCircle2, AlertCircle
} from 'lucide-react';

type AssetType = 'real-estate' | 'bond' | 'commodity' | 'invoice';

interface RWAAsset {
  id: string;
  name: string;
  type: AssetType;
  description: string;
  totalValue: number;
  tokenPrice: number;
  tokensAvailable: number;
  totalTokens: number;
  apy: number;
  currency: string;
  jurisdiction: string;
  audited: boolean;
  maturity?: string;
}

const TYPE_CONFIG: Record<AssetType, { label: string; icon: string; color: string }> = {
  'real-estate': { label: 'Real Estate', icon: '🏢', color: 'text-blue-400 border-blue-500/30 bg-blue-500/10' },
  'bond':        { label: 'Bond',        icon: '📜', color: 'text-amber-400 border-amber-500/30 bg-amber-500/10' },
  'commodity':   { label: 'Commodity',   icon: '⛏️', color: 'text-orange-400 border-orange-500/30 bg-orange-500/10' },
  'invoice':     { label: 'Invoice',     icon: '🧾', color: 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10' },
};

const DEMO_ASSETS: RWAAsset[] = [
  {
    id: '1', type: 'real-estate', name: 'Dubai Marina Tower — Floor 12',
    description: 'Commercial office space in Dubai Marina. 12-month lock-up, quarterly yield distribution.',
    totalValue: 2_500_000, tokenPrice: 100, tokensAvailable: 8_000, totalTokens: 25_000,
    apy: 8.5, currency: 'USDT', jurisdiction: 'UAE', audited: true, maturity: '2027-06',
  },
  {
    id: '2', type: 'bond', name: 'GYDSchain Treasury Bond — Series A',
    description: 'Fixed-income bond backed by GYDSchain treasury reserves. Semi-annual coupon payments.',
    totalValue: 1_000_000, tokenPrice: 50, tokensAvailable: 12_000, totalTokens: 20_000,
    apy: 6.2, currency: 'USDT', jurisdiction: 'Cayman Islands', audited: true, maturity: '2026-12',
  },
  {
    id: '3', type: 'commodity', name: 'Gold Bullion Vault — 500 oz',
    description: 'Physical gold stored in a certified Swiss vault. Each token represents 0.01 oz of gold.',
    totalValue: 950_000, tokenPrice: 19, tokensAvailable: 5_000, totalTokens: 50_000,
    apy: 0, currency: 'USD', jurisdiction: 'Switzerland', audited: true,
  },
  {
    id: '4', type: 'invoice', name: 'Supply Chain Invoice — TechCorp MENA',
    description: 'Short-term trade invoice financing. 90-day term, high-yield, single large counterparty.',
    totalValue: 200_000, tokenPrice: 20, tokensAvailable: 2_000, totalTokens: 10_000,
    apy: 14.5, currency: 'USDT', jurisdiction: 'UAE', audited: false, maturity: '2026-09',
  },
];

const RWAPage = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | AssetType>('all');
  const [selected, setSelected] = useState<RWAAsset | null>(null);
  const [investAmount, setInvestAmount] = useState('');

  const filtered = DEMO_ASSETS.filter(a =>
    (typeFilter === 'all' || a.type === typeFilter) &&
    a.name.toLowerCase().includes(search.toLowerCase())
  );

  const totalTvl = DEMO_ASSETS.reduce((s, a) => s + (a.totalValue * (a.totalTokens - a.tokensAvailable) / a.totalTokens), 0);
  const avgApy   = DEMO_ASSETS.filter(a => a.apy > 0).reduce((s, a) => s + a.apy, 0) / DEMO_ASSETS.filter(a => a.apy > 0).length;

  const invest = () => {
    if (!user) { toast({ title: 'Sign in to invest', variant: 'destructive' }); return; }
    if (!investAmount || parseFloat(investAmount) <= 0) { toast({ title: 'Enter amount', variant: 'destructive' }); return; }
    toast({ title: '🏦 Investment submitted', description: `${investAmount} USDT into ${selected?.name}` });
    setInvestAmount(''); setSelected(null);
  };

  return (
    <Layout>
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Building2 className="w-6 h-6 text-primary" /> Real-World Assets
          </h1>
          <p className="text-muted-foreground text-sm mt-1">Invest in tokenized real-world assets on GYDSchain</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'Total TVL', value: `$${(totalTvl / 1000).toFixed(0)}K`, icon: Coins },
            { label: 'Assets Listed', value: DEMO_ASSETS.length, icon: Building2 },
            { label: 'Avg APY', value: `${avgApy.toFixed(1)}%`, icon: TrendingUp },
            { label: 'Jurisdictions', value: new Set(DEMO_ASSETS.map(a => a.jurisdiction)).size, icon: Globe },
          ].map(s => (
            <GlassCard key={s.label} className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <s.icon className="w-4 h-4 text-primary" />
                <span className="text-xs text-muted-foreground">{s.label}</span>
              </div>
              <p className="text-xl font-bold">{s.value}</p>
            </GlassCard>
          ))}
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search assets…" className="pl-9" />
          </div>
          <div className="flex gap-1.5 flex-wrap">
            {(['all', 'real-estate', 'bond', 'commodity', 'invoice'] as const).map(t => (
              <Button key={t} size="sm" variant={typeFilter === t ? 'default' : 'outline'}
                onClick={() => setTypeFilter(t)} className="text-xs h-8 capitalize">{t === 'all' ? 'All' : TYPE_CONFIG[t]?.label ?? t}</Button>
            ))}
          </div>
        </div>

        {/* Asset list */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map((a, i) => {
            const cfg = TYPE_CONFIG[a.type];
            const fundedPct = ((a.totalTokens - a.tokensAvailable) / a.totalTokens) * 100;
            return (
              <motion.div key={a.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
                <GlassCard className="p-5 space-y-4 cursor-pointer hover:border-primary/40 transition-colors" onClick={() => setSelected(a)}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <span className="text-3xl">{cfg.icon}</span>
                      <div>
                        <div className="flex items-center gap-2 mb-0.5">
                          <Badge variant="outline" className={`text-xs ${cfg.color}`}>{cfg.label}</Badge>
                          {a.audited && <Badge variant="outline" className="text-xs text-emerald-400 border-emerald-500/30 bg-emerald-500/10">
                            <CheckCircle2 className="w-3 h-3 mr-1" /> Audited
                          </Badge>}
                        </div>
                        <p className="font-semibold">{a.name}</p>
                        <p className="text-xs text-muted-foreground">{a.jurisdiction}</p>
                      </div>
                    </div>
                    {a.apy > 0 && (
                      <div className="text-right shrink-0">
                        <p className="text-lg font-bold text-emerald-400">{a.apy}%</p>
                        <p className="text-xs text-muted-foreground">APY</p>
                      </div>
                    )}
                  </div>

                  <p className="text-sm text-muted-foreground line-clamp-2">{a.description}</p>

                  <div className="space-y-1.5">
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Funded</span>
                      <span>{fundedPct.toFixed(0)}% · {a.tokensAvailable.toLocaleString()} tokens left</span>
                    </div>
                    <Progress value={fundedPct} className="h-1.5" />
                  </div>

                  <div className="flex items-center justify-between text-sm">
                    <div>
                      <span className="font-bold text-primary">${a.tokenPrice}</span>
                      <span className="text-muted-foreground text-xs"> / token</span>
                    </div>
                    <div className="text-right">
                      <p className="font-bold">${(a.totalValue / 1000).toFixed(0)}K total</p>
                      {a.maturity && <p className="text-xs text-muted-foreground">Matures {a.maturity}</p>}
                    </div>
                  </div>
                </GlassCard>
              </motion.div>
            );
          })}
        </div>

        {/* Invest Modal */}
        {selected && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={() => setSelected(null)}>
            <GlassCard className="p-6 w-full max-w-sm space-y-4" onClick={e => e.stopPropagation()}>
              <div className="flex items-start gap-3">
                <span className="text-3xl">{TYPE_CONFIG[selected.type].icon}</span>
                <div>
                  <h2 className="font-bold">{selected.name}</h2>
                  <p className="text-xs text-muted-foreground">{selected.description}</p>
                </div>
              </div>
              <div className="space-y-1 text-sm">
                {[
                  ['Token price', `$${selected.tokenPrice} ${selected.currency}`],
                  ['Min investment', `$${selected.tokenPrice} (1 token)`],
                  ...(selected.apy ? [['Expected APY', `${selected.apy}%`]] : []),
                  ...(selected.maturity ? [['Maturity', selected.maturity]] : []),
                  ['Jurisdiction', selected.jurisdiction],
                ].map(([k, v]) => (
                  <div key={k} className="flex justify-between">
                    <span className="text-muted-foreground">{k}</span>
                    <span className="font-medium">{v}</span>
                  </div>
                ))}
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Investment amount ({selected.currency})</label>
                <Input type="number" value={investAmount} onChange={e => setInvestAmount(e.target.value)}
                  placeholder={`Min $${selected.tokenPrice}`} className="mt-1" />
              </div>
              {!selected.audited && (
                <div className="flex gap-2 p-2.5 bg-amber-500/10 border border-amber-500/30 rounded-lg text-xs text-amber-200/80">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" /> This asset has not been independently audited. Invest at your own risk.
                </div>
              )}
              <div className="flex gap-2">
                <Button className="flex-1" onClick={invest}>Invest</Button>
                <Button variant="outline" onClick={() => setSelected(null)}>Cancel</Button>
              </div>
            </GlassCard>
          </motion.div>
        )}
      </motion.div>
    </Layout>
  );
};

export default RWAPage;
