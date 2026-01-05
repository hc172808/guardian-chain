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
  ExternalLink
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useState } from 'react';
import { useToast } from '@/hooks/use-toast';

const DownloadPage = () => {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<'fullnode' | 'litenode'>('litenode');
  const [storageSize, setStorageSize] = useState(10);
  const [rpcEndpoint, setRpcEndpoint] = useState('http://node1.chaincore.io:8546');
  const [enableMining, setEnableMining] = useState(false);

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: "Copied!",
      description: `${label} copied to clipboard`,
    });
  };

  const downloadFile = (path: string, filename: string) => {
    const link = document.createElement('a');
    link.href = path;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast({
      title: "Download Started",
      description: `${filename} is downloading...`,
    });
  };

  const liteNodeCommand = `curl -sSL https://chaincore.io/install-litenode.sh | RPC_ENDPOINTS="${rpcEndpoint}" STORAGE_SIZE=${storageSize} ENABLE_MINING=${enableMining} bash`;
  
  const fullNodeCommand = `curl -sSL https://chaincore.io/install-fullnode.sh | sudo bash`;

  return (
    <Layout>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="space-y-8 max-w-6xl mx-auto"
      >
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold mb-4">
            <span className="text-gradient-primary">Download</span> & Install
          </h1>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            Deploy ChainCore nodes on Ubuntu 22.04. Full nodes are founder-only for network security.
            Lite nodes are available for everyone to interact with the blockchain.
          </p>
        </div>

        {/* Node Type Selector */}
        <div className="flex justify-center gap-4 mb-8">
          <Button
            variant={activeTab === 'litenode' ? 'default' : 'outline'}
            onClick={() => setActiveTab('litenode')}
            className="gap-2"
          >
            <Monitor className="h-4 w-4" />
            Lite Node (Public)
          </Button>
          <Button
            variant={activeTab === 'fullnode' ? 'default' : 'outline'}
            onClick={() => setActiveTab('fullnode')}
            className="gap-2"
          >
            <Server className="h-4 w-4" />
            <Lock className="h-3 w-3" />
            Full Node (Founder Only)
          </Button>
        </div>

        {/* Lite Node Section */}
        {activeTab === 'litenode' && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-6"
          >
            <GlassCard className="p-6">
              <div className="flex items-center gap-3 mb-6">
                <div className="p-3 rounded-lg bg-primary/20">
                  <Monitor className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <h2 className="text-xl font-semibold">Lite Node Installation</h2>
                  <p className="text-sm text-muted-foreground">
                    Connect to the network via full nodes, optional mining for rewards
                  </p>
                </div>
              </div>

              {/* Features */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                {[
                  { icon: Globe, label: 'Connect to Full Nodes' },
                  { icon: Cpu, label: 'CPU/Browser Mining' },
                  { icon: HardDrive, label: 'Configurable Storage' },
                  { icon: Shield, label: 'SPV Validation' },
                ].map((feature, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm">
                    <feature.icon className="h-4 w-4 text-primary" />
                    <span>{feature.label}</span>
                  </div>
                ))}
              </div>

              {/* Configuration */}
              <div className="space-y-4 mb-6">
                <div>
                  <label className="block text-sm font-medium mb-2">Full Node RPC Endpoint</label>
                  <input
                    type="text"
                    value={rpcEndpoint}
                    onChange={(e) => setRpcEndpoint(e.target.value)}
                    className="w-full px-4 py-2 rounded-lg bg-background/50 border border-border focus:border-primary focus:outline-none"
                    placeholder="http://node.chaincore.io:8546"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium mb-2">
                    Cache Storage Size: {storageSize}GB
                  </label>
                  <input
                    type="range"
                    min="1"
                    max="100"
                    value={storageSize}
                    onChange={(e) => setStorageSize(Number(e.target.value))}
                    className="w-full accent-primary"
                  />
                </div>

                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    id="mining"
                    checked={enableMining}
                    onChange={(e) => setEnableMining(e.target.checked)}
                    className="w-4 h-4 accent-primary"
                  />
                  <label htmlFor="mining" className="text-sm">
                    Enable CPU mining for rewards
                  </label>
                </div>
              </div>

              {/* Install Command */}
              <div className="space-y-3">
                <label className="block text-sm font-medium">Quick Install (Ubuntu 22.04)</label>
                <div className="relative">
                  <pre className="p-4 rounded-lg bg-black/50 text-green-400 text-sm overflow-x-auto">
                    {liteNodeCommand}
                  </pre>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="absolute top-2 right-2"
                    onClick={() => copyToClipboard(liteNodeCommand, 'Install command')}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {/* Download Buttons */}
              <div className="flex flex-wrap gap-3 mt-6">
                <Button 
                  onClick={() => downloadFile('/scripts/install-litenode.sh', 'install-litenode.sh')}
                  className="gap-2"
                >
                  <Download className="h-4 w-4" />
                  Download Script
                </Button>
                <Button 
                  variant="outline"
                  onClick={() => window.open('/blockchain-go/cmd/litenode/main.go', '_blank')}
                  className="gap-2"
                >
                  <ExternalLink className="h-4 w-4" />
                  View Source Code
                </Button>
              </div>
            </GlassCard>

            {/* Lite Node Guide */}
            <GlassCard className="p-6">
              <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <Terminal className="h-5 w-5" />
                Installation Guide
              </h3>
              <div className="space-y-4">
                {[
                  { step: 1, title: 'Download the script', cmd: 'wget https://chaincore.io/install-litenode.sh' },
                  { step: 2, title: 'Make it executable', cmd: 'chmod +x install-litenode.sh' },
                  { step: 3, title: 'Run installation', cmd: `RPC_ENDPOINTS="${rpcEndpoint}" ./install-litenode.sh` },
                  { step: 4, title: 'Start the node', cmd: '~/.chaincore-lite/start.sh' },
                ].map((item) => (
                  <div key={item.step} className="flex gap-4">
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary font-semibold">
                      {item.step}
                    </div>
                    <div className="flex-1">
                      <p className="font-medium mb-1">{item.title}</p>
                      <code className="text-sm text-muted-foreground bg-black/30 px-2 py-1 rounded">
                        {item.cmd}
                      </code>
                    </div>
                  </div>
                ))}
              </div>
            </GlassCard>
          </motion.div>
        )}

        {/* Full Node Section */}
        {activeTab === 'fullnode' && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-6"
          >
            <GlassCard className="p-6 border-yellow-500/30">
              <div className="flex items-center gap-3 mb-6">
                <div className="p-3 rounded-lg bg-yellow-500/20">
                  <Lock className="h-6 w-6 text-yellow-500" />
                </div>
                <div>
                  <h2 className="text-xl font-semibold">Full Node Installation</h2>
                  <p className="text-sm text-yellow-500">
                    Founder access required - Full PoS validator capabilities
                  </p>
                </div>
              </div>

              {/* Warning */}
              <div className="p-4 rounded-lg bg-yellow-500/10 border border-yellow-500/30 mb-6">
                <p className="text-sm text-yellow-200">
                  <strong>⚠️ Founder Only:</strong> Full nodes require founder authentication and validator keys.
                  They participate in PoS consensus and serve RPC endpoints for lite nodes.
                </p>
              </div>

              {/* Features */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                {[
                  { icon: Shield, label: 'PoS Validator' },
                  { icon: Globe, label: 'RPC Provider' },
                  { icon: Server, label: 'Full Blockchain' },
                  { icon: Cpu, label: 'Mining Distribution' },
                ].map((feature, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm">
                    <feature.icon className="h-4 w-4 text-yellow-500" />
                    <span>{feature.label}</span>
                  </div>
                ))}
              </div>

              {/* Install Command */}
              <div className="space-y-3 mb-6">
                <label className="block text-sm font-medium">Quick Install (Ubuntu 22.04 - Root Required)</label>
                <div className="relative">
                  <pre className="p-4 rounded-lg bg-black/50 text-green-400 text-sm overflow-x-auto">
                    {fullNodeCommand}
                  </pre>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="absolute top-2 right-2"
                    onClick={() => copyToClipboard(fullNodeCommand, 'Install command')}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {/* Download Buttons */}
              <div className="flex flex-wrap gap-3">
                <Button 
                  onClick={() => downloadFile('/scripts/install-fullnode.sh', 'install-fullnode.sh')}
                  className="gap-2 bg-yellow-600 hover:bg-yellow-700"
                >
                  <Download className="h-4 w-4" />
                  Download Full Node Script
                </Button>
                <Button 
                  onClick={() => downloadFile('/scripts/deploy-remote-fullnode.sh', 'deploy-remote-fullnode.sh')}
                  variant="outline"
                  className="gap-2 border-yellow-500/50"
                >
                  <Globe className="h-4 w-4" />
                  Remote Deployment Script
                </Button>
              </div>
            </GlassCard>

            {/* Full Node Guide */}
            <GlassCard className="p-6">
              <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <Terminal className="h-5 w-5" />
                Full Node Deployment Guide
              </h3>
              <div className="space-y-4">
                {[
                  { step: 1, title: 'Prepare Ubuntu 22.04 server', desc: 'Minimum 4GB RAM, 100GB SSD, static IP' },
                  { step: 2, title: 'Download and run installer', cmd: 'sudo bash install-fullnode.sh' },
                  { step: 3, title: 'Configure validator key', desc: 'Keys are auto-generated in /var/lib/chaincore/keys/' },
                  { step: 4, title: 'Start the full node', cmd: 'sudo systemctl start chaincore-fullnode' },
                  { step: 5, title: 'Share RPC endpoint', desc: 'Lite nodes connect via http://YOUR_IP:8546' },
                ].map((item) => (
                  <div key={item.step} className="flex gap-4">
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-yellow-500/20 flex items-center justify-center text-yellow-500 font-semibold">
                      {item.step}
                    </div>
                    <div className="flex-1">
                      <p className="font-medium mb-1">{item.title}</p>
                      {item.cmd ? (
                        <code className="text-sm text-muted-foreground bg-black/30 px-2 py-1 rounded">
                          {item.cmd}
                        </code>
                      ) : (
                        <p className="text-sm text-muted-foreground">{item.desc}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </GlassCard>

            {/* Deploy Worldwide */}
            <GlassCard className="p-6">
              <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <Globe className="h-5 w-5" />
                Deploy Full Nodes Worldwide
              </h3>
              <p className="text-muted-foreground mb-4">
                Use the remote deployment script to install full nodes on servers around the world.
              </p>
              <div className="relative">
                <pre className="p-4 rounded-lg bg-black/50 text-green-400 text-sm overflow-x-auto">
{`# Deploy to a remote server
./deploy-remote-fullnode.sh

# You'll be prompted for:
# - Remote server IP
# - SSH credentials
# - Port configuration
# - Storage size`}
                </pre>
              </div>
            </GlassCard>
          </motion.div>
        )}

        {/* Source Code Downloads */}
        <GlassCard className="p-6">
          <h3 className="text-lg font-semibold mb-4">Go Source Code</h3>
          <p className="text-muted-foreground mb-4">
            Download the complete Go blockchain implementation to build from source.
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { name: 'Blockchain Core', path: '/blockchain-go/internal/blockchain/' },
              { name: 'PoS Consensus', path: '/blockchain-go/internal/consensus/' },
              { name: 'Mining System', path: '/blockchain-go/internal/mining/' },
              { name: 'RPC Server', path: '/blockchain-go/internal/rpc/' },
            ].map((item) => (
              <Button
                key={item.name}
                variant="outline"
                size="sm"
                onClick={() => window.open(item.path, '_blank')}
                className="gap-2"
              >
                <ExternalLink className="h-3 w-3" />
                {item.name}
              </Button>
            ))}
          </div>
        </GlassCard>
      </motion.div>
    </Layout>
  );
};

export default Download;
