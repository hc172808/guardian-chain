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
  DEVNET_CONFIG,
  NETWORK_BY_KIND,
  NetworkKind,
  addNetworkToWallet,
  switchToNetwork,
  hasEthereumProvider,
  getEthereumProvider,
  isMobile,
  GAS_CONFIG,
} from '@/config/network';
import { AlertTriangle, Smartphone } from 'lucide-react';
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

  const handleAddNetwork = async (kind: NetworkKind) => {
    setIsAdding(true);
    try {
      await addNetworkToWallet(kind);
      toast({
        title: 'Network Added!',
        description: `${NETWORK_BY_KIND[kind].chainName} has been added to your wallet`,
      });
    } catch (error: any) {
      toast({
        title: 'Could not add network',
        description: error.message || 'Failed to add network',
        variant: 'destructive',
      });
    } finally {
      setIsAdding(false);
    }
  };

  const handleSwitchNetwork = async (kind: NetworkKind) => {
    try {
      await switchToNetwork(kind);
      toast({
        title: 'Switched!',
        description: `Now connected to ${NETWORK_BY_KIND[kind].chainName}`,
      });
    } catch (error: any) {
      toast({
        title: 'Could not switch network',
        description: error.message || 'Failed to switch network',
        variant: 'destructive',
      });
    }
  };

  // Friendly label for the detected wallet, used in the banner.
  const detectedWalletName = (): string => {
    const p = getEthereumProvider() as any;
    if (!p) return '';
    if (p.isMetaMask) return 'MetaMask';
    if (p.isTrust) return 'Trust Wallet';
    if (p.isPhantom) return 'Phantom';
    if (p.isCoinbaseWallet) return 'Coinbase Wallet';
    return 'EVM wallet';
  };

  const accent: Record<NetworkKind, { bg: string; fg: string; label: string }> = {
    mainnet: { bg: 'bg-primary/20',     fg: 'text-primary',     label: 'Mainnet' },
    testnet: { bg: 'bg-amber-500/20',   fg: 'text-amber-400',   label: 'Testnet' },
    devnet:  { bg: 'bg-violet-500/20',  fg: 'text-violet-400',  label: 'Devnet'  },
  };

  const NetworkCard = ({
    kind,
  }: {
    kind: NetworkKind;
  }) => {
    const config = NETWORK_BY_KIND[kind];
    const a = accent[kind];
    return (
    <GlassCard className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className={`p-3 rounded-xl ${a.bg}`}>
            <Globe className={`h-6 w-6 ${a.fg}`} />
          </div>
          <div>
            <h3 className="text-xl font-bold">{config.chainName}</h3>
            <Badge variant="outline" className="mt-1">{a.label}</Badge>
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleSwitchNetwork(kind)}
            data-testid={`button-switch-${kind}`}
          >
            Switch
          </Button>
          <Button
            size="sm"
            onClick={() => handleAddNetwork(kind)}
            disabled={isAdding}
            data-testid={`button-add-${kind}`}
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
        {Array.isArray((config.rpcUrls as any).backup) && (config.rpcUrls as any).backup?.map((url: string, i: number) => (
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
  };

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

        {/* Wallet detection status */}
        {hasEthereumProvider() ? (
          <GlassCard className="p-4 border-emerald-500/30 bg-emerald-500/5">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-emerald-500/20"><Wallet className="h-5 w-5 text-emerald-400" /></div>
              <div className="flex-1">
                <p className="font-medium text-emerald-300" data-testid="text-wallet-detected">
                  Detected: {detectedWalletName()}
                </p>
                <p className="text-xs text-muted-foreground">Use the buttons below to add Mainnet, Testnet, or Devnet to it.</p>
              </div>
            </div>
          </GlassCard>
        ) : (
          <GlassCard className="p-4 border-amber-500/40 bg-amber-500/5" data-testid="banner-no-wallet">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-amber-400 mt-0.5" />
              <div className="flex-1 space-y-2">
                <p className="font-semibold text-amber-300">No EVM wallet detected in this browser</p>
                {isMobile() ? (
                  <div className="text-sm text-muted-foreground space-y-2">
                    <p className="flex items-center gap-2"><Smartphone className="h-4 w-4" /> On mobile, the wallet's in-app browser must load this page:</p>
                    <ul className="list-disc list-inside space-y-1 ml-2 text-xs">
                      <li><strong>MetaMask</strong> → bottom tab "Browser" → enter this site URL</li>
                      <li><strong>Trust Wallet</strong> → bottom tab "DApps" → search bar → paste URL</li>
                      <li><strong>Phantom</strong> → bottom tab "Browser" → make sure Ethereum is enabled in Settings</li>
                    </ul>
                  </div>
                ) : (
                  <div className="text-sm text-muted-foreground space-y-1">
                    <p>Install one of:</p>
                    <ul className="list-disc list-inside ml-2 text-xs space-y-1">
                      <li><a className="text-primary underline" href="https://metamask.io/download/" target="_blank" rel="noreferrer">MetaMask</a> (most common)</li>
                      <li><a className="text-primary underline" href="https://trustwallet.com/browser-extension" target="_blank" rel="noreferrer">Trust Wallet extension</a></li>
                      <li><a className="text-primary underline" href="https://phantom.app/download" target="_blank" rel="noreferrer">Phantom</a> (enable Ethereum in Settings → Active Networks)</li>
                    </ul>
                    <p className="text-xs">Then refresh this page. If a wallet is installed but not detected, unlock it and check that the extension is allowed on this site.</p>
                  </div>
                )}
                <p className="text-xs text-muted-foreground">You can always add the network manually using the details further down.</p>
              </div>
            </div>
          </GlassCard>
        )}

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
                  Add Mainnet, Testnet, or Devnet to your wallet with one click.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="lg" onClick={() => handleAddNetwork('mainnet')} disabled={isAdding} className="gap-2" data-testid="button-quick-add-mainnet">
                <Wallet className="h-5 w-5" /> Add Mainnet
              </Button>
              <Button size="lg" variant="outline" onClick={() => handleAddNetwork('testnet')} disabled={isAdding} className="gap-2" data-testid="button-quick-add-testnet">
                <Wallet className="h-5 w-5" /> Add Testnet
              </Button>
              <Button size="lg" variant="outline" onClick={() => handleAddNetwork('devnet')} disabled={isAdding} className="gap-2 border-violet-500/40 text-violet-300 hover:bg-violet-500/10" data-testid="button-quick-add-devnet">
                <Wallet className="h-5 w-5" /> Add Devnet
              </Button>
            </div>
          </div>
        </GlassCard>

        {/* Network Tabs */}
        <Tabs defaultValue="mainnet">
          <TabsList className="mb-4">
            <TabsTrigger value="mainnet" data-testid="tab-mainnet">Mainnet</TabsTrigger>
            <TabsTrigger value="testnet" data-testid="tab-testnet">Testnet</TabsTrigger>
            <TabsTrigger value="devnet" data-testid="tab-devnet">Devnet</TabsTrigger>
          </TabsList>

          <TabsContent value="mainnet"><NetworkCard kind="mainnet" /></TabsContent>
          <TabsContent value="testnet"><NetworkCard kind="testnet" /></TabsContent>
          <TabsContent value="devnet"><NetworkCard kind="devnet" /></TabsContent>
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
            {NETWORK_CONFIG.rpcUrls.local.map((url, i) => (
              <div key={`local-${i}`} className="flex items-center justify-between p-3 rounded-lg bg-secondary/30">
                <div>
                  <p className="font-medium">Local Node {NETWORK_CONFIG.rpcUrls.local.length > 1 ? i + 1 : ''}</p>
                  <p className="text-sm text-muted-foreground">{url}</p>
                </div>
                <Badge variant="outline">Development</Badge>
              </div>
            ))}
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
