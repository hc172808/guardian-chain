import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { GlassCard } from '@/components/ui/GlassCard';
import { Slider } from '@/components/ui/slider';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Plus, Search, Filter, MoreHorizontal, Droplets, Lock, ArrowLeftRight, X, BarChart3, Wallet, Loader2, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { CreatePool } from './CreatePool';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { useWalletConnect } from '@/hooks/useWalletConnect';

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

type PoolOverlay = { type: 'add' | 'remove' | 'lock' | 'analytics' | 'close'; pool: Pool } | null;

export const PoolsList = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [pools, setPools] = useState<Pool[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [overlay, setOverlay] = useState<PoolOverlay>(null);
  const { toast } = useToast();

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
  if (overlay) return <PoolActionPanel overlay={overlay} onBack={() => { setOverlay(null); loadPools(); }} />;

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
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="text-muted-foreground" onClick={(e) => e.stopPropagation()}>
                      <MoreHorizontal className="h-5 w-5" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-52 bg-card border-border" onClick={(e) => e.stopPropagation()}>
                    <DropdownMenuItem className="gap-2 text-primary" onSelect={() => setOverlay({ type: 'add', pool })}>
                      <Plus className="h-4 w-4" /> Add Liquidity
                    </DropdownMenuItem>
                    <DropdownMenuItem className="gap-2" onSelect={() => setOverlay({ type: 'remove', pool })}>
                      <ArrowLeftRight className="h-4 w-4" /> Remove Liquidity
                    </DropdownMenuItem>
                    <DropdownMenuItem className="gap-2" onSelect={() => setOverlay({ type: 'lock', pool })}>
                      <Lock className="h-4 w-4" /> Lock Liquidity
                    </DropdownMenuItem>
                    <DropdownMenuItem className="gap-2" onSelect={() => setOverlay({ type: 'analytics', pool })}>
                      <BarChart3 className="h-4 w-4" /> Pool Analytics
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem className="gap-2 text-destructive" onSelect={() => setOverlay({ type: 'close', pool })}>
                      <X className="h-4 w-4" /> Close Pool
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// Full action panels for pool operations
const PoolActionPanel = ({ overlay, onBack }: { overlay: NonNullable<PoolOverlay>; onBack: () => void }) => {
  const { pool, type } = overlay;
  const pair = `${pool.token_a_symbol}/${pool.token_b_symbol}`;
  const { user } = useAuth();
  const { address, isConnected } = useWalletConnect();
  const { toast } = useToast();
  const [isProcessing, setIsProcessing] = useState(false);
  const [amountA, setAmountA] = useState('');
  const [amountB, setAmountB] = useState('');
  const [withdrawPercent, setWithdrawPercent] = useState([50]);
  const [lockDays, setLockDays] = useState('30');

  const submitTx = async (desc: string, amount: number, toAddress: string, closePool = false) => {
    if (!user || !address) {
      toast({ title: 'Login Required', description: 'Connect your wallet first.', variant: 'destructive' });
      return;
    }
    setIsProcessing(true);
    try {
      const { submitTransaction } = await import('@/lib/mempool');
      await submitTransaction({
        userId: user.id,
        fromAddress: address,
        toAddress,
        amount,
        fee: amount * 0.001,
      });
      // If closing pool, deactivate it
      if (closePool) {
        const { error: poolError } = await supabase
          .from('liquidity_pools')
          .update({ is_active: false })
          .eq('id', pool.id);
        if (poolError) throw poolError;
      }
      toast({ title: 'Success', description: desc });
      onBack();
    } catch (err: any) {
      toast({ title: 'Failed', description: err.message, variant: 'destructive' });
    } finally { setIsProcessing(false); }
  };

  const titles: Record<string, string> = {
    add: `Add Liquidity — ${pair}`,
    remove: `Remove Liquidity — ${pair}`,
    lock: `Lock Liquidity — ${pair}`,
    analytics: `Pool Analytics — ${pair}`,
    close: `Close Pool — ${pair}`,
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={onBack}>← Back</Button>
        <h2 className="text-xl font-bold">{titles[type]}</h2>
      </div>

      {type === 'add' && (
        <>
          <GlassCard className="p-4 space-y-3">
            <p className="text-sm text-muted-foreground">Deposit {pool.token_a_symbol}</p>
            <div className="flex items-center gap-4">
              <Input type="number" placeholder="0" value={amountA} onChange={e => setAmountA(e.target.value)}
                className="border-0 bg-transparent text-2xl font-light p-0 h-auto focus-visible:ring-0" />
              <Badge variant="secondary" className="font-semibold px-3 py-1">{pool.token_a_symbol}</Badge>
            </div>
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>${(parseFloat(amountA || '0') * 86.8).toFixed(2)}</span>
              <div className="flex items-center gap-1"><Wallet className="h-3 w-3" /><span>0.0000</span></div>
            </div>
          </GlassCard>
          <GlassCard className="p-4 space-y-3">
            <p className="text-sm text-muted-foreground">Deposit {pool.token_b_symbol}</p>
            <div className="flex items-center gap-4">
              <Input type="number" placeholder="0" value={amountB} onChange={e => setAmountB(e.target.value)}
                className="border-0 bg-transparent text-2xl font-light p-0 h-auto focus-visible:ring-0" />
              <Badge variant="secondary" className="font-semibold px-3 py-1">{pool.token_b_symbol}</Badge>
            </div>
          </GlassCard>
          <GlassCard className="p-3 space-y-1 text-sm">
            <div className="flex justify-between text-muted-foreground"><span>Pool APR</span><span className="font-mono text-primary">{pool.apr.toFixed(1)}%</span></div>
            <div className="flex justify-between text-muted-foreground"><span>Fee Tier</span><span className="font-mono">{pool.fee_tier}%</span></div>
            <div className="flex justify-between text-muted-foreground"><span>Current TVL</span><span className="font-mono">{formatValue(pool.tvl)}</span></div>
          </GlassCard>
          <Button className="w-full h-14 text-lg font-semibold bg-amber-600/80 hover:bg-amber-600 text-foreground"
            disabled={isProcessing || (!amountA && !amountB) || !isConnected}
            onClick={() => submitTx(`Added liquidity to ${pair}`, parseFloat(amountA || '0') + parseFloat(amountB || '0'), `pool-${pool.id}`)}>
            {isProcessing ? <span className="flex items-center gap-2"><Loader2 className="h-5 w-5 animate-spin" /> Adding...</span>
              : !isConnected ? 'Connect Wallet' : 'Add Liquidity'}
          </Button>
        </>
      )}

      {type === 'remove' && (
        <>
          <GlassCard className="p-4 space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Remove Amount</span>
              <span className="font-semibold text-lg">{withdrawPercent[0]}%</span>
            </div>
            <Slider value={withdrawPercent} onValueChange={setWithdrawPercent} max={100} step={1} />
            <div className="flex gap-2">
              {[25, 50, 75, 100].map(v => (
                <Button key={v} variant={withdrawPercent[0] === v ? 'secondary' : 'ghost'} size="sm" className="flex-1"
                  onClick={() => setWithdrawPercent([v])}>{v}%</Button>
              ))}
            </div>
          </GlassCard>
          <GlassCard className="p-4 space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Pool TVL</span><span className="font-mono">{formatValue(pool.tvl)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Your Share (est.)</span><span className="font-mono">~0.1%</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Remove Fee</span><span className="font-mono">0.1%</span></div>
          </GlassCard>
          <Button className="w-full h-14 text-lg font-semibold bg-amber-600/80 hover:bg-amber-600 text-foreground"
            disabled={isProcessing || withdrawPercent[0] === 0 || !isConnected}
            onClick={() => submitTx(`Removed ${withdrawPercent[0]}% liquidity from ${pair}`, pool.tvl * 0.001 * withdrawPercent[0] / 100, address || 'user-wallet')}>
            {isProcessing ? <span className="flex items-center gap-2"><Loader2 className="h-5 w-5 animate-spin" /> Removing...</span>
              : !isConnected ? 'Connect Wallet' : `Remove ${withdrawPercent[0]}%`}
          </Button>
        </>
      )}

      {type === 'lock' && (
        <>
          <GlassCard className="p-4 space-y-4">
            <p className="text-sm text-muted-foreground">Lock your pool position to earn higher yields.</p>
            <div>
              <label className="text-sm text-muted-foreground mb-1 block">Lock Duration (days)</label>
              <Input type="number" value={lockDays} onChange={e => setLockDays(e.target.value)} className="bg-secondary/30" />
            </div>
            <div className="flex gap-2">
              {['7', '30', '90', '180'].map(d => (
                <Button key={d} variant={lockDays === d ? 'secondary' : 'ghost'} size="sm" className="flex-1"
                  onClick={() => setLockDays(d)}>{d}d</Button>
              ))}
            </div>
          </GlassCard>
          <GlassCard className="p-4 space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Pool</span><span className="font-semibold">{pair}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Lock Duration</span><span className="font-mono">{lockDays} days</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Unlock Date</span><span className="font-mono">{new Date(Date.now() + parseInt(lockDays || '0') * 86400000).toLocaleDateString()}</span></div>
            <div className="flex justify-between text-primary"><span>APR Boost</span><span className="font-mono font-semibold">+{Math.min(50, parseInt(lockDays || '0') / 3.6).toFixed(1)}%</span></div>
          </GlassCard>
          <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-sm text-amber-400">
            <Lock className="h-4 w-4 shrink-0" />
            <span>Locked liquidity cannot be withdrawn until the lock period ends.</span>
          </div>
          <Button className="w-full h-14 text-lg font-semibold bg-amber-600/80 hover:bg-amber-600 text-foreground"
            disabled={isProcessing || !lockDays || parseInt(lockDays) <= 0 || !isConnected}
            onClick={() => submitTx(`Locked ${pair} liquidity for ${lockDays} days`, pool.tvl * 0.001, 'lock-contract')}>
            {isProcessing ? <span className="flex items-center gap-2"><Loader2 className="h-5 w-5 animate-spin" /> Locking...</span>
              : !isConnected ? 'Connect Wallet' : `Lock for ${lockDays} Days`}
          </Button>
        </>
      )}

      {type === 'analytics' && (
        <>
          <GlassCard className="p-4">
            <div className="flex items-center gap-2 mb-4">
              <BarChart3 className="h-5 w-5 text-primary" />
              <h3 className="font-semibold text-lg">Pool Performance</h3>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <GlassCard className="p-3">
                <p className="text-xs text-muted-foreground mb-1">TVL</p>
                <p className="text-xl font-bold">{formatValue(pool.tvl)}</p>
              </GlassCard>
              <GlassCard className="p-3">
                <p className="text-xs text-muted-foreground mb-1">APR</p>
                <p className="text-xl font-bold text-primary">{pool.apr.toFixed(1)}%</p>
              </GlassCard>
            </div>
          </GlassCard>
          <GlassCard className="p-4 space-y-3">
            <h4 className="font-medium text-sm text-muted-foreground">Detailed Metrics</h4>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">24H Volume</span><span className="font-mono">{formatValue(pool.volume_24h)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">24H Fees</span><span className="font-mono">{formatValue(pool.fees_24h)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Fee Tier</span><span className="font-mono">{pool.fee_tier}%</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">7D Volume</span><span className="font-mono">{formatValue(pool.volume_24h * 6.5)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">30D Volume</span><span className="font-mono">{formatValue(pool.volume_24h * 28)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Liquidity Providers</span><span className="font-mono">{Math.floor(pool.tvl / 500)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Utilization Rate</span><span className="font-mono">{(pool.volume_24h / Math.max(1, pool.tvl) * 100).toFixed(1)}%</span></div>
            </div>
          </GlassCard>
        </>
      )}

      {type === 'close' && (
        <>
          <GlassCard className="p-4 space-y-3">
            <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/30 text-sm text-destructive">
              <AlertTriangle className="h-5 w-5 shrink-0" />
              <div>
                <p className="font-semibold">Close Pool Warning</p>
                <p>This will remove all your liquidity from {pair} and close the pool position. This action cannot be undone.</p>
              </div>
            </div>
          </GlassCard>
          <GlassCard className="p-4 space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Pool</span><span className="font-semibold">{pair}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Your TVL</span><span className="font-mono">{formatValue(pool.tvl * 0.001)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Unclaimed Fees</span><span className="font-mono">{formatValue(pool.fees_24h * 0.01)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Exit Fee</span><span className="font-mono">0.1%</span></div>
          </GlassCard>
          <Button className="w-full h-14 text-lg font-semibold bg-destructive hover:bg-destructive/90 text-destructive-foreground"
            disabled={isProcessing || !isConnected}
            onClick={() => submitTx(`Closed ${pair} pool position`, pool.tvl * 0.001, address || 'user-wallet', true)}>
            {isProcessing ? <span className="flex items-center gap-2"><Loader2 className="h-5 w-5 animate-spin" /> Closing...</span>
              : !isConnected ? 'Connect Wallet' : 'Confirm Close Pool'}
          </Button>
        </>
      )}
    </div>
  );
};
