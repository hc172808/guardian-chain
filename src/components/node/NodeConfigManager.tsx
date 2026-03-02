import { useState, useEffect } from 'react';
import { GlassCard } from '../ui/GlassCard';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Badge } from '../ui/badge';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import {
  Server,
  Monitor,
  Plus,
  Download,
  Upload,
  Trash2,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Globe,
  Wifi,
  WifiOff,
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
  last_heartbeat: string | null;
  wireguard_public_key: string | null;
  hash_rate: number;
  peer_count: number;
  sync_progress: number;
}

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

  const fetchNodes = async () => {
    if (!user) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('node_installations')
      .select('id,node_type,is_online,is_synced,is_approved,last_heartbeat,wireguard_public_key,hash_rate,peer_count,sync_progress')
      .order('created_at', { ascending: false });

    if (!error && data) {
      setNodes(data as NodeEntry[]);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchNodes();
  }, [user]);

  const addNode = async () => {
    if (!user) return;

    const { error } = await supabase.from('node_installations').insert({
      user_id: user.id,
      node_type: newNodeType,
      is_approved: newNodeType === 'fullnode' && (isFounder || isAdmin),
    });

    if (error) {
      toast({ title: 'Failed to add node', description: error.message, variant: 'destructive' });
      return;
    }

    toast({ title: 'Node Added', description: `${newNodeType} registered successfully.` });
    setAddDialogOpen(false);
    fetchNodes();
  };

  const removeNode = async (id: string) => {
    // Only admins/founders can delete nodes (RLS handles this)
    const { error } = await supabase.from('node_installations').delete().eq('id', id);
    if (error) {
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
      rpc_endpoints: [
        'https://rpc.netlifegy.com',
        'https://rpc2.netlifegy.com',
        'https://rpc3.netlifegy.com',
      ],
      nodes: nodes.map(n => ({
        id: n.id,
        type: n.node_type,
        approved: n.is_approved,
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
      if (!config.nodes || !Array.isArray(config.nodes)) {
        throw new Error('Invalid config: missing nodes array');
      }

      let added = 0;
      for (const node of config.nodes) {
        const { error } = await supabase.from('node_installations').insert({
          user_id: user!.id,
          node_type: node.type || 'litenode',
          wireguard_public_key: node.wireguard_pubkey || null,
          is_approved: node.type === 'fullnode' && (isFounder || isAdmin),
        });
        if (!error) added++;
      }

      toast({ title: `Imported ${added} nodes`, description: `${config.nodes.length - added} failed` });
      setImportDialogOpen(false);
      setImportContent('');
      fetchNodes();
    } catch (e: any) {
      toast({ title: 'Import failed', description: e.message, variant: 'destructive' });
    }
  };

  return (
    <GlassCard className="p-6">
      <div className="flex items-center justify-between mb-6">
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
              <DialogHeader>
                <DialogTitle>Import Nodes Config</DialogTitle>
              </DialogHeader>
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
              <DialogHeader>
                <DialogTitle>Register New Node</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label>Node Type</Label>
                  <Select value={newNodeType} onValueChange={setNewNodeType}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="litenode">Lite Node</SelectItem>
                      {(isFounder || isAdmin) && <SelectItem value="fullnode">Full Node</SelectItem>}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>RPC Endpoint</Label>
                  <Input value={newNodeRpc} onChange={(e) => setNewNodeRpc(e.target.value)} />
                </div>
                <Button onClick={addNode} className="w-full">Register Node</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Node List */}
      <div className="space-y-3">
        {loading ? (
          <div className="text-center py-8 text-muted-foreground">Loading nodes...</div>
        ) : nodes.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            No nodes registered. Click "Add Node" to register one.
          </div>
        ) : (
          nodes.map((node) => (
            <div key={node.id} className="flex items-center justify-between p-4 rounded-xl bg-secondary/30 border border-border/30">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${node.node_type === 'fullnode' ? 'bg-amber-500/20' : 'bg-primary/20'}`}>
                  {node.node_type === 'fullnode' ? (
                    <Server className={`h-5 w-5 ${node.node_type === 'fullnode' ? 'text-amber-400' : 'text-primary'}`} />
                  ) : (
                    <Monitor className="h-5 w-5 text-primary" />
                  )}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium capitalize">{node.node_type}</span>
                    <code className="text-xs text-muted-foreground">{node.id.slice(0, 8)}</code>
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
                      <Badge variant="outline" className="text-xs border-amber-500/30 text-amber-400">
                        Pending
                      </Badge>
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
