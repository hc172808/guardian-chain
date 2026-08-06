/**
 * CaptchaSecuritySettings.tsx
 *
 * Admin → Health → Security-check settings.
 * Lets admin/founder tune rolling-window thresholds, cooldowns and the
 * offline-fallback replay expiry (default 2 minutes) at runtime — no redeploy —
 * and control the server-side feature flag that auto-disables the offline
 * fallback while the platform is under attack.
 */

import { useCallback, useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { Loader2, RefreshCw, ShieldAlert, ShieldCheck, Save, RotateCcw } from 'lucide-react';

type Settings = {
  alertThreshold: number;
  alertWindowMs: number;
  alertCooldownMs: number;
  fallbackTtlMs: number;
  fallbackReplayRetentionMultiplier: number;
  fallbackEnabled: boolean;
  autoDisableFallbackUnderAttack: boolean;
  attackThreshold: number;
  attackWindowMs: number;
  attackCooldownMs: number;
};

type AttackState = {
  active: boolean;
  signalsInWindow: number;
  threshold: number;
  until: string | null;
  reason: 'auto' | 'manual' | null;
};

const MS = 60_000;

async function jsonFetch(url: string, init?: RequestInit) {
  const res = await fetch(url, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    ...init,
  });
  const type = res.headers.get('content-type') ?? '';
  if (!type.includes('application/json')) {
    throw new Error(`Server returned ${res.status} (${type || 'unknown type'}) instead of JSON`);
  }
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error ?? `Request failed (${res.status})`);
  return data;
}

export function CaptchaSecuritySettings() {
  const { toast } = useToast();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [defaults, setDefaults] = useState<Settings | null>(null);
  const [attack, setAttack] = useState<AttackState | null>(null);
  const [fallbackAllowed, setFallbackAllowed] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await jsonFetch('/api/auth/captcha/settings');
      setSettings(data.settings);
      setDefaults(data.defaults);
      setAttack(data.attack);
      setFallbackAllowed(data.fallbackAllowed);
    } catch (e: any) {
      setError(e?.message ?? 'Failed to load settings');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const patch = (key: keyof Settings, value: number | boolean) =>
    setSettings(prev => (prev ? { ...prev, [key]: value } : prev));

  const save = async () => {
    if (!settings) return;
    setSaving(true);
    try {
      const data = await jsonFetch('/api/auth/captcha/settings', { method: 'PUT', body: JSON.stringify(settings) });
      setSettings(data.settings);
      setAttack(data.attack);
      setFallbackAllowed(data.fallbackAllowed);
      toast({ title: 'Settings applied', description: 'New thresholds are live — no redeploy needed.' });
    } catch (e: any) {
      toast({ title: 'Could not save', description: e?.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const reset = async () => {
    setSaving(true);
    try {
      const data = await jsonFetch('/api/auth/captcha/settings/reset', { method: 'POST' });
      setSettings(data.settings);
      setAttack(data.attack);
      setFallbackAllowed(data.fallbackAllowed);
      toast({ title: 'Reset to defaults' });
    } catch (e: any) {
      toast({ title: 'Reset failed', description: e?.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const setAttackMode = async (minutes: number) => {
    try {
      const data = await jsonFetch('/api/auth/captcha/attack-mode', { method: 'POST', body: JSON.stringify({ minutes }) });
      setAttack(data.attack);
      setFallbackAllowed(data.fallbackAllowed);
      toast({ title: minutes > 0 ? `Attack mode on for ${minutes} min` : 'Attack mode cleared' });
    } catch (e: any) {
      toast({ title: 'Attack-mode change failed', description: e?.message, variant: 'destructive' });
    }
  };

  const minuteField = (
    key: keyof Settings,
    label: string,
    hint: string,
    step = 1,
  ) => (
    <div className="space-y-1.5">
      <Label htmlFor={key}>{label}</Label>
      <Input
        id={key}
        type="number"
        min={0}
        step={step}
        value={settings ? Math.round(((settings[key] as number) / MS) * 100) / 100 : ''}
        onChange={e => patch(key, Math.max(0, Number(e.target.value)) * MS)}
      />
      <p className="text-xs text-muted-foreground">{hint}</p>
    </div>
  );

  const countField = (key: keyof Settings, label: string, hint: string) => (
    <div className="space-y-1.5">
      <Label htmlFor={key}>{label}</Label>
      <Input
        id={key}
        type="number"
        min={1}
        value={settings ? (settings[key] as number) : ''}
        onChange={e => patch(key, Math.max(1, Number(e.target.value)))}
      />
      <p className="text-xs text-muted-foreground">{hint}</p>
    </div>
  );

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-4 space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2">
            {fallbackAllowed ? <ShieldCheck className="h-5 w-5 text-primary" /> : <ShieldAlert className="h-5 w-5 text-destructive" />}
            Security-check settings
          </CardTitle>
          <CardDescription>
            Tune rolling windows, cooldowns and replay expiry live — changes apply immediately without a redeploy.
          </CardDescription>
        </div>
        <div className="flex items-center gap-2">
          {attack?.active && (
            <Badge variant="destructive">Attack mode ({attack.reason})</Badge>
          )}
          <Badge variant={fallbackAllowed ? 'secondary' : 'destructive'}>
            Offline fallback {fallbackAllowed ? 'allowed' : 'disabled'}
          </Badge>
          <Button variant="ghost" size="icon" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {error && <p className="text-sm text-destructive">{error}</p>}
        {loading && !settings && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading settings…
          </div>
        )}

        {settings && (
          <>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {countField('alertThreshold', 'Alert threshold', 'Failures inside the rolling window before an alert fires.')}
              {minuteField('alertWindowMs', 'Alert window (minutes)', 'Rolling window used to count failures.')}
              {minuteField('alertCooldownMs', 'Alert cooldown (minutes)', 'Minimum gap between two alerts of the same kind.')}
              {minuteField('fallbackTtlMs', 'Fallback replay expiry (minutes)', 'Lifetime of an offline challenge. Default 2 minutes.', 0.5)}
              {countField('fallbackReplayRetentionMultiplier', 'Replay memory (× TTL)', 'How much longer used challenge IDs are remembered as replays.')}
              {countField('attackThreshold', 'Attack threshold', 'Failure signals in the attack window that trigger attack mode.')}
              {minuteField('attackWindowMs', 'Attack window (minutes)', 'Rolling window for attack detection.')}
              {minuteField('attackCooldownMs', 'Attack cooldown (minutes)', 'How long attack mode stays on after the last signal.')}
            </div>

            <Separator />

            <div className="space-y-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <Label htmlFor="fallbackEnabled">Offline fallback challenge</Label>
                  <p className="text-xs text-muted-foreground">
                    Master switch. When off, users must always be verified server-side.
                  </p>
                </div>
                <Switch
                  id="fallbackEnabled"
                  checked={settings.fallbackEnabled}
                  onCheckedChange={v => patch('fallbackEnabled', v)}
                />
              </div>

              <div className="flex items-center justify-between gap-4">
                <div>
                  <Label htmlFor="autoDisable">Auto-disable fallback under attack</Label>
                  <p className="text-xs text-muted-foreground">
                    Server-side feature flag: disables the offline fallback during attack conditions while
                    still enforcing server-side verification whenever the API is reachable.
                  </p>
                </div>
                <Switch
                  id="autoDisable"
                  checked={settings.autoDisableFallbackUnderAttack}
                  onCheckedChange={v => patch('autoDisableFallbackUnderAttack', v)}
                />
              </div>

              {attack && (
                <div className="rounded-lg border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
                  Signals in window: <span className="font-mono">{attack.signalsInWindow}</span> / {attack.threshold}
                  {attack.until && <> · active until <span className="font-mono">{new Date(attack.until).toLocaleTimeString()}</span></>}
                </div>
              )}
            </div>

            <div className="flex flex-wrap gap-2">
              <Button onClick={() => void save()} disabled={saving}>
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                Apply settings
              </Button>
              <Button variant="outline" onClick={() => void reset()} disabled={saving || !defaults}>
                <RotateCcw className="mr-2 h-4 w-4" /> Reset to defaults
              </Button>
              <Button variant="destructive" onClick={() => void setAttackMode(30)}>
                Force attack mode (30 min)
              </Button>
              <Button variant="secondary" onClick={() => void setAttackMode(0)}>
                Clear attack mode
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

export default CaptchaSecuritySettings;
