import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { GlassCard } from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import {
  Key, Copy, Trash2, Plus, Check, Eye, EyeOff,
  AlertTriangle, Activity, RefreshCw, Shield,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const api = {
  get: (url: string) => fetch(url, { credentials: 'include' }).then(r => r.json()),
  post: (url: string, body?: any) =>
    fetch(url, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(r => r.json()),
  del: (url: string) =>
    fetch(url, { method: 'DELETE', credentials: 'include' }).then(r => r.json()),
};

const SCOPES = [
  { id: 'read:chain',     label: 'Read Chain Data',    desc: 'Block height, transactions, validators' },
  { id: 'read:tokens',    label: 'Read Tokens',         desc: 'Token list and metadata' },
  { id: 'read:stats',     label: 'Read Network Stats',  desc: 'Network statistics and snapshots' },
  { id: 'write:tx',       label: 'Submit Transactions', desc: 'Broadcast signed transactions' },
  { id: 'read:wallet',    label: 'Read Wallet',         desc: 'Your wallet balances and history' },
];

function timeAgo(iso: string) {
  const d = Date.now() - new Date(iso).getTime();
  const m = Math.floor(d / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export function ApiKeyManager() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [selectedScopes, setSelectedScopes] = useState<string[]>(['read:chain', 'read:tokens', 'read:stats']);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [revealId, setRevealId] = useState<string | null>(null);

  const { data: keys = [], isLoading } = useQuery({
    queryKey: ['api-keys'],
    queryFn: () => api.get('/api/keys'),
    refetchInterval: 30000,
  });

  const createMutation = useMutation({
    mutationFn: () => api.post('/api/keys', { name: name.trim(), scopes: selectedScopes }),
    onSuccess: (data) => {
      if (data.key) {
        setNewKey(data.key);
        setCreating(false);
        setName('');
        setSelectedScopes(['read:chain', 'read:tokens', 'read:stats']);
        qc.invalidateQueries({ queryKey: ['api-keys'] });
      } else {
        toast({ title: 'Error', description: data.error ?? 'Failed to create key', variant: 'destructive' });
      }
    },
    onError: () => toast({ title: 'Error', description: 'Failed to create API key', variant: 'destructive' }),
  });

  const revokeMutation = useMutation({
    mutationFn: (id: string) => api.del(`/api/keys/${id}`),
    onSuccess: (_, id) => {
      toast({ title: 'Key revoked', description: 'The API key has been permanently revoked.' });
      qc.invalidateQueries({ queryKey: ['api-keys'] });
      if (revealId === id) setRevealId(null);
    },
    onError: () => toast({ title: 'Error', description: 'Failed to revoke key', variant: 'destructive' }),
  });

  const copy = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const toggleScope = (s: string) =>
    setSelectedScopes(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Key className="h-5 w-5 text-primary" /> API Keys
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Programmatic access to GYDSchain data. Each key has a 10,000 request/month limit.
          </p>
        </div>
        <Button size="sm" onClick={() => { setCreating(true); setNewKey(null); }} className="gap-1.5">
          <Plus className="h-4 w-4" /> New Key
        </Button>
      </div>

      {/* New key reveal */}
      {newKey && (
        <GlassCard className="p-4 border border-green-500/30 bg-green-500/5">
          <div className="flex items-start gap-3">
            <Shield className="h-5 w-5 text-green-400 mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-green-400">Key created — copy it now!</p>
              <p className="text-xs text-muted-foreground mt-0.5 mb-3">
                This is the only time your full key will be shown. Store it somewhere safe.
              </p>
              <div className="flex items-center gap-2">
                <code className="flex-1 font-mono text-xs bg-muted/30 border border-border/40 rounded px-3 py-2 break-all">
                  {newKey}
                </code>
                <Button size="sm" variant="outline" onClick={() => copy(newKey)} className="shrink-0 gap-1.5">
                  {copied ? <Check className="h-4 w-4 text-green-400" /> : <Copy className="h-4 w-4" />}
                  {copied ? 'Copied' : 'Copy'}
                </Button>
              </div>
            </div>
          </div>
        </GlassCard>
      )}

      {/* Create form */}
      {creating && (
        <GlassCard className="p-5 space-y-4 border border-primary/20">
          <h3 className="text-sm font-semibold">Create new API key</h3>

          <div>
            <Label className="text-xs">Key name</Label>
            <Input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. My trading bot"
              className="mt-1"
              maxLength={64}
              onKeyDown={e => e.key === 'Enter' && name.trim() && createMutation.mutate()}
            />
          </div>

          <div>
            <Label className="text-xs mb-2 block">Scopes</Label>
            <div className="space-y-2">
              {SCOPES.map(s => (
                <label
                  key={s.id}
                  className={cn(
                    'flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors',
                    selectedScopes.includes(s.id)
                      ? 'border-primary/40 bg-primary/5'
                      : 'border-border/40 hover:border-border'
                  )}
                >
                  <input
                    type="checkbox"
                    checked={selectedScopes.includes(s.id)}
                    onChange={() => toggleScope(s.id)}
                    className="accent-primary"
                  />
                  <div>
                    <p className="text-sm font-medium">{s.label}</p>
                    <p className="text-xs text-muted-foreground">{s.desc}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>

          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={() => createMutation.mutate()}
              disabled={!name.trim() || selectedScopes.length === 0 || createMutation.isPending}
            >
              {createMutation.isPending ? <RefreshCw className="h-4 w-4 animate-spin mr-1" /> : null}
              Create Key
            </Button>
            <Button size="sm" variant="outline" onClick={() => setCreating(false)}>Cancel</Button>
          </div>
        </GlassCard>
      )}

      {/* Key list */}
      <div className="space-y-3">
        {isLoading ? (
          <div className="text-center py-8 text-muted-foreground">
            <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-2" />
            Loading keys…
          </div>
        ) : keys.length === 0 ? (
          <GlassCard className="p-10 text-center text-muted-foreground">
            <Key className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p className="font-medium">No API keys yet</p>
            <p className="text-sm mt-1">Create your first key to start building.</p>
          </GlassCard>
        ) : (
          keys.map((k: any) => (
            <GlassCard key={k.id} className={cn('p-4', k.revoked && 'opacity-50')}>
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm">{k.name}</span>
                    {k.revoked && <Badge variant="destructive" className="text-xs">Revoked</Badge>}
                    {!k.revoked && k.expiresAt && new Date(k.expiresAt) < new Date() && (
                      <Badge variant="outline" className="text-xs border-amber-400/40 text-amber-400">Expired</Badge>
                    )}
                  </div>

                  <div className="flex items-center gap-2 mt-1">
                    <code className="text-xs font-mono text-muted-foreground">
                      {k.keyPrefix}…
                      {revealId === k.id
                        ? <span className="text-foreground"> (full key was shown only on creation)</span>
                        : null}
                    </code>
                    <button
                      onClick={() => setRevealId(revealId === k.id ? null : k.id)}
                      className="text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {revealId === k.id ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                    </button>
                  </div>

                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {(k.scopes ?? []).map((s: string) => (
                      <Badge key={s} variant="outline" className="text-[10px] py-0">{s}</Badge>
                    ))}
                  </div>

                  <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Activity className="h-3 w-3" />
                      {(k.requestCount ?? 0).toLocaleString()} / {(k.requestLimit ?? 10000).toLocaleString()} requests
                    </span>
                    {k.lastUsedAt && (
                      <span>Last used {timeAgo(k.lastUsedAt)}</span>
                    )}
                    <span>Created {k.createdAt ? timeAgo(k.createdAt) : '—'}</span>
                  </div>
                </div>

                {!k.revoked && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive hover:text-destructive hover:bg-destructive/10 shrink-0"
                    onClick={() => {
                      if (confirm(`Revoke key "${k.name}"? This cannot be undone.`)) {
                        revokeMutation.mutate(k.id);
                      }
                    }}
                    disabled={revokeMutation.isPending}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>

              {/* Usage bar */}
              <div className="mt-3">
                <div className="h-1.5 rounded-full bg-muted/40 overflow-hidden">
                  <div
                    className={cn(
                      'h-full rounded-full transition-all',
                      (k.requestCount / k.requestLimit) > 0.9 ? 'bg-red-500' :
                      (k.requestCount / k.requestLimit) > 0.7 ? 'bg-amber-500' : 'bg-primary'
                    )}
                    style={{ width: `${Math.min(100, (k.requestCount / k.requestLimit) * 100)}%` }}
                  />
                </div>
              </div>
            </GlassCard>
          ))
        )}
      </div>

      {/* Usage info */}
      <GlassCard className="p-4 border border-amber-500/20 bg-amber-500/5">
        <div className="flex items-start gap-3">
          <AlertTriangle className="h-4 w-4 text-amber-400 mt-0.5 shrink-0" />
          <div className="text-xs text-muted-foreground space-y-1">
            <p><strong className="text-foreground">Usage:</strong> Include your key in the <code className="bg-muted/40 px-1 rounded">X-API-Key</code> header with every request.</p>
            <p><strong className="text-foreground">Limits:</strong> 10,000 requests/month per key. 60 requests/minute burst limit.</p>
            <p><strong className="text-foreground">Security:</strong> Never expose your key in frontend code. Use it server-side only.</p>
          </div>
        </div>
      </GlassCard>
    </div>
  );
}
