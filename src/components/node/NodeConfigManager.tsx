import { useState, useEffect } from 'react';
import { GlassCard } from '../ui/GlassCard';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Badge } from '../ui/badge';
import { useToast } from '@/hooks/use-toast';
import { api } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import {
  Server, Monitor, Plus, Download, Upload, Trash2, RefreshCw,
  CheckCircle2, XCircle, Globe, Wifi, WifiOff, Settings, Link,
  Loader2, ExternalLink,
} from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Textarea } from '../ui/textarea';

interface NodeEntry {
  id: string;
  node_type: string;
  is_online: boolean;
  is_synced: boolean;
  is_approved: boolean;
  hostname: string | null;
  ip_address: string | null;
  rpc_port: number | null;
  last_heartbeat: string | null;
  wireguard_public_key: string | null;
  hash_rate: number;
  peer_count: number;
  sync_progress: number;
  // camelCase variants from Drizzle
  isOnline?: boolean;
  isSynced?: boolean;
  isApproved?: boolean;
  nodeType?: string;
  ipAddress?: string | null;
  rpcPort?: number | null;
  lastHeartbeat?: string | null;
  wireguardPublicKey?: string | null;
  hashRate?: number;
  peerCount?: number;
  syncProgress?: number;
}

function normalizeNode(n: any): NodeEntry {
  return {
    id: n.id,
    node_type:          n.node_type   ?? n.nodeType   ?? '',
    is_online:          n.is_online   ?? n.isOnline   ?? false,
    is_synced:          n.is_synced   ?? n.isSynced   ?? false,
    is_approved:        n.is_approved ?? n.isApproved ?? false,
    hostname:           n.hostname    ?? null,
    ip_address:         n.ip_address  ?? n.ipAddress  ?? null,
    rpc_port:           n.rpc_port    ?? n.rpcPort    ?? null,
    last_heartbeat:     n.last_heartbeat ?? n.lastHeartbeat ?? null,
    wireguard_public_key: n.wireguard_public_key ?? n.wireguardPublicKey ?? null,
    hash_rate:          n.hash_rate   ?? n.hashRate   ?? 0,
    peer_count:         n.peer_count  ?? n.peerCount  ?? 0,
    sync_progress:      n.sync_progress ?? n.syncProgress ?? 0,
  };
}

function parseRpcUrl(url: string): { hostname: string | null; port: number | null } {
  try {
    const u = new URL(url.startsWith('http') ? url : `https://${url}`);
    const port = u.port ? parseInt(u.port) : (u.protocol === 'https:' ? 443 : 80);
    return { hostname: u.hostname, port };
  } catch {
    return { hostname: null, port: null };
  }
}

const NODE_TYPES_USER   = ['litenode'];
const NODE_TYPES_ADMIN  = ['litenode', 'fullnode', 'rpc', 'boostnode', 'validator', 'genesis', 'bootnode'];

export const NodeConfigManager = () => {
  const { user, isFounder, isAdmin } = useAuth();
  const { toast } = useToast();
  const [nodes, setNodes] = useState<NodeEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [newNodeType, setNewNodeType] = useState<string>('litenode');
  const [newNodeRpc, setNewNodeRpc] = useState('https://rpc.netlifegy.com');
  const [importContent, setImportContent] = useState('');
  const [saving, setSaving] = useState(false);
  const [envRpcUrl, setEnvRpcUrl] = useState('');
  const [savingEnv, setSavingEnv] = useState(false);
  const [loadingEnv, setLoadingEnv] = useState(false);

  const fetchNodes = async () => {
    if (!user) return;
    setLoading(true);
    const data = await api.get('/api/nodes').catch(() => null);
    if (Array.isArray(data)) setNodes((data as any[]).map(normalizeNode));
    setLoading(false);
  };

  const fetchEnvRpc = async () => {
    if (!isAdmin && !isFounder) return;
    setLoadingEnv(true);
    try {
      const data = await api.get('/api/admin/rpc-url').catch(() => null);
      if (data?.rpcUrl) setEnvRpcUrl(data.rpcUrl);
    } finally {
      setLoadingEnv(false);
    }
  };

  useEffect(() => {
    fetchNodes();
    fetchEnvRpc();
  }, [user]);

  const addNode = async () => {
    if (!user) return;
    setSaving(true);
    const { hostname, port } = parseRpcUrl(newNodeRpc);
    try {
      await api.post('/api/nodes', {
        nodeType: newNodeType,
        hostname:  hostname  ?? undefined,
        rpcPort:   port      ?? 8545,
        isApproved: (isFounder || isAdmin) ? true : false,
      });
      toast({ title: '✅ Node registered', description: `${newNodeType} added successfully` });
      setAddDialogOpen(false);
      fetchNodes();
    } catch (error: any) {
      toast({ title: 'Failed to add node', description: error.message, variant: 'destructive' });
    }
    setSaving(false);
  };

  const saveEnvRpcUrl = async () => {
    if (!envRpcUrl.trim()) return;
    setSavingEnv(true);
    try {
      await fetch('/api/admin/rpc-url', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rpcUrl: envRpcUrl.trim() }),
      });
      toast({ title: '✅ RPC URL saved to .env', description: 'GYDS_RPC_URL updated' });
    } catch (e: any) {
      toast({ title: 'Save failed', description: e.message, variant: 'destructive' });
    }
    setSavingEnv(false);
  };

  const addEnvNodeAsRegistered = async () => {
    if (!envRpcUrl.trim() || !user) return;
    setSavingEnv(true);
    const { hostname, port } = parseRpcUrl(envRpcUrl);
    try {
      await api.post('/api/nodes', {
        nodeType: 'rpc',
        hostname:  hostname ?? undefined,
        rpcPort:   port ?? 8545,
        isApproved: true,
      });
      toast({ title: '✅ RPC node registered', description: `${envRpcUrl} added as an approved RPC node` });
      fetchNodes();
    } catch (e: any) {
      toast({ title: 'Failed', description: e.message, variant: 'destructive' });
    }
    setSavingEnv(false);
  };

  const removeNode = async (id: string) => {
    try {
      await api.delete(`/api/nodes/${id}`);
    } catch (error: any) {
      toast({ title: 'Cannot delete node', description: 'You may not have permission.', variant: 'destructive' });
      return;
    }
    toast({ title: 'Node removed' });
    fetchNodes();
  };

  const exportNodesConfig = () => {
    const config = {
      version: '1.0',
      network: 'GYDS Mainnet',
      chain_id: 13370,
      generated_at: new Date().toISOString(),
      rpc_endpoints: [envRpcUrl || 'https://rpc.netlifegy.com'].filter(Boolean),
      nodes: nodes.map(n => ({
        id: n.id,
        type: n.node_type,
        approved: n.is_approved,
        hostname: n.hostname,
        wireguard_pubkey: n.wireguard_public_key || null,
      })),
    };
    const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'gyds-nodes.json';
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: 'Node config exported', description: 'gyds-nodes.json downloaded' });
  };

  const importNodesConfig = async () => {
    try {
      const config = JSON.parse(importContent);
      if (!config.nodes || !Array.isArray(config.nodes)) throw new Error('Invalid config: missing nodes array');
      let added = 0;
      for (const node of config.nodes) {
        try {
          await api.post('/api/nodes', {
            nodeType: node.type || 'litenode',
            hostname: node.hostname || undefined,
            wireguardPublicKey: node.wireguard_pubkey || null,
            isApproved: (isFounder || isAdmin),
          });
          added++;
        } catch { }
      }
      toast({ title: `Imported ${added} nodes`, description: `${config.nodes.length - added} failed` });
      setImportDialogOpen(false);
      setImportContent('');
      fetchNodes();
    } catch (e: any) {
      toast({ title: 'Import failed', description: e.message, variant: 'destructive' });
    }
  };

  const availableTypes = (isAdmin || isFounder) ? NODE_TYPES_ADMIN : NODE_TYPES_USER;

  return (
    <GlassCard className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Globe className="h-6 w-6 text-primary" />
          <div>
            <h3 className="text-lg font-semibold">Node Registry</h3>
            <p className="text-sm text-muted-foreground">{nodes.length} nodes registered</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={fetchNodes} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
          <Button variant="outline" size="sm" onClick={exportNodesConfig} disabled={nodes.length === 0}>
            <Download className="h-4 w-4 mr-1" /> Export
          </Button>
          <Dialog open={importDialogOpen} onOpenChange={setImportDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm">
                <Upload className="h-4 w-4 mr-1" /> Import
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Import Nodes Config</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <Label>Paste gyds-nodes.json content</Label>
                <Textarea
                  value={importContent}
                  onChange={(e) => setImportContent(e.target.value)}
                  rows={10}
                  placeholder='{"version":"1.0","nodes":[{"type":"litenode"}]}'
                />
                <Button onClick={importNodesConfig} className="w-full">Import Nodes</Button>
              </div>
            </DialogContent>
          </Dialog>
          <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-1">
                <Plus className="h-4 w-4" /> Add Node
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Register New Node</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Node Type</Label>
                  <Select value={newNodeType} onValueChange={setNewNodeType}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {availableTypes.map(t => (
                        <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>RPC Endpoint URL</Label>
                  <Input
                    value={newNodeRpc}
                    onChange={(e) => setNewNodeRpc(e.target.value)}
                    placeholder="https://rpc.netlifegy.com"
                  />
                  <p className="text-xs text-muted-foreground">
                    Hostname and port are extracted automatically from the URL.
                  </p>
                  {newNodeRpc && (() => {
                    const { hostname, port } = parseRpcUrl(newNodeRpc);
                    return hostname ? (
                      <p className="text-xs text-primary">
                        → Host: <code>{hostname}</code>  Port: <code>{port}</code>
                      </p>
                    ) : null;
                  })()}
                </div>
                <Button onClick={addNode} disabled={saving} className="w-full gap-2">
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  Register Node
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* .env RPC URL config (admin/founder only) */}
      {(isAdmin || isFounder) && (
        <div className="p-4 rounded-lg border border-primary/30 bg-primary/5 space-y-3">
          <div className="flex items-center gap-2">
            <Settings className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium">Global RPC URL (.env)</span>
          </div>
          <p className="text-xs text-muted-foreground">
            Set <code className="bg-secondary/50 px-1 rounded">GYDS_RPC_URL</code> in your .env file. Node scripts and clients will use this as the primary RPC endpoint.
          </p>
          <div className="flex gap-2">
            <Input
              value={envRpcUrl}
              onChange={e => setEnvRpcUrl(e.target.value)}
              placeholder="https://rpc.netlifegy.com"
              className="font-mono text-xs flex-1"
            />
            <Button size="sm" onClick={saveEnvRpcUrl} disabled={savingEnv || !envRpcUrl.trim()} className="shrink-0 gap-1">
              {savingEnv ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Settings className="h-3.5 w-3.5" />}
              Save to .env
            </Button>
            <Button size="sm" variant="outline" onClick={addEnvNodeAsRegistered} disabled={savingEnv || !envRpcUrl.trim()} className="shrink-0 gap-1">
              <Plus className="h-3.5 w-3.5" />
              Register
            </Button>
          </div>
          {envRpcUrl && (
            <a href={envRpcUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
              <ExternalLink className="h-3 w-3" /> Open {envRpcUrl}
            </a>
          )}
        </div>
      )}

      {/* Node List */}
      <div className="space-y-3">
        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : nodes.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Server className="h-8 w-8 mx-auto mb-2 opacity-40" />
            <p>No nodes registered.</p>
            <p className="text-xs mt-1">Click <strong>Add Node</strong> to register one, or use <strong>Register</strong> above to add your RPC URL.</p>
          </div>
        ) : (
          nodes.map((node) => (
            <div key={node.id} className="flex items-center justify-between p-4 rounded-xl bg-secondary/30 border border-border/30">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${node.node_type === 'fullnode' || node.node_type === 'validator' ? 'bg-amber-500/20' : 'bg-primary/20'}`}>
                  <Server className={`h-5 w-5 ${node.node_type === 'fullnode' || node.node_type === 'validator' ? 'text-amber-400' : 'text-primary'}`} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium capitalize">{node.node_type}</span>
                    {node.hostname && (
                      <code className="text-xs text-muted-foreground bg-secondary/50 px-1 rounded">
                        {node.hostname}{node.rpc_port ? `:${node.rpc_port}` : ''}
                      </code>
                    )}
                    <code className="text-xs text-muted-foreground">{(node.id ?? '').slice(0, 8)}</code>
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    {node.is_online ? (
                      <Badge variant="outline" className="text-xs border-emerald-500/30 text-emerald-400">
                        <Wifi className="h-3 w-3 mr-1" /> Online
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-xs border-destructive/30 text-destructive">
                        <WifiOff className="h-3 w-3 mr-1" /> Offline
                      </Badge>
                    )}
                    {node.is_approved ? (
                      <Badge variant="outline" className="text-xs border-emerald-500/30 text-emerald-400">
                        <CheckCircle2 className="h-3 w-3 mr-1" /> Approved
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-xs border-amber-500/30 text-amber-400">Pending</Badge>
                    )}
                    {node.is_synced && (
                      <Badge variant="outline" className="text-xs">Synced</Badge>
                    )}
                    {node.sync_progress > 0 && !node.is_synced && (
                      <span className="text-xs text-muted-foreground">Sync: {node.sync_progress}%</span>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {(isFounder || isAdmin) && (
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => removeNode(node.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </GlassCard>
  );
};
