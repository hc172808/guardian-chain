import { useState, useEffect } from 'react';
import { GlassCard } from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { api } from '@/lib/api';
import { logAuditEvent } from '@/lib/auditLog';
import { Coins, Search, Ban, CheckCircle, Trash2, Loader2, Shield, RefreshCw } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

interface TokenRow {
  id: string;
  name: string;
  symbol: string;
  address: string;
  total_supply: number;
  gyds_liquidity: number;
  is_active: boolean;
  created_at: string;
  logo_url: string | null;
  creator_id: string;
}

export const TokenManager = () => {
  const { toast } = useToast();
  const { user } = useAuth();
  const [tokens, setTokens] = useState<TokenRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [acting, setActing] = useState<string | null>(null);

  const fetchTokens = async () => {
    setLoading(true);
    try {
      const data = await api.get('/api/tokens');
      setTokens(Array.isArray(data) ? data : []);
    } catch { setTokens([]); }
    setLoading(false);
  };

  useEffect(() => { fetchTokens(); }, []);

  const toggleActive = async (token: TokenRow) => {
    if (!user) return;
    setActing(token.id);
    const newStatus = !token.is_active;
    try {
      await api.patch(`/api/tokens/${token.id}`, { is_active: newStatus });
      toast({ title: newStatus ? 'Token Restored' : 'Token Blocked', description: `${token.symbol} is now ${newStatus ? 'active' : 'blocked'}.` });
      logAuditEvent(user.id, user.email || null, {
        action: newStatus ? 'token_unblock' : 'token_block',
        category: 'token',
        target_type: 'token',
        target_id: token.id,
        details: { symbol: token.symbol, address: token.address },
      });
      fetchTokens();
    } catch (e: any) {
      toast({ title: 'Failed', description: e.message, variant: 'destructive' });
    }
    setActing(null);
  };

  const deleteToken = async (token: TokenRow) => {
    if (!user) return;
    setActing(token.id);
    try {
      await api.patch(`/api/tokens/${token.id}`, { is_active: false });
      toast({ title: 'Token Removed', description: `${token.symbol} has been removed from the marketplace.` });
      logAuditEvent(user.id, user.email || null, {
        action: 'token_remove',
        category: 'token',
        target_type: 'token',
        target_id: token.id,
        details: { symbol: token.symbol, address: token.address },
      });
      fetchTokens();
    } catch (e: any) {
      toast({ title: 'Failed', description: e.message, variant: 'destructive' });
    }
    setActing(null);
  };

  const filtered = tokens.filter(t =>
    t.name.toLowerCase().includes(search.toLowerCase()) ||
    t.symbol.toLowerCase().includes(search.toLowerCase()) ||
    t.address.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <GlassCard className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/20">
            <Shield className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h3 className="font-semibold text-lg">Token Management</h3>
            <p className="text-sm text-muted-foreground">Block, restore, or remove tokens from the network</p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={fetchTokens} className="gap-2">
          <RefreshCw className="h-4 w-4" /> Refresh
        </Button>
      </div>

      <div className="relative mb-4 max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Search tokens..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
      </div>

      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : filtered.length === 0 ? (
        <p className="text-center text-muted-foreground py-8">No tokens found</p>
      ) : (
        <div className="space-y-3">
          {filtered.map(token => (
            <div key={token.id} className={`flex items-center justify-between p-3 rounded-lg border ${token.is_active ? 'border-border/50 bg-card/30' : 'border-destructive/30 bg-destructive/5'}`}>
              <div className="flex items-center gap-3">
                {token.logo_url ? (
                  <img src={token.logo_url} alt={token.symbol} className="w-9 h-9 rounded-lg object-cover" />
                ) : (
                  <div className="w-9 h-9 rounded-lg bg-primary/20 flex items-center justify-center">
                    <Coins className="h-4 w-4 text-primary" />
                  </div>
                )}
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{token.name}</span>
                    <Badge variant="outline" className="text-xs">{token.symbol}</Badge>
                    {!token.is_active && <Badge variant="destructive" className="text-xs">Blocked</Badge>}
                  </div>
                  <p className="text-xs text-muted-foreground font-mono">{token.address.slice(0, 10)}...{token.address.slice(-6)}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant={token.is_active ? 'destructive' : 'default'}
                  className="gap-1"
                  disabled={acting === token.id}
                  onClick={() => toggleActive(token)}
                >
                  {acting === token.id ? <Loader2 className="h-3 w-3 animate-spin" /> : token.is_active ? <Ban className="h-3 w-3" /> : <CheckCircle className="h-3 w-3" />}
                  {token.is_active ? 'Block' : 'Restore'}
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive gap-1" disabled={acting === token.id}>
                      <Trash2 className="h-3 w-3" /> Remove
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Remove {token.symbol}?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will block the token and hide it from the marketplace. This action can be reversed by restoring it later.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={() => deleteToken(token)}>Remove Token</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </div>
          ))}
        </div>
      )}
    </GlassCard>
  );
};
