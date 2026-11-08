import { Layout } from '@/components/layout/Layout';
import { TokenFactory } from '@/components/token/TokenFactory';
import { TokenFeaturePanel } from '@/components/token/TokenFeaturePanel';
import { TokenWatchlist } from '@/components/token/TokenWatchlist';
import { PriceAlerts } from '@/components/token/PriceAlerts';
import { GlassCard } from '@/components/ui/GlassCard';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { motion } from 'framer-motion';
import { Coins, Plus, Eye, Search, AlertTriangle, ArrowLeftRight, Loader2, Shield, Star, Bell } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { readAllTokenNetworkStates, TokenNetworkState } from '@/lib/tokenPromotion';
import { NetworkSelector } from '@/components/ui/NetworkSelector';
import { useNetwork, ALL_NETWORKS, NETWORK_BADGE } from '@/contexts/NetworkContext';
import { readGrc20OnchainSupply } from '@/lib/tokenDeployment';

interface TokenRecord {
  id: string;
  name: string;
  symbol: string;
  address: string;
  total_supply: number;
  decimals: number;
  burned_supply: number;
  gyds_liquidity: number;
  logo_url: string | null;
  lp_lock_type: string;
  lp_unlock_time: string | null;
  freeze_enabled: boolean;
  freeze_holder: string | null;
  freeze_locked: boolean;
  update_enabled: boolean;
  update_holder: string | null;
  update_locked: boolean;
  mint_enabled: boolean;
  mint_holder: string | null;
  mint_locked: boolean;
  created_at: string;
  is_active: boolean;
  creator_id: string;
  networkType?: string;
  deploymentStatus?: string;
}

const normalizeTokenRecord = (row: Record<string, unknown>): TokenRecord => {
  const value = (camel: string, snake: string) => row[camel] ?? row[snake];
  return {
    id: String(row.id ?? ''),
    name: String(row.name ?? ''),
    symbol: String(row.symbol ?? ''),
    address: String(row.address ?? ''),
    total_supply: Number(value('totalSupply', 'total_supply') ?? 0),
    decimals: Number(row.decimals ?? 18),
    burned_supply: Number(value('burnedSupply', 'burned_supply') ?? 0),
    gyds_liquidity: Number(value('gydsLiquidity', 'gyds_liquidity') ?? 0),
    logo_url: (value('logoUrl', 'logo_url') as string | null | undefined) ?? null,
    lp_lock_type: String(value('lpLockType', 'lp_lock_type') ?? 'burned'),
    lp_unlock_time: (value('lpUnlockTime', 'lp_unlock_time') as string | null | undefined) ?? null,
    freeze_enabled: Boolean(value('freezeEnabled', 'freeze_enabled')),
    freeze_holder: (value('freezeHolder', 'freeze_holder') as string | null | undefined) ?? null,
    freeze_locked: Boolean(value('freezeLocked', 'freeze_locked')),
    update_enabled: Boolean(value('updateEnabled', 'update_enabled')),
    update_holder: (value('updateHolder', 'update_holder') as string | null | undefined) ?? null,
    update_locked: Boolean(value('updateLocked', 'update_locked')),
    mint_enabled: Boolean(value('mintEnabled', 'mint_enabled')),
    mint_holder: (value('mintHolder', 'mint_holder') as string | null | undefined) ?? null,
    mint_locked: Boolean(value('mintLocked', 'mint_locked')),
    created_at: String(value('createdAt', 'created_at') ?? ''),
    is_active: Boolean(value('isActive', 'is_active')),
    creator_id: String(value('creatorId', 'creator_id') ?? ''),
    networkType: String(value('networkType', 'network_type') ?? 'mainnet'),
    deploymentStatus: String(value('deploymentStatus', 'deployment_status') ?? 'legacy_unverified'),
  };
};

const toFeaturePanelToken = (t: TokenRecord, onchainSupply: string | null) => ({
  name: t.name,
  symbol: t.symbol,
  address: t.address,
  totalSupply: onchainSupply ?? '0',
  supplyVerifiedOnchain: onchainSupply !== null,
  burnedSupply: t.burned_supply.toString(),
  gydsLiquidity: t.gyds_liquidity.toString(),
  lpLockType: t.lp_lock_type as 'burned' | 'timelocked' | 'not_created',
  lpUnlockTime: t.lp_unlock_time ? new Date(t.lp_unlock_time).getTime() : undefined,
  authorities: {
    freeze: { enabled: t.freeze_enabled, holder: t.freeze_holder, locked: t.freeze_locked },
    update: { enabled: t.update_enabled, holder: t.update_holder, locked: t.update_locked },
    mint: { enabled: t.mint_enabled, holder: t.mint_holder, locked: t.mint_locked },
  },
  backingCoin: 'GYDS',
  logoUrl: t.logo_url,
});

const TokensPage = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [tokens, setTokens] = useState<TokenRecord[]>([]);
  const [networkStates, setNetworkStates] = useState<Map<string, TokenNetworkState>>(new Map());
  const [onchainSupplies, setOnchainSupplies] = useState<Record<string, string | null>>({});
  const [loading, setLoading] = useState(true);
  const [selectedToken, setSelectedToken] = useState<ReturnType<typeof toFeaturePanelToken> | null>(null);
  const { user } = useAuth();
  const navigate = useNavigate();
  const { selectedNetwork, activeNetworks, setSelectedNetwork } = useNetwork();

  useEffect(() => {
    const fetchTokens = async () => {
      // Build URL — filter by selected network when a specific one is chosen
      const networkParam = selectedNetwork !== 'all' ? `?network=${selectedNetwork}` : '';
      const payload: unknown = await fetch(`/api/tokens${networkParam}`, { credentials: 'include' })
        .then(r => r.ok ? r.json() : []).catch(() => []);
      const rows = Array.isArray(payload)
        ? payload.filter((row): row is Record<string, unknown> => typeof row === 'object' && row !== null)
        : [];
      const data = rows.map(normalizeTokenRecord);

      // Also hide tokens whose network is currently toggled off
      const filtered = data.filter(t => {
        const net = t.networkType ?? 'testnet';
        if (net !== 'mainnet' && net !== 'testnet' && net !== 'devnet') return false;
        if (!activeNetworks.has(net)) return false;
        return t.is_active || (user && t.creator_id === user.id);
      });
      setTokens(filtered);
      const supplyResults = await Promise.all(filtered
        .filter(t => t.networkType === 'mainnet' && /^0x[a-fA-F0-9]{40}$/.test(t.address))
        .map(async t => {
          try {
            const supply = await readGrc20OnchainSupply(t.address);
            return [t.address.toLowerCase(), supply.totalSupply] as const;
          } catch {
            return [t.address.toLowerCase(), null] as const;
          }
        }));
      setOnchainSupplies(Object.fromEntries(supplyResults));
      const states = await readAllTokenNetworkStates();
      setNetworkStates(states);
      setLoading(false);
    };
    fetchTokens();

    // Poll every 30s
    const interval = setInterval(fetchTokens, 30000);
    return () => clearInterval(interval);
  }, [user, selectedNetwork, activeNetworks]);

  const filtered = tokens.filter(t =>
    (t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    t.symbol.toLowerCase().includes(searchQuery.toLowerCase()) ||
    t.address.toLowerCase().includes(searchQuery.toLowerCase())) &&
    // Only show blocked tokens to their creator
    (t.is_active || (user && t.creator_id === user.id))
  );

  return (
    <Layout>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
        <div className="flex flex-col gap-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold">
                <span className="text-gradient-primary">Token</span> Marketplace
              </h1>
              <p className="text-muted-foreground mt-2 text-sm">Browse, create, and trade tokens on GYDS Network</p>
            </div>
            <Badge variant="outline" className="gap-2 w-fit">
              <Coins className="h-4 w-4" />
              {tokens.length} Tokens Listed
            </Badge>
          </div>
          {/* Network filter + per-network toggles */}
          <NetworkSelector showToggles />
        </div>

        <GlassCard className="p-4 border-warning/30 bg-warning/5">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-warning flex-shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-medium text-warning">Mainnet Token Deployment</p>
              <p className="text-sm text-muted-foreground">
                New GRC-20 tokens deploy directly to GYDS mainnet after wallet approval and server verification. Supply comes from the deployed contract; other-coin swaps require the $10,000 market-cap threshold over a 30-minute on-chain average. Liquidity is added separately.
              </p>
            </div>
          </div>
        </GlassCard>

        <Tabs
          defaultValue="browse"
          className="space-y-6"
          onValueChange={(value) => {
            if (value === 'create') setSelectedNetwork('mainnet');
          }}
        >
          <TabsList className="bg-secondary/50">
            <TabsTrigger value="browse" className="gap-2"><Eye className="h-4 w-4" /> Browse Tokens</TabsTrigger>
            {user && <TabsTrigger value="watchlist" className="gap-2"><Star className="h-4 w-4" /> Watchlist</TabsTrigger>}
            {user && <TabsTrigger value="alerts" className="gap-2"><Bell className="h-4 w-4" /> Price Alerts</TabsTrigger>}
            {user && <TabsTrigger value="create" className="gap-2"><Plus className="h-4 w-4" /> Create Token</TabsTrigger>}
          </TabsList>

          <TabsContent value="browse" className="space-y-6">
            <div className="relative max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search by name, symbol, or address..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-10" />
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : filtered.length === 0 ? (
              <GlassCard className="p-8 text-center">
                <Coins className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
                <h3 className="font-semibold text-lg mb-2">No Tokens Found</h3>
                <p className="text-muted-foreground text-sm mb-4">
                  {searchQuery ? 'No tokens match your search.' : 'Be the first to create a token!'}
                </p>
                {user && (
                  <Button onClick={() => navigate('/tokens')} variant="outline" className="gap-2">
                    <Plus className="h-4 w-4" /> Create Token
                  </Button>
                )}
              </GlassCard>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filtered.map((token) => {
                  const getSecurityScore = () => {
                    let score = 0;
                    if (!token.mint_enabled || token.mint_locked) score++;
                    if (!token.freeze_enabled || token.freeze_locked) score++;
                    if (token.lp_lock_type === 'burned') score++;
                    if (token.gyds_liquidity >= 100) score++;
                    if (score >= 4) return { label: 'Safe', color: 'bg-primary/20 text-primary border-primary/30' };
                    if (score >= 2) return { label: 'Caution', color: 'bg-yellow-500/20 text-yellow-500 border-yellow-500/30' };
                    return { label: 'Risky', color: 'bg-destructive/20 text-destructive border-destructive/30' };
                  };
                  const security = getSecurityScore();
                  const liveSupply = onchainSupplies[token.address.toLowerCase()];

                  return (
                    <motion.div
                      key={token.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      whileHover={{ scale: 1.01 }}
                      className="cursor-pointer"
                      onClick={() => navigate(`/explorer/token/${token.address}`)}
                    >
                      <GlassCard className="p-4 hover:border-primary/50 transition-colors">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            {token.logo_url ? (
                              <img src={token.logo_url} alt={token.symbol} className="w-10 h-10 rounded-lg object-cover" />
                            ) : (
                              <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center">
                                <Coins className="h-5 w-5 text-primary" />
                              </div>
                            )}
                            <div>
                              <div className="flex items-center gap-2 flex-wrap">
                                <h3 className="font-semibold">{token.name}</h3>
                                {(() => {
                                  const net = String(
                                    networkStates.get(token.id)?.network_type ??
                                    token.networkType ??
                                    'mainnet',
                                  ).toLowerCase();
                                  return net === 'mainnet' ? (
                                    <Badge className="text-xs bg-emerald-500/20 text-emerald-300 border-emerald-500/40" data-testid={`badge-network-${token.id}`}>MAINNET</Badge>
                                  ) : (
                                    <Badge className="text-xs bg-amber-500/20 text-amber-300 border-amber-500/40" data-testid={`badge-network-${token.id}`}>TESTNET</Badge>
                                  );
                                })()}
                                {!token.is_active && <Badge variant="destructive" className="text-xs">Blocked</Badge>}
                              </div>
                              <p className="text-sm text-muted-foreground">{token.symbol}</p>
                            </div>
                          </div>
                          <div className="flex flex-col items-end gap-1">
                            <Badge variant="outline" className={cn("text-xs gap-1", security.color)}>
                              {security.label === 'Safe' ? <Shield className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
                              {security.label}
                            </Badge>
                            <p className="text-xs text-muted-foreground">{token.gyds_liquidity.toLocaleString()} GYDS</p>
                          </div>
                        </div>
                        <div className="mt-3 flex justify-between gap-3 text-xs">
                          <span className="text-muted-foreground">On-chain supply</span>
                          <span className="text-right font-medium">
                            {liveSupply
                              ? `${Number(liveSupply).toLocaleString(undefined, { maximumFractionDigits: 6 })} ${token.symbol}`
                              : token.deploymentStatus === 'confirmed'
                                ? 'Mainnet data unavailable'
                                : 'Not verified on-chain'}
                          </span>
                        </div>
                        <div className="mt-3 flex gap-2 flex-wrap">
                          {token.freeze_locked && (
                            <Badge variant="outline" className="text-xs text-primary border-primary/30">Freeze Locked</Badge>
                          )}
                          {token.mint_locked && (
                            <Badge variant="outline" className="text-xs text-primary border-primary/30">Mint Locked</Badge>
                          )}
                          <Badge variant="outline" className="text-xs">
                            LP: {token.lp_lock_type === 'burned'
                              ? 'Burned'
                              : token.lp_lock_type === 'timelocked'
                                ? 'Time-Locked'
                                : 'Not created'}
                          </Badge>
                        </div>
                        <div className="mt-3 flex gap-2">
                          <Button size="sm" variant="outline" className="flex-1 gap-1 text-xs" onClick={(e) => { e.stopPropagation(); navigate('/defi'); }}>
                            <ArrowLeftRight className="h-3 w-3" /> Swap
                          </Button>
                        </div>
                      </GlassCard>
                    </motion.div>
                  );
                })}
              </div>
            )}

            {selectedToken && (
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold">Token Details</h3>
                  <Button variant="ghost" size="sm" onClick={() => setSelectedToken(null)}>Close</Button>
                </div>
                <TokenFeaturePanel token={selectedToken} />
              </motion.div>
            )}
          </TabsContent>

          <TabsContent value="watchlist">
            <TokenWatchlist />
          </TabsContent>

          <TabsContent value="alerts">
            <PriceAlerts />
          </TabsContent>

          <TabsContent value="create">
            <TokenFactory />
          </TabsContent>
        </Tabs>
      </motion.div>
    </Layout>
  );
};

export default TokensPage;
