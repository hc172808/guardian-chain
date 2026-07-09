import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { api } from '@/lib/api';
import { toast } from '@/hooks/use-toast';
import { Lock, Unlock, Plus, Trash2, RefreshCw, Loader2, Save, ShieldAlert, Clock } from 'lucide-react';

interface LockoutSettings {
  enabled: boolean;
  durationsSec: number[];
  redirectUrl: string | null;
}

interface ActiveLockout {
  identifier: string;
  strikes: number;
  lockedUntil: string | null;
}

const DEFAULT_DURATIONS = [60, 300, 900, 3600, 21600, 86400];

function formatDuration(sec: number): string {
  if (sec < 60) return `${sec}s`;
  if (sec < 3600) return `${Math.round(sec / 60)}m`;
  if (sec < 86400) return `${Math.round(sec / 3600)}h`;
  return `${Math.round(sec / 86400)}d`;
}

function parseDurationInput(input: string): number {
  const s = input.trim().toLowerCase();
  const m = s.match(/^(\d+(?:\.\d+)?)\s*(s|sec|m|min|h|hr|d|day)?$/);
  if (!m) return 0;
  const n = parseFloat(m[1]);
  const unit = m[2] ?? 's';
  if (unit === 's' || unit === 'sec') return Math.round(n);
  if (unit === 'm' || unit === 'min') return Math.round(n * 60);
  if (unit === 'h' || unit === 'hr') return Math.round(n * 3600);
  if (unit === 'd' || unit === 'day') return Math.round(n * 86400);
  return Math.round(n);
}

export function LockoutSettingsTab() {
  const [settings, setSettings] = useState<LockoutSettings>({ enabled: true, durationsSec: DEFAULT_DURATIONS, redirectUrl: null });
  const [durationInputs, setDurationInputs] = useState<string[]>(DEFAULT_DURATIONS.map(String));
  const [redirectInput, setRedirectInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [lockouts, setLockouts] = useState<ActiveLockout[]>([]);
  const [lockoutsLoading, setLockoutsLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get('/api/admin/lockout-settings') as LockoutSettings;
      setSettings(data);
      setDurationInputs((data.durationsSec ?? DEFAULT_DURATIONS).map(String));
      setRedirectInput(data.redirectUrl ?? '');
    } catch (e: any) {
      toast({ title: 'Failed to load lockout settings', description: e.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, []);

  const loadLockouts = useCallback(async () => {
    setLockoutsLoading(true);
    try {
      const data = await api.get('/api/admin/lockouts') as ActiveLockout[];
      setLockouts(data);
    } catch {
      // non-fatal
    } finally {
      setLockoutsLoading(false);
    }
  }, []);

  useEffect(() => { load(); loadLockouts(); }, [load, loadLockouts]);

  const handleSave = async () => {
    const durationsSec = durationInputs
      .map(parseDurationInput)
      .filter((n) => n > 0);
    if (durationsSec.length === 0) {
      toast({ title: 'Add at least one duration', variant: 'destructive' });
      return;
    }
    if (redirectInput.trim() && !/^https?:\/\//i.test(redirectInput.trim()) && !redirectInput.trim().startsWith('/')) {
      toast({ title: 'Redirect URL must start with http://, https://, or /', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const payload = {
        enabled: settings.enabled,
        durationsSec,
        redirectUrl: redirectInput.trim() || null,
      };
      const saved = await api.post('/api/admin/lockout-settings', payload) as LockoutSettings;
      setSettings(saved);
      setDurationInputs(saved.durationsSec.map(String));
      toast({ title: 'Lockout settings saved' });
    } catch (e: any) {
      toast({ title: 'Save failed', description: e.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleUnlock = async (identifier: string) => {
    try {
      await api.delete(`/api/admin/lockouts/${encodeURIComponent(identifier)}`);
      setLockouts((prev) => prev.filter((l) => l.identifier !== identifier));
      toast({ title: `Unlocked ${identifier}` });
    } catch (e: any) {
      toast({ title: 'Unlock failed', description: e.message, variant: 'destructive' });
    }
  };

  const updateDuration = (idx: number, value: string) => {
    setDurationInputs((prev) => prev.map((v, i) => (i === idx ? value : v)));
  };
  const removeDuration = (idx: number) => {
    setDurationInputs((prev) => prev.filter((_, i) => i !== idx));
  };
  const addDuration = () => {
    setDurationInputs((prev) => [...prev, '']);
  };

  if (loading) {
    return <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-6">
      <div className="p-4 rounded-lg border border-border/50 bg-secondary/10 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 text-primary" />
            <h4 className="text-sm font-semibold">Progressive Login Lockout</h4>
          </div>
          <div className="flex items-center gap-2">
            <Label htmlFor="lockout-enabled" className="text-xs text-muted-foreground">Enabled</Label>
            <Switch id="lockout-enabled" checked={settings.enabled} onCheckedChange={(v) => setSettings((s) => ({ ...s, enabled: v }))} />
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Each wrong password locks the account for an escalating duration. Admin/founder accounts are always exempt (they use wallet-signature sign-in instead). While locked, the account is redirected to the URL below (leave blank to just show a countdown).
        </p>

        <div className="space-y-2">
          <Label className="text-xs">Escalation durations (in order — 1st failure, 2nd, 3rd…)</Label>
          <div className="flex flex-wrap gap-2">
            {durationInputs.map((val, idx) => (
              <div key={idx} className="flex items-center gap-1">
                <Badge variant="outline" className="text-[10px] px-1.5">{idx + 1}</Badge>
                <Input
                  value={val}
                  onChange={(e) => updateDuration(idx, e.target.value)}
                  placeholder="e.g. 60s, 5m, 1h, 24h"
                  className="w-28 h-8 text-xs"
                />
                <button type="button" onClick={() => removeDuration(idx)} className="text-muted-foreground hover:text-destructive p-1">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
            <Button type="button" variant="outline" size="sm" className="h-8 gap-1 text-xs" onClick={addDuration}>
              <Plus className="h-3.5 w-3.5" /> Add step
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Preview: {durationInputs.map(parseDurationInput).filter((n) => n > 0).map(formatDuration).join(' → ') || '—'} (last value repeats for further failures)
          </p>
        </div>

        <div className="space-y-2">
          <Label className="text-xs">Redirect URL while locked out (optional)</Label>
          <Input
            value={redirectInput}
            onChange={(e) => setRedirectInput(e.target.value)}
            placeholder="https://example.com/locked or /locked-out"
            className="text-xs h-8"
          />
        </div>

        <Button onClick={handleSave} disabled={saving} size="sm" className="gap-1.5">
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
          Save Settings
        </Button>
      </div>

      <div className="p-4 rounded-lg border border-border/50 bg-secondary/10 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Lock className="h-4 w-4 text-destructive" />
            <h4 className="text-sm font-semibold">Active Lockouts ({lockouts.length})</h4>
          </div>
          <Button variant="outline" size="sm" className="h-7 gap-1 text-xs" onClick={loadLockouts} disabled={lockoutsLoading}>
            <RefreshCw className={`h-3 w-3 ${lockoutsLoading ? 'animate-spin' : ''}`} /> Refresh
          </Button>
        </div>
        {lockouts.length === 0 ? (
          <p className="text-xs text-muted-foreground py-4 text-center">No accounts currently locked out.</p>
        ) : (
          <div className="space-y-1.5">
            {lockouts.map((l) => (
              <div key={l.identifier} className="flex items-center justify-between p-2 rounded-md bg-background/50 border border-border/30 text-xs">
                <div className="flex items-center gap-2">
                  <span className="font-mono">{l.identifier}</span>
                  <Badge variant="outline" className="text-[10px]">strike {l.strikes}</Badge>
                  {l.lockedUntil && (
                    <span className="flex items-center gap-1 text-muted-foreground">
                      <Clock className="h-3 w-3" /> until {new Date(l.lockedUntil).toLocaleString()}
                    </span>
                  )}
                </div>
                <Button variant="ghost" size="sm" className="h-6 gap-1 text-[11px] text-primary" onClick={() => handleUnlock(l.identifier)}>
                  <Unlock className="h-3 w-3" /> Unlock
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
