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
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Plus, Search, Filter, MoreHorizontal, Droplets, ArrowLeftRight, BarChart3, Loader2, Calculator } from 'lucide-react';
import { ImpermanentLossCalc } from './ImpermanentLossCalc';
import { supabase } from '@/integrations/supabase/client';
import { CreatePool } from './CreatePool';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import {
  executeAddLiquidity,
  executeRemoveLiquidityPercent,
  getPairAddress,
  getPairInfo,
  getPairReserves,
  getTokenDecimals,
} from '@/lib/swapContract';
import { api } from '@/lib/api';
import { ethers } from 'ethers';
import {
  applyRuntimeContractAddresses,
  isConfiguredContractAddress,
} from '@/config/contracts';
import { loadDeFiTokenCatalog, NATIVE_GYDS_ADDRESS } from '@/lib/defiTokenCatalog';

interface Pool {
  id: string;
  token_a_symbol: string;
  token_b_symbol: string;
  token_a_address?: string | null;
  token_b_address?: string | null;
  fee_tier: number;
  tvl: number;
  volume_24h: number;
  fees_24h: number;
  apr: number;
  onChainPairAddress?: string | null;
}

const formatValue = (value: number): string => {
  if (value >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
  if (value >= 1e6) return `$${(value / 1e6).toFixed(2)}M`;
  if (value >= 1e3) return `$${(value / 1e3).toFixed(0)}K`;
  return `$${value.toFixed(0)}`;
};

type PoolOverlay = { type: 'add' | 'remove' | 'analytics'; pool: Pool } | null;

export const PoolsList = () => {
  const [view, setView] = useState<'pools' | 'calculator'>('pools');
  const [searchQuery, setSearchQuery] = useState('');
  const [pools, setPools] = useState<Pool[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [overlay, setOverlay] = useState<PoolOverlay>(null);
  const { toast } = useToast();

  const loadPools = async () => {
    setLoading(true);
    try {
      const [{ data, error }, dexConfig] = await Promise.all([
        supabase
          .from('liquidity_pools')
          .select('id, token_a_symbol, token_b_symbol, token_a_address, token_b_address, fee_tier, tvl, volume_24h, fees_24h, apr')
          .eq('is_active', true)
          .order('tvl', { ascending: false }),
        api.get('/api/dex/config'),
      ]);
      if (error) throw new Error(error.message);
      applyRuntimeContractAddresses(dexConfig.addresses ?? {});
      const rows: Pool[] = Array.isArray(data) ? data.map((pool: Pool) => ({
        ...pool,
        fee_tier: Number(pool.fee_tier) || 0.3,
        tvl: Number(pool.tvl) || 0,
        volume_24h: Number(pool.volume_24h) || 0,
        fees_24h: Number(pool.fees_24h) || 0,
        apr: Number(pool.apr) || 0,
      })) : [];
      const catalog = await loadDeFiTokenCatalog(dexConfig).catch(() => []);
      const resolveAddress = (pool: Pool, side: 'a' | 'b') => {
        const symbol = side === 'a' ? pool.token_a_symbol : pool.token_b_symbol;
        if (symbol.toUpperCase() === 'GYDS') return dexConfig.addresses?.WGYDS;
        const saved = side === 'a' ? pool.token_a_address : pool.token_b_address;
        return saved || catalog.find(asset => asset.symbol.toUpperCase() === symbol.toUpperCase())?.address;
      };
      const enriched = await Promise.all(rows.map(async pool => {
        const tokenAAddress = resolveAddress(pool, 'a');
        const tokenBAddress = resolveAddress(pool, 'b');
        if (!isConfiguredContractAddress(tokenAAddress) || !isConfiguredContractAddress(tokenBAddress)) {
          return { ...pool, onChainPairAddress: null, tvl: 0 };
        }
        const pairAddress = await getPairAddress(tokenAAddress, tokenBAddress);
        if (!pairAddress) return { ...pool, onChainPairAddress: null, tvl: 0 };
        const [reserves, info] = await Promise.all([
          getPairReserves(pairAddress),
          getPairInfo(pairAddress),
        ]);
        if (!reserves || !info) return { ...pool, onChainPairAddress: pairAddress, tvl: 0 };
        const [decimals0, decimals1] = await Promise.all([
          getTokenDecimals(info.token0),
          getTokenDecimals(info.token1),
        ]);
        const amount0 = Number(ethers.formatUnits(BigInt(reserves.reserve0), decimals0));
        const amount1 = Number(ethers.formatUnits(BigInt(reserves.reserve1), decimals1));
        const symbol0 = info.token0.toLowerCase() === tokenAAddress.toLowerCase()
          ? pool.token_a_symbol
          : pool.token_b_symbol;
        const symbol1 = symbol0 === pool.token_a_symbol ? pool.token_b_symbol : pool.token_a_symbol;
        const price0 = catalog.find(asset => asset.symbol.toUpperCase() === symbol0.toUpperCase())?.price ?? 0;
        const price1 = catalog.find(asset => asset.symbol.toUpperCase() === symbol1.toUpperCase())?.price ?? 0;
        const tvl = amount0 * price0 + amount1 * price1;
        return {
          ...pool,
          token_a_address: tokenAAddress,
          token_b_address: tokenBAddress,
          onChainPairAddress: pairAddress,
          tvl: Number.isFinite(tvl) ? tvl : 0,
        };
      }));
      setPools(enriched);
    } catch (error: any) {
      console.error('[pools] Failed to load pool state:', error);
      toast({
        title: 'Could not load pools',
        description: error?.message ?? 'Pool data is temporarily unavailable.',
        variant: 'destructive',
      });
      setPools([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPools();
    const channel = supabase
      .channel('pools')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'liquidity_pools' }, () => loadPools())
      .subscribe();
    const refresh = window.setInterval(() => void loadPools(), 30_000);
    return () => { supabase.removeChannel(channel); window.clearInterval(refresh); };
  }, []);

  if (showCreate) return <CreatePool onBack={() => { setShowCreate(false); loadPools(); }} />;
  if (overlay) return <PoolActionPanel overlay={overlay} onBack={() => { setOverlay(null); loadPools(); }} />;
  if (view === 'calculator') return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <button onClick={() => setView('pools')} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeftRight className="h-4 w-4" />
          Back to Pools
        </button>
      </div>
      <ImpermanentLossCalc />
    </div>
  );

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

      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          className="gap-2 border-amber-500/50 text-amber-500 hover:bg-amber-500/10 hover:text-amber-400"
          onClick={() => setShowCreate(true)}
        >
          <Plus className="h-4 w-4" /> Create Pool
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="gap-2 text-muted-foreground hover:text-foreground ml-auto"
          onClick={() => setView('calculator')}
        >
          <Calculator className="h-4 w-4" /> IL Calculator
        </Button>
      </div>

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
                  {!pool.onChainPairAddress && <Badge variant="outline" className="text-xs text-amber-400">Pair not found on-chain</Badge>}
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
                    <DropdownMenuItem className="gap-2 text-primary" disabled={!pool.onChainPairAddress} onSelect={() => setOverlay({ type: 'add', pool })}>
                      <Plus className="h-4 w-4" /> Add Liquidity
                    </DropdownMenuItem>
                    <DropdownMenuItem className="gap-2" disabled={!pool.onChainPairAddress} onSelect={() => setOverlay({ type: 'remove', pool })}>
                      <ArrowLeftRight className="h-4 w-4" /> Remove Liquidity
                    </DropdownMenuItem>
                    <DropdownMenuItem className="gap-2" onSelect={() => setOverlay({ type: 'analytics', pool })}>
                      <BarChart3 className="h-4 w-4" /> Pool Analytics
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
  const { toast } = useToast();
  const [isProcessing, setIsProcessing] = useState(false);
  const [amountA, setAmountA] = useState('');
  const [amountB, setAmountB] = useState('');
  const [withdrawPercent, setWithdrawPercent] = useState([50]);
  const [tokenAAddress, setTokenAAddress] = useState<string | null>(null);
  const [tokenBAddress, setTokenBAddress] = useState<string | null>(null);
  const [tokenLoadError, setTokenLoadError] = useState('');

  useEffect(() => {
    let cancelled = false;
    const loadTokenContracts = async () => {
      try {
        const dexConfig = await api.get('/api/dex/config');
        applyRuntimeContractAddresses(dexConfig.addresses ?? {});
        const catalog = await loadDeFiTokenCatalog(dexConfig);
        const resolve = (symbol: string, saved: string | null | undefined) => {
          if (symbol.toUpperCase() === 'GYDS') return NATIVE_GYDS_ADDRESS;
          return saved || catalog.find(asset => asset.symbol.toUpperCase() === symbol.toUpperCase())?.address || null;
        };
        if (!cancelled) {
          setTokenAAddress(resolve(pool.token_a_symbol, pool.token_a_address));
          setTokenBAddress(resolve(pool.token_b_symbol, pool.token_b_address));
        }
      } catch (error: any) {
        if (!cancelled) setTokenLoadError(error?.message ?? 'Could not load token contracts.');
      }
    };
    void loadTokenContracts();
    return () => { cancelled = true; };
  }, [pool]);

  const addLiquidity = async () => {
    if (!user) {
      toast({ title: 'Login Required', description: 'Sign in before adding liquidity.', variant: 'destructive' });
      return;
    }
    const a = Number(amountA);
    const b = Number(amountB);
    if (!tokenAAddress || !tokenBAddress || !Number.isFinite(a) || !Number.isFinite(b) || a <= 0 || b <= 0) {
      toast({ title: 'Liquidity details unavailable', description: tokenLoadError || 'Enter a positive amount for both tokens.', variant: 'destructive' });
      return;
    }
    setIsProcessing(true);
    try {
      const decimalsA = pool.token_a_symbol.toUpperCase() === 'GYDS' ? 18 : await getTokenDecimals(tokenAAddress);
      const decimalsB = pool.token_b_symbol.toUpperCase() === 'GYDS' ? 18 : await getTokenDecimals(tokenBAddress);
      const rawA = ethers.parseUnits(amountA, decimalsA);
      const rawB = ethers.parseUnits(amountB, decimalsB);
      const txHash = await executeAddLiquidity(
        tokenAAddress,
        tokenBAddress,
        rawA.toString(),
        rawB.toString(),
        (rawA * 995n / 1000n).toString(),
        (rawB * 995n / 1000n).toString(),
        '',
        Math.floor(Date.now() / 1000) + 600,
      );
      toast({ title: 'Liquidity added', description: `Confirmed transaction ${txHash?.slice(0, 14) ?? ''}` });
      onBack();
    } catch (error: any) {
      toast({
        title: 'Liquidity add failed',
        description: error?.shortMessage ?? error?.message ?? 'The transaction failed.',
        variant: 'destructive',
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const removeLiquidity = async () => {
    if (!user || !tokenAAddress || !tokenBAddress) {
      toast({ title: 'Wallet unavailable', description: tokenLoadError || 'Sign in and reload this pool.', variant: 'destructive' });
      return;
    }
    setIsProcessing(true);
    try {
      const txHash = await executeRemoveLiquidityPercent(tokenAAddress, tokenBAddress, withdrawPercent[0]);
      toast({ title: 'Liquidity removed', description: `Confirmed transaction ${txHash.slice(0, 14)}` });
      onBack();
    } catch (error: any) {
      toast({
        title: 'Liquidity removal failed',
        description: error?.shortMessage ?? error?.message ?? 'The transaction failed.',
        variant: 'destructive',
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const titles: Record<string, string> = {
    add: `Add Liquidity — ${pair}`,
    remove: `Remove Liquidity — ${pair}`,
    analytics: `Pool Analytics — ${pair}`,
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
            <p className="text-xs text-muted-foreground">
              GydsSwap will ask your EVM wallet to approve each ERC-20 token, then confirm the liquidity transaction. Native GYDS is sent as transaction value.
            </p>
          </GlassCard>
          <Button className="w-full h-14 text-lg font-semibold bg-amber-600/80 hover:bg-amber-600 text-foreground"
            disabled={isProcessing || !amountA || !amountB || !user || !pool.onChainPairAddress}
            onClick={() => void addLiquidity()}>
            {isProcessing ? <span className="flex items-center gap-2"><Loader2 className="h-5 w-5 animate-spin" /> Adding...</span>
              : !user ? 'Sign In' : 'Add Liquidity'}
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
            <p className="text-xs text-muted-foreground">Removal uses the LP tokens held by the wallet you authorize. Minimum outputs include 0.5% slippage protection.</p>
          </GlassCard>
          <Button className="w-full h-14 text-lg font-semibold bg-amber-600/80 hover:bg-amber-600 text-foreground"
            disabled={isProcessing || withdrawPercent[0] === 0 || !user || !pool.onChainPairAddress}
            onClick={() => void removeLiquidity()}>
            {isProcessing ? <span className="flex items-center gap-2"><Loader2 className="h-5 w-5 animate-spin" /> Removing...</span>
              : !user ? 'Sign In' : `Remove ${withdrawPercent[0]}%`}
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
              <p className="pt-2 text-xs text-muted-foreground">Volume and fee values are recorded app metrics; TVL is estimated from current on-chain reserves and token prices.</p>
            </div>
          </GlassCard>
        </>
      )}

    </div>
  );
};
