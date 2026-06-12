import { useState } from 'react';
import { GlassCard } from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { TrendingUp, TrendingDown, AlertTriangle, RefreshCw, Info } from 'lucide-react';
import { cn } from '@/lib/utils';

type Side = 'long' | 'short';
type Market = { pair: string; price: number; change: number; funding: number; oi: number };

const MARKETS: Market[] = [
  { pair: 'GYDS/USD', price: 0.0000001, change: 2.4, funding: 0.0012, oi: 1240000 },
  { pair: 'GYDS/ETH', price: 0.000000000000042, change: -1.1, funding: 0.0008, oi: 580000 },
  { pair: 'GYDS/BTC', price: 0.0000000000000018, change: 0.8, funding: 0.0005, oi: 320000 },
];

export const Perpetuals = () => {
  const { toast } = useToast();
  const [market, setMarket] = useState(MARKETS[0]);
  const [side, setSide] = useState<Side>('long');
  const [size, setSize] = useState('');
  const [leverage, setLeverage] = useState(5);
  const [submitting, setSubmitting] = useState(false);

  const notionalValue = parseFloat(size || '0') * leverage;
  const liquidationPrice = side === 'long'
    ? market.price * (1 - 1 / leverage * 0.9)
    : market.price * (1 + 1 / leverage * 0.9);
  const fee = notionalValue * 0.001;

  const submit = async () => {
    if (!size || parseFloat(size) <= 0) {
      toast({ title: 'Enter position size', variant: 'destructive' });
      return;
    }
    setSubmitting(true);
    await new Promise(r => setTimeout(r, 800));
    setSubmitting(false);
    toast({
      title: `${side === 'long' ? '📈' : '📉'} ${side.toUpperCase()} opened`,
      description: `${leverage}× ${side} on ${market.pair} · Notional: $${notionalValue.toFixed(2)}. Contracts launch with mainnet.`,
    });
    setSize('');
  };

  const fmtPx = (p: number) => {
    if (p < 0.000001) return p.toExponential(3);
    return p.toFixed(7);
  };

  return (
    <div className="space-y-4">
      {/* Market selector */}
      <GlassCard className="p-4 space-y-3">
        <h2 className="font-semibold flex items-center gap-2 text-sm">📊 Perpetual Markets</h2>
        <div className="space-y-2">
          {MARKETS.map(m => (
            <button key={m.pair} onClick={() => setMarket(m)}
              className={cn('w-full flex items-center justify-between p-3 rounded-xl text-left transition-all border',
                market.pair === m.pair ? 'border-primary/60 bg-primary/10' : 'border-border/30 bg-muted/10 hover:bg-muted/20')}>
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
      <GlassCard className="p-4 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-sm">{market.pair} Perpetual</h2>
          <Badge variant="secondary" className="text-xs">Funding: {(market.funding * 100).toFixed(4)}%/hr</Badge>
        </div>

        {/* Long / Short toggle */}
        <div className="grid grid-cols-2 gap-2">
          <Button onClick={() => setSide('long')}
            className={cn('gap-2 transition-all', side === 'long' ? 'bg-emerald-500 hover:bg-emerald-600 text-white' : 'variant-outline opacity-70')}>
            <TrendingUp className="w-4 h-4" /> Long
          </Button>
          <Button onClick={() => setSide('short')}
            className={cn('gap-2 transition-all', side === 'short' ? 'bg-red-500 hover:bg-red-600 text-white' : 'variant-outline opacity-70')}>
            <TrendingDown className="w-4 h-4" /> Short
          </Button>
        </div>

        {/* Leverage */}
        <div>
          <Label className="text-xs text-muted-foreground">Leverage: {leverage}×</Label>
          <input type="range" min={1} max={50} value={leverage} onChange={e => setLeverage(Number(e.target.value))}
            className="w-full mt-1 accent-primary" />
          <div className="flex justify-between text-xs text-muted-foreground mt-0.5">
            {[1, 5, 10, 20, 50].map(l => (
              <button key={l} onClick={() => setLeverage(l)}
                className={`px-1.5 py-0.5 rounded ${leverage === l ? 'text-primary font-bold' : ''}`}>{l}×</button>
            ))}
          </div>
        </div>

        {/* Size */}
        <div>
          <Label className="text-xs text-muted-foreground">Collateral (GYDS)</Label>
          <Input type="number" value={size} onChange={e => setSize(e.target.value)}
            placeholder="0.0" className="mt-1 font-mono" />
        </div>

        {/* Order summary */}
        {parseFloat(size) > 0 && (
          <div className="space-y-1.5 p-3 bg-muted/20 rounded-xl text-xs">
            {[
              ['Notional value', `$${notionalValue.toFixed(4)}`],
              ['Entry price', fmtPx(market.price)],
              ['Liq. price', fmtPx(liquidationPrice)],
              ['Opening fee (0.1%)', `$${fee.toFixed(6)}`],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between">
                <span className="text-muted-foreground">{k}</span>
                <span className="font-mono">{v}</span>
              </div>
            ))}
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
      </GlassCard>

      {/* Open positions (empty state) */}
      <GlassCard className="p-4 space-y-2">
        <h2 className="font-semibold text-sm flex items-center gap-2"><Info className="w-4 h-4 text-muted-foreground" /> Open Positions</h2>
        <div className="text-center py-6 text-muted-foreground">
          <TrendingUp className="w-8 h-8 mx-auto mb-2 opacity-20" />
          <p className="text-sm">No open positions. Perpetual contracts are live on mainnet.</p>
        </div>
      </GlassCard>
    </div>
  );
};
