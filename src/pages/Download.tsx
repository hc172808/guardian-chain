import { Layout } from '@/components/layout/Layout';
import { GlassCard } from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/button';
import { motion } from 'framer-motion';
import { 
  Download as DownloadIcon, 
  Server, 
  Monitor, 
  Shield, 
  Globe, 
  Terminal,
  HardDrive,
  Cpu,
  Lock,
  Copy,
  ExternalLink,
  Play,
  LogIn,
  Container,
  Code2,
  Layers,
  Rocket,
  BookOpen,
  Wallet,
  BarChart3,
  Droplets
} from 'lucide-react';
import { useState, useEffect } from 'react';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { useInstaller } from '@/hooks/useInstaller';
import { useNavigate } from 'react-router-dom';
import { NodeConfigManager } from '@/components/node/NodeConfigManager';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';

const DownloadPage = () => {
  const { toast } = useToast();
  const { user, isFounder, isAdmin } = useAuth();
  const { downloadAndInstall, installing } = useInstaller();
  const navigate = useNavigate();
  
  const [storageSize, setStorageSize] = useState(10);
  const [rpcEndpoint, setRpcEndpoint] = useState('https://rpc.netlifegy.com');
  const [enableMining, setEnableMining] = useState(false);
  const [nodeVis, setNodeVis] = useState({
    litenode: true,
    rpcnode: false,
    boostnode: false,
    fullnode: false,
    genesis: false,
    bootnode: false,
  });

  useEffect(() => {
    fetch('/api/node-visibility')
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data) setNodeVis(prev => ({ ...prev, ...data })); })
      .catch(() => {});
  }, []);

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "Copied!", description: `${label} copied to clipboard` });
  };

  const handleInstallLitenode = () => {
    if (!user) {
      toast({ title: 'Login Required', description: 'Please sign in to install a lite node.', variant: 'destructive' });
      navigate('/auth');
      return;
    }
    downloadAndInstall('litenode', { rpcEndpoint, storageSize, enableMining });
  };

  const handleInstallFullnode = () => {
    if (!user) {
      toast({ title: 'Login Required', description: 'Please sign in to install a full node.', variant: 'destructive' });
      navigate('/auth');
      return;
    }
    if (!isFounder && !isAdmin) {
      toast({ title: 'Access Denied', description: 'Full node installation is restricted to founders only.', variant: 'destructive' });
      return;
    }
    downloadAndInstall('fullnode');
  };

  const liteNodeCommand = `curl -sSL https://netlifegy.com/install-litenode.sh | RPC_ENDPOINTS="${rpcEndpoint}" STORAGE_SIZE=${storageSize} ENABLE_MINING=${enableMining} bash`;
  const fullNodeCommand = `curl -sSL https://netlifegy.com/install-fullnode.sh | sudo bash`;

  return (
    <Layout>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-8 max-w-6xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold mb-3">
            <span className="text-gradient-primary">GYDSchain</span> Ecosystem
          </h1>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            Deploy nodes, wallets, explorers, and developer tools — all from a single repository. One-command deployment per server.
          </p>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {[
            { label: 'Block Time', value: '5s' },
            { label: 'Chain ID', value: '13370' },
            { label: 'Consensus', value: 'PoS' },
            { label: 'Node Binary', value: 'gydsd' },
            { label: 'CLI Tool', value: 'gydsctl' },
          ].map((s, i) => (
            <GlassCard key={i} className="p-3 text-center">
              <p className="text-lg font-bold text-primary">{s.value}</p>
              <p className="text-xs text-muted-foreground">{s.label}</p>
            </GlassCard>
          ))}
        </div>

        <Tabs defaultValue="nodes" className="space-y-6">
          <TabsList className="grid grid-cols-3 md:grid-cols-6 w-full">
            <TabsTrigger value="nodes" className="gap-1.5 text-xs md:text-sm">
              <Server className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Nodes</span>
            </TabsTrigger>
            <TabsTrigger value="docker" className="gap-1.5 text-xs md:text-sm">
              <Layers className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Docker</span>
            </TabsTrigger>
            <TabsTrigger value="ecosystem" className="gap-1.5 text-xs md:text-sm">
              <Globe className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Ecosystem</span>
            </TabsTrigger>
            <TabsTrigger value="sdk" className="gap-1.5 text-xs md:text-sm">
              <Code2 className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">SDKs</span>
            </TabsTrigger>
            <TabsTrigger value="cli" className="gap-1.5 text-xs md:text-sm">
              <Terminal className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">CLI</span>
            </TabsTrigger>
            <TabsTrigger value="scripts" className="gap-1.5 text-xs md:text-sm">
              <Rocket className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Scripts</span>
            </TabsTrigger>
          </TabsList>

          {/* ===== NODES TAB ===== */}
          <TabsContent value="nodes" className="space-y-6">
            {/* Node Types Overview */}
            <div className="grid md:grid-cols-4 gap-4">
              {[
                { type: 'Validator', desc: 'PoS consensus, block production', icon: Shield, color: 'text-yellow-500', bg: 'bg-yellow-500/20' },
                { type: 'Full Node', desc: 'Complete blockchain, serves RPC', icon: Server, color: 'text-primary', bg: 'bg-primary/20' },
                { type: 'RPC Node', desc: 'Read-only API for wallets', icon: Globe, color: 'text-blue-400', bg: 'bg-blue-400/20' },
                { type: 'Lite Node', desc: 'SPV client, connects via VPN', icon: Monitor, color: 'text-emerald-400', bg: 'bg-emerald-400/20' },
              ].map((node, i) => (
                <GlassCard key={i} className="p-4 text-center">
                  <div className={`p-3 rounded-lg ${node.bg} w-fit mx-auto mb-3`}>
                    <node.icon className={`h-6 w-6 ${node.color}`} />
                  </div>
                  <h3 className="font-semibold">{node.type}</h3>
                  <p className="text-xs text-muted-foreground mt-1">{node.desc}</p>
                </GlassCard>
              ))}
            </div>

            {/* Lite Node Install — shown when nodeVis.litenode is true */}
            {nodeVis.litenode && (
              <GlassCard className="p-6">
                <div className="flex items-center gap-3 mb-6">
                  <div className="p-3 rounded-lg bg-primary/20">
                    <Monitor className="h-6 w-6 text-primary" />
                  </div>
                  <div>
                    <h2 className="text-xl font-semibold">Lite Node Installation</h2>
                    <p className="text-sm text-muted-foreground">Connect to the network, optional CPU mining for rewards</p>
                  </div>
                  <Badge variant="outline" className="ml-auto">Public</Badge>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                  {[
                    { icon: Globe, label: 'Multi-RPC Failover' },
                    { icon: Cpu, label: 'CPU/Browser Mining' },
                    { icon: HardDrive, label: 'Configurable Storage' },
                    { icon: Shield, label: 'SPV Validation' },
                  ].map((f, i) => (
                    <div key={i} className="flex items-center gap-2 text-sm">
                      <f.icon className="h-4 w-4 text-primary" />
                      <span>{f.label}</span>
                    </div>
                  ))}
                </div>

                {/* Configuration */}
                <div className="space-y-4 mb-6">
                  <div>
                    <label className="block text-sm font-medium mb-2">RPC Endpoint</label>
                    <input
                      type="text"
                      value={rpcEndpoint}
                      onChange={(e) => setRpcEndpoint(e.target.value)}
                      className="w-full px-4 py-2 rounded-lg bg-background/50 border border-border focus:border-primary focus:outline-none text-sm"
                      placeholder="https://rpc.netlifegy.com"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">Cache Storage: {storageSize}GB</label>
                    <input type="range" min="1" max="100" value={storageSize} onChange={(e) => setStorageSize(Number(e.target.value))} className="w-full accent-primary" />
                  </div>
                  <div className="flex items-center gap-3">
                    <input type="checkbox" id="mining" checked={enableMining} onChange={(e) => setEnableMining(e.target.checked)} className="w-4 h-4 accent-primary" />
                    <label htmlFor="mining" className="text-sm">Enable CPU mining for rewards</label>
                  </div>
                </div>

                <CommandBlock command={liteNodeCommand} label="Install Command" onCopy={copyToClipboard} />

                <div className="flex flex-wrap gap-3 mt-4">
                  <Button onClick={handleInstallLitenode} disabled={installing} className="gap-2" size="lg">
                    {installing ? <span className="animate-spin">⟳</span> : user ? <Play className="h-4 w-4" /> : <LogIn className="h-4 w-4" />}
                    {user ? 'Install Lite Node' : 'Sign In to Install'}
                  </Button>
                </div>
              </GlassCard>
            )}

            {/* RPC Node — Admin/Founder, shown when nodeVis.rpcnode is true */}
            {nodeVis.rpcnode && (isAdmin || isFounder) && (
              <GlassCard className="p-6 border-blue-400/30">
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-3 rounded-lg bg-blue-400/20">
                    <Globe className="h-6 w-6 text-blue-400" />
                  </div>
                  <div>
                    <h2 className="text-xl font-semibold">RPC Node</h2>
                    <p className="text-sm text-muted-foreground">Read-only API endpoint for wallets and explorers</p>
                  </div>
                  <Badge variant="outline" className="ml-auto border-blue-400 text-blue-400">Admin</Badge>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
                  {[
                    { icon: Globe, label: 'JSON-RPC on :8545' },
                    { icon: Server, label: 'WebSocket on :8546' },
                    { icon: Shield, label: 'Rate-limited' },
                  ].map((f, i) => (
                    <div key={i} className="flex items-center gap-2 text-sm">
                      <f.icon className="h-4 w-4 text-blue-400" />
                      <span>{f.label}</span>
                    </div>
                  ))}
                </div>
                <CommandBlock command={`curl -sSL https://netlifegy.com/install-node.sh | RPC_MODE=true RPC_ENDPOINT="${rpcEndpoint}" bash`} label="RPC Node Command" onCopy={copyToClipboard} />
                <p className="text-xs text-muted-foreground mt-3">Requirements: 2 GB RAM, 50 GB SSD, open ports 8545/8546</p>
              </GlassCard>
            )}

            {/* Boost Node — Admin/Founder, shown when nodeVis.boostnode is true */}
            {nodeVis.boostnode && (isAdmin || isFounder) && (
              <GlassCard className="p-6 border-emerald-400/30">
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-3 rounded-lg bg-emerald-400/20">
                    <Cpu className="h-6 w-6 text-emerald-400" />
                  </div>
                  <div>
                    <h2 className="text-xl font-semibold">Boost Node</h2>
                    <p className="text-sm text-muted-foreground">High-throughput relay node for transaction propagation</p>
                  </div>
                  <Badge variant="outline" className="ml-auto border-emerald-400 text-emerald-400">Admin</Badge>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
                  {[
                    { icon: Cpu, label: 'Relay transactions' },
                    { icon: Globe, label: 'Connect to peers' },
                    { icon: HardDrive, label: 'Minimal storage' },
                  ].map((f, i) => (
                    <div key={i} className="flex items-center gap-2 text-sm">
                      <f.icon className="h-4 w-4 text-emerald-400" />
                      <span>{f.label}</span>
                    </div>
                  ))}
                </div>
                <CommandBlock command={`curl -sSL https://netlifegy.com/install-node.sh | BOOST_MODE=true RPC_ENDPOINT="${rpcEndpoint}" bash`} label="Boost Node Command" onCopy={copyToClipboard} />
                <p className="text-xs text-muted-foreground mt-3">Requirements: 2 GB RAM, 20 GB SSD</p>
              </GlassCard>
            )}

            {/* Full Node / Validator — Founder only, shown when nodeVis.fullnode is true */}
            {nodeVis.fullnode && isFounder && (
              <GlassCard className="p-6 border-yellow-500/30">
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-3 rounded-lg bg-yellow-500/20">
                    <Lock className="h-6 w-6 text-yellow-500" />
                  </div>
                  <div>
                    <h2 className="text-xl font-semibold">Full Node / Validator</h2>
                    <p className="text-sm text-yellow-500">Founder only — PoS consensus, block production</p>
                  </div>
                  <Badge variant="outline" className="ml-auto border-yellow-500 text-yellow-500">Founder</Badge>
                </div>
                <CommandBlock command={fullNodeCommand} label="Install Command" onCopy={copyToClipboard} />
                <Button onClick={handleInstallFullnode} disabled={installing} className="gap-2 mt-4 bg-yellow-600 hover:bg-yellow-700" size="lg">
                  {installing ? <span className="animate-spin">⟳</span> : <Play className="h-4 w-4" />}
                  Install Full Node
                </Button>
              </GlassCard>
            )}

            {/* Genesis Node — Founder only, shown when nodeVis.genesis is true */}
            {nodeVis.genesis && isFounder && (
              <GlassCard className="p-6 border-purple-500/30">
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-3 rounded-lg bg-purple-500/20">
                    <Rocket className="h-6 w-6 text-purple-400" />
                  </div>
                  <div>
                    <h2 className="text-xl font-semibold">Genesis Node</h2>
                    <p className="text-sm text-purple-400">Founder only — bootstraps the chain from genesis block</p>
                  </div>
                  <Badge variant="outline" className="ml-auto border-purple-400 text-purple-400">Founder</Badge>
                </div>
                <CommandBlock command={`curl -sSL https://netlifegy.com/install-fullnode.sh | GENESIS=true CHAIN_ID=13370 sudo bash`} label="Genesis Command" onCopy={copyToClipboard} />
                <p className="text-xs text-muted-foreground mt-3">Requirements: 8 GB RAM, 200 GB SSD, static IP, static domain</p>
              </GlassCard>
            )}

            {/* Bootnode — Founder only, shown when nodeVis.bootnode is true */}
            {nodeVis.bootnode && isFounder && (
              <GlassCard className="p-6 border-orange-500/30">
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-3 rounded-lg bg-orange-500/20">
                    <Server className="h-6 w-6 text-orange-400" />
                  </div>
                  <div>
                    <h2 className="text-xl font-semibold">Bootnode</h2>
                    <p className="text-sm text-orange-400">Founder only — peer discovery entry point for new nodes</p>
                  </div>
                  <Badge variant="outline" className="ml-auto border-orange-400 text-orange-400">Founder</Badge>
                </div>
                <CommandBlock command={`curl -sSL https://netlifegy.com/install-node.sh | BOOTNODE=true sudo bash`} label="Bootnode Command" onCopy={copyToClipboard} />
                <p className="text-xs text-muted-foreground mt-3">Requirements: 1 GB RAM, 10 GB SSD, static IP on port 30301</p>
              </GlassCard>
            )}

            {/* No nodes visible message */}
            {!nodeVis.litenode && !(nodeVis.rpcnode && (isAdmin || isFounder)) && !(nodeVis.boostnode && (isAdmin || isFounder)) && !(nodeVis.fullnode && isFounder) && !(nodeVis.genesis && isFounder) && !(nodeVis.bootnode && isFounder) && (
              <GlassCard className="p-8 text-center">
                <Server className="h-12 w-12 mx-auto mb-3 text-muted-foreground opacity-40" />
                <p className="text-muted-foreground">No node installers are currently enabled by the admin.</p>
              </GlassCard>
            )}
          </TabsContent>

          {/* ===== DOCKER TAB ===== */}
          <TabsContent value="docker" className="space-y-6">
            <GlassCard className="p-6">
              <h2 className="text-xl font-semibold flex items-center gap-2 mb-4">
                <Layers className="h-5 w-5 text-primary" />
                Docker Deployment
              </h2>
              <p className="text-muted-foreground mb-6">Deploy the entire ecosystem with docker-compose — one command per server.</p>

              <div className="grid md:grid-cols-3 gap-4 mb-6">
                {[
                  { name: 'Full Stack', cmd: 'docker-compose up -d', desc: 'All services' },
                  { name: 'Nodes Only', cmd: 'docker-compose up -d gydsd-validator gydsd-rpc', desc: 'Validator + RPC' },
                  { name: 'Explorer + API', cmd: 'docker-compose up -d gyds-explorer gyds-indexer', desc: 'Explorer + Indexer' },
                ].map((item, i) => (
                  <div key={i} className="border border-border/50 rounded-lg p-4 space-y-2">
                    <h3 className="font-semibold text-sm">{item.name}</h3>
                    <p className="text-xs text-muted-foreground">{item.desc}</p>
                    <CommandBlock command={item.cmd} label={item.name} onCopy={copyToClipboard} small />
                  </div>
                ))}
              </div>

              <h3 className="font-semibold mb-3">Services</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/50">
                      <th className="text-left py-2 font-medium text-muted-foreground">Service</th>
                      <th className="text-left py-2 font-medium text-muted-foreground">Container</th>
                      <th className="text-left py-2 font-medium text-muted-foreground">Port</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      ['Validator Node', 'gydsd-validator', '30303'],
                      ['RPC Node', 'gydsd-rpc', '8545'],
                      ['WebSocket', 'gydsd-ws', '8546'],
                      ['Explorer', 'gyds-explorer', '3000'],
                      ['Indexer (PG)', 'gyds-indexer', '5432'],
                      ['Staking UI', 'gyds-staking', '3001'],
                      ['Testnet', 'gydsd-testnet', '18545'],
                      ['Faucet', 'gyds-faucet', '8080'],
                    ].map(([service, container, port], i) => (
                      <tr key={i} className="border-b border-border/20">
                        <td className="py-2">{service}</td>
                        <td className="py-2"><code className="text-xs bg-background/50 px-1.5 py-0.5 rounded">{container}</code></td>
                        <td className="py-2 text-muted-foreground">{port}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </GlassCard>
          </TabsContent>

          {/* ===== ECOSYSTEM TAB ===== */}
          <TabsContent value="ecosystem" className="space-y-6">
            <div className="grid md:grid-cols-2 gap-4">
              {[
                { title: 'Web Wallet', desc: 'Create/import wallets, send/receive, transaction history. AES-256-GCM encrypted seeds.', icon: Wallet, link: '/wallet' },
                { title: 'Block Explorer', desc: 'Search blocks, transactions, addresses. Real-time WebSocket updates.', icon: BarChart3, link: '/explorer' },
                { title: 'Staking Dashboard', desc: 'View validators, delegate/undelegate GYDS, track rewards and uptime.', icon: Shield, link: '/validators' },
                { title: 'DeFi Hub', desc: 'Swap tokens, provide liquidity, stake GYD, and participate in launches.', icon: Droplets, link: '/defi' },
                { title: 'Token Factory', desc: 'Create custom tokens on GYDSchain with configurable supply and authorities.', icon: Rocket, link: '/tokens' },
                { title: 'Testnet Faucet', desc: 'Get test tokens for development. Rate-limited: 100 GYDS/request, 1 req/hour.', icon: Globe, link: '#' },
              ].map((item, i) => (
                <div key={i} className="glass-card rounded-lg p-5 cursor-pointer hover:border-primary/50 transition-colors" onClick={() => navigate(item.link)}>
                  <div className="flex items-start gap-4">
                    <div className="p-3 rounded-lg bg-primary/20">
                      <item.icon className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <h3 className="font-semibold">{item.title}</h3>
                      <p className="text-sm text-muted-foreground mt-1">{item.desc}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </TabsContent>

          {/* ===== SDK TAB ===== */}
          <TabsContent value="sdk" className="space-y-6">
            <GlassCard className="p-6">
              <h2 className="text-xl font-semibold flex items-center gap-2 mb-4">
                <Code2 className="h-5 w-5 text-primary" />
                Developer SDKs
              </h2>
              <p className="text-muted-foreground mb-6">Integrate with GYDSchain from any language. All SDKs support wallet management, transaction signing, and RPC queries.</p>

              <div className="grid md:grid-cols-3 gap-6">
                {[
                  {
                    lang: 'JavaScript / TypeScript',
                    pkg: '@gydschain/sdk',
                    install: 'npm install @gydschain/sdk',
                    example: `import { GYDSClient } from '@gydschain/sdk';\n\nconst client = new GYDSClient('https://rpc.netlifegy.com');\nconst balance = await client.getBalance('0x...');`,
                  },
                  {
                    lang: 'Python',
                    pkg: 'gydschain-sdk',
                    install: 'pip install gydschain-sdk',
                    example: `from gydschain import GYDSClient\n\nclient = GYDSClient('https://rpc.netlifegy.com')\nbalance = client.get_balance('0x...')`,
                  },
                  {
                    lang: 'Go',
                    pkg: 'gydschain/sdk-go',
                    install: 'go get github.com/gydschain/sdk-go',
                    example: `import "github.com/gydschain/sdk-go"\n\nclient := sdk.NewClient("https://rpc.netlifegy.com")\nbalance, _ := client.GetBalance("0x...")`,
                  },
                ].map((sdk, i) => (
                  <div key={i} className="border border-border/50 rounded-lg p-4 space-y-3">
                    <div>
                      <h3 className="font-semibold">{sdk.lang}</h3>
                      <code className="text-xs text-muted-foreground">{sdk.pkg}</code>
                    </div>
                    <CommandBlock command={sdk.install} label={`${sdk.lang} install`} onCopy={copyToClipboard} small />
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-1">Quick Start</p>
                      <pre className="text-xs bg-background/80 border border-border/30 rounded p-3 overflow-x-auto font-mono text-foreground/80 whitespace-pre">
                        {sdk.example}
                      </pre>
                    </div>
                  </div>
                ))}
              </div>
            </GlassCard>

            {/* RPC Endpoints */}
            <GlassCard className="p-6">
              <h3 className="text-lg font-semibold mb-4">RPC Endpoints</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/50">
                      <th className="text-left py-2 font-medium text-muted-foreground">Endpoint</th>
                      <th className="text-left py-2 font-medium text-muted-foreground">Type</th>
                      <th className="text-left py-2 font-medium text-muted-foreground">Access</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      ['https://rpc.netlifegy.com', 'JSON-RPC', 'Public'],
                      ['https://rpc2.netlifegy.com', 'JSON-RPC (Backup)', 'Public'],
                      ['https://rpc3.netlifegy.com', 'JSON-RPC (Backup)', 'Public'],
                      ['wss://ws.netlifegy.com', 'WebSocket', 'Public'],
                      ['http://localhost:8546', 'Local RPC', 'Private'],
                      ['http://192.168.18.106:8546', 'LAN RPC', 'Private'],
                    ].map(([url, type, access], i) => (
                      <tr key={i} className="border-b border-border/20">
                        <td className="py-2">
                          <code className="text-xs bg-background/50 px-1.5 py-0.5 rounded">{url}</code>
                        </td>
                        <td className="py-2 text-muted-foreground text-xs">{type}</td>
                        <td className="py-2">
                          <Badge variant="outline" className="text-xs">{access}</Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </GlassCard>
          </TabsContent>

          {/* ===== CLI TAB ===== */}
          <TabsContent value="cli" className="space-y-6">
            <GlassCard className="p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-xl font-semibold flex items-center gap-2">
                    <Terminal className="h-5 w-5 text-primary" />
                    gydsctl CLI
                  </h2>
                  <p className="text-sm text-muted-foreground mt-1">Command-line tool for wallet, transaction, and staking operations</p>
                </div>
                <Button variant="outline" className="gap-2" onClick={() => navigate('/cli')}>
                  <BookOpen className="h-4 w-4" />
                  Full Reference
                </Button>
              </div>

              <div className="grid md:grid-cols-2 gap-4 mb-6">
                <CommandBlock command="curl -sSL https://netlifegy.com/install-cli.sh | bash" label="Install (Linux)" onCopy={copyToClipboard} small />
                <CommandBlock command="brew install gydschain/tap/gydsctl" label="Install (macOS)" onCopy={copyToClipboard} small />
              </div>

              <h3 className="font-semibold mb-3">Quick Reference</h3>
              <div className="grid gap-2">
                {[
                  { cmd: 'gydsctl wallet create', desc: 'Create new wallet' },
                  { cmd: 'gydsctl wallet balance <addr>', desc: 'Check balance' },
                  { cmd: 'gydsctl tx send --from <a> --to <b> --amount 100 --coin GYD', desc: 'Send tokens' },
                  { cmd: 'gydsctl stake delegate --validator <addr> --amount 1000', desc: 'Delegate stake' },
                  { cmd: 'gydsctl stake rewards --address <addr>', desc: 'View rewards' },
                  { cmd: 'gydsd init --chain-id 13370', desc: 'Initialize node' },
                  { cmd: 'gydsd start --rpc --ws --validator', desc: 'Start validator node' },
                  { cmd: 'gydsd status', desc: 'Node status' },
                ].map((item, i) => (
                  <div key={i} className="flex items-center justify-between gap-4 p-2 rounded border border-border/30 hover:bg-card/50">
                    <code className="text-xs font-mono text-primary">{item.cmd}</code>
                    <span className="text-xs text-muted-foreground whitespace-nowrap">{item.desc}</span>
                  </div>
                ))}
              </div>
            </GlassCard>
          </TabsContent>

          {/* ===== SCRIPTS TAB ===== */}
          <TabsContent value="scripts" className="space-y-6">
            <GlassCard className="p-6">
              <h2 className="text-xl font-semibold flex items-center gap-2 mb-4">
                <Rocket className="h-5 w-5 text-primary" />
                Deployment Scripts
              </h2>
              <p className="text-muted-foreground mb-6">One-command deployment per server. All scripts target Ubuntu 22.04 LTS.</p>

              <div className="grid gap-4">
                {[
                  { script: 'install-node.sh validator', desc: 'Deploy a PoS validator node with key generation', requirements: '4GB RAM, 100GB SSD, static IP' },
                  { script: 'install-node.sh fullnode', desc: 'Deploy a full node that stores the complete blockchain', requirements: '4GB RAM, 100GB SSD' },
                  { script: 'install-node.sh rpc', desc: 'Deploy a read-only RPC node for wallets and explorers', requirements: '2GB RAM, 50GB SSD' },
                  { script: 'init-validator.sh', desc: 'Generate validator keys and register in genesis', requirements: 'Existing node installation' },
                  { script: 'deploy-ecosystem.sh', desc: 'Deploy wallet backend, explorer, and staking dashboard', requirements: '2GB RAM, 20GB SSD' },
                  { script: 'deploy-devtools.sh', desc: 'Deploy testnet nodes, faucet, SDKs, and CLI tools', requirements: '2GB RAM, 20GB SSD' },
                  { script: 'deploy-remote-fullnode.sh', desc: 'Deploy full node to a remote server via SSH', requirements: 'SSH access to target server' },
                  { script: 'ssl-setup.sh', desc: 'Configure Nginx + Let\'s Encrypt SSL for all subdomains', requirements: 'Domain pointed to server' },
                ].map((item, i) => (
                  <div key={i} className="border border-border/50 rounded-lg p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <code className="text-sm font-mono font-semibold text-primary">bash scripts/{item.script}</code>
                          <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => copyToClipboard(`bash scripts/${item.script}`, item.script)}>
                            <Copy className="h-3 w-3" />
                          </Button>
                        </div>
                        <p className="text-sm text-muted-foreground">{item.desc}</p>
                        <p className="text-xs text-muted-foreground/70 mt-1">Requirements: {item.requirements}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </GlassCard>

            {/* Multi-Server Architecture */}
            <GlassCard className="p-6">
              <h3 className="text-lg font-semibold mb-4">Multi-Server Architecture</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/50">
                      <th className="text-left py-2 font-medium text-muted-foreground">Server</th>
                      <th className="text-left py-2 font-medium text-muted-foreground">Role</th>
                      <th className="text-left py-2 font-medium text-muted-foreground">Command</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      ['Server 1', 'Validator + Full Node', 'install-node.sh validator'],
                      ['Server 2', 'RPC + Explorer', 'install-node.sh rpc && deploy-ecosystem.sh'],
                      ['Server 3', 'Testnet + Faucet', 'deploy-devtools.sh'],
                    ].map(([server, role, cmd], i) => (
                      <tr key={i} className="border-b border-border/20">
                        <td className="py-2 font-medium">{server}</td>
                        <td className="py-2 text-muted-foreground">{role}</td>
                        <td className="py-2"><code className="text-xs bg-background/50 px-1.5 py-0.5 rounded">{cmd}</code></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </GlassCard>
          </TabsContent>
        </Tabs>

        {/* Source Code - Founder Only */}
        {(isFounder || isAdmin) && (
          <GlassCard className="p-6 border-amber-500/30">
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <Lock className="h-5 w-5 text-amber-500" />
              Go Source Code (Founder Only)
            </h3>
            <p className="text-muted-foreground mb-4">Access the complete Go blockchain implementation source code.</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { name: 'Blockchain Core', path: '/docs?tab=blockchain-core' },
                { name: 'PoS Consensus', path: '/docs?tab=pos-consensus' },
                { name: 'Mining System', path: '/docs?tab=mining-system' },
                { name: 'RPC Server', path: '/docs?tab=rpc-server' },
              ].map((item) => (
                <Button key={item.name} variant="outline" size="sm" onClick={() => navigate(item.path)} className="gap-2 border-amber-500/50">
                  <ExternalLink className="h-3 w-3" />
                  {item.name}
                </Button>
              ))}
            </div>
          </GlassCard>
        )}

        {/* Node Registry */}
        {user && <NodeConfigManager />}
      </motion.div>
    </Layout>
  );
};

const CommandBlock = ({ command, label, onCopy, small }: { command: string; label: string; onCopy: (t: string, l: string) => void; small?: boolean }) => (
  <div className="relative">
    <pre className={`${small ? 'p-2 text-xs' : 'p-4 text-sm'} rounded-lg bg-background/80 border border-border/30 text-foreground/80 overflow-x-auto font-mono`}>
      {command}
    </pre>
    <Button size="icon" variant="ghost" className={`absolute ${small ? 'top-1 right-1 h-5 w-5' : 'top-2 right-2 h-7 w-7'}`} onClick={() => onCopy(command, label)}>
      <Copy className={small ? 'h-3 w-3' : 'h-4 w-4'} />
    </Button>
  </div>
);

export default DownloadPage;
