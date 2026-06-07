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
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import {
  User, Mail, Globe, MapPin, Clock, Bell,
  Shield, Lock, Save, RefreshCw, CheckCircle2,
  Phone, FileText, Palette, Eye, EyeOff
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

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
    occupation?: string;
    theme?: string;
  };
}

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

const ProfilePage = () => {
  const { user, roles, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [profile, setProfile] = useState<ProfileData>(empty);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [showEmail, setShowEmail] = useState(false);
  const [activeTab, setActiveTab] = useState<'info' | 'notifications' | 'security'>('info');

  // Redirect to auth if not logged in
  useEffect(() => {
    if (!authLoading && !user) navigate('/auth');
  }, [user, authLoading, navigate]);

  // Load profile from Supabase
  useEffect(() => {
    if (!user) return;
    const load = async () => {
      setLoading(true);
      const { data } = await supabase
        .from('profiles')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

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
            price_alerts:  prefs.price_alerts  ?? true,
            tx_confirmed:  prefs.tx_confirmed  ?? true,
            node_status:   prefs.node_status   ?? true,
            governance:    prefs.governance    ?? false,
            announcements: prefs.announcements ?? true,
          },
          metadata: {
            phone:      meta.phone      ?? '',
            location:   meta.location   ?? '',
            website:    meta.website    ?? '',
            twitter:    meta.twitter    ?? '',
            telegram:   meta.telegram   ?? '',
            occupation: meta.occupation ?? '',
            theme:      meta.theme      ?? 'dark',
          },
        });
      }
      setLoading(false);
    };
    load();
  }, [user]);

  const save = async () => {
    if (!user) return;
    setSaving(true);

    // Username uniqueness check (if changed)
    if (profile.username) {
      const { data: existing } = await supabase
        .from('profiles')
        .select('user_id')
        .eq('username', profile.username.trim().toLowerCase())
        .neq('user_id', user.id)
        .maybeSingle();
      if (existing) {
        toast({ title: 'Username taken', description: 'Please choose a different username.', variant: 'destructive' });
        setSaving(false);
        return;
      }
    }

    const { error } = await supabase
      .from('profiles')
      .update({
        display_name:       profile.display_name.trim() || null,
        username:           profile.username.trim().toLowerCase() || null,
        bio:                profile.bio.trim() || null,
        avatar_url:         profile.avatar_url.trim() || null,
        locale:             profile.locale,
        timezone:           profile.timezone,
        notification_prefs: profile.notification_prefs,
        metadata:           profile.metadata,
        updated_at:         new Date().toISOString(),
      })
      .eq('user_id', user.id);

    if (error) {
      toast({ title: 'Save failed', description: error.message, variant: 'destructive' });
    } else {
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
      toast({ title: 'Profile saved', description: 'Your information has been updated.' });
    }
    setSaving(false);
  };

  const set = (key: keyof ProfileData, val: any) =>
    setProfile(p => ({ ...p, [key]: val }));

  const setMeta = (key: keyof ProfileData['metadata'], val: string) =>
    setProfile(p => ({ ...p, metadata: { ...p.metadata, [key]: val } }));

  const setNotif = (key: keyof ProfileData['notification_prefs'], val: boolean) =>
    setProfile(p => ({ ...p, notification_prefs: { ...p.notification_prefs, [key]: val } }));

  const displayRole = roles.includes('founder') ? 'founder' : roles.includes('admin') ? 'admin' : 'user';

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
    { key: 'info',          label: 'Profile Info',  icon: User },
    { key: 'notifications', label: 'Notifications', icon: Bell },
    { key: 'security',      label: 'Security',      icon: Shield },
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

        {/* Privacy notice */}
        <GlassCard className="p-4 border-primary/20 bg-primary/5">
          <div className="flex items-start gap-3 text-sm">
            <Shield className="w-4 h-4 text-primary mt-0.5 shrink-0" />
            <div>
              <p className="font-medium text-foreground">Your profile is completely private</p>
              <p className="text-muted-foreground text-xs mt-0.5">
                None of this information is visible to other users or shown publicly anywhere on the platform.
                It is stored securely in your account only.
              </p>
            </div>
          </div>
        </GlassCard>

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
                    { key: 'email',         label: 'Email notifications',  desc: 'Receive updates via email' },
                    { key: 'push',          label: 'Push notifications',   desc: 'Browser / device push (coming soon)' },
                    { key: 'sms',           label: 'SMS notifications',    desc: 'Text message alerts (coming soon)' },
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
                <div className="flex items-center justify-between p-3 bg-muted/20 rounded-lg border border-border/30">
                  <div>
                    <p className="text-sm font-medium text-foreground">Password</p>
                    <p className="text-xs text-muted-foreground">Change your login password</p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => window.location.href = '/reset-password'}
                  >
                    Change
                  </Button>
                </div>

                <div className="flex items-center justify-between p-3 bg-muted/20 rounded-lg border border-border/30">
                  <div>
                    <p className="text-sm font-medium text-foreground">Two-Factor Authentication</p>
                    <p className="text-xs text-muted-foreground">Coming soon — TOTP authenticator support</p>
                  </div>
                  <Badge variant="secondary" className="text-xs">Soon</Badge>
                </div>

                <div className="flex items-center justify-between p-3 bg-muted/20 rounded-lg border border-border/30">
                  <div>
                    <p className="text-sm font-medium text-foreground">Active Sessions</p>
                    <p className="text-xs text-muted-foreground">Manage devices where you're logged in</p>
                  </div>
                  <Badge variant="secondary" className="text-xs">Soon</Badge>
                </div>

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
                      {user?.created_at ? new Date(user.created_at).toLocaleDateString() : '—'}
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

        {/* Save button — always visible */}
        {activeTab !== 'security' && (
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
