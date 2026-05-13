import { useState, useEffect } from 'react';
import { Layout } from '@/components/layout/Layout';
import { GlassCard } from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Star, Coins, Trash2, TrendingUp, TrendingDown, Loader2, ArrowLeft } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { motion } from 'framer-motion';

interface WatchlistToken {
  id: string;
  token_id: string;
  tokens: {
    id: string;
    name: string;
    symbol: string;
    address: string;
    logo_url: string | null;
    gyds_liquidity: number;
    total_supply: number;
  };
}

const WatchlistPage = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [watchlist, setWatchlist] = useState<WatchlistToken[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchWatchlist = async () => {
    if (!user) { setLoading(false); return; }
    const { data } = await supabase
      .from('token_watchlist')
      .select('id, token_id, tokens(id, name, symbol, address, logo_url, gyds_liquidity, total_supply)')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });
    if (data) setWatchlist(data as unknown as WatchlistToken[]);
    setLoading(false);
  };

  useEffect(() => {
    fetchWatchlist();
    const channel = supabase
      .channel('watchlist-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'token_watchlist' }, () => fetchWatchlist())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tokens' }, () => fetchWatchlist())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user]);

  const removeFromWatchlist = async (id: string) => {
    await supabase.from('token_watchlist').delete().eq('id', id);
    toast({ title: 'Removed from watchlist' });
    fetchWatchlist();
  };

  // Simulated 24h change based on liquidity hash
  const get24hChange = (token: WatchlistToken['tokens']) => {
    const seed = token.name.length * 7 + token.gyds_liquidity;
    return ((seed % 200) - 80) / 10;
  };

  const getPrice = (token: WatchlistToken['tokens']) => {
    if (token.total_supply === 0) return 0;
    return token.gyds_liquidity / token.total_supply;
  };

  return (
    <Layout>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-3">
              <Star className="w-8 h-8 text-yellow-500" />
              Token Watchlist
            </h1>
            <p className="text-muted-foreground mt-1">Track your favorite tokens with live prices</p>
          </div>
        </div>

        {!user ? (
          <GlassCard className="p-8 text-center space-y-3">
            <Star className="h-10 w-10 mx-auto text-muted-foreground" />
            <p className="text-muted-foreground">Login to view your watchlist</p>
            <Button onClick={() => navigate('/auth')}>Sign In</Button>
          </GlassCard>
        ) : loading ? (
          <GlassCard className="p-8 text-center">
            <Loader2 className="h-8 w-8 animate-spin mx-auto text-muted-foreground" />
          </GlassCard>
        ) : watchlist.length === 0 ? (
          <GlassCard className="p-8 text-center space-y-3">
            <Star className="h-10 w-10 mx-auto text-muted-foreground" />
            <p className="text-lg font-medium">No tokens in your watchlist</p>
            <p className="text-sm text-muted-foreground">Go to the Tokens page and click ⭐ on any token to add it.</p>
            <Button variant="outline" onClick={() => navigate('/tokens')}>Browse Tokens</Button>
          </GlassCard>
        ) : (
          <>
            {/* Summary */}
            <GlassCard className="p-4">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Watching</span>
                <Badge variant="outline">{watchlist.length} tokens</Badge>
              </div>
            </GlassCard>

            {/* Token List */}
            <div className="space-y-3">
              {watchlist.map((item, i) => {
                const change = get24hChange(item.tokens);
                const price = getPrice(item.tokens);
                const isPositive = change >= 0;
                return (
                  <motion.div
                    key={item.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.05 }}
                  >
                    <GlassCard
                      className="p-4 cursor-pointer hover:border-primary/30 transition-colors"
                      onClick={() => navigate(`/explorer/token/${item.tokens.address}`)}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          {item.tokens.logo_url ? (
                            <img src={item.tokens.logo_url} alt={item.tokens.symbol} className="w-10 h-10 rounded-xl object-cover" />
                          ) : (
                            <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center">
                              <Coins className="h-5 w-5 text-primary" />
                            </div>
                          )}
                          <div>
                            <p className="font-semibold">{item.tokens.name}</p>
                            <p className="text-sm text-muted-foreground">{item.tokens.symbol}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          <div className="text-right">
                            <p className="font-mono font-semibold">${price.toFixed(6)}</p>
                            <div className={`flex items-center gap-1 text-sm ${isPositive ? 'text-emerald-400' : 'text-red-400'}`}>
                              {isPositive ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                              <span>{isPositive ? '+' : ''}{change.toFixed(1)}%</span>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="text-xs text-muted-foreground">Liquidity</p>
                            <p className="text-sm font-mono text-primary">{item.tokens.gyds_liquidity.toLocaleString()} GYDS</p>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-destructive"
                            onClick={(e) => { e.stopPropagation(); removeFromWatchlist(item.id); }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </GlassCard>
                  </motion.div>
                );
              })}
            </div>
          </>
        )}
      </motion.div>
    </Layout>
  );
};

export default WatchlistPage;
