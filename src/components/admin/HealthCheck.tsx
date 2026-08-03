import { useState } from 'react';
import { GlassCard } from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Activity, Database, Globe, Radio, Shield, Server, RefreshCw, Wifi } from 'lucide-react';
import { api } from '@/lib/api';

interface ComponentStatus {
  reachable: boolean;
  latency: number;
  error?: string;
  url?: string;
  blockNumber?: string;
}

interface HealthResult {
  status: string;
  timestamp: string;
  chain_id: number;
  components: {
    database: ComponentStatus;
    rpc: (ComponentStatus & { url: string })[];
    websocket: ComponentStatus;
    explorer: ComponentStatus;
    vpn: ComponentStatus;
    testnet: ComponentStatus;
  };
}

interface CaptchaHealth {
  ok: boolean;
  mode: string;
  serverVerification: boolean;
  checkedAt: string;
}

export const HealthCheck = () => {
  const [result, setResult] = useState<HealthResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [captchaHealth, setCaptchaHealth] = useState<CaptchaHealth | null>(null);
  const [captchaWarning, setCaptchaWarning] = useState<string | null>(null);

  const checkCaptcha = async () => {
    try {
      const response = await fetch('/api/auth/captcha/health', { headers: { Accept: 'application/json' }, credentials: 'include' });
      const contentType = response.headers.get('content-type') ?? '';
      if (!contentType.includes('application/json')) {
        setCaptchaHealth(null);
        setCaptchaWarning('Captcha health route returned the frontend HTML page. Check the /api reverse proxy and restart the API service.');
        return;
      }
      const data = await response.json();
      if (!response.ok || !data.ok || !data.serverVerification) throw new Error(data.error ?? 'Server verification unavailable');
      setCaptchaHealth(data);
      setCaptchaWarning(null);
    } catch (e: any) {
      setCaptchaHealth(null);
      setCaptchaWarning(`Captcha service unavailable: ${e.message}`);
    }
  };

  const runHealthCheck = async () => {
    setLoading(true);
    setError(null);
    try {
      await checkCaptcha();
      const data = await api.get('/api/health');
      setResult(data);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void checkCaptcha();
    const timer = window.setInterval(checkCaptcha, 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const StatusBadge = ({ ok, latency }: { ok: boolean; latency: number }) => (
    <Badge variant={ok ? 'default' : 'destructive'} className="font-mono text-xs">
      {ok ? `✓ ${latency}ms` : '✗ Down'}
    </Badge>
  );

  const ComponentRow = ({ icon: Icon, label, status }: { icon: any; label: string; status: ComponentStatus }) => (
    <div className="flex items-center justify-between py-3 border-b border-border/30 last:border-0">
      <div className="flex items-center gap-3">
        <Icon className="w-4 h-4 text-muted-foreground" />
        <div>
          <p className="text-sm font-medium text-foreground">{label}</p>
          {status.url && <p className="text-xs text-muted-foreground">{status.url}</p>}
          {status.error && <p className="text-xs text-destructive">{status.error}</p>}
        </div>
      </div>
      <StatusBadge ok={status.reachable} latency={status.latency} />
    </div>
  );

  return (
    <GlassCard className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Activity className="w-5 h-5 text-primary" />
          <h3 className="text-lg font-semibold text-foreground">Infrastructure Health</h3>
        </div>
        <div className="flex items-center gap-3">
          {result && (
            <Badge variant={result.status === 'healthy' ? 'default' : 'destructive'} className="uppercase text-xs">
              {result.status}
            </Badge>
          )}
          <Button size="sm" onClick={runHealthCheck} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            {loading ? 'Checking...' : 'Run Check'}
          </Button>
        </div>
      </div>

      {error && (
        <div className="p-3 mb-4 rounded-lg bg-destructive/10 text-destructive text-sm">{error}</div>
      )}

      {result ? (
        <div className="space-y-1">
          <ComponentRow icon={Database} label="Database" status={result.components.database} />
          {result.components.rpc.map((r, i) => (
            <ComponentRow key={i} icon={Globe} label={`RPC ${i === 0 ? '(Primary)' : `(Backup ${i})`}`} status={r} />
          ))}
          <ComponentRow icon={Radio} label="WebSocket" status={result.components.websocket} />
          <ComponentRow icon={Server} label="Explorer" status={result.components.explorer} />
          <ComponentRow icon={Shield} label="VPN Gateway" status={result.components.vpn} />
          <ComponentRow icon={Wifi} label="Testnet RPC" status={result.components.testnet} />
          <p className="text-xs text-muted-foreground mt-4 text-right">
            Last checked: {new Date(result.timestamp).toLocaleString()}
          </p>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground text-center py-8">
          Click "Run Check" to verify all infrastructure components.
        </p>
      )}
    </GlassCard>
  );
};
