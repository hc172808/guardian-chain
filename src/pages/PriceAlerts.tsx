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
  Bell, BellRing, Plus, Trash2, RefreshCw, TrendingUp,
  TrendingDown, AlertCircle, CheckCircle2, Loader2, Info,
  ChevronRight
} from 'lucide-react';

interface Alert {
  id: string;
  tokenId: string;
  targetPrice: string;
  direction: 'above' | 'below';
  isTriggered: boolean;
  triggeredAt: string | null;
  createdAt: string;
}

interface Token {
  id: string;
  symbol: string;
  name: string;
  currentPrice: string | null;
}

export default function PriceAlerts() {
  const { user, isLoading: authLoading } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [tokens, setTokens] = useState<Token[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [resettingId, setResettingId] = useState<string | null>(null);

  const [form, setForm] = useState({ tokenId: '', targetPrice: '', direction: 'above' as 'above' | 'below' });

  useEffect(() => {
    if (!authLoading && !user) navigate('/auth');
  }, [user, authLoading, navigate]);

  const load = async () => {
    setLoading(true);
    try {
      const [alertsRes, tokensRes] = await Promise.all([
        fetch('/api/price-alerts'),
        fetch('/api/tokens?limit=100'),
      ]);
      if (alertsRes.ok) setAlerts(await alertsRes.json());
      if (tokensRes.ok) {
        const data = await tokensRes.json();
        setTokens(Array.isArray(data) ? data : (data.tokens ?? []));
      }
    } catch {
      toast({ title: 'Failed to load', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user) load();
  }, [user]);

  const addAlert = async () => {
    if (!form.tokenId) return toast({ title: 'Select a token', variant: 'destructive' });
    if (!form.targetPrice || isNaN(parseFloat(form.targetPrice)) || parseFloat(form.targetPrice) <= 0)
      return toast({ title: 'Enter a valid target price', variant: 'destructive' });
    setSaving(true);
    try {
      const res = await fetch('/api/price-alerts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tokenId: form.tokenId, targetPrice: parseFloat(form.targetPrice), direction: form.direction }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? 'Failed to create alert');
      }
      const newAlert = await res.json();
      setAlerts(prev => [newAlert, ...prev]);
      setForm({ tokenId: '', targetPrice: '', direction: 'above' });
      toast({ title: 'Alert created', description: `You'll be notified when the price goes ${form.direction} your target.` });
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const deleteAlert = async (id: string) => {
    setDeletingId(id);
    try {
      await fetch(`/api/price-alerts/${id}`, { method: 'DELETE' });
      setAlerts(prev => prev.filter(a => a.id !== id));
      toast({ title: 'Alert deleted' });
    } finally {
      setDeletingId(null);
    }
  };

  const resetAlert = async (id: string) => {
    setResettingId(id);
    try {
      const res = await fetch(`/api/price-alerts/${id}/reset`, { method: 'PATCH' });
      if (res.ok) {
        setAlerts(prev => prev.map(a => a.id === id ? { ...a, isTriggered: false, triggeredAt: null } : a));
        toast({ title: 'Alert reset', description: 'Alert will fire again when price hits target.' });
      }
    } finally {
      setResettingId(null);
    }
  };

  const getToken = (id: string) => tokens.find(t => t.id === id);

  const activeAlerts = alerts.filter(a => !a.isTriggered);
  const triggeredAlerts = alerts.filter(a => a.isTriggered);

  if (authLoading || (loading && !alerts.length)) {
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
              <BellRing className="w-6 h-6 text-primary" />
              Price Alerts
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              Get notified by email and push when a token hits your target price.
            </p>
          </div>
          <Button variant="ghost" size="icon" onClick={load} title="Refresh">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>

        {/* Info banner when push/email not configured */}
        <div className="flex items-start gap-3 p-3 rounded-xl bg-blue-500/10 border border-blue-500/20 text-sm text-blue-300">
          <Info className="w-4 h-4 mt-0.5 shrink-0" />
          <span>
            Alerts deliver via <strong>email</strong> (requires SMTP) and <strong>push</strong> (enable in Profile → Notifications).
            You can still create alerts — they'll be stored and fire when configured.
          </span>
        </div>

        {/* Create alert form */}
        <GlassCard className="p-5 space-y-4">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
            <Plus className="w-3.5 h-3.5" /> New Alert
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* Token select */}
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground">Token</label>
              <select
                value={form.tokenId}
                onChange={e => setForm(f => ({ ...f, tokenId: e.target.value }))}
                className="w-full h-9 px-3 rounded-md border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">Select token…</option>
                {tokens.map(t => (
                  <option key={t.id} value={t.id}>
                    {t.symbol} — {t.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Direction */}
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground">Direction</label>
              <div className="flex rounded-md border border-border overflow-hidden h-9">
                {(['above', 'below'] as const).map(d => (
                  <button
                    key={d}
                    onClick={() => setForm(f => ({ ...f, direction: d }))}
                    className={`flex-1 flex items-center justify-center gap-1.5 text-xs font-medium transition-colors
                      ${form.direction === d ? 'bg-primary text-primary-foreground' : 'bg-background hover:bg-muted/40'}`}
                  >
                    {d === 'above'
                      ? <><TrendingUp className="w-3 h-3" /> Above</>
                      : <><TrendingDown className="w-3 h-3" /> Below</>}
                  </button>
                ))}
              </div>
            </div>

            {/* Target price */}
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground">Target price (USD)</label>
              <Input
                type="number"
                min="0"
                step="any"
                placeholder="e.g. 1.50"
                value={form.targetPrice}
                onChange={e => setForm(f => ({ ...f, targetPrice: e.target.value }))}
                className="h-9"
              />
            </div>
          </div>

          {/* Current price hint */}
          {form.tokenId && (() => {
            const tok = getToken(form.tokenId);
            if (!tok?.currentPrice) return null;
            return (
              <p className="text-xs text-muted-foreground">
                Current price: <span className="text-foreground font-medium">${parseFloat(tok.currentPrice).toFixed(4)}</span>
              </p>
            );
          })()}

          <Button onClick={addAlert} disabled={saving} className="w-full sm:w-auto gap-2">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Bell className="w-4 h-4" />}
            {saving ? 'Creating…' : 'Create Alert'}
          </Button>
        </GlassCard>

        {/* Active alerts */}
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
            <Bell className="w-3.5 h-3.5" /> Active Alerts
            {activeAlerts.length > 0 && <Badge variant="secondary">{activeAlerts.length}</Badge>}
          </h2>

          {activeAlerts.length === 0 ? (
            <GlassCard className="p-8 text-center">
              <Bell className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
              <p className="text-muted-foreground text-sm">No active alerts. Create one above.</p>
            </GlassCard>
          ) : (
            <div className="space-y-2">
              {activeAlerts.map(alert => {
                const tok = getToken(alert.tokenId);
                const currentPrice = tok?.currentPrice ? parseFloat(tok.currentPrice) : null;
                const target = parseFloat(alert.targetPrice);
                const pctDiff = currentPrice ? ((target - currentPrice) / currentPrice * 100) : null;
                return (
                  <GlassCard key={alert.id} className="p-4 flex items-center gap-4">
                    <div className={`p-2 rounded-xl shrink-0 ${alert.direction === 'above' ? 'bg-green-500/10' : 'bg-red-500/10'}`}>
                      {alert.direction === 'above'
                        ? <TrendingUp className="w-4 h-4 text-green-400" />
                        : <TrendingDown className="w-4 h-4 text-red-400" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-sm">{tok?.symbol ?? '…'}</span>
                        <Badge variant="outline" className={`text-[10px] ${alert.direction === 'above' ? 'border-green-500/40 text-green-400' : 'border-red-500/40 text-red-400'}`}>
                          {alert.direction === 'above' ? '↑ above' : '↓ below'} ${target.toFixed(4)}
                        </Badge>
                        {pctDiff !== null && (
                          <span className="text-[10px] text-muted-foreground">
                            {Math.abs(pctDiff).toFixed(1)}% {pctDiff > 0 ? 'away ↑' : 'away ↓'}
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        {tok?.name ?? alert.tokenId}
                        {currentPrice !== null && ` · Current $${currentPrice.toFixed(4)}`}
                      </p>
                    </div>
                    <button
                      onClick={() => deleteAlert(alert.id)}
                      disabled={deletingId === alert.id}
                      className="shrink-0 p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors disabled:opacity-50"
                    >
                      {deletingId === alert.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                    </button>
                  </GlassCard>
                );
              })}
            </div>
          )}
        </div>

        {/* Triggered alerts */}
        {triggeredAlerts.length > 0 && (
          <div className="space-y-3">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
              <CheckCircle2 className="w-3.5 h-3.5 text-green-400" /> Triggered
              <Badge variant="secondary">{triggeredAlerts.length}</Badge>
            </h2>
            <div className="space-y-2">
              {triggeredAlerts.map(alert => {
                const tok = getToken(alert.tokenId);
                const target = parseFloat(alert.targetPrice);
                return (
                  <GlassCard key={alert.id} className="p-4 flex items-center gap-4 opacity-70">
                    <div className="p-2 rounded-xl shrink-0 bg-green-500/10">
                      <CheckCircle2 className="w-4 h-4 text-green-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-sm">{tok?.symbol ?? '…'}</span>
                        <Badge variant="outline" className="text-[10px] border-green-500/30 text-green-400">
                          {alert.direction === 'above' ? '↑ above' : '↓ below'} ${target.toFixed(4)}
                        </Badge>
                        <Badge className="text-[10px] bg-green-500/10 text-green-400 border-0">Triggered</Badge>
                      </div>
                      {alert.triggeredAt && (
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          Fired {new Date(alert.triggeredAt).toLocaleString()}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => resetAlert(alert.id)}
                        disabled={resettingId === alert.id}
                        className="p-1.5 rounded-lg hover:bg-primary/10 text-muted-foreground hover:text-primary transition-colors disabled:opacity-50"
                        title="Reset alert"
                      >
                        {resettingId === alert.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                      </button>
                      <button
                        onClick={() => deleteAlert(alert.id)}
                        disabled={deletingId === alert.id}
                        className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors disabled:opacity-50"
                      >
                        {deletingId === alert.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </GlassCard>
                );
              })}
            </div>
          </div>
        )}

        {/* Empty state for both lists */}
        {alerts.length === 0 && !loading && (
          <div className="text-center py-12 text-muted-foreground">
            <AlertCircle className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="text-sm">Create your first price alert to get started.</p>
            <p className="text-xs mt-1 opacity-60">You'll receive email and push notifications when the price hits your target.</p>
          </div>
        )}

        {/* Quick link to Profile notifications */}
        <GlassCard className="p-4 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">Notification settings</p>
            <p className="text-xs text-muted-foreground">Configure email, push, and channel preferences</p>
          </div>
          <Button variant="ghost" size="sm" className="gap-1" onClick={() => navigate('/profile')}>
            Profile <ChevronRight className="w-3.5 h-3.5" />
          </Button>
        </GlassCard>
      </div>
    </Layout>
  );
}
