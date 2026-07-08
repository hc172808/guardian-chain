import { useState, useEffect } from 'react';
import { Layout } from '@/components/layout/Layout';
import { GlassCard } from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import {
  Webhook, Plus, Trash2, RefreshCw, Play, ChevronDown, ChevronUp,
  CheckCircle2, XCircle, Clock, Loader2, Copy, Shield, Zap,
  ToggleLeft, ToggleRight, Info
} from 'lucide-react';

const ALL_EVENTS = [
  { key: 'tx.confirmed',    label: 'Transaction Confirmed', desc: 'Fires when a tx in your wallet confirms' },
  { key: 'block.new',       label: 'New Block',             desc: 'Fires on every new block produced' },
  { key: 'price.alert',     label: 'Price Alert Triggered', desc: 'Fires when a price alert hits target' },
  { key: 'governance.vote', label: 'Governance Vote',       desc: 'Fires when a new governance proposal is created' },
  { key: 'node.status',     label: 'Node Status Change',    desc: 'Fires when a node goes offline or comes back' },
  { key: 'validator.slash', label: 'Validator Slash',       desc: 'Fires when a validator is slashed or jailed' },
];

interface Webhook {
  id: string;
  url: string;
  secret: string;
  events: string[];
  active: boolean;
  created_at: string;
}

interface Delivery {
  id: string;
  event: string;
  response_status: number;
  success: boolean;
  duration_ms: number;
  attempted_at: string;
}

export default function WebhooksPage() {
  const { user, isLoading: authLoading } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [webhooks, setWebhooks] = useState<Webhook[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ url: '', events: ['tx.confirmed', 'block.new'] as string[] });
  const [showForm, setShowForm] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [deliveries, setDeliveries] = useState<Record<string, Delivery[]>>({});
  const [loadingDeliveries, setLoadingDeliveries] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !user) navigate('/auth');
  }, [user, authLoading, navigate]);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/webhooks');
      if (res.ok) setWebhooks(await res.json());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (user) load(); }, [user]);

  const createWebhook = async () => {
    if (!form.url.startsWith('https://') && !form.url.startsWith('http://'))
      return toast({ title: 'Invalid URL', description: 'URL must start with http:// or https://', variant: 'destructive' });
    if (!form.events.length)
      return toast({ title: 'Select at least one event', variant: 'destructive' });
    setCreating(true);
    try {
      const res = await fetch('/api/webhooks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: form.url, events: form.events }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? 'Failed');
      const wh = await res.json();
      setWebhooks(prev => [wh, ...prev]);
      setForm({ url: '', events: ['tx.confirmed', 'block.new'] });
      setShowForm(false);
      toast({ title: 'Webhook registered', description: 'Your endpoint will start receiving events immediately.' });
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally {
      setCreating(false);
    }
  };

  const deleteWebhook = async (id: string) => {
    setDeletingId(id);
    try {
      await fetch(`/api/webhooks/${id}`, { method: 'DELETE' });
      setWebhooks(prev => prev.filter(w => w.id !== id));
      if (expanded === id) setExpanded(null);
      toast({ title: 'Webhook deleted' });
    } finally {
      setDeletingId(null);
    }
  };

  const toggleWebhook = async (wh: Webhook) => {
    setTogglingId(wh.id);
    try {
      const res = await fetch(`/api/webhooks/${wh.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: !wh.active }),
      });
      if (res.ok) {
        setWebhooks(prev => prev.map(w => w.id === wh.id ? { ...w, active: !wh.active } : w));
      }
    } finally {
      setTogglingId(null);
    }
  };

  const testWebhook = async (id: string) => {
    setTestingId(id);
    try {
      const res = await fetch(`/api/webhooks/${id}/test`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        toast({ title: 'Test ping sent', description: `Response ${data.responseStatus} in ${data.durationMs}ms` });
      } else {
        toast({ title: 'Ping failed', description: `Status ${data.responseStatus || 'no response'} — is your endpoint reachable?`, variant: 'destructive' });
      }
      // Refresh deliveries if expanded
      if (expanded === id) loadDeliveries(id);
    } catch {
      toast({ title: 'Test failed', variant: 'destructive' });
    } finally {
      setTestingId(null);
    }
  };

  const loadDeliveries = async (id: string) => {
    setLoadingDeliveries(id);
    try {
      const res = await fetch(`/api/webhooks/${id}/deliveries`);
      if (res.ok) {
        const data = await res.json();
        setDeliveries(prev => ({ ...prev, [id]: data }));
      }
    } finally {
      setLoadingDeliveries(null);
    }
  };

  const toggleExpand = async (id: string) => {
    if (expanded === id) { setExpanded(null); return; }
    setExpanded(id);
    if (!deliveries[id]) await loadDeliveries(id);
  };

  const retryDelivery = async (webhookId: string, deliveryId: string) => {
    setRetryingId(deliveryId);
    try {
      const res = await fetch(`/api/webhooks/${webhookId}/deliveries/${deliveryId}/retry`, { method: 'POST' });
      const data = await res.json();
      toast({ title: data.success ? 'Retried successfully' : 'Retry failed', description: `Status ${data.responseStatus || 'no response'} in ${data.durationMs}ms`, variant: data.success ? 'default' : 'destructive' });
      await loadDeliveries(webhookId);
    } finally {
      setRetryingId(null);
    }
  };

  const copySecret = (secret: string) => {
    navigator.clipboard.writeText(secret);
    toast({ title: 'Secret copied to clipboard' });
  };

  const toggleEvent = (key: string) => {
    setForm(f => ({
      ...f,
      events: f.events.includes(key) ? f.events.filter(e => e !== key) : [...f.events, key],
    }));
  };

  if (authLoading || loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="max-w-3xl mx-auto space-y-6 p-4 md:p-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Webhook className="w-6 h-6 text-primary" />
              Webhooks
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              Register HTTP endpoints to receive real-time event notifications from ChainCore.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" size="icon" onClick={load} title="Refresh">
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
            <Button onClick={() => setShowForm(f => !f)} className="gap-2" size="sm">
              <Plus className="w-4 h-4" /> Register
            </Button>
          </div>
        </div>

        {/* Info */}
        <div className="flex items-start gap-3 p-3 rounded-xl bg-blue-500/10 border border-blue-500/20 text-sm text-blue-300">
          <Info className="w-4 h-4 mt-0.5 shrink-0" />
          <span>
            ChainCore sends a <code className="text-xs bg-black/20 px-1 rounded">POST</code> request with a JSON payload to your URL for each subscribed event.
            Verify the <code className="text-xs bg-black/20 px-1 rounded">X-ChainCore-Secret</code> header to authenticate requests.
          </span>
        </div>

        {/* Create form */}
        {showForm && (
          <GlassCard className="p-5 space-y-5">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">New Webhook</h2>

            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground">Endpoint URL</label>
              <Input
                type="url"
                placeholder="https://your-server.com/webhook"
                value={form.url}
                onChange={e => setForm(f => ({ ...f, url: e.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs text-muted-foreground">Events to subscribe</label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {ALL_EVENTS.map(ev => (
                  <label key={ev.key} className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors
                    ${form.events.includes(ev.key) ? 'border-primary/50 bg-primary/5' : 'border-border/40 bg-muted/10 hover:border-border/60'}`}>
                    <input
                      type="checkbox"
                      checked={form.events.includes(ev.key)}
                      onChange={() => toggleEvent(ev.key)}
                      className="mt-0.5 accent-primary"
                    />
                    <div>
                      <p className="text-sm font-medium">{ev.label}</p>
                      <p className="text-[11px] text-muted-foreground">{ev.desc}</p>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            <div className="flex gap-2 justify-end">
              <Button variant="ghost" size="sm" onClick={() => setShowForm(false)}>Cancel</Button>
              <Button onClick={createWebhook} disabled={creating} className="gap-2" size="sm">
                {creating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                {creating ? 'Registering…' : 'Register Webhook'}
              </Button>
            </div>
          </GlassCard>
        )}

        {/* Webhook list */}
        {webhooks.length === 0 ? (
          <GlassCard className="p-12 text-center">
            <Webhook className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-muted-foreground text-sm">No webhooks registered yet.</p>
            <Button onClick={() => setShowForm(true)} className="mt-4 gap-2" size="sm">
              <Plus className="w-4 h-4" /> Register your first webhook
            </Button>
          </GlassCard>
        ) : (
          <div className="space-y-3">
            {webhooks.map(wh => (
              <GlassCard key={wh.id} className="overflow-hidden">
                {/* Header row */}
                <div className="p-4 flex items-start gap-3">
                  <div className={`mt-1 p-2 rounded-xl shrink-0 ${wh.active ? 'bg-green-500/10' : 'bg-muted/20'}`}>
                    <Webhook className={`w-4 h-4 ${wh.active ? 'text-green-400' : 'text-muted-foreground'}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-sm truncate max-w-[260px]">{wh.url}</span>
                      <Badge variant={wh.active ? 'default' : 'secondary'} className={`text-[10px] ${wh.active ? 'bg-green-500/20 text-green-400 border-green-500/30' : ''}`}>
                        {wh.active ? 'Active' : 'Paused'}
                      </Badge>
                    </div>
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {(wh.events ?? []).map(ev => (
                        <span key={ev} className="text-[10px] px-1.5 py-0.5 rounded bg-muted/30 text-muted-foreground font-mono">{ev}</span>
                      ))}
                    </div>
                    <div className="flex items-center gap-1.5 mt-2">
                      <Shield className="w-3 h-3 text-muted-foreground" />
                      <span className="font-mono text-[10px] text-muted-foreground truncate max-w-[160px]">{wh.secret}</span>
                      <button onClick={() => copySecret(wh.secret)} className="p-0.5 hover:text-foreground text-muted-foreground transition-colors" title="Copy secret">
                        <Copy className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {/* Toggle active */}
                    <button
                      onClick={() => toggleWebhook(wh)}
                      disabled={togglingId === wh.id}
                      className="p-1.5 rounded-lg hover:bg-muted/40 text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
                      title={wh.active ? 'Pause webhook' : 'Resume webhook'}
                    >
                      {togglingId === wh.id
                        ? <Loader2 className="w-4 h-4 animate-spin" />
                        : wh.active ? <ToggleRight className="w-4 h-4 text-green-400" /> : <ToggleLeft className="w-4 h-4" />}
                    </button>
                    {/* Test */}
                    <button
                      onClick={() => testWebhook(wh.id)}
                      disabled={testingId === wh.id}
                      className="p-1.5 rounded-lg hover:bg-primary/10 text-muted-foreground hover:text-primary transition-colors disabled:opacity-50"
                      title="Send test ping"
                    >
                      {testingId === wh.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                    </button>
                    {/* Delete */}
                    <button
                      onClick={() => deleteWebhook(wh.id)}
                      disabled={deletingId === wh.id}
                      className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors disabled:opacity-50"
                      title="Delete webhook"
                    >
                      {deletingId === wh.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                    </button>
                    {/* Expand */}
                    <button
                      onClick={() => toggleExpand(wh.id)}
                      className="p-1.5 rounded-lg hover:bg-muted/40 text-muted-foreground hover:text-foreground transition-colors"
                      title="View delivery log"
                    >
                      {expanded === wh.id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* Delivery log */}
                {expanded === wh.id && (
                  <div className="border-t border-border/40 px-4 pb-4 pt-3 space-y-2">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Delivery Log</p>
                      <button onClick={() => loadDeliveries(wh.id)} className="text-[10px] text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1">
                        <RefreshCw className={`w-3 h-3 ${loadingDeliveries === wh.id ? 'animate-spin' : ''}`} /> Refresh
                      </button>
                    </div>

                    {loadingDeliveries === wh.id ? (
                      <div className="flex justify-center py-6">
                        <Loader2 className="w-5 h-5 animate-spin text-primary" />
                      </div>
                    ) : !deliveries[wh.id]?.length ? (
                      <div className="text-center py-6 text-muted-foreground text-xs">
                        No deliveries yet. Use the <Zap className="inline w-3 h-3" /> test button to send a ping.
                      </div>
                    ) : (
                      <div className="space-y-1.5">
                        {deliveries[wh.id].map(d => (
                          <div key={d.id} className="flex items-center gap-3 p-2.5 rounded-lg bg-muted/20 border border-border/30">
                            <div className="shrink-0">
                              {d.success
                                ? <CheckCircle2 className="w-3.5 h-3.5 text-green-400" />
                                : <XCircle className="w-3.5 h-3.5 text-red-400" />}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-mono text-xs text-foreground">{d.event}</span>
                                <Badge variant="outline" className={`text-[10px] ${d.success ? 'border-green-500/30 text-green-400' : 'border-red-500/30 text-red-400'}`}>
                                  {d.response_status || 'no resp'}
                                </Badge>
                                <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                                  <Clock className="w-2.5 h-2.5" />{d.duration_ms}ms
                                </span>
                              </div>
                              <p className="text-[10px] text-muted-foreground mt-0.5">
                                {new Date(d.attempted_at).toLocaleString()}
                              </p>
                            </div>
                            <button
                              onClick={() => retryDelivery(wh.id, d.id)}
                              disabled={retryingId === d.id}
                              className="shrink-0 p-1 rounded hover:bg-primary/10 text-muted-foreground hover:text-primary transition-colors disabled:opacity-50"
                              title="Retry this delivery"
                            >
                              {retryingId === d.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </GlassCard>
            ))}
          </div>
        )}

        {/* Event reference */}
        <GlassCard className="p-5 space-y-3">
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Event Reference</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {ALL_EVENTS.map(ev => (
              <div key={ev.key} className="flex items-start gap-2 p-2.5 rounded-lg bg-muted/10 border border-border/20">
                <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary shrink-0">{ev.key}</span>
                <p className="text-xs text-muted-foreground">{ev.desc}</p>
              </div>
            ))}
          </div>
        </GlassCard>
      </div>
    </Layout>
  );
}
