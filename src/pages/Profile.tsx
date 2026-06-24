import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Layout } from '@/components/layout/Layout';
import { GlassCard } from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import {
  User, Mail, Globe, MapPin, Clock, Bell,
  Shield, Lock, Save, RefreshCw, CheckCircle2,
  Phone, FileText, Palette, Eye, EyeOff, Trophy,
  Fingerprint, Smartphone, Send as SendIcon,
  Key, Download, Copy, AlertTriangle
} from 'lucide-react';
import {
  isBiometricAvailable,
  isBiometricEnabled,
  registerBiometric,
  disableBiometric,
} from '@/lib/biometric';
import { useNavigate } from 'react-router-dom';
import { AchievementBadges } from '@/components/profile/AchievementBadges';

interface ProfileData {
  display_name: string;
  username: string;
  bio: string;
  avatar_url: string;
  locale: string;
  timezone: string;
  notification_prefs: {
    email: boolean;
    push: boolean;
    sms: boolean;
    whatsapp: boolean;
    price_alerts: boolean;
    tx_confirmed: boolean;
    node_status: boolean;
    governance: boolean;
    announcements: boolean;
  };
  metadata: {
    phone?: string;
    location?: string;
    website?: string;
    twitter?: string;
    telegram?: string;
    whatsapp_number?: string;
    occupation?: string;
    theme?: string;
  };
}

// ── Privacy Toggle ────────────────────────────────────────────────────────────
const PrivacyToggle = () => {
  const { toast } = useToast();
  const [isPublic, setIsPublic] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch('/api/profile/privacy', { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setIsPublic(d.is_public ?? false); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const toggle = async () => {
    setSaving(true);
    try {
      const next = !isPublic;
      const r = await fetch('/api/profile/privacy', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_public: next }),
      });
      if (!r.ok) throw new Error('Failed to update privacy setting');
      setIsPublic(next);
      toast({ title: next ? 'Profile is now public' : 'Profile is now private', description: next ? 'Others can view your public profile.' : 'Only you can see your profile.' });
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally { setSaving(false); }
  };

  return (
    <GlassCard className={`p-4 border transition-colors ${isPublic ? 'border-green-500/30 bg-green-500/5' : 'border-primary/20 bg-primary/5'}`}>
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          {isPublic ? <Eye className="w-4 h-4 text-green-400 mt-0.5 shrink-0" /> : <EyeOff className="w-4 h-4 text-primary mt-0.5 shrink-0" />}
          <div>
            <p className="font-medium text-foreground text-sm">
              {loading ? 'Loading…' : isPublic ? 'Profile is Public' : 'Profile is Private'}
            </p>
            <p className="text-muted-foreground text-xs mt-0.5">
              {isPublic
                ? 'Your display name, bio, and wallet address are visible to other users.'
                : 'Your profile is hidden from everyone. Only you can see it.'}
            </p>
          </div>
        </div>
        <Switch checked={isPublic} onCheckedChange={toggle} disabled={loading || saving} className="shrink-0" />
      </div>
    </GlassCard>
  );
};

const TIMEZONES = [
  'UTC', 'America/New_York', 'America/Chicago', 'America/Denver',
  'America/Los_Angeles', 'Europe/London', 'Europe/Paris', 'Europe/Berlin',
  'Asia/Dubai', 'Asia/Karachi', 'Asia/Kolkata', 'Asia/Singapore',
  'Asia/Tokyo', 'Asia/Shanghai', 'Australia/Sydney', 'Pacific/Auckland',
];

const LOCALES = [
  { value: 'en', label: 'English' },
  { value: 'es', label: 'Español' },
  { value: 'fr', label: 'Français' },
  { value: 'de', label: 'Deutsch' },
  { value: 'ar', label: 'العربية' },
  { value: 'zh', label: '中文' },
  { value: 'ja', label: '日本語' },
  { value: 'ko', label: '한국어' },
  { value: 'pt', label: 'Português' },
  { value: 'ru', label: 'Русский' },
];

const THEMES = [
  { value: 'dark', label: 'Dark (default)' },
  { value: 'darker', label: 'Pitch Black' },
  { value: 'neon', label: 'Neon Glow' },
];

function ChangePasswordPanel() {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      toast({ title: 'Error', description: 'New passwords do not match', variant: 'destructive' });
      return;
    }
    if (newPassword.length < 6) {
      toast({ title: 'Error', description: 'Password must be at least 6 characters', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to change password');
      toast({ title: 'Password changed', description: 'Your password has been updated successfully.' });
      setCurrentPassword(''); setNewPassword(''); setConfirmPassword(''); setOpen(false);
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally { setSaving(false); }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between p-3 bg-muted/20 rounded-lg border border-border/30">
        <div>
          <p className="text-sm font-medium text-foreground">Password</p>
          <p className="text-xs text-muted-foreground">Change your login password</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setOpen(!open)}>
          {open ? 'Cancel' : 'Change'}
        </Button>
      </div>
      {open && (
        <form onSubmit={handleSubmit} className="p-3 bg-muted/10 rounded-lg border border-border/30 space-y-3">
          <div className="space-y-1">
            <Label className="text-xs">Current Password</Label>
            <Input type="password" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} required placeholder="Enter current password" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">New Password</Label>
            <Input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} required placeholder="At least 6 characters" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Confirm New Password</Label>
            <Input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} required placeholder="Repeat new password" />
          </div>
          <Button type="submit" size="sm" disabled={saving} className="w-full">
            {saving ? <><RefreshCw className="w-3 h-3 animate-spin mr-1" />Saving…</> : <><Lock className="w-3 h-3 mr-1" />Update Password</>}
          </Button>
        </form>
      )}
    </div>
  );
}

function WhatsAppTestPanel({ number }: { number: string }) {
  const { toast } = useToast();
  const [testing, setTesting] = useState(false);

  const sendTest = async () => {
    if (!number) {
      toast({ title: 'No number set', description: 'Add your WhatsApp number in the profile info tab first, then save.', variant: 'destructive' });
      return;
    }
    setTesting(true);
    try {
      const r = await fetch('/api/profile/whatsapp-test', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: number }),
      });
      const data = await r.json();
      if (data.ok) {
        toast({ title: '✅ Test sent!', description: 'A WhatsApp message was sent to your number.' });
      } else {
        toast({ title: 'Failed', description: data.error ?? 'Could not send test message.', variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Error', description: 'Network error — try again.', variant: 'destructive' });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="flex items-center justify-between p-3 rounded-lg bg-green-500/5 border border-green-500/20">
      <div>
        <p className="text-xs font-medium text-green-400 flex items-center gap-1">💬 WhatsApp connected</p>
        <p className="text-[11px] text-muted-foreground mt-0.5">
          {number ? `Sending to: +${number}` : 'No number set — add it in Profile Info tab'}
        </p>
      </div>
      <Button size="sm" variant="outline" onClick={sendTest} disabled={testing || !number} className="gap-1.5 text-xs border-green-500/30 text-green-400 hover:bg-green-500/10">
        {testing ? <RefreshCw className="w-3 h-3 animate-spin" /> : <SendIcon className="w-3 h-3" />}
        Test
      </Button>
    </div>
  );
}

const empty: ProfileData = {
  display_name: '',
  username: '',
  bio: '',
  avatar_url: '',
  locale: 'en',
  timezone: 'UTC',
  notification_prefs: {
    email: true,
    push: false,
    sms: false,
    price_alerts: true,
    tx_confirmed: true,
    node_status: true,
    governance: false,
    announcements: true,
  },
  metadata: {},
};

// ── Active Sessions Panel ───────────────────────────────────────────────────
interface SessionInfo {
  sid: string;
  expires: string;
  current: boolean;
  ua: string | null;
  ip: string | null;
  loginAt: string | null;
}

function parseUA(ua: string | null): string {
  if (!ua) return 'Unknown browser';
  if (ua.includes('Mobile') || ua.includes('Android') || ua.includes('iPhone')) {
    if (ua.includes('Chrome')) return '📱 Chrome Mobile';
    if (ua.includes('Safari')) return '📱 Safari Mobile';
    return '📱 Mobile Browser';
  }
  if (ua.includes('Chrome')) return '🖥️ Chrome';
  if (ua.includes('Firefox')) return '🦊 Firefox';
  if (ua.includes('Safari')) return '🧭 Safari';
  if (ua.includes('Edge')) return '🌐 Edge';
  if (ua.includes('curl') || ua.includes('python')) return '⚙️ API Client';
  return '🖥️ Browser';
}

const ActiveSessionsPanel = () => {
  const { toast } = useToast();
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [revoking, setRevoking] = useState<string | null>(null);

  const fetchSessions = async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/auth/sessions', { credentials: 'include' });
      if (r.ok) setSessions(await r.json());
    } catch {} finally { setLoading(false); }
  };

  useEffect(() => { fetchSessions(); }, []);

  const revoke = async (sid: string) => {
    setRevoking(sid);
    try {
      const r = await fetch(`/api/auth/sessions/${sid}`, { method: 'DELETE', credentials: 'include' });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? 'Failed');
      toast({ title: 'Session revoked', description: 'That device has been logged out.' });
      setSessions(s => s.filter(x => x.sid !== sid));
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally { setRevoking(null); }
  };

  return (
    <div className="p-3 bg-muted/20 rounded-lg border border-border/30 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-foreground flex items-center gap-2">
            <Smartphone className="w-3.5 h-3.5 text-primary" /> Active Sessions
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {loading ? 'Loading…' : `${sessions.length} active session${sessions.length !== 1 ? 's' : ''}`}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchSessions} disabled={loading}>
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      {!loading && sessions.length === 0 && (
        <p className="text-xs text-muted-foreground text-center py-2">No active sessions found.</p>
      )}

      {sessions.map(s => (
        <div key={s.sid} className={`flex items-start justify-between gap-3 p-2.5 rounded-lg border ${s.current ? 'border-primary/30 bg-primary/5' : 'border-border/30 bg-background/30'}`}>
          <div className="min-w-0">
            <p className="text-xs font-medium text-foreground flex items-center gap-1.5">
              {parseUA(s.ua)}
              {s.current && <span className="text-[10px] bg-primary/20 text-primary px-1.5 py-0.5 rounded-full font-semibold">This device</span>}
            </p>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              {s.ip && <span className="font-mono">{s.ip} · </span>}
              {s.loginAt ? `Logged in ${new Date(s.loginAt).toLocaleDateString()}` : `Expires ${new Date(s.expires).toLocaleDateString()}`}
            </p>
          </div>
          {!s.current && (
            <Button variant="destructive" size="sm" className="h-7 px-2.5 text-xs shrink-0"
              onClick={() => revoke(s.sid)} disabled={revoking === s.sid}>
              {revoking === s.sid ? <RefreshCw className="h-3 w-3 animate-spin" /> : 'Revoke'}
            </Button>
          )}
        </div>
      ))}

      {sessions.length > 1 && (
        <Button variant="outline" size="sm" className="w-full text-destructive hover:text-destructive gap-1.5"
          onClick={async () => {
            for (const s of sessions.filter(x => !x.current)) await revoke(s.sid);
          }}>
          Log Out All Other Sessions
        </Button>
      )}
    </div>
  );
};

// ── 2FA Backup Codes Panel ──────────────────────────────────────────────────
const BackupCodesPanel = () => {
  const { toast } = useToast();
  const [count, setCount] = useState<number | null>(null);
  const [codes, setCodes] = useState<string[]>([]);
  const [generating, setGenerating] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetch('/api/auth/totp/backup-codes', { credentials: 'include' })
      .then(r => r.json())
      .then(d => { if (typeof d.count === 'number') setCount(d.count); })
      .catch(() => {});
  }, []);

  const generate = async () => {
    setGenerating(true);
    try {
      const res = await fetch('/api/auth/totp/backup-codes/generate', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed');
      setCodes(data.codes ?? []);
      setCount(data.codes?.length ?? 8);
      setRevealed(true);
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally { setGenerating(false); }
  };

  const copyAll = () => {
    navigator.clipboard.writeText(codes.join('\n')).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const downloadTxt = () => {
    const blob = new Blob([
      'ChainCore — 2FA Backup Codes\n' +
      'Generated: ' + new Date().toISOString() + '\n\n' +
      'Each code can only be used ONCE.\n' +
      'Store these somewhere safe and private.\n\n' +
      codes.join('\n')
    ], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'chaincore-backup-codes.txt';
    a.click(); URL.revokeObjectURL(url);
  };

  return (
    <div className="p-3 bg-muted/20 rounded-lg border border-border/30 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-foreground flex items-center gap-2">
            <Key className="w-3.5 h-3.5 text-primary" /> 2FA Backup Codes
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {count === null ? 'Loading…' : count === 0 ? 'No codes — generate a set now' : `${count} code${count !== 1 ? 's' : ''} remaining`}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={generate} disabled={generating}>
          {generating ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Key className="h-3.5 w-3.5" />}
          <span className="ml-1.5">{count && count > 0 ? 'Regenerate' : 'Generate'}</span>
        </Button>
      </div>

      {/* Warning before regenerating */}
      {count !== null && count > 0 && !revealed && (
        <div className="flex items-start gap-2 p-2 rounded bg-amber-500/10 border border-amber-500/20 text-xs text-amber-300">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          <span>Regenerating will <strong>invalidate</strong> your current {count} remaining code{count !== 1 ? 's' : ''}.</span>
        </div>
      )}

      {/* Codes panel — shown only right after generation */}
      {revealed && codes.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-start gap-2 p-2 rounded bg-red-500/10 border border-red-500/20 text-xs text-red-300">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
            <span>Save these now — they will <strong>not</strong> be shown again. Each code is single-use.</span>
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            {codes.map((c, i) => (
              <code key={i} className="px-2 py-1.5 rounded bg-background border border-border/50 text-xs font-mono text-center tracking-widest text-foreground">{c}</code>
            ))}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="flex-1 gap-1.5" onClick={copyAll}>
              {copied ? <CheckCircle2 className="h-3.5 w-3.5 text-green-400" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? 'Copied!' : 'Copy All'}
            </Button>
            <Button variant="outline" size="sm" className="flex-1 gap-1.5" onClick={downloadTxt}>
              <Download className="h-3.5 w-3.5" /> Download .txt
            </Button>
          </div>
          <p className="text-[10px] text-muted-foreground text-center">Once you leave this page, these codes cannot be retrieved.</p>
        </div>
      )}
    </div>
  );
};

const ProfilePage = () => {
  const { user, roles, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [profile, setProfile] = useState<ProfileData>(empty);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [showEmail, setShowEmail] = useState(false);
  const [activeTab, setActiveTab] = useState<'info' | 'notifications' | 'security' | 'achievements'>('info');
  const [biometricAvail, setBiometricAvail] = useState(false);
  const [biometricOn, setBiometricOn] = useState(isBiometricEnabled());
  const [biometricLoading, setBiometricLoading] = useState(false);
  const [pushSubscribed, setPushSubscribed] = useState(false);
  const [pushLoading, setPushLoading] = useState(false);

  // Redirect to auth if not logged in
  useEffect(() => {
    if (!authLoading && !user) navigate('/auth');
  }, [user, authLoading, navigate]);

  // Biometric availability check + push subscription check
  useEffect(() => {
    isBiometricAvailable().then(setBiometricAvail);
    if ('serviceWorker' in navigator && 'PushManager' in window) {
      navigator.serviceWorker.ready.then(reg => {
        reg.pushManager.getSubscription().then(sub => setPushSubscribed(!!sub));
      }).catch(() => {});
    }
  }, []);

  const handleBiometricToggle = async () => {
    if (!user) return;
    setBiometricLoading(true);
    try {
      if (biometricOn) {
        disableBiometric();
        setBiometricOn(false);
        toast({ title: 'Biometric disabled', description: 'Face ID / fingerprint unlock removed.' });
      } else {
        const ok = await registerBiometric(user.id);
        if (ok) {
          setBiometricOn(true);
          toast({ title: 'Biometric enabled', description: 'Use Face ID or fingerprint to unlock your wallet.' });
        } else {
          toast({ title: 'Setup failed', description: 'Could not register biometric. Try again.', variant: 'destructive' });
        }
      }
    } finally {
      setBiometricLoading(false);
    }
  };

  const handlePushSubscribe = async () => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      toast({ title: 'Not supported', description: 'Push notifications require a modern browser.', variant: 'destructive' });
      return;
    }
    setPushLoading(true);
    try {
      const keyRes = await fetch('/api/push/vapid-key');
      const { publicKey } = await keyRes.json();
      if (!publicKey) throw new Error('VAPID key not available');
      const reg = await navigator.serviceWorker.ready;
      if (pushSubscribed) {
        const sub = await reg.pushManager.getSubscription();
        if (sub) {
          await sub.unsubscribe();
          await fetch('/api/push/subscribe', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ endpoint: sub.endpoint }) });
        }
        setPushSubscribed(false);
        toast({ title: 'Push disabled', description: 'You will no longer receive push notifications.' });
      } else {
        const sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: publicKey,
        });
        await fetch('/api/push/subscribe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ subscription: sub }) });
        setPushSubscribed(true);
        toast({ title: 'Push enabled', description: 'You will now receive browser push notifications.' });
      }
    } catch (e: any) {
      toast({ title: 'Push setup failed', description: e.message, variant: 'destructive' });
    } finally {
      setPushLoading(false);
    }
  };

  // Load profile from API
  useEffect(() => {
    if (!user) return;
    const load = async () => {
      setLoading(true);
      try {
        const data = await fetch('/api/profile').then(r => r.ok ? r.json() : null);
        if (data) {
          const prefs = (data.notification_prefs as any) ?? {};
          const meta  = (data.metadata as any) ?? {};
          setProfile({
            display_name: data.display_name ?? '',
            username:     data.username     ?? '',
            bio:          data.bio          ?? '',
            avatar_url:   data.avatar_url   ?? '',
            locale:       data.locale       ?? 'en',
            timezone:     data.timezone     ?? 'UTC',
            notification_prefs: {
              email:         prefs.email         ?? true,
              push:          prefs.push          ?? false,
              sms:           prefs.sms           ?? false,
              whatsapp:      prefs.whatsapp      ?? false,
              price_alerts:  prefs.price_alerts  ?? true,
              tx_confirmed:  prefs.tx_confirmed  ?? true,
              node_status:   prefs.node_status   ?? true,
              governance:    prefs.governance    ?? false,
              announcements: prefs.announcements ?? true,
            },
            metadata: {
              phone:            meta.phone            ?? '',
              location:         meta.location         ?? '',
              website:          meta.website          ?? '',
              twitter:          meta.twitter          ?? '',
              telegram:         meta.telegram         ?? '',
              whatsapp_number:  meta.whatsapp_number  ?? '',
              occupation:       meta.occupation       ?? '',
              theme:            meta.theme            ?? 'dark',
            },
          });
        }
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [user]);

  const save = async () => {
    if (!user) return;
    setSaving(true);

    try {
      const res = await fetch('/api/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          display_name:       profile.display_name.trim() || null,
          username:           profile.username.trim().toLowerCase() || null,
          bio:                profile.bio.trim() || null,
          avatar_url:         profile.avatar_url.trim() || null,
          locale:             profile.locale,
          timezone:           profile.timezone,
          notification_prefs: profile.notification_prefs,
          metadata:           profile.metadata,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: res.statusText }));
        if (res.status === 409) {
          toast({ title: 'Username taken', description: 'Please choose a different username.', variant: 'destructive' });
          setSaving(false);
          return;
        }
        throw new Error(err.message || 'Save failed');
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
      toast({ title: 'Profile saved', description: 'Your information has been updated.' });
    } catch (e: any) {
      toast({ title: 'Save failed', description: e.message, variant: 'destructive' });
    }
    setSaving(false);
  };

  const set = (key: keyof ProfileData, val: any) =>
    setProfile(p => ({ ...p, [key]: val }));

  const setMeta = (key: keyof ProfileData['metadata'], val: string) =>
    setProfile(p => ({ ...p, metadata: { ...p.metadata, [key]: val } }));

  const setNotif = (key: keyof ProfileData['notification_prefs'], val: boolean) =>
    setProfile(p => ({ ...p, notification_prefs: { ...p.notification_prefs, [key]: val } }));

  const displayRole = (roles ?? []).includes('founder') ? 'founder' : (roles ?? []).includes('admin') ? 'admin' : 'user';

  if (authLoading || loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-64">
          <RefreshCw className="w-6 h-6 animate-spin text-primary" />
        </div>
      </Layout>
    );
  }

  const tabs = [
    { key: 'info',          label: 'Profile Info',  icon: User   },
    { key: 'notifications', label: 'Notifications', icon: Bell   },
    { key: 'security',      label: 'Security',      icon: Shield },
    { key: 'achievements',  label: 'Achievements',  icon: Trophy },
  ] as const;

  return (
    <Layout>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-3xl mx-auto space-y-6"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <User className="w-6 h-6 text-primary" />
              My Profile
            </h1>
            <p className="text-muted-foreground text-sm mt-1 flex items-center gap-1.5">
              <Lock className="w-3 h-3" />
              Private — only you can see this information
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Badge variant="outline" className="capitalize text-xs">
              {displayRole}
            </Badge>
          </div>
        </div>

        {/* Privacy toggle */}
        <PrivacyToggle />

        {/* Tabs */}
        <div className="flex gap-1 p-1 bg-muted/30 rounded-xl border border-border/50">
          {tabs.map(t => (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-sm font-medium transition-all ${
                activeTab === t.key
                  ? 'bg-background text-foreground shadow-sm border border-border/50'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <t.icon className="w-4 h-4" />
              <span className="hidden sm:inline">{t.label}</span>
            </button>
          ))}
        </div>

        {/* ── TAB: Profile Info ── */}
        {activeTab === 'info' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
            <GlassCard className="p-6 space-y-5">
              <h2 className="font-semibold text-foreground flex items-center gap-2">
                <User className="w-4 h-4 text-primary" /> Account Details
              </h2>

              {/* Email (read-only, toggle visibility) */}
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground flex items-center gap-1">
                  <Mail className="w-3 h-3" /> Email Address
                </Label>
                <div className="flex gap-2">
                  <Input
                    value={showEmail ? (user?.email ?? '') : '••••••••••••'}
                    readOnly
                    className="bg-muted/30 text-muted-foreground font-mono text-sm"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => setShowEmail(v => !v)}
                    title={showEmail ? 'Hide email' : 'Show email'}
                  >
                    {showEmail ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">Email address cannot be changed here.</p>
              </div>

              {/* Display name */}
              <div className="space-y-1.5">
                <Label htmlFor="display_name" className="text-xs text-muted-foreground">
                  Display Name
                </Label>
                <Input
                  id="display_name"
                  placeholder="How you want to be called"
                  value={profile.display_name}
                  onChange={e => set('display_name', e.target.value)}
                  maxLength={60}
                />
              </div>

              {/* Username */}
              <div className="space-y-1.5">
                <Label htmlFor="username" className="text-xs text-muted-foreground">
                  Username
                </Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">@</span>
                  <Input
                    id="username"
                    placeholder="your_username"
                    value={profile.username}
                    onChange={e => set('username', e.target.value.replace(/[^a-z0-9_]/gi, '').toLowerCase())}
                    className="pl-7"
                    maxLength={30}
                  />
                </div>
                <p className="text-xs text-muted-foreground">Lowercase letters, numbers, underscores only.</p>
              </div>

              {/* Bio */}
              <div className="space-y-1.5">
                <Label htmlFor="bio" className="text-xs text-muted-foreground flex items-center gap-1">
                  <FileText className="w-3 h-3" /> Bio
                </Label>
                <Textarea
                  id="bio"
                  placeholder="Tell us a little about yourself…"
                  value={profile.bio}
                  onChange={e => set('bio', e.target.value)}
                  rows={3}
                  maxLength={300}
                />
                <p className="text-xs text-muted-foreground text-right">{profile.bio.length}/300</p>
              </div>

              {/* Avatar URL */}
              <div className="space-y-1.5">
                <Label htmlFor="avatar_url" className="text-xs text-muted-foreground">
                  Avatar URL
                </Label>
                <Input
                  id="avatar_url"
                  placeholder="https://example.com/your-photo.jpg"
                  value={profile.avatar_url}
                  onChange={e => set('avatar_url', e.target.value)}
                />
                {profile.avatar_url && (
                  <img
                    src={profile.avatar_url}
                    alt="Avatar preview"
                    className="w-12 h-12 rounded-full object-cover border border-border mt-1"
                    onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                  />
                )}
              </div>
            </GlassCard>

            <GlassCard className="p-6 space-y-5">
              <h2 className="font-semibold text-foreground flex items-center gap-2">
                <Globe className="w-4 h-4 text-primary" /> Personal Details
              </h2>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Phone */}
                <div className="space-y-1.5">
                  <Label htmlFor="phone" className="text-xs text-muted-foreground flex items-center gap-1">
                    <Phone className="w-3 h-3" /> Phone (private)
                  </Label>
                  <Input
                    id="phone"
                    placeholder="+1 555 000 0000"
                    value={profile.metadata.phone ?? ''}
                    onChange={e => setMeta('phone', e.target.value)}
                    maxLength={30}
                  />
                </div>

                {/* Location */}
                <div className="space-y-1.5">
                  <Label htmlFor="location" className="text-xs text-muted-foreground flex items-center gap-1">
                    <MapPin className="w-3 h-3" /> Location (private)
                  </Label>
                  <Input
                    id="location"
                    placeholder="City, Country"
                    value={profile.metadata.location ?? ''}
                    onChange={e => setMeta('location', e.target.value)}
                    maxLength={80}
                  />
                </div>

                {/* Occupation */}
                <div className="space-y-1.5">
                  <Label htmlFor="occupation" className="text-xs text-muted-foreground">
                    Occupation (private)
                  </Label>
                  <Input
                    id="occupation"
                    placeholder="Software engineer, Trader…"
                    value={profile.metadata.occupation ?? ''}
                    onChange={e => setMeta('occupation', e.target.value)}
                    maxLength={60}
                  />
                </div>

                {/* Website */}
                <div className="space-y-1.5">
                  <Label htmlFor="website" className="text-xs text-muted-foreground flex items-center gap-1">
                    <Globe className="w-3 h-3" /> Website (private)
                  </Label>
                  <Input
                    id="website"
                    placeholder="https://yoursite.com"
                    value={profile.metadata.website ?? ''}
                    onChange={e => setMeta('website', e.target.value)}
                    maxLength={100}
                  />
                </div>

                {/* Twitter */}
                <div className="space-y-1.5">
                  <Label htmlFor="twitter" className="text-xs text-muted-foreground">
                    Twitter / X (private)
                  </Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">@</span>
                    <Input
                      id="twitter"
                      placeholder="username"
                      value={profile.metadata.twitter ?? ''}
                      onChange={e => setMeta('twitter', e.target.value.replace('@', ''))}
                      className="pl-7"
                      maxLength={50}
                    />
                  </div>
                </div>

                {/* Telegram */}
                <div className="space-y-1.5">
                  <Label htmlFor="telegram" className="text-xs text-muted-foreground">
                    Telegram (private)
                  </Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">@</span>
                    <Input
                      id="telegram"
                      placeholder="username"
                      value={profile.metadata.telegram ?? ''}
                      onChange={e => setMeta('telegram', e.target.value.replace('@', ''))}
                      className="pl-7"
                      maxLength={50}
                    />
                  </div>
                </div>

                {/* WhatsApp */}
                <div className="space-y-1.5">
                  <Label htmlFor="whatsapp_number" className="text-xs text-muted-foreground flex items-center gap-1">
                    <Phone className="w-3 h-3 text-green-400" /> WhatsApp Number
                  </Label>
                  <Input
                    id="whatsapp_number"
                    placeholder="e.g. 14155552671 (international, digits only)"
                    value={profile.metadata.whatsapp_number ?? ''}
                    onChange={e => setMeta('whatsapp_number', e.target.value.replace(/[^\d]/g, ''))}
                    maxLength={15}
                  />
                  <p className="text-[11px] text-muted-foreground">Enter your number in international format without + or spaces. Used for WhatsApp alerts if enabled by admin.</p>
                </div>
              </div>
            </GlassCard>

            <GlassCard className="p-6 space-y-5">
              <h2 className="font-semibold text-foreground flex items-center gap-2">
                <Clock className="w-4 h-4 text-primary" /> Preferences
              </h2>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Language */}
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Language</Label>
                  <Select value={profile.locale} onValueChange={v => set('locale', v)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {LOCALES.map(l => (
                        <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Timezone */}
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Timezone</Label>
                  <Select value={profile.timezone} onValueChange={v => set('timezone', v)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="max-h-60">
                      {TIMEZONES.map(tz => (
                        <SelectItem key={tz} value={tz}>{tz}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Theme */}
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground flex items-center gap-1">
                    <Palette className="w-3 h-3" /> Theme
                  </Label>
                  <Select
                    value={profile.metadata.theme ?? 'dark'}
                    onValueChange={v => setMeta('theme', v)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {THEMES.map(t => (
                        <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </GlassCard>
          </motion.div>
        )}

        {/* ── TAB: Notifications ── */}
        {activeTab === 'notifications' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <GlassCard className="p-6 space-y-6">
              <h2 className="font-semibold text-foreground flex items-center gap-2">
                <Bell className="w-4 h-4 text-primary" /> Notification Preferences
              </h2>

              {/* Channels */}
              <div className="space-y-3">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Channels</p>
                {(
                  [
                    { key: 'email',    label: 'Email notifications', desc: 'Receive updates via email' },
                    { key: 'sms',      label: 'Telegram alerts',     desc: 'Get alerts via Telegram bot (@GYDSChainBot)' },
                    { key: 'whatsapp', label: 'WhatsApp alerts',     desc: 'Receive alerts on WhatsApp (requires number in profile)' },
                  ] as const
                ).map(n => (
                  <div key={n.key} className="flex items-center justify-between py-2 border-b border-border/30 last:border-0">
                    <div>
                      <p className="text-sm font-medium text-foreground flex items-center gap-1.5">
                        {n.key === 'whatsapp' && <span className="text-green-400">💬</span>}
                        {n.label}
                      </p>
                      <p className="text-xs text-muted-foreground">{n.desc}</p>
                    </div>
                    <Switch
                      checked={profile.notification_prefs[n.key]}
                      onCheckedChange={v => setNotif(n.key, v)}
                    />
                  </div>
                ))}

                {/* WhatsApp test + number display */}
                {profile.notification_prefs.whatsapp && (
                  <WhatsAppTestPanel
                    number={profile.metadata.whatsapp_number ?? ''}
                  />
                )}

                {/* Push notification subscribe */}
                <div className="flex items-center justify-between py-2 border-b border-border/30">
                  <div>
                    <p className="text-sm font-medium text-foreground flex items-center gap-2">
                      <Smartphone className="w-3.5 h-3.5 text-primary" />
                      Push notifications
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {pushSubscribed ? 'Browser push enabled — click to disable' : 'Enable browser / device push alerts'}
                    </p>
                  </div>
                  <button
                    onClick={handlePushSubscribe}
                    disabled={pushLoading}
                    className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-50 ${pushSubscribed ? 'bg-primary' : 'bg-input'}`}
                  >
                    <span className={`pointer-events-none block h-4 w-4 rounded-full bg-background shadow-lg ring-0 transition-transform ${pushSubscribed ? 'translate-x-4' : 'translate-x-0.5'}`} />
                  </button>
                </div>
              </div>

              {/* Event types */}
              <div className="space-y-3">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Event Types</p>
                {(
                  [
                    { key: 'price_alerts',  label: 'Price alerts',        desc: 'When a token hits your target price' },
                    { key: 'tx_confirmed',  label: 'Transaction confirmed',desc: 'When your transactions confirm' },
                    { key: 'node_status',   label: 'Node status changes',  desc: 'Node goes offline or comes back' },
                    { key: 'governance',    label: 'Governance activity',  desc: 'New proposals and vote results' },
                    { key: 'announcements', label: 'Network announcements', desc: 'Important platform updates' },
                  ] as const
                ).map(n => (
                  <div key={n.key} className="flex items-center justify-between py-2 border-b border-border/30 last:border-0">
                    <div>
                      <p className="text-sm font-medium text-foreground">{n.label}</p>
                      <p className="text-xs text-muted-foreground">{n.desc}</p>
                    </div>
                    <Switch
                      checked={profile.notification_prefs[n.key]}
                      onCheckedChange={v => setNotif(n.key, v)}
                    />
                  </div>
                ))}
              </div>
            </GlassCard>
          </motion.div>
        )}

        {/* ── TAB: Security ── */}
        {activeTab === 'security' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
            <GlassCard className="p-6 space-y-4">
              <h2 className="font-semibold text-foreground flex items-center gap-2">
                <Shield className="w-4 h-4 text-primary" /> Account Security
              </h2>

              <div className="space-y-3">
                <ChangePasswordPanel />


                <div className="flex items-center justify-between p-3 bg-muted/20 rounded-lg border border-border/30">
                  <div>
                    <p className="text-sm font-medium text-foreground">Two-Factor Authentication (TOTP)</p>
                    <p className="text-xs text-muted-foreground">Authenticate with Google Authenticator or similar</p>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => window.location.href = '/security'}>
                    Manage
                  </Button>
                </div>

                {/* 2FA Backup Codes */}
                <BackupCodesPanel />

                {/* Biometric unlock */}
                {biometricAvail && (
                  <div className="flex items-center justify-between p-3 bg-muted/20 rounded-lg border border-border/30">
                    <div>
                      <p className="text-sm font-medium text-foreground flex items-center gap-2">
                        <Fingerprint className="w-3.5 h-3.5 text-primary" />
                        Biometric Unlock
                      </p>
                      <p className="text-xs text-muted-foreground">Use Face ID or fingerprint to unlock wallet</p>
                    </div>
                    <button
                      onClick={handleBiometricToggle}
                      disabled={biometricLoading}
                      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-50 ${biometricOn ? 'bg-primary' : 'bg-input'}`}
                    >
                      <span className={`pointer-events-none block h-4 w-4 rounded-full bg-background shadow-lg ring-0 transition-transform ${biometricOn ? 'translate-x-4' : 'translate-x-0.5'}`} />
                    </button>
                  </div>
                )}

                <ActiveSessionsPanel />

                <div className="flex items-center justify-between p-3 bg-muted/20 rounded-lg border border-border/30">
                  <div>
                    <p className="text-sm font-medium text-foreground">Account Role</p>
                    <p className="text-xs text-muted-foreground">Your current permission level</p>
                  </div>
                  <Badge className="capitalize">{displayRole}</Badge>
                </div>

                <div className="flex items-center justify-between p-3 bg-muted/20 rounded-lg border border-border/30">
                  <div>
                    <p className="text-sm font-medium text-foreground">User ID</p>
                    <p className="text-xs text-muted-foreground font-mono break-all">{user?.id}</p>
                  </div>
                </div>

                <div className="flex items-center justify-between p-3 bg-muted/20 rounded-lg border border-border/30">
                  <div>
                    <p className="text-sm font-medium text-foreground">Account Created</p>
                    <p className="text-xs text-muted-foreground">
                      {user?.createdAt ? new Date(user.createdAt).toLocaleDateString() : '—'}
                    </p>
                  </div>
                </div>
              </div>
            </GlassCard>

            <GlassCard className="p-4 border-red-500/20 bg-red-500/5">
              <div className="flex items-start gap-3">
                <Shield className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-medium text-red-300">Data Privacy</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Your profile data is protected by Row-Level Security (RLS) in the database.
                    Only your own account can read or modify this information.
                    No other user, including admins, can view your personal details such as
                    phone, location, or social links.
                  </p>
                </div>
              </div>
            </GlassCard>
          </motion.div>
        )}

        {/* ── TAB: Achievements ── */}
        {activeTab === 'achievements' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <AchievementBadges />
          </motion.div>
        )}

        {/* Save button — only on info/notifications */}
        {activeTab !== 'security' && activeTab !== 'achievements' && (
          <div className="flex justify-end pb-8">
            <Button
              onClick={save}
              disabled={saving}
              className="min-w-32 gap-2"
            >
              {saving ? (
                <><RefreshCw className="w-4 h-4 animate-spin" /> Saving…</>
              ) : saved ? (
                <><CheckCircle2 className="w-4 h-4 text-green-400" /> Saved!</>
              ) : (
                <><Save className="w-4 h-4" /> Save Profile</>
              )}
            </Button>
          </div>
        )}
      </motion.div>
    </Layout>
  );
};

export default ProfilePage;
