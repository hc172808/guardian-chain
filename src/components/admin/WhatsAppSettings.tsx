import { useState, useEffect } from 'react';
import { GlassCard } from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import {
  MessageCircle, Save, RefreshCw, Send, Eye, EyeOff,
  CheckCircle2, XCircle, Info, ExternalLink
} from 'lucide-react';

interface WaConfig {
  enabled: boolean;
  phoneNumberId: string;
  accessTokenSet: boolean;
  accessTokenMasked: string;
  businessId: string;
}

export function WhatsAppSettings() {
  const { toast } = useToast();

  const [cfg, setCfg] = useState<WaConfig>({
    enabled: false,
    phoneNumberId: '',
    accessTokenSet: false,
    accessTokenMasked: '',
    businessId: '',
  });
  const [accessToken, setAccessToken] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [testNumber, setTestNumber] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/admin/whatsapp-config', { credentials: 'include' });
      if (r.ok) setCfg(await r.json());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const save = async () => {
    setSaving(true);
    try {
      const body: Record<string, any> = {
        enabled:       cfg.enabled,
        phoneNumberId: cfg.phoneNumberId,
        businessId:    cfg.businessId,
      };
      if (accessToken) body.accessToken = accessToken;

      const r = await fetch('/api/admin/whatsapp-config', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (r.ok) {
        toast({ title: 'Saved', description: 'WhatsApp configuration updated.' });
        setAccessToken('');
        load();
      } else {
        const e = await r.json();
        toast({ title: 'Error', description: e.error ?? 'Save failed', variant: 'destructive' });
      }
    } finally {
      setSaving(false);
    }
  };

  const test = async () => {
    if (!testNumber.trim()) {
      toast({ title: 'Enter a number', description: 'Provide a phone number to send the test message to.', variant: 'destructive' });
      return;
    }
    setTesting(true);
    try {
      const body: Record<string, any> = { to: testNumber.trim() };
      if (cfg.phoneNumberId) body.phoneNumberId = cfg.phoneNumberId;
      if (accessToken)       body.accessToken   = accessToken;

      const r = await fetch('/api/admin/whatsapp-test', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await r.json();
      if (data.ok) {
        toast({ title: '✅ Test sent!', description: `Message delivered. ID: ${data.messageId ?? '—'}` });
      } else {
        toast({ title: 'Test failed', description: data.error ?? 'Unknown error', variant: 'destructive' });
      }
    } finally {
      setTesting(false);
    }
  };

  if (loading) {
    return (
      <GlassCard className="p-6 flex items-center gap-3 text-muted-foreground">
        <RefreshCw className="w-4 h-4 animate-spin" /> Loading WhatsApp configuration…
      </GlassCard>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header card */}
      <GlassCard className="p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-green-500/10 border border-green-500/20 flex items-center justify-center shrink-0">
              <MessageCircle className="w-5 h-5 text-green-400" />
            </div>
            <div>
              <h2 className="font-semibold text-foreground flex items-center gap-2">
                WhatsApp Notifications
                <Badge variant={cfg.enabled ? 'default' : 'secondary'} className="text-[10px]">
                  {cfg.enabled ? 'Enabled' : 'Disabled'}
                </Badge>
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Uses the <strong>Meta WhatsApp Business Cloud API</strong>. Users with a WhatsApp number in their
                profile will receive alerts for faucet drips, governance votes, XP milestones, and more.
              </p>
            </div>
          </div>
          <Switch
            checked={cfg.enabled}
            onCheckedChange={v => setCfg(p => ({ ...p, enabled: v }))}
          />
        </div>
      </GlassCard>

      {/* Setup guide */}
      <GlassCard className="p-5 border-blue-500/20 bg-blue-500/5">
        <div className="flex gap-3">
          <Info className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
          <div className="space-y-2 text-xs text-muted-foreground">
            <p className="font-semibold text-blue-300">Setup (free tier available)</p>
            <ol className="list-decimal list-inside space-y-1">
              <li>Go to <a href="https://developers.facebook.com" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline inline-flex items-center gap-0.5">Meta for Developers <ExternalLink className="w-2.5 h-2.5" /></a> → create an app → add "WhatsApp" product</li>
              <li>In <strong>WhatsApp → Getting Started</strong> copy the <em>Phone Number ID</em> and temporary <em>Access Token</em></li>
              <li>For production: create a <strong>System User</strong> with <code>whatsapp_business_messaging</code> permission and generate a permanent token</li>
              <li>Paste credentials below, enable WhatsApp, save, then send a test message</li>
            </ol>
            <p className="text-amber-400/80">⚠️ Users must message your WhatsApp Business number first (within 24 h) OR use pre-approved message templates for the first outbound message.</p>
          </div>
        </div>
      </GlassCard>

      {/* Credentials */}
      <GlassCard className="p-6 space-y-4">
        <h3 className="text-sm font-semibold text-foreground">API Credentials</h3>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Phone Number ID</Label>
            <Input
              placeholder="e.g. 123456789012345"
              value={cfg.phoneNumberId}
              onChange={e => setCfg(p => ({ ...p, phoneNumberId: e.target.value }))}
            />
            <p className="text-[11px] text-muted-foreground">Found in WhatsApp → Getting Started in Meta App Dashboard</p>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Business Account ID (optional)</Label>
            <Input
              placeholder="e.g. 987654321098765"
              value={cfg.businessId}
              onChange={e => setCfg(p => ({ ...p, businessId: e.target.value }))}
            />
            <p className="text-[11px] text-muted-foreground">Your Meta Business Account ID</p>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">
            Access Token
            {cfg.accessTokenSet && (
              <span className="ml-2 text-emerald-400 inline-flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" /> Token saved
              </span>
            )}
          </Label>
          <div className="relative">
            <Input
              type={showToken ? 'text' : 'password'}
              placeholder={cfg.accessTokenSet ? cfg.accessTokenMasked || 'Leave blank to keep current token' : 'Paste your access token here'}
              value={accessToken}
              onChange={e => setAccessToken(e.target.value)}
              className="pr-10"
            />
            <button
              type="button"
              onClick={() => setShowToken(v => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Leave blank to keep the current token. Token is stored encrypted — never returned in full.
          </p>
        </div>

        <Button onClick={save} disabled={saving} className="gap-2">
          {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Save Configuration
        </Button>
      </GlassCard>

      {/* Test message */}
      <GlassCard className="p-6 space-y-4">
        <h3 className="text-sm font-semibold text-foreground">Send Test Message</h3>
        <p className="text-xs text-muted-foreground">
          Send a test WhatsApp message to verify the integration works. Use international format (digits only, e.g. <code>14155552671</code>).
        </p>
        <div className="flex gap-2">
          <Input
            placeholder="e.g. 447911123456"
            value={testNumber}
            onChange={e => setTestNumber(e.target.value)}
            className="flex-1"
          />
          <Button onClick={test} disabled={testing || (!cfg.accessTokenSet && !accessToken)} className="gap-2 whitespace-nowrap">
            {testing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            Send Test
          </Button>
        </div>
        {!cfg.accessTokenSet && !accessToken && (
          <p className="text-xs text-amber-400/80 flex items-center gap-1">
            <XCircle className="w-3 h-3" /> Save your access token first before testing.
          </p>
        )}
      </GlassCard>

      {/* How users connect */}
      <GlassCard className="p-5 space-y-3">
        <h3 className="text-sm font-semibold text-foreground">How Users Connect</h3>
        <div className="space-y-2 text-xs text-muted-foreground">
          <p>Once enabled, users see a <strong>WhatsApp Alerts</strong> section in their <strong>Profile → Notifications</strong> tab where they can:</p>
          <ul className="list-disc list-inside space-y-1 ml-2">
            <li>Enter their WhatsApp phone number (international format)</li>
            <li>Toggle WhatsApp alerts on/off independently</li>
            <li>Send themselves a test message to verify it works</li>
          </ul>
          <p>Alerts are sent automatically for: <strong>faucet drips</strong>, <strong>governance votes</strong>, <strong>XP milestones</strong>, <strong>staking events</strong>, and <strong>node alerts</strong>.</p>
        </div>
      </GlassCard>
    </div>
  );
}
