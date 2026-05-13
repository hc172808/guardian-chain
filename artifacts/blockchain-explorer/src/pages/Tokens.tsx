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
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';

interface TokenRecord {
  id: string;
  name: string;
  symbol: string;
  address: string;
  total_supply: number;
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
}

const toFeaturePanelToken = (t: TokenRecord) => ({
  name: t.name,
  symbol: t.symbol,
  address: t.address,
  totalSupply: t.total_supply.toString(),
  burnedSupply: t.burned_supply.toString(),
  gydsLiquidity: t.gyds_liquidity.toString(),
  lpLockType: t.lp_lock_type as 'burned' | 'timelocked',
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
  const [loading, setLoading] = useState(true);
  const [selectedToken, setSelectedToken] = useState<ReturnType<typeof toFeaturePanelToken> | null>(null);
  const { user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    const fetchTokens = async () => {
      const { data } = await supabase
        .from('tokens')
        .select('*')
        .order('created_at', { ascending: false });
      // Filter: show active tokens OR blocked tokens owned by current user
      const filtered = (data || []).filter(t => 
        t.is_active || (user && t.creator_id === user.id)
      );
      setTokens(filtered as unknown as TokenRecord[]);
      setLoading(false);
    };
    fetchTokens();

    const channel = supabase
      .channel('tokens-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tokens' }, () => fetchTokens())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user]);

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

        <GlassCard className="p-4 border-warning/30 bg-warning/5">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-warning flex-shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-medium text-warning">Protocol-Enforced Rules</p>
              <p className="text-sm text-muted-foreground">
                All tokens require mandatory GYDS liquidity and follow immutable supply rules. LP is permanently locked.
              </p>
            </div>
          </div>
        </GlassCard>

        <Tabs defaultValue="browse" className="space-y-6">
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
                              <div className="flex items-center gap-2">
                                <h3 className="font-semibold">{token.name}</h3>
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
                        <div className="mt-3 flex gap-2 flex-wrap">
                          {token.freeze_locked && (
                            <Badge variant="outline" className="text-xs text-primary border-primary/30">Freeze Locked</Badge>
                          )}
                          {token.mint_locked && (
                            <Badge variant="outline" className="text-xs text-primary border-primary/30">Mint Locked</Badge>
                          )}
                          <Badge variant="outline" className="text-xs">
                            LP: {token.lp_lock_type === 'burned' ? 'Burned 🔥' : 'Time-Locked'}
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
