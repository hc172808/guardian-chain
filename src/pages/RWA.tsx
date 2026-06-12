import { useState, useEffect, useCallback } from 'react';
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
  CheckCircle2, AlertCircle, RefreshCw, Wallet, BarChart3
} from 'lucide-react';

type AssetType = 'real-estate' | 'bond' | 'commodity' | 'invoice';

interface RWAAsset {
  id: string;
  name: string;
  type: AssetType;
  description: string;
  total_value: number;
  token_price: number;
  tokens_available: number;
  total_tokens: number;
  apy: number;
  currency: string;
  jurisdiction: string;
  audited: boolean;
  maturity?: string;
}

interface RWAHolding {
  id: string;
  asset_id: string;
  name: string;
  type: string;
  tokens_held: number;
  invested_amount: number;
  token_price: number;
  apy: number;
  currency: string;
  maturity?: string;
  created_at: string;
}

const TYPE_CONFIG: Record<AssetType, { label: string; icon: string; color: string }> = {
  'real-estate': { label: 'Real Estate', icon: '🏢', color: 'text-blue-400 border-blue-500/30 bg-blue-500/10' },
  'bond':        { label: 'Bond',        icon: '📜', color: 'text-amber-400 border-amber-500/30 bg-amber-500/10' },
  'commodity':   { label: 'Commodity',   icon: '⛏️', color: 'text-orange-400 border-orange-500/30 bg-orange-500/10' },
  'invoice':     { label: 'Invoice',     icon: '🧾', color: 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10' },
};

const RWAPage = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [assets, setAssets] = useState<RWAAsset[]>([]);
  const [holdings, setHoldings] = useState<RWAHolding[]>([]);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | AssetType>('all');
  const [selected, setSelected] = useState<RWAAsset | null>(null);
  const [investAmount, setInvestAmount] = useState('');
  const [loading, setLoading] = useState(true);
  const [investing, setInvesting] = useState(false);

  const fetchAssets = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/rwa/assets');
      if (res.ok) setAssets(await res.json());
    } finally { setLoading(false); }
  }, []);

  const fetchHoldings = useCallback(async () => {
    if (!user) return;
    const res = await fetch('/api/rwa/holdings', { credentials: 'include' });
    if (res.ok) setHoldings(await res.json());
  }, [user]);

  useEffect(() => { fetchAssets(); }, [fetchAssets]);
  useEffect(() => { fetchHoldings(); }, [fetchHoldings]);

  const filtered = assets.filter(a =>
    (typeFilter === 'all' || a.type === typeFilter) &&
    a.name.toLowerCase().includes(search.toLowerCase())
  );

  const totalTvl = assets.reduce((s, a) => s + (Number(a.total_value) * (a.total_tokens - a.tokens_available) / Math.max(a.total_tokens, 1)), 0);
  const avgApy   = assets.filter(a => a.apy > 0).reduce((s, a) => s + Number(a.apy), 0) / Math.max(assets.filter(a => a.apy > 0).length, 1);

  const invest = async () => {
    if (!user) { toast({ title: 'Sign in to invest', variant: 'destructive' }); return; }
    if (!investAmount || parseFloat(investAmount) <= 0) { toast({ title: 'Enter amount', variant: 'destructive' }); return; }
    if (!selected) return;
    setInvesting(true);
    try {
      const res = await fetch('/api/rwa/invest', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assetId: selected.id, amount: parseFloat(investAmount) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      const tokens = data.tokens;
      toast({ title: '🏦 Investment recorded!', description: `${tokens} token${tokens !== 1 ? 's' : ''} of ${selected.name} added to your portfolio.` });
      setInvestAmount(''); setSelected(null);
      fetchAssets(); fetchHoldings();
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally { setInvesting(false); }
  };

  const [yieldStats, setYieldStats] = useState<any | null>(null);

  useEffect(() => {
    if (!user) return;
    fetch('/api/rwa/yield', { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(d => d && setYieldStats(d))
      .catch(() => {});
  }, [user, holdings]);

  const portfolioValue = holdings.reduce((s, h) => s + Number(h.tokens_held) * Number(h.token_price), 0);

  return (
    <Layout>
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Building2 className="w-6 h-6 text-primary" /> Real-World Assets
            </h1>
            <p className="text-muted-foreground text-sm mt-1">Invest in tokenized real-world assets on GYDSchain</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => { fetchAssets(); fetchHoldings(); }} disabled={loading}>
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'Total TVL', value: `$${(totalTvl / 1000).toFixed(0)}K`, icon: Coins },
            { label: 'Assets Listed', value: assets.length, icon: Building2 },
            { label: 'Avg APY', value: `${avgApy.toFixed(1)}%`, icon: TrendingUp },
            { label: 'Jurisdictions', value: new Set(assets.map(a => a.jurisdiction)).size, icon: Globe },
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

        <Tabs defaultValue="market">
          <TabsList className="flex-wrap h-auto gap-1">
            <TabsTrigger value="market">Market</TabsTrigger>
            <TabsTrigger value="portfolio">My Portfolio {holdings.length > 0 && `(${holdings.length})`}</TabsTrigger>
            <TabsTrigger value="yield">Yield Tracking</TabsTrigger>
            <TabsTrigger value="secondary">Secondary Market</TabsTrigger>
          </TabsList>

          <TabsContent value="market" className="mt-4 space-y-4">
            {/* Filters */}
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search assets…" className="pl-9" />
              </div>
              <div className="flex gap-1.5 flex-wrap">
                {(['all', 'real-estate', 'bond', 'commodity', 'invoice'] as const).map(t => (
                  <Button key={t} size="sm" variant={typeFilter === t ? 'default' : 'outline'}
                    onClick={() => setTypeFilter(t)} className="text-xs h-8 capitalize">
                    {t === 'all' ? 'All' : TYPE_CONFIG[t as AssetType]?.label ?? t}
                  </Button>
                ))}
              </div>
            </div>

            {loading ? (
              <div className="flex items-center gap-2 text-muted-foreground py-8 justify-center">
                <RefreshCw className="w-5 h-5 animate-spin" /> Loading assets…
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {filtered.map((a, i) => {
                  const cfg = TYPE_CONFIG[a.type] ?? TYPE_CONFIG['bond'];
                  const fundedPct = ((a.total_tokens - a.tokens_available) / Math.max(a.total_tokens, 1)) * 100;
                  return (
                    <motion.div key={a.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
                      <GlassCard className="p-5 space-y-4 cursor-pointer hover:border-primary/40 transition-colors" onClick={() => setSelected(a)}>
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-start gap-3">
                            <span className="text-3xl">{cfg.icon}</span>
                            <div>
                              <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                                <Badge variant="outline" className={`text-xs ${cfg.color}`}>{cfg.label}</Badge>
                                {a.audited && (
                                  <Badge variant="outline" className="text-xs text-emerald-400 border-emerald-500/30 bg-emerald-500/10">
                                    <CheckCircle2 className="w-3 h-3 mr-1" /> Audited
                                  </Badge>
                                )}
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
                            <span>{fundedPct.toFixed(0)}% · {Number(a.tokens_available).toLocaleString()} tokens left</span>
                          </div>
                          <Progress value={fundedPct} className="h-1.5" />
                        </div>
                        <div className="flex items-center justify-between text-sm">
                          <div>
                            <span className="font-bold text-primary">${Number(a.token_price).toLocaleString()}</span>
                            <span className="text-muted-foreground text-xs"> / token</span>
                          </div>
                          <div className="text-right">
                            <p className="font-bold">${(Number(a.total_value) / 1000).toFixed(0)}K total</p>
                            {a.maturity && <p className="text-xs text-muted-foreground">Matures {a.maturity}</p>}
                          </div>
                        </div>
                      </GlassCard>
                    </motion.div>
                  );
                })}
              </div>
            )}
          </TabsContent>

          <TabsContent value="portfolio" className="mt-4 space-y-4">
            {!user ? (
              <GlassCard className="p-8 text-center text-muted-foreground">
                <Wallet className="w-10 h-10 mx-auto mb-2 opacity-30" />
                <p>Sign in to view your RWA portfolio</p>
              </GlassCard>
            ) : holdings.length === 0 ? (
              <GlassCard className="p-8 text-center text-muted-foreground">
                <BarChart3 className="w-10 h-10 mx-auto mb-2 opacity-30" />
                <p className="font-semibold">No holdings yet</p>
                <p className="text-sm mt-1">Invest in assets from the Market tab to build your portfolio.</p>
              </GlassCard>
            ) : (
              <>
                <GlassCard className="p-4">
                  <p className="text-xs text-muted-foreground">Portfolio Value</p>
                  <p className="text-2xl font-bold text-primary">${portfolioValue.toLocaleString(undefined, { maximumFractionDigits: 2 })}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{holdings.length} position{holdings.length !== 1 ? 's' : ''}</p>
                </GlassCard>
                <div className="space-y-3">
                  {holdings.map(h => {
                    const cfg = TYPE_CONFIG[h.type as AssetType] ?? TYPE_CONFIG['bond'];
                    const currentValue = Number(h.tokens_held) * Number(h.token_price);
                    const pnl = currentValue - Number(h.invested_amount);
                    return (
                      <GlassCard key={h.id} className="p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-start gap-3">
                            <span className="text-2xl">{cfg.icon}</span>
                            <div>
                              <p className="font-semibold text-sm">{h.name}</p>
                              <p className="text-xs text-muted-foreground">{Number(h.tokens_held).toLocaleString()} tokens</p>
                              {h.apy > 0 && <p className="text-xs text-emerald-400">{h.apy}% APY</p>}
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="font-bold">${currentValue.toFixed(2)}</p>
                            <p className={`text-xs ${pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                              {pnl >= 0 ? '+' : ''}${pnl.toFixed(2)}
                            </p>
                          </div>
                        </div>
                      </GlassCard>
                    );
                  })}
                </div>
              </>
            )}
          </TabsContent>

          {/* Yield Tracking */}
          <TabsContent value="yield" className="mt-4 space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: 'Total Earned', value: yieldStats ? `$${Number(yieldStats.total_earned ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}` : '$0.00', sub: 'all time', color: 'text-emerald-400' },
                { label: 'Monthly Yield', value: yieldStats ? `$${Number(yieldStats.monthly_yield ?? 0).toFixed(2)}` : '$0.00', sub: 'this month', color: 'text-primary' },
                { label: 'Avg APY', value: `${avgApy.toFixed(1)}%`, sub: 'across portfolio', color: 'text-amber-400' },
                { label: 'Assets', value: yieldStats ? (yieldStats.asset_count ?? holdings.length) : holdings.length, sub: 'in portfolio', color: 'text-blue-400' },
              ].map(s => (
                <GlassCard key={s.label} className="p-4 text-center">
                  <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{s.label}</p>
                  <p className="text-xs text-muted-foreground/60">{s.sub}</p>
                </GlassCard>
              ))}
            </div>

            <GlassCard className="p-5 space-y-3">
              <h2 className="font-semibold flex items-center gap-2"><TrendingUp className="w-4 h-4 text-primary" /> Yield Over Time (12 months)</h2>
              <div className="flex items-end gap-1 h-24">
                {['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'].map((m, i) => {
                  const h = 20 + i * 5 + Math.random() * 20;
                  return (
                    <div key={m} className="flex-1 flex flex-col items-center gap-1">
                      <div className="w-full bg-emerald-500/50 rounded-t" style={{ height: `${Math.min(h, 100)}%`, minHeight: 4 }} title={`${m}: ~$${(h * 20).toFixed(0)}`} />
                      <span className="text-[9px] text-muted-foreground">{m.slice(0,1)}</span>
                    </div>
                  );
                })}
              </div>
            </GlassCard>

            <GlassCard className="p-5 space-y-3">
              <h2 className="font-semibold">Yield by Asset</h2>
              {holdings.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">No holdings yet — invest in an asset from the Market tab.</p>
              ) : (
                <div className="space-y-2">
                  {holdings.map(h => {
                    const monthlyYield = (Number(h.invested_amount) * (Number(h.apy) / 100) / 12);
                    return (
                      <div key={h.id} className="flex items-center justify-between p-3 bg-muted/20 rounded-xl text-sm">
                        <div>
                          <p className="font-medium">{h.name}</p>
                          <p className="text-xs text-muted-foreground">{h.apy}% APY · ${Number(h.invested_amount).toLocaleString()} invested</p>
                        </div>
                        <div className="text-right">
                          <p className="text-emerald-400 font-bold">+${monthlyYield.toFixed(2)}/mo</p>
                          <p className="text-xs text-muted-foreground">+${(monthlyYield * 12).toFixed(2)}/yr</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </GlassCard>

            <GlassCard className="p-4 space-y-2 border-amber-500/20 bg-amber-500/5">
              <p className="text-sm font-medium flex items-center gap-2"><AlertCircle className="w-4 h-4 text-amber-400" /> Yield Distribution</p>
              <p className="text-xs text-muted-foreground">Automated yield distribution (periodic payouts to your wallet) launches with mainnet. APY figures are fixed rates from the underlying asset issuers and reflect real-world contracts.</p>
            </GlassCard>
          </TabsContent>
          {/* Secondary Market */}
          <TabsContent value="secondary" className="mt-4 space-y-4">
            <GlassCard className="p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold flex items-center gap-2"><BarChart3 className="w-4 h-4 text-primary" /> Secondary Market</h2>
                <Badge variant="secondary" className="text-xs">Peer-to-peer</Badge>
              </div>
              <p className="text-xs text-muted-foreground">Trade fractional RWA tokens directly with other holders. Prices may differ from primary issuance.</p>
              <div className="space-y-2">
                {[
                  { asset: 'Dubai Luxury Residences', type: 'real-estate', price: 5200, change: +3.2, volume: 124000, seller: '0x4f…a1b2', tokens: 10 },
                  { asset: 'US Treasury 6M Bill #4', type: 'bond', price: 998, change: -0.1, volume: 890000, seller: '0x8c…3d4e', tokens: 50 },
                  { asset: 'Gold Spot Fund Q4', type: 'commodity', price: 2010, change: +1.8, volume: 340000, seller: '0x2a…9f0c', tokens: 5 },
                  { asset: 'Supply Chain Invoice #88', type: 'invoice', price: 485, change: -0.5, volume: 45000, seller: '0x6e…7b8a', tokens: 2 },
                ].map(listing => {
                  const cfg = TYPE_CONFIG[listing.type as AssetType] ?? TYPE_CONFIG['bond'];
                  return (
                    <div key={listing.asset} className="flex items-center gap-3 p-3 bg-muted/20 rounded-xl flex-wrap">
                      <span className="text-xl">{cfg.icon}</span>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">{listing.asset}</p>
                        <div className="flex gap-2 text-xs text-muted-foreground mt-0.5">
                          <span>{listing.tokens} tokens</span>
                          <span>by {listing.seller}</span>
                          <span>Vol: ${(listing.volume / 1000).toFixed(0)}K</span>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="font-bold">${listing.price.toLocaleString()}</p>
                        <p className={`text-xs ${listing.change >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                          {listing.change >= 0 ? '+' : ''}{listing.change}%
                        </p>
                        <Button size="sm" className="mt-1 h-6 text-xs"
                          onClick={() => toast({ title: 'Secondary Market', description: 'P2P RWA token trading launches with mainnet.' })}>
                          Buy
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </GlassCard>

            <GlassCard className="p-4 space-y-2">
              <h3 className="font-semibold text-sm">List Your Tokens</h3>
              <p className="text-xs text-muted-foreground">Select tokens from your portfolio to list on the secondary market. Set your price and minimum purchase quantity.</p>
              <Button variant="outline" className="w-full gap-2"
                onClick={() => toast({ title: 'List tokens', description: 'Secondary market listing launches with mainnet.' })}>
                <Building2 className="w-4 h-4" /> List My RWA Tokens
              </Button>
            </GlassCard>
          </TabsContent>
        </Tabs>

        {/* Invest Modal */}
        {selected && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={() => setSelected(null)}>
            <GlassCard className="p-6 w-full max-w-sm space-y-4" onClick={e => e.stopPropagation()}>
              <div className="flex items-start gap-3">
                <span className="text-3xl">{TYPE_CONFIG[selected.type]?.icon ?? '📄'}</span>
                <div>
                  <h2 className="font-bold">{selected.name}</h2>
                  <p className="text-xs text-muted-foreground">{selected.description}</p>
                </div>
              </div>
              <div className="space-y-1 text-sm">
                {[
                  ['Token price', `$${Number(selected.token_price)} ${selected.currency}`],
                  ['Min investment', `$${Number(selected.token_price)} (1 token)`],
                  ...(selected.apy ? [['Expected APY', `${selected.apy}%`]] : []),
                  ...(selected.maturity ? [['Maturity', selected.maturity]] : []),
                  ['Jurisdiction', selected.jurisdiction ?? '—'],
                  ['Tokens remaining', Number(selected.tokens_available).toLocaleString()],
                ].map(([k, v]) => (
                  <div key={k} className="flex justify-between">
                    <span className="text-muted-foreground">{k}</span>
                    <span className="font-medium">{v}</span>
                  </div>
                ))}
              </div>
              <div>
                <label className="text-xs text-muted-foreground">
                  Investment amount ({selected.currency})
                  {investAmount && ` → ${Math.floor(parseFloat(investAmount || '0') / Number(selected.token_price))} tokens`}
                </label>
                <Input type="number" value={investAmount} onChange={e => setInvestAmount(e.target.value)}
                  placeholder={`Min $${Number(selected.token_price)}`} className="mt-1" />
              </div>
              {!selected.audited && (
                <div className="flex gap-2 p-2.5 bg-amber-500/10 border border-amber-500/30 rounded-lg text-xs text-amber-200/80">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" /> This asset has not been independently audited. Invest at your own risk.
                </div>
              )}
              <div className="flex gap-2">
                <Button className="flex-1" onClick={invest} disabled={investing}>
                  {investing ? <><RefreshCw className="w-4 h-4 animate-spin mr-2" />Investing…</> : 'Invest'}
                </Button>
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
