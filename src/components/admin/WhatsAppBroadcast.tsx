import { useState, useEffect } from 'react';
import { GlassCard } from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Switch } from '@/components/ui/switch';
import {
  Send, RefreshCw, MessageCircle, Users, AlertTriangle,
  CheckCircle2, XCircle
} from 'lucide-react';

interface UserWithWhatsApp {
  id: string;
  username: string;
  display_name: string;
  whatsapp_number: string;
  last_active?: string;
}

export function WhatsAppBroadcast() {
  const { toast } = useToast();
  const [users, setUsers] = useState<UserWithWhatsApp[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sending, setSending] = useState(false);
  const [results, setResults] = useState<{ ok: number; fail: number; errors: string[] }>({ ok: 0, fail: 0, errors: [] });
  const [showResults, setShowResults] = useState(false);
  const [dryRun, setDryRun] = useState(true);

  const loadUsers = async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/admin/users-whatsapp', { credentials: 'include' });
      if (r.ok) {
        const data = await r.json();
        const withWa = (data.users ?? []).map((u: any) => ({
          id: u.id,
          username: u.username,
          display_name: u.display_name || u.username,
          whatsapp_number: u.whatsapp_number || '',
        }));
        setUsers(withWa);
        setSelected(new Set(withWa.map((u: any) => u.id)));
      }
    } catch {}
    setLoading(false);
  };

  useEffect(() => { loadUsers(); }, []);

  const toggleUser = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === users.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(users.map(u => u.id)));
    }
  };

  const send = async () => {
    if (!message.trim()) {
      toast({ title: 'Message is empty', description: 'Enter a message to send.', variant: 'destructive' });
      return;
    }
    if (selected.size === 0) {
      toast({ title: 'No recipients', description: 'Select at least one user.', variant: 'destructive' });
      return;
    }
    if (dryRun) {
      toast({
        title: 'Dry run mode',
        description: `${selected.size} users would receive this message. Turn off dry run to actually send.`,
      });
      return;
    }

    setSending(true);
    setShowResults(true);
    setResults({ ok: 0, fail: 0, errors: [] });
    const targets = users.filter(u => selected.has(u.id));
    const numbers = targets.map(u => u.whatsapp_number);

    try {
      const r = await fetch('/api/admin/whatsapp-broadcast', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ numbers, message: message.trim() }),
      });
      const data = await r.json();
      const ok = data.sent ?? 0;
      const fail = data.failed ?? 0;
      const errors: string[] = data.errors ?? [];
      setResults({ ok, fail, errors });
      toast({
        title: 'Broadcast complete',
        description: `${ok} sent, ${fail} failed (${targets.length} total)`,
        variant: fail > 0 ? 'destructive' : 'default',
      });
    } catch (e: any) {
      setResults({ ok: 0, fail: targets.length, errors: [e.message] });
      toast({ title: 'Broadcast failed', description: e.message, variant: 'destructive' });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-4">
      <GlassCard className="p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-green-500/10 border border-green-500/20 flex items-center justify-center shrink-0">
              <MessageCircle className="w-5 h-5 text-green-400" />
            </div>
            <div>
              <h2 className="font-semibold text-foreground flex items-center gap-2">
                WhatsApp Broadcast
                <Badge variant="outline" className="text-[10px]">
                  {users.length} users
                </Badge>
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Send a WhatsApp message to all users who have a WhatsApp number in their profile.
                Uses the Meta WhatsApp Business Cloud API configured in the Settings tab.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Label className="text-xs text-muted-foreground">Dry run</Label>
            <Switch checked={dryRun} onCheckedChange={setDryRun} />
          </div>
        </div>
      </GlassCard>

      {/* Message composition */}
      <GlassCard className="p-6 space-y-4">
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground flex items-center gap-1">
            <MessageCircle className="w-3 h-3 text-green-400" /> Message
          </Label>
          <Textarea
            placeholder="Enter your WhatsApp broadcast message here..."
            value={message}
            onChange={e => setMessage(e.target.value)}
            rows={6}
          />
          <p className="text-[11px] text-muted-foreground">
            {message.length} characters · {selected.size} recipients ·
            {dryRun ? ' Dry run — no messages will be sent' : ' Live send — messages will be delivered'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={send} disabled={sending || !message.trim() || selected.size === 0} className="gap-2">
            {sending ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            {sending ? 'Sending...' : dryRun ? 'Preview (dry run)' : 'Send Broadcast'}
          </Button>
          <Button variant="outline" onClick={loadUsers} disabled={loading} className="gap-2">
            <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} /> Refresh list
          </Button>
        </div>
      </GlassCard>

      {/* Results */}
      {showResults && (
        <GlassCard className={`p-4 ${results.fail > 0 ? 'border-red-500/30' : 'border-green-500/30'}`}>
          <div className="flex items-center gap-2 text-sm">
            {results.fail === 0 ? (
              <CheckCircle2 className="w-4 h-4 text-green-400" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-red-400" />
            )}
            <span className="font-medium">
              {results.ok} sent, {results.fail} failed
            </span>
          </div>
          {results.errors.length > 0 && (
            <div className="mt-2 space-y-1 text-[11px] text-red-400/80 max-h-40 overflow-y-auto">
              {results.errors.slice(0, 5).map((e, i) => (
                <div key={i} className="flex items-start gap-1">
                  <XCircle className="w-3 h-3 mt-0.5 shrink-0" /> {e}
                </div>
              ))}
              {results.errors.length > 5 && (
                <div className="text-muted-foreground">+ {results.errors.length - 5} more errors</div>
              )}
            </div>
          )}
        </GlassCard>
      )}

      {/* Recipient list */}
      <GlassCard className="p-6 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Users className="w-4 h-4" /> Recipients
          </h3>
          <button onClick={toggleAll} className="text-xs text-primary hover:underline">
            {selected.size === users.length ? 'Deselect all' : 'Select all'}
          </button>
        </div>

        {loading ? (
          <div className="text-sm text-muted-foreground flex items-center gap-2">
            <RefreshCw className="w-4 h-4 animate-spin" /> Loading users...
          </div>
        ) : users.length === 0 ? (
          <div className="text-sm text-muted-foreground">
            No users have a WhatsApp number set yet. Users can add it in Profile → Info.
          </div>
        ) : (
          <div className="space-y-1 max-h-64 overflow-y-auto">
            {users.map(u => (
              <label
                key={u.id}
                className={`flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-colors ${
                  selected.has(u.id) ? 'bg-green-500/5' : 'hover:bg-muted/20'
                }`}
              >
                <input
                  type="checkbox"
                  checked={selected.has(u.id)}
                  onChange={() => toggleUser(u.id)}
                  className="w-4 h-4 accent-primary"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{u.display_name}</p>
                  <p className="text-[11px] text-muted-foreground">+{u.whatsapp_number} · @{u.username}</p>
                </div>
              </label>
            ))}
          </div>
        )}
      </GlassCard>
    </div>
  );
}
