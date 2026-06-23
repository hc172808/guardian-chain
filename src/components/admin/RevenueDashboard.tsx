import { useState, useEffect } from 'react';
import { GlassCard } from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import {
  DollarSign, TrendingUp, RefreshCw, Shield, Coins,
  ArrowRightLeft, Lock, Rocket, ShoppingCart, ArrowDownLeft,
} from 'lucide-react';

const GYDS_PRICE_USD = 0.0012;
const fmt = (n: number) => Number(n).toLocaleString(undefined, { maximumFractionDigits: 2 });
const fmtGYDS = (n: number) => `${fmt(n)} GYDS`;
const fmtUSD = (n: number) => `$${fmt(n * GYDS_PRICE_USD)}`;

const COLORS = {
  trust: '#6366f1',
  stablecoin: '#14b8a6',
  insurance: '#f59e0b',
  bridge: '#3b82f6',
  buys: '#22c55e',
  cashouts: '#ec4899',
};

interface Totals {
  trustTotal: number;
  stableTotal: number;
  insuranceTotal: number;
  bridgeTotal: number;
  buyCount: number;
  buyTotal: number;
  cashoutCount: number;
  cashoutTotal: number;
  launchVolume: number;
  grandTotal: number;
}

interface DailyRow {
  day: string;        // ISO date string
  trust: number;
  stablecoin: number;
  insurance: number;
  bridge: number;
}

interface MonthRow {
  month: string;
  total: number;
}

interface RecentItem {
  id: string;
  type: string;
  amount: number;
  label: string;
  createdAt: string;
}

interface RevenueData {
  totals: Totals;
  daily: DailyRow[];
  monthly: MonthRow[];
  recent: RecentItem[];
}

const TYPE_META: Record<string, { label: string; color: string; icon: React.ComponentType<{ className?: string }> }> = {
  trust:       { label: 'Living Trust',    color: COLORS.trust,      icon: Lock },
  stablecoin:  { label: 'Stablecoin Fee',  color: COLORS.stablecoin, icon: Coins },
  insurance:   { label: 'Insurance',       color: COLORS.insurance,  icon: Shield },
  bridge:      { label: 'Bridge Fee',      color: COLORS.bridge,     icon: ArrowRightLeft },
  buy:         { label: 'Buy Order',       color: COLORS.buys,       icon: ShoppingCart },
  cashout:     { label: 'Cashout',         color: COLORS.cashouts,   icon: ArrowDownLeft },
  launch:      { label: 'Token Launch',    color: '#a855f7',         icon: Rocket },
};

function KpiCard({
  icon: Icon, label, gyds, usd, color, count,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  gyds: number;
  usd: number;
  color: string;
  count?: number;
}) {
  return (
    <GlassCard className="p-5">
      <div className="flex items-start justify-between">
        <div className="p-2.5 rounded-xl" style={{ background: `${color}20` }}>
          <Icon className="h-5 w-5" style={{ color }} />
        </div>
        {count !== undefined && (
          <Badge variant="outline" className="text-xs">{count} txns</Badge>
        )}
      </div>
      <div className="mt-3">
        <p className="text-xs text-muted-foreground uppercase tracking-wide">{label}</p>
        <p className="text-xl font-bold mt-0.5">{fmtGYDS(gyds)}</p>
        <p className="text-xs text-muted-foreground">{fmtUSD(usd)}</p>
      </div>
    </GlassCard>
  );
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  const total = payload.reduce((s: number, e: any) => s + (Number(e.value) || 0), 0);
  return (
    <div className="bg-background/95 border border-border rounded-lg p-3 text-xs space-y-1 shadow-xl">
      <p className="font-semibold text-foreground mb-1.5">{label}</p>
      {payload.map((p: any) => (
        <div key={p.dataKey} className="flex justify-between gap-4">
          <span style={{ color: p.color }}>{p.name}</span>
          <span className="font-mono">{fmt(p.value)} GYDS</span>
        </div>
      ))}
      {payload.length > 1 && (
        <div className="flex justify-between gap-4 border-t border-border pt-1 font-semibold">
          <span>Total</span>
          <span className="font-mono">{fmt(total)} GYDS</span>
        </div>
      )}
    </div>
  );
};

export function RevenueDashboard() {
  const { toast } = useToast();
  const [data, setData] = useState<RevenueData | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'30d' | '12m'>('30d');

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/revenue', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed');
      setData(await res.json());
    } catch {
      toast({ title: 'Failed to load revenue data', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  if (loading || !data) {
    return (
      <GlassCard className="p-12 text-center">
        <RefreshCw className="h-7 w-7 animate-spin mx-auto mb-3 text-primary" />
        <p className="text-muted-foreground">Loading revenue data…</p>
      </GlassCard>
    );
  }

  const { totals, daily, monthly, recent } = data;

  const pieData = [
    { name: 'Trust Fees',    value: totals.trustTotal,     color: COLORS.trust },
    { name: 'Stablecoin',    value: totals.stableTotal,    color: COLORS.stablecoin },
    { name: 'Insurance',     value: totals.insuranceTotal, color: COLORS.insurance },
    { name: 'Bridge Fees',   value: totals.bridgeTotal,    color: COLORS.bridge },
    { name: 'Buys',          value: totals.buyTotal,       color: COLORS.buys },
    { name: 'Cashouts',      value: totals.cashoutTotal,   color: COLORS.cashouts },
  ].filter(d => d.value > 0);

  const chartData30d = daily.map(row => ({
    day: new Date(row.day).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    Trust:      Number(row.trust),
    Stablecoin: Number(row.stablecoin),
    Insurance:  Number(row.insurance),
    Bridge:     Number(row.bridge),
  }));

  const chartData12m = monthly.map(row => ({
    month: new Date(row.month).toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
    Total: Number(row.total),
  }));

  return (
    <div className="space-y-5">
      {/* Header */}
      <GlassCard className="p-5">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h2 className="text-xl font-bold flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-primary" /> Revenue Dashboard
            </h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              All-time platform revenue across trust fees, stablecoins, insurance, bridge, and orders.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-1.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </Button>
        </div>
      </GlassCard>

      {/* Grand total banner */}
      <GlassCard className="p-6 bg-gradient-to-br from-primary/10 to-primary/5 border-primary/20">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <p className="text-sm text-muted-foreground uppercase tracking-wide">Total Platform Revenue</p>
            <p className="text-4xl font-black mt-1">{fmtGYDS(totals.grandTotal)}</p>
            <p className="text-sm text-muted-foreground mt-0.5">{fmtUSD(totals.grandTotal)} USD equivalent</p>
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="text-center p-3 rounded-lg bg-black/20">
              <p className="text-xl font-bold">{totals.buyCount + totals.cashoutCount}</p>
              <p className="text-muted-foreground text-xs">Processed orders</p>
            </div>
            <div className="text-center p-3 rounded-lg bg-black/20">
              <p className="text-xl font-bold">{pieData.length}</p>
              <p className="text-muted-foreground text-xs">Revenue streams</p>
            </div>
          </div>
        </div>
      </GlassCard>

      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <KpiCard icon={Lock}          label="Living Trust"   gyds={totals.trustTotal}     usd={totals.trustTotal}     color={COLORS.trust} />
        <KpiCard icon={Coins}         label="Stablecoins"    gyds={totals.stableTotal}    usd={totals.stableTotal}    color={COLORS.stablecoin} />
        <KpiCard icon={Shield}        label="Insurance"      gyds={totals.insuranceTotal} usd={totals.insuranceTotal} color={COLORS.insurance} />
        <KpiCard icon={ArrowRightLeft} label="Bridge Fees"   gyds={totals.bridgeTotal}    usd={totals.bridgeTotal}    color={COLORS.bridge} />
        <KpiCard icon={ShoppingCart}  label="Buy Orders"     gyds={totals.buyTotal}       usd={totals.buyTotal}       color={COLORS.buys}      count={totals.buyCount} />
        <KpiCard icon={ArrowDownLeft} label="Cashouts"       gyds={totals.cashoutTotal}   usd={totals.cashoutTotal}   color={COLORS.cashouts}  count={totals.cashoutCount} />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Area / bar time-series */}
        <GlassCard className="p-5 lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" /> Revenue Over Time
            </h3>
            <div className="flex gap-1">
              {(['30d', '12m'] as const).map(v => (
                <Button key={v} size="sm" variant={view === v ? 'default' : 'outline'} className="h-7 px-2.5 text-xs"
                  onClick={() => setView(v)}>
                  {v === '30d' ? 'Last 30 Days' : 'Last 12 Months'}
                </Button>
              ))}
            </div>
          </div>
          <ResponsiveContainer width="100%" height={240}>
            {view === '30d' ? (
              <AreaChart data={chartData30d}>
                <XAxis dataKey="day" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={v => v > 0 ? `${(v/1000).toFixed(0)}k` : '0'} />
                <Tooltip content={<CustomTooltip />} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {[
                  { key: 'Trust',      color: COLORS.trust },
                  { key: 'Stablecoin', color: COLORS.stablecoin },
                  { key: 'Insurance',  color: COLORS.insurance },
                  { key: 'Bridge',     color: COLORS.bridge },
                ].map(({ key, color }) => (
                  <Area key={key} type="monotone" dataKey={key} stackId="1"
                    stroke={color} fill={color} fillOpacity={0.25} strokeWidth={1.5} />
                ))}
              </AreaChart>
            ) : (
              <BarChart data={chartData12m}>
                <XAxis dataKey="month" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={v => v > 0 ? `${(v/1000).toFixed(0)}k` : '0'} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="Total" fill={COLORS.trust} radius={[3, 3, 0, 0]} />
              </BarChart>
            )}
          </ResponsiveContainer>
        </GlassCard>

        {/* Donut breakdown */}
        <GlassCard className="p-5">
          <h3 className="font-semibold mb-4 flex items-center gap-2">
            <Coins className="h-4 w-4 text-primary" /> By Category
          </h3>
          {pieData.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%"
                    innerRadius={50} outerRadius={80} strokeWidth={0}>
                    {pieData.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v: number) => [`${fmt(v)} GYDS`, '']} />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-2 mt-2">
                {pieData.map(d => (
                  <div key={d.name} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full" style={{ background: d.color }} />
                      <span className="text-muted-foreground">{d.name}</span>
                    </div>
                    <span className="font-mono font-medium">{fmt(d.value)}</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="h-40 flex items-center justify-center text-muted-foreground text-sm">
              No revenue recorded yet.
            </div>
          )}
        </GlassCard>
      </div>

      {/* Recent transactions */}
      <GlassCard className="p-5">
        <h3 className="font-semibold mb-4">Recent Revenue Events</h3>
        {recent.length === 0 ? (
          <p className="text-muted-foreground text-sm text-center py-6">No revenue events recorded yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground border-b border-border/30">
                  <th className="pb-2 font-medium pr-4">Type</th>
                  <th className="pb-2 font-medium pr-4">Amount (GYDS)</th>
                  <th className="pb-2 font-medium pr-4">USD equiv.</th>
                  <th className="pb-2 font-medium pr-4">Detail</th>
                  <th className="pb-2 font-medium">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/20">
                {recent.map(item => {
                  const meta = TYPE_META[item.type] ?? TYPE_META['trust'];
                  const Icon = meta.icon;
                  return (
                    <tr key={item.id} className="hover:bg-white/3 transition-colors">
                      <td className="py-2.5 pr-4">
                        <div className="flex items-center gap-2">
                          <div className="p-1.5 rounded-md" style={{ background: `${meta.color}20` }}>
                            <Icon className="h-3.5 w-3.5" style={{ color: meta.color }} />
                          </div>
                          <span className="font-medium" style={{ color: meta.color }}>{meta.label}</span>
                        </div>
                      </td>
                      <td className="py-2.5 pr-4 font-mono font-semibold">{fmt(item.amount)}</td>
                      <td className="py-2.5 pr-4 text-muted-foreground font-mono text-xs">{fmtUSD(item.amount)}</td>
                      <td className="py-2.5 pr-4 text-muted-foreground max-w-[200px] truncate">{item.label}</td>
                      <td className="py-2.5 text-muted-foreground text-xs whitespace-nowrap">
                        {new Date(item.createdAt).toLocaleString()}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </GlassCard>
    </div>
  );
}
