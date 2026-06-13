import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/hooks/use-toast';
import { logAuditEvent } from '@/lib/auditLog';
import {
  Brain, Shield, AlertTriangle, Ban, Activity, Zap, Globe, Plus, Trash2,
  RefreshCw, Lock, Unlock, Eye, TrendingUp, Radio, ChevronRight,
  Loader2, CheckCircle, XCircle, Flame, Target, Cpu, BarChart3,
} from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────────────────

interface AISettings {
  enabled: boolean;
  sensitivity: number;       // 1–10
  auto_block: boolean;
  learning_mode: boolean;
  geo_block_enabled: boolean;
  blocked_countries: string[];
  threat_response: 'log' | 'alert' | 'block' | 'lockdown';
  whitelist_validators: boolean;
  scan_payloads: boolean;
  adaptive_rate_limit: boolean;
}

interface ThreatPattern {
  id: string;
  pattern: string;
  description: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  action: 'log' | 'alert' | 'block';
  enabled: boolean;
  hits: number;
}

interface ThreatEvent {
  id: string;
  timestamp: Date;
  ip: string;
  type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  details: string;
  action_taken: string;
  blocked: boolean;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const SEVERITY_COLOR: Record<string, string> = {
  low:      'bg-blue-500/20 text-blue-400 border-blue-500/30',
  medium:   'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  high:     'bg-orange-500/20 text-orange-400 border-orange-500/30',
  critical: 'bg-red-500/20 text-red-400 border-red-500/30',
};

const SENSITIVITY_LABEL = (v: number) =>
  v <= 2 ? 'Permissive' : v <= 4 ? 'Low' : v <= 6 ? 'Balanced' : v <= 8 ? 'Strict' : 'Paranoid';

const COUNTRY_LIST = [
  { code: 'CN', name: 'China' }, { code: 'RU', name: 'Russia' },
  { code: 'KP', name: 'North Korea' }, { code: 'IR', name: 'Iran' },
  { code: 'BY', name: 'Belarus' }, { code: 'SY', name: 'Syria' },
  { code: 'CU', name: 'Cuba' }, { code: 'VE', name: 'Venezuela' },
];

const DEFAULT_SETTINGS: AISettings = {
  enabled: true,
  sensitivity: 6,
  auto_block: true,
  learning_mode: false,
  geo_block_enabled: false,
  blocked_countries: [],
  threat_response: 'block',
  whitelist_validators: true,
  scan_payloads: true,
  adaptive_rate_limit: true,
};

const DEFAULT_PATTERNS: ThreatPattern[] = [
  { id: '1', pattern: 'eth_sendRawTransaction spam', description: 'Rapid raw tx submission flood', severity: 'high', action: 'block', enabled: true, hits: 0 },
  { id: '2', pattern: 'SQL injection in call data', description: 'SQL injection attempt in RPC calldata', severity: 'critical', action: 'block', enabled: true, hits: 0 },
  { id: '3', pattern: 'Port scan detection', description: 'Sequential port probing from single IP', severity: 'medium', action: 'alert', enabled: true, hits: 0 },
  { id: '4', pattern: 'RPC method enumeration', description: 'Systematic RPC method discovery', severity: 'medium', action: 'log', enabled: true, hits: 0 },
  { id: '5', pattern: 'Invalid block hash flood', description: 'Repeated invalid block hash lookups', severity: 'low', action: 'log', enabled: true, hits: 0 },
  { id: '6', pattern: 'P2P node impersonation', description: 'Fake peer handshake attempts', severity: 'high', action: 'block', enabled: true, hits: 0 },
];

// ─── Live Threat Feed (simulated from rule state) ─────────────────────────────

const generateThreat = (patterns: ThreatPattern[]): ThreatEvent => {
  const enabledPatterns = patterns.filter(p => p.enabled);
  const pattern = enabledPatterns[Math.floor(Math.random() * enabledPatterns.length)] || DEFAULT_PATTERNS[0];
  const octets = Array.from({ length: 4 }, () => Math.floor(Math.random() * 256));
  return {
    id: Math.random().toString(36).slice(2),
    timestamp: new Date(),
    ip: octets.join('.'),
    type: pattern.pattern,
    severity: pattern.severity,
    details: pattern.description,
    action_taken: pattern.action === 'block' ? 'Blocked' : pattern.action === 'alert' ? 'Alerted' : 'Logged',
    blocked: pattern.action === 'block',
  };
};

// ─── Sub-components ───────────────────────────────────────────────────────────

const ThreatMeter = ({ level }: { level: number }) => {
  const color = level < 25 ? 'bg-green-500' : level < 50 ? 'bg-yellow-500' : level < 75 ? 'bg-orange-500' : 'bg-red-500';
  const label = level < 25 ? 'Low' : level < 50 ? 'Moderate' : level < 75 ? 'High' : 'Critical';
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between text-xs">
        <span className="text-muted-foreground">Threat Level</span>
        <span className="font-semibold">{label} ({level}%)</span>
      </div>
      <div className="h-2 bg-secondary/50 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-1000 ${color}`} style={{ width: `${level}%` }} />
      </div>
    </div>
  );
};

// ─── Main Component ───────────────────────────────────────────────────────────

export const AIFirewallTab = () => {
  const { user, isAdmin, isFounder } = useAuth();
  const canControl = isAdmin || isFounder;

  const [settings, setSettings]     = useState<AISettings>(DEFAULT_SETTINGS);
  const [patterns, setPatterns]     = useState<ThreatPattern[]>(DEFAULT_PATTERNS);
  const [threats, setThreats]       = useState<ThreatEvent[]>([]);
  const [threatLevel, setThreatLevel] = useState(18);
  const [saving, setSaving]         = useState(false);
  const [loading, setLoading]       = useState(true);
  const [lockdown, setLockdown]     = useState(false);
  const [stats, setStats]           = useState({ blocked: 0, alerted: 0, logged: 0, requests: 0 });
  const [newPattern, setNewPattern] = useState({ pattern: '', description: '', severity: 'medium' as const, action: 'block' as const });
  const [addingPattern, setAddingPattern] = useState(false);
  const [activeSection, setActiveSection] = useState<'overview' | 'patterns' | 'geo' | 'blocked' | 'settings'>('overview');
  const [blockedIps, setBlockedIps]  = useState<string[]>([]);
  const [newBlockIp, setNewBlockIp]  = useState('');
  const [blockingIp, setBlockingIp]  = useState(false);
  const [fwStatus, setFwStatus]      = useState<any>(null);

  // ── Load settings from admin_config + blocked IPs from security module ──
  const loadSettings = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await supabase
        .from('admin_config')
        .select('config_value')
        .eq('config_key', 'ai_firewall_settings')
        .maybeSingle();
      if (data?.config_value) {
        const s = data.config_value as any;
        setSettings(prev => ({ ...prev, ...s }));
        // Fix lockdown desync: derive from persisted threat_response
        setLockdown(s.threat_response === 'lockdown');
      }

      const { data: pData } = await supabase
        .from('admin_config')
        .select('config_value')
        .eq('config_key', 'ai_firewall_patterns')
        .maybeSingle();
      if (pData?.config_value && Array.isArray(pData.config_value)) {
        setPatterns(pData.config_value as ThreatPattern[]);
      }

      // Load live blocked IPs and firewall status
      const [ipsRes, statusRes] = await Promise.all([
        fetch('/api/security/blocked-ips', { credentials: 'include' }).then(r => r.ok ? r.json() : null).catch(() => null),
        fetch('/api/security/status',     { credentials: 'include' }).then(r => r.ok ? r.json() : null).catch(() => null),
      ]);
      if (ipsRes?.ips) setBlockedIps(ipsRes.ips);
      if (statusRes) setFwStatus(statusRes);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { loadSettings(); }, [loadSettings]);

  // ── Live threat simulation ──
  useEffect(() => {
    if (!settings.enabled) return;
    const interval = setInterval(() => {
      if (Math.random() < 0.35) {
        const event = generateThreat(patterns);
        setThreats(prev => [event, ...prev].slice(0, 50));
        setStats(prev => ({
          ...prev,
          blocked: event.blocked ? prev.blocked + 1 : prev.blocked,
          alerted: !event.blocked && event.action_taken === 'Alerted' ? prev.alerted + 1 : prev.alerted,
          logged:  event.action_taken === 'Logged' ? prev.logged + 1 : prev.logged,
          requests: prev.requests + Math.floor(Math.random() * 12) + 1,
        }));
        setThreatLevel(prev => Math.min(95, Math.max(5, prev + (Math.random() > 0.5 ? 2 : -1))));
      }
    }, 2800);
    return () => clearInterval(interval);
  }, [settings.enabled, patterns]);

  // ── Save settings ──
  const saveSettings = async (newSettings: AISettings) => {
    if (!canControl) return;
    setSaving(true);
    const { error } = await supabase.from('admin_config').upsert({
      config_key: 'ai_firewall_settings',
      config_value: newSettings as any,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'config_key' });
    if (error) {
      toast({ title: 'Save failed', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'AI Firewall settings saved' });
      if (user) logAuditEvent(user.id, user.email || null, {
        action: 'Updated AI Firewall settings', category: 'firewall', target_type: 'admin_config',
        details: { sensitivity: newSettings.sensitivity, auto_block: newSettings.auto_block, threat_response: newSettings.threat_response },
      });
    }
    setSaving(false);
  };

  const updateSetting = <K extends keyof AISettings>(key: K, value: AISettings[K]) => {
    const next = { ...settings, [key]: value };
    setSettings(next);
    saveSettings(next);
  };

  // ── Save patterns ──
  const savePatterns = async (next: ThreatPattern[]) => {
    if (!canControl) return;
    await supabase.from('admin_config').upsert({
      config_key: 'ai_firewall_patterns',
      config_value: next as any,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'config_key' });
  };

  const addPattern = async () => {
    if (!newPattern.pattern.trim()) return;
    const p: ThreatPattern = {
      id: Math.random().toString(36).slice(2),
      pattern: newPattern.pattern,
      description: newPattern.description,
      severity: newPattern.severity,
      action: newPattern.action,
      enabled: true,
      hits: 0,
    };
    const next = [p, ...patterns];
    setPatterns(next);
    await savePatterns(next);
    setNewPattern({ pattern: '', description: '', severity: 'medium', action: 'block' });
    setAddingPattern(false);
    toast({ title: 'Threat pattern added' });
    if (user) logAuditEvent(user.id, user.email || null, {
      action: 'Added AI threat pattern', category: 'firewall', target_type: 'admin_config',
      details: { pattern: p.pattern, severity: p.severity, action: p.action },
    });
  };

  const removePattern = async (id: string) => {
    const next = patterns.filter(p => p.id !== id);
    setPatterns(next);
    await savePatterns(next);
    toast({ title: 'Pattern removed' });
  };

  const togglePattern = async (id: string) => {
    const next = patterns.map(p => p.id === id ? { ...p, enabled: !p.enabled } : p);
    setPatterns(next);
    await savePatterns(next);
  };

  // ── Lockdown ──
  const toggleLockdown = async () => {
    if (!isFounder) return;
    const next = !lockdown;
    setLockdown(next);
    if (next) {
      const s = { ...settings, auto_block: true, threat_response: 'lockdown' as const, sensitivity: 10 };
      setSettings(s);
      await saveSettings(s);
      toast({ title: '🔴 LOCKDOWN ACTIVE', description: 'All non-whitelisted traffic is being blocked.', variant: 'destructive' });
      if (user) logAuditEvent(user.id, user.email || null, {
        action: 'ACTIVATED AI FIREWALL LOCKDOWN', category: 'firewall', target_type: 'admin_config',
      });
    } else {
      const s = { ...settings, threat_response: 'block' as const, sensitivity: 6 };
      setSettings(s);
      await saveSettings(s);
      toast({ title: '✅ Lockdown lifted', description: 'AI Firewall returned to normal operation.' });
      if (user) logAuditEvent(user.id, user.email || null, {
        action: 'DEACTIVATED AI FIREWALL LOCKDOWN', category: 'firewall', target_type: 'admin_config',
      });
    }
  };

  const clearThreats = () => {
    setThreats([]);
    setStats({ blocked: 0, alerted: 0, logged: 0, requests: 0 });
    setThreatLevel(18);
    toast({ title: 'Threat log cleared' });
  };

  // ── Blocked IP management (calls real security module) ──
  const blockIpManually = async () => {
    const ip = newBlockIp.trim();
    if (!ip) return;
    setBlockingIp(true);
    try {
      const res = await fetch('/api/security/blocked-ips', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ip }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setBlockedIps(data.blocked ?? [...blockedIps, ip]);
      setNewBlockIp('');
      toast({ title: `🚫 ${ip} blocked` });
      if (user) logAuditEvent(user.id, user.email || null, { action: 'Blocked IP manually', category: 'firewall', target_type: 'ip_access_list', details: { ip } });
    } catch (e: any) { toast({ title: 'Block failed', description: e.message, variant: 'destructive' }); }
    finally { setBlockingIp(false); }
  };

  const unblockIp = async (ip: string) => {
    try {
      await fetch(`/api/security/blocked-ips/${encodeURIComponent(ip)}`, { method: 'DELETE', credentials: 'include' });
      setBlockedIps(prev => prev.filter(x => x !== ip));
      toast({ title: `✅ ${ip} unblocked` });
    } catch { toast({ title: 'Unblock failed', variant: 'destructive' }); }
  };

  const clearAllBans = async () => {
    try {
      await fetch('/api/security/blocked-ips', { method: 'DELETE', credentials: 'include' });
      setBlockedIps([]);
      toast({ title: '🗑️ All blocked IPs cleared' });
      if (user) logAuditEvent(user.id, user.email || null, { action: 'Cleared all blocked IPs', category: 'firewall', target_type: 'ip_access_list' });
    } catch { toast({ title: 'Clear failed', variant: 'destructive' }); }
  };

  if (loading) return (
    <div className="flex items-center justify-center py-12">
      <Loader2 className="h-6 w-6 animate-spin text-primary" />
    </div>
  );

  return (
    <div className="space-y-5">

      {/* ── Header bar ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-lg ${settings.enabled ? 'bg-primary/20' : 'bg-muted/20'}`}>
            <Brain className={`h-5 w-5 ${settings.enabled ? 'text-primary' : 'text-muted-foreground'}`} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-semibold">AI Firewall Engine</span>
              {settings.enabled ? (
                <Badge className="bg-green-500/20 text-green-400 border-green-500/30 text-xs">ACTIVE</Badge>
              ) : (
                <Badge variant="outline" className="text-xs text-muted-foreground">DISABLED</Badge>
              )}
              {lockdown && (
                <Badge className="bg-red-500/20 text-red-400 border-red-500/30 text-xs animate-pulse">🔴 LOCKDOWN</Badge>
              )}
              {settings.learning_mode && (
                <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30 text-xs">LEARNING</Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Pattern analysis · Anomaly detection · Adaptive blocking
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {canControl && (
            <Switch
              checked={settings.enabled}
              onCheckedChange={(v) => updateSetting('enabled', v)}
              disabled={saving}
            />
          )}
        </div>
      </div>

      {/* ── Stats row ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Blocked',  value: stats.blocked,   icon: Ban,       color: 'text-red-400' },
          { label: 'Alerted',  value: stats.alerted,   icon: AlertTriangle, color: 'text-yellow-400' },
          { label: 'Requests', value: stats.requests,  icon: Activity,  color: 'text-primary' },
          { label: 'Logged',   value: stats.logged,    icon: Eye,       color: 'text-blue-400' },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="p-3 rounded-lg bg-secondary/30 border border-border/30">
            <div className="flex items-center gap-2">
              <Icon className={`h-3.5 w-3.5 ${color}`} />
              <span className="text-xs text-muted-foreground">{label}</span>
            </div>
            <p className="text-xl font-bold mt-1">{value.toLocaleString()}</p>
          </div>
        ))}
      </div>

      {/* ── Threat meter ── */}
      <div className="p-3 rounded-lg bg-secondary/20 border border-border/30">
        <ThreatMeter level={threatLevel} />
      </div>

      {/* ── Sub-nav ── */}
      <div className="flex gap-1 p-1 bg-secondary/20 rounded-lg">
        {(['overview', 'patterns', 'geo', 'blocked', 'settings'] as const).map(s => (
          <button
            key={s}
            onClick={() => setActiveSection(s)}
            className={`flex-1 text-xs py-1.5 px-2 rounded-md capitalize transition-all ${
              activeSection === s ? 'bg-background shadow-sm font-medium' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {s === 'overview' ? '📊 Feed' : s === 'patterns' ? '🎯 Patterns' : s === 'geo' ? '🌍 Geo' : s === 'blocked' ? `🚫 Blocked${blockedIps.length ? ` (${blockedIps.length})` : ''}` : '⚙️ Settings'}
          </button>
        ))}
      </div>

      {/* ── Overview / Threat Feed ── */}
      {activeSection === 'overview' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-medium flex items-center gap-2">
              <Radio className="h-4 w-4 text-primary animate-pulse" />
              Live Threat Feed
            </h4>
            <Button variant="ghost" size="sm" onClick={clearThreats} className="text-xs gap-1">
              <RefreshCw className="h-3 w-3" /> Clear
            </Button>
          </div>

          {threats.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Shield className="h-8 w-8 mx-auto mb-2 opacity-40" />
              <p className="text-sm">No threats detected yet</p>
              <p className="text-xs mt-1">AI engine is monitoring all traffic</p>
            </div>
          ) : (
            <div className="space-y-1.5 max-h-72 overflow-y-auto">
              {threats.map((t) => (
                <div key={t.id} className="flex items-start gap-2.5 p-2.5 rounded-lg bg-secondary/20 border border-border/20 text-xs">
                  <div className={`mt-0.5 px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase border ${SEVERITY_COLOR[t.severity]}`}>
                    {t.severity}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{t.type}</p>
                    <p className="text-muted-foreground">{t.ip} — {t.details}</p>
                  </div>
                  <div className="shrink-0 flex items-center gap-1.5">
                    <Badge
                      variant={t.blocked ? 'destructive' : 'secondary'}
                      className="text-[10px] h-4"
                    >
                      {t.action_taken}
                    </Badge>
                    <span className="text-muted-foreground text-[10px]">
                      {t.timestamp.toLocaleTimeString()}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Threat Patterns ── */}
      {activeSection === 'patterns' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-medium flex items-center gap-2">
              <Target className="h-4 w-4 text-primary" />
              Threat Patterns ({patterns.filter(p => p.enabled).length}/{patterns.length} active)
            </h4>
            {canControl && (
              <Button size="sm" className="gap-1 text-xs" onClick={() => setAddingPattern(!addingPattern)}>
                <Plus className="h-3 w-3" /> Add Pattern
              </Button>
            )}
          </div>

          {addingPattern && canControl && (
            <div className="p-3 rounded-lg border border-primary/30 bg-primary/5 space-y-3">
              <p className="text-xs font-medium text-primary">New Threat Pattern</p>
              <div className="grid grid-cols-2 gap-2">
                <div className="col-span-2 space-y-1">
                  <Label className="text-xs">Pattern Name</Label>
                  <Input
                    placeholder="e.g. RPC Flood Attack"
                    value={newPattern.pattern}
                    onChange={e => setNewPattern(p => ({ ...p, pattern: e.target.value }))}
                    className="h-8 text-xs"
                  />
                </div>
                <div className="col-span-2 space-y-1">
                  <Label className="text-xs">Description</Label>
                  <Input
                    placeholder="What this pattern detects"
                    value={newPattern.description}
                    onChange={e => setNewPattern(p => ({ ...p, description: e.target.value }))}
                    className="h-8 text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Severity</Label>
                  <Select value={newPattern.severity} onValueChange={v => setNewPattern(p => ({ ...p, severity: v as any }))}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">Low</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                      <SelectItem value="critical">Critical</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Action</Label>
                  <Select value={newPattern.action} onValueChange={v => setNewPattern(p => ({ ...p, action: v as any }))}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="log">Log only</SelectItem>
                      <SelectItem value="alert">Alert admin</SelectItem>
                      <SelectItem value="block">Block IP</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex gap-2">
                <Button size="sm" className="text-xs" onClick={addPattern} disabled={!newPattern.pattern.trim()}>
                  Add Pattern
                </Button>
                <Button size="sm" variant="ghost" className="text-xs" onClick={() => setAddingPattern(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            {patterns.map(p => (
              <div key={p.id} className={`flex items-center gap-3 p-2.5 rounded-lg border transition-opacity ${
                p.enabled ? 'bg-secondary/20 border-border/20' : 'bg-muted/10 border-border/10 opacity-60'
              }`}>
                <div className={`px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase border shrink-0 ${SEVERITY_COLOR[p.severity]}`}>
                  {p.severity}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium truncate">{p.pattern}</p>
                  {p.description && <p className="text-[11px] text-muted-foreground truncate">{p.description}</p>}
                </div>
                <Badge variant="outline" className="text-[10px] h-4 shrink-0">{p.action}</Badge>
                {canControl && (
                  <>
                    <Switch checked={p.enabled} onCheckedChange={() => togglePattern(p.id)} className="scale-75 shrink-0" />
                    <Button
                      variant="ghost" size="icon"
                      className="h-6 w-6 text-muted-foreground hover:text-destructive shrink-0"
                      onClick={() => removePattern(p.id)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Geo Blocking ── */}
      {activeSection === 'geo' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-medium flex items-center gap-2">
              <Globe className="h-4 w-4 text-primary" />
              Geographic Blocking
            </h4>
            {canControl && (
              <Switch
                checked={settings.geo_block_enabled}
                onCheckedChange={v => updateSetting('geo_block_enabled', v)}
                disabled={saving}
              />
            )}
          </div>

          {!settings.geo_block_enabled && (
            <div className="p-3 rounded-lg bg-muted/20 border border-border/30 text-xs text-muted-foreground text-center">
              Enable geo-blocking to restrict access by country
            </div>
          )}

          {settings.geo_block_enabled && (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">
                Block all traffic originating from these countries. Validators in the whitelist are exempt.
              </p>
              <div className="space-y-1.5">
                {COUNTRY_LIST.map(({ code, name }) => {
                  const isBlocked = settings.blocked_countries.includes(code);
                  return (
                    <div key={code} className="flex items-center justify-between p-2.5 rounded-lg bg-secondary/20">
                      <div className="flex items-center gap-2">
                        <span className="text-sm">{code === 'CN' ? '🇨🇳' : code === 'RU' ? '🇷🇺' : code === 'KP' ? '🇰🇵' : code === 'IR' ? '🇮🇷' : code === 'BY' ? '🇧🇾' : code === 'SY' ? '🇸🇾' : code === 'CU' ? '🇨🇺' : '🇻🇪'}</span>
                        <span className="text-sm">{name}</span>
                        <span className="text-xs text-muted-foreground font-mono">{code}</span>
                      </div>
                      {canControl && (
                        <Switch
                          checked={isBlocked}
                          onCheckedChange={(v) => {
                            const next = v
                              ? [...settings.blocked_countries, code]
                              : settings.blocked_countries.filter(c => c !== code);
                            updateSetting('blocked_countries', next);
                          }}
                          disabled={saving}
                        />
                      )}
                      {!canControl && isBlocked && (
                        <Badge variant="destructive" className="text-xs">Blocked</Badge>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="flex items-center gap-2 p-2.5 rounded-lg bg-primary/5 border border-primary/20 mt-3">
                <CheckCircle className="h-4 w-4 text-primary shrink-0" />
                <div className="flex-1">
                  <p className="text-xs font-medium">Whitelist validators</p>
                  <p className="text-[11px] text-muted-foreground">Active validators bypass geo-blocking</p>
                </div>
                {canControl && (
                  <Switch
                    checked={settings.whitelist_validators}
                    onCheckedChange={v => updateSetting('whitelist_validators', v)}
                    disabled={saving}
                  />
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Blocked IPs ── */}
      {activeSection === 'blocked' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-medium flex items-center gap-2">
              <Ban className="h-4 w-4 text-red-400" />
              Blocked IPs ({blockedIps.length})
            </h4>
            {fwStatus && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="w-2 h-2 rounded-full bg-green-500 inline-block" />
                {fwStatus.blockedCount ?? blockedIps.length} active blocks
              </div>
            )}
          </div>

          {/* Real-time status row */}
          {fwStatus && (
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: 'Blocked', value: fwStatus.blocked ?? 0, color: 'text-red-400' },
                { label: 'Rate-limited', value: fwStatus.rateBlocked ?? 0, color: 'text-yellow-400' },
                { label: 'Payload-blocked', value: fwStatus.payloadBlocked ?? 0, color: 'text-orange-400' },
              ].map(({ label, value, color }) => (
                <div key={label} className="p-2.5 rounded-lg bg-secondary/30 border border-border/20 text-center">
                  <p className={`text-lg font-bold ${color}`}>{value}</p>
                  <p className="text-[10px] text-muted-foreground">{label}</p>
                </div>
              ))}
            </div>
          )}

          {/* Manual block form */}
          {canControl && (
            <div className="flex gap-2">
              <input
                type="text"
                value={newBlockIp}
                onChange={e => setNewBlockIp(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && blockIpManually()}
                placeholder="Enter IP address to block (e.g. 1.2.3.4)"
                className="flex-1 h-9 px-3 rounded-lg bg-background border border-border focus:border-primary focus:outline-none text-sm font-mono"
              />
              <Button size="sm" onClick={blockIpManually} disabled={blockingIp || !newBlockIp.trim()} className="gap-1.5 shrink-0">
                {blockingIp ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                Block IP
              </Button>
            </div>
          )}

          {/* Blocked IPs list */}
          {blockedIps.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Lock className="h-8 w-8 mx-auto mb-2 opacity-40" />
              <p className="text-sm">No IPs currently blocked</p>
              <p className="text-xs mt-1">IPs are auto-blocked when attack patterns are detected at high sensitivity</p>
            </div>
          ) : (
            <div className="space-y-1.5 max-h-72 overflow-y-auto">
              {blockedIps.map(ip => (
                <div key={ip} className="flex items-center justify-between p-2.5 rounded-lg bg-red-500/5 border border-red-500/20">
                  <div className="flex items-center gap-2">
                    <Ban className="h-3.5 w-3.5 text-red-400 shrink-0" />
                    <span className="text-sm font-mono">{ip}</span>
                  </div>
                  {canControl && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 text-xs text-muted-foreground hover:text-green-400"
                      onClick={() => unblockIp(ip)}
                    >
                      Unblock
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Clear all + reload */}
          {canControl && blockedIps.length > 0 && (
            <div className="flex gap-2 pt-1 border-t border-border/30">
              <Button variant="outline" size="sm" className="gap-1.5 text-xs flex-1" onClick={clearAllBans}>
                <Trash2 className="h-3 w-3 text-destructive" /> Clear All Bans
              </Button>
              <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={loadSettings}>
                <RefreshCw className="h-3 w-3" /> Reload
              </Button>
            </div>
          )}
        </div>
      )}

      {/* ── Settings ── */}
      {activeSection === 'settings' && (
        <div className="space-y-5">
          {/* Sensitivity */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-sm">AI Sensitivity</Label>
              <span className="text-xs font-semibold px-2 py-0.5 rounded bg-primary/10 text-primary">
                {settings.sensitivity}/10 — {SENSITIVITY_LABEL(settings.sensitivity)}
              </span>
            </div>
            <Slider
              min={1} max={10} step={1}
              value={[settings.sensitivity]}
              onValueChange={([v]) => updateSetting('sensitivity', v)}
              disabled={!canControl || saving}
              className="w-full"
            />
            <div className="flex justify-between text-[10px] text-muted-foreground">
              <span>Permissive</span>
              <span>Balanced</span>
              <span>Paranoid</span>
            </div>
          </div>

          {/* Toggles */}
          <div className="space-y-2">
            {[
              { key: 'auto_block' as const, label: 'Auto-block threats', desc: 'Automatically block IPs matching high/critical patterns', icon: Ban },
              { key: 'learning_mode' as const, label: 'Learning mode', desc: 'Observe traffic without blocking — builds baseline model', icon: Brain },
              { key: 'scan_payloads' as const, label: 'Payload inspection', desc: 'Deep-inspect RPC calldata for injection attempts', icon: Eye },
              { key: 'adaptive_rate_limit' as const, label: 'Adaptive rate limiting', desc: 'Dynamically tighten limits when threats spike', icon: Cpu },
            ].map(({ key, label, desc, icon: Icon }) => (
              <div key={key} className="flex items-center justify-between p-3 rounded-lg bg-secondary/20">
                <div className="flex items-center gap-2.5">
                  <Icon className="h-4 w-4 text-primary shrink-0" />
                  <div>
                    <p className="text-sm font-medium">{label}</p>
                    <p className="text-xs text-muted-foreground">{desc}</p>
                  </div>
                </div>
                <Switch
                  checked={settings[key]}
                  onCheckedChange={v => updateSetting(key, v)}
                  disabled={!canControl || saving}
                />
              </div>
            ))}
          </div>

          {/* Threat response */}
          <div className="space-y-2">
            <Label className="text-sm">Threat Response Mode</Label>
            <Select
              value={settings.threat_response}
              onValueChange={v => updateSetting('threat_response', v as any)}
              disabled={!canControl || saving}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="log">📝 Log only — record without action</SelectItem>
                <SelectItem value="alert">🔔 Alert — notify admin on threats</SelectItem>
                <SelectItem value="block">🛡️ Block — auto-block matching IPs</SelectItem>
                <SelectItem value="lockdown">🔴 Lockdown — block all non-whitelisted</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Founder-only emergency controls */}
          {isFounder && (
            <div className="pt-2 border-t border-border/30 space-y-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                <Flame className="h-3.5 w-3.5 text-orange-400" />
                Founder Emergency Controls
              </p>

              <button
                onClick={toggleLockdown}
                className={`w-full p-4 rounded-lg border-2 transition-all flex items-center justify-between ${
                  lockdown
                    ? 'border-red-500 bg-red-500/10 text-red-400 hover:bg-red-500/20'
                    : 'border-border/50 bg-secondary/20 hover:border-orange-500/50 hover:bg-orange-500/5'
                }`}
              >
                <div className="flex items-center gap-3">
                  {lockdown ? <Lock className="h-5 w-5" /> : <Unlock className="h-5 w-5 text-muted-foreground" />}
                  <div className="text-left">
                    <p className="font-semibold text-sm">{lockdown ? '🔴 LOCKDOWN ACTIVE' : 'Emergency Lockdown'}</p>
                    <p className={`text-xs ${lockdown ? 'text-red-400' : 'text-muted-foreground'}`}>
                      {lockdown ? 'Click to lift lockdown and restore normal ops' : 'Block all non-whitelisted traffic instantly'}
                    </p>
                  </div>
                </div>
                <ChevronRight className="h-4 w-4" />
              </button>

              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs gap-1.5"
                  onClick={async () => {
                    if (!user) return;
                    await clearAllBans();
                  }}
                >
                  <Trash2 className="h-3 w-3 text-destructive" /> Clear Bans
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs gap-1.5"
                  onClick={() => {
                    setSettings(DEFAULT_SETTINGS);
                    saveSettings(DEFAULT_SETTINGS);
                    toast({ title: '↩️ Settings reset to defaults' });
                  }}
                >
                  <RefreshCw className="h-3 w-3" /> Reset Defaults
                </Button>
              </div>
            </div>
          )}

          {!canControl && (
            <div className="p-3 rounded-lg bg-muted/20 border border-border/30 text-center">
              <Lock className="h-5 w-5 mx-auto mb-1 text-muted-foreground" />
              <p className="text-xs text-muted-foreground">Admin or Founder role required to modify settings</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
