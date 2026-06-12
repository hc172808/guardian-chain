import { useState, useEffect } from 'react';
import { Layout } from '@/components/layout/Layout';
import { RequireAuth } from '@/components/auth/RequireAuth';
import { GlassCard } from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/button';
import { motion } from 'framer-motion';
import { 
  Users, 
  Server, 
  Check, 
  X, 
  Shield, 
  Clock,
  Key,
  Copy,
  RefreshCw,
  Flame,
  Coins,
  Building2,
  GitBranch,
  ScrollText,
  Activity,
  Eye
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { useNavigate } from 'react-router-dom';
import { BurnMintManager } from '@/components/admin/BurnMintManager';
import { StablecoinManager } from '@/components/admin/StablecoinManager';
import { SponsorManager } from '@/components/admin/SponsorManager';
import { DatabaseSettings } from '@/components/admin/DatabaseSettings';
import { CoinLogoUpload } from '@/components/admin/CoinLogoUpload';
import { PremineManager } from '@/components/admin/PremineManager';
import { ValidatorManager } from '@/components/admin/ValidatorManager';
import { FirewallManager } from '@/components/admin/FirewallManager';
import { AuditLogViewer } from '@/components/admin/AuditLogViewer';
import { HealthCheck } from '@/components/admin/HealthCheck';
import { TokenPricingManager } from '@/components/admin/TokenPricingManager';
import { TokenManager } from '@/components/admin/TokenManager';
import { NodeInstaller } from '@/components/admin/NodeInstaller';
import { AdminConsole } from '@/components/admin/AdminConsole';
import { ComponentVisibility } from '@/components/admin/ComponentVisibility';
import { MainnetPromotion } from '@/components/admin/MainnetPromotion';
import { MiningPoolAdmin } from '@/components/admin/MiningPoolAdmin';
import { NodeVisibilitySettings } from '@/components/admin/NodeVisibilitySettings';
import { UserManager } from '@/components/admin/UserManager';
import { Terminal as TerminalIcon, EyeOff, Rocket, Pickaxe, Wrench, Link2, Search as SearchIcon } from 'lucide-react';
import { MaintenanceManager } from '@/components/admin/MaintenanceManager';
import { BridgeNetworkManager } from '@/components/admin/BridgeNetworkManager';
import { ExplorerConfig } from '@/components/admin/ExplorerConfig';
import { TestNodeManager } from '@/components/admin/TestNodeManager';
import { FlaskConical } from 'lucide-react';

function GitSyncPanel({ toast }: { toast: any }) {
  const [pulling, setPulling] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; stdout: string; stderr: string } | null>(null);

  const doPull = async () => {
    setPulling(true);
    setResult(null);
    try {
      const res = await fetch('/api/admin/git-pull', { method: 'POST' });
      const data = await res.json();
      setResult(data);
      toast({ title: data.ok ? 'Git pull succeeded' : 'Git pull failed', description: data.stdout?.slice(0, 100) || data.stderr?.slice(0, 100), variant: data.ok ? 'default' : 'destructive' });
    } catch (e: any) {
      toast({ title: 'Git pull error', description: e.message, variant: 'destructive' });
    } finally {
      setPulling(false);
    }
  };

  return (
    <GlassCard className="p-6">
      <div className="flex items-center gap-3 mb-4">
        <div className="p-3 rounded-lg bg-primary/20">
          <GitBranch className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h3 className="font-semibold text-lg">GitHub Sync</h3>
          <p className="text-sm text-muted-foreground">Pull latest code from GitHub and restart services</p>
        </div>
      </div>
      <div className="space-y-4">
        <div className="p-4 rounded-lg bg-secondary/30 space-y-3">
          <h4 className="font-medium">Pull from GitHub</h4>
          <p className="text-sm text-muted-foreground">
            Runs <code className="bg-black/30 px-1 rounded">git pull --ff-only</code> in the dashboard directory.
            After pulling, rebuild and restart:
            <code className="block bg-black/30 px-2 py-1 rounded mt-1 text-xs">npm run build && pm2 restart gydschain-api && nginx -s reload</code>
          </p>
          <Button variant="outline" className="gap-2" onClick={doPull} disabled={pulling}>
            <RefreshCw className={`h-4 w-4 ${pulling ? 'animate-spin' : ''}`} />
            {pulling ? 'Pulling…' : 'Git Pull'}
          </Button>
          {result && (
            <div className={`p-3 rounded text-xs font-mono whitespace-pre-wrap ${result.ok ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>
              {result.stdout || result.stderr || (result.ok ? 'Already up to date.' : 'Unknown error')}
            </div>
          )}
        </div>
        <div className="p-4 rounded-lg bg-secondary/30 space-y-2">
          <h4 className="font-medium">All Repositories</h4>
          <div className="text-xs text-muted-foreground space-y-1">
            {[
              ['Dashboard',  'hc172808/guardian-chain'],
              ['Full Node',  'hc172808/fullnode'],
              ['Lite Node',  'hc172808/litenode'],
              ['Boost Node', 'hc172808/boostnode'],
              ['RPC Node',   'hc172808/rpcnode'],
              ['Genesis',    'hc172808/genesis'],
            ].map(([name, repo]) => (
              <div key={repo} className="flex items-center justify-between">
                <span className="text-foreground">{name}</span>
                <a href={`https://github.com/${repo}`} target="_blank" rel="noreferrer" className="text-primary hover:underline">
                  github.com/{repo}
                </a>
              </div>
            ))}
          </div>
        </div>
      </div>
    </GlassCard>
  );
}

interface UserProfile {
  id: string;
  user_id: string;
  email: string | null;
  role: string;
  created_at: string;
}

interface NodeInstallation {
  id: string;
  userId: string;
  nodeType: string;
  wireguardPublicKey: string | null;
  isSynced: boolean;
  isApproved: boolean;
  createdAt: string;
  profiles?: { email: string | null };
}

const AdminContent = () => {
  const { user, isFounder, isAdmin } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [nodes, setNodes] = useState<NodeInstallation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isFounder && !isAdmin) {
      navigate('/');
      return;
    }
    fetchData();
  }, [isFounder, isAdmin, navigate]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const nodesRes = await fetch('/api/nodes', { credentials: 'include' }).then(r => r.ok ? r.json() : []);
      if (nodesRes) setNodes(Array.isArray(nodesRes) ? nodesRes : []);
    } catch (e) {
      toast({ title: 'Failed to load admin data', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const handleApproveNode = async (nodeId: string, approve: boolean) => {
    try {
      const res = await fetch(`/api/nodes/${nodeId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isApproved: approve, approvedBy: user?.id, approvedAt: approve ? new Date().toISOString() : null }),
      });
      if (!res.ok) throw new Error(await res.text());
      toast({ title: approve ? 'Node approved!' : 'Node rejected' });
      fetchData();
    } catch (e: any) {
      toast({ title: 'Failed to update node', description: e.message, variant: 'destructive' });
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: 'Copied!' });
  };

  if (!isFounder && !isAdmin) {
    return (
      <GlassCard className="p-12 text-center">
        <Shield className="w-12 h-12 mx-auto text-destructive mb-4" />
        <p className="text-xl font-semibold">Access Denied</p>
        <p className="text-muted-foreground">Founder/Admin access required</p>
      </GlassCard>
    );
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-3">
            <Shield className="w-8 h-8 text-primary" />
            Admin Dashboard
          </h1>
          <p className="text-muted-foreground mt-2">Manage users and approve node installations</p>
        </div>
        <Button variant="outline" onClick={fetchData} className="gap-2">
          <RefreshCw className="h-4 w-4" />
          Refresh
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <GlassCard className="p-4 text-center">
          <p className="text-2xl font-bold">{nodes.filter(n => n.nodeType === 'litenode').length}</p>
          <p className="text-sm text-muted-foreground">Lite Nodes</p>
        </GlassCard>
        <GlassCard className="p-4 text-center">
          <p className="text-2xl font-bold">{nodes.filter(n => n.nodeType === 'fullnode').length}</p>
          <p className="text-sm text-muted-foreground">Full Nodes</p>
        </GlassCard>
        <GlassCard className="p-4 text-center">
          <p className="text-2xl font-bold">{nodes.filter(n => !n.isApproved).length}</p>
          <p className="text-sm text-muted-foreground">Pending Approval</p>
        </GlassCard>
        <GlassCard className="p-4 text-center">
          <p className="text-2xl font-bold">{nodes.filter(n => n.isApproved).length}</p>
          <p className="text-sm text-muted-foreground">Approved</p>
        </GlassCard>
      </div>

      <Tabs defaultValue="nodes" className="space-y-4">
        <TabsList className="grid grid-cols-5 md:[grid-template-columns:repeat(15,minmax(0,1fr))] w-full">
          <TabsTrigger value="nodes" className="gap-2">
            <Server className="h-4 w-4" />
            <span className="hidden md:inline">Nodes</span>
          </TabsTrigger>
          <TabsTrigger value="validators" className="gap-2">
            <Shield className="h-4 w-4" />
            <span className="hidden md:inline">Validators</span>
          </TabsTrigger>
          <TabsTrigger value="users" className="gap-2">
            <Users className="h-4 w-4" />
            <span className="hidden md:inline">Users</span>
          </TabsTrigger>
          <TabsTrigger value="tokens" className="gap-2">
            <Flame className="h-4 w-4" />
            <span className="hidden md:inline">Burn/Mint</span>
          </TabsTrigger>
          <TabsTrigger value="stablecoin" className="gap-2">
            <Coins className="h-4 w-4" />
            <span className="hidden md:inline">GYD/GYDS</span>
          </TabsTrigger>
          <TabsTrigger value="sponsors" className="gap-2">
            <Building2 className="h-4 w-4" />
            <span className="hidden md:inline">Sponsors</span>
          </TabsTrigger>
          <TabsTrigger value="premine" className="gap-2">
            <Coins className="h-4 w-4" />
            <span className="hidden md:inline">Pre-mine</span>
          </TabsTrigger>
          <TabsTrigger value="logos" className="gap-2">
            <Coins className="h-4 w-4" />
            <span className="hidden md:inline">Logos</span>
          </TabsTrigger>
          <TabsTrigger value="database" className="gap-2">
            <Key className="h-4 w-4" />
            <span className="hidden md:inline">Database</span>
          </TabsTrigger>
          <TabsTrigger value="github" className="gap-2">
            <GitBranch className="h-4 w-4" />
            <span className="hidden md:inline">GitHub</span>
          </TabsTrigger>
          <TabsTrigger value="firewall" className="gap-2">
            <Shield className="h-4 w-4" />
            <span className="hidden md:inline">Firewall</span>
          </TabsTrigger>
          <TabsTrigger value="audit" className="gap-2">
            <ScrollText className="h-4 w-4" />
            <span className="hidden md:inline">Audit Log</span>
          </TabsTrigger>
          <TabsTrigger value="health" className="gap-2">
            <Activity className="h-4 w-4" />
            <span className="hidden md:inline">Health</span>
          </TabsTrigger>
          <TabsTrigger value="token-pricing" className="gap-2">
            <Coins className="h-4 w-4" />
            <span className="hidden md:inline">Pricing</span>
          </TabsTrigger>
          <TabsTrigger value="token-mgmt" className="gap-2">
            <Coins className="h-4 w-4" />
            <span className="hidden md:inline">Tokens</span>
          </TabsTrigger>
          <TabsTrigger value="installer" className="gap-2" data-testid="tab-installer">
            <Server className="h-4 w-4" />
            <span className="hidden md:inline">Install</span>
          </TabsTrigger>
          <TabsTrigger value="console" className="gap-2" data-testid="tab-console">
            <TerminalIcon className="h-4 w-4" />
            <span className="hidden md:inline">Console</span>
          </TabsTrigger>
          <TabsTrigger value="visibility" className="gap-2" data-testid="tab-visibility">
            <EyeOff className="h-4 w-4" />
            <span className="hidden md:inline">Visibility</span>
          </TabsTrigger>
          <TabsTrigger value="promotion" className="gap-2" data-testid="tab-promotion">
            <Rocket className="h-4 w-4" />
            <span className="hidden md:inline">Promotion</span>
          </TabsTrigger>
          <TabsTrigger value="pools" className="gap-2" data-testid="tab-pools">
            <Pickaxe className="h-4 w-4" />
            <span className="hidden md:inline">Pools</span>
          </TabsTrigger>
          <TabsTrigger value="maintenance" className="gap-2" data-testid="tab-maintenance">
            <Wrench className="h-4 w-4" />
            <span className="hidden md:inline">Maintenance</span>
          </TabsTrigger>
          <TabsTrigger value="bridge-networks" className="gap-2" data-testid="tab-bridge-networks">
            <Link2 className="h-4 w-4" />
            <span className="hidden md:inline">Bridge</span>
          </TabsTrigger>
          <TabsTrigger value="explorer-config" className="gap-2" data-testid="tab-explorer-config">
            <SearchIcon className="h-4 w-4" />
            <span className="hidden md:inline">Explorer</span>
          </TabsTrigger>
          <TabsTrigger value="node-types" className="gap-2" data-testid="tab-node-types">
            <Eye className="h-4 w-4" />
            <span className="hidden md:inline">Node Types</span>
          </TabsTrigger>
          <TabsTrigger value="test-nodes" className="gap-2" data-testid="tab-test-nodes">
            <FlaskConical className="h-4 w-4" />
            <span className="hidden md:inline">Test Nodes</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="maintenance">
          <MaintenanceManager />
        </TabsContent>

        <TabsContent value="bridge-networks">
          <BridgeNetworkManager />
        </TabsContent>

        <TabsContent value="explorer-config">
          <ExplorerConfig />
        </TabsContent>

        <TabsContent value="node-types">
          <NodeVisibilitySettings />
        </TabsContent>

        <TabsContent value="pools">
          <MiningPoolAdmin />
        </TabsContent>

        <TabsContent value="installer">
          <NodeInstaller />
        </TabsContent>

        <TabsContent value="console">
          <AdminConsole />
        </TabsContent>

        <TabsContent value="visibility">
          <ComponentVisibility />
        </TabsContent>

        <TabsContent value="promotion">
          <MainnetPromotion />
        </TabsContent>

        <TabsContent value="validators">
          <ValidatorManager />
        </TabsContent>

        <TabsContent value="tokens">
          <BurnMintManager />
        </TabsContent>

        <TabsContent value="stablecoin">
          <StablecoinManager />
        </TabsContent>

        <TabsContent value="sponsors">
          <SponsorManager />
        </TabsContent>

        <TabsContent value="premine">
          <PremineManager />
        </TabsContent>

        <TabsContent value="logos">
          <CoinLogoUpload />
        </TabsContent>

        <TabsContent value="database">
          <DatabaseSettings />
        </TabsContent>

        <TabsContent value="github">
          <GitSyncPanel toast={toast} />
        </TabsContent>

        <TabsContent value="firewall">
          <FirewallManager />
        </TabsContent>

        <TabsContent value="audit">
          <AuditLogViewer />
        </TabsContent>

        <TabsContent value="health">
          <HealthCheck />
        </TabsContent>

        <TabsContent value="token-pricing">
          <TokenPricingManager />
        </TabsContent>

        <TabsContent value="token-mgmt">
          <TokenManager />
        </TabsContent>

        <TabsContent value="nodes" className="space-y-4">
          {loading ? (
            <GlassCard className="p-6 text-center">Loading...</GlassCard>
          ) : nodes.length === 0 ? (
            <GlassCard className="p-12 text-center">
              <Server className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">No node installations yet</p>
            </GlassCard>
          ) : (
            nodes.map((node) => (
              <GlassCard key={node.id} className={`p-4 ${!node.isApproved ? 'border-yellow-500/30' : ''}`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className={`p-3 rounded-lg ${node.nodeType === 'fullnode' ? 'bg-yellow-500/20' : 'bg-primary/20'}`}>
                      <Server className={`h-5 w-5 ${node.nodeType === 'fullnode' ? 'text-yellow-500' : 'text-primary'}`} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-medium capitalize">{node.nodeType.replace('node', ' Node')}</p>
                        {node.isApproved ? (
                          <Badge variant="outline" className="text-green-400 border-green-400">Approved</Badge>
                        ) : (
                          <Badge variant="outline" className="text-yellow-500 border-yellow-500">Pending</Badge>
                        )}
                        {node.isSynced && (
                          <Badge variant="outline" className="text-primary border-primary">Synced</Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground">
                        User: {node.profiles?.email || node.userId?.slice(0, 12) || 'Unknown'}
                      </p>
                      {node.wireguardPublicKey && (
                        <div className="flex items-center gap-2 mt-1">
                          <Key className="h-3 w-3 text-muted-foreground" />
                          <code className="text-xs bg-background/50 px-2 py-0.5 rounded">
                            {node.wireguardPublicKey.substring(0, 20)}...
                          </code>
                          <Button size="icon" variant="ghost" className="h-5 w-5" onClick={() => copyToClipboard(node.wireguardPublicKey!)}>
                            <Copy className="h-3 w-3" />
                          </Button>
                        </div>
                      )}
                      <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                        <Clock className="h-3 w-3" />
                        {new Date(node.createdAt).toLocaleString()}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    {!node.isApproved && (
                      <>
                        <Button size="sm" onClick={() => handleApproveNode(node.id, true)} className="gap-1">
                          <Check className="h-4 w-4" />
                          Approve
                        </Button>
                        <Button size="sm" variant="destructive" onClick={() => handleApproveNode(node.id, false)} className="gap-1">
                          <X className="h-4 w-4" />
                          Reject
                        </Button>
                      </>
                    )}
                    {node.isApproved && (
                      <Button size="sm" variant="outline" onClick={() => handleApproveNode(node.id, false)}>
                        Revoke
                      </Button>
                    )}
                  </div>
                </div>
              </GlassCard>
            ))
          )}
        </TabsContent>

        <TabsContent value="users">
          <UserManager />
        </TabsContent>

        <TabsContent value="test-nodes">
          <TestNodeManager />
        </TabsContent>
      </Tabs>
    </motion.div>
  );
};

const AdminPage = () => (
  <Layout>
    <RequireAuth>
      <AdminContent />
    </RequireAuth>
  </Layout>
);

export default AdminPage;
