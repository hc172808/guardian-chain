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
import { TOKENOMICS } from '@/config/wallets';
import { useNetwork } from '@/contexts/NetworkContext';

interface GenesisState {
  founderAddress: string | null;
  genesisCreated: boolean;
  genesisTimestamp: number | null;
  initialSupplyWei: string | null;
  symbol: string;
}

function formatWeiAsGyds(weiValue: string): string | null {
  try {
    const wei = BigInt(weiValue);
    if (wei < 0n) return null;
    const unit = 10n ** 18n;
    const whole = (wei / unit).toLocaleString();
    const fraction = (wei % unit).toString().padStart(18, '0').slice(0, 6).replace(/0+$/, '');
    return fraction ? `${whole}.${fraction}` : whole;
  } catch {
    return null;
  }
}

export const GenesisStatus = () => {
  const { isFounder } = useAuth();
  const { toast } = useToast();
  const { selectedNetwork } = useNetwork();
  const network = selectedNetwork === 'all' ? null : selectedNetwork;
  const [state, setState] = useState<GenesisState>({
    founderAddress: null,
    genesisCreated: false,
    genesisTimestamp: null,
    initialSupplyWei: null,
    symbol: TOKENOMICS.symbol,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);

    const load = async () => {
      const [walletConfig, genesisInfo] = await Promise.all([
        api.get('/api/config/founder_wallet').catch(() => null),
        network
          ? api.get(`/api/chain/genesis-status?network=${encodeURIComponent(network)}`).catch(() => null)
          : Promise.resolve(null),
      ]);
      if (!active) return;

      const address = walletConfig?.configValue?.address || walletConfig?.config_value?.address || null;
      const configured = genesisInfo?.configured === true &&
        typeof genesisInfo?.initialSupplyWei === 'string' &&
        Number(genesisInfo?.chainId) > 0;
      setState({
        founderAddress: address,
        genesisCreated: configured,
        genesisTimestamp: configured && Number.isFinite(genesisInfo.genesisTimestamp)
          ? Number(genesisInfo.genesisTimestamp)
          : null,
        initialSupplyWei: configured ? genesisInfo.initialSupplyWei : null,
        symbol: configured && typeof genesisInfo.symbol === 'string'
          ? genesisInfo.symbol
          : TOKENOMICS.symbol,
      });
      setLoading(false);
    };

    load().catch((error) => {
      if (!active) return;
      console.error('Failed to fetch genesis node status:', error);
      setState((current) => ({
        ...current,
        genesisCreated: false,
        genesisTimestamp: null,
        initialSupplyWei: null,
      }));
      setLoading(false);
    });

    return () => { active = false; };
  }, [network]);

  const displaySupply = state.initialSupplyWei === null ? null : formatWeiAsGyds(state.initialSupplyWei);
  const showSupply = state.genesisCreated && displaySupply !== null;

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

      <div className={`grid grid-cols-1 ${showSupply ? 'md:grid-cols-3' : 'md:grid-cols-2'} gap-4`}>
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

        {/* Supply is only displayed after a live node confirms block zero. */}
        {showSupply && (
          <div className="p-3 rounded-lg bg-secondary/30">
            <div className="flex items-center gap-2 mb-2">
              <Coins className="h-4 w-4 text-primary" />
              <span className="text-sm text-muted-foreground">Initial Supply</span>
            </div>
            <p className="text-lg font-bold">
              {displaySupply} {state.symbol}
            </p>
            <p className="text-xs text-muted-foreground mt-1">Read from the selected network’s genesis block</p>
          </div>
        )}

        {/* Genesis Timestamp */}
        <div className="p-3 rounded-lg bg-secondary/30">
          <div className="flex items-center gap-2 mb-2">
            <Clock className="h-4 w-4 text-primary" />
            <span className="text-sm text-muted-foreground">Genesis Time</span>
          </div>
          <p className="text-sm font-medium">
            {state.genesisTimestamp !== null
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
