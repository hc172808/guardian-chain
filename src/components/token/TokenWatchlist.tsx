import { useState, useEffect } from 'react';
import { GlassCard } from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { api } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Star, Coins, Trash2, Bell, Loader2 } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

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

export const TokenWatchlist = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [watchlist, setWatchlist] = useState<WatchlistToken[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchWatchlist = async () => {
    if (!user) return;
    const data = await api.get('/api/watchlist').catch(() => []);
    if (Array.isArray(data)) setWatchlist(data as unknown as WatchlistToken[]);
    setLoading(false);
  };

  useEffect(() => {
    fetchWatchlist();
  }, [user]);

  const removeFromWatchlist = async (id: string) => {
    await api.delete(`/api/watchlist/${id}`).catch(() => {});
    toast({ title: 'Removed from watchlist' });
    fetchWatchlist();
  };

  if (!user) return null;

  return (
    <GlassCard className="p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold flex items-center gap-2">
          <Star className="h-4 w-4 text-yellow-500" />
          My Watchlist
        </h3>
        <Badge variant="outline">{watchlist.length} tokens</Badge>
      </div>

      {loading ? (
        <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : watchlist.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-4">
          No tokens in watchlist. Click ⭐ on any token to add it.
        </p>
      ) : (
        <div className="space-y-2">
          {watchlist.map((item) => (
            <div
              key={item.id}
              className="flex items-center justify-between p-3 rounded-lg bg-secondary/30 hover:bg-secondary/50 cursor-pointer transition-colors"
              onClick={() => navigate(`/explorer/token/${item.tokens.address}`)}
            >
              <div className="flex items-center gap-3">
                {item.tokens.logo_url ? (
                  <img src={item.tokens.logo_url} alt={item.tokens.symbol} className="w-8 h-8 rounded-lg object-cover" />
                ) : (
                  <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center">
                    <Coins className="h-4 w-4 text-primary" />
                  </div>
                )}
                <div>
                  <p className="text-sm font-medium">{item.tokens.name}</p>
                  <p className="text-xs text-muted-foreground">{item.tokens.symbol}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-primary">{item.tokens.gyds_liquidity.toLocaleString()} GYDS</span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-destructive"
                  onClick={(e) => { e.stopPropagation(); removeFromWatchlist(item.id); }}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </GlassCard>
  );
};

// Hook to add/remove from watchlist
export const useWatchlist = (tokenId: string | undefined) => {
  const { user } = useAuth();
  const [isWatched, setIsWatched] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!user || !tokenId) return;
    api.get(`/api/watchlist/check/${tokenId}`)
      .then((d: any) => setIsWatched(!!d?.watched))
      .catch(() => {});
  }, [user, tokenId]);

  const toggle = async () => {
    if (!user || !tokenId) return;
    setLoading(true);
    if (isWatched) {
      await api.delete(`/api/watchlist/token/${tokenId}`).catch(() => {});
      setIsWatched(false);
      toast({ title: 'Removed from watchlist' });
    } else {
      await api.post('/api/watchlist', { token_id: tokenId }).catch(() => {});
      setIsWatched(true);
      toast({ title: 'Added to watchlist ⭐' });
    }
    setLoading(false);
  };

  return { isWatched, toggle, loading };
};
