import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Area, AreaChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { AlertTriangle, RefreshCw, ShieldAlert } from 'lucide-react';

type MonitorEntry = {
  requestId: string;
  event: string;
  at: string;
  ip: string;
  challengeId?: string;
  details?: Record<string, unknown>;
};

type MonitorPayload = {
  status: 'healthy' | 'degraded';
  startedAt: string;
  counts: Record<string, number>;
  recent: MonitorEntry[];
  buckets: Array<Record<string, number>>;
  fallbackAttempts?: Array<{ challengeId: string; at: string; outcome: string }>;
  alerts?: {
    config: { slackConfigured: boolean; emailRecipients: number; threshold: number; windowMs: number };
    recent: Array<{ kind: string; at: string; count: number; channels: string[] }>;
  };
};

const EVENT_COLORS: Record<string, string> = {
  html_response: 'hsl(var(--destructive))',
  retry: 'hsl(var(--primary))',
  blocked_login: 'hsl(var(--warning, 38 92% 50%))',
  captcha_failed: 'hsl(var(--muted-foreground))',
};

export function CaptchaMonitorDashboard() {
  const [data, setData] = useState<MonitorPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<MonitorEntry | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/auth/captcha/monitor', { credentials: 'include' });
      const contentType = res.headers.get('content-type') ?? '';
      if (!contentType.includes('application/json')) {
        throw new Error(`Monitoring endpoint returned ${res.status} ${contentType || 'unknown content type'}`);
      }
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? `Request failed (${res.status})`);
      setData(json);
      setError(null);
    } catch (e: any) {
      setError(e?.message ?? 'Failed to load monitoring data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const timer = setInterval(load, 30_000);
    return () => clearInterval(timer);
  }, []);

  const chartData = useMemo(
    () =>
      (data?.buckets ?? []).map(bucket => ({
        time: new Date(bucket.t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        html_response: bucket.html_response ?? 0,
        retry: bucket.retry ?? 0,
        blocked_login: bucket.blocked_login ?? 0,
        captcha_failed: bucket.captcha_failed ?? 0,
      })),
    [data],
  );

  const counts = data?.counts ?? {};

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              <ShieldAlert className="h-5 w-5" /> Captcha &amp; Security-Check Monitoring
            </CardTitle>
            <CardDescription>
              HTML-response rates, retries and blocked logins over time — with request-ID drill-down.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            {data && (
              <Badge variant={data.status === 'healthy' ? 'secondary' : 'destructive'}>{data.status}</Badge>
            )}
            <Button size="sm" variant="outline" onClick={load} disabled={loading}>
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {error && (
            <div className="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
              <AlertTriangle className="h-4 w-4" /> {error}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {['html_response', 'retry', 'blocked_login', 'captcha_failed'].map(key => (
              <div key={key} className="rounded-lg border p-3">
                <p className="text-xs uppercase text-muted-foreground">{key.replace('_', ' ')}</p>
                <p className="text-2xl font-semibold">{counts[key] ?? 0}</p>
              </div>
            ))}
          </div>

          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <XAxis dataKey="time" fontSize={11} />
                <YAxis allowDecimals={false} fontSize={11} />
                <Tooltip />
                <Legend />
                {Object.keys(EVENT_COLORS).map(key => (
                  <Area
                    key={key}
                    type="monotone"
                    dataKey={key}
                    stackId="1"
                    stroke={EVENT_COLORS[key]}
                    fill={EVENT_COLORS[key]}
                    fillOpacity={0.25}
                  />
                ))}
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {data?.alerts && (
            <div className="rounded-lg border p-3 text-sm">
              <p className="font-medium">Alerting</p>
              <p className="text-muted-foreground">
                Slack: {data.alerts.config.slackConfigured ? 'configured' : 'not configured'} · Email recipients:{' '}
                {data.alerts.config.emailRecipients} · Threshold: {data.alerts.config.threshold} events /{' '}
                {Math.round(data.alerts.config.windowMs / 60000)} min
              </p>
              {data.alerts.recent.length > 0 && (
                <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                  {data.alerts.recent.map((a, i) => (
                    <li key={i}>
                      {new Date(a.at).toLocaleString()} — {a.kind} ×{a.count} → {a.channels.join(', ')}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <div>
            <p className="mb-2 text-sm font-medium">Recent events (click a row for details)</p>
            <div className="max-h-80 overflow-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Time</TableHead>
                    <TableHead>Event</TableHead>
                    <TableHead>IP</TableHead>
                    <TableHead>Request ID</TableHead>
                    <TableHead>Challenge ID</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(data?.recent ?? []).map(entry => (
                    <TableRow key={entry.requestId} className="cursor-pointer" onClick={() => setSelected(entry)}>
                      <TableCell className="whitespace-nowrap text-xs">
                        {new Date(entry.at).toLocaleTimeString()}
                      </TableCell>
                      <TableCell className="text-xs">{entry.event}</TableCell>
                      <TableCell className="text-xs">{entry.ip}</TableCell>
                      <TableCell className="font-mono text-xs">{entry.requestId}</TableCell>
                      <TableCell className="max-w-[220px] truncate font-mono text-xs">
                        {entry.challengeId ?? '—'}
                      </TableCell>
                    </TableRow>
                  ))}
                  {(data?.recent?.length ?? 0) === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-sm text-muted-foreground">
                        No captcha events recorded.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </div>

          {data?.fallbackAttempts && data.fallbackAttempts.length > 0 && (
            <div className="rounded-lg border p-3">
              <p className="mb-2 text-sm font-medium">Fallback challenge attempts</p>
              <ul className="max-h-48 space-y-1 overflow-auto font-mono text-xs text-muted-foreground">
                {data.fallbackAttempts.map((a, i) => (
                  <li key={i}>
                    {new Date(a.at).toLocaleTimeString()} · {a.outcome} · {a.challengeId}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!selected} onOpenChange={open => !open && setSelected(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Request {selected?.requestId}</DialogTitle>
          </DialogHeader>
          <pre className="max-h-96 overflow-auto rounded-md bg-muted p-3 text-xs">
            {JSON.stringify(selected, null, 2)}
          </pre>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default CaptchaMonitorDashboard;
