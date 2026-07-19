import { useState, useEffect, useMemo } from 'react';
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
import { 
  Sprout, Search, List, LayoutGrid, AlertTriangle, MoreHorizontal,
  FileText, Plus, Minus, Lock, ArrowLeftRight, X, Monitor, Wallet, Loader2,
  TrendingUp, Clock, PieChart, Info, ArrowUpRight, Repeat
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { useWalletConnect } from '@/hooks/useWalletConnect';
import { supabase } from '@/integrations/supabase/client';

interface Position {
  id: string;
  tokenA: { symbol: string };
  tokenB: { symbol: string };
  fee: string;
  balance: number;
  pendingYield: number;
  hasWarning?: boolean;
  createdAt: string;
  poolId: string;
  apr: number;
  tvl?: number;
}

interface PortfolioProps {
  onViewPosition?: (position: any) => void;
}

type OverlayType = 'deposit' | 'withdraw' | 'lock' | 'transfer' | 'terminal' | null;

export const Portfolio = ({ onViewPosition }: PortfolioProps) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
  const [showSearch, setShowSearch] = useState(false);
  const [overlay, setOverlay] = useState<{ type: OverlayType; position: Position | null }>({ type: null, position: null });
  const [positions, setPositions] = useState<Position[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();
  const { user } = useAuth();
  const { address } = useWalletConnect();

  useEffect(() => {
    const loadPositions = async () => {
      if (!user) { setLoading(false); return; }
      
      const { data: txData } = await supabase
        .from('transactions')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      const { data: poolsData } = await supabase
        .from('liquidity_pools')
        .select('*')
        .eq('is_active', true);

      if (txData && poolsData) {
        const poolTxMap = new Map<string, { deposits: number; withdrawals: number; firstTx: string; poolId: string }>();
        
        txData.forEach(tx => {
          const poolMatch = tx.to_address?.match(/^pool-(.+)$/);
          const lpMatch = tx.to_address === 'liquidity-pool';
          const stakeMatch = tx.to_address === 'staking-pool';
          const swapMatch = tx.to_address === 'swap-pool';
          const lockMatch = tx.to_address === 'lock-contract';
          
          let key = '';
          if (poolMatch) key = poolMatch[1];
          else if (lpMatch || lockMatch) key = 'generic-lp';
          else if (stakeMatch) key = 'staking';
          else if (swapMatch) key = 'swap-activity';

          if (key) {
            const existing = poolTxMap.get(key) || { deposits: 0, withdrawals: 0, firstTx: tx.created_at, poolId: key };
            existing.deposits += tx.amount;
            if (new Date(tx.created_at) < new Date(existing.firstTx)) existing.firstTx = tx.created_at;
            poolTxMap.set(key, existing);
          }
          
          if (tx.from_address === 'liquidity-pool' || tx.from_address === 'staking-pool') {
            const key = tx.from_address === 'staking-pool' ? 'staking' : 'generic-lp';
            const existing = poolTxMap.get(key) || { deposits: 0, withdrawals: 0, firstTx: tx.created_at, poolId: key };
            existing.withdrawals += tx.amount;
            poolTxMap.set(key, existing);
          }
        });

        const realPositions: Position[] = [];
        
        poolsData.forEach(pool => {
          const poolTx = poolTxMap.get(pool.id);
          if (poolTx && poolTx.deposits > 0) {
            const netBalance = poolTx.deposits - poolTx.withdrawals;
            if (netBalance > 0) {
              realPositions.push({
                id: pool.id,
                poolId: pool.id,
                tokenA: { symbol: pool.token_a_symbol },
                tokenB: { symbol: pool.token_b_symbol },
                fee: `${pool.fee_tier}%`,
                balance: netBalance,
                pendingYield: netBalance * (pool.apr / 100 / 365),
                hasWarning: pool.apr === 0,
                createdAt: poolTx.firstTx,
                apr: pool.apr,
                tvl: pool.tvl
              });
            }
          }
        });

        // Fallbacks for generic positions
        const genericLp = poolTxMap.get('generic-lp');
        if (genericLp && (genericLp.deposits - genericLp.withdrawals) > 0) {
          realPositions.push({
            id: 'generic-lp',
            poolId: 'generic-lp',
            tokenA: { symbol: 'GYD' },
            tokenB: { symbol: 'GYDS' },
            fee: '0.3%',
            balance: genericLp.deposits - genericLp.withdrawals,
            pendingYield: (genericLp.deposits - genericLp.withdrawals) * 0.0001,
            hasWarning: false,
            createdAt: genericLp.firstTx,
            apr: 3.65
          });
        }

        setPositions(realPositions);
      }
      setLoading(false);
    };
    
    loadPositions();
    const channel = supabase.channel('portfolio-positions')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'transactions' }, () => loadPositions())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, address]);

  const stats = useMemo(() => {
    const totalValue = positions.reduce((acc, p) => acc + p.balance, 0);
    const totalYield = positions.reduce((acc, p) => acc + p.pendingYield, 0);
    return { totalValue, totalYield, count: positions.length };
  }, [positions]);

  const filteredPositions = positions.filter(pos =>
    pos.tokenA.symbol.toLowerCase().includes(searchQuery.toLowerCase()) ||
    pos.tokenB.symbol.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleAction = (action: string, pos: Position) => {
    if (action === 'details') {
      onViewPosition?.({ ...pos, priceRatio: 1.0, rangeMin: 0, rangeMax: Infinity, address: '0x...lp' });
    } else {
      setOverlay({ type: action as OverlayType, position: pos });
    }
  };

  if (overlay.type && overlay.position) {
    return <OverlayPanel type={overlay.type} position={overlay.position} onBack={() => setOverlay({ type: null, position: null })} />;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-2xl font-bold">Portfolio</h1>
          <p className="text-muted-foreground">Manage your DeFi positions and yield.</p>
        </div>
        <Button variant="outline" className="gap-2 border-primary/50 text-primary" onClick={() => toast({ title: "Harvesting..." })} disabled={stats.totalYield === 0}>
          <Sprout className="h-4 w-4" /> Harvest All (${stats.totalYield.toFixed(2)})
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <GlassCard className="p-4 flex flex-col items-center justify-center text-center">
          <span className="text-xs text-muted-foreground uppercase">Total Value</span>
          <span className="text-2xl font-bold">${stats.totalValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
        </GlassCard>
        <GlassCard className="p-4 flex flex-col items-center justify-center text-center">
          <span className="text-xs text-muted-foreground uppercase">Pending Yield</span>
          <span className="text-2xl font-bold text-primary">${stats.totalYield.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
        </GlassCard>
        <GlassCard className="p-4 flex flex-col items-center justify-center text-center">
          <span className="text-xs text-muted-foreground uppercase">Active Positions</span>
          <span className="text-2xl font-bold">{stats.count}</span>
        </GlassCard>
      </div>

      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => setShowSearch(!showSearch)}><Search className="h-5 w-5" /></Button>
        {showSearch && <input type="text" placeholder="Search..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="flex-1 bg-secondary/30 rounded-md px-3 py-1.5 text-sm border focus:outline-none" autoFocus />}
        {!showSearch && <div className="flex-1" />}
        <div className="flex items-center bg-secondary/50 rounded-lg p-1">
          <Button variant={viewMode === 'list' ? 'secondary' : 'ghost'} size="icon" onClick={() => setViewMode('list')} className="h-8 w-8"><List className="h-4 w-4" /></Button>
          <Button variant={viewMode === 'grid' ? 'secondary' : 'ghost'} size="icon" onClick={() => setViewMode('grid')} className="h-8 w-8"><LayoutGrid className="h-4 w-4" /></Button>
        </div>
      </div>

      {loading ? (
        <GlassCard className="p-12 text-center"><Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />Loading positions...</GlassCard>
      ) : filteredPositions.length === 0 ? (
        <GlassCard className="p-12 text-center space-y-4 border-dashed">
          <Wallet className="h-12 w-12 mx-auto text-muted-foreground opacity-50" />
          <div>
            <p className="font-medium">No positions found</p>
            <p className="text-sm text-muted-foreground">Start earning by providing liquidity or swapping tokens.</p>
          </div>
          <div className="flex gap-2 justify-center">
            <Button className="gap-2"><Plus className="h-4 w-4" /> Add Liquidity</Button>
            <Button variant="outline" className="gap-2"><Repeat className="h-4 w-4" /> Swap Tokens</Button>
          </div>
        </GlassCard>
      ) : (
        <div className="space-y-3">
          {filteredPositions.map(pos => (
            <div key={pos.id} className="flex items-center justify-between p-4 rounded-xl bg-card/50 border border-border/30 hover:border-primary/30 transition-all group">
              <div className="flex items-center gap-3">
                <div className="flex -space-x-2">
                  <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-[10px] font-bold border-2 border-background">{pos.tokenA.symbol[0]}</div>
                  <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-[10px] font-bold border-2 border-background">{pos.tokenB.symbol[0]}</div>
                </div>
                <div>
                  <div className="font-semibold flex items-center gap-2">{pos.tokenA.symbol}/{pos.tokenB.symbol} <Badge variant="secondary" className="text-[10px] px-1 h-4">{pos.fee}</Badge></div>
                  <div className="text-xs text-muted-foreground">Est. APR: {pos.apr}%</div>
                </div>
              </div>
              <div className="flex items-center gap-6">
                <div className="text-right">
                  <div className="font-semibold">${pos.balance.toFixed(2)}</div>
                  <div className="text-xs text-primary">+${pos.pendingYield.toFixed(4)}</div>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48">
                    <DropdownMenuItem onClick={() => handleAction('terminal', pos)} className="gap-2"><Monitor className="h-4 w-4" /> Terminal</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleAction('details', pos)} className="gap-2"><FileText className="h-4 w-4" /> Details</DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => handleAction('deposit', pos)} className="gap-2"><Plus className="h-4 w-4" /> Deposit</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleAction('withdraw', pos)} className="gap-2"><Minus className="h-4 w-4" /> Withdraw</DropdownMenuItem>
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

const OverlayPanel = ({ type, position, onBack }: { type: OverlayType, position: Position, onBack: () => void }) => {
  if (type === 'terminal') {
    const timeInPos = () => {
      const diff = Date.now() - new Date(position.createdAt).getTime();
      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      return `${days}d ${hours}h`;
    };
    
    const poolShare = position.tvl ? ((position.balance / position.tvl) * 100).toFixed(2) + '%' : '< 0.01%';
    const priceRatio = 1.05; // Dummy ratio for IL calc
    const estIL = Math.abs(2 * Math.sqrt(priceRatio) / (1 + priceRatio) - 1) * position.balance;
    const feesEarned = position.pendingYield * 0.3;
    const netPnl = position.pendingYield - estIL;

    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3"><Button variant="ghost" size="sm" onClick={onBack}>← Back</Button><h2 className="text-xl font-bold">Liquidity Terminal — {position.tokenA.symbol}/{position.tokenB.symbol}</h2></div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <GlassCard className="p-4 space-y-1">
            <div className="flex items-center gap-2 text-muted-foreground text-xs"><Clock className="h-3 w-3" /> TIME IN POSITION</div>
            <div className="text-lg font-bold font-mono">{timeInPos()}</div>
          </GlassCard>
          <GlassCard className="p-4 space-y-1">
            <div className="flex items-center gap-2 text-muted-foreground text-xs"><PieChart className="h-3 w-3" /> POOL SHARE</div>
            <div className="text-lg font-bold font-mono">{poolShare}</div>
          </GlassCard>
          <GlassCard className="p-4 space-y-1">
            <div className="flex items-center gap-2 text-muted-foreground text-xs text-amber-400"><TrendingUp className="h-3 w-3" /> EST. IL</div>
            <div className="text-lg font-bold font-mono text-amber-400">-${estIL.toFixed(2)}</div>
          </GlassCard>
          <GlassCard className="p-4 space-y-1">
            <div className="flex items-center gap-2 text-muted-foreground text-xs text-primary"><TrendingUp className="h-3 w-3" /> NET P&L</div>
            <div className="text-lg font-bold font-mono text-primary">Est. {netPnl >= 0 ? '+' : '-'}${Math.abs(netPnl).toFixed(2)}</div>
          </GlassCard>
        </div>
        <GlassCard className="p-6">
          <h3 className="text-sm font-semibold mb-4 uppercase tracking-wider text-muted-foreground">Earnings Breakdown</h3>
          <div className="space-y-4">
            <div className="flex justify-between items-center pb-2 border-b border-border/20">
              <span className="text-muted-foreground">Fees Earned (30%)</span>
              <span className="font-mono">Est. ${feesEarned.toFixed(2)}</span>
            </div>
            <div className="flex justify-between items-center pb-2 border-b border-border/20">
              <span className="text-muted-foreground">Incentive Rewards</span>
              <span className="font-mono">${(position.pendingYield - feesEarned).toFixed(2)}</span>
            </div>
            <div className="flex justify-between items-center font-bold pt-2">
              <span>Total Pending Yield</span>
              <span className="text-primary">${position.pendingYield.toFixed(2)}</span>
            </div>
          </div>
        </GlassCard>
        <div className="flex gap-4">
          <Button className="flex-1 h-12 gap-2" variant="outline"><Info className="h-4 w-4" /> View Analytics</Button>
          <Button className="flex-1 h-12 gap-2" onClick={() => toast({ title: "Harvesting yield..." })}><Sprout className="h-4 w-4" /> Harvest Rewards</Button>
        </div>
      </div>
    );
  }

  // Fallback for other overlays (deposit/withdraw/lock/transfer)
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3"><Button variant="ghost" size="sm" onClick={onBack}>← Back</Button><h2 className="text-xl font-bold capitalize">{type} — {position.tokenA.symbol}/{position.tokenB.symbol}</h2></div>
      <GlassCard className="p-8 text-center text-muted-foreground border-dashed">
        <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
        Processing {type} interface...
      </GlassCard>
    </div>
  );
};