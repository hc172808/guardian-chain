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
import { NETWORK_BADGE, useNetwork } from '@/contexts/NetworkContext';

interface GenesisState {
  founderAddress: string | null;
  genesisCreated: boolean;
  genesisHash: string | null;
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
  const network = selectedNetwork === 'all' ? 'mainnet' : selectedNetwork;
  const [state, setState] = useState<GenesisState>({
    founderAddress: null,
    genesisCreated: false,
    genesisHash: null,
    genesisTimestamp: null,
    initialSupplyWei: null,
    symbol: TOKENOMICS.symbol,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    let refreshTimer: ReturnType<typeof setTimeout> | undefined;
    setLoading(true);

    const load = async (initial = false) => {
      let genesisCreated = false;
      try {
        const [walletConfig, genesisInfo] = await Promise.all([
          api.get('/api/config/founder_wallet').catch(() => null),
          api.get(`/api/chain/genesis-status?network=${encodeURIComponent(network)}`).catch(() => null),
        ]);
        if (!active) return;

        const address = walletConfig?.configValue?.address || walletConfig?.config_value?.address || null;
        const hash = typeof genesisInfo?.genesisHash === 'string' &&
          /^0x[0-9a-f]{64}$/i.test(genesisInfo.genesisHash)
          ? genesisInfo.genesisHash
          : null;
        genesisCreated = genesisInfo?.configured === true && hash !== null;
        setState({
          founderAddress: address,
          genesisCreated,
          genesisHash: genesisCreated ? hash : null,
          genesisTimestamp: genesisCreated && Number.isFinite(genesisInfo.genesisTimestamp)
            ? Number(genesisInfo.genesisTimestamp)
            : null,
          initialSupplyWei: genesisCreated && typeof genesisInfo.initialSupplyWei === 'string'
            ? genesisInfo.initialSupplyWei
            : null,
          symbol: genesisCreated && typeof genesisInfo.symbol === 'string'
            ? genesisInfo.symbol
            : TOKENOMICS.symbol,
        });
      } catch (error) {
        if (!active) return;
        console.error('Failed to fetch genesis node status:', error);
        setState((current) => ({
          ...current,
          genesisCreated: false,
          genesisHash: null,
          genesisTimestamp: null,
          initialSupplyWei: null,
        }));
      } finally {
        if (active) {
          if (initial) setLoading(false);
          refreshTimer = setTimeout(() => { void load(); }, genesisCreated ? 120_000 : 30_000);
        }
      }
    };

    void load(true);
    return () => {
      active = false;
      if (refreshTimer) clearTimeout(refreshTimer);
    };
  }, [network]);

  const displaySupply = state.initialSupplyWei === null ? null : formatWeiAsGyds(state.initialSupplyWei);
  const showSupply = state.genesisCreated && displaySupply !== null;
  const gridColumns = showSupply
    ? 'md:grid-cols-4'
    : state.genesisCreated
      ? 'md:grid-cols-3'
      : 'md:grid-cols-2';

  const copyAddress = () => {
    if (state.founderAddress) {
      navigator.clipboard.writeText(state.founderAddress);
      toast({ title: 'Address copied!' });
    }
  };

  const copyGenesisHash = () => {
    if (state.genesisHash) {
      navigator.clipboard.writeText(state.genesisHash);
      toast({ title: 'Genesis hash copied!' });
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
          <Badge variant="outline">{NETWORK_BADGE[network].label}</Badge>
        </div>
        <Badge variant={state.genesisCreated ? "default" : "secondary"}>
          {state.genesisCreated ? (
            <><CheckCircle className="h-3 w-3 mr-1" /> Initialized</>
          ) : (
            <><Clock className="h-3 w-3 mr-1" /> Pending</>
          )}
        </Badge>
      </div>

      <div className={`grid grid-cols-1 ${gridColumns} gap-4`}>
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

        {/* Genesis hash is read from the live node's verified block zero. */}
        {state.genesisCreated && state.genesisHash && (
          <div className="p-3 rounded-lg bg-secondary/30">
            <div className="flex items-center gap-2 mb-2">
              <Blocks className="h-4 w-4 text-primary" />
              <span className="text-sm text-muted-foreground">Genesis Block Hash</span>
            </div>
            <div className="flex items-center gap-2 min-w-0">
              <code className="text-xs font-mono bg-background/50 px-2 py-1 rounded truncate">
                {`${state.genesisHash.slice(0, 12)}…${state.genesisHash.slice(-10)}`}
              </code>
              <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={copyGenesisHash} aria-label="Copy genesis block hash">
                <Copy className="h-3 w-3" />
              </Button>
            </div>
          </div>
        )}

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
              : state.genesisCreated ? 'Timestamp unavailable' : 'Waiting for a live genesis block'
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
