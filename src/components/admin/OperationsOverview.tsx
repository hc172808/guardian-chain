import { useEffect, useMemo, useState } from 'react';
import { GlassCard } from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { api } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import { Download, RefreshCw, Users, ShieldBan, Wallet as WalletIcon, Clock } from 'lucide-react';
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';

interface OverviewData {
  days: number;
  generatedAt: string;
  totals: Record<string, number>;
  loginSeries: Array<{ day: string; logins: number; failed: number; bans: number }>;
  recentLogins: Array<Record<string, any>>;
  pendingTransfers: Array<Record<string, any>>;
  topBalances: Array<{ address: string; token: string; balance: number }>;
  ipBans: Array<Record<string, any>>;
}

function toCsv(rows: Array<Record<string, any>>): string {
  if (!rows.length) return '';
  const headers = Array.from(new Set(rows.flatMap((r) => Object.keys(r))));
  const escape = (v: unknown) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers.join(','), ...rows.map((r) => headers.map((h) => escape(r[h])).join(','))].join('\n');
}

function downloadCsv(name: string, rows: Array<Record<string, any>>) {
  const csv = toCsv(rows);
  if (!csv) return;
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `${name}-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

const fmtGyds = (n: number) =>
  `${Number(n ?? 0).toLocaleString(undefined, { maximumFractionDigits: 6 })} GYDS`;

export function OperationsOverview() {
  const { toast } = useToast();
  const [data, setData] = useState<OverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState('30');

  const load = async (d = days) => {
    setLoading(true);
    try {
      setData(await api.get(`/api/admin/overview?days=${d}`));
    } catch (e: any) {
      toast({ title: 'Overview unavailable', description: e.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(days); /* eslint-disable-next-line */ }, [days]);

  const balanceChart = useMemo(
    () => (data?.topBalances ?? []).slice(0, 12).map((b) => ({
      name: `${b.address.slice(0, 6)}…${b.address.slice(-4)}`,
      balance: Number(b.balance ?? 0),
      token: b.token,
    })),
    [data],
  );

  const stats = [
    { label: 'Users', value: data?.totals?.users ?? 0, icon: Users },
    { label: 'IP bans', value: data?.totals?.ip_bans ?? 0, icon: ShieldBan },
    { label: 'Wallets', value: data?.totals?.wallets ?? 0, icon: WalletIcon },
    { label: 'Pending transfers', value: data?.totals?.pending_tx ?? 0, icon: Clock },
  ];

  return (
    <div className="space-y-4">
      <GlassCard className="p-4 flex flex-wrap items-center gap-3 justify-between">
        <div>
          <h2 className="text-lg font-semibold">Operations Overview</h2>
          <p className="text-xs text-muted-foreground">
            Logins, IP bans, wallet balances and pending transfers
            {data ? ` · updated ${new Date(data.generatedAt).toLocaleTimeString()}` : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={days} onValueChange={setDays}>
            <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="7">Last 7 days</SelectItem>
              <SelectItem value="30">Last 30 days</SelectItem>
              <SelectItem value="90">Last 90 days</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={() => load()} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-1 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </Button>
        </div>
      </GlassCard>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {stats.map((s) => (
          <GlassCard key={s.label} className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs">
              <s.icon className="h-4 w-4" /> {s.label}
            </div>
            <div className="text-2xl font-bold mt-1">{s.value}</div>
          </GlassCard>
        ))}
      </div>

      <GlassCard className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-sm">Login activity</h3>
          <Button variant="ghost" size="sm" onClick={() => downloadCsv('login-series', data?.loginSeries ?? [])}>
            <Download className="h-4 w-4 mr-1" /> CSV
          </Button>
        </div>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data?.loginSeries ?? []}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
              <XAxis dataKey="day" fontSize={11} />
              <YAxis fontSize={11} allowDecimals={false} />
              <Tooltip />
              <Legend />
              <Area type="monotone" dataKey="logins" stroke="hsl(var(--primary))" fill="hsl(var(--primary))" fillOpacity={0.25} />
              <Area type="monotone" dataKey="failed" stroke="hsl(var(--destructive))" fill="hsl(var(--destructive))" fillOpacity={0.2} />
              <Area type="monotone" dataKey="bans" stroke="hsl(var(--muted-foreground))" fill="hsl(var(--muted-foreground))" fillOpacity={0.15} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </GlassCard>

      <GlassCard className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-sm">Top wallet balances (confirmed transfers)</h3>
          <Button variant="ghost" size="sm" onClick={() => downloadCsv('wallet-balances', data?.topBalances ?? [])}>
            <Download className="h-4 w-4 mr-1" /> CSV
          </Button>
        </div>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={balanceChart}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
              <XAxis dataKey="name" fontSize={11} />
              <YAxis fontSize={11} />
              <Tooltip formatter={(v: any) => fmtGyds(Number(v))} />
              <Bar dataKey="balance" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </GlassCard>

      <Tabs defaultValue="logins">
        <TabsList>
          <TabsTrigger value="logins">Recent logins</TabsTrigger>
          <TabsTrigger value="bans">IP bans</TabsTrigger>
          <TabsTrigger value="pending">Pending transfers</TabsTrigger>
        </TabsList>

        <TabsContent value="logins">
          <GlassCard className="p-4">
            <div className="flex justify-end mb-2">
              <Button variant="ghost" size="sm" onClick={() => downloadCsv('recent-logins', data?.recentLogins ?? [])}>
                <Download className="h-4 w-4 mr-1" /> Export CSV
              </Button>
            </div>
            <div className="overflow-x-auto max-h-96">
              <table className="w-full text-xs">
                <thead className="text-muted-foreground sticky top-0 bg-background/80 backdrop-blur">
                  <tr><th className="text-left p-2">When</th><th className="text-left p-2">User</th><th className="text-left p-2">Action</th><th className="text-left p-2">IP</th></tr>
                </thead>
                <tbody>
                  {(data?.recentLogins ?? []).map((r) => (
                    <tr key={r.id} className="border-t border-border/40">
                      <td className="p-2 whitespace-nowrap">{new Date(r.created_at).toLocaleString()}</td>
                      <td className="p-2">{r.user_email ?? r.user_id}</td>
                      <td className="p-2">
                        <Badge variant={String(r.action).includes('fail') ? 'destructive' : 'secondary'}>{r.action}</Badge>
                      </td>
                      <td className="p-2 font-mono">{r.ip_address ?? '—'}</td>
                    </tr>
                  ))}
                  {!data?.recentLogins?.length && <tr><td className="p-4 text-muted-foreground" colSpan={4}>No login events recorded yet.</td></tr>}
                </tbody>
              </table>
            </div>
          </GlassCard>
        </TabsContent>

        <TabsContent value="bans">
          <GlassCard className="p-4">
            <div className="flex justify-end mb-2">
              <Button variant="ghost" size="sm" onClick={() => downloadCsv('ip-bans', data?.ipBans ?? [])}>
                <Download className="h-4 w-4 mr-1" /> Export CSV
              </Button>
            </div>
            <div className="overflow-x-auto max-h-96">
              <table className="w-full text-xs">
                <thead className="text-muted-foreground"><tr><th className="text-left p-2">IP</th><th className="text-left p-2">Reason</th><th className="text-left p-2">Expires</th></tr></thead>
                <tbody>
                  {(data?.ipBans ?? []).map((b: any, i) => (
                    <tr key={`${b.ip ?? b.ip_address}-${i}`} className="border-t border-border/40">
                      <td className="p-2 font-mono">{b.ip ?? b.ip_address}</td>
                      <td className="p-2">{b.reason ?? '—'}</td>
                      <td className="p-2">{b.expiresAt ?? b.expires_at ? new Date(b.expiresAt ?? b.expires_at).toLocaleString() : 'permanent'}</td>
                    </tr>
                  ))}
                  {!data?.ipBans?.length && <tr><td className="p-4 text-muted-foreground" colSpan={3}>No IP bans active.</td></tr>}
                </tbody>
              </table>
            </div>
          </GlassCard>
        </TabsContent>

        <TabsContent value="pending">
          <GlassCard className="p-4">
            <div className="flex justify-end mb-2">
              <Button variant="ghost" size="sm" onClick={() => downloadCsv('pending-transfers', data?.pendingTransfers ?? [])}>
                <Download className="h-4 w-4 mr-1" /> Export CSV
              </Button>
            </div>
            <div className="overflow-x-auto max-h-96">
              <table className="w-full text-xs">
                <thead className="text-muted-foreground"><tr><th className="text-left p-2">When</th><th className="text-left p-2">From</th><th className="text-left p-2">To</th><th className="text-right p-2">Amount</th><th className="text-left p-2">Network</th></tr></thead>
                <tbody>
                  {(data?.pendingTransfers ?? []).map((t) => (
                    <tr key={t.id} className="border-t border-border/40">
                      <td className="p-2 whitespace-nowrap">{new Date(t.created_at).toLocaleString()}</td>
                      <td className="p-2 font-mono">{String(t.from_address).slice(0, 10)}…</td>
                      <td className="p-2 font-mono">{String(t.to_address).slice(0, 10)}…</td>
                      <td className="p-2 text-right">{Number(t.amount).toLocaleString()} {t.token_symbol}</td>
                      <td className="p-2">{t.network}</td>
                    </tr>
                  ))}
                  {!data?.pendingTransfers?.length && <tr><td className="p-4 text-muted-foreground" colSpan={5}>No pending transfers.</td></tr>}
                </tbody>
              </table>
            </div>
          </GlassCard>
        </TabsContent>
      </Tabs>
    </div>
  );
}
