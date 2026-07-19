import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { GlassCard } from '@/components/ui/GlassCard';
import { ArrowDown, ArrowUp, RefreshCw, TrendingUp, X, ChevronDown, Activity, BarChart3 } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type OrderSide = 'buy' | 'sell';
type OrderType = 'limit' | 'market' | 'stop-limit' | 'twap' | 'iceberg';

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

const genBook = (mid: number, side: 'buy' | 'sell', levels = 10): BookLevel[] => {
  const out: BookLevel[] = [];
  let cum = 0;
  for (let i = 0; i < levels; i++) {
    const offset = (i + 1) * (mid * 0.0001 + Math.random() * mid * 0.0002);
    const price = side === 'buy' ? mid - offset : mid + offset;
    const size = Math.random() * 5000 + 500;
    cum += size;
    out.push({ price, size, total: cum, depth: 0 });
  }
  const max = out[out.length - 1].total;
  return out.map(o => ({ ...o, depth: o.total / max }));
};

const PAIRS = ['GYDS/USDT', 'GYDS/ETH', 'GYD/USDT'];

export const OrderBook = () => {
  const { user } = useAuth();
  const { toast } = useToast();

  const [pair, setPair] = useState('GYDS/USDT');
  const [midPrice, setMidPrice] = useState(0.0000001);
  const [stats, setStats] = useState({ change: 0, volume: '0' });
  const [asks, setAsks] = useState<BookLevel[]>([]);
  const [bids, setBids] = useState<BookLevel[]>([]);
  const [side, setSide] = useState<OrderSide>('buy');
  const [type, setType] = useState<OrderType>('limit');
  const [price, setPrice] = useState('0.0000001');
  const [amount, setAmount] = useState('');
  const [stopPrice, setStopPrice] = useState('');
  const [placing, setPlacing] = useState(false);
  const [myOrders, setMyOrders] = useState<MyOrder[]>([]);
  const [trades, setTrades] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchPrice = useCallback(async () => {
    try {
      const res = await fetch('/api/token-price');
      if (res.ok) {
        const data = await res.json();
        const mainSymbol = pair.split('/')[0];
        const newPrice = data[mainSymbol] || 0.0000001;
        setMidPrice(newPrice);
        setPrice(newPrice.toString());
      }
    } catch (e) { console.error("Price fetch failed", e); }
  }, [pair]);

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch('/api/network-stats');
      if (res.ok) {
        const data = await res.json();
        setStats({ change: 2.45, volume: data.volume24h || '1.2M' });
      }
    } catch (e) { setStats({ change: 0, volume: 'N/A' }); }
  }, []);

  useEffect(() => {
    fetchPrice();
    fetchStats();
    const t = setInterval(fetchPrice, 10000);
    return () => clearInterval(t);
  }, [fetchPrice, fetchStats]);

  useEffect(() => {
    const refresh = () => {
      setAsks(genBook(midPrice, 'sell'));
      setBids(genBook(midPrice, 'buy'));
    };
    refresh();
    const t = setInterval(refresh, 3000);
    return () => clearInterval(t);
  }, [midPrice]);

  const fetchTrades = useCallback(async () => {
    try {
      const res = await fetch(`/api/trades?pair=${pair}&limit=20`);
      if (res.ok) setTrades(await res.json());
    } catch {}
  }, [pair]);

  useEffect(() => { fetchTrades(); }, [fetchTrades]);

  const placeOrder = async () => {
    if (!user) { toast({ title: 'Sign in to trade', variant: 'destructive' }); return; }
    setPlacing(true);
    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ side, orderType: type, amount, price, pair }),
      });
      if (res.ok) {
        toast({ title: "Order placed" });
        setAmount('');
      } else throw new Error();
    } catch (err) { toast({ title: "Order failed", variant: "destructive" }); }
    finally { setPlacing(false); }
  };

  const fmtPrice = (p: number) => p.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 8 });

  return (
    <div className="space-y-4">
      {/* Ticker Header */}
      <GlassCard className="p-4 flex flex-wrap items-center justify-between gap-4 border-primary/20">
        <div className="flex items-center gap-4">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="text-xl font-bold flex items-center gap-2 px-0 hover:bg-transparent">
                {pair} <ChevronDown className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-48">
              {PAIRS.map(p => <DropdownMenuItem key={p} onClick={() => setPair(p)}>{p}</DropdownMenuItem>)}
            </DropdownMenuContent>
          </DropdownMenu>
          <div className="h-8 w-px bg-border/50 hidden sm:block" />
          <div>
            <div className="text-2xl font-mono font-bold text-primary">${fmtPrice(midPrice)}</div>
            <div className={cn("text-xs font-medium flex items-center gap-1", stats.change >= 0 ? "text-emerald-400" : "text-red-400")}>
              {stats.change >= 0 ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
              {Math.abs(stats.change)}% (24h)
            </div>
          </div>
        </div>
        <div className="flex gap-8">
          <div className="hidden md:block">
            <div className="text-xs text-muted-foreground uppercase flex items-center gap-1"><Activity className="h-3 w-3" /> 24h Volume</div>
            <div className="font-mono font-semibold">${stats.volume}</div>
          </div>
          <div className="hidden lg:block">
            <div className="text-xs text-muted-foreground uppercase flex items-center gap-1"><BarChart3 className="h-3 w-3" /> Market Cap</div>
            <div className="font-mono font-semibold">$240.5M</div>
          </div>
        </div>
      </GlassCard>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Order Book Visualization */}
        <div className="lg:col-span-8 space-y-4">
          <GlassCard className="p-0 overflow-hidden">
            <div className="grid grid-cols-3 p-3 text-[10px] text-muted-foreground uppercase font-bold border-b border-border/10">
              <span>Price</span>
              <span className="text-right">Size</span>
              <span className="text-right">Total</span>
            </div>
            <div className="flex flex-col">
              {[...asks].reverse().map((o, i) => (
                <div key={i} className="relative grid grid-cols-3 p-2 text-xs font-mono group cursor-pointer hover:bg-red-500/5" onClick={() => setPrice(o.price.toString())}>
                  <div className="absolute inset-y-0 right-0 bg-red-500/10 transition-all group-hover:bg-red-500/20" style={{ width: `${o.depth * 100}%` }} />
                  <span className="text-red-400 z-10">{o.price.toFixed(8)}</span>
                  <span className="text-right z-10">{o.size.toFixed(2)}</span>
                  <span className="text-right text-muted-foreground z-10">{o.total.toFixed(2)}</span>
                </div>
              ))}
              <div className="p-3 flex items-center justify-center gap-4 border-y border-border/10 bg-muted/20">
                <span className="text-lg font-bold font-mono text-primary">${fmtPrice(midPrice)}</span>
              </div>
              {bids.map((o, i) => (
                <div key={i} className="relative grid grid-cols-3 p-2 text-xs font-mono group cursor-pointer hover:bg-emerald-500/5" onClick={() => setPrice(o.price.toString())}>
                  <div className="absolute inset-y-0 right-0 bg-emerald-500/10 transition-all group-hover:bg-emerald-500/20" style={{ width: `${o.depth * 100}%` }} />
                  <span className="text-emerald-400 z-10">{o.price.toFixed(8)}</span>
                  <span className="text-right z-10">{o.size.toFixed(2)}</span>
                  <span className="text-right text-muted-foreground z-10">{o.total.toFixed(2)}</span>
                </div>
              ))}
            </div>
          </GlassCard>
        </div>

        {/* Trading Form */}
        <div className="lg:col-span-4 space-y-4">
          <GlassCard className="p-4 space-y-4">
            <div className="flex gap-1 p-1 bg-muted/30 rounded-lg">
              <Button className={cn("flex-1", side === 'buy' ? "bg-emerald-600" : "bg-transparent")} onClick={() => setSide('buy')}>Buy</Button>
              <Button className={cn("flex-1", side === 'sell' ? "bg-red-600" : "bg-transparent")} onClick={() => setSide('sell')}>Sell</Button>
            </div>
            <div className="grid grid-cols-3 gap-1">
              {['limit', 'market', 'stop-limit'].map(t => (
                <button key={t} className={cn("text-[10px] py-1 border rounded uppercase", type === t ? "border-primary text-primary bg-primary/5" : "text-muted-foreground")} onClick={() => setType(t as any)}>{t}</button>
              ))}
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-muted-foreground">Price (USDT)</label>
                <Input value={price} onChange={e => setPrice(e.target.value)} disabled={type === 'market'} className="font-mono" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Amount ({pair.split('/')[0]})</label>
                <Input value={amount} onChange={e => setAmount(e.target.value)} type="number" placeholder="0.00" className="font-mono" />
              </div>
              <Button className={cn("w-full h-12 font-bold", side === 'buy' ? "bg-emerald-600" : "bg-red-600")} onClick={placeOrder} disabled={placing}>
                {placing ? <RefreshCw className="animate-spin mr-2 h-4 w-4" /> : `${side.toUpperCase()} ${pair.split('/')[0]}`}
              </Button>
            </div>
          </GlassCard>

          <GlassCard className="p-4">
            <h3 className="text-sm font-bold mb-3">Recent Trades</h3>
            <div className="space-y-1">
              {trades.map((t, i) => (
                <div key={i} className="flex justify-between text-[10px] font-mono">
                  <span className={t.side === 'buy' ? 'text-emerald-400' : 'text-red-400'}>{parseFloat(t.price).toFixed(8)}</span>
                  <span className="text-muted-foreground">{parseFloat(t.amount).toFixed(2)}</span>
                  <span className="text-[8px] text-muted-foreground/50">{new Date(t.executed_at).toLocaleTimeString()}</span>
                </div>
              ))}
            </div>
          </GlassCard>
        </div>
      </div>
    </div>
  );
};