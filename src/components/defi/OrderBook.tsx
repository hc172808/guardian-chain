import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { GlassCard } from '@/components/ui/GlassCard';
import { ArrowDown, ArrowUp, RefreshCw, TrendingUp } from 'lucide-react';
import { cn } from '@/lib/utils';

type OrderSide = 'buy' | 'sell';
type OrderType = 'limit' | 'stop-limit' | 'market';

interface Order {
  price: number;
  size: number;
  total: number;
  depth: number; // 0–1 for bar width
}

const genBook = (mid: number, side: 'buy' | 'sell', levels = 10): Order[] => {
  const orders: Order[] = [];
  let cumTotal = 0;
  for (let i = 0; i < levels; i++) {
    const offset = (i + 1) * (0.000000001 + Math.random() * 0.000000002);
    const price = side === 'buy' ? mid - offset : mid + offset;
    const size  = Math.random() * 5_000_000 + 500_000;
    cumTotal += price * size;
    orders.push({ price, size, total: cumTotal, depth: 0 });
  }
  const maxTotal = orders[orders.length - 1].total;
  return orders.map(o => ({ ...o, depth: o.total / maxTotal }));
};

export const OrderBook = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const midPrice = 0.0000001;
  const [asks, setAsks] = useState<Order[]>([]);
  const [bids, setBids] = useState<Order[]>([]);
  const [side, setSide] = useState<OrderSide>('buy');
  const [type, setType] = useState<OrderType>('limit');
  const [price, setPrice] = useState('0.0000001');
  const [amount, setAmount] = useState('');
  const [stopPrice, setStopPrice] = useState('');
  const [placing, setPlacing] = useState(false);

  useEffect(() => {
    const refresh = () => {
      setAsks(genBook(midPrice, 'sell'));
      setBids(genBook(midPrice, 'buy'));
    };
    refresh();
    const t = setInterval(refresh, 3000);
    return () => clearInterval(t);
  }, []);

  const placeOrder = async () => {
    if (!user) { toast({ title: 'Sign in to trade', variant: 'destructive' }); return; }
    if (!amount || parseFloat(amount) <= 0) { toast({ title: 'Enter amount', variant: 'destructive' }); return; }
    setPlacing(true);
    await new Promise(r => setTimeout(r, 800));
    setPlacing(false);
    toast({
      title: `${type.charAt(0).toUpperCase() + type.slice(1)} order placed`,
      description: `${side.toUpperCase()} ${parseFloat(amount).toLocaleString()} GYDS @ $${price}`,
    });
    setAmount('');
  };

  const fmtPrice = (p: number) => p.toFixed(10);
  const fmtSize  = (s: number) => (s / 1_000_000).toFixed(2) + 'M';

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

      <div className="grid grid-cols-1 gap-4">
        {/* Book */}
        <GlassCard className="p-3 space-y-1">
          {/* Asks (sells — red, shown in reverse) */}
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

          {/* Spread */}
          <div className="flex items-center justify-center gap-2 py-1.5 border-y border-border/20 my-1">
            <ArrowDown className="w-3 h-3 text-red-400" />
            <span className="text-xs font-bold text-primary font-mono">${midPrice.toFixed(10)}</span>
            <ArrowUp className="w-3 h-3 text-emerald-400" />
          </div>

          {/* Bids (buys — green) */}
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
          {/* Buy/Sell toggle */}
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

          {/* Order type */}
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

          {/* Price fields */}
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
              ? <><RefreshCw className="w-4 h-4 animate-spin mr-2" /> Placing…</>
              : `${side === 'buy' ? 'Buy' : 'Sell'} GYDS`
            }
          </Button>
        </GlassCard>
      </div>
    </div>
  );
};
