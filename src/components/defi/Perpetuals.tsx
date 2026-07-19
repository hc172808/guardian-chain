import { useState, useEffect, useCallback, useMemo } from 'react';
import { GlassCard } from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { TrendingUp, TrendingDown, AlertTriangle, RefreshCw, Info, Timer, X } from 'lucide-react';
import { cn } from '@/lib/utils';

type Side = 'long' | 'short';
type Market = { 
  pair: string; 
  price: number; 
  change: number; 
  funding: number; 
  oi: number;
  maxLeverage: number;
  minSize: number;
};

interface Position {
  id: string;
  market: string;
  side: Side;
  size: number;
  leverage: number;
  entry_price: number;
  liquidation_price: number;
  margin: number;
  pnl: number;
  created_at: string;
}

export const Perpetuals = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  
  const [markets, setMarkets] = useState<Market[]>([]);
  const [market, setMarket] = useState<Market | null>(null);
  const [positions, setPositions] = useState<Position[]>([]);
  
  const [side, setSide] = useState<Side>('long');
  const [size, setSize] = useState('');
  const [leverage, setLeverage] = useState(5);
  
  const [loadingMarkets, setLoadingMarkets] = useState(true);
  const [loadingPositions, setLoadingPositions] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [closingId, setClosingId] = useState<string | null>(null);
  const [fundingTime, setFundingTime] = useState('');

  const fetchMarkets = useCallback(async () => {
    setLoadingMarkets(true);
    try {
      const res = await fetch('/api/perps/markets');
      if (res.ok) {
        const data = await res.json();
        setMarkets(data);
        if (data.length > 0) setMarket(data[0]);
      }
    } finally {
      setLoadingMarkets(false);
    }
  }, []);

  const fetchPositions = useCallback(async () => {
    if (!user) return;
    setLoadingPositions(true);
    try {
      const res = await fetch('/api/perps/positions', { credentials: 'include' });
      if (res.ok) setPositions(await res.json());
    } finally {
      setLoadingPositions(false);
    }
  }, [user]);

  useEffect(() => {
    fetchMarkets();
    fetchPositions();
  }, [fetchMarkets, fetchPositions]);

  useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date();
      const next = new Date();
      next.setUTCHours(Math.ceil((now.getUTCHours() + 1) / 8) * 8, 0, 0, 0);
      const diff = next.getTime() - now.getTime();
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setFundingTime(`${h}h ${m}m ${s}s`);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const notionalValue = useMemo(() => {
    const s = parseFloat(size || '0');
    return s * leverage;
  }, [size, leverage]);

  const liquidationPrice = useMemo(() => {
    if (!market) return 0;
    return side === 'long'
      ? market.price * (1 - 1 / leverage * 0.9)
      : market.price * (1 + 1 / leverage * 0.9);
  }, [market, side, leverage]);

  const fee = notionalValue * 0.001;

  const submit = async () => {
    if (!user) return;
    if (!market || !size || parseFloat(size) < market.minSize) {
      toast({ title: `Min size is ${market?.minSize} GYDS`, variant: 'destructive' });
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/perps/positions', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          market: market.pair,
          side,
          size: parseFloat(size),
          leverage,
          entryPrice: market.price
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      toast({ title: 'Position Opened', description: `${leverage}x ${side.toUpperCase()} ${market.pair}` });
      setSize('');
      fetchPositions();
    } catch (err: any) {
      toast({ title: 'Order failed', description: err.message, variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  const closePosition = async (id: string) => {
    setClosingId(id);
    try {
      const res = await fetch(`/api/perps/positions/${id}`, { method: 'DELETE', credentials: 'include' });
      if (!res.ok) throw new Error('Failed to close');
      toast({ title: 'Position Closed' });
      fetchPositions();
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setClosingId(null);
    }
  };

  const fmtPx = (p: number) => {
    if (p < 0.000001) return p.toExponential(3);
    return p.toFixed(7);
  };

  if (loadingMarkets) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-48 w-full rounded-xl" />
        <Skeleton className="h-96 w-full rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Market selector */}
      <GlassCard className="p-4 space-y-3">
        <h2 className="font-semibold flex items-center gap-2 text-sm">📊 Perpetual Markets</h2>
        <div className="space-y-2">
          {markets.map(m => (
            <button key={m.pair} onClick={() => { setMarket(m); setLeverage(prev => Math.min(prev, m.maxLeverage)); }}
              className={cn('w-full flex items-center justify-between p-3 rounded-xl text-left transition-all border',
                market?.pair === m.pair ? 'border-primary/60 bg-primary/10' : 'border-border/30 bg-muted/10 hover:bg-muted/20')}>
              <div>
                <p className="font-semibold text-sm">{m.pair}</p>
                <p className="text-xs text-muted-foreground font-mono">{fmtPx(m.price)}</p>
              </div>
              <div className="text-right">
                <p className={`text-sm font-bold ${m.change >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {m.change >= 0 ? '+' : ''}{m.change}%
                </p>
                <p className="text-xs text-muted-foreground">OI: ${(m.oi / 1000).toFixed(0)}K</p>
              </div>
            </button>
          ))}
        </div>
      </GlassCard>

      {/* Trade panel */}
      {market && (
        <GlassCard className="p-4 space-y-4 relative">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-sm">{market.pair} Perpetual</h2>
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="text-[10px] gap-1">
                <Timer className="w-2.5 h-2.5" /> {fundingTime}
              </Badge>
              <Badge variant="secondary" className="text-xs">Funding: {(market.funding * 100).toFixed(4)}%/hr</Badge>
            </div>
          </div>

          {!user ? (
            <div className="py-8 text-center space-y-3">
              <p className="text-sm text-muted-foreground">Sign in to start trading perpetuals</p>
              <Button variant="outline" className="w-full border-primary/30 hover:bg-primary/10">Sign in to trade</Button>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-2">
                <Button onClick={() => setSide('long')}
                  className={cn('gap-2 transition-all', side === 'long' ? 'bg-emerald-500 hover:bg-emerald-600 text-white' : 'bg-muted/20 text-muted-foreground border-transparent')}>
                  <TrendingUp className="w-4 h-4" /> Long
                </Button>
                <Button onClick={() => setSide('short')}
                  className={cn('gap-2 transition-all', side === 'short' ? 'bg-red-500 hover:bg-red-600 text-white' : 'bg-muted/20 text-muted-foreground border-transparent')}>
                  <TrendingDown className="w-4 h-4" /> Short
                </Button>
              </div>

              <div>
                <Label className="text-xs text-muted-foreground flex justify-between">
                  <span>Leverage: {leverage}×</span>
                  <span>Max: {market.maxLeverage}×</span>
                </Label>
                <input type="range" min={1} max={market.maxLeverage} value={leverage} onChange={e => setLeverage(Number(e.target.value))}
                  className="w-full mt-1 accent-primary" />
                <div className="flex justify-between text-xs text-muted-foreground mt-0.5">
                  {[1, 5, 10, 20, 50].filter(l => l <= market.maxLeverage).map(l => (
                    <button key={l} onClick={() => setLeverage(l)}
                      className={`px-1.5 py-0.5 rounded ${leverage === l ? 'text-primary font-bold bg-primary/10' : ''}`}>{l}×</button>
                  ))}
                </div>
              </div>

              <div>
                <Label className="text-xs text-muted-foreground">Collateral (GYDS)</Label>
                <Input type="number" value={size} onChange={e => setSize(e.target.value)}
                  placeholder={`Min ${market.minSize}`} className="mt-1 font-mono" />
              </div>

              {parseFloat(size) > 0 && (
                <div className="space-y-1.5 p-3 bg-muted/20 rounded-xl text-xs">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Notional value</span>
                    <span className="font-mono text-primary">${notionalValue.toFixed(4)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Entry price</span>
                    <span className="font-mono">{fmtPx(market.price)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Liq. price</span>
                    <span className="font-mono text-amber-400">{fmtPx(liquidationPrice)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Opening fee (0.1%)</span>
                    <span className="font-mono">${fee.toFixed(6)}</span>
                  </div>
                </div>
              )}

              {leverage > 20 && (
                <div className="flex gap-2 p-2.5 bg-red-500/10 border border-red-500/30 rounded-lg text-xs text-red-300">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  High leverage ({leverage}×) greatly increases liquidation risk.
                </div>
              )}

              <Button className={cn('w-full gap-2', side === 'long' ? 'bg-emerald-500 hover:bg-emerald-600' : 'bg-red-500 hover:bg-red-600')}
                onClick={submit} disabled={submitting}>
                {submitting ? <RefreshCw className="w-4 h-4 animate-spin" /> : side === 'long' ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                Open {leverage}× {side.toUpperCase()}
              </Button>
            </>
          )}
        </GlassCard>
      )}

      {/* Open positions */}
      <GlassCard className="p-4 space-y-3">
        <h2 className="font-semibold text-sm flex items-center gap-2"><Info className="w-4 h-4 text-muted-foreground" /> Open Positions</h2>
        
        {!user ? (
          <div className="text-center py-6 text-muted-foreground text-sm">Sign in to view positions</div>
        ) : loadingPositions && positions.length === 0 ? (
          <Skeleton className="h-20 w-full" />
        ) : positions.length === 0 ? (
          <div className="text-center py-6 text-muted-foreground">
            <TrendingUp className="w-8 h-8 mx-auto mb-2 opacity-20" />
            <p className="text-sm">No open positions.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {positions.map(pos => {
              const currentMarket = markets.find(m => m.pair === pos.market);
              const curPrice = currentMarket?.price || pos.entry_price;
              const priceDiff = Math.abs(curPrice - pos.liquidation_price) / curPrice;
              const isNearLiq = priceDiff < 0.1;

              return (
                <div key={pos.id} className="p-3 bg-muted/20 border border-border/30 rounded-xl space-y-2">
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm">{pos.market}</span>
                        <Badge className={cn('text-[10px] uppercase h-4 px-1', pos.side === 'long' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400')}>
                          {pos.side} {pos.leverage}x
                        </Badge>
                      </div>
                      <p className="text-[10px] text-muted-foreground">Size: {pos.size} GYDS</p>
                    </div>
                    <div className="text-right">
                      <p className={cn('text-sm font-bold', pos.pnl >= 0 ? 'text-emerald-400' : 'text-red-400')}>
                        {pos.pnl >= 0 ? '+' : ''}{pos.pnl.toFixed(4)} USD
                      </p>
                      <p className="text-[10px] text-muted-foreground">Unrealized P&L</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-[10px]">
                    <div>
                      <p className="text-muted-foreground">Entry</p>
                      <p className="font-mono">{fmtPx(pos.entry_price)}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Mark</p>
                      <p className="font-mono">{fmtPx(curPrice)}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Liquidation</p>
                      <p className={cn('font-mono', isNearLiq ? 'text-red-500 font-bold animate-pulse' : 'text-amber-500')}>
                        {fmtPx(pos.liquidation_price)}
                      </p>
                    </div>
                  </div>

                  <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={() => closePosition(pos.id)}
                    disabled={closingId === pos.id}
                    className="w-full h-7 text-xs hover:bg-red-500/10 hover:text-red-400 border border-border/20 mt-1"
                  >
                    {closingId === pos.id ? <RefreshCw className="w-3 h-3 animate-spin mr-2" /> : <X className="w-3 h-3 mr-2" />}
                    Close Position
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </GlassCard>
    </div>
  );
};