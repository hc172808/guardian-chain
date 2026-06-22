import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { GlassCard } from '@/components/ui/GlassCard';
import {
  CheckCircle2, Circle, ChevronRight, ChevronLeft, RefreshCw,
  Globe, Database, Shield, Bell, Github, Eye, EyeOff,
  Zap, Check, AlertTriangle, Loader2, Terminal, Copy
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

const API = (path: string, opts?: RequestInit) =>
  fetch(path, { credentials: 'include', ...opts });

type StepId = 'welcome' | 'domain' | 'database' | 'security' | 'notifications' | 'github' | 'review';

interface Step {
  id: StepId;
  title: string;
  description: string;
  icon: React.ReactNode;
  optional?: boolean;
}

const STEPS: Step[] = [
  { id: 'welcome',       title: 'Welcome',            description: 'Get started with ChainCore setup',   icon: <Zap className="h-5 w-5" /> },
  { id: 'domain',        title: 'Domain & App',        description: 'Configure your domain and app URL',  icon: <Globe className="h-5 w-5" /> },
  { id: 'database',      title: 'Database',            description: 'PostgreSQL connection settings',     icon: <Database className="h-5 w-5" /> },
  { id: 'security',      title: 'Security',            description: 'Session secret & environment',       icon: <Shield className="h-5 w-5" /> },
  { id: 'notifications', title: 'Notifications',       description: 'Telegram & email (optional)',        icon: <Bell className="h-5 w-5" />, optional: true },
  { id: 'github',        title: 'GitHub Webhook',      description: 'Auto-deploy on push (optional)',     icon: <Github className="h-5 w-5" />, optional: true },
  { id: 'review',        title: 'Review & Save',       description: 'Confirm and write to .env',          icon: <CheckCircle2 className="h-5 w-5" /> },
];

interface FormValues {
  APP_URL: string;
  DOMAIN: string;
  SUBDOMAIN: string;
  PORT: string;
  NODE_ENV: string;
  DATABASE_URL: string;
  SESSION_SECRET: string;
  SMTP_HOST: string;
  SMTP_PORT: string;
  SMTP_USER: string;
  SMTP_PASS: string;
  SMTP_FROM: string;
  TELEGRAM_BOT_TOKEN: string;
  TELEGRAM_CHAT_ID: string;
  GITHUB_WEBHOOK_SECRET: string;
}

const DEFAULT: FormValues = {
  APP_URL: '', DOMAIN: '', SUBDOMAIN: '', PORT: '5001', NODE_ENV: 'production',
  DATABASE_URL: '', SESSION_SECRET: '',
  SMTP_HOST: '', SMTP_PORT: '587', SMTP_USER: '', SMTP_PASS: '', SMTP_FROM: '',
  TELEGRAM_BOT_TOKEN: '', TELEGRAM_CHAT_ID: '',
  GITHUB_WEBHOOK_SECRET: '',
};

function PasswordInput({ value, onChange, placeholder, id }: {
  value: string; onChange: (v: string) => void; placeholder?: string; id?: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Input
        id={id}
        type={show ? 'text' : 'password'}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="pr-10 font-mono"
      />
      <button
        type="button"
        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
        onClick={() => setShow(s => !s)}
      >
        {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm font-medium">{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="ml-2 text-muted-foreground hover:text-foreground"
      onClick={() => { navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
    >
      {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  );
}

export default function SetupPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [stepIdx, setStepIdx] = useState(0);
  const [values, setValues] = useState<FormValues>(DEFAULT);
  const [keysSet, setKeysSet] = useState<Record<string, boolean>>({});
  const [dbTesting, setDbTesting] = useState(false);
  const [dbStatus, setDbStatus] = useState<{ ok: boolean; message: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [generatingSecret, setGeneratingSecret] = useState<string | null>(null);

  const set = (key: keyof FormValues) => (v: string) => setValues(prev => ({ ...prev, [key]: v }));

  useEffect(() => {
    API('/api/setup/status').then(r => r.ok ? r.json() : null).then(data => {
      if (!data) return;
      const v: Partial<FormValues> = {};
      for (const [k, val] of Object.entries(data.values ?? {})) {
        if (k in DEFAULT && typeof val === 'string' && val && !val.startsWith('••')) {
          (v as any)[k] = val;
        }
      }
      setValues(prev => ({ ...prev, ...v }));
      setKeysSet(data.keysSet ?? {});
    }).catch(() => {});
  }, []);

  const currentStep = STEPS[stepIdx];

  const generateSecret = async (key: keyof FormValues) => {
    setGeneratingSecret(key);
    try {
      const r = await API('/api/setup/generate-secret', { method: 'POST' });
      const { value } = await r.json();
      setValues(prev => ({ ...prev, [key]: value }));
    } finally {
      setGeneratingSecret(null);
    }
  };

  const testDatabase = async () => {
    if (!values.DATABASE_URL) { setDbStatus({ ok: false, message: 'Enter a DATABASE_URL first' }); return; }
    setDbTesting(true);
    setDbStatus(null);
    try {
      const r = await API('/api/setup/test-db', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: values.DATABASE_URL }),
      });
      const data = await r.json();
      setDbStatus({ ok: data.ok, message: data.ok ? `Connected — ${data.version}` : data.error });
    } catch (e: any) {
      setDbStatus({ ok: false, message: e.message });
    } finally {
      setDbTesting(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const r = await API('/api/setup/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      });
      const data = await r.json();
      if (!data.ok) throw new Error(data.error ?? 'Save failed');
      setSaved(true);
      toast({ title: 'Setup complete!', description: `${data.saved.length} settings saved to .env` });
    } catch (e: any) {
      toast({ title: 'Save failed', description: e.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  if (!user || !['admin', 'founder'].includes((user as any).role)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <GlassCard className="p-8 text-center max-w-md">
          <AlertTriangle className="h-12 w-12 text-amber-400 mx-auto mb-4" />
          <h2 className="text-xl font-bold mb-2">Admin Access Required</h2>
          <p className="text-muted-foreground mb-4">You need admin or founder role to access the setup wizard.</p>
          <Button onClick={() => navigate('/auth')}>Sign In</Button>
        </GlassCard>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <div className="border-b border-border bg-card/50 backdrop-blur px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/20">
            <Terminal className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="font-bold text-lg">ChainCore Setup Wizard</h1>
            <p className="text-xs text-muted-foreground">Configure your deployment settings</p>
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={() => navigate('/admin')}>Exit to Admin</Button>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar steps */}
        <div className="w-64 border-r border-border bg-card/30 p-4 space-y-1 hidden md:block">
          {STEPS.map((step, i) => {
            const done = i < stepIdx;
            const active = i === stepIdx;
            return (
              <button
                key={step.id}
                onClick={() => setStepIdx(i)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors text-sm
                  ${active ? 'bg-primary/20 text-primary' : done ? 'text-muted-foreground hover:bg-secondary/50' : 'text-muted-foreground hover:bg-secondary/30'}`}
              >
                <span className={`shrink-0 ${done ? 'text-emerald-400' : active ? 'text-primary' : 'text-muted-foreground'}`}>
                  {done ? <CheckCircle2 className="h-5 w-5" /> : <Circle className="h-5 w-5" />}
                </span>
                <span className="flex-1 font-medium">{step.title}</span>
                {step.optional && <Badge variant="outline" className="text-xs py-0 px-1">opt</Badge>}
              </button>
            );
          })}

          {/* Progress */}
          <div className="pt-4 px-3">
            <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
              <div
                className="h-full bg-primary transition-all duration-500 rounded-full"
                style={{ width: `${(stepIdx / (STEPS.length - 1)) * 100}%` }}
              />
            </div>
            <p className="text-xs text-muted-foreground mt-1.5">Step {stepIdx + 1} of {STEPS.length}</p>
          </div>
        </div>

        {/* Main content */}
        <div className="flex-1 overflow-y-auto p-6">
          <AnimatePresence mode="wait">
            <motion.div
              key={currentStep.id}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2 }}
              className="max-w-2xl mx-auto space-y-6"
            >
              {/* Step header */}
              <div className="flex items-center gap-4">
                <div className="p-3 rounded-xl bg-primary/20 text-primary">{currentStep.icon}</div>
                <div>
                  <h2 className="text-2xl font-bold">{currentStep.title}</h2>
                  <p className="text-muted-foreground">{currentStep.description}</p>
                </div>
              </div>

              {/* ── Welcome ── */}
              {currentStep.id === 'welcome' && (
                <GlassCard className="p-6 space-y-6">
                  <div className="p-4 rounded-lg bg-primary/10 border border-primary/30">
                    <h3 className="font-semibold text-primary mb-2">What this wizard does</h3>
                    <p className="text-sm text-muted-foreground">
                      This wizard walks you through every configuration option for ChainCore.
                      When you click <strong>Save</strong> at the end, all your settings are written directly
                      to your <code className="bg-secondary px-1 rounded">.env</code> file — no manual editing needed.
                    </p>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {[
                      { label: 'Domain & URL', desc: 'Your app domain and public URL' },
                      { label: 'Database', desc: 'PostgreSQL connection string' },
                      { label: 'Security', desc: 'Session secret & environment mode' },
                      { label: 'Notifications', desc: 'Telegram & SMTP email (optional)' },
                      { label: 'GitHub Webhook', desc: 'Auto-deploy on git push (optional)' },
                      { label: 'Review & Save', desc: 'Write everything to .env' },
                    ].map(item => (
                      <div key={item.label} className="flex items-start gap-2 p-3 rounded-lg bg-secondary/30">
                        <CheckCircle2 className="h-4 w-4 text-emerald-400 mt-0.5 shrink-0" />
                        <div>
                          <p className="text-sm font-medium">{item.label}</p>
                          <p className="text-xs text-muted-foreground">{item.desc}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 flex gap-3">
                    <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
                    <p className="text-xs text-muted-foreground">
                      Your <code>.env</code> file is only accessible to server admins. It is not exposed to the browser.
                      Values marked <Badge variant="outline" className="text-xs py-0 px-1">opt</Badge> are optional — you can skip those steps.
                    </p>
                  </div>
                </GlassCard>
              )}

              {/* ── Domain ── */}
              {currentStep.id === 'domain' && (
                <GlassCard className="p-6 space-y-5">
                  <Field label="App URL" hint="The full public URL of your dashboard (used in emails and links)">
                    <Input value={values.APP_URL} onChange={e => set('APP_URL')(e.target.value)}
                      placeholder="https://app.netlifegy.com" />
                  </Field>
                  <Field label="Domain" hint="Your root domain (e.g. netlifegy.com)">
                    <Input value={values.DOMAIN} onChange={e => set('DOMAIN')(e.target.value)}
                      placeholder="netlifegy.com" />
                  </Field>
                  <Field label="Subdomain" hint="Leave blank if your app is on the root domain">
                    <Input value={values.SUBDOMAIN} onChange={e => set('SUBDOMAIN')(e.target.value)}
                      placeholder="app  (gives app.netlifegy.com)" />
                  </Field>
                  <Field label="API Port" hint="Port the Express server listens on (default 5001)">
                    <Input value={values.PORT} onChange={e => set('PORT')(e.target.value)}
                      placeholder="5001" className="font-mono" />
                  </Field>
                  <Field label="Node Environment">
                    <div className="flex gap-2">
                      {['production', 'development'].map(env => (
                        <button
                          key={env}
                          type="button"
                          onClick={() => set('NODE_ENV')(env)}
                          className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors
                            ${values.NODE_ENV === env
                              ? 'bg-primary/20 border-primary/50 text-primary'
                              : 'bg-secondary/30 border-border text-muted-foreground hover:bg-secondary/50'}`}
                        >
                          {env}
                        </button>
                      ))}
                    </div>
                  </Field>
                </GlassCard>
              )}

              {/* ── Database ── */}
              {currentStep.id === 'database' && (
                <GlassCard className="p-6 space-y-5">
                  <Field
                    label="DATABASE_URL"
                    hint="PostgreSQL connection string. Format: postgresql://user:pass@host:5432/dbname"
                  >
                    <PasswordInput
                      id="db-url"
                      value={values.DATABASE_URL}
                      onChange={set('DATABASE_URL')}
                      placeholder="postgresql://user:pass@localhost:5432/gydschain"
                    />
                  </Field>

                  {keysSet.DATABASE_URL && !values.DATABASE_URL && (
                    <div className="flex items-center gap-2 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30">
                      <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                      <p className="text-sm text-emerald-300">A DATABASE_URL is already configured. Leave blank to keep it.</p>
                    </div>
                  )}

                  <Button
                    variant="outline"
                    onClick={testDatabase}
                    disabled={dbTesting || (!values.DATABASE_URL && !keysSet.DATABASE_URL)}
                    className="gap-2"
                  >
                    {dbTesting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Database className="h-4 w-4" />}
                    Test Connection
                  </Button>

                  {dbStatus && (
                    <div className={`flex items-center gap-2 p-3 rounded-lg ${dbStatus.ok
                      ? 'bg-emerald-500/10 border border-emerald-500/30'
                      : 'bg-red-500/10 border border-red-500/30'}`}>
                      {dbStatus.ok
                        ? <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                        : <AlertTriangle className="h-4 w-4 text-red-400 shrink-0" />}
                      <p className={`text-sm ${dbStatus.ok ? 'text-emerald-300' : 'text-red-300'}`}>{dbStatus.message}</p>
                    </div>
                  )}

                  <div className="p-3 rounded-lg bg-secondary/30 text-xs text-muted-foreground space-y-1">
                    <p className="font-medium text-foreground">On Replit</p>
                    <p>Your DATABASE_URL is managed automatically. You don't need to change it here unless deploying to your own server.</p>
                  </div>
                </GlassCard>
              )}

              {/* ── Security ── */}
              {currentStep.id === 'security' && (
                <GlassCard className="p-6 space-y-5">
                  <Field
                    label="SESSION_SECRET"
                    hint="Random 64-character hex string used to sign session cookies. Never share this."
                  >
                    <div className="flex gap-2">
                      <div className="flex-1">
                        <PasswordInput
                          value={values.SESSION_SECRET}
                          onChange={set('SESSION_SECRET')}
                          placeholder="64-character hex string"
                        />
                      </div>
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => generateSecret('SESSION_SECRET')}
                        disabled={generatingSecret === 'SESSION_SECRET'}
                        title="Auto-generate"
                      >
                        {generatingSecret === 'SESSION_SECRET'
                          ? <Loader2 className="h-4 w-4 animate-spin" />
                          : <RefreshCw className="h-4 w-4" />}
                      </Button>
                    </div>
                  </Field>

                  {keysSet.SESSION_SECRET && !values.SESSION_SECRET && (
                    <div className="flex items-center gap-2 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30">
                      <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                      <p className="text-sm text-emerald-300">A SESSION_SECRET is already set. Leave blank to keep it.</p>
                    </div>
                  )}

                  <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30">
                    <p className="text-xs text-amber-300">
                      Changing your SESSION_SECRET will invalidate all existing user sessions — everyone will be logged out.
                      Only change it if you believe your current secret is compromised.
                    </p>
                  </div>
                </GlassCard>
              )}

              {/* ── Notifications ── */}
              {currentStep.id === 'notifications' && (
                <div className="space-y-4">
                  <GlassCard className="p-6 space-y-5">
                    <h3 className="font-semibold flex items-center gap-2">
                      <span className="text-blue-400">Telegram Bot</span>
                      <Badge variant="outline" className="text-xs">optional</Badge>
                    </h3>
                    <Field label="Bot Token" hint="From @BotFather on Telegram">
                      <PasswordInput
                        value={values.TELEGRAM_BOT_TOKEN}
                        onChange={set('TELEGRAM_BOT_TOKEN')}
                        placeholder="123456789:ABCdefGHIjklMNOpqrSTUvwxYZ"
                      />
                    </Field>
                    <Field label="Chat ID" hint="Your Telegram user ID or group ID to receive alerts">
                      <Input value={values.TELEGRAM_CHAT_ID} onChange={e => set('TELEGRAM_CHAT_ID')(e.target.value)}
                        placeholder="-100123456789" className="font-mono" />
                    </Field>
                    {keysSet.TELEGRAM_BOT_TOKEN && !values.TELEGRAM_BOT_TOKEN && (
                      <div className="flex items-center gap-2 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30">
                        <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                        <p className="text-sm text-emerald-300">Telegram bot token already configured.</p>
                      </div>
                    )}
                  </GlassCard>

                  <GlassCard className="p-6 space-y-5">
                    <h3 className="font-semibold flex items-center gap-2">
                      <span className="text-purple-400">SMTP Email</span>
                      <Badge variant="outline" className="text-xs">optional</Badge>
                    </h3>
                    <div className="grid grid-cols-2 gap-4">
                      <Field label="SMTP Host">
                        <Input value={values.SMTP_HOST} onChange={e => set('SMTP_HOST')(e.target.value)}
                          placeholder="smtp.gmail.com" />
                      </Field>
                      <Field label="SMTP Port">
                        <Input value={values.SMTP_PORT} onChange={e => set('SMTP_PORT')(e.target.value)}
                          placeholder="587" className="font-mono" />
                      </Field>
                    </div>
                    <Field label="SMTP Username">
                      <Input value={values.SMTP_USER} onChange={e => set('SMTP_USER')(e.target.value)}
                        placeholder="you@gmail.com" />
                    </Field>
                    <Field label="SMTP Password">
                      <PasswordInput value={values.SMTP_PASS} onChange={set('SMTP_PASS')}
                        placeholder="App password (not your login password)" />
                    </Field>
                    <Field label="From Address" hint="Email address shown as the sender">
                      <Input value={values.SMTP_FROM} onChange={e => set('SMTP_FROM')(e.target.value)}
                        placeholder="noreply@netlifegy.com" />
                    </Field>
                    {keysSet.SMTP_PASS && !values.SMTP_PASS && (
                      <div className="flex items-center gap-2 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30">
                        <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                        <p className="text-sm text-emerald-300">SMTP password already configured.</p>
                      </div>
                    )}
                  </GlassCard>
                </div>
              )}

              {/* ── GitHub Webhook ── */}
              {currentStep.id === 'github' && (
                <GlassCard className="p-6 space-y-5">
                  <Field
                    label="GITHUB_WEBHOOK_SECRET"
                    hint="A random secret you set in both GitHub and here. Used to verify incoming webhook payloads."
                  >
                    <div className="flex gap-2">
                      <div className="flex-1">
                        <PasswordInput
                          value={values.GITHUB_WEBHOOK_SECRET}
                          onChange={set('GITHUB_WEBHOOK_SECRET')}
                          placeholder="random-secret-string"
                        />
                      </div>
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => generateSecret('GITHUB_WEBHOOK_SECRET')}
                        disabled={generatingSecret === 'GITHUB_WEBHOOK_SECRET'}
                        title="Auto-generate"
                      >
                        {generatingSecret === 'GITHUB_WEBHOOK_SECRET'
                          ? <Loader2 className="h-4 w-4 animate-spin" />
                          : <RefreshCw className="h-4 w-4" />}
                      </Button>
                    </div>
                  </Field>

                  <div className="p-4 rounded-lg bg-secondary/30 space-y-3">
                    <p className="text-sm font-medium">How to set up in GitHub</p>
                    <ol className="text-xs text-muted-foreground space-y-2 list-decimal list-inside">
                      <li>Go to your GitHub repo → <strong>Settings</strong> → <strong>Webhooks</strong> → <strong>Add webhook</strong></li>
                      <li>Payload URL: <code className="bg-background px-1 rounded">{values.APP_URL || 'https://your-domain.com'}/api/webhooks/github</code></li>
                      <li>Content type: <code className="bg-background px-1 rounded">application/json</code></li>
                      <li>Secret: paste the value you set above</li>
                      <li>Events: select <strong>Just the push event</strong></li>
                    </ol>
                  </div>
                </GlassCard>
              )}

              {/* ── Review & Save ── */}
              {currentStep.id === 'review' && (
                <div className="space-y-4">
                  <GlassCard className="p-6">
                    <h3 className="font-semibold mb-4">Settings to be saved to .env</h3>
                    <div className="space-y-2 text-sm font-mono">
                      {(Object.entries(values) as [keyof FormValues, string][])
                        .filter(([, v]) => v.trim())
                        .map(([k, v]) => {
                          const isSecret = ['DATABASE_URL', 'SESSION_SECRET', 'SMTP_PASS', 'TELEGRAM_BOT_TOKEN', 'GITHUB_WEBHOOK_SECRET'].includes(k);
                          const display = isSecret ? '••••••••' : v;
                          return (
                            <div key={k} className="flex items-center justify-between py-1.5 border-b border-border/30 last:border-0 gap-4">
                              <span className="text-muted-foreground shrink-0">{k}</span>
                              <div className="flex items-center gap-1 min-w-0">
                                <span className="text-foreground truncate">{display}</span>
                                {!isSecret && v && <CopyButton value={v} />}
                              </div>
                            </div>
                          );
                        })}
                      {Object.values(values).every(v => !v.trim()) && (
                        <p className="text-muted-foreground py-4 text-center">No values entered — nothing will be saved.</p>
                      )}
                    </div>
                  </GlassCard>

                  <GlassCard className="p-4 bg-blue-500/5 border-blue-500/20">
                    <div className="flex gap-3">
                      <Terminal className="h-4 w-4 text-blue-400 shrink-0 mt-0.5" />
                      <div className="text-xs text-muted-foreground space-y-1">
                        <p className="font-medium text-foreground">What happens when you save</p>
                        <p>• All filled-in values are written to your <code>.env</code> file</p>
                        <p>• Blank fields are skipped (existing values kept)</p>
                        <p>• Changes take effect immediately for most settings</p>
                        <p>• A server restart is needed for DATABASE_URL changes</p>
                      </div>
                    </div>
                  </GlassCard>

                  {saved ? (
                    <div className="flex flex-col items-center gap-4 py-6">
                      <div className="p-4 rounded-full bg-emerald-500/20">
                        <CheckCircle2 className="h-12 w-12 text-emerald-400" />
                      </div>
                      <h3 className="text-xl font-bold text-emerald-300">Setup Complete!</h3>
                      <p className="text-muted-foreground text-center max-w-sm">
                        Your settings have been saved to <code>.env</code>. The platform is ready to use.
                      </p>
                      <div className="flex gap-3">
                        <Button onClick={() => navigate('/admin')}>Go to Admin Panel</Button>
                        <Button variant="outline" onClick={() => navigate('/')}>Go to Dashboard</Button>
                      </div>
                    </div>
                  ) : (
                    <Button
                      size="lg"
                      className="w-full gap-2"
                      onClick={handleSave}
                      disabled={saving}
                    >
                      {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : <CheckCircle2 className="h-5 w-5" />}
                      {saving ? 'Saving...' : 'Save to .env & Complete Setup'}
                    </Button>
                  )}
                </div>
              )}

              {/* Navigation */}
              {!saved && (
                <div className="flex items-center justify-between pt-2">
                  <Button
                    variant="outline"
                    onClick={() => setStepIdx(i => Math.max(0, i - 1))}
                    disabled={stepIdx === 0}
                    className="gap-2"
                  >
                    <ChevronLeft className="h-4 w-4" /> Back
                  </Button>
                  <span className="text-xs text-muted-foreground md:hidden">
                    {stepIdx + 1} / {STEPS.length}
                  </span>
                  {stepIdx < STEPS.length - 1 && (
                    <Button
                      onClick={() => setStepIdx(i => Math.min(STEPS.length - 1, i + 1))}
                      className="gap-2"
                    >
                      {currentStep.optional ? 'Skip' : 'Next'} <ChevronRight className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
