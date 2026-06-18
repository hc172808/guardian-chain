import { useState, useEffect } from 'react';
import { GlassCard } from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { api } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/hooks/use-toast';
import { logAuditEvent } from '@/lib/auditLog';
import {
  Shield, Plus, Trash2, Edit, Loader2, CheckCircle, XCircle,
  Ban, Lock, Unlock, Globe, AlertTriangle, Wifi, Gauge, Zap, Timer, Brain,
} from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import { AIFirewallTab } from './AIFirewallTab';

// ─── Types ───
interface FirewallRule {
  id: string;
  rule_type: string;
  action: string;
  protocol: string;
  port: string | null;
  ip_address: string | null;
  direction: string;
  description: string | null;
  is_active: boolean;
  created_at: string;
}

interface Fail2BanJail {
  id: string;
  jail_name: string;
  is_enabled: boolean;
  max_retries: number;
  ban_time: number;
  find_time: number;
  log_path: string | null;
  filter_name: string | null;
  action: string | null;
  description: string | null;
  banned_ips: string[];
  created_at: string;
}

interface IpAccessEntry {
  id: string;
  ip_address: string;
  list_type: string;
  reason: string | null;
  expires_at: string | null;
  created_at: string;
}

// ─── UFW Rules Tab ───
const UfwRulesTab = () => {
  const { user } = useAuth();
  const [rules, setRules] = useState<FirewallRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    action: 'allow', protocol: 'tcp', port: '', ip_address: '', direction: 'in', description: '',
  });

  const fetchRules = async () => {
    try {
      const data = await api.get('/api/firewall/rules');
      setRules(Array.isArray(data) ? data : []);
    } catch { setRules([]); }
    setLoading(false);
  };

  useEffect(() => { fetchRules(); }, []);

  const handleAdd = async () => {
    if (!user) return;
    setSaving(true);
    try {
      await api.post('/api/firewall/rules', {
        rule_type: 'ufw',
        action: form.action,
        protocol: form.protocol,
        port: form.port || null,
        ip_address: form.ip_address || null,
        direction: form.direction,
        description: form.description || null,
      });
      toast({ title: 'Firewall rule added' });
      logAuditEvent(user.id, user.email || null, {
        action: 'Added UFW rule', category: 'firewall', target_type: 'firewall_rules',
        details: { action: form.action, protocol: form.protocol, port: form.port, direction: form.direction },
      });
      setDialogOpen(false);
      setForm({ action: 'allow', protocol: 'tcp', port: '', ip_address: '', direction: 'in', description: '' });
      fetchRules();
    } catch (e: any) {
      toast({ title: 'Failed', description: e.message, variant: 'destructive' });
    }
    setSaving(false);
  };

  const toggleRule = async (id: string, active: boolean) => {
    try {
      await api.patch(`/api/firewall/rules/${id}`, { is_active: !active });
      if (user) logAuditEvent(user.id, user.email || null, {
        action: active ? 'Disabled UFW rule' : 'Enabled UFW rule', category: 'firewall', target_type: 'firewall_rules', target_id: id,
      });
      fetchRules();
    } catch { /* ignore */ }
  };

  const deleteRule = async (id: string) => {
    try {
      await api.delete(`/api/firewall/rules/${id}`);
      toast({ title: 'Rule removed' });
      if (user) logAuditEvent(user.id, user.email || null, {
        action: 'Removed UFW rule', category: 'firewall', target_type: 'firewall_rules', target_id: id,
      });
      fetchRules();
    } catch { /* ignore */ }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="font-medium flex items-center gap-2">
          <Shield className="h-4 w-4 text-primary" />
          UFW Firewall Rules
        </h4>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-1"><Plus className="h-4 w-4" /> Add Rule</Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>Add Firewall Rule</DialogTitle></DialogHeader>
            <div className="space-y-4 pt-2">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Action</Label>
                  <Select value={form.action} onValueChange={(v) => setForm({ ...form, action: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="allow">Allow</SelectItem>
                      <SelectItem value="deny">Deny</SelectItem>
                      <SelectItem value="reject">Reject</SelectItem>
                      <SelectItem value="limit">Limit</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Protocol</Label>
                  <Select value={form.protocol} onValueChange={(v) => setForm({ ...form, protocol: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="tcp">TCP</SelectItem>
                      <SelectItem value="udp">UDP</SelectItem>
                      <SelectItem value="any">Any</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Port</Label>
                  <Input placeholder="e.g. 22, 80, 443" value={form.port} onChange={(e) => setForm({ ...form, port: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Direction</Label>
                  <Select value={form.direction} onValueChange={(v) => setForm({ ...form, direction: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="in">Inbound</SelectItem>
                      <SelectItem value="out">Outbound</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Source IP (optional)</Label>
                <Input placeholder="e.g. 192.168.1.0/24" value={form.ip_address} onChange={(e) => setForm({ ...form, ip_address: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Description</Label>
                <Input placeholder="Rule description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              </div>
              <Button onClick={handleAdd} disabled={saving} className="w-full gap-2">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                Add Rule
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="p-3 rounded-lg bg-primary/5 border border-primary/20 text-sm">
        <p className="text-muted-foreground">
          <strong className="text-foreground">Default policy:</strong> Deny all incoming, Allow all outgoing.
          Essential ports (22/SSH, 80/HTTP, 443/HTTPS, 30303/P2P, 8545/RPC) should be explicitly allowed.
        </p>
      </div>

      {loading ? (
        <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : rules.length === 0 ? (
        <div className="text-center py-6 text-muted-foreground">
          <Shield className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p>No firewall rules configured</p>
        </div>
      ) : (
        <div className="space-y-2">
          {rules.map((rule) => (
            <div key={rule.id} className="flex items-center justify-between p-3 rounded-lg bg-secondary/30">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${rule.action === 'allow' ? 'bg-primary/20' : rule.action === 'deny' ? 'bg-destructive/20' : 'bg-yellow-500/20'}`}>
                  {rule.action === 'allow' ? <CheckCircle className="h-4 w-4 text-primary" /> :
                   rule.action === 'deny' ? <XCircle className="h-4 w-4 text-destructive" /> :
                   <AlertTriangle className="h-4 w-4 text-yellow-500" />}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <Badge variant={rule.action === 'allow' ? 'default' : 'destructive'} className="text-xs uppercase">
                      {rule.action}
                    </Badge>
                    <span className="text-sm font-mono">{rule.port || '*'}/{rule.protocol}</span>
                    <span className="text-xs text-muted-foreground">{rule.direction === 'in' ? '← IN' : '→ OUT'}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {rule.ip_address ? `From: ${rule.ip_address}` : 'Any source'}
                    {rule.description ? ` • ${rule.description}` : ''}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={rule.is_active} onCheckedChange={() => toggleRule(rule.id, rule.is_active)} />
                <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => deleteRule(rule.id)}>
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ─── Fail2Ban Tab ───
const Fail2BanTab = () => {
  const { user } = useAuth();
  const [jails, setJails] = useState<Fail2BanJail[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    jail_name: '', max_retries: '5', ban_time: '3600', find_time: '600',
    log_path: '', filter_name: '', description: '',
  });

  const fetchJails = async () => {
    try {
      const data = await api.get('/api/firewall/jails');
      setJails(Array.isArray(data) ? data : []);
    } catch { setJails([]); }
    setLoading(false);
  };

  useEffect(() => { fetchJails(); }, []);

  const handleAdd = async () => {
    if (!user || !form.jail_name) return;
    setSaving(true);
    try {
      await api.post('/api/firewall/jails', {
        jail_name: form.jail_name,
        max_retries: parseInt(form.max_retries),
        ban_time: parseInt(form.ban_time),
        find_time: parseInt(form.find_time),
        log_path: form.log_path || null,
        filter_name: form.filter_name || null,
        description: form.description || null,
      });
      toast({ title: 'Fail2Ban jail added' });
      logAuditEvent(user.id, user.email || null, {
        action: 'Added Fail2Ban jail', category: 'firewall', target_type: 'fail2ban_jails',
        details: { jail_name: form.jail_name, max_retries: form.max_retries, ban_time: form.ban_time },
      });
      setDialogOpen(false);
      setForm({ jail_name: '', max_retries: '5', ban_time: '3600', find_time: '600', log_path: '', filter_name: '', description: '' });
      fetchJails();
    } catch (e: any) {
      toast({ title: 'Failed', description: e.message, variant: 'destructive' });
    }
    setSaving(false);
  };

  const toggleJail = async (id: string, enabled: boolean) => {
    try {
      await api.patch(`/api/firewall/jails/${id}`, { is_enabled: !enabled });
      if (user) logAuditEvent(user.id, user.email || null, {
        action: enabled ? 'Disabled Fail2Ban jail' : 'Enabled Fail2Ban jail', category: 'firewall', target_type: 'fail2ban_jails', target_id: id,
      });
      fetchJails();
    } catch { /* ignore */ }
  };

  const deleteJail = async (id: string) => {
    try {
      await api.delete(`/api/firewall/jails/${id}`);
      toast({ title: 'Jail removed' });
      if (user) logAuditEvent(user.id, user.email || null, {
        action: 'Removed Fail2Ban jail', category: 'firewall', target_type: 'fail2ban_jails', target_id: id,
      });
      fetchJails();
    } catch { /* ignore */ }
  };

  const formatDuration = (seconds: number) => {
    if (seconds >= 86400) return `${Math.floor(seconds / 86400)}d`;
    if (seconds >= 3600) return `${Math.floor(seconds / 3600)}h`;
    return `${Math.floor(seconds / 60)}m`;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="font-medium flex items-center gap-2">
          <Ban className="h-4 w-4 text-primary" />
          Fail2Ban Jails
        </h4>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-1"><Plus className="h-4 w-4" /> Add Jail</Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>Add Fail2Ban Jail</DialogTitle></DialogHeader>
            <div className="space-y-4 pt-2">
              <div className="space-y-2">
                <Label>Jail Name</Label>
                <Input placeholder="e.g. sshd, rpc-bruteforce" value={form.jail_name} onChange={(e) => setForm({ ...form, jail_name: e.target.value })} />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-2">
                  <Label>Max Retries</Label>
                  <Input type="number" value={form.max_retries} onChange={(e) => setForm({ ...form, max_retries: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Ban Time (s)</Label>
                  <Input type="number" value={form.ban_time} onChange={(e) => setForm({ ...form, ban_time: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Find Time (s)</Label>
                  <Input type="number" value={form.find_time} onChange={(e) => setForm({ ...form, find_time: e.target.value })} />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Log Path</Label>
                <Input placeholder="/var/log/auth.log" value={form.log_path} onChange={(e) => setForm({ ...form, log_path: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Filter Name</Label>
                <Input placeholder="e.g. sshd, nginx-http-auth" value={form.filter_name} onChange={(e) => setForm({ ...form, filter_name: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Description</Label>
                <Input placeholder="What this jail protects" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              </div>
              <Button onClick={handleAdd} disabled={saving || !form.jail_name} className="w-full gap-2">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                Add Jail
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {loading ? (
        <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : jails.length === 0 ? (
        <div className="text-center py-6 text-muted-foreground">
          <Ban className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p>No Fail2Ban jails configured</p>
          <p className="text-xs mt-1">Add jails for SSH, RPC, and P2P brute-force protection</p>
        </div>
      ) : (
        <div className="space-y-2">
          {jails.map((jail) => (
            <div key={jail.id} className="p-3 rounded-lg bg-secondary/30">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg ${jail.is_enabled ? 'bg-primary/20' : 'bg-muted/20'}`}>
                    {jail.is_enabled ? <Lock className="h-4 w-4 text-primary" /> : <Unlock className="h-4 w-4 text-muted-foreground" />}
                  </div>
                  <div>
                    <p className="text-sm font-medium">{jail.jail_name}</p>
                    <p className="text-xs text-muted-foreground">{jail.description || 'No description'}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Switch checked={jail.is_enabled} onCheckedChange={() => toggleJail(jail.id, jail.is_enabled)} />
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => deleteJail(jail.id)}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </div>
              <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
                <span>Max retries: <strong className="text-foreground">{jail.max_retries}</strong></span>
                <span>Ban: <strong className="text-foreground">{formatDuration(jail.ban_time)}</strong></span>
                <span>Window: <strong className="text-foreground">{formatDuration(jail.find_time)}</strong></span>
                {jail.banned_ips && jail.banned_ips.length > 0 && (
                  <span className="text-destructive">🚫 {jail.banned_ips.length} banned</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ─── IP Access List Tab ───
const IpAccessListTab = () => {
  const { user } = useAuth();
  const [entries, setEntries] = useState<IpAccessEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ ip_address: '', list_type: 'whitelist', reason: '' });

  const fetchEntries = async () => {
    try {
      const data = await api.get('/api/firewall/ip-list');
      setEntries(Array.isArray(data) ? data : []);
    } catch { setEntries([]); }
    setLoading(false);
  };

  useEffect(() => { fetchEntries(); }, []);

  const handleAdd = async () => {
    if (!user || !form.ip_address) return;
    setSaving(true);
    try {
      await api.post('/api/firewall/ip-list', {
        ip_address: form.ip_address,
        list_type: form.list_type,
        reason: form.reason || null,
      });
      toast({ title: `IP ${form.list_type === 'whitelist' ? 'whitelisted' : 'blacklisted'}` });
      logAuditEvent(user.id, user.email || null, {
        action: `Added IP to ${form.list_type}`, category: 'firewall', target_type: 'ip_access_list',
        details: { ip_address: form.ip_address, list_type: form.list_type, reason: form.reason },
      });
      setDialogOpen(false);
      setForm({ ip_address: '', list_type: 'whitelist', reason: '' });
      fetchEntries();
    } catch (e: any) {
      toast({ title: 'Failed', description: e.message, variant: 'destructive' });
    }
    setSaving(false);
  };

  const deleteEntry = async (id: string) => {
    try {
      await api.delete(`/api/firewall/ip-list/${id}`);
      toast({ title: 'IP entry removed' });
      if (user) logAuditEvent(user.id, user.email || null, {
        action: 'Removed IP entry', category: 'firewall', target_type: 'ip_access_list', target_id: id,
      });
      fetchEntries();
    } catch { /* ignore */ }
  };

  const whitelisted = entries.filter(e => e.list_type === 'whitelist');
  const blacklisted = entries.filter(e => e.list_type === 'blacklist');

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="font-medium flex items-center gap-2">
          <Globe className="h-4 w-4 text-primary" />
          IP Whitelist / Blacklist
        </h4>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-1"><Plus className="h-4 w-4" /> Add IP</Button>
          </DialogTrigger>
          <DialogContent className="max-w-sm">
            <DialogHeader><DialogTitle>Add IP Entry</DialogTitle></DialogHeader>
            <div className="space-y-4 pt-2">
              <div className="space-y-2">
                <Label>IP Address / CIDR</Label>
                <Input placeholder="e.g. 192.168.1.100 or 10.0.0.0/8" value={form.ip_address} onChange={(e) => setForm({ ...form, ip_address: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>List Type</Label>
                <Select value={form.list_type} onValueChange={(v) => setForm({ ...form, list_type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="whitelist">✅ Whitelist (Allow)</SelectItem>
                    <SelectItem value="blacklist">🚫 Blacklist (Block)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Reason</Label>
                <Input placeholder="Why this IP is listed" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
              </div>
              <Button onClick={handleAdd} disabled={saving || !form.ip_address} className="w-full gap-2">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                Add Entry
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {loading ? (
        <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : entries.length === 0 ? (
        <div className="text-center py-6 text-muted-foreground">
          <Globe className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p>No IP entries configured</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <p className="text-sm font-medium text-primary mb-2 flex items-center gap-1">
              <CheckCircle className="h-3 w-3" /> Whitelist ({whitelisted.length})
            </p>
            <div className="space-y-1">
              {whitelisted.map((e) => (
                <div key={e.id} className="flex items-center justify-between p-2 rounded bg-primary/5 text-sm">
                  <div>
                    <code className="font-mono text-xs">{e.ip_address}</code>
                    {e.reason && <span className="text-xs text-muted-foreground ml-2">— {e.reason}</span>}
                  </div>
                  <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => deleteEntry(e.id)}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              ))}
              {whitelisted.length === 0 && <p className="text-xs text-muted-foreground">No entries</p>}
            </div>
          </div>
          <div>
            <p className="text-sm font-medium text-destructive mb-2 flex items-center gap-1">
              <XCircle className="h-3 w-3" /> Blacklist ({blacklisted.length})
            </p>
            <div className="space-y-1">
              {blacklisted.map((e) => (
                <div key={e.id} className="flex items-center justify-between p-2 rounded bg-destructive/5 text-sm">
                  <div>
                    <code className="font-mono text-xs">{e.ip_address}</code>
                    {e.reason && <span className="text-xs text-muted-foreground ml-2">— {e.reason}</span>}
                  </div>
                  <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => deleteEntry(e.id)}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              ))}
              {blacklisted.length === 0 && <p className="text-xs text-muted-foreground">No entries</p>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ─── Rate Limiting Tab ───
const RateLimitTab = () => {
  const { user } = useAuth();
  const [rules, setRules] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: '', endpoint: '', requests_per_window: '100', window_seconds: '60',
    burst_limit: '20', action: 'throttle', description: '',
  });

  const fetchRules = async () => {
    try {
      const data = await api.get('/api/firewall/rate-limits');
      setRules(Array.isArray(data) ? data : []);
    } catch { setRules([]); }
    setLoading(false);
  };

  useEffect(() => { fetchRules(); }, []);

  const handleAdd = async () => {
    if (!user || !form.name || !form.endpoint) return;
    setSaving(true);
    try {
      await api.post('/api/firewall/rate-limits', {
        name: form.name,
        endpoint: form.endpoint,
        requests_per_window: parseInt(form.requests_per_window),
        window_seconds: parseInt(form.window_seconds),
        burst_limit: parseInt(form.burst_limit),
        action: form.action,
        description: form.description || null,
      });
      toast({ title: 'Rate limit rule added' });
      logAuditEvent(user.id, user.email || null, {
        action: 'Added rate limit rule', category: 'firewall', target_type: 'rate_limit_rules',
        details: { name: form.name, endpoint: form.endpoint, requests: form.requests_per_window, action: form.action },
      });
      setDialogOpen(false);
      setForm({ name: '', endpoint: '', requests_per_window: '100', window_seconds: '60', burst_limit: '20', action: 'throttle', description: '' });
      fetchRules();
    } catch (e: any) {
      toast({ title: 'Failed', description: e.message, variant: 'destructive' });
    }
    setSaving(false);
  };

  const toggleRule = async (id: string, enabled: boolean) => {
    try {
      await api.patch(`/api/firewall/rate-limits/${id}`, { is_enabled: !enabled });
      if (user) logAuditEvent(user.id, user.email || null, {
        action: enabled ? 'Disabled rate limit rule' : 'Enabled rate limit rule', category: 'firewall', target_type: 'rate_limit_rules', target_id: id,
      });
      fetchRules();
    } catch { /* ignore */ }
  };

  const deleteRule = async (id: string) => {
    try {
      await api.delete(`/api/firewall/rate-limits/${id}`);
      toast({ title: 'Rule removed' });
      if (user) logAuditEvent(user.id, user.email || null, {
        action: 'Removed rate limit rule', category: 'firewall', target_type: 'rate_limit_rules', target_id: id,
      });
      fetchRules();
    } catch { /* ignore */ }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="font-medium flex items-center gap-2">
          <Gauge className="h-4 w-4 text-primary" />
          Rate Limiting Rules
        </h4>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-1"><Plus className="h-4 w-4" /> Add Rule</Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>Add Rate Limit Rule</DialogTitle></DialogHeader>
            <div className="space-y-4 pt-2">
              <div className="space-y-2">
                <Label>Rule Name</Label>
                <Input placeholder="e.g. RPC Rate Limit" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Endpoint / Path</Label>
                <Input placeholder="e.g. /rpc, /api/*, :8545" value={form.endpoint} onChange={(e) => setForm({ ...form, endpoint: e.target.value })} />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-2">
                  <Label>Requests</Label>
                  <Input type="number" value={form.requests_per_window} onChange={(e) => setForm({ ...form, requests_per_window: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Window (s)</Label>
                  <Input type="number" value={form.window_seconds} onChange={(e) => setForm({ ...form, window_seconds: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Burst</Label>
                  <Input type="number" value={form.burst_limit} onChange={(e) => setForm({ ...form, burst_limit: e.target.value })} />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Action on Exceed</Label>
                <Select value={form.action} onValueChange={(v) => setForm({ ...form, action: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="throttle">Throttle (429)</SelectItem>
                    <SelectItem value="drop">Drop Connection</SelectItem>
                    <SelectItem value="captcha">Require CAPTCHA</SelectItem>
                    <SelectItem value="ban">Temp Ban (10min)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Description</Label>
                <Input placeholder="What this rule protects" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              </div>
              <Button onClick={handleAdd} disabled={saving || !form.name || !form.endpoint} className="w-full gap-2">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                Add Rule
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="p-3 rounded-lg bg-primary/5 border border-primary/20 text-sm">
        <p className="text-muted-foreground">
          Rate limits apply per-IP. <strong className="text-foreground">Burst</strong> allows short spikes above the sustained rate.
          Rules apply to Nginx reverse proxy and RPC endpoints.
        </p>
      </div>

      {loading ? (
        <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : rules.length === 0 ? (
        <div className="text-center py-6 text-muted-foreground">
          <Gauge className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p>No rate limit rules configured</p>
          <p className="text-xs mt-1">Recommended: Add limits for RPC (8545), WebSocket (8546), and API endpoints</p>
        </div>
      ) : (
        <div className="space-y-2">
          {rules.map((rule: any) => (
            <div key={rule.id} className="flex items-center justify-between p-3 rounded-lg bg-secondary/30">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/20">
                  <Gauge className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-medium">{rule.name}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <code className="text-xs text-muted-foreground bg-secondary/50 px-1.5 py-0.5 rounded">{rule.endpoint}</code>
                    <span className="text-xs text-muted-foreground">
                      {rule.requests_per_window} req/{rule.window_seconds}s • burst: {rule.burst_limit}
                    </span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={rule.action === 'ban' ? 'destructive' : 'secondary'} className="text-xs">
                  {rule.action}
                </Badge>
                <Switch checked={rule.is_enabled} onCheckedChange={() => toggleRule(rule.id, rule.is_enabled)} />
                <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => deleteRule(rule.id)}>
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ─── DDoS Protection Tab ───
const DDoSProtectionTab = () => {
  const { user } = useAuth();
  const [configs, setConfigs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: '', protection_type: 'syn_flood', threshold: '1000', action: 'drop', description: '',
  });

  const fetchConfigs = async () => {
    try {
      const data = await api.get('/api/firewall/ddos');
      setConfigs(Array.isArray(data) ? data : []);
    } catch { setConfigs([]); }
    setLoading(false);
  };

  useEffect(() => { fetchConfigs(); }, []);

  const handleAdd = async () => {
    if (!user || !form.name) return;
    setSaving(true);
    try {
      await api.post('/api/firewall/ddos', {
        name: form.name,
        protection_type: form.protection_type,
        threshold: parseInt(form.threshold),
        action: form.action,
        description: form.description || null,
      });
      toast({ title: 'DDoS protection rule added' });
      logAuditEvent(user.id, user.email || null, {
        action: 'Added DDoS protection rule', category: 'firewall', target_type: 'ddos_protection',
        details: { name: form.name, protection_type: form.protection_type, threshold: form.threshold, action: form.action },
      });
      setDialogOpen(false);
      setForm({ name: '', protection_type: 'syn_flood', threshold: '1000', action: 'drop', description: '' });
      fetchConfigs();
    } catch (e: any) {
      toast({ title: 'Failed', description: e.message, variant: 'destructive' });
    }
    setSaving(false);
  };

  const toggleConfig = async (id: string, enabled: boolean) => {
    try {
      await api.patch(`/api/firewall/ddos/${id}`, { is_enabled: !enabled });
      if (user) logAuditEvent(user.id, user.email || null, {
        action: enabled ? 'Disabled DDoS protection' : 'Enabled DDoS protection', category: 'firewall', target_type: 'ddos_protection', target_id: id,
      });
      fetchConfigs();
    } catch { /* ignore */ }
  };

  const deleteConfig = async (id: string) => {
    try {
      await api.delete(`/api/firewall/ddos/${id}`);
      toast({ title: 'Protection rule removed' });
      if (user) logAuditEvent(user.id, user.email || null, {
        action: 'Removed DDoS protection rule', category: 'firewall', target_type: 'ddos_protection', target_id: id,
      });
      fetchConfigs();
    } catch { /* ignore */ }
  };

  const protectionTypes: Record<string, { label: string; icon: string }> = {
    syn_flood: { label: 'SYN Flood', icon: '🌊' },
    udp_flood: { label: 'UDP Flood', icon: '💧' },
    http_flood: { label: 'HTTP Flood', icon: '🔥' },
    slowloris: { label: 'Slowloris', icon: '🐌' },
    dns_amplification: { label: 'DNS Amplification', icon: '📡' },
    icmp_flood: { label: 'ICMP Flood', icon: '📨' },
    connection_limit: { label: 'Connection Limit', icon: '🔗' },
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="font-medium flex items-center gap-2">
          <Zap className="h-4 w-4 text-primary" />
          DDoS Protection
        </h4>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-1"><Plus className="h-4 w-4" /> Add Rule</Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>Add DDoS Protection Rule</DialogTitle></DialogHeader>
            <div className="space-y-4 pt-2">
              <div className="space-y-2">
                <Label>Rule Name</Label>
                <Input placeholder="e.g. SYN Flood Protection" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Protection Type</Label>
                <Select value={form.protection_type} onValueChange={(v) => setForm({ ...form, protection_type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(protectionTypes).map(([key, { label, icon }]) => (
                      <SelectItem key={key} value={key}>{icon} {label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Threshold (conn/s)</Label>
                  <Input type="number" value={form.threshold} onChange={(e) => setForm({ ...form, threshold: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Action</Label>
                  <Select value={form.action} onValueChange={(v) => setForm({ ...form, action: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="drop">Drop Packets</SelectItem>
                      <SelectItem value="reject">Reject with RST</SelectItem>
                      <SelectItem value="tarpit">Tarpit</SelectItem>
                      <SelectItem value="challenge">Challenge (JS)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Description</Label>
                <Input placeholder="What this rule defends against" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              </div>
              <Button onClick={handleAdd} disabled={saving || !form.name} className="w-full gap-2">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                Add Protection Rule
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="p-3 rounded-lg bg-destructive/5 border border-destructive/20 text-sm">
        <p className="text-muted-foreground">
          <strong className="text-foreground">⚡ DDoS protection</strong> applies iptables and Nginx-level rules to mitigate volumetric and application-layer attacks on your node infrastructure.
        </p>
      </div>

      {loading ? (
        <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : configs.length === 0 ? (
        <div className="text-center py-6 text-muted-foreground">
          <Zap className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p>No DDoS protection rules configured</p>
          <p className="text-xs mt-1">Recommended: Add SYN flood, HTTP flood, and connection limit rules</p>
        </div>
      ) : (
        <div className="space-y-2">
          {configs.map((cfg: any) => (
            <div key={cfg.id} className="flex items-center justify-between p-3 rounded-lg bg-secondary/30">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-destructive/10">
                  <Zap className="h-4 w-4 text-destructive" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium">{cfg.name}</p>
                    <Badge variant="outline" className="text-xs">
                      {protectionTypes[cfg.protection_type]?.icon} {protectionTypes[cfg.protection_type]?.label || cfg.protection_type}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Threshold: <strong className="text-foreground">{cfg.threshold} conn/s</strong>
                    {cfg.description ? ` • ${cfg.description}` : ''}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={cfg.action === 'drop' ? 'destructive' : 'secondary'} className="text-xs">
                  {cfg.action}
                </Badge>
                <Switch checked={cfg.is_enabled} onCheckedChange={() => toggleConfig(cfg.id, cfg.is_enabled)} />
                <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => deleteConfig(cfg.id)}>
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ─── Main Export ───
export const FirewallManager = () => {
  const { isAdmin, isFounder } = useAuth();
  const canControl = isAdmin || isFounder;

  return (
    <GlassCard className="p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-lg bg-primary/10">
            <Shield className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h3 className="font-semibold text-lg">Firewall & Security</h3>
            <p className="text-sm text-muted-foreground">
              AI threat detection · UFW · Fail2Ban · Rate limiting · DDoS · IP control
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isFounder && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-orange-500/20 text-orange-400 border border-orange-500/30 font-medium">
              Founder
            </span>
          )}
          {isAdmin && !isFounder && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-primary/20 text-primary border border-primary/30 font-medium">
              Admin
            </span>
          )}
          {!canControl && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-muted/40 text-muted-foreground border border-border font-medium">
              View only
            </span>
          )}
        </div>
      </div>

      {!canControl && (
        <div className="mb-4 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20 text-xs text-yellow-600 dark:text-yellow-400 flex items-center gap-2">
          <Lock className="h-4 w-4 shrink-0" />
          Read-only access. Admin or Founder role required to create, modify, or delete firewall rules.
        </div>
      )}

      <Tabs defaultValue="ai" className="space-y-4">
        <TabsList className="grid grid-cols-6 w-full">
          <TabsTrigger value="ai" className="gap-1 text-xs">
            <Brain className="h-3 w-3" /> AI
          </TabsTrigger>
          <TabsTrigger value="ufw" className="gap-1 text-xs">
            <Shield className="h-3 w-3" /> UFW
          </TabsTrigger>
          <TabsTrigger value="fail2ban" className="gap-1 text-xs">
            <Ban className="h-3 w-3" /> Fail2Ban
          </TabsTrigger>
          <TabsTrigger value="ratelimit" className="gap-1 text-xs">
            <Gauge className="h-3 w-3" /> Rate Limit
          </TabsTrigger>
          <TabsTrigger value="ddos" className="gap-1 text-xs">
            <Zap className="h-3 w-3" /> DDoS
          </TabsTrigger>
          <TabsTrigger value="iplist" className="gap-1 text-xs">
            <Globe className="h-3 w-3" /> IP List
          </TabsTrigger>
        </TabsList>

        <TabsContent value="ai"><AIFirewallTab /></TabsContent>
        <TabsContent value="ufw"><UfwRulesTab /></TabsContent>
        <TabsContent value="fail2ban"><Fail2BanTab /></TabsContent>
        <TabsContent value="ratelimit"><RateLimitTab /></TabsContent>
        <TabsContent value="ddos"><DDoSProtectionTab /></TabsContent>
        <TabsContent value="iplist"><IpAccessListTab /></TabsContent>
      </Tabs>

      <div className="mt-6 p-4 rounded-lg bg-secondary/20 border border-border/50">
        <h4 className="text-sm font-medium mb-2">🔒 Recommended Ports for Blockchain Node</h4>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
          <div className="p-2 rounded bg-secondary/30"><p className="font-mono font-bold">22/TCP</p><p className="text-muted-foreground">SSH</p></div>
          <div className="p-2 rounded bg-secondary/30"><p className="font-mono font-bold">80/TCP</p><p className="text-muted-foreground">HTTP</p></div>
          <div className="p-2 rounded bg-secondary/30"><p className="font-mono font-bold">443/TCP</p><p className="text-muted-foreground">HTTPS/WSS</p></div>
          <div className="p-2 rounded bg-secondary/30"><p className="font-mono font-bold">30303/TCP+UDP</p><p className="text-muted-foreground">P2P Sync</p></div>
          <div className="p-2 rounded bg-secondary/30"><p className="font-mono font-bold">8545/TCP</p><p className="text-muted-foreground">RPC</p></div>
          <div className="p-2 rounded bg-secondary/30"><p className="font-mono font-bold">8546/TCP</p><p className="text-muted-foreground">WebSocket</p></div>
          <div className="p-2 rounded bg-secondary/30"><p className="font-mono font-bold">51820/UDP</p><p className="text-muted-foreground">WireGuard</p></div>
          <div className="p-2 rounded bg-secondary/30"><p className="font-mono font-bold">5432/TCP</p><p className="text-muted-foreground">PostgreSQL</p></div>
        </div>
      </div>
    </GlassCard>
  );
};
