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
  Activity
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
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

interface UserProfile {
  id: string;
  user_id: string;
  email: string | null;
  role: string;
  created_at: string;
}

interface NodeInstallation {
  id: string;
  user_id: string;
  node_type: string;
  wireguard_public_key: string | null;
  is_synced: boolean;
  is_approved: boolean;
  created_at: string;
  profiles?: { email: string | null };
}

const AdminContent = () => {
  const { user, isFounder, isAdmin } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [users, setUsers] = useState<UserProfile[]>([]);
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
    
    // Fetch users
    const { data: usersData } = await supabase
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (usersData) setUsers(usersData);

    // Fetch nodes (without foreign key join since it doesn't exist)
    const { data: nodesData } = await supabase
      .from('node_installations')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (nodesData) setNodes(nodesData as unknown as NodeInstallation[]);
    
    setLoading(false);
  };

  const handleApproveNode = async (nodeId: string, approve: boolean) => {
    const { error } = await supabase
      .from('node_installations')
      .update({ 
        is_approved: approve, 
        approved_by: user?.id,
        approved_at: approve ? new Date().toISOString() : null
      })
      .eq('id', nodeId);

    if (error) {
      toast({ title: 'Failed to update node', variant: 'destructive' });
    } else {
      toast({ title: approve ? 'Node approved!' : 'Node rejected' });
      fetchData();
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
          <p className="text-2xl font-bold">{users.length}</p>
          <p className="text-sm text-muted-foreground">Total Users</p>
        </GlassCard>
        <GlassCard className="p-4 text-center">
          <p className="text-2xl font-bold">{nodes.filter(n => n.node_type === 'litenode').length}</p>
          <p className="text-sm text-muted-foreground">Lite Nodes</p>
        </GlassCard>
        <GlassCard className="p-4 text-center">
          <p className="text-2xl font-bold">{nodes.filter(n => n.node_type === 'fullnode').length}</p>
          <p className="text-sm text-muted-foreground">Full Nodes</p>
        </GlassCard>
        <GlassCard className="p-4 text-center">
          <p className="text-2xl font-bold">{nodes.filter(n => !n.is_approved).length}</p>
          <p className="text-sm text-muted-foreground">Pending Approval</p>
        </GlassCard>
      </div>

      <Tabs defaultValue="nodes" className="space-y-4">
        <TabsList className="grid grid-cols-5 md:grid-cols-10 w-full">
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
        </TabsList>

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
          <GlassCard className="p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-3 rounded-lg bg-primary/20">
                <GitBranch className="h-6 w-6 text-primary" />
              </div>
              <div>
                <h3 className="font-semibold text-lg">GitHub Integration</h3>
                <p className="text-sm text-muted-foreground">Manage repository sync and deployments</p>
              </div>
            </div>
            <div className="space-y-4">
              <div className="p-4 rounded-lg bg-secondary/30 space-y-3">
                <h4 className="font-medium">Re-pull from GitHub</h4>
                <p className="text-sm text-muted-foreground">
                  Force a re-sync from the connected GitHub repository. This will pull the latest changes from the default branch.
                </p>
                <Button
                  variant="outline"
                  className="gap-2"
                  onClick={() => {
                    toast({ title: 'Re-pull initiated', description: 'Changes from GitHub will sync automatically. Go to Settings → GitHub to manage your repository connection.' });
                  }}
                >
                  <RefreshCw className="h-4 w-4" />
                  Re-pull from GitHub
                </Button>
              </div>
              <div className="p-4 rounded-lg bg-secondary/30 space-y-2">
                <h4 className="font-medium">Repository Info</h4>
                <p className="text-sm text-muted-foreground">
                  Your project automatically syncs with GitHub bidirectionally. Push changes to GitHub and they appear here, or make changes here and they push to GitHub.
                </p>
                <p className="text-xs text-muted-foreground">
                  To connect or manage your GitHub repository, go to <strong>Project Settings → GitHub</strong>.
                </p>
              </div>
            </div>
          </GlassCard>
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
              <GlassCard key={node.id} className={`p-4 ${!node.is_approved ? 'border-yellow-500/30' : ''}`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className={`p-3 rounded-lg ${node.node_type === 'fullnode' ? 'bg-yellow-500/20' : 'bg-primary/20'}`}>
                      <Server className={`h-5 w-5 ${node.node_type === 'fullnode' ? 'text-yellow-500' : 'text-primary'}`} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-medium">{node.node_type === 'fullnode' ? 'Full Node' : 'Lite Node'}</p>
                        {node.is_approved ? (
                          <Badge variant="outline" className="text-neon-emerald border-neon-emerald">Approved</Badge>
                        ) : (
                          <Badge variant="outline" className="text-yellow-500 border-yellow-500">Pending</Badge>
                        )}
                        {node.is_synced && (
                          <Badge variant="outline" className="text-primary border-primary">Synced</Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground">
                        User: {node.profiles?.email || 'Unknown'}
                      </p>
                      {node.wireguard_public_key && (
                        <div className="flex items-center gap-2 mt-1">
                          <Key className="h-3 w-3 text-muted-foreground" />
                          <code className="text-xs bg-background/50 px-2 py-0.5 rounded">
                            {node.wireguard_public_key.substring(0, 20)}...
                          </code>
                          <Button size="icon" variant="ghost" className="h-5 w-5" onClick={() => copyToClipboard(node.wireguard_public_key!)}>
                            <Copy className="h-3 w-3" />
                          </Button>
                        </div>
                      )}
                      <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                        <Clock className="h-3 w-3" />
                        {new Date(node.created_at).toLocaleString()}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    {!node.is_approved && (
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
                    {node.is_approved && (
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

        <TabsContent value="users" className="space-y-4">
          {loading ? (
            <GlassCard className="p-6 text-center">Loading...</GlassCard>
          ) : users.length === 0 ? (
            <GlassCard className="p-12 text-center">
              <Users className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">No users yet</p>
            </GlassCard>
          ) : (
            users.map((profile) => (
              <GlassCard key={profile.id} className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="p-3 rounded-lg bg-primary/20">
                      <Users className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <p className="font-medium">{profile.email || 'No email'}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge variant="outline" className={
                          profile.role === 'founder' ? 'text-yellow-500 border-yellow-500' :
                          profile.role === 'admin' ? 'text-primary border-primary' :
                          'text-muted-foreground border-muted-foreground'
                        }>
                          {profile.role}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          Joined {new Date(profile.created_at).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </GlassCard>
            ))
          )}
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
