import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Layout } from '@/components/layout/Layout';
import { GlassCard } from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  BarChart3, TrendingUp, TrendingDown, Activity, Zap,
  Clock, Users, Coins, RefreshCw, Download, Globe, Flame, Package
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface Overview {
  price: string;
  totalSupply: string;
  circulatingSupply: string;
  burnedTotal: string;
  activeValidators: number;
  onlineNodes: number;
  totalTransactions: number;
  launchedTokens: number;
}

interface BarData { label: string; value: number; }

const genOHLCV = (days: number, base: number) => {
  let last = base;
  return Array.from({ length: days }, (_, i) => {
    const noise = () => (Math.random() - 0.48) * last * 0.04;
    const open  = last;
    const close = Math.max(0.000000001, open + noise());
    const high  = Math.max(open, close) * (1 + Math.random() * 0.01);
    const low   = Math.min(open, close) * (1 - Math.random() * 0.01);
    const vol   = Math.floor(Math.random() * 5_000_000 + 1_000_000);
    const d = new Date(); d.setDate(d.getDate() - (days - i));
    last = close;
    return { open, close, high, low, vol, label: d.toLocaleDateString('en', { month: 'short', day: 'numeric' }) };
  });
};

const CandleChart = ({ data }: { data: ReturnType<typeof genOHLCV> }) => {
  const maxHigh = Math.max(...data.map(d => d.high));
  const minLow  = Math.min(...data.map(d => d.low));
  const range   = maxHigh - minLow || maxHigh * 0.01;
  return (
    <div className="h-44 flex items-end gap-px overflow-hidden">
      {data.map((c, i) => {
        const isUp  = c.close >= c.open;
        const bodyT = ((maxHigh - Math.max(c.open, c.close)) / range) * 100;
        const bodyH = (Math.abs(c.close - c.open) / range) * 100;
        const wickT = ((maxHigh - c.high) / range) * 100;
        const wickB = ((maxHigh - c.low)  / range) * 100;
        const col   = isUp ? 'bg-emerald-500' : 'bg-red-500';
        return (
          <div key={i} className="flex-1 flex flex-col items-center h-full relative"
            title={`O:${c.open.toExponential(2)} C:${c.close.toExponential(2)} H:${c.high.toExponential(2)} L:${c.low.toExponential(2)}`}>
            <div className={`absolute w-px ${col}`} style={{ top: `${wickT}%`, height: `${wickB - wickT}%` }} />
            <div className={`absolute w-full rounded-sm ${col}`}
              style={{ top: `${bodyT}%`, height: `${Math.max(bodyH, 0.5)}%`, minHeight: 2 }} />
          </div>
        );
      })}
    </div>
  );
};

const BarChartViz = ({ data, color = 'bg-primary', fmt }: { data: BarData[]; color?: string; fmt?: (v: number) => string }) => {
  const max = Math.max(...data.map(d => d.value), 1);
  return (
    <div className="flex items-end gap-1 h-28">
      {data.map((d, i) => (
        <div key={i} className="flex-1 flex flex-col items-center gap-1" title={fmt ? fmt(d.value) : String(d.value)}>
          <div className="w-full flex flex-col justify-end" style={{ height: '100%' }}>
            <div className={`w-full rounded-t ${color} opacity-80 transition-all`}
              style={{ height: `${(d.value / max) * 100}%`, minHeight: 2 }} />
          </div>
          <span className="text-[9px] text-muted-foreground truncate w-full text-center">{d.label}</span>
        </div>
      ))}
    </div>
  );
};

const TxHeatmap = () => {
  const days  = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const hours = Array.from({ length: 24 }, (_, i) => i);
  const data  = days.flatMap(d => hours.map(h => ({ d, h, v: Math.floor(Math.random() * 100) })));
  return (
    <div className="overflow-x-auto">
      <div className="min-w-max space-y-1">
        <div className="flex gap-1 ml-8">
          {hours.map(h => <div key={h} className="w-5 text-[9px] text-muted-foreground text-center">{h}</div>)}
        </div>
        {days.map(d => (
          <div key={d} className="flex items-center gap-1">
            <span className="w-7 text-xs text-muted-foreground">{d}</span>
            {hours.map(h => {
              const v = data.find(x => x.d === d && x.h === h)?.v ?? 0;
              return (
                <div key={h} className="w-5 h-5 rounded-sm bg-primary"
                  style={{ opacity: Math.max(0.05, v / 100) }}
                  title={`${d} ${h}:00 — ${v} txs`} />
              );
            })}
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
        <span>Less</span>
        {[0.05, 0.25, 0.5, 0.75, 1].map(o => (
          <div key={o} className="w-4 h-4 rounded-sm bg-primary" style={{ opacity: o }} />
        ))}
        <span>More</span>
      </div>
    </div>
  );
};

const fmtPrice = (p: string | number) => {
  const n = +p;
  if (n === 0) return '$0.0000001';
  if (n < 0.001) return `$${n.toExponential(3)}`;
  return `$${n.toFixed(6)}`;
};
const fmtBig = (n: string | number) => {
  const v = +n;
  if (v >= 1e9) return `${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6) return `${(v / 1e6).toFixed(2)}M`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(1)}K`;
  return String(v);
};

const AnalyticsPage = () => {
  const [period, setPeriod]   = useState<'7d' | '30d' | '90d'>('30d');
  const [overview, setOverview] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const fetchOverview = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/analytics/overview');
      if (res.ok) {
        setOverview(await res.json());
        setLastRefresh(new Date());
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchOverview(); }, [fetchOverview]);
  useEffect(() => {
    const id = setInterval(fetchOverview, 30_000);
    return () => clearInterval(id);
  }, [fetchOverview]);

  const basePrice = overview ? +overview.price : 0.0000001;
  const ohlcv = genOHLCV(period === '7d' ? 7 : period === '30d' ? 30 : 90, basePrice);
  const lastCandle = ohlcv[ohlcv.length - 1];
  const prevCandle = ohlcv[ohlcv.length - 2];
  const priceChange = prevCandle ? ((lastCandle.close - prevCandle.close) / prevCandle.close) * 100 : 0;
  const priceUp = priceChange >= 0;

  const txBarData: BarData[] = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() - (13 - i));
    return { label: d.toLocaleDateString('en', { month: 'short', day: 'numeric' }), value: Math.floor(Math.random() * 50_000 + 10_000) };
  });
  const stakeData: BarData[] = ['Jan','Feb','Mar','Apr','May','Jun'].map(m => ({
    label: m, value: Math.floor(Math.random() * 5_000_000 + 8_000_000),
  }));

  const circ = overview ? +overview.circulatingSupply : 0;
  const total = overview ? +overview.totalSupply : 100_000_000_000;
  const circPct = total > 0 ? Math.round((circ / total) * 100) : 0;
  const stakePct = 100 - circPct;

  return (
    <Layout>
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <BarChart3 className="w-6 h-6 text-primary" /> Analytics
            </h1>
            <p className="text-muted-foreground text-sm mt-1 flex items-center gap-1.5">
              Real-time GYDSchain metrics
              {lastRefresh && (
                <span className="text-xs text-muted-foreground/60">· updated {lastRefresh.toLocaleTimeString()}</span>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={fetchOverview} disabled={loading} className="h-7 w-7 p-0">
              <RefreshCw className={cn('w-3.5 h-3.5', loading && 'animate-spin')} />
            </Button>
            {(['7d', '30d', '90d'] as const).map(p => (
              <Button key={p} size="sm" variant={period === p ? 'default' : 'outline'}
                onClick={() => setPeriod(p)} className="text-xs h-7">{p}</Button>
            ))}
          </div>
        </div>

        {/* Key metrics — live from DB */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            {
              label: 'GYDS Price', icon: TrendingUp,
              value: loading ? '…' : fmtPrice(overview?.price ?? '0.0000001'),
              sub: loading ? '' : `${priceUp ? '+' : ''}${priceChange.toFixed(2)}% (${period})`,
              subColor: priceUp ? 'text-emerald-400' : 'text-red-400',
            },
            {
              label: 'Active Validators', icon: Users,
              value: loading ? '…' : (overview?.activeValidators ?? 0).toString(),
              sub: 'Live from DB',
              subColor: 'text-primary',
            },
            {
              label: 'Online Nodes', icon: Globe,
              value: loading ? '…' : (overview?.onlineNodes ?? 0).toString(),
              sub: 'Live from DB',
              subColor: 'text-neon-cyan',
            },
            {
              label: 'Total Transactions', icon: Activity,
              value: loading ? '…' : fmtBig(overview?.totalTransactions ?? 0),
              sub: 'All time',
              subColor: 'text-amber-400',
            },
          ].map(m => (
            <GlassCard key={m.label} className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <m.icon className="w-4 h-4 text-primary" />
                <span className="text-xs text-muted-foreground">{m.label}</span>
              </div>
              <p className="text-xl font-bold font-mono">{m.value}</p>
              <p className={`text-xs mt-0.5 ${m.subColor}`}>{m.sub}</p>
            </GlassCard>
          ))}
        </div>

        {/* Secondary metrics */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: 'Total Supply', value: loading ? '…' : fmtBig(overview?.totalSupply ?? '100000000000') + ' GYDS', icon: Coins },
            { label: 'Circulating', value: loading ? '…' : fmtBig(overview?.circulatingSupply ?? '0') + ' GYDS', icon: Zap },
            { label: 'Burned Total', value: loading ? '…' : fmtBig(overview?.burnedTotal ?? '0') + ' GYDS', icon: Flame },
            { label: 'Launched Tokens', value: loading ? '…' : (overview?.launchedTokens ?? 0).toString(), icon: Package },
          ].map(s => (
            <GlassCard key={s.label} className="p-4 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <s.icon className="w-4 h-4 text-primary" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{s.label}</p>
                <p className="font-bold text-sm font-mono">{s.value}</p>
              </div>
            </GlassCard>
          ))}
        </div>

        <Tabs defaultValue="price">
          <TabsList>
            <TabsTrigger value="price">Price</TabsTrigger>
            <TabsTrigger value="network">Network</TabsTrigger>
            <TabsTrigger value="activity">Activity</TabsTrigger>
          </TabsList>

          {/* Price tab */}
          <TabsContent value="price" className="mt-4 space-y-4">
            <GlassCard className="p-5">
              <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
                <div>
                  <h2 className="font-semibold text-sm text-muted-foreground">GYDS / USD</h2>
                  <div className="flex items-baseline gap-2 mt-0.5">
                    <span className="text-2xl font-bold text-primary font-mono">
                      {loading ? '…' : fmtPrice(overview?.price ?? '0.0000001')}
                    </span>
                    <Badge className={cn('text-xs', priceUp
                      ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                      : 'bg-red-500/20 text-red-400 border-red-500/30')}>
                      {priceUp ? <TrendingUp className="w-3 h-3 mr-1" /> : <TrendingDown className="w-3 h-3 mr-1" />}
                      {priceUp ? '+' : ''}{priceChange.toFixed(2)}%
                    </Badge>
                  </div>
                </div>
                <div className="text-right text-xs text-muted-foreground font-mono space-y-0.5">
                  <p>High: {fmtPrice(Math.max(...ohlcv.map(c => c.high)))}</p>
                  <p>Low:  {fmtPrice(Math.min(...ohlcv.map(c => c.low)))}</p>
                  <p className="text-muted-foreground/50">Indicative — seeded from DB price</p>
                </div>
              </div>
              <CandleChart data={ohlcv} />
              <div className="flex justify-between mt-2">
                <span className="text-xs text-muted-foreground">{ohlcv[0]?.label}</span>
                <span className="text-xs text-muted-foreground">{ohlcv[ohlcv.length - 1]?.label}</span>
              </div>
            </GlassCard>

            <GlassCard className="p-5">
              <h2 className="font-semibold mb-4 text-sm">Trading Volume ({period})</h2>
              <BarChartViz data={txBarData.slice(0, period === '7d' ? 7 : 14)} color="bg-neon-cyan"
                fmt={v => `${(v / 1000).toFixed(0)}K txs`} />
            </GlassCard>
          </TabsContent>

          {/* Network tab */}
          <TabsContent value="network" className="mt-4 space-y-4">
            <GlassCard className="p-5">
              <h2 className="font-semibold mb-4 text-sm">Total Stake Trend ({period})</h2>
              <BarChartViz data={stakeData} color="bg-primary" fmt={v => fmtBig(v) + ' GYDS'} />
            </GlassCard>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {[
                { label: 'Staked / Locked', value: `${fmtBig(total * stakePct / 100)} GYDS`, pct: stakePct, color: 'bg-primary' },
                { label: 'Circulating',      value: `${fmtBig(circ)} GYDS`, pct: circPct, color: 'bg-neon-cyan' },
              ].map(s => (
                <GlassCard key={s.label} className="p-4 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{s.label}</span>
                    <span className="font-bold font-mono">{loading ? '…' : s.value}</span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div className={`h-full ${s.color} rounded-full transition-all duration-700`}
                      style={{ width: `${s.pct}%` }} />
                  </div>
                  <p className="text-xs text-muted-foreground">{s.pct}% of total supply</p>
                </GlassCard>
              ))}
            </div>
            <GlassCard className="p-5">
              <h2 className="font-semibold mb-4 text-sm">Tokenomics Summary</h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {[
                  { label: 'Chain ID', value: '13370' },
                  { label: 'Max Supply', value: '100B GYDS' },
                  { label: 'Circulating', value: loading ? '…' : fmtBig(overview?.circulatingSupply ?? 0) },
                  { label: 'Burned', value: loading ? '…' : fmtBig(overview?.burnedTotal ?? 0) },
                  { label: 'Validators', value: loading ? '…' : String(overview?.activeValidators ?? 0) },
                  { label: 'Tokens Launched', value: loading ? '…' : String(overview?.launchedTokens ?? 0) },
                ].map(s => (
                  <div key={s.label} className="p-3 bg-muted/20 rounded-xl border border-border/30">
                    <p className="text-xs text-muted-foreground">{s.label}</p>
                    <p className="font-bold font-mono mt-0.5">{s.value}</p>
                  </div>
                ))}
              </div>
            </GlassCard>
          </TabsContent>

          {/* Activity tab */}
          <TabsContent value="activity" className="mt-4 space-y-4">
            <GlassCard className="p-5">
              <h2 className="font-semibold mb-4 text-sm">Transaction Heatmap (last 7 days)</h2>
              <TxHeatmap />
            </GlassCard>
            <GlassCard className="p-5">
              <h2 className="font-semibold mb-4 text-sm">Daily Transactions</h2>
              <BarChartViz data={txBarData} color="bg-amber-500" fmt={v => `${(v / 1000).toFixed(0)}K`} />
            </GlassCard>
            <GlassCard className="p-5">
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-semibold text-sm">Live Network Stats</h2>
                <Badge variant="outline" className="text-emerald-400 border-emerald-500/30 bg-emerald-500/10 text-xs">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse mr-1.5" />
                  Live
                </Badge>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {[
                  { label: 'Active Validators', value: loading ? '…' : String(overview?.activeValidators ?? 0), icon: Users },
                  { label: 'Online Nodes', value: loading ? '…' : String(overview?.onlineNodes ?? 0), icon: Globe },
                  { label: 'Total Transactions', value: loading ? '…' : fmtBig(overview?.totalTransactions ?? 0), icon: Activity },
                ].map(s => (
                  <div key={s.label} className="flex items-center gap-3 p-3 bg-muted/20 rounded-xl border border-border/30">
                    <s.icon className="w-4 h-4 text-primary shrink-0" />
                    <div>
                      <p className="text-xs text-muted-foreground">{s.label}</p>
                      <p className="font-bold font-mono">{s.value}</p>
                    </div>
                  </div>
                ))}
              </div>
            </GlassCard>
          </TabsContent>
        </Tabs>

        <div className="flex justify-end">
          <Button variant="outline" className="gap-2 text-xs" onClick={async () => {
            if (!overview) return;
            const csv = [
              'metric,value',
              `price,${overview.price}`,
              `total_supply,${overview.totalSupply}`,
              `circulating_supply,${overview.circulatingSupply}`,
              `burned_total,${overview.burnedTotal}`,
              `active_validators,${overview.activeValidators}`,
              `online_nodes,${overview.onlineNodes}`,
              `total_transactions,${overview.totalTransactions}`,
              `launched_tokens,${overview.launchedTokens}`,
            ].join('\n');
            const a = document.createElement('a');
            a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
            a.download = `gydschain-analytics-${new Date().toISOString().slice(0, 10)}.csv`;
            a.click();
          }}>
            <Download className="w-3.5 h-3.5" /> Export CSV
          </Button>
        </div>
      </motion.div>
    </Layout>
  );
};

export default AnalyticsPage;
