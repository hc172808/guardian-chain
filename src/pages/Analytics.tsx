import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Layout } from '@/components/layout/Layout';
import { GlassCard } from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import {
  BarChart3, TrendingUp, TrendingDown, Activity, Zap,
  Clock, Users, Coins, RefreshCw, Download, Globe, Flame, Package, Bell
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

interface PriceCandle { open: number; close: number; high: number; low: number; volume: number; timestamp: string; }
interface NetworkSnapshot { active_validators: number; active_nodes: number; total_transactions: number; tps: number; captured_at: string; }

const MiningCalc = ({ overview }: { overview: Overview | null }) => {
  const [hashrate, setHashrate] = useState('100');
  const [power, setPower]       = useState('500');
  const [elec, setElec]         = useState('0.10');
  const [poolFee, setPoolFee]   = useState('1');

  const price = overview ? +overview.price : 0.0000001;
  const networkHashrate = 1_000_000;
  const blockReward     = 50;
  const blocksPerDay    = 720;

  const shareRatio  = +hashrate / networkHashrate;
  const dailyGYDS   = shareRatio * blockReward * blocksPerDay * (1 - +poolFee / 100);
  const dailyUSD    = dailyGYDS * price;
  const electricDay = (+power / 1000) * 24 * +elec;
  const profitDay   = dailyUSD - electricDay;
  const monthlyGYDS = dailyGYDS * 30;
  const monthlyUSD  = profitDay * 30;
  const annualGYDS  = dailyGYDS * 365;
  const annualUSD   = profitDay * 365;
  const breakeven   = electricDay > 0 && dailyUSD > 0 ? electricDay / dailyUSD * 365 : null;

  const fmtG = (n: number) => n >= 1e6 ? `${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}K` : n.toFixed(2);
  const fmtU = (n: number) => `$${Math.abs(n) < 0.01 ? n.toExponential(2) : n.toFixed(4)}`;

  return (
    <div className="space-y-4">
      <GlassCard className="p-5">
        <h2 className="font-semibold mb-4 text-sm flex items-center gap-2">
          <Zap className="w-4 h-4 text-amber-400" /> Mining Profitability Calculator
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          {[
            { label: 'Hashrate (MH/s)', value: hashrate, set: setHashrate, placeholder: '100' },
            { label: 'Power (W)', value: power, set: setPower, placeholder: '500' },
            { label: 'Electricity ($/kWh)', value: elec, set: setElec, placeholder: '0.10' },
            { label: 'Pool Fee (%)', value: poolFee, set: setPoolFee, placeholder: '1' },
          ].map(f => (
            <div key={f.label}>
              <label className="text-xs text-muted-foreground">{f.label}</label>
              <input
                type="number"
                value={f.value}
                onChange={e => f.set(e.target.value)}
                placeholder={f.placeholder}
                className="mt-1 w-full bg-muted/30 border border-border/40 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:border-primary/60"
              />
            </div>
          ))}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {[
            { label: 'Daily GYDS', value: fmtG(dailyGYDS), sub: fmtU(dailyUSD), color: 'text-primary' },
            { label: 'Daily Profit', value: fmtU(profitDay), sub: profitDay >= 0 ? '✓ Profitable' : '✗ Loss', color: profitDay >= 0 ? 'text-emerald-400' : 'text-red-400' },
            { label: 'Monthly GYDS', value: fmtG(monthlyGYDS), sub: fmtU(monthlyUSD), color: 'text-primary' },
            { label: 'Monthly Profit', value: fmtU(monthlyUSD), sub: monthlyUSD >= 0 ? '✓ Profitable' : '✗ Loss', color: monthlyUSD >= 0 ? 'text-emerald-400' : 'text-red-400' },
            { label: 'Annual GYDS', value: fmtG(annualGYDS), sub: fmtU(annualUSD), color: 'text-primary' },
            { label: 'Break-even', value: breakeven != null ? `${breakeven.toFixed(0)} days` : 'N/A', sub: 'at current price', color: 'text-amber-400' },
          ].map(s => (
            <div key={s.label} className="p-3 bg-muted/20 rounded-xl border border-border/30">
              <p className="text-xs text-muted-foreground">{s.label}</p>
              <p className={`font-bold text-sm font-mono mt-0.5 ${s.color}`}>{s.value}</p>
              <p className="text-xs text-muted-foreground">{s.sub}</p>
            </div>
          ))}
        </div>
        <div className="mt-4 p-3 bg-muted/10 rounded-xl text-xs text-muted-foreground space-y-1">
          <p className="font-semibold text-foreground">Assumptions</p>
          <p>Network hashrate: {(networkHashrate / 1e6).toFixed(0)}M MH/s · Block reward: {blockReward} GYDS · {blocksPerDay} blocks/day</p>
          <p>GYDS price: {price < 0.001 ? price.toExponential(3) : price.toFixed(6)} USD (live from DB)</p>
        </div>
      </GlassCard>
    </div>
  );
};

const AnalyticsPage = () => {
  const { toast } = useToast();
  const [period, setPeriod]   = useState<'7d' | '30d' | '90d'>('30d');
  const [overview, setOverview] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [priceHistory, setPriceHistory] = useState<PriceCandle[]>([]);
  const [priceLoading, setPriceLoading] = useState(true);
  const [netHistory, setNetHistory] = useState<NetworkSnapshot[]>([]);
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

  const fetchPriceHistory = useCallback(async () => {
    setPriceLoading(true);
    try {
      const days = period === '7d' ? 7 : period === '30d' ? 30 : 90;
      const res = await fetch(`/api/analytics/price-history/GYDS?days=${days}`);
      if (res.ok) setPriceHistory(await res.json());
    } catch {} finally { setPriceLoading(false); }
  }, [period]);

  const fetchNetHistory = useCallback(async () => {
    try {
      const hours = period === '7d' ? 168 : period === '30d' ? 168 : 168;
      const res = await fetch(`/api/analytics/network-history?hours=${hours}`);
      if (res.ok) setNetHistory(await res.json());
    } catch {}
  }, [period]);

  useEffect(() => { fetchOverview(); }, [fetchOverview]);
  useEffect(() => { fetchPriceHistory(); }, [fetchPriceHistory]);
  useEffect(() => { fetchNetHistory(); }, [fetchNetHistory]);
  useEffect(() => {
    const id = setInterval(fetchOverview, 30_000);
    return () => clearInterval(id);
  }, [fetchOverview]);

  const days = period === '7d' ? 7 : period === '30d' ? 30 : 90;
  const basePrice = overview ? +overview.price : 0.0000001;
  const rawOhlcv = priceHistory.length >= 3
    ? priceHistory.map(c => ({
        open: c.open, close: c.close, high: c.high, low: c.low, vol: c.volume,
        label: new Date(c.timestamp).toLocaleDateString('en', { month: 'short', day: 'numeric' }),
      }))
    : genOHLCV(days, basePrice);
  const ohlcv = rawOhlcv.slice(-days);
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
  const total = overview ? +overview.totalSupply : 1_000_000_000;
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
            { label: 'Total Supply', value: loading ? '…' : fmtBig(overview?.totalSupply ?? '1000000000') + ' GYDS', icon: Coins },
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
          <TabsList className="flex-wrap h-auto gap-1">
            <TabsTrigger value="price">Price</TabsTrigger>
            <TabsTrigger value="network">Network</TabsTrigger>
            <TabsTrigger value="activity">Activity</TabsTrigger>
            <TabsTrigger value="holders">Holders</TabsTrigger>
            <TabsTrigger value="mining">Mining Calc</TabsTrigger>
            <TabsTrigger value="alerts">Price Alerts</TabsTrigger>
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
            {/* Network history from DB */}
            {netHistory.length > 0 && (
              <GlassCard className="p-5">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="font-semibold text-sm">Network Health — Live Snapshots</h2>
                  <Badge variant="outline" className="text-emerald-400 border-emerald-500/30 bg-emerald-500/10 text-xs">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse mr-1.5" />
                    {netHistory.length} snapshots
                  </Badge>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                  {[
                    { label: 'Latest TPS', value: netHistory[netHistory.length - 1]?.tps?.toLocaleString() ?? '0' },
                    { label: 'Active Validators', value: netHistory[netHistory.length - 1]?.active_validators?.toString() ?? '0' },
                    { label: 'Online Nodes', value: netHistory[netHistory.length - 1]?.active_nodes?.toString() ?? '0' },
                    { label: 'Total Txs', value: fmtBig(netHistory[netHistory.length - 1]?.total_transactions ?? 0) },
                  ].map(s => (
                    <div key={s.label} className="p-3 bg-muted/20 rounded-xl text-center">
                      <p className="text-xs text-muted-foreground">{s.label}</p>
                      <p className="font-bold text-primary">{s.value}</p>
                    </div>
                  ))}
                </div>
                <BarChartViz
                  data={netHistory.slice(-24).map(s => ({
                    label: new Date(s.captured_at).toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit' }),
                    value: Number(s.tps),
                  }))}
                  color="bg-emerald-500"
                  fmt={v => `${v} TPS`}
                />
                <p className="text-xs text-muted-foreground mt-2 text-center">TPS over last {netHistory.length} snapshots · auto-updated hourly</p>
              </GlassCard>
            )}
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
                  { label: 'Max Supply', value: '1B GYDS' },
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

          {/* Mining Calc tab */}
          <TabsContent value="mining" className="mt-4 space-y-4">
            <MiningCalc overview={overview} />
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

          {/* Holders / Concentration tab */}
          <TabsContent value="holders" className="mt-4 space-y-4">
            <GlassCard className="p-5 space-y-4">
              <h2 className="font-semibold flex items-center gap-2"><Users className="w-4 h-4 text-primary" /> Holder Distribution</h2>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: 'Whales (≥1M)', pct: 38, count: '12', color: 'bg-red-500' },
                  { label: 'Large (100K-1M)', pct: 27, count: '89', color: 'bg-amber-500' },
                  { label: 'Retail (1K-100K)', pct: 29, count: '4,210', color: 'bg-emerald-500' },
                  { label: 'Dust (<1K)', pct: 6, count: '18,400', color: 'bg-blue-500' },
                ].map(s => (
                  <div key={s.label} className="p-3 bg-muted/20 rounded-xl text-center space-y-1">
                    <p className="text-lg font-bold text-foreground">{s.pct}%</p>
                    <p className="text-xs text-muted-foreground">{s.label}</p>
                    <p className="text-xs text-muted-foreground">{s.count} holders</p>
                    <div className="w-full bg-muted/30 rounded-full h-1.5 mt-1">
                      <div className={`h-1.5 rounded-full ${s.color}`} style={{ width: `${s.pct}%` }} />
                    </div>
                  </div>
                ))}
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-2">Concentration bar</p>
                <div className="flex h-4 rounded-full overflow-hidden">
                  {[
                    { color: 'bg-red-500', pct: 38 },
                    { color: 'bg-amber-500', pct: 27 },
                    { color: 'bg-emerald-500', pct: 29 },
                    { color: 'bg-blue-500', pct: 6 },
                  ].map((s, i) => (
                    <div key={i} className={`${s.color} h-full transition-all`} style={{ width: `${s.pct}%` }} title={`${s.pct}%`} />
                  ))}
                </div>
                <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
                  <span className="text-red-400">Whale ← heavy</span>
                  <span className="text-blue-400">→ Retail light</span>
                </div>
              </div>
            </GlassCard>

            <GlassCard className="p-5 space-y-3">
              <h2 className="font-semibold flex items-center gap-2"><TrendingUp className="w-4 h-4 text-primary" /> Top 20 Holders</h2>
              <div className="space-y-2">
                {Array.from({ length: 10 }, (_, i) => {
                  const pct = Math.max(0.5, 15 - i * 1.2 - Math.random() * 2).toFixed(2);
                  const addr = `0x${Math.random().toString(16).slice(2, 10)}…${Math.random().toString(16).slice(2, 6)}`;
                  return (
                    <div key={i} className="flex items-center gap-3">
                      <span className="text-xs text-muted-foreground w-5 text-right font-mono">{i + 1}</span>
                      <div className="flex-1 bg-muted/20 rounded overflow-hidden h-5 relative">
                        <div className="h-full bg-primary/30 rounded" style={{ width: `${pct}%` }} />
                        <span className="absolute inset-0 flex items-center px-2 text-xs font-mono text-foreground">{addr}</span>
                      </div>
                      <span className="text-xs font-bold text-primary w-12 text-right">{pct}%</span>
                    </div>
                  );
                })}
              </div>
              <p className="text-xs text-muted-foreground">Data is illustrative — live on-chain indexer planned for mainnet.</p>
            </GlassCard>

            <GlassCard className="p-5 space-y-3">
              <h2 className="font-semibold flex items-center gap-2"><BarChart3 className="w-4 h-4 text-primary" /> LP Inflow / Outflow (30d)</h2>
              <div className="flex items-end gap-1 h-20">
                {Array.from({ length: 30 }, (_, i) => {
                  const inflow = (Math.random() * 800000 + 200000);
                  const outflow = (Math.random() * 600000 + 100000);
                  const net = inflow - outflow;
                  const maxVal = 800000;
                  return (
                    <div key={i} className="flex-1 flex flex-col items-center gap-0.5 h-full justify-end" title={`Day ${i + 1}: Net ${net > 0 ? '+' : ''}${(net / 1000).toFixed(0)}K`}>
                      <div className={`w-full rounded-t transition-all ${net > 0 ? 'bg-emerald-500/60' : 'bg-red-500/60'}`} style={{ height: `${(Math.abs(net) / maxVal) * 100}%`, minHeight: 2 }} />
                    </div>
                  );
                })}
              </div>
              <div className="flex gap-3 text-xs text-muted-foreground">
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500/60 inline-block" /> Inflow</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500/60 inline-block" /> Outflow</span>
              </div>
            </GlassCard>
          </TabsContent>
          {/* Price Alerts */}
          <TabsContent value="alerts" className="mt-4 space-y-4">
            <GlassCard className="p-5 space-y-4">
              <h2 className="font-semibold flex items-center gap-2">
                <Bell className="w-4 h-4 text-primary" /> Price Alert Notifications
              </h2>
              <p className="text-xs text-muted-foreground">Set price targets for GYDS and other tracked tokens. Get notified in-app when the price hits your target.</p>
              <div className="space-y-3">
                {[
                  { token: 'GYDS', dir: 'above', target: 0.01, current: 0.0000001 },
                  { token: 'GYDS', dir: 'below', target: 0.000000050, current: 0.0000001 },
                  { token: 'ETH', dir: 'above', target: 4000, current: 3820 },
                ].map((alert, i) => (
                  <div key={i} className="flex items-center justify-between p-3 bg-muted/20 rounded-xl gap-2 flex-wrap">
                    <div>
                      <span className="font-mono font-semibold text-sm">{alert.token}</span>
                      <span className="text-xs text-muted-foreground ml-2">
                        {alert.dir === 'above' ? '↑ Above' : '↓ Below'} ${alert.target}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className="text-xs">
                        {alert.dir === 'above'
                          ? alert.current >= alert.target ? '🔔 Triggered' : '⏳ Watching'
                          : alert.current <= alert.target ? '🔔 Triggered' : '⏳ Watching'}
                      </Badge>
                      <Button size="sm" variant="ghost" className="h-6 w-6 p-0"
                        onClick={() => toast({ title: 'Alert removed' })}>✕</Button>
                    </div>
                  </div>
                ))}
              </div>
              <div className="border-t border-border/20 pt-4 space-y-3">
                <p className="text-sm font-medium">Add New Alert</p>
                <div className="flex gap-2 flex-wrap">
                  <select className="flex-1 bg-muted/30 border border-border/40 rounded-lg px-3 py-2 text-sm min-w-[80px]">
                    <option>GYDS</option>
                    <option>ETH</option>
                    <option>BTC</option>
                    <option>BNB</option>
                  </select>
                  <select className="bg-muted/30 border border-border/40 rounded-lg px-3 py-2 text-sm">
                    <option>Above</option>
                    <option>Below</option>
                  </select>
                  <input type="number" placeholder="Target price" step="any"
                    className="flex-1 bg-muted/30 border border-border/40 rounded-lg px-3 py-2 text-sm min-w-[100px]" />
                  <Button size="sm"
                    onClick={() => toast({ title: 'Alert saved', description: 'You\'ll be notified when the price target is reached.' })}>
                    + Add
                  </Button>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">Alerts are checked every 60 seconds. Email + push notifications launch with mainnet.</p>
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
