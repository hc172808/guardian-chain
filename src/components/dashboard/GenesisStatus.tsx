// Dashboard component showing founder wallet and genesis block status
import { useState, useEffect } from 'react';
import { GlassCard } from '@/components/ui/GlassCard';
import { Badge } from '@/components/ui/badge';
import { api } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { 
  Wallet, 
  Blocks, 
  CheckCircle, 
  Clock,
  Coins,
  Copy
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { GENESIS_CONFIG, TOKENOMICS } from '@/config/wallets';

interface GenesisState {
  founderAddress: string | null;
  genesisCreated: boolean;
  genesisTimestamp: number | null;
  initialSupply: number;
  currentPrice: number;
}

export const GenesisStatus = () => {
  const { isFounder } = useAuth();
  const { toast } = useToast();
  const [state, setState] = useState<GenesisState>({
    founderAddress: null,
    genesisCreated: false,
    genesisTimestamp: null,
    initialSupply: GENESIS_CONFIG.initialSupply,
    currentPrice: GENESIS_CONFIG.initialPrice,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchGenesisStatus();
  }, []);

  const fetchGenesisStatus = async () => {
    try {
      const [walletConfig, priceData] = await Promise.all([
        api.get('/api/config/founder_wallet').catch(() => null),
        api.get('/api/token-price').catch(() => null),
      ]);

      const address = walletConfig?.config_value?.address || null;
      setState({
        founderAddress: address,
        genesisCreated: !!address,
        genesisTimestamp: GENESIS_CONFIG.timestamp,
        initialSupply: priceData?.totalSupply || priceData?.total_supply || GENESIS_CONFIG.initialSupply,
        currentPrice: priceData?.price || GENESIS_CONFIG.initialPrice,
      });
    } catch (error) {
      console.error('Failed to fetch genesis status:', error);
    } finally {
      setLoading(false);
    }
  };

  const copyAddress = () => {
    if (state.founderAddress) {
      navigator.clipboard.writeText(state.founderAddress);
      toast({ title: 'Address copied!' });
    }
  };

  const formatAddress = (addr: string) => {
    return `${addr.slice(0, 10)}...${addr.slice(-8)}`;
  };

  if (loading) {
    return (
      <GlassCard className="p-4">
        <div className="animate-pulse flex items-center gap-4">
          <div className="h-12 w-12 rounded-lg bg-muted"></div>
          <div className="space-y-2 flex-1">
            <div className="h-4 bg-muted rounded w-1/3"></div>
            <div className="h-3 bg-muted rounded w-1/2"></div>
          </div>
        </div>
      </GlassCard>
    );
  }

  return (
    <GlassCard className="p-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Blocks className="h-5 w-5 text-primary" />
          <h3 className="font-semibold">Genesis Block</h3>
        </div>
        <Badge variant={state.genesisCreated ? "default" : "secondary"}>
          {state.genesisCreated ? (
            <><CheckCircle className="h-3 w-3 mr-1" /> Initialized</>
          ) : (
            <><Clock className="h-3 w-3 mr-1" /> Pending</>
          )}
        </Badge>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Founder Wallet */}
        <div className="p-3 rounded-lg bg-secondary/30">
          <div className="flex items-center gap-2 mb-2">
            <Wallet className="h-4 w-4 text-primary" />
            <span className="text-sm text-muted-foreground">Founder Wallet</span>
          </div>
          {state.founderAddress ? (
            <div className="flex items-center gap-2">
              <code className="text-sm font-mono bg-background/50 px-2 py-1 rounded">
                {formatAddress(state.founderAddress)}
              </code>
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={copyAddress}>
                <Copy className="h-3 w-3" />
              </Button>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground italic">Not configured</p>
          )}
        </div>

        {/* Token Supply */}
        <div className="p-3 rounded-lg bg-secondary/30">
          <div className="flex items-center gap-2 mb-2">
            <Coins className="h-4 w-4 text-primary" />
            <span className="text-sm text-muted-foreground">Initial Supply</span>
          </div>
          <p className="text-lg font-bold">
            {(state.initialSupply / 1_000_000_000).toFixed(0)}B {TOKENOMICS.symbol}
          </p>
        </div>

        {/* Genesis Timestamp */}
        <div className="p-3 rounded-lg bg-secondary/30">
          <div className="flex items-center gap-2 mb-2">
            <Clock className="h-4 w-4 text-primary" />
            <span className="text-sm text-muted-foreground">Genesis Time</span>
          </div>
          <p className="text-sm font-medium">
            {state.genesisTimestamp 
              ? new Date(state.genesisTimestamp * 1000).toLocaleString()
              : 'Pending deployment'
            }
          </p>
        </div>
      </div>

      {/* Show configure prompt for founders if not set */}
      {isFounder && !state.founderAddress && (
        <div className="mt-4 p-3 rounded-lg border border-yellow-500/30 bg-yellow-500/5">
          <p className="text-sm text-yellow-500">
            ⚠️ Founder wallet not configured. Go to Wallet page to set up your genesis recipient address.
          </p>
        </div>
      )}
    </GlassCard>
  );
};
