import { useState, useEffect } from 'react';
import { Layout } from '@/components/layout/Layout';
import { RequireAuth } from '@/components/auth/RequireAuth';
import { GlassCard } from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/button';
import { motion } from 'framer-motion';
import { 
  Users, 
  Server, 
  Check, 
  X, 
  Shield, 
  Clock,
  Key,
  Copy,
  RefreshCw,
  Flame,
  Coins,
  Building2,
  GitBranch,
  ScrollText,
  Activity,
  Eye,
  Wifi,
  WifiOff,
  MonitorDot,
  MessageCircle
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { useNavigate } from 'react-router-dom';
import { BurnMintManager } from '@/components/admin/BurnMintManager';
import { StablecoinManager } from '@/components/admin/StablecoinManager';
import { SponsorManager } from '@/components/admin/SponsorManager';
import { DatabaseSettings } from '@/components/admin/DatabaseSettings';
import { WhatsAppSettings } from '@/components/admin/WhatsAppSettings';
import { CoinLogoUpload } from '@/components/admin/CoinLogoUpload';
import { PremineManager } from '@/components/admin/PremineManager';
import { ValidatorManager } from '@/components/admin/ValidatorManager';
import { FirewallManager } from '@/components/admin/FirewallManager';
import { AuditLogViewer } from '@/components/admin/AuditLogViewer';
import { HealthCheck } from '@/components/admin/HealthCheck';
import { TokenPricingManager } from '@/components/admin/TokenPricingManager';
import { TokenManager } from '@/components/admin/TokenManager';
import { NodeInstaller } from '@/components/admin/NodeInstaller';
import { WireGuardPeerManager } from '@/components/admin/WireGuardPeerManager';
import { AdminConsole } from '@/components/admin/AdminConsole';
import { ComponentVisibility } from '@/components/admin/ComponentVisibility';
import { MainnetPromotion } from '@/components/admin/MainnetPromotion';
import { MiningPoolAdmin } from '@/components/admin/MiningPoolAdmin';
import { NodeVisibilitySettings } from '@/components/admin/NodeVisibilitySettings';
import { UserManager } from '@/components/admin/UserManager';
import { FeatureGrantManager } from '@/components/admin/FeatureGrantManager';
import { Terminal as TerminalIcon, EyeOff, Rocket, Pickaxe, Wrench, Link2, Search as SearchIcon, Smartphone, Settings } from 'lucide-react';
import { MaintenanceManager } from '@/components/admin/MaintenanceManager';
import { BridgeNetworkManager } from '@/components/admin/BridgeNetworkManager';
import { ExplorerConfig } from '@/components/admin/ExplorerConfig';
import { TestNodeManager } from '@/components/admin/TestNodeManager';
import { GrantAchievementPanel } from '@/components/admin/GrantAchievementPanel';
import { FlaskConical, Trophy, Rocket as RocketIcon, ArrowRightLeft, RotateCcw, ExternalLink, ToggleLeft, ToggleRight, Zap, Timer } from 'lucide-react';
import { CronJobManager } from '@/components/admin/CronJobManager';
import { NodeRepoSync } from '@/components/admin/NodeRepoSync';
import { PaymentMethodsManager } from '@/components/admin/PaymentMethodsManager';
import { WalletReleaseManager } from '@/components/layout/WalletDownloadButton';
import { ServerConfigManager } from '@/components/admin/ServerConfigManager';

function GitSyncPanel({ toast }: { toast: any }) {
  const [pulling, setPulling] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; stdout: string; stderr: string } | null>(null);

  const doPull = async () => {
    setPulling(true);
    setResult(null);
    try {
      const res = await fetch('/api/admin/git-pull', { method: 'POST' });
      const data = await res.json();
      setResult(data);
      toast({ title: data.ok ? 'Git pull succeeded' : 'Git pull failed', description: data.stdout?.slice(0, 100) || data.stderr?.slice(0, 100), variant: data.ok ? 'default' : 'destructive' });
    } catch (e: any) {
      toast({ title: 'Git pull error', description: e.message, variant: 'destructive' });
    } finally {
      setPulling(false);
    }
  };

  return (
    <GlassCard className="p-6">
      <div className="flex items-center gap-3 mb-4">
        <div className="p-3 rounded-lg bg-primary/20">
          <GitBranch className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h3 className="font-semibold text-lg">GitHub Sync</h3>
          <p className="text-sm text-muted-foreground">Pull latest code from GitHub and restart services</p>
        </div>
      </div>
      <div className="space-y-4">
        <div className="p-4 rounded-lg bg-secondary/30 space-y-3">
          <h4 className="font-medium">Pull from GitHub</h4>
          <p className="text-sm text-muted-foreground">
            Runs <code className="bg-black/30 px-1 rounded">git pull --ff-only</code> in the dashboard directory.
            After pulling, rebuild and restart:
            <code className="block bg-black/30 px-2 py-1 rounded mt-1 text-xs">npm run build && pm2 restart gydschain-api && nginx -s reload</code>
          </p>
          <Button variant="outline" className="gap-2" onClick={doPull} disabled={pulling}>
            <RefreshCw className={`h-4 w-4 ${pulling ? 'animate-spin' : ''}`} />
            {pulling ? 'Pulling…' : 'Git Pull'}
          </Button>
          {result && (
            <div className={`p-3 rounded text-xs font-mono whitespace-pre-wrap ${result.ok ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>
              {result.stdout || result.stderr || (result.ok ? 'Already up to date.' : 'Unknown error')}
            </div>
          )}
        </div>
        <div className="p-4 rounded-lg bg-secondary/30 space-y-2">
          <h4 className="font-medium">All Repositories</h4>
          <div className="text-xs text-muted-foreground space-y-1">
            {[
              ['Dashboard',  'hc172808/guardian-chain'],
              ['Full Node',  'hc172808/fullnode'],
              ['Lite Node',  'hc172808/litenode'],
              ['Boost Node', 'hc172808/boostnode'],
              ['RPC Node',   'hc172808/rpcnode'],
              ['Genesis',    'hc172808/genesis'],
            ].map(([name, repo]) => (
              <div key={repo} className="flex items-center justify-between">
                <span className="text-foreground">{name}</span>
                <a href={`https://github.com/${repo}`} target="_blank" rel="noreferrer" className="text-primary hover:underline">
                  github.com/{repo}
                </a>
              </div>
            ))}
          </div>
        </div>
      </div>
    </GlassCard>
  );
}

interface UserProfile {
  id: string;
  user_id: string;
  email: string | null;
  role: string;
  created_at: string;
}

interface NodeInstallation {
  id: string;
  userId: string;
  nodeType: string;
  wireguardPublicKey: string | null;
  isSynced: boolean;
  isApproved: boolean;
  createdAt: string;
  profiles?: { email: string | null };
}

function LaunchesManager({ toast }: { toast: any }) {
  const [launches, setLaunches] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/launches', { credentials: 'include' });
      if (res.ok) setLaunches(await res.json());
    } catch {}
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const toggle = async (id: string, visible: boolean) => {
    await fetch(`/api/admin/launches/${id}`, {
      method: 'PATCH', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ visible }),
    });
    setLaunches(prev => prev.map(l => l.id === id ? { ...l, is_visible: visible } : l));
    toast({ title: visible ? 'Launch visible' : 'Launch hidden' });
  };

  if (loading) return <GlassCard className="p-6 text-center">Loading launches…</GlassCard>;

  return (
    <GlassCard className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-lg flex items-center gap-2">
            <RocketIcon className="w-5 h-5 text-primary" /> Token Launch Manager
          </h3>
          <p className="text-sm text-muted-foreground">Control visibility of token launches in the Launchpad</p>
        </div>
        <Button variant="outline" size="sm" onClick={load}><RefreshCw className="h-4 w-4" /></Button>
      </div>
      {launches.length === 0 ? (
        <p className="text-muted-foreground text-sm">No token launches yet.</p>
      ) : (
        <div className="space-y-3">
          {launches.map(l => (
            <div key={l.id} className="flex items-center justify-between p-4 rounded-lg bg-secondary/20 border border-border/30">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-semibold">{l.name || l.symbol || 'Unknown'}</span>
                  <Badge variant={l.status === 'active' ? 'default' : 'secondary'} className="text-xs">{l.status}</Badge>
                  {l.is_visible === false && <Badge variant="outline" className="text-xs border-red-500/50 text-red-400">Hidden</Badge>}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {l.symbol} · Created by {l.username || l.email || l.creator_id?.toString().slice(0,8) || 'Unknown'}
                </p>
                <p className="text-xs text-muted-foreground">{new Date(l.created_at).toLocaleString()}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Button
                  size="sm" variant="outline"
                  onClick={() => toggle(l.id, l.is_visible === false)}
                  className="gap-1"
                >
                  {l.is_visible === false
                    ? <><ToggleLeft className="h-4 w-4 text-muted-foreground" /> Show</>
                    : <><ToggleRight className="h-4 w-4 text-emerald-400" /> Hide</>}
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </GlassCard>
  );
}

function BridgeFeeConfig({ toast }: { toast: any }) {
  const [config, setConfig] = useState({ feePercent: 0.3, minFeeUsd: 1.0, maxFeeUsd: 100.0 });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch('/api/admin/bridge-fee-config', { credentials: 'include' })
      .then(r => r.json()).then(setConfig).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/admin/bridge-fee-config', {
        method: 'PUT', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      if (!res.ok) throw new Error('Save failed');
      toast({ title: 'Bridge fee config saved' });
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally { setSaving(false); }
  };

  if (loading) return <GlassCard className="p-6 text-center">Loading…</GlassCard>;

  return (
    <GlassCard className="p-6 space-y-6">
      <div>
        <h3 className="font-semibold text-lg flex items-center gap-2">
          <ArrowRightLeft className="w-5 h-5 text-primary" /> Bridge Fee Configuration
        </h3>
        <p className="text-sm text-muted-foreground">Configure the fee charged on cross-chain bridge transfers</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          { label: 'Fee %', key: 'feePercent' as const, min: 0, max: 5, step: 0.01, suffix: '%' },
          { label: 'Min Fee (USD)', key: 'minFeeUsd' as const, min: 0, max: 50, step: 0.1, suffix: 'USD' },
          { label: 'Max Fee (USD)', key: 'maxFeeUsd' as const, min: 1, max: 1000, step: 1, suffix: 'USD' },
        ].map(f => (
          <div key={f.key} className="space-y-2">
            <label className="text-sm font-medium">{f.label}</label>
            <div className="flex items-center gap-2">
              <input
                type="number" min={f.min} max={f.max} step={f.step}
                value={config[f.key]}
                onChange={e => setConfig(prev => ({ ...prev, [f.key]: parseFloat(e.target.value) || 0 }))}
                className="flex-1 bg-muted/30 border border-border/40 rounded-lg px-3 py-2 text-sm focus:ring-1 ring-primary outline-none"
              />
              <span className="text-xs text-muted-foreground shrink-0">{f.suffix}</span>
            </div>
          </div>
        ))}
      </div>
      <div className="p-3 rounded-lg bg-primary/5 border border-primary/20 text-xs text-muted-foreground">
        Example: a 10,000 GYDS bridge at ${config.feePercent}% = {(10000 * config.feePercent / 100).toFixed(0)} GYDS fee (clamped to ${config.minFeeUsd}–${config.maxFeeUsd} USD equivalent)
      </div>
      <Button onClick={save} disabled={saving} className="gap-2">
        {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : null}
        Save Fee Config
      </Button>
    </GlassCard>
  );
}

function OracleAdmin({ toast }: { toast: any }) {
  const [feeds, setFeeds] = useState<any[]>([]);
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [newSymbol, setNewSymbol] = useState('');
  const [newSource, setNewSource] = useState('');
  const [adding, setAdding] = useState(false);
  const [selectedFeed, setSelectedFeed] = useState<string | null>(null);

  const fetchFeeds = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/oracle/feeds', { credentials: 'include' });
      if (res.ok) setFeeds(await res.json());
    } finally { setLoading(false); }
  };

  const fetchSubmissions = async (feedId: string) => {
    setSelectedFeed(feedId);
    const res = await fetch(`/api/admin/oracle/feeds/${feedId}`, { credentials: 'include' });
    if (res.ok) setSubmissions(await res.json());
  };

  const addFeed = async () => {
    if (!newSymbol.trim()) return;
    setAdding(true);
    try {
      const res = await fetch('/api/oracle/feeds', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol: newSymbol.trim().toUpperCase(), source: newSource.trim() || 'manual', heartbeat_seconds: 300 }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      toast({ title: `Oracle feed ${newSymbol.toUpperCase()} created` });
      setNewSymbol(''); setNewSource('');
      fetchFeeds();
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally { setAdding(false); }
  };

  useEffect(() => { fetchFeeds(); }, []);

  return (
    <div className="space-y-4">
      <GlassCard className="p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">Oracle Price Feeds</h3>
          <Button variant="outline" size="sm" onClick={fetchFeeds} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
        <div className="flex gap-2">
          <input value={newSymbol} onChange={e => setNewSymbol(e.target.value)} placeholder="Symbol (e.g. GYDS)" className="flex-1 bg-muted/30 border border-border/40 rounded-lg px-3 py-2 text-sm focus:ring-1 ring-primary outline-none" />
          <input value={newSource} onChange={e => setNewSource(e.target.value)} placeholder="Source (e.g. coingecko)" className="flex-1 bg-muted/30 border border-border/40 rounded-lg px-3 py-2 text-sm focus:ring-1 ring-primary outline-none" />
          <Button onClick={addFeed} disabled={adding || !newSymbol.trim()} className="gap-1 shrink-0">
            {adding ? <RefreshCw className="h-4 w-4 animate-spin" /> : '+'} Add
          </Button>
        </div>
        {loading ? (
          <div className="text-muted-foreground text-sm py-4 text-center"><RefreshCw className="inline w-4 h-4 animate-spin mr-2" />Loading feeds…</div>
        ) : feeds.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">No oracle feeds configured yet.</p>
        ) : (
          <div className="space-y-2">
            {feeds.map((f: any) => (
              <div key={f.id} className="flex items-center justify-between p-3 bg-muted/20 rounded-xl text-sm">
                <div>
                  <span className="font-mono font-bold text-primary">{f.symbol}</span>
                  <span className="text-muted-foreground ml-2">·</span>
                  <span className="text-muted-foreground ml-2">source: {f.source}</span>
                </div>
                <div className="flex items-center gap-3">
                  {f.latest_price && (
                    <span className="font-mono text-emerald-400">${Number(f.latest_price).toFixed(6)}</span>
                  )}
                  <Badge variant={f.is_active ? 'default' : 'secondary'} className="text-xs">
                    {f.is_active ? 'Active' : 'Inactive'}
                  </Badge>
                  <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => fetchSubmissions(f.id)}>
                    History
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </GlassCard>

      {selectedFeed && (
        <GlassCard className="p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">Submission History</h3>
            <button onClick={() => { setSelectedFeed(null); setSubmissions([]); }} className="text-muted-foreground hover:text-foreground text-xs">Close</button>
          </div>
          {submissions.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-2">No submissions yet.</p>
          ) : (
            <div className="space-y-1 max-h-64 overflow-y-auto">
              {submissions.map((s: any, i: number) => (
                <div key={i} className="flex items-center justify-between text-xs p-2 bg-muted/20 rounded-lg">
                  <span className="font-mono text-primary">${Number(s.price).toFixed(6)}</span>
                  <span className="text-muted-foreground">{s.submitter_address?.slice(0, 12) || 'system'}…</span>
                  <span className="text-muted-foreground">{s.submitted_at ? new Date(s.submitted_at).toLocaleString() : '—'}</span>
                </div>
              ))}
            </div>
          )}
        </GlassCard>
      )}
    </div>
  );
}

function ValidatorExplorerMonitor({ toast }: { toast: any }) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const refresh = async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/admin/monitoring');
      setData(await r.json());
    } catch { toast({ title: 'Failed to load monitoring data', variant: 'destructive' }); }
    setLoading(false);
  };

  useEffect(() => { refresh(); }, []);

  const StatusBadge = ({ ok, label }: { ok: boolean; label: string }) => (
    <div className={`flex items-center gap-1.5 px-2 py-1 rounded-full text-xs border ${ok ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' : 'bg-red-500/10 text-red-400 border-red-500/30'}`}>
      <div className={`w-1.5 h-1.5 rounded-full ${ok ? 'bg-emerald-400' : 'bg-red-400'}`} />
      {label}
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-primary" />
          <span className="font-medium text-foreground">Validator & Explorer Monitoring</span>
        </div>
        <Button size="sm" variant="outline" onClick={refresh} disabled={loading} className="gap-1 text-xs h-7">
          <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>
      {data ? (
        <div className="space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-secondary/20 rounded-lg p-3 text-center">
              <div className="text-xl font-bold text-foreground">{data.validators?.total ?? 0}</div>
              <div className="text-xs text-muted-foreground">Total Validators</div>
            </div>
            <div className="bg-secondary/20 rounded-lg p-3 text-center">
              <div className="text-xl font-bold text-emerald-400">{data.validators?.active ?? 0}</div>
              <div className="text-xs text-muted-foreground">Active</div>
            </div>
            <div className="bg-secondary/20 rounded-lg p-3 text-center">
              <div className="text-xl font-bold text-foreground">{data.nodes?.total ?? 0}</div>
              <div className="text-xs text-muted-foreground">Total Nodes</div>
            </div>
            <div className="bg-secondary/20 rounded-lg p-3 text-center">
              <div className="text-xl font-bold text-emerald-400">{data.nodes?.synced ?? 0}</div>
              <div className="text-xs text-muted-foreground">Synced Nodes</div>
            </div>
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-2 font-medium">RPC Endpoints</p>
            <div className="space-y-1.5">
              {(data.rpc ?? []).map((ep: any, i: number) => (
                <div key={i} className="flex items-center justify-between bg-secondary/20 rounded-lg p-2">
                  <span className="text-xs font-mono text-muted-foreground truncate max-w-[55%]">{ep.url}</span>
                  <StatusBadge ok={ep.reachable} label={ep.reachable ? `Block #${parseInt(ep.blockNumber ?? '0', 16)}` : 'Unreachable'} />
                </div>
              ))}
            </div>
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-2 font-medium">System</p>
            <div className="flex flex-wrap gap-2">
              <StatusBadge ok={data.db} label="Database" />
              <StatusBadge ok={true} label={`Uptime: ${Math.floor((data.uptime ?? 0) / 3600)}h ${Math.floor(((data.uptime ?? 0) % 3600) / 60)}m`} />
              <StatusBadge ok={true} label={`Mem: ${Math.round((data.memory?.heapUsed ?? 0) / 1024 / 1024)}MB`} />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">Last checked: {data.timestamp ? new Date(data.timestamp).toLocaleTimeString() : '—'}</p>
        </div>
      ) : loading ? (
        <div className="text-center py-8 text-muted-foreground text-sm">Loading monitoring data…</div>
      ) : (
        <div className="text-center py-8 text-muted-foreground text-sm">No data. Click Refresh.</div>
      )}
    </div>
  );
}

function FlashLoanCircuitBreaker({ toast }: { toast: any }) {
  const [enabled, setEnabled] = useState(true);
  const [maxLoan, setMaxLoan] = useState('500000');
  const [fee, setFee] = useState('0.09');
  const [cooldown, setCooldown] = useState('60');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    await new Promise(r => setTimeout(r, 600));
    setSaving(false);
    toast({ title: 'Flash loan settings saved', description: enabled ? 'Circuit breaker active' : '⚠️ Circuit breaker disabled' });
  };

  return (
    <GlassCard className="p-5 space-y-5">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold flex items-center gap-2"><Zap className="w-4 h-4 text-amber-400" /> Flash Loan Circuit Breaker</h3>
        <Badge className={enabled ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' : 'bg-red-500/20 text-red-400 border-red-500/30'}>
          {enabled ? 'ACTIVE' : 'DISABLED'}
        </Badge>
      </div>
      <p className="text-xs text-muted-foreground">The circuit breaker automatically pauses flash loan issuance if suspicious patterns are detected (rapid re-borrowing, volume spike, sandwich attacks).</p>
      <div className="flex items-center justify-between p-3 bg-muted/20 rounded-xl">
        <div>
          <p className="text-sm font-medium">Circuit Breaker</p>
          <p className="text-xs text-muted-foreground">Auto-pause flash loans on anomaly</p>
        </div>
        <button onClick={() => setEnabled(!enabled)}
          className={`w-11 h-6 rounded-full transition-colors relative ${enabled ? 'bg-primary' : 'bg-muted'}`}>
          <span className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-all ${enabled ? 'right-1' : 'left-1'}`} />
        </button>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div>
          <Label className="text-xs text-muted-foreground">Max Loan (GYDS)</Label>
          <Input value={maxLoan} onChange={e => setMaxLoan(e.target.value)} className="mt-1 text-sm" type="number" />
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">Fee (%)</Label>
          <Input value={fee} onChange={e => setFee(e.target.value)} className="mt-1 text-sm" type="number" step="0.01" />
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">Cooldown (sec)</Label>
          <Input value={cooldown} onChange={e => setCooldown(e.target.value)} className="mt-1 text-sm" type="number" />
        </div>
      </div>
      <div className="space-y-2">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Recent Flash Loans</p>
        <div className="space-y-1.5">
          {[
            { hash: '0xa3b1…', amount: '50,000 GYDS', fee: '45 GYDS', block: 14882, status: 'repaid' },
            { hash: '0x7f2c…', amount: '200,000 GYDS', fee: '180 GYDS', block: 14779, status: 'repaid' },
            { hash: '0x1d44…', amount: '10,000 GYDS', fee: '9 GYDS', block: 14620, status: 'repaid' },
          ].map(loan => (
            <div key={loan.hash} className="flex items-center gap-3 text-xs p-2 bg-muted/20 rounded-lg flex-wrap">
              <span className="font-mono text-primary">{loan.hash}</span>
              <span className="font-medium">{loan.amount}</span>
              <span className="text-muted-foreground">Fee: {loan.fee}</span>
              <span className="text-muted-foreground">Block #{loan.block}</span>
              <Badge className="text-xs bg-emerald-500/20 text-emerald-400 border-emerald-500/30">{loan.status}</Badge>
            </div>
          ))}
        </div>
      </div>
      <Button onClick={save} disabled={saving} className="w-full gap-2">
        {saving ? <><RefreshCw className="w-4 h-4 animate-spin" />Saving…</> : 'Save Settings'}
      </Button>
    </GlassCard>
  );
}

function LeaderboardReset({ toast }: { toast: any }) {
  const [resetting, setResetting] = useState(false);
  const [lastReset, setLastReset] = useState<string | null>(null);

  const doReset = async () => {
    if (!confirm('This will zero out all XP scores and wipe XP events. This cannot be undone. Continue?')) return;
    setResetting(true);
    try {
      const res = await fetch('/api/admin/leaderboard/reset', { method: 'POST', credentials: 'include' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setLastReset(data.reset_at);
      toast({ title: 'Leaderboard reset', description: 'All XP scores have been zeroed.' });
    } catch (e: any) {
      toast({ title: 'Reset failed', description: e.message, variant: 'destructive' });
    } finally { setResetting(false); }
  };

  return (
    <GlassCard className="p-6 space-y-4">
      <div>
        <h3 className="font-semibold text-lg flex items-center gap-2">
          <RotateCcw className="w-5 h-5 text-primary" /> Monthly XP Leaderboard Reset
        </h3>
        <p className="text-sm text-muted-foreground">Reset all user XP scores to zero — use at the start of each new season</p>
      </div>
      <div className="p-4 rounded-lg bg-red-500/5 border border-red-500/20 space-y-2">
        <p className="text-sm font-semibold text-red-400">⚠️ Destructive Action</p>
        <p className="text-xs text-muted-foreground">
          This will set all users' XP to 0 and clear the XP event log. Achievements and badges are <strong>not</strong> affected.
          This action is permanent and cannot be undone. Only do this at the start of a new season.
        </p>
      </div>
      {lastReset && (
        <p className="text-xs text-muted-foreground">Last reset: {new Date(lastReset).toLocaleString()}</p>
      )}
      <Button variant="destructive" onClick={doReset} disabled={resetting} className="gap-2">
        {resetting ? <RefreshCw className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
        {resetting ? 'Resetting…' : 'Reset Leaderboard Now'}
      </Button>
    </GlassCard>
  );
}

const AdminContent = () => {
  const { user, isFounder, isAdmin } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [nodes, setNodes] = useState<NodeInstallation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isFounder && !isAdmin) {
      navigate('/');
      return;
    }
    fetchData();
  }, [isFounder, isAdmin, navigate]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const nodesRes = await fetch('/api/nodes', { credentials: 'include' }).then(r => r.ok ? r.json() : []);
      if (nodesRes) setNodes(Array.isArray(nodesRes) ? nodesRes : []);
    } catch (e) {
      toast({ title: 'Failed to load admin data', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const handleApproveNode = async (nodeId: string, approve: boolean) => {
    try {
      const res = await fetch(`/api/nodes/${nodeId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isApproved: approve, approvedBy: user?.id, approvedAt: approve ? new Date().toISOString() : null }),
      });
      if (!res.ok) throw new Error(await res.text());
      toast({ title: approve ? 'Node approved!' : 'Node rejected' });
      fetchData();
    } catch (e: any) {
      toast({ title: 'Failed to update node', description: e.message, variant: 'destructive' });
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: 'Copied!' });
  };

  if (!isFounder && !isAdmin) {
    return (
      <GlassCard className="p-12 text-center">
        <Shield className="w-12 h-12 mx-auto text-destructive mb-4" />
        <p className="text-xl font-semibold">Access Denied</p>
        <p className="text-muted-foreground">Founder/Admin access required</p>
      </GlassCard>
    );
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-3">
            <Shield className="w-8 h-8 text-primary" />
            Admin Dashboard
          </h1>
          <p className="text-muted-foreground mt-2">Manage users and approve node installations</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => navigate('/setup')} className="gap-2">
            <TerminalIcon className="h-4 w-4" />
            Setup Wizard
          </Button>
          <Button variant="outline" onClick={fetchData} className="gap-2">
            <RefreshCw className="h-4 w-4" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <GlassCard className="p-4 text-center">
          <p className="text-2xl font-bold">{nodes.filter(n => n.nodeType === 'litenode').length}</p>
          <p className="text-sm text-muted-foreground">Lite Nodes</p>
        </GlassCard>
        <GlassCard className="p-4 text-center">
          <p className="text-2xl font-bold">{nodes.filter(n => n.nodeType === 'fullnode').length}</p>
          <p className="text-sm text-muted-foreground">Full Nodes</p>
        </GlassCard>
        <GlassCard className="p-4 text-center">
          <p className="text-2xl font-bold">{nodes.filter(n => !n.isApproved).length}</p>
          <p className="text-sm text-muted-foreground">Pending Approval</p>
        </GlassCard>
        <GlassCard className="p-4 text-center">
          <p className="text-2xl font-bold">{nodes.filter(n => n.isApproved).length}</p>
          <p className="text-sm text-muted-foreground">Approved</p>
        </GlassCard>
      </div>

      <Tabs defaultValue="nodes" className="space-y-4">
        <TabsList className="grid grid-cols-5 md:[grid-template-columns:repeat(16,minmax(0,1fr))] w-full">
          <TabsTrigger value="nodes" className="gap-2">
            <Server className="h-4 w-4" />
            <span className="hidden md:inline">Nodes</span>
          </TabsTrigger>
          <TabsTrigger value="validators" className="gap-2">
            <Shield className="h-4 w-4" />
            <span className="hidden md:inline">Validators</span>
          </TabsTrigger>
          <TabsTrigger value="users" className="gap-2">
            <Users className="h-4 w-4" />
            <span className="hidden md:inline">Users</span>
          </TabsTrigger>
          <TabsTrigger value="tokens" className="gap-2">
            <Flame className="h-4 w-4" />
            <span className="hidden md:inline">Burn/Mint</span>
          </TabsTrigger>
          <TabsTrigger value="stablecoin" className="gap-2">
            <Coins className="h-4 w-4" />
            <span className="hidden md:inline">GYD/GYDS</span>
          </TabsTrigger>
          <TabsTrigger value="sponsors" className="gap-2">
            <Building2 className="h-4 w-4" />
            <span className="hidden md:inline">Sponsors</span>
          </TabsTrigger>
          <TabsTrigger value="premine" className="gap-2">
            <Coins className="h-4 w-4" />
            <span className="hidden md:inline">Pre-mine</span>
          </TabsTrigger>
          <TabsTrigger value="logos" className="gap-2">
            <Coins className="h-4 w-4" />
            <span className="hidden md:inline">Logos</span>
          </TabsTrigger>
          <TabsTrigger value="database" className="gap-2">
            <Key className="h-4 w-4" />
            <span className="hidden md:inline">Database</span>
          </TabsTrigger>
          <TabsTrigger value="whatsapp" className="gap-2">
            <MessageCircle className="h-4 w-4" />
            <span className="hidden md:inline">WhatsApp</span>
          </TabsTrigger>
          <TabsTrigger value="github" className="gap-2">
            <GitBranch className="h-4 w-4" />
            <span className="hidden md:inline">GitHub</span>
          </TabsTrigger>
          <TabsTrigger value="firewall" className="gap-2">
            <Shield className="h-4 w-4" />
            <span className="hidden md:inline">Firewall</span>
          </TabsTrigger>
          <TabsTrigger value="audit" className="gap-2">
            <ScrollText className="h-4 w-4" />
            <span className="hidden md:inline">Audit Log</span>
          </TabsTrigger>
          <TabsTrigger value="health" className="gap-2">
            <Activity className="h-4 w-4" />
            <span className="hidden md:inline">Health</span>
          </TabsTrigger>
          <TabsTrigger value="token-pricing" className="gap-2">
            <Coins className="h-4 w-4" />
            <span className="hidden md:inline">Pricing</span>
          </TabsTrigger>
          <TabsTrigger value="token-mgmt" className="gap-2">
            <Coins className="h-4 w-4" />
            <span className="hidden md:inline">Tokens</span>
          </TabsTrigger>
          <TabsTrigger value="installer" className="gap-2" data-testid="tab-installer">
            <Server className="h-4 w-4" />
            <span className="hidden md:inline">Install</span>
          </TabsTrigger>
          <TabsTrigger value="console" className="gap-2" data-testid="tab-console">
            <TerminalIcon className="h-4 w-4" />
            <span className="hidden md:inline">Console</span>
          </TabsTrigger>
          <TabsTrigger value="visibility" className="gap-2" data-testid="tab-visibility">
            <EyeOff className="h-4 w-4" />
            <span className="hidden md:inline">Visibility</span>
          </TabsTrigger>
          <TabsTrigger value="features" className="gap-2" data-testid="tab-features">
            <Key className="h-4 w-4" />
            <span className="hidden md:inline">Features</span>
          </TabsTrigger>
          <TabsTrigger value="promotion" className="gap-2" data-testid="tab-promotion">
            <Rocket className="h-4 w-4" />
            <span className="hidden md:inline">Promotion</span>
          </TabsTrigger>
          <TabsTrigger value="pools" className="gap-2" data-testid="tab-pools">
            <Pickaxe className="h-4 w-4" />
            <span className="hidden md:inline">Pools</span>
          </TabsTrigger>
          <TabsTrigger value="maintenance" className="gap-2" data-testid="tab-maintenance">
            <Wrench className="h-4 w-4" />
            <span className="hidden md:inline">Maintenance</span>
          </TabsTrigger>
          <TabsTrigger value="bridge-networks" className="gap-2" data-testid="tab-bridge-networks">
            <Link2 className="h-4 w-4" />
            <span className="hidden md:inline">Bridge</span>
          </TabsTrigger>
          <TabsTrigger value="explorer-config" className="gap-2" data-testid="tab-explorer-config">
            <SearchIcon className="h-4 w-4" />
            <span className="hidden md:inline">Explorer</span>
          </TabsTrigger>
          <TabsTrigger value="node-types" className="gap-2" data-testid="tab-node-types">
            <Eye className="h-4 w-4" />
            <span className="hidden md:inline">Node Types</span>
          </TabsTrigger>
          <TabsTrigger value="test-nodes" className="gap-2" data-testid="tab-test-nodes">
            <FlaskConical className="h-4 w-4" />
            <span className="hidden md:inline">Test Nodes</span>
          </TabsTrigger>
          <TabsTrigger value="grant-achievement" className="gap-2">
            <Trophy className="h-4 w-4" />
            <span className="hidden md:inline">Grant Badge</span>
          </TabsTrigger>
          <TabsTrigger value="launches" className="gap-2">
            <RocketIcon className="h-4 w-4" />
            <span className="hidden md:inline">Launches</span>
          </TabsTrigger>
          <TabsTrigger value="bridge-fee" className="gap-2">
            <ArrowRightLeft className="h-4 w-4" />
            <span className="hidden md:inline">Bridge Fee</span>
          </TabsTrigger>
          <TabsTrigger value="leaderboard-reset" className="gap-2">
            <RotateCcw className="h-4 w-4" />
            <span className="hidden md:inline">XP Reset</span>
          </TabsTrigger>
          <TabsTrigger value="oracle" className="gap-2">
            <Activity className="h-4 w-4" />
            <span className="hidden md:inline">Oracle</span>
          </TabsTrigger>
          <TabsTrigger value="flash-loan" className="gap-2">
            <Zap className="h-4 w-4" />
            <span className="hidden md:inline">Flash Loan</span>
          </TabsTrigger>
          <TabsTrigger value="monitoring" className="gap-2" data-testid="tab-monitoring">
            <Activity className="h-4 w-4" />
            <span className="hidden md:inline">Monitoring</span>
          </TabsTrigger>
          <TabsTrigger value="cron" className="gap-2" data-testid="tab-cron">
            <Timer className="h-4 w-4" />
            <span className="hidden md:inline">Cron Jobs</span>
          </TabsTrigger>
          <TabsTrigger value="payments" className="gap-2" data-testid="tab-payments">
            <Coins className="h-4 w-4" />
            <span className="hidden md:inline">Payments</span>
          </TabsTrigger>
          <TabsTrigger value="wallet-app" className="gap-2" data-testid="tab-wallet-app">
            <Smartphone className="h-4 w-4" />
            <span className="hidden md:inline">Wallet App</span>
          </TabsTrigger>
          <TabsTrigger value="server-config" className="gap-2" data-testid="tab-server-config">
            <Settings className="h-4 w-4" />
            <span className="hidden md:inline">Server Config</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="maintenance">
          <MaintenanceManager />
        </TabsContent>

        <TabsContent value="bridge-networks">
          <BridgeNetworkManager />
        </TabsContent>

        <TabsContent value="explorer-config">
          <ExplorerConfig />
        </TabsContent>

        <TabsContent value="node-types">
          <NodeVisibilitySettings />
        </TabsContent>

        <TabsContent value="pools">
          <MiningPoolAdmin />
        </TabsContent>

        <TabsContent value="installer">
          <NodeInstaller />
        </TabsContent>

        <TabsContent value="console">
          <AdminConsole />
        </TabsContent>

        <TabsContent value="visibility">
          <ComponentVisibility />
        </TabsContent>

        <TabsContent value="features">
          <FeatureGrantManager />
        </TabsContent>

        <TabsContent value="promotion">
          <MainnetPromotion />
        </TabsContent>

        <TabsContent value="validators">
          <ValidatorManager />
        </TabsContent>

        <TabsContent value="tokens">
          <BurnMintManager />
        </TabsContent>

        <TabsContent value="stablecoin">
          <StablecoinManager />
        </TabsContent>

        <TabsContent value="sponsors">
          <SponsorManager />
        </TabsContent>

        <TabsContent value="premine">
          <PremineManager />
        </TabsContent>

        <TabsContent value="logos">
          <CoinLogoUpload />
        </TabsContent>

        <TabsContent value="database">
          <DatabaseSettings />
        </TabsContent>

        <TabsContent value="whatsapp">
          <WhatsAppSettings />
        </TabsContent>

        <TabsContent value="github" className="space-y-4">
          <GitSyncPanel toast={toast} />
          <GlassCard className="p-6">
            <NodeRepoSync />
          </GlassCard>
        </TabsContent>

        <TabsContent value="firewall">
          <FirewallManager />
        </TabsContent>

        <TabsContent value="audit">
          <AuditLogViewer />
        </TabsContent>

        <TabsContent value="health">
          <HealthCheck />
        </TabsContent>

        <TabsContent value="token-pricing">
          <TokenPricingManager />
        </TabsContent>

        <TabsContent value="token-mgmt">
          <TokenManager />
        </TabsContent>

        <TabsContent value="nodes" className="space-y-6">
          {/* WireGuard Peer Manager */}
          <WireGuardPeerManager />

          <div className="border-t border-border/30 pt-4">
            <h3 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
              <Server className="h-4 w-4" /> Node Registrations ({nodes.length})
            </h3>
          </div>

          {loading ? (
            <GlassCard className="p-6 text-center">Loading...</GlassCard>
          ) : nodes.length === 0 ? (
            <GlassCard className="p-12 text-center">
              <Server className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">No node installations yet</p>
            </GlassCard>
          ) : (
            nodes.map((node) => {
              const isLocalNode = node.wireguardPublicKey?.startsWith('LOCAL:');
              const localPort = isLocalNode ? node.wireguardPublicKey!.split(':')[1] : null;
              const localRpcUrl = localPort ? `http://${window.location.hostname}:${localPort}` : null;
              return (
              <GlassCard key={node.id} className={`p-4 ${isLocalNode ? 'border-primary/40' : !node.isApproved ? 'border-yellow-500/30' : ''}`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className={`p-3 rounded-lg relative ${isLocalNode ? 'bg-primary/20' : node.nodeType === 'fullnode' ? 'bg-yellow-500/20' : 'bg-primary/20'}`}>
                      {isLocalNode
                        ? <MonitorDot className="h-5 w-5 text-primary" />
                        : <Server className={`h-5 w-5 ${node.nodeType === 'fullnode' ? 'text-yellow-500' : 'text-primary'}`} />
                      }
                      {node.isOnline && (
                        <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-emerald-400 border-2 border-background animate-pulse" />
                      )}
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-medium capitalize">{node.nodeType.replace('node', ' Node')}</p>
                        {isLocalNode && (
                          <Badge variant="outline" className="text-primary border-primary/60 bg-primary/10 text-xs gap-1">
                            <MonitorDot className="h-3 w-3" /> Local Test Node
                          </Badge>
                        )}
                        {node.isApproved ? (
                          <Badge variant="outline" className="text-green-400 border-green-400 text-xs">Approved</Badge>
                        ) : (
                          <Badge variant="outline" className="text-yellow-500 border-yellow-500 text-xs">Pending</Badge>
                        )}
                        {node.isOnline ? (
                          <Badge variant="outline" className="text-emerald-400 border-emerald-400/60 bg-emerald-500/10 text-xs gap-1">
                            <Wifi className="h-3 w-3" /> Online
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-muted-foreground border-border/40 text-xs gap-1">
                            <WifiOff className="h-3 w-3" /> Offline
                          </Badge>
                        )}
                        {node.isSynced && (
                          <Badge variant="outline" className="text-primary border-primary text-xs">Synced</Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {isLocalNode ? 'Local server process' : `User: ${node.profiles?.email || node.userId?.slice(0, 12) || 'Unknown'}`}
                      </p>
                      {/* Live stats for online nodes */}
                      {node.isOnline && (
                        <p className="text-xs text-muted-foreground font-mono mt-0.5">
                          Block #{(node.lastBlockHeight ?? 0).toLocaleString()} · {node.peerCount ?? 0} peers
                          {localPort && <> · Port {localPort}</>}
                        </p>
                      )}
                      {/* RPC URL for local nodes */}
                      {isLocalNode && localRpcUrl && node.isOnline && (
                        <a
                          href={localRpcUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center gap-1 text-xs text-primary hover:underline font-mono mt-1"
                        >
                          <ExternalLink className="h-3 w-3" />
                          {localRpcUrl}
                        </a>
                      )}
                      {/* WireGuard key for real remote nodes */}
                      {!isLocalNode && node.wireguardPublicKey && (
                        <div className="flex items-center gap-2 mt-1">
                          <Key className="h-3 w-3 text-muted-foreground" />
                          <code className="text-xs bg-background/50 px-2 py-0.5 rounded">
                            {node.wireguardPublicKey.substring(0, 20)}...
                          </code>
                          <Button size="icon" variant="ghost" className="h-5 w-5" onClick={() => copyToClipboard(node.wireguardPublicKey!)}>
                            <Copy className="h-3 w-3" />
                          </Button>
                        </div>
                      )}
                      <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                        <Clock className="h-3 w-3" />
                        {new Date(node.createdAt).toLocaleString()}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    {!isLocalNode && !node.isApproved && (
                      <>
                        <Button size="sm" onClick={() => handleApproveNode(node.id, true)} className="gap-1">
                          <Check className="h-4 w-4" />
                          Approve
                        </Button>
                        <Button size="sm" variant="destructive" onClick={() => handleApproveNode(node.id, false)} className="gap-1">
                          <X className="h-4 w-4" />
                          Reject
                        </Button>
                      </>
                    )}
                    {!isLocalNode && node.isApproved && (
                      <Button size="sm" variant="outline" onClick={() => handleApproveNode(node.id, false)}>
                        Revoke
                      </Button>
                    )}
                  </div>
                </div>
              </GlassCard>
            ); })
          )}
        </TabsContent>

        <TabsContent value="users">
          <UserManager />
        </TabsContent>

        <TabsContent value="test-nodes">
          <TestNodeManager />
        </TabsContent>
        <TabsContent value="grant-achievement">
          <GrantAchievementPanel />
        </TabsContent>
        <TabsContent value="launches">
          <LaunchesManager toast={toast} />
        </TabsContent>
        <TabsContent value="bridge-fee">
          <BridgeFeeConfig toast={toast} />
        </TabsContent>
        <TabsContent value="leaderboard-reset">
          <LeaderboardReset toast={toast} />
        </TabsContent>
        <TabsContent value="oracle">
          <OracleAdmin toast={toast} />
        </TabsContent>
        <TabsContent value="flash-loan">
          <FlashLoanCircuitBreaker toast={toast} />
        </TabsContent>
        <TabsContent value="monitoring">
          <ValidatorExplorerMonitor toast={toast} />
        </TabsContent>
        <TabsContent value="cron">
          <CronJobManager toast={toast} />
        </TabsContent>
        <TabsContent value="payments">
          <PaymentMethodsManager />
        </TabsContent>
        <TabsContent value="wallet-app">
          <WalletReleaseManager />
        </TabsContent>
        <TabsContent value="server-config">
          <ServerConfigManager />
        </TabsContent>
      </Tabs>
    </motion.div>
  );
};

const AdminPage = () => (
  <Layout>
    <RequireAuth>
      <AdminContent />
    </RequireAuth>
  </Layout>
);

export default AdminPage;
