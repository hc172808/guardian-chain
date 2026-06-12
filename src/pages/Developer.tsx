import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Layout } from '@/components/layout/Layout';
import { GlassCard } from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import {
  Code2, Key, Plus, Copy, Trash2, Activity,
  BookOpen, Zap, Shield, Globe, ChevronRight, RefreshCw, Eye, EyeOff,
  Webhook, ToggleLeft, ToggleRight, ExternalLink
} from 'lucide-react';

interface ApiKey {
  id: string;
  name: string;
  key_prefix: string;
  scopes: string[];
  request_count: number;
  request_limit: number;
  last_used_at: string | null;
  created_at: string;
  fullKey?: string;
}

const ENDPOINTS = [
  { method: 'GET',  path: '/v1/network/stats',            desc: 'Chain stats: TPS, validators, block height' },
  { method: 'GET',  path: '/v1/tokens',                   desc: 'List all deployed tokens' },
  { method: 'GET',  path: '/v1/blocks/:height',           desc: 'Get block by height' },
  { method: 'GET',  path: '/v1/address/:address/balance', desc: 'Get wallet balance' },
  { method: 'POST', path: '/v1/transactions/submit',      desc: 'Submit a signed transaction' },
  { method: 'GET',  path: '/v1/validators',               desc: 'List all validators with stats' },
  { method: 'GET',  path: '/v1/pools',                    desc: 'List liquidity pools' },
  { method: 'GET',  path: '/v1/tx/:hash',                 desc: 'Get transaction by hash' },
  { method: 'GET',  path: '/v1/oracle/prices',            desc: 'Current oracle price feeds' },
  { method: 'POST', path: '/v1/webhooks/register',        desc: 'Register a webhook endpoint' },
];

const SCOPES = ['read:chain', 'read:wallet', 'write:tx', 'read:oracle', 'webhooks'];

const fmtDate = (d: string) => new Date(d).toLocaleDateString();
const fmtRelative = (d: string) => {
  const diff = Date.now() - new Date(d).getTime();
  if (diff < 60000) return 'just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return fmtDate(d);
};

const DeveloperPage = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [keysLoading, setKeysLoading] = useState(true);
  const [newName, setNewName] = useState('');
  const [selectedScopes, setSelectedScopes] = useState<string[]>(['read:chain']);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [tryEndpoint, setTryEndpoint] = useState(ENDPOINTS[0]);
  const [tryResult, setTryResult] = useState('');
  const [revealedKeys, setRevealedKeys] = useState<Record<string, boolean>>({});
  const [newKeyFull, setNewKeyFull] = useState<string | null>(null);
  const [usageStats, setUsageStats] = useState<any[]>([]);
  const [usageLoading, setUsageLoading] = useState(false);
  const [webhooks, setWebhooks] = useState<any[]>([]);
  const [webhooksLoading, setWebhooksLoading] = useState(false);
  const [newWebhookUrl, setNewWebhookUrl] = useState('');
  const [newWebhookEvents, setNewWebhookEvents] = useState<string[]>(['tx.confirmed', 'block.new']);
  const [addingWebhook, setAddingWebhook] = useState(false);
  const [newWebhookSecret, setNewWebhookSecret] = useState<string | null>(null);
  const [webhookDeliveries, setWebhookDeliveries] = useState<Record<string, any[]>>({});
  const [loadingDeliveries, setLoadingDeliveries] = useState<string | null>(null);
  const [expandedDeliveries, setExpandedDeliveries] = useState<string | null>(null);

  const fetchKeys = useCallback(async () => {
    if (!user) { setKeysLoading(false); return; }
    setKeysLoading(true);
    try {
      const res = await fetch('/api/developer/keys', { credentials: 'include' });
      if (res.ok) setKeys(await res.json());
    } finally { setKeysLoading(false); }
  }, [user]);

  const fetchWebhooks = useCallback(async () => {
    if (!user) return;
    setWebhooksLoading(true);
    try {
      const res = await fetch('/api/webhooks', { credentials: 'include' });
      if (res.ok) setWebhooks(await res.json());
    } finally { setWebhooksLoading(false); }
  }, [user]);

  const createWebhook = async () => {
    if (!newWebhookUrl.trim()) return;
    setAddingWebhook(true);
    try {
      const res = await fetch('/api/webhooks', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: newWebhookUrl.trim(), events: newWebhookEvents }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setNewWebhookSecret(data.full_secret);
      setWebhooks(prev => [...prev, data]);
      setNewWebhookUrl('');
      toast({ title: '🔗 Webhook created', description: 'Copy the signing secret — shown once!' });
    } catch (e: any) {
      toast({ title: 'Failed', description: e.message, variant: 'destructive' });
    } finally { setAddingWebhook(false); }
  };

  const deleteWebhook = async (id: string) => {
    await fetch(`/api/webhooks/${id}`, { method: 'DELETE', credentials: 'include' });
    setWebhooks(prev => prev.filter(w => w.id !== id));
    toast({ title: 'Webhook deleted' });
  };

  const toggleWebhook = async (id: string, active: boolean) => {
    await fetch(`/api/webhooks/${id}`, {
      method: 'PATCH', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active }),
    });
    setWebhooks(prev => prev.map(w => w.id === id ? { ...w, active } : w));
  };

  const viewDeliveries = async (webhookId: string) => {
    if (expandedDeliveries === webhookId) { setExpandedDeliveries(null); return; }
    setExpandedDeliveries(webhookId);
    if (webhookDeliveries[webhookId]) return;
    setLoadingDeliveries(webhookId);
    try {
      const res = await fetch(`/api/webhooks/${webhookId}/deliveries`, { credentials: 'include' });
      if (res.ok) { const data = await res.json(); setWebhookDeliveries(prev => ({ ...prev, [webhookId]: data })); }
    } finally { setLoadingDeliveries(null); }
  };

  const fetchUsage = useCallback(async () => {
    if (!user) return;
    setUsageLoading(true);
    try {
      const res = await fetch('/api/developer/usage', { credentials: 'include' });
      if (res.ok) setUsageStats(await res.json());
    } finally { setUsageLoading(false); }
  }, [user]);

  useEffect(() => { fetchKeys(); }, [fetchKeys]);
  useEffect(() => { fetchWebhooks(); }, [fetchWebhooks]);
  useEffect(() => { fetchUsage(); }, [fetchUsage]);

  const createKey = async () => {
    if (!user) { toast({ title: 'Sign in first', variant: 'destructive' }); return; }
    if (!newName.trim()) { toast({ title: 'Name required', variant: 'destructive' }); return; }
    setSaving(true);
    try {
      const res = await fetch('/api/developer/keys', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim(), scopes: selectedScopes }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed');
      setNewKeyFull(data.fullKey);
      setKeys(prev => [...prev, data]);
      setNewName('');
      setCreating(false);
      toast({ title: '🔑 API key created', description: 'Copy your full key now — it will not be shown again!' });
    } catch (e: any) {
      toast({ title: 'Failed to create key', description: e.message, variant: 'destructive' });
    } finally { setSaving(false); }
  };

  const revokeKey = async (id: string) => {
    try {
      await fetch(`/api/developer/keys/${id}`, { method: 'DELETE', credentials: 'include' });
      setKeys(prev => prev.filter(k => k.id !== id));
      toast({ title: 'API key revoked' });
    } catch {
      toast({ title: 'Error', variant: 'destructive' });
    }
  };

  const copyKey = (val: string) => {
    navigator.clipboard.writeText(val);
    toast({ title: 'Copied to clipboard' });
  };

  const tryApi = async () => {
    setTryResult('Loading…');
    await new Promise(r => setTimeout(r, 600));
    const mock: Record<string, any> = {
      '/v1/network/stats': { tps: 1250, validators: 87, block_height: 1_234_567, chain_id: 13370 },
      '/v1/tokens': [{ symbol: 'GYDS', supply: 20_000_000 }, { symbol: 'GYD', supply: 5_000_000 }],
      '/v1/oracle/prices': { GYDS: 0.0000001, GYD: 1.0, BTC: 65000 },
    };
    const result = mock[tryEndpoint.path] ?? { status: 'ok', message: 'Endpoint available on mainnet' };
    setTryResult(JSON.stringify(result, null, 2));
  };

  return (
    <Layout>
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Code2 className="w-6 h-6 text-primary" /> Developer Portal
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            API keys, documentation, and interactive playground for GYDSchain
          </p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: 'API Keys', value: keys.length, icon: Key },
            { label: 'Total Requests', value: keys.reduce((a, k) => a + k.request_count, 0).toLocaleString(), icon: Activity },
            { label: 'Endpoints', value: ENDPOINTS.length, icon: Globe },
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

        {/* New key reveal banner */}
        {newKeyFull && (
          <GlassCard className="p-4 border-amber-500/40 bg-amber-500/5">
            <p className="text-sm font-semibold text-amber-400 mb-2">⚠️ Copy your API key now — it will not be shown again!</p>
            <div className="flex items-center gap-2 bg-muted/30 rounded-lg p-2">
              <code className="text-xs font-mono flex-1 break-all text-primary">{newKeyFull}</code>
              <button onClick={() => copyKey(newKeyFull)} className="text-muted-foreground hover:text-primary p-1 transition-colors shrink-0">
                <Copy className="w-4 h-4" />
              </button>
            </div>
            <button onClick={() => setNewKeyFull(null)} className="mt-2 text-xs text-muted-foreground hover:text-foreground">
              I've copied it, dismiss
            </button>
          </GlassCard>
        )}

        <Tabs defaultValue="keys">
          <TabsList className="flex-wrap h-auto gap-1">
            <TabsTrigger value="keys">API Keys</TabsTrigger>
            <TabsTrigger value="usage">Usage</TabsTrigger>
            <TabsTrigger value="webhooks">Webhooks</TabsTrigger>
            <TabsTrigger value="docs">Endpoints</TabsTrigger>
            <TabsTrigger value="playground">Playground</TabsTrigger>
            <TabsTrigger value="sdks">SDKs</TabsTrigger>
          </TabsList>

          {/* Usage Dashboard */}
          <TabsContent value="usage" className="mt-4 space-y-4">
            {!user ? (
              <GlassCard className="p-8 text-center text-muted-foreground">
                <Activity className="w-10 h-10 mx-auto mb-2 opacity-30" />
                <p>Sign in to view usage statistics.</p>
              </GlassCard>
            ) : usageLoading ? (
              <div className="flex items-center gap-2 text-muted-foreground py-8 justify-center">
                <RefreshCw className="w-5 h-5 animate-spin" /> Loading usage data…
              </div>
            ) : usageStats.length === 0 ? (
              <GlassCard className="p-8 text-center text-muted-foreground">
                <Activity className="w-10 h-10 mx-auto mb-2 opacity-30" />
                <p>No API keys yet. Create a key to see usage stats.</p>
              </GlassCard>
            ) : (
              <div className="space-y-4">
                {usageStats.map((stat: any) => (
                  <GlassCard key={stat.id} className="p-5 space-y-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold">{stat.name}</p>
                        <p className="text-xs text-muted-foreground font-mono">{stat.key_prefix}…</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-bold">{Number(stat.request_count).toLocaleString()} / {Number(stat.request_limit).toLocaleString()}</p>
                        <p className="text-xs text-muted-foreground">requests today</p>
                      </div>
                    </div>

                    {/* Usage bar */}
                    <div>
                      <div className="flex justify-between text-xs text-muted-foreground mb-1">
                        <span>Rate limit usage</span>
                        <span className={stat.usage_pct > 80 ? 'text-red-400' : stat.usage_pct > 50 ? 'text-amber-400' : 'text-emerald-400'}>
                          {stat.usage_pct}%
                        </span>
                      </div>
                      <div className="w-full bg-muted/30 rounded-full h-2">
                        <div
                          className={`h-2 rounded-full transition-all ${stat.usage_pct > 80 ? 'bg-red-500' : stat.usage_pct > 50 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                          style={{ width: `${Math.min(100, stat.usage_pct)}%` }}
                        />
                      </div>
                    </div>

                    {/* Daily usage chart (last 7 days) */}
                    {stat.daily_usage?.length > 0 && (
                      <div>
                        <p className="text-xs text-muted-foreground mb-2">Last 7 days</p>
                        <div className="flex items-end gap-1 h-12">
                          {stat.daily_usage.map((d: any, i: number) => {
                            const max = Math.max(...stat.daily_usage.map((x: any) => Number(x.count)));
                            const pct = max > 0 ? (Number(d.count) / max) * 100 : 0;
                            return (
                              <div key={i} className="flex-1 flex flex-col items-center gap-1" title={`${new Date(d.day).toLocaleDateString()}: ${d.count} requests`}>
                                <div className="w-full bg-primary/20 rounded-sm relative" style={{ height: '40px' }}>
                                  <div className="absolute bottom-0 w-full bg-primary rounded-sm" style={{ height: `${pct}%` }} />
                                </div>
                                <p className="text-xs text-muted-foreground">{new Date(d.day).getDate()}</p>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Top endpoints */}
                    {stat.top_endpoints?.length > 0 && (
                      <div>
                        <p className="text-xs text-muted-foreground mb-2">Top Endpoints (30 days)</p>
                        <div className="space-y-1.5">
                          {stat.top_endpoints.map((ep: any, i: number) => {
                            const max = Math.max(...stat.top_endpoints.map((x: any) => Number(x.count)));
                            const pct = max > 0 ? (Number(ep.count) / max) * 100 : 0;
                            return (
                              <div key={i} className="flex items-center gap-2 text-xs">
                                <code className="text-primary flex-1 truncate">{ep.endpoint}</code>
                                <div className="w-20 bg-muted/30 rounded h-1.5">
                                  <div className="h-1.5 bg-primary/60 rounded" style={{ width: `${pct}%` }} />
                                </div>
                                <span className="text-muted-foreground w-8 text-right">{ep.count}</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {stat.last_used_at && (
                      <p className="text-xs text-muted-foreground">Last used: {fmtRelative(stat.last_used_at)}</p>
                    )}
                  </GlassCard>
                ))}
                <div className="flex justify-end">
                  <Button variant="outline" size="sm" onClick={fetchUsage} disabled={usageLoading}>
                    <RefreshCw className={`w-4 h-4 mr-2 ${usageLoading ? 'animate-spin' : ''}`} /> Refresh
                  </Button>
                </div>
              </div>
            )}
          </TabsContent>

          {/* API Keys */}
          <TabsContent value="keys" className="mt-4 space-y-4">
            {!user && (
              <GlassCard className="p-6 text-center text-muted-foreground">
                <Key className="w-10 h-10 mx-auto mb-2 opacity-30" />
                <p>Sign in to manage your API keys.</p>
              </GlassCard>
            )}
            {user && (
              <>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" size="sm" onClick={fetchKeys} disabled={keysLoading}>
                    <RefreshCw className={`w-4 h-4 ${keysLoading ? 'animate-spin' : ''}`} />
                  </Button>
                  <Button onClick={() => setCreating(true)} className="gap-2" disabled={keys.length >= 10}>
                    <Plus className="w-4 h-4" /> New API Key
                  </Button>
                </div>

                {creating && (
                  <GlassCard className="p-5 space-y-4 border-primary/30">
                    <h3 className="font-semibold">Create API Key</h3>
                    <div>
                      <Label className="text-xs text-muted-foreground">Key Name</Label>
                      <Input value={newName} onChange={e => setNewName(e.target.value)}
                        placeholder="My Application" onKeyDown={e => e.key === 'Enter' && createKey()} />
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground mb-2 block">Scopes</Label>
                      <div className="flex flex-wrap gap-2">
                        {SCOPES.map(s => (
                          <button key={s} onClick={() => setSelectedScopes(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s])}
                            className={`px-2.5 py-1 rounded-lg text-xs border transition-all ${selectedScopes.includes(s) ? 'border-primary bg-primary/10 text-primary' : 'border-border/40 text-muted-foreground'}`}>
                            {s}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button onClick={createKey} disabled={saving}>
                        {saving ? <><RefreshCw className="w-4 h-4 animate-spin mr-2" />Creating…</> : 'Create'}
                      </Button>
                      <Button variant="outline" onClick={() => setCreating(false)}>Cancel</Button>
                    </div>
                  </GlassCard>
                )}

                {keysLoading ? (
                  <div className="flex items-center gap-2 text-muted-foreground py-6">
                    <RefreshCw className="w-4 h-4 animate-spin" /> Loading keys…
                  </div>
                ) : keys.length === 0 ? (
                  <GlassCard className="p-8 text-center text-muted-foreground">
                    <Key className="w-10 h-10 mx-auto mb-2 opacity-30" />
                    <p>No API keys yet. Create one to get started.</p>
                  </GlassCard>
                ) : (
                  <div className="space-y-3">
                    {keys.map(k => (
                      <GlassCard key={k.id} className="p-5 space-y-3">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-semibold">{k.name}</p>
                            <p className="text-xs text-muted-foreground">
                              Created {fmtRelative(k.created_at)}
                              {k.last_used_at && ` · Last used ${fmtRelative(k.last_used_at)}`}
                            </p>
                          </div>
                          <button onClick={() => revokeKey(k.id)} className="text-muted-foreground hover:text-red-400 transition-colors p-1" title="Revoke key">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                        <div className="flex items-center gap-2 bg-muted/20 rounded-lg p-2">
                          <code className="text-xs font-mono flex-1 truncate text-muted-foreground">
                            {revealedKeys[k.id] ? `${k.key_prefix}…` : `${k.key_prefix.slice(0, 14)}${'•'.repeat(20)}`}
                          </code>
                          <button onClick={() => setRevealedKeys(v => ({ ...v, [k.id]: !v[k.id] }))}
                            className="text-muted-foreground hover:text-primary p-1 transition-colors">
                            {revealedKeys[k.id] ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                          </button>
                          <button onClick={() => copyKey(k.key_prefix + '…')} className="text-muted-foreground hover:text-primary p-1 transition-colors">
                            <Copy className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        <div className="flex items-center gap-3 text-xs">
                          <div className="flex-1">
                            <div className="flex justify-between text-muted-foreground mb-1">
                              <span>Requests</span>
                              <span>{k.request_count.toLocaleString()} / {k.request_limit.toLocaleString()}</span>
                            </div>
                            <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                              <div className="h-full bg-primary rounded-full" style={{ width: `${Math.min(100, (k.request_count / k.request_limit) * 100)}%` }} />
                            </div>
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {k.scopes.map(s => <Badge key={s} variant="secondary" className="text-xs">{s}</Badge>)}
                        </div>
                      </GlassCard>
                    ))}
                  </div>
                )}

                {keys.length >= 10 && (
                  <p className="text-xs text-muted-foreground text-center">Maximum 10 API keys per account.</p>
                )}
              </>
            )}
          </TabsContent>

          {/* Webhooks */}
          <TabsContent value="webhooks" className="mt-4 space-y-4">
            {!user ? (
              <GlassCard className="p-6 text-center text-muted-foreground">
                <Webhook className="w-10 h-10 mx-auto mb-2 opacity-30" />
                <p>Sign in to manage your webhooks.</p>
              </GlassCard>
            ) : (
              <>
                {newWebhookSecret && (
                  <GlassCard className="p-4 border-amber-500/40 bg-amber-500/5">
                    <p className="text-sm font-semibold text-amber-400 mb-2">⚠️ Copy your signing secret — shown only once!</p>
                    <div className="flex items-center gap-2 bg-muted/30 rounded-lg p-2">
                      <code className="text-xs font-mono flex-1 break-all text-primary">{newWebhookSecret}</code>
                      <button onClick={() => { copyKey(newWebhookSecret); }} className="text-muted-foreground hover:text-primary p-1">
                        <Copy className="w-4 h-4" />
                      </button>
                    </div>
                    <button onClick={() => setNewWebhookSecret(null)} className="mt-2 text-xs text-muted-foreground hover:text-foreground">
                      I've copied it, dismiss
                    </button>
                  </GlassCard>
                )}

                {/* Add webhook form */}
                <GlassCard className="p-5 space-y-4 border-primary/20">
                  <h3 className="font-semibold text-sm">Register Endpoint</h3>
                  <div>
                    <Label className="text-xs text-muted-foreground">Endpoint URL (HTTPS)</Label>
                    <Input value={newWebhookUrl} onChange={e => setNewWebhookUrl(e.target.value)}
                      placeholder="https://your-app.com/webhook" className="mt-1 font-mono text-sm"
                      onKeyDown={e => e.key === 'Enter' && createWebhook()} />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground mb-2 block">Events</Label>
                    <div className="flex flex-wrap gap-2">
                      {['tx.confirmed', 'tx.failed', 'block.new', 'validator.slashed', 'token.launched', 'proposal.created', 'proposal.passed'].map(ev => (
                        <button key={ev} onClick={() => setNewWebhookEvents(prev => prev.includes(ev) ? prev.filter(x => x !== ev) : [...prev, ev])}
                          className={`px-2.5 py-1 rounded-lg text-xs border transition-all ${newWebhookEvents.includes(ev) ? 'border-primary bg-primary/10 text-primary' : 'border-border/40 text-muted-foreground'}`}>
                          {ev}
                        </button>
                      ))}
                    </div>
                  </div>
                  <Button onClick={createWebhook} disabled={addingWebhook || !newWebhookUrl.trim()} className="gap-2">
                    {addingWebhook ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                    Register Webhook
                  </Button>
                </GlassCard>

                {/* Webhook list */}
                {webhooksLoading ? (
                  <div className="flex items-center gap-2 text-muted-foreground py-4">
                    <RefreshCw className="w-4 h-4 animate-spin" /> Loading webhooks…
                  </div>
                ) : webhooks.length === 0 ? (
                  <GlassCard className="p-8 text-center text-muted-foreground">
                    <Webhook className="w-10 h-10 mx-auto mb-2 opacity-30" />
                    <p>No webhooks registered. Add one above to receive real-time events.</p>
                  </GlassCard>
                ) : (
                  <div className="space-y-3">
                    {webhooks.map(wh => (
                      <GlassCard key={wh.id} className={`p-4 space-y-3 ${wh.active ? '' : 'opacity-60'}`}>
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <a href={wh.url} target="_blank" rel="noopener noreferrer"
                                className="font-mono text-sm text-primary hover:underline flex items-center gap-1 truncate">
                                {wh.url.length > 50 ? wh.url.slice(0, 50) + '…' : wh.url}
                                <ExternalLink className="w-3 h-3 shrink-0" />
                              </a>
                              <Badge variant={wh.active ? 'default' : 'secondary'} className="text-xs">
                                {wh.active ? 'Active' : 'Paused'}
                              </Badge>
                            </div>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              Secret: <code className="font-mono">{wh.secret_preview}</code>
                              {wh.delivery_count > 0 && ` · ${wh.delivery_count} deliveries`}
                              {wh.last_delivered_at && ` · last ${fmtRelative(wh.last_delivered_at)}`}
                            </p>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <button onClick={() => toggleWebhook(wh.id, !wh.active)}
                              className="text-muted-foreground hover:text-primary p-1 transition-colors" title={wh.active ? 'Pause' : 'Resume'}>
                              {wh.active ? <ToggleRight className="w-5 h-5 text-emerald-400" /> : <ToggleLeft className="w-5 h-5" />}
                            </button>
                            <button onClick={() => deleteWebhook(wh.id)}
                              className="text-muted-foreground hover:text-red-400 p-1 transition-colors">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <div className="flex flex-wrap gap-1">
                            {wh.events.map((ev: string) => <Badge key={ev} variant="secondary" className="text-xs">{ev}</Badge>)}
                          </div>
                          {wh.delivery_count > 0 && (
                            <button onClick={() => viewDeliveries(wh.id)}
                              className="text-xs text-primary hover:underline flex items-center gap-0.5">
                              {expandedDeliveries === wh.id ? 'Hide' : 'View'} deliveries
                            </button>
                          )}
                        </div>
                        {expandedDeliveries === wh.id && (
                          <div className="mt-2 space-y-1 max-h-48 overflow-y-auto">
                            {loadingDeliveries === wh.id ? (
                              <p className="text-xs text-muted-foreground py-2 text-center"><RefreshCw className="inline w-3 h-3 animate-spin mr-1" />Loading…</p>
                            ) : (webhookDeliveries[wh.id] ?? []).length === 0 ? (
                              <p className="text-xs text-muted-foreground py-2 text-center">No delivery records yet.</p>
                            ) : (
                              (webhookDeliveries[wh.id] ?? []).map((d: any, i: number) => (
                                <div key={i} className="flex items-center gap-2 text-xs p-2 bg-muted/20 rounded-lg">
                                  <Badge variant={d.status_code >= 200 && d.status_code < 300 ? 'default' : 'destructive'}
                                    className="text-[10px] h-4 px-1">{d.status_code ?? 'ERR'}</Badge>
                                  <span className="text-muted-foreground flex-1 truncate">{d.event_type ?? '—'}</span>
                                  <span className="text-muted-foreground">{d.duration_ms != null ? `${d.duration_ms}ms` : ''}</span>
                                  <span className="text-muted-foreground">{d.delivered_at ? new Date(d.delivered_at).toLocaleString() : '—'}</span>
                                </div>
                              ))
                            )}
                          </div>
                        )}
                      </GlassCard>
                    ))}
                  </div>
                )}
              </>
            )}
          </TabsContent>

          {/* Endpoints */}
          <TabsContent value="docs" className="mt-4">
            <GlassCard className="p-5 space-y-2">
              <div className="flex items-center gap-2 mb-3">
                <BookOpen className="w-4 h-4 text-primary" />
                <h2 className="font-semibold">REST API — Base URL: <code className="text-primary text-sm">https://api.netlifegy.com</code></h2>
              </div>
              {ENDPOINTS.map(ep => (
                <div key={ep.path} className="flex items-center gap-3 p-3 bg-muted/20 rounded-lg border border-border/20 hover:border-primary/30 transition-colors">
                  <Badge variant={ep.method === 'GET' ? 'secondary' : 'default'}
                    className={`text-xs w-12 justify-center ${ep.method === 'POST' ? 'bg-amber-500/20 text-amber-400 border-amber-500/30' : ''}`}>
                    {ep.method}
                  </Badge>
                  <code className="text-sm font-mono text-primary flex-1">{ep.path}</code>
                  <span className="text-xs text-muted-foreground hidden md:block">{ep.desc}</span>
                  <button onClick={() => { setTryEndpoint(ep); }} className="text-xs text-primary hover:underline flex items-center gap-0.5">
                    Try <ChevronRight className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </GlassCard>
          </TabsContent>

          {/* Playground */}
          <TabsContent value="playground" className="mt-4 space-y-4">
            <GlassCard className="p-5 space-y-4">
              <h2 className="font-semibold flex items-center gap-2">
                <Zap className="w-4 h-4 text-primary" /> Interactive API Playground
              </h2>
              <div>
                <Label className="text-xs text-muted-foreground">Endpoint</Label>
                <div className="flex gap-2 mt-1">
                  <select className="flex-1 bg-muted/30 border border-border/40 rounded-lg px-3 py-2 text-sm"
                    value={tryEndpoint.path} onChange={e => setTryEndpoint(ENDPOINTS.find(x => x.path === e.target.value) ?? ENDPOINTS[0])}>
                    {ENDPOINTS.map(ep => <option key={ep.path} value={ep.path}>{ep.method} {ep.path}</option>)}
                  </select>
                  <Button onClick={tryApi} className="gap-2">
                    <Zap className="w-4 h-4" /> Run
                  </Button>
                </div>
              </div>
              {tryResult && (
                <div>
                  <Label className="text-xs text-muted-foreground">Response</Label>
                  <pre className="mt-1 p-3 bg-muted/20 rounded-lg text-xs font-mono overflow-auto max-h-48 border border-border/30">{tryResult}</pre>
                </div>
              )}
            </GlassCard>
          </TabsContent>

          {/* SDKs */}
          <TabsContent value="sdks" className="mt-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {[
                { lang: 'JavaScript / TypeScript', pkg: '@gydschain/sdk', install: 'npm install @gydschain/sdk', status: 'Coming Soon', icon: '🟨' },
                { lang: 'Python', pkg: 'gydschain-py', install: 'pip install gydschain', status: 'Coming Soon', icon: '🐍' },
                { lang: 'Go', pkg: 'github.com/gydschain/go-sdk', install: 'go get github.com/gydschain/go-sdk', status: 'In Progress', icon: '🔵' },
                { lang: 'Rust', pkg: 'gydschain-rs', install: 'cargo add gydschain', status: 'Planned', icon: '🦀' },
              ].map(sdk => (
                <GlassCard key={sdk.lang} className="p-5 space-y-3">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{sdk.icon}</span>
                    <div>
                      <p className="font-semibold">{sdk.lang}</p>
                      <code className="text-xs text-muted-foreground">{sdk.pkg}</code>
                    </div>
                    <Badge variant="secondary" className="ml-auto text-xs">{sdk.status}</Badge>
                  </div>
                  <div className="flex items-center gap-2 bg-muted/20 rounded-lg p-2">
                    <code className="text-xs font-mono text-primary flex-1">{sdk.install}</code>
                    <button onClick={() => { navigator.clipboard.writeText(sdk.install); toast({ title: 'Copied!' }); }}
                      className="text-muted-foreground hover:text-primary p-1"><Copy className="w-3 h-3" /></button>
                  </div>
                </GlassCard>
              ))}
            </div>
          </TabsContent>
        </Tabs>

        {/* Rate limit notice */}
        <GlassCard className="p-4 flex items-center gap-3 text-sm text-muted-foreground">
          <Shield className="w-4 h-4 text-primary shrink-0" />
          <span>API keys are rate-limited to <strong className="text-foreground">10,000 requests/day</strong>. Rate limits reset daily at midnight UTC. Contact support for higher limits.</span>
        </GlassCard>
      </motion.div>
    </Layout>
  );
};

export default DeveloperPage;
