import { useState, useEffect } from 'react';
import { GlassCard } from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import {
  Eye, EyeOff, Save, RefreshCw, CheckCircle2, AlertCircle,
  Wallet, KeyRound, MessageCircle, Mail, Globe, Zap, ChevronDown, ChevronRight
} from 'lucide-react';

const MASKED = '••••••••';

interface ConfigValues {
  ADMIN_WALLET: string;
  FOUNDER_WALLET: string;
  REWARD_ADDRESS: string;
  GITHUB_TOKEN: string;
  VITE_HCAPTCHA_SITE_KEY: string;
  HCAPTCHA_SECRET_KEY: string;
  TELEGRAM_BOT_TOKEN: string;
  TELEGRAM_CHAT_ID: string;
  SMTP_HOST: string;
  SMTP_PORT: string;
  SMTP_USER: string;
  SMTP_PASS: string;
  SMTP_FROM: string;
  WHATSAPP_TOKEN: string;
  WHATSAPP_PHONE_ID: string;
  GYDS_BOOTSTRAP_NODES: string;
}

const EMPTY: ConfigValues = {
  ADMIN_WALLET: '', FOUNDER_WALLET: '', REWARD_ADDRESS: '',
  GITHUB_TOKEN: '', VITE_HCAPTCHA_SITE_KEY: '', HCAPTCHA_SECRET_KEY: '',
  TELEGRAM_BOT_TOKEN: '', TELEGRAM_CHAT_ID: '',
  SMTP_HOST: '', SMTP_PORT: '587', SMTP_USER: '', SMTP_PASS: '', SMTP_FROM: '',
  WHATSAPP_TOKEN: '', WHATSAPP_PHONE_ID: '',
  GYDS_BOOTSTRAP_NODES: '',
};

const SECRET_KEYS: (keyof ConfigValues)[] = [
  'GITHUB_TOKEN', 'HCAPTCHA_SECRET_KEY', 'TELEGRAM_BOT_TOKEN', 'SMTP_PASS', 'WHATSAPP_TOKEN',
];

function SecretInput({
  id, value, onChange, placeholder,
}: { id: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  const [show, setShow] = useState(false);
  const masked = value === MASKED;
  return (
    <div className="relative">
      <Input
        id={id}
        type={show ? 'text' : 'password'}
        value={value}
        placeholder={placeholder ?? 'Enter value (leave blank to keep current)'}
        onChange={e => onChange(e.target.value)}
        className="pr-10 bg-black/20 border-border/40 font-mono text-sm"
      />
      <button
        type="button"
        onClick={() => setShow(s => !s)}
        className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
      >
        {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
      {masked && (
        <p className="text-xs text-amber-400 mt-1">Currently set — leave as-is to keep, or type a new value to replace.</p>
      )}
    </div>
  );
}

function Section({
  icon: Icon, title, desc, children, defaultOpen = true,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  desc: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <GlassCard className="overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-3 p-4 hover:bg-white/5 transition-colors text-left"
      >
        <div className="p-2 rounded-lg bg-primary/20 shrink-0">
          <Icon className="h-4 w-4 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm">{title}</p>
          <p className="text-xs text-muted-foreground">{desc}</p>
        </div>
        {open ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
      </button>
      {open && <div className="p-4 pt-0 space-y-4 border-t border-border/20">{children}</div>}
    </GlassCard>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function ServerConfigManager() {
  const { toast } = useToast();
  const [values, setValues] = useState<ConfigValues>(EMPTY);
  const [keysSet, setKeysSet] = useState<Partial<Record<keyof ConfigValues, boolean>>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [restartStatus, setRestartStatus] = useState<null | 'pending' | 'ok' | 'no-pm2'>(null);

  const set = (k: keyof ConfigValues) => (v: string) =>
    setValues(prev => ({ ...prev, [k]: v }));

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/server-config', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to load');
      const data = await res.json();
      setValues({ ...EMPTY, ...data.values });
      setKeysSet(data.keysSet ?? {});
    } catch {
      toast({ title: 'Failed to load config', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const save = async () => {
    setSaving(true);
    setRestartStatus(null);
    try {
      const payload: Record<string, string> = {};
      for (const [k, v] of Object.entries(values) as [keyof ConfigValues, string][]) {
        if (v && v !== MASKED) payload[k] = v;
      }
      const res = await fetch('/api/admin/server-config', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Save failed');
      setRestartStatus(data.restarted ? 'ok' : 'no-pm2');
      toast({ title: 'Configuration saved', description: data.restarted ? 'Service restarted via PM2.' : 'Changes applied. Manual restart may be needed for some vars.' });
      await load();
    } catch (e: any) {
      toast({ title: 'Save failed', description: e.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <GlassCard className="p-8 text-center">
        <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-2 text-primary" />
        <p className="text-sm text-muted-foreground">Loading configuration…</p>
      </GlassCard>
    );
  }

  return (
    <div className="space-y-4">
      <GlassCard className="p-5">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h2 className="text-lg font-bold flex items-center gap-2">
              <Zap className="h-5 w-5 text-primary" /> Server Configuration
            </h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              All changes are written to <code className="bg-black/30 px-1 rounded text-xs">.env</code> and
              {' '}<code className="bg-black/30 px-1 rounded text-xs">gyds-config.env</code>, then the service restarts automatically.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={load} disabled={loading}>
              <RefreshCw className="h-4 w-4 mr-1.5" /> Reload
            </Button>
            <Button size="sm" onClick={save} disabled={saving} className="gap-2 bg-primary hover:bg-primary/90">
              <Save className="h-4 w-4" />
              {saving ? 'Saving…' : 'Save & Apply'}
            </Button>
          </div>
        </div>

        {restartStatus && (
          <div className={`mt-4 flex items-center gap-2 p-3 rounded-lg text-sm ${
            restartStatus === 'ok'
              ? 'bg-green-500/10 text-green-400 border border-green-500/20'
              : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
          }`}>
            {restartStatus === 'ok'
              ? <><CheckCircle2 className="h-4 w-4 shrink-0" /> Saved and service restarted via PM2. Changes are live.</>
              : <><AlertCircle className="h-4 w-4 shrink-0" /> Saved to disk. PM2 not detected — run <code className="bg-black/20 px-1 rounded">pm2 restart gydschain-api</code> to apply.</>
            }
          </div>
        )}
      </GlassCard>

      <Section icon={Wallet} title="Wallets" desc="Admin, founder, and mining wallet addresses">
        <Field label="Admin Wallet" hint="Used for admin-level on-chain actions">
          <Input
            value={values.ADMIN_WALLET}
            onChange={e => set('ADMIN_WALLET')(e.target.value)}
            placeholder="0x..."
            className="bg-black/20 border-border/40 font-mono text-sm"
          />
        </Field>
        <Field label="Founder Wallet" hint="Founder identity wallet address">
          <Input
            value={values.FOUNDER_WALLET}
            onChange={e => set('FOUNDER_WALLET')(e.target.value)}
            placeholder="0x..."
            className="bg-black/20 border-border/40 font-mono text-sm"
          />
        </Field>
        <Field label="Mining / Reward Wallet" hint="Receives mining rewards and validator payouts (also exported as GYDS_MINING_WALLET)">
          <Input
            value={values.REWARD_ADDRESS}
            onChange={e => set('REWARD_ADDRESS')(e.target.value)}
            placeholder="0x..."
            className="bg-black/20 border-border/40 font-mono text-sm"
          />
        </Field>
      </Section>

      <Section icon={KeyRound} title="Auth & Captcha" desc="GitHub token and hCaptcha keys" defaultOpen={false}>
        <Field label="GitHub Personal Access Token" hint="Used by node install scripts to pull from private repos">
          <SecretInput
            id="GITHUB_TOKEN"
            value={values.GITHUB_TOKEN || (keysSet.GITHUB_TOKEN ? MASKED : '')}
            onChange={set('GITHUB_TOKEN')}
          />
        </Field>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="hCaptcha Site Key" hint="Public key sent to the browser (faucet protection)">
            <Input
              value={values.VITE_HCAPTCHA_SITE_KEY}
              onChange={e => set('VITE_HCAPTCHA_SITE_KEY')(e.target.value)}
              placeholder="10000000-ffff-ffff-ffff-000000000001"
              className="bg-black/20 border-border/40 font-mono text-sm"
            />
          </Field>
          <Field label="hCaptcha Secret Key" hint="Server-side verification key (never sent to client)">
            <SecretInput
              id="HCAPTCHA_SECRET_KEY"
              value={values.HCAPTCHA_SECRET_KEY || (keysSet.HCAPTCHA_SECRET_KEY ? MASKED : '')}
              onChange={set('HCAPTCHA_SECRET_KEY')}
            />
          </Field>
        </div>
      </Section>

      <Section icon={MessageCircle} title="Telegram Alerts" desc="Send admin alerts to a Telegram chat" defaultOpen={false}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Bot Token" hint="From @BotFather">
            <SecretInput
              id="TELEGRAM_BOT_TOKEN"
              value={values.TELEGRAM_BOT_TOKEN || (keysSet.TELEGRAM_BOT_TOKEN ? MASKED : '')}
              onChange={set('TELEGRAM_BOT_TOKEN')}
            />
          </Field>
          <Field label="Chat ID" hint="Numeric chat/group ID">
            <Input
              value={values.TELEGRAM_CHAT_ID}
              onChange={e => set('TELEGRAM_CHAT_ID')(e.target.value)}
              placeholder="-1001234567890"
              className="bg-black/20 border-border/40 font-mono text-sm"
            />
          </Field>
        </div>
      </Section>

      <Section icon={Mail} title="Email / SMTP" desc="Transactional email for verification, password reset, notifications" defaultOpen={false}>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Field label="SMTP Host">
            <Input
              value={values.SMTP_HOST}
              onChange={e => set('SMTP_HOST')(e.target.value)}
              placeholder="smtp.gmail.com"
              className="bg-black/20 border-border/40 font-mono text-sm"
            />
          </Field>
          <Field label="SMTP Port">
            <Input
              value={values.SMTP_PORT}
              onChange={e => set('SMTP_PORT')(e.target.value)}
              placeholder="587"
              className="bg-black/20 border-border/40 font-mono text-sm"
            />
          </Field>
          <Field label="From Address">
            <Input
              value={values.SMTP_FROM}
              onChange={e => set('SMTP_FROM')(e.target.value)}
              placeholder="no-reply@netlifegy.com"
              className="bg-black/20 border-border/40 font-mono text-sm"
            />
          </Field>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="SMTP Username">
            <Input
              value={values.SMTP_USER}
              onChange={e => set('SMTP_USER')(e.target.value)}
              placeholder="you@gmail.com"
              className="bg-black/20 border-border/40 font-mono text-sm"
            />
          </Field>
          <Field label="SMTP Password">
            <SecretInput
              id="SMTP_PASS"
              value={values.SMTP_PASS || (keysSet.SMTP_PASS ? MASKED : '')}
              onChange={set('SMTP_PASS')}
              placeholder="App password or SMTP password"
            />
          </Field>
        </div>
      </Section>

      <Section icon={MessageCircle} title="WhatsApp (Meta Business API)" desc="Send OTP codes and alerts via WhatsApp" defaultOpen={false}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="API Token" hint="Meta Cloud API permanent token">
            <SecretInput
              id="WHATSAPP_TOKEN"
              value={values.WHATSAPP_TOKEN || (keysSet.WHATSAPP_TOKEN ? MASKED : '')}
              onChange={set('WHATSAPP_TOKEN')}
            />
          </Field>
          <Field label="Phone Number ID" hint="From your Meta Business phone number">
            <Input
              value={values.WHATSAPP_PHONE_ID}
              onChange={e => set('WHATSAPP_PHONE_ID')(e.target.value)}
              placeholder="123456789012345"
              className="bg-black/20 border-border/40 font-mono text-sm"
            />
          </Field>
        </div>
      </Section>

      <Section icon={Globe} title="Network" desc="Bootstrap nodes for peer discovery" defaultOpen={false}>
        <Field label="Bootstrap Node(s)" hint="Comma-separated enode:// URIs. Written as GYDS_BOOTSTRAP_NODES in gyds-config.env for all node install scripts.">
          <Input
            value={values.GYDS_BOOTSTRAP_NODES}
            onChange={e => set('GYDS_BOOTSTRAP_NODES')(e.target.value)}
            placeholder="enode://abc123...@bootnode1.netlifegy.com:30303,enode://def456...@bootnode2.netlifegy.com:30303"
            className="bg-black/20 border-border/40 font-mono text-sm"
          />
        </Field>
      </Section>

      <GlassCard className="p-4 bg-secondary/10">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Currently Set</h3>
        <div className="flex flex-wrap gap-2">
          {(Object.entries(keysSet) as [keyof ConfigValues, boolean][]).map(([k, set]) => (
            set && (
              <Badge key={k} variant="outline" className="text-xs font-mono border-green-500/30 text-green-400 bg-green-500/5">
                {k}
              </Badge>
            )
          ))}
          {Object.values(keysSet).every(v => !v) && (
            <p className="text-xs text-muted-foreground">No optional config set yet. Fill in the fields above and click Save & Apply.</p>
          )}
        </div>
      </GlassCard>

      <div className="flex justify-end pt-2">
        <Button onClick={save} disabled={saving} size="lg" className="gap-2 bg-primary hover:bg-primary/90 min-w-[160px]">
          <Save className="h-4 w-4" />
          {saving ? 'Saving…' : 'Save & Apply'}
        </Button>
      </div>
    </div>
  );
}
