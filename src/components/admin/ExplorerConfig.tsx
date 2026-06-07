import { useState, useEffect } from 'react';
import { GlassCard } from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Search, Save, RefreshCw, Server, Globe, Database, Unlink, Link } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

const CONFIG_KEY = 'explorer_config';

interface ExplorerConfigData {
  mode: 'colocated' | 'standalone';
  explorerUrl: string;
  explorerPort: string;
  rpcHttpUrl: string;
  rpcWsUrl: string;
  indexerDbUrl: string;
  separateIndexer: boolean;
  indexerPort: string;
}

const DEFAULTS: ExplorerConfigData = {
  mode: 'colocated',
  explorerUrl: '',
  explorerPort: '4000',
  rpcHttpUrl: 'http://localhost:8545',
  rpcWsUrl: 'ws://localhost:8546',
  indexerDbUrl: '',
  separateIndexer: false,
  indexerPort: '4001',
};

export const ExplorerConfig = () => {
  const [cfg, setCfg] = useState<ExplorerConfigData>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    const fetch = async () => {
      setLoading(true);
      const { data } = await supabase
        .from('admin_config')
        .select('config_value')
        .eq('config_key', CONFIG_KEY)
        .maybeSingle();
      if (data?.config_value && typeof data.config_value === 'object' && !Array.isArray(data.config_value)) {
        setCfg({ ...DEFAULTS, ...(data.config_value as Partial<ExplorerConfigData>) });
      }
      setLoading(false);
    };
    fetch();
  }, []);

  const set = <K extends keyof ExplorerConfigData>(key: K, val: ExplorerConfigData[K]) =>
    setCfg(prev => ({ ...prev, [key]: val }));

  const save = async () => {
    setSaving(true);
    const { error } = await supabase
      .from('admin_config')
      .upsert({ config_key: CONFIG_KEY, config_value: cfg as any, updated_at: new Date().toISOString() }, { onConflict: 'config_key' });
    setSaving(false);
    if (error) {
      toast({ title: 'Failed to save', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Explorer config saved', description: 'Configuration applied.' });
    }
  };

  if (loading) {
    return (
      <GlassCard className="p-8 flex items-center justify-center gap-2 text-muted-foreground">
        <RefreshCw className="h-4 w-4 animate-spin" /> Loading config…
      </GlassCard>
    );
  }

  return (
    <div className="space-y-4">
      {/* Deployment Mode */}
      <GlassCard className="p-6 space-y-4">
        <div className="flex items-center gap-3 mb-2">
          <div className="p-3 rounded-lg bg-primary/20">
            <Search className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h3 className="font-semibold text-lg">Explorer Deployment Mode</h3>
            <p className="text-sm text-muted-foreground">
              Choose whether the block explorer runs on the same server as nodes or on a dedicated server.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {[
            {
              value: 'colocated' as const,
              icon: Link,
              label: 'Co-located with Nodes',
              desc: 'Explorer runs on the same machine as blockchain nodes. Simpler setup, single server.',
            },
            {
              value: 'standalone' as const,
              icon: Unlink,
              label: 'Standalone Explorer',
              desc: 'Explorer runs on a separate dedicated server. Better for high traffic and independent scaling.',
            },
          ].map(opt => (
            <button
              key={opt.value}
              onClick={() => set('mode', opt.value)}
              className={`p-4 rounded-lg border-2 text-left transition-all ${
                cfg.mode === opt.value
                  ? 'border-primary bg-primary/10'
                  : 'border-border hover:border-primary/40 bg-secondary/20'
              }`}
            >
              <div className="flex items-center gap-2 mb-2">
                <opt.icon className={`h-5 w-5 ${cfg.mode === opt.value ? 'text-primary' : 'text-muted-foreground'}`} />
                <span className="font-medium text-sm">{opt.label}</span>
                {cfg.mode === opt.value && <Badge className="ml-auto text-xs bg-primary/20 text-primary border-primary/30">Active</Badge>}
              </div>
              <p className="text-xs text-muted-foreground">{opt.desc}</p>
            </button>
          ))}
        </div>
      </GlassCard>

      {/* Explorer Endpoint */}
      <GlassCard className="p-6 space-y-4">
        <div className="flex items-center gap-2 mb-1">
          <Globe className="h-5 w-5 text-primary" />
          <h4 className="font-semibold">Explorer Endpoint</h4>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Explorer URL {cfg.mode === 'standalone' ? '(remote server)' : '(this server)'}</Label>
            <Input
              placeholder="https://explorer.netlifegy.com"
              value={cfg.explorerUrl}
              onChange={e => set('explorerUrl', e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Explorer Port</Label>
            <Input
              placeholder="4000"
              value={cfg.explorerPort}
              onChange={e => set('explorerPort', e.target.value)}
            />
          </div>
        </div>
      </GlassCard>

      {/* Node RPC Endpoints */}
      <GlassCard className="p-6 space-y-4">
        <div className="flex items-center gap-2 mb-1">
          <Server className="h-5 w-5 text-primary" />
          <h4 className="font-semibold">Node RPC Endpoints</h4>
          {cfg.mode === 'standalone' && (
            <Badge variant="outline" className="text-xs ml-auto">Explorer will connect to these remotely</Badge>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>HTTP RPC URL</Label>
            <Input
              placeholder="http://localhost:8545"
              value={cfg.rpcHttpUrl}
              onChange={e => set('rpcHttpUrl', e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>WebSocket RPC URL</Label>
            <Input
              placeholder="ws://localhost:8546"
              value={cfg.rpcWsUrl}
              onChange={e => set('rpcWsUrl', e.target.value)}
            />
          </div>
        </div>
      </GlassCard>

      {/* Indexer DB */}
      <GlassCard className="p-6 space-y-4">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <Database className="h-5 w-5 text-primary" />
            <h4 className="font-semibold">Block Indexer Database</h4>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Separate from main DB</span>
            <Switch checked={cfg.separateIndexer} onCheckedChange={v => set('separateIndexer', v)} />
          </div>
        </div>

        {cfg.separateIndexer ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2 md:col-span-2">
              <Label>Indexer Database URL</Label>
              <Input
                placeholder="postgresql://user:pass@host:5432/indexer_db"
                value={cfg.indexerDbUrl}
                onChange={e => set('indexerDbUrl', e.target.value)}
                type="password"
              />
              <p className="text-xs text-muted-foreground">Stored encrypted. This DB holds block/tx/event data separately from user data.</p>
            </div>
            <div className="space-y-2">
              <Label>Indexer API Port</Label>
              <Input
                placeholder="4001"
                value={cfg.indexerPort}
                onChange={e => set('indexerPort', e.target.value)}
              />
            </div>
          </div>
        ) : (
          <div className="p-3 rounded-lg bg-secondary/30 text-sm text-muted-foreground">
            Using the main Supabase database for block indexing. Switch the toggle above to use a dedicated indexer database (recommended for mainnet).
          </div>
        )}
      </GlassCard>

      <div className="flex justify-end">
        <Button onClick={save} disabled={saving} className="gap-2">
          {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save Explorer Config
        </Button>
      </div>
    </div>
  );
};
