import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Layout } from '@/components/layout/Layout';
import { GlassCard } from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supabase } from '@/integrations/supabase/client';
import {
  BarChart3, TrendingUp, TrendingDown, Activity, Zap,
  Clock, Users, Coins, RefreshCw, Download, Globe
} from 'lucide-react';

interface BarData { label: string; value: number; }

const genOHLCV = (days: number, base: number) =>
  Array.from({ length: days }, (_, i) => {
    const noise = () => (Math.random() - 0.5) * base * 0.06;
    const open  = base + noise() * i;
    const close = open + noise();
    const high  = Math.max(open, close) + Math.abs(noise()) * 0.5;
    const low   = Math.min(open, close) - Math.abs(noise()) * 0.5;
    const vol   = Math.floor(Math.random() * 5_000_000 + 1_000_000);
    return { open, close, high, low, vol, label: `Day ${i + 1}` };
  });

const TxHeatmap = () => {
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const hours = Array.from({ length: 24 }, (_, i) => i);
  const data = days.flatMap(d => hours.map(h => ({ d, h, v: Math.floor(Math.random() * 100) })));

  return (
    <div className="overflow-x-auto">
      <div className="min-w-max space-y-1">
        <div className="flex gap-1 ml-8">
          {hours.map(h => (
            <div key={h} className="w-5 text-[9px] text-muted-foreground text-center">{h}</div>
          ))}
        </div>
        {days.map(d => (
          <div key={d} className="flex items-center gap-1">
            <span className="w-7 text-xs text-muted-foreground">{d}</span>
            {hours.map(h => {
              const v = data.find(x => x.d === d && x.h === h)?.v ?? 0;
              const opacity = Math.max(0.05, v / 100);
              return (
                <div
                  key={h}
                  className="w-5 h-5 rounded-sm bg-primary"
                  style={{ opacity }}
                  title={`${d} ${h}:00 — ${v} txs`}
                />
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

const CandleChart = ({ data }: { data: ReturnType<typeof genOHLCV> }) => {
  const maxHigh = Math.max(...data.map(d => d.high));
  const minLow  = Math.min(...data.map(d => d.low));
  const range   = maxHigh - minLow;
  const pct = (v: number) => `${((v - minLow) / range) * 100}%`;

  return (
    <div className="h-40 flex items-end gap-0.5 overflow-hidden">
      {data.map((c, i) => {
        const isUp   = c.close >= c.open;
        const bodyT  = ((maxHigh - Math.max(c.open, c.close)) / range) * 100;
        const bodyH  = (Math.abs(c.close - c.open) / range) * 100;
        const wickT  = ((maxHigh - c.high) / range) * 100;
        const wickB  = ((maxHigh - c.low)  / range) * 100;
        return (
          <div key={i} className="flex-1 flex flex-col items-center h-full relative">
            {/* wick */}
            <div
              className={`absolute w-[1px] ${isUp ? 'bg-emerald-500' : 'bg-red-500'}`}
              style={{ top: `${wickT}%`, height: `${wickB - wickT}%` }}
            />
            {/* body */}
            <div
              className={`absolute w-full rounded-sm ${isUp ? 'bg-emerald-500' : 'bg-red-500'}`}
              style={{ top: `${bodyT}%`, height: `${Math.max(bodyH, 0.5)}%`, minHeight: 2 }}
            />
          </div>
        );
      })}
    </div>
  );
};

const BarChartViz = ({ data, color = 'bg-primary' }: { data: BarData[]; color?: string }) => {
  const max = Math.max(...data.map(d => d.value));
  return (
    <div className="flex items-end gap-1 h-28">
      {data.map((d, i) => (
        <div key={i} className="flex-1 flex flex-col items-center gap-1">
          <div className="w-full flex flex-col justify-end" style={{ height: '100%' }}>
            <div
              className={`w-full rounded-t ${color} opacity-80`}
              style={{ height: `${(d.value / max) * 100}%`, minHeight: 2 }}
            />
          </div>
          <span className="text-[9px] text-muted-foreground truncate w-full text-center">{d.label}</span>
        </div>
      ))}
    </div>
  );
};

const AnalyticsPage = () => {
  const [period, setPeriod] = useState<'7d' | '30d' | '90d'>('30d');
  const [networkStats, setNetworkStats] = useState({
    tps: 1250, blockHeight: 1_234_567, validators: 87, nodes: 342,
  });

  const ohlcv  = genOHLCV(period === '7d' ? 7 : period === '30d' ? 30 : 90, 0.0001);
  const txData: BarData[] = Array.from({ length: 14 }, (_, i) => ({
    label: `D${i + 1}`,
    value: Math.floor(Math.random() * 50000 + 10000),
  }));
  const stakeData: BarData[] = ['Jan','Feb','Mar','Apr','May','Jun'].map(m => ({
    label: m,
    value: Math.floor(Math.random() * 5_000_000 + 8_000_000),
  }));

  return (
    <Layout>
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <BarChart3 className="w-6 h-6 text-primary" /> Analytics
            </h1>
            <p className="text-muted-foreground text-sm mt-1">Real-time GYDSchain metrics and charts</p>
          </div>
          <div className="flex gap-2">
            {(['7d', '30d', '90d'] as const).map(p => (
              <Button key={p} size="sm" variant={period === p ? 'default' : 'outline'} onClick={() => setPeriod(p)}
                className="text-xs h-7">{p}</Button>
            ))}
          </div>
        </div>

        {/* Key metrics */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'Avg TPS', value: networkStats.tps.toLocaleString(), change: '+4.2%', icon: Zap, up: true },
            { label: 'Block Height', value: networkStats.blockHeight.toLocaleString(), change: 'Live', icon: Activity, up: true },
            { label: 'Active Validators', value: networkStats.validators, change: '+3', icon: Users, up: true },
            { label: 'Full Nodes', value: networkStats.nodes, change: '+12', icon: Globe, up: true },
          ].map(m => (
            <GlassCard key={m.label} className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <m.icon className="w-4 h-4 text-primary" />
                <span className="text-xs text-muted-foreground">{m.label}</span>
              </div>
              <p className="text-xl font-bold">{m.value}</p>
              <p className={`text-xs mt-0.5 ${m.up ? 'text-emerald-400' : 'text-red-400'}`}>{m.change}</p>
            </GlassCard>
          ))}
        </div>

        <Tabs defaultValue="price">
          <TabsList>
            <TabsTrigger value="price">Price</TabsTrigger>
            <TabsTrigger value="network">Network</TabsTrigger>
            <TabsTrigger value="activity">Activity</TabsTrigger>
          </TabsList>

          {/* Price */}
          <TabsContent value="price" className="mt-4 space-y-4">
            <GlassCard className="p-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="font-semibold">GYDS / USD</h2>
                  <div className="flex items-baseline gap-2 mt-0.5">
                    <span className="text-2xl font-bold text-primary">$0.0000001</span>
                    <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 text-xs">
                      <TrendingUp className="w-3 h-3 mr-1" /> +8.4%
                    </Badge>
                  </div>
                </div>
                <div className="text-right text-xs text-muted-foreground">
                  <p>High: $0.000000115</p>
                  <p>Low: $0.000000089</p>
                </div>
              </div>
              <CandleChart data={ohlcv} />
            </GlassCard>

            <GlassCard className="p-5">
              <h2 className="font-semibold mb-4">Trading Volume ({period})</h2>
              <BarChartViz data={txData.slice(0, 14)} color="bg-neon-cyan" />
            </GlassCard>
          </TabsContent>

          {/* Network */}
          <TabsContent value="network" className="mt-4 space-y-4">
            <GlassCard className="p-5">
              <h2 className="font-semibold mb-4">Total Stake Over Time</h2>
              <BarChartViz data={stakeData} color="bg-primary" />
            </GlassCard>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {[
                { label: 'Total Staked', value: '12.4M GYDS', pct: 62, color: 'bg-primary' },
                { label: 'Circulating', value: '7.6M GYDS',  pct: 38, color: 'bg-neon-cyan' },
              ].map(s => (
                <GlassCard key={s.label} className="p-4 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{s.label}</span>
                    <span className="font-bold">{s.value}</span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div className={`h-full ${s.color} rounded-full`} style={{ width: `${s.pct}%` }} />
                  </div>
                  <p className="text-xs text-muted-foreground">{s.pct}% of total supply</p>
                </GlassCard>
              ))}
            </div>
          </TabsContent>

          {/* Activity */}
          <TabsContent value="activity" className="mt-4 space-y-4">
            <GlassCard className="p-5">
              <h2 className="font-semibold mb-4">Transaction Heatmap (last 7 days)</h2>
              <TxHeatmap />
            </GlassCard>
            <GlassCard className="p-5">
              <h2 className="font-semibold mb-4">Daily Transactions</h2>
              <BarChartViz data={txData} color="bg-amber-500" />
            </GlassCard>
          </TabsContent>
        </Tabs>

        <div className="flex justify-end">
          <Button variant="outline" className="gap-2 text-xs">
            <Download className="w-3.5 h-3.5" /> Export CSV
          </Button>
        </div>
      </motion.div>
    </Layout>
  );
};

export default AnalyticsPage;
