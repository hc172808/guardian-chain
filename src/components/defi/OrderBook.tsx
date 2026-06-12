import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { GlassCard } from '@/components/ui/GlassCard';
import { ArrowDown, ArrowUp, RefreshCw, TrendingUp, X } from 'lucide-react';
import { cn } from '@/lib/utils';

type OrderSide = 'buy' | 'sell';
type OrderType = 'limit' | 'stop-limit' | 'market';

interface BookLevel {
  price: number;
  size: number;
  total: number;
  depth: number;
}

interface MyOrder {
  id: string;
  side: string;
  orderType: string;
  price: string | null;
  amount: string;
  filled: string;
  status: string;
  createdAt: string;
}

const midPrice = 0.0000001;

const genBook = (mid: number, side: 'buy' | 'sell', levels = 10): BookLevel[] => {
  const out: BookLevel[] = [];
  let cum = 0;
  for (let i = 0; i < levels; i++) {
    const offset = (i + 1) * (0.000000001 + Math.random() * 0.000000002);
    const price = side === 'buy' ? mid - offset : mid + offset;
    const size = Math.random() * 5_000_000 + 500_000;
    cum += price * size;
    out.push({ price, size, total: cum, depth: 0 });
  }
  const max = out[out.length - 1].total;
  return out.map(o => ({ ...o, depth: o.total / max }));
};

export const OrderBook = () => {
  const { user } = useAuth();
  const { toast } = useToast();

  interface Trade { id: number; price: string; amount: string; side: string; executed_at: string; }

  const [asks, setAsks] = useState<BookLevel[]>([]);
  const [bids, setBids] = useState<BookLevel[]>([]);
  const [side, setSide] = useState<OrderSide>('buy');
  const [type, setType] = useState<OrderType>('limit');
  const [price, setPrice] = useState('0.0000001');
  const [amount, setAmount] = useState('');
  const [stopPrice, setStopPrice] = useState('');
  const [placing, setPlacing] = useState(false);
  const [myOrders, setMyOrders] = useState<MyOrder[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [showTrades, setShowTrades] = useState(true);

  useEffect(() => {
    const refresh = () => {
      setAsks(genBook(midPrice, 'sell'));
      setBids(genBook(midPrice, 'buy'));
    };
    refresh();
    const t = setInterval(refresh, 3000);
    return () => clearInterval(t);
  }, []);

  const fetchMyOrders = useCallback(async () => {
    if (!user) return;
    setLoadingOrders(true);
    try {
      const res = await fetch('/api/orders', { credentials: 'include' });
      if (res.ok) setMyOrders(await res.json());
    } finally {
      setLoadingOrders(false);
    }
  }, [user]);

  const fetchTrades = useCallback(async () => {
    try {
      const res = await fetch('/api/trades?pair=GYDS/USDT&limit=20');
      if (res.ok) setTrades(await res.json());
    } catch {}
  }, []);

  useEffect(() => { fetchMyOrders(); fetchTrades(); }, [fetchMyOrders, fetchTrades]);
  useEffect(() => {
    const id = setInterval(fetchTrades, 10_000);
    return () => clearInterval(id);
  }, [fetchTrades]);

  const placeOrder = async () => {
    if (!user) { toast({ title: 'Sign in to trade', variant: 'destructive' }); return; }
    if (!amount || parseFloat(amount) <= 0) { toast({ title: 'Enter amount', variant: 'destructive' }); return; }
    if (type !== 'market' && (!price || parseFloat(price) <= 0)) { toast({ title: 'Enter price', variant: 'destructive' }); return; }
    setPlacing(true);
    try {
      const body: any = { side, orderType: type, amount };
      if (type !== 'market') body.price = price;
      if (type === 'stop-limit') body.stopPrice = stopPrice;
      const res = await fetch('/api/orders', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Order failed');
      toast({
        title: `${type.charAt(0).toUpperCase() + type.slice(1)} order placed`,
        description: `${side.toUpperCase()} ${parseFloat(amount).toLocaleString()} GYDS${type !== 'market' ? ` @ $${price}` : ''}`,
      });
      setAmount('');
      fetchMyOrders();
    } catch (err: any) {
      toast({ title: 'Order failed', description: err.message, variant: 'destructive' });
    } finally {
      setPlacing(false);
    }
  };

  const cancelOrder = async (id: string) => {
    setCancelling(id);
    try {
      const res = await fetch(`/api/orders/${id}`, { method: 'DELETE', credentials: 'include' });
      if (!res.ok) throw new Error((await res.json()).error || 'Cancel failed');
      toast({ title: 'Order cancelled' });
      fetchMyOrders();
    } catch (err: any) {
      toast({ title: 'Cancel failed', description: err.message, variant: 'destructive' });
    } finally {
      setCancelling(null);
    }
  };

  const fmtPrice = (p: number) => p.toFixed(10);
  const fmtSize  = (s: number) => (s / 1_000_000).toFixed(2) + 'M';

  const openOrders = myOrders.filter(o => o.status === 'open');

  const maxDepth = Math.max(...asks.map(o => o.total), ...bids.map(o => o.total), 1);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-primary" /> Order Book
        </h2>
        <Badge variant="secondary" className="gap-1 text-xs">
          <span className="w-2 h-2 rounded-full bg-primary animate-pulse" /> GYDS/USDT
        </Badge>
      </div>

      {/* Mid price */}
      <GlassCard className="p-3 text-center">
        <p className="text-2xl font-bold font-mono text-primary">${midPrice.toFixed(10)}</p>
        <p className="text-xs text-muted-foreground mt-0.5">Mid price · GYDS/USDT</p>
      </GlassCard>

      {/* Depth Chart */}
      <GlassCard className="p-4">
        <p className="text-xs font-semibold text-muted-foreground mb-3">Depth Chart</p>
        <div className="relative h-28 flex items-end gap-px overflow-hidden rounded-lg bg-muted/10">
          {/* Bid side (left) */}
          <div className="flex-1 flex items-end h-full gap-px">
            {[...bids].reverse().map((o, i) => (
              <div key={i} className="flex-1 flex flex-col justify-end h-full" title={`Bid $${o.price.toFixed(10)}: ${(o.total / 1e6).toFixed(1)}M`}>
                <div className="w-full bg-emerald-500/40 rounded-t transition-all"
                  style={{ height: `${(o.total / maxDepth) * 100}%`, minHeight: 2 }} />
              </div>
            ))}
          </div>
          {/* Center line */}
          <div className="w-px bg-border/60 h-full shrink-0" />
          {/* Ask side (right) */}
          <div className="flex-1 flex items-end h-full gap-px">
            {asks.map((o, i) => (
              <div key={i} className="flex-1 flex flex-col justify-end h-full" title={`Ask $${o.price.toFixed(10)}: ${(o.total / 1e6).toFixed(1)}M`}>
                <div className="w-full bg-red-500/40 rounded-t transition-all"
                  style={{ height: `${(o.total / maxDepth) * 100}%`, minHeight: 2 }} />
              </div>
            ))}
          </div>
        </div>
        <div className="flex justify-between text-[10px] text-muted-foreground mt-1.5">
          <span className="text-emerald-400">← Bids</span>
          <span className="text-xs font-mono">Mid: ${midPrice.toFixed(10)}</span>
          <span className="text-red-400">Asks →</span>
        </div>
      </GlassCard>

      <div className="grid grid-cols-1 gap-4">
        {/* Live order book */}
        <GlassCard className="p-3 space-y-1">
          <div className="space-y-0.5">
            {[...asks].reverse().map((o, i) => (
              <div key={i} className="relative flex justify-between items-center text-xs py-0.5 px-1 rounded overflow-hidden cursor-pointer hover:bg-red-500/5"
                onClick={() => setPrice(fmtPrice(o.price))}>
                <div className="absolute inset-0 right-auto bg-red-500/10" style={{ width: `${o.depth * 100}%` }} />
                <span className="font-mono text-red-400 relative">{fmtPrice(o.price)}</span>
                <span className="text-muted-foreground relative">{fmtSize(o.size)}</span>
                <span className="text-muted-foreground relative hidden sm:block">{fmtSize(o.total)}</span>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-center gap-2 py-1.5 border-y border-border/20 my-1">
            <ArrowDown className="w-3 h-3 text-red-400" />
            <span className="text-xs font-bold text-primary font-mono">${midPrice.toFixed(10)}</span>
            <ArrowUp className="w-3 h-3 text-emerald-400" />
          </div>
          <div className="space-y-0.5">
            {bids.map((o, i) => (
              <div key={i} className="relative flex justify-between items-center text-xs py-0.5 px-1 rounded overflow-hidden cursor-pointer hover:bg-emerald-500/5"
                onClick={() => setPrice(fmtPrice(o.price))}>
                <div className="absolute inset-0 right-auto bg-emerald-500/10" style={{ width: `${o.depth * 100}%` }} />
                <span className="font-mono text-emerald-400 relative">{fmtPrice(o.price)}</span>
                <span className="text-muted-foreground relative">{fmtSize(o.size)}</span>
                <span className="text-muted-foreground relative hidden sm:block">{fmtSize(o.total)}</span>
              </div>
            ))}
          </div>
          <div className="flex gap-2 pt-1 text-[10px] text-muted-foreground justify-between px-1">
            <span>Price</span><span>Size (M)</span><span className="hidden sm:block">Total (M)</span>
          </div>
        </GlassCard>

        {/* Order form */}
        <GlassCard className="p-4 space-y-3">
          <div className="grid grid-cols-2 gap-1 p-1 bg-muted/30 rounded-xl">
            {(['buy', 'sell'] as const).map(s => (
              <button key={s} onClick={() => setSide(s)}
                className={cn('py-2 rounded-lg text-sm font-medium transition-all capitalize', side === s
                  ? s === 'buy' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'
                  : 'text-muted-foreground hover:text-foreground')}>
                {s}
              </button>
            ))}
          </div>

          <div className="flex gap-1">
            {(['limit', 'market', 'stop-limit'] as const).map(t => (
              <button key={t} onClick={() => setType(t)}
                className={cn('flex-1 py-1 rounded-lg text-xs font-medium border transition-all capitalize', type === t
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border/30 text-muted-foreground hover:text-foreground')}>
                {t}
              </button>
            ))}
          </div>

          {type === 'stop-limit' && (
            <div>
              <label className="text-xs text-muted-foreground">Stop Price (USDT)</label>
              <Input value={stopPrice} onChange={e => setStopPrice(e.target.value)} placeholder="0.00000000" className="font-mono text-sm mt-1" />
            </div>
          )}
          {type !== 'market' && (
            <div>
              <label className="text-xs text-muted-foreground">Price (USDT)</label>
              <Input value={price} onChange={e => setPrice(e.target.value)} className="font-mono text-sm mt-1" />
            </div>
          )}

          <div>
            <label className="text-xs text-muted-foreground">Amount (GYDS)</label>
            <Input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0" className="font-mono text-sm mt-1" />
          </div>

          {amount && parseFloat(amount) > 0 && type !== 'market' && (
            <div className="flex justify-between text-xs text-muted-foreground bg-muted/20 p-2 rounded-lg">
              <span>Total</span>
              <span className="font-mono">${(parseFloat(amount) * parseFloat(price || '0')).toFixed(6)} USDT</span>
            </div>
          )}

          <Button
            className={cn('w-full', side === 'buy' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-red-600 hover:bg-red-700')}
            onClick={placeOrder}
            disabled={placing}
          >
            {placing
              ? <><RefreshCw className="w-4 h-4 animate-spin mr-2" />Placing…</>
              : `${side === 'buy' ? 'Buy' : 'Sell'} GYDS`}
          </Button>
        </GlassCard>

        {/* Trade History Feed */}
        <GlassCard className="p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-semibold">Recent Trades</p>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
              <button onClick={() => setShowTrades(v => !v)} className="text-xs text-muted-foreground hover:text-foreground">
                {showTrades ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>
          {showTrades && (
            <>
              <div className="flex justify-between text-[10px] text-muted-foreground mb-1 px-1">
                <span>Price (USDT)</span><span>Amount (GYDS)</span><span>Time</span>
              </div>
              <div className="space-y-px max-h-48 overflow-y-auto">
                {trades.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-4">No trades yet</p>
                ) : trades.map(t => (
                  <div key={t.id} className="flex justify-between items-center text-xs py-0.5 px-1 hover:bg-muted/20 rounded">
                    <span className={`font-mono ${t.side === 'buy' ? 'text-emerald-400' : 'text-red-400'}`}>
                      {parseFloat(t.price).toFixed(10)}
                    </span>
                    <span className="text-muted-foreground font-mono">
                      {(parseFloat(t.amount) / 1_000_000).toFixed(2)}M
                    </span>
                    <span className="text-muted-foreground text-[10px]">
                      {new Date(t.executed_at).toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
        </GlassCard>

        {/* My open orders */}
        {user && (
          <GlassCard className="p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-semibold">My Open Orders</p>
              <button onClick={fetchMyOrders} disabled={loadingOrders} className="text-muted-foreground hover:text-foreground transition-colors">
                <RefreshCw className={cn('w-3.5 h-3.5', loadingOrders && 'animate-spin')} />
              </button>
            </div>
            {openOrders.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4">No open orders</p>
            ) : (
              <div className="space-y-2">
                {openOrders.map(o => (
                  <motion.div key={o.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                    className="flex items-center justify-between text-xs bg-muted/20 rounded-lg p-2 gap-2">
                    <Badge variant="outline" className={cn('text-[10px] px-1.5 py-0 shrink-0', o.side === 'buy' ? 'text-emerald-400 border-emerald-500/30' : 'text-red-400 border-red-500/30')}>
                      {o.side.toUpperCase()}
                    </Badge>
                    <span className="font-mono flex-1 truncate">{parseFloat(o.amount).toLocaleString()} GYDS</span>
                    {o.price && <span className="font-mono text-muted-foreground shrink-0">@ ${parseFloat(o.price).toFixed(10)}</span>}
                    <button onClick={() => cancelOrder(o.id)} disabled={cancelling === o.id} className="text-muted-foreground hover:text-red-400 transition-colors shrink-0">
                      {cancelling === o.id ? <RefreshCw className="w-3 h-3 animate-spin" /> : <X className="w-3 h-3" />}
                    </button>
                  </motion.div>
                ))}
              </div>
            )}
          </GlassCard>
        )}
      </div>
    </div>
  );
};
