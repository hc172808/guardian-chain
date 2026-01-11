import { Layout } from '@/components/layout/Layout';
import { GlassCard } from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { motion } from 'framer-motion';
import { 
  Network, 
  Wallet, 
  Copy, 
  Check, 
  ExternalLink, 
  Shield, 
  Zap,
  Globe,
  Server,
  Info
} from 'lucide-react';
import { useState } from 'react';
import { 
  NETWORK_CONFIG, 
  TESTNET_CONFIG, 
  addNetworkToWallet, 
  switchToNetwork,
  GAS_CONFIG 
} from '@/config/network';
import { TOKENOMICS } from '@/config/wallets';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

const NetworkPage = () => {
  const { toast } = useToast();
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);

  const copyToClipboard = (value: string, field: string) => {
    navigator.clipboard.writeText(value);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
    toast({
      title: 'Copied!',
      description: `${field} copied to clipboard`,
    });
  };

  const handleAddNetwork = async (isTestnet: boolean) => {
    setIsAdding(true);
    try {
      await addNetworkToWallet(isTestnet);
      toast({
        title: 'Network Added!',
        description: `${isTestnet ? 'GYDS Testnet' : 'GYDS Network'} has been added to your wallet`,
      });
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to add network',
        variant: 'destructive',
      });
    } finally {
      setIsAdding(false);
    }
  };

  const handleSwitchNetwork = async (isTestnet: boolean) => {
    try {
      await switchToNetwork(isTestnet);
      toast({
        title: 'Switched!',
        description: `Now connected to ${isTestnet ? 'GYDS Testnet' : 'GYDS Network'}`,
      });
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to switch network',
        variant: 'destructive',
      });
    }
  };

  const NetworkCard = ({ 
    config, 
    isTestnet 
  }: { 
    config: typeof NETWORK_CONFIG | typeof TESTNET_CONFIG; 
    isTestnet: boolean;
  }) => (
    <GlassCard className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className={`p-3 rounded-xl ${isTestnet ? 'bg-amber-500/20' : 'bg-primary/20'}`}>
            <Globe className={`h-6 w-6 ${isTestnet ? 'text-amber-400' : 'text-primary'}`} />
          </div>
          <div>
            <h3 className="text-xl font-bold">{config.chainName}</h3>
            <Badge variant="outline" className="mt-1">
              {isTestnet ? 'Testnet' : 'Mainnet'}
            </Badge>
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleSwitchNetwork(isTestnet)}
          >
            Switch
          </Button>
          <Button
            size="sm"
            onClick={() => handleAddNetwork(isTestnet)}
            disabled={isAdding}
          >
            <Wallet className="h-4 w-4 mr-2" />
            Add to Wallet
          </Button>
        </div>
      </div>

      <div className="space-y-4">
        <InfoRow
          label="Chain ID"
          value={config.chainId.toString()}
          copyable
          onCopy={() => copyToClipboard(config.chainId.toString(), 'Chain ID')}
          copied={copiedField === 'Chain ID'}
        />
        <InfoRow
          label="Chain ID (Hex)"
          value={config.chainIdHex}
          copyable
          onCopy={() => copyToClipboard(config.chainIdHex, 'Chain ID Hex')}
          copied={copiedField === 'Chain ID Hex'}
        />
        <InfoRow
          label="Currency Symbol"
          value={config.nativeCurrency.symbol}
          copyable
          onCopy={() => copyToClipboard(config.nativeCurrency.symbol, 'Symbol')}
          copied={copiedField === 'Symbol'}
        />
        <InfoRow
          label="Decimals"
          value={config.nativeCurrency.decimals.toString()}
        />
        <InfoRow
          label="RPC URL"
          value={config.rpcUrls.primary}
          copyable
          onCopy={() => copyToClipboard(config.rpcUrls.primary, 'RPC URL')}
          copied={copiedField === 'RPC URL'}
        />
        {'backup' in config.rpcUrls && config.rpcUrls.backup?.map((url, i) => (
          <InfoRow
            key={i}
            label={`Backup RPC ${i + 1}`}
            value={url}
            copyable
            onCopy={() => copyToClipboard(url, `Backup RPC ${i + 1}`)}
            copied={copiedField === `Backup RPC ${i + 1}`}
          />
        ))}
        <InfoRow
          label="Block Explorer"
          value={config.blockExplorerUrls[0]}
          link
        />
      </div>
    </GlassCard>
  );

  return (
    <Layout>
      <motion.div 
        initial={{ opacity: 0 }} 
        animate={{ opacity: 1 }} 
        className="space-y-6"
      >
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-3">
              <Network className="w-8 h-8 text-primary" />
              Network Configuration
            </h1>
            <p className="text-muted-foreground mt-2">
              Add {TOKENOMICS.symbol} network to Trust Wallet, MetaMask, or any EIP-3085 compatible wallet
            </p>
          </div>
        </div>

        {/* Quick Add Section */}
        <GlassCard className="p-6 bg-gradient-to-r from-primary/10 to-transparent border-primary/30">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-xl bg-primary/20">
                <Zap className="h-8 w-8 text-primary" />
              </div>
              <div>
                <h2 className="text-xl font-bold">Quick Add to Wallet</h2>
                <p className="text-muted-foreground text-sm">
                  Click the button to automatically add GYDS Network to your wallet
                </p>
              </div>
            </div>
            <Button
              size="lg"
              onClick={() => handleAddNetwork(false)}
              disabled={isAdding}
              className="gap-2"
            >
              <Wallet className="h-5 w-5" />
              Add GYDS Network
            </Button>
          </div>
        </GlassCard>

        {/* Network Tabs */}
        <Tabs defaultValue="mainnet">
          <TabsList className="mb-4">
            <TabsTrigger value="mainnet">Mainnet</TabsTrigger>
            <TabsTrigger value="testnet">Testnet</TabsTrigger>
          </TabsList>

          <TabsContent value="mainnet">
            <NetworkCard config={NETWORK_CONFIG} isTestnet={false} />
          </TabsContent>

          <TabsContent value="testnet">
            <NetworkCard config={TESTNET_CONFIG} isTestnet={true} />
          </TabsContent>
        </Tabs>

        {/* Manual Configuration */}
        <GlassCard className="p-6">
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Info className="h-5 w-5 text-muted-foreground" />
            Manual Configuration for Trust Wallet
          </h3>
          <div className="space-y-4 text-sm">
            <ol className="list-decimal list-inside space-y-3 text-muted-foreground">
              <li>Open Trust Wallet and go to <strong>Settings</strong></li>
              <li>Tap on <strong>Wallets</strong>, then select your wallet</li>
              <li>Tap the <strong>+</strong> button next to "Networks"</li>
              <li>Select <strong>Add Custom Network</strong></li>
              <li>Enter the following details:</li>
            </ol>
            
            <div className="mt-4 p-4 rounded-lg bg-secondary/30 space-y-2">
              <p><strong>Network Name:</strong> {NETWORK_CONFIG.chainName}</p>
              <p><strong>RPC URL:</strong> {NETWORK_CONFIG.rpcUrls.primary}</p>
              <p><strong>Chain ID:</strong> {NETWORK_CONFIG.chainId}</p>
              <p><strong>Symbol:</strong> {TOKENOMICS.symbol}</p>
              <p><strong>Block Explorer:</strong> {NETWORK_CONFIG.blockExplorerUrls[0]}</p>
            </div>
            
            <ol start={6} className="list-decimal list-inside space-y-3 text-muted-foreground">
              <li>Tap <strong>Save</strong> to add the network</li>
              <li>Your wallet is now connected to GYDS Network!</li>
            </ol>
          </div>
        </GlassCard>

        {/* Gas Configuration */}
        <GlassCard className="p-6">
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Zap className="h-5 w-5 text-amber-400" />
            Gas Configuration
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 rounded-lg bg-secondary/30">
              <p className="text-sm text-muted-foreground">Base Gas Price</p>
              <p className="text-lg font-semibold">
                {(GAS_CONFIG.baseFeePerGas / 1e9).toFixed(1)} Gwei
              </p>
            </div>
            <div className="p-4 rounded-lg bg-secondary/30">
              <p className="text-sm text-muted-foreground">Priority Fee</p>
              <p className="text-lg font-semibold">
                {(GAS_CONFIG.maxPriorityFeePerGas / 1e9).toFixed(1)} Gwei
              </p>
            </div>
            <div className="p-4 rounded-lg bg-secondary/30">
              <p className="text-sm text-muted-foreground">Transfer Gas Limit</p>
              <p className="text-lg font-semibold">
                {GAS_CONFIG.gasLimits.transfer.toLocaleString()}
              </p>
            </div>
            <div className="p-4 rounded-lg bg-secondary/30">
              <p className="text-sm text-muted-foreground">Token Transfer Gas Limit</p>
              <p className="text-lg font-semibold">
                {GAS_CONFIG.gasLimits.tokenTransfer.toLocaleString()}
              </p>
            </div>
          </div>
        </GlassCard>

        {/* RPC Endpoints */}
        <GlassCard className="p-6">
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Server className="h-5 w-5 text-primary" />
            RPC Endpoints
          </h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 rounded-lg bg-secondary/30">
              <div>
                <p className="font-medium">Primary RPC</p>
                <p className="text-sm text-muted-foreground">{NETWORK_CONFIG.rpcUrls.primary}</p>
              </div>
              <Badge className="bg-neon-emerald/20 text-neon-emerald border-neon-emerald/30">
                Recommended
              </Badge>
            </div>
            {'backup' in NETWORK_CONFIG.rpcUrls && NETWORK_CONFIG.rpcUrls.backup?.map((url, i) => (
              <div key={i} className="flex items-center justify-between p-3 rounded-lg bg-secondary/30">
                <div>
                  <p className="font-medium">Backup RPC {i + 1}</p>
                  <p className="text-sm text-muted-foreground">{url}</p>
                </div>
                <Badge variant="outline">Fallback</Badge>
              </div>
            ))}
            <div className="flex items-center justify-between p-3 rounded-lg bg-secondary/30">
              <div>
                <p className="font-medium">Local Node</p>
                <p className="text-sm text-muted-foreground">{NETWORK_CONFIG.rpcUrls.local}</p>
              </div>
              <Badge variant="outline">Development</Badge>
            </div>
          </div>
        </GlassCard>

        {/* Security Notice */}
        <GlassCard className="p-6 border-amber-500/30 bg-amber-500/5">
          <div className="flex gap-4">
            <Shield className="h-6 w-6 text-amber-400 flex-shrink-0" />
            <div>
              <h3 className="font-semibold text-amber-400">Security Notice</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Always verify you're using the official GYDS Network RPC endpoints. 
                Never share your private keys or seed phrase with anyone. 
                The GYDS team will never ask for your private keys.
              </p>
            </div>
          </div>
        </GlassCard>
      </motion.div>
    </Layout>
  );
};

// Info Row Component
const InfoRow = ({ 
  label, 
  value, 
  copyable = false, 
  link = false,
  onCopy,
  copied 
}: { 
  label: string; 
  value: string; 
  copyable?: boolean;
  link?: boolean;
  onCopy?: () => void;
  copied?: boolean;
}) => (
  <div className="flex items-center justify-between py-2 border-b border-border/50 last:border-0">
    <span className="text-sm text-muted-foreground">{label}</span>
    <div className="flex items-center gap-2">
      <code className="text-sm font-mono bg-secondary/50 px-2 py-1 rounded">
        {value}
      </code>
      {copyable && onCopy && (
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onCopy}>
          {copied ? (
            <Check className="h-4 w-4 text-neon-emerald" />
          ) : (
            <Copy className="h-4 w-4" />
          )}
        </Button>
      )}
      {link && (
        <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
          <a href={value} target="_blank" rel="noopener noreferrer">
            <ExternalLink className="h-4 w-4" />
          </a>
        </Button>
      )}
    </div>
  </div>
);

export default NetworkPage;
