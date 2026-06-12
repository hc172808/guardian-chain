import { useState } from 'react';
import { GlassCard } from '@/components/ui/GlassCard';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Calculator, TrendingDown, Info } from 'lucide-react';

const calcIL = (priceChange: number) => {
  const k = priceChange;
  const il = 2 * Math.sqrt(k) / (1 + k) - 1;
  return il * 100;
};

export const ImpermanentLossCalc = () => {
  const [initialPrice, setInitialPrice] = useState('0.0000001');
  const [newPrice, setNewPrice] = useState('0.0000002');
  const [depositA, setDepositA] = useState('1000000');
  const [depositB, setDepositB] = useState('0.1');

  const p0 = parseFloat(initialPrice) || 1;
  const p1 = parseFloat(newPrice) || 1;
  const da = parseFloat(depositA) || 0;
  const db = parseFloat(depositB) || 0;

  const ratio = p1 / p0;
  const ilPct  = calcIL(ratio);

  const initValue  = da * p0 + db;
  const holdValue  = da * p1 + db;
  const lpValueA   = da * Math.sqrt(ratio);
  const lpValueB   = db / Math.sqrt(ratio);
  const lpValue    = lpValueA * p1 + lpValueB;
  const ilDollar   = lpValue - holdValue;

  const SCENARIOS = [
    { label: '1.25× up',  change: 1.25 },
    { label: '1.5× up',   change: 1.50 },
    { label: '2× up',     change: 2.00 },
    { label: '3× up',     change: 3.00 },
    { label: '5× up',     change: 5.00 },
    { label: '0.75× dn',  change: 0.75 },
    { label: '0.5× dn',   change: 0.50 },
    { label: '0.25× dn',  change: 0.25 },
  ];

  return (
    <GlassCard className="p-5 space-y-5">
      <div className="flex items-center gap-2">
        <Calculator className="w-5 h-5 text-primary" />
        <h3 className="font-semibold">Impermanent Loss Calculator</h3>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-3">
          <div>
            <Label className="text-xs text-muted-foreground">Initial GYDS price (USDT)</Label>
            <Input value={initialPrice} onChange={e => setInitialPrice(e.target.value)} type="number" className="mt-1 font-mono text-sm" />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">New GYDS price (USDT)</Label>
            <Input value={newPrice} onChange={e => setNewPrice(e.target.value)} type="number" className="mt-1 font-mono text-sm" />
          </div>
        </div>
        <div className="space-y-3">
          <div>
            <Label className="text-xs text-muted-foreground">GYDS deposited</Label>
            <Input value={depositA} onChange={e => setDepositA(e.target.value)} type="number" className="mt-1 font-mono text-sm" />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">USDT deposited (paired side)</Label>
            <Input value={depositB} onChange={e => setDepositB(e.target.value)} type="number" className="mt-1 font-mono text-sm" />
          </div>
        </div>
      </div>

      {/* Result */}
      <div className={`p-4 rounded-xl border ${ilPct < -1 ? 'bg-red-500/10 border-red-500/30' : ilPct < 0 ? 'bg-amber-500/10 border-amber-500/30' : 'bg-emerald-500/10 border-emerald-500/30'}`}>
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <p className="text-xs text-muted-foreground">Impermanent Loss</p>
            <p className={`text-3xl font-bold ${ilPct < -1 ? 'text-red-400' : ilPct < 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
              {ilPct.toFixed(3)}%
            </p>
          </div>
          {db > 0 && (
            <div className="text-right">
              <p className="text-xs text-muted-foreground">IL in dollar terms</p>
              <p className={`text-lg font-bold ${ilDollar < 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                {ilDollar >= 0 ? '+' : ''}${ilDollar.toFixed(4)}
              </p>
            </div>
          )}
          <div>
            <p className="text-xs text-muted-foreground">Price ratio</p>
            <p className="text-lg font-bold">{ratio.toFixed(3)}×</p>
          </div>
        </div>

        {db > 0 && (
          <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
            <div className="p-2 bg-muted/30 rounded-lg">
              <p className="text-muted-foreground">Initial value</p>
              <p className="font-bold">${initValue.toFixed(4)}</p>
            </div>
            <div className="p-2 bg-muted/30 rounded-lg">
              <p className="text-muted-foreground">HODL value</p>
              <p className="font-bold">${holdValue.toFixed(4)}</p>
            </div>
            <div className="p-2 bg-muted/30 rounded-lg">
              <p className="text-muted-foreground">LP value</p>
              <p className={`font-bold ${lpValue < holdValue ? 'text-red-400' : 'text-emerald-400'}`}>${lpValue.toFixed(4)}</p>
            </div>
          </div>
        )}
      </div>

      {/* Scenario table */}
      <div>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Quick Scenarios</p>
        <div className="grid grid-cols-4 gap-2">
          {SCENARIOS.map(s => {
            const il = calcIL(s.change);
            return (
              <div key={s.label}
                className={`p-2.5 rounded-xl text-center border cursor-pointer transition-colors hover:border-primary/40 ${Math.abs(ratio - s.change) < 0.01 ? 'border-primary/40 bg-primary/5' : 'border-border/30 bg-muted/10'}`}
                onClick={() => setNewPrice(String(p0 * s.change))}>
                <p className="text-xs font-medium">{s.label}</p>
                <p className={`text-xs font-bold mt-0.5 ${il < -1 ? 'text-red-400' : il < 0 ? 'text-amber-400' : 'text-emerald-400'}`}>{il.toFixed(2)}%</p>
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex gap-2 p-3 bg-muted/20 rounded-lg text-xs text-muted-foreground">
        <Info className="w-3.5 h-3.5 shrink-0 mt-0.5 text-primary" />
        <p>IL measures the difference between holding tokens vs providing liquidity.
          Fees earned in the pool can compensate for IL — factor in pool APY before deciding.</p>
      </div>
    </GlassCard>
  );
};
