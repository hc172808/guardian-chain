import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { GlassCard } from '@/components/ui/GlassCard';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Plus, Search, Filter, MoreHorizontal, Droplets, FileText, Sprout, Lock, ArrowLeftRight, X, BarChart3 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { CreatePool } from './CreatePool';
import { useToast } from '@/hooks/use-toast';

interface Pool {
  id: string;
  token_a_symbol: string;
  token_b_symbol: string;
  fee_tier: number;
  tvl: number;
  volume_24h: number;
  fees_24h: number;
  apr: number;
}

const formatValue = (value: number): string => {
  if (value >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
  if (value >= 1e6) return `$${(value / 1e6).toFixed(2)}M`;
  if (value >= 1e3) return `$${(value / 1e3).toFixed(0)}K`;
  return `$${value.toFixed(0)}`;
};

export const PoolsList = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [pools, setPools] = useState<Pool[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const { toast } = useToast();

  const handlePoolAction = (action: string, pool: Pool) => {
    const pair = `${pool.token_a_symbol}/${pool.token_b_symbol}`;
    switch (action) {
      case 'add':
        toast({ title: 'Add Liquidity', description: `Opening deposit for ${pair}...` });
        break;
      case 'remove':
        toast({ title: 'Remove Liquidity', description: `Opening withdrawal for ${pair}...` });
        break;
      case 'lock':
        toast({ title: 'Lock Liquidity', description: `Locking liquidity for ${pair}...` });
        break;
      case 'analytics':
        toast({ title: 'Pool Analytics', description: `Viewing analytics for ${pair}` });
        break;
      case 'close':
        toast({ title: 'Close Pool', description: `Closing ${pair} pool...`, variant: 'destructive' });
        break;
      default:
        toast({ title: action, description: `${action} for ${pair} — coming soon.` });
    }
  };

  const loadPools = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('liquidity_pools')
      .select('id, token_a_symbol, token_b_symbol, fee_tier, tvl, volume_24h, fees_24h, apr')
      .eq('is_active', true)
      .order('tvl', { ascending: false });
    if (data) setPools(data);
    setLoading(false);
  };

  useEffect(() => {
    loadPools();
    const channel = supabase
      .channel('pools')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'liquidity_pools' }, () => loadPools())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  if (showCreate) return <CreatePool onBack={() => { setShowCreate(false); loadPools(); }} />;

  const totalTvl = pools.reduce((acc, p) => acc + p.tvl, 0);
  const totalVolume = pools.reduce((acc, p) => acc + p.volume_24h, 0);
  const totalFees = pools.reduce((acc, p) => acc + p.fees_24h, 0);

  const filtered = pools.filter(p =>
    p.token_a_symbol.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.token_b_symbol.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Liquidity Pools</h1>
        <p className="text-muted-foreground">Explore pools and deploy capital to earn trading fees.</p>
      </div>

      <Button
        variant="outline"
        className="gap-2 border-amber-500/50 text-amber-500 hover:bg-amber-500/10 hover:text-amber-400"
        onClick={() => setShowCreate(true)}
      >
        <Plus className="h-4 w-4" /> Create Pool
      </Button>

      <GlassCard className="p-4 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">TVL</span>
          <span className="font-semibold text-foreground">{formatValue(totalTvl)}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">24H Volume</span>
          <span className="font-semibold text-foreground">{formatValue(totalVolume)}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">24H Fees</span>
          <span className="font-semibold text-foreground">{formatValue(totalFees)}</span>
        </div>
      </GlassCard>

      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search pools..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="pl-10 bg-secondary/30" />
        </div>
        <Button variant="secondary" size="icon"><Filter className="h-4 w-4" /></Button>
      </div>

      <div className="flex items-center justify-between text-sm text-muted-foreground px-2">
        <span>Pool</span>
        <span>APR / TVL</span>
      </div>

      {loading ? (
        <GlassCard className="p-8 text-center text-muted-foreground">Loading pools...</GlassCard>
      ) : filtered.length === 0 ? (
        <GlassCard className="p-8 text-center space-y-3">
          <Droplets className="h-8 w-8 mx-auto text-muted-foreground" />
          <p className="text-muted-foreground">No pools yet. Create the first one!</p>
          <Button variant="outline" className="border-amber-500/50 text-amber-500" onClick={() => setShowCreate(true)}>
            <Plus className="h-4 w-4 mr-2" /> Create Pool
          </Button>
        </GlassCard>
      ) : (
        <div className="space-y-2">
          {filtered.map(pool => (
            <div key={pool.id} className="flex items-center justify-between p-4 rounded-xl bg-card/50 border border-border/30 hover:border-border/60 transition-colors cursor-pointer">
              <div className="flex items-center gap-3">
                <div className="flex -space-x-2">
                  <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold border-2 border-background z-10 bg-gradient-to-br from-primary to-primary/50">
                    {pool.token_a_symbol[0]}
                  </div>
                  <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold border-2 border-background bg-gradient-to-br from-amber-500 to-amber-600 text-black">
                    {pool.token_b_symbol[0]}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold">{pool.token_a_symbol} / {pool.token_b_symbol}</span>
                  <Badge variant="secondary" className="text-xs font-mono">{pool.fee_tier}%</Badge>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="text-right">
                  <div className="text-primary font-semibold">{pool.apr.toFixed(1)}%</div>
                  <div className="text-xs text-muted-foreground">{formatValue(pool.tvl)}</div>
                </div>
                <Button variant="ghost" size="icon" className="text-muted-foreground">
                  <MoreHorizontal className="h-5 w-5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
