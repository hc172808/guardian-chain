import { useState, useEffect } from 'react';
import { GlassCard } from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Server, Globe, Zap, Shield, Cpu, AlertTriangle, Save, RefreshCw } from 'lucide-react';

interface NodeVisibility {
  litenode: boolean;
  rpcnode: boolean;
  boostnode: boolean;
  fullnode: boolean;
  genesis: boolean;
  bootnode: boolean;
}

const DEFAULT_VISIBILITY: NodeVisibility = {
  litenode: true,
  rpcnode: false,
  boostnode: false,
  fullnode: false,
  genesis: false,
  bootnode: false,
};

interface NodeDef {
  id: keyof NodeVisibility;
  label: string;
  desc: string;
  icon: typeof Server;
  defaultAllowed: boolean;
  founderOnly: boolean;
  badge?: string;
}

const NODE_DEFS: NodeDef[] = [
  {
    id: 'litenode',
    label: 'Lite Node',
    desc: 'Lightweight cache+wallet node. Safe for all users. Connects to public RPC.',
    icon: Server,
    defaultAllowed: true,
    founderOnly: false,
    badge: 'Recommended for users',
  },
  {
    id: 'rpcnode',
    label: 'RPC Node',
    desc: 'Public-facing JSON-RPC endpoint node. Higher resource requirements.',
    icon: Globe,
    defaultAllowed: false,
    founderOnly: false,
    badge: 'Intermediate',
  },
  {
    id: 'boostnode',
    label: 'Boost Node',
    desc: 'High-performance relay/boost node for network performance.',
    icon: Zap,
    defaultAllowed: false,
    founderOnly: false,
    badge: 'Advanced',
  },
  {
    id: 'fullnode',
    label: 'Full Node',
    desc: 'Complete blockchain node with PoS consensus and mining. High storage required.',
    icon: Cpu,
    defaultAllowed: false,
    founderOnly: true,
    badge: 'Founder / Admin only',
  },
  {
    id: 'genesis',
    label: 'Genesis Node',
    desc: 'Genesis block seeder. Run ONCE to initialize the chain. Highly restricted.',
    icon: Shield,
    defaultAllowed: false,
    founderOnly: true,
    badge: 'Founder only',
  },
  {
    id: 'bootnode',
    label: 'Boot Node',
    desc: 'Peer discovery node. Used for network bootstrapping. No mining or RPC.',
    icon: Server,
    defaultAllowed: false,
    founderOnly: true,
    badge: 'Founder / Admin only',
  },
];

export function NodeVisibilitySettings() {
  const { toast } = useToast();
  const [visibility, setVisibility] = useState<NodeVisibility>(DEFAULT_VISIBILITY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    fetchVisibility();
  }, []);

  const fetchVisibility = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/node-visibility');
      if (res.ok) {
        const data = await res.json();
        setVisibility({ ...DEFAULT_VISIBILITY, ...data });
      }
    } catch {
      // use defaults silently
    } finally {
      setLoading(false);
    }
  };

  const toggle = (id: keyof NodeVisibility) => {
    setVisibility(prev => ({ ...prev, [id]: !prev[id] }));
    setDirty(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/node-visibility', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(visibility),
      });
      if (!res.ok) throw new Error(await res.text());
      setDirty(false);
      toast({ title: 'Saved', description: 'Node visibility settings updated.' });
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <GlassCard className="p-6 text-center text-muted-foreground">Loading node visibility settings…</GlassCard>;
  }

  const enabledCount = Object.values(visibility).filter(Boolean).length;

  return (
    <div className="space-y-4" data-testid="panel-node-visibility">
      <GlassCard className="p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-lg bg-primary/20">
              <Server className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h3 className="font-semibold text-lg">Node Type Visibility</h3>
              <p className="text-sm text-muted-foreground">
                Control which node types regular users can see and install.
                Founder-only types are always hidden from regular users regardless of this setting.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={fetchVisibility} className="gap-2">
              <RefreshCw className="h-3 w-3" />
              Refresh
            </Button>
            <Button
              size="sm"
              onClick={save}
              disabled={!dirty || saving}
              className="gap-2"
              data-testid="button-save-visibility"
            >
              <Save className="h-3 w-3" />
              {saving ? 'Saving…' : 'Save Changes'}
            </Button>
          </div>
        </div>

        {dirty && (
          <div className="flex items-center gap-2 p-3 mb-4 rounded-lg bg-yellow-500/10 border border-yellow-500/30 text-sm text-yellow-400">
            <AlertTriangle className="h-4 w-4 flex-shrink-0" />
            Unsaved changes — click Save Changes to apply
          </div>
        )}

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {NODE_DEFS.map((node) => {
            const Icon = node.icon;
            const isOn = visibility[node.id];
            return (
              <div
                key={node.id}
                className={`p-4 rounded-lg border transition-all ${
                  isOn
                    ? 'border-primary/50 bg-primary/5'
                    : 'border-border bg-secondary/20'
                }`}
                data-testid={`visibility-card-${node.id}`}
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2">
                    <Icon className={`h-4 w-4 ${isOn ? 'text-primary' : 'text-muted-foreground'}`} />
                    <span className="font-medium text-sm">{node.label}</span>
                  </div>
                  <Switch
                    checked={isOn}
                    onCheckedChange={() => toggle(node.id)}
                    data-testid={`switch-visibility-${node.id}`}
                    disabled={node.founderOnly && !isOn}
                  />
                </div>
                <p className="text-xs text-muted-foreground mb-2">{node.desc}</p>
                {node.badge && (
                  <Badge
                    variant={node.founderOnly ? 'destructive' : isOn ? 'default' : 'outline'}
                    className="text-xs"
                  >
                    {node.badge}
                  </Badge>
                )}
                {node.founderOnly && (
                  <p className="text-xs text-yellow-400/80 mt-1 flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3" />
                    Always restricted to founders/admins
                  </p>
                )}
              </div>
            );
          })}
        </div>

        <div className="mt-4 pt-4 border-t border-border/50 flex items-center justify-between text-sm text-muted-foreground">
          <span>{enabledCount} of {NODE_DEFS.length} node types enabled for users</span>
          <span className="text-xs">Changes apply immediately after saving</span>
        </div>
      </GlassCard>

      <GlassCard className="p-4">
        <h4 className="font-medium mb-2 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-yellow-400" />
          How this works
        </h4>
        <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
          <li>Disabled node types are hidden on the Download page and Install wizard</li>
          <li>Founder-only nodes (Full Node, Genesis, Boot Node) are always hidden from users regardless of this toggle</li>
          <li>Admin and Founder roles always see all node types</li>
          <li>Existing node registrations are not affected — only the UI visibility changes</li>
          <li>Portainer stack files for enabled nodes appear in the Download section</li>
        </ul>
      </GlassCard>
    </div>
  );
}
