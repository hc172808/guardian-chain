import { useState, useEffect } from 'react';
import { GlassCard } from '@/components/ui/GlassCard';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Calculator, Info, Search } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface Pool {
  token_a_symbol: string;
  token_b_symbol: string;
  apr: number;
  tvl: number;
}

const calcIL = (priceChange: number) => {
  const k = priceChange;
  const il = 2 * Math.sqrt(k) / (1 + k) - 1;
  return il * 100;
};

export const ImpermanentLossCalc = () => {
  const [pools, setPools] = useState<Pool[]>([]);
  const [selectedPoolIdx, setSelectedPoolIdx] = useState<string>("");
  
  const [initialPrice, setInitialPrice] = useState('1');
  const [newPrice, setNewPrice] = useState('2');
  const [depositA, setDepositA] = useState('1000');
  const [depositB, setDepositB] = useState('1000');
  const [tokenALabel, setTokenALabel] = useState('GYDS');
  const [tokenBLabel, setTokenBLabel] = useState('USDT');
  const [poolApr, setPoolApr] = useState<number | null>(null);

  useEffect(() => {
    fetch('/api/pools')
      .then(res => res.json())
      .then(data => setPools(data))
      .catch(err => console.error('Failed to load pools', err));
  }, []);

  const handlePoolSelect = (idx: string) => {
    setSelectedPoolIdx(idx);
    const pool = pools[parseInt(idx)];
    if (pool) {
      setTokenALabel(pool.token_a_symbol);
      setTokenBLabel(pool.token_b_symbol);
      setPoolApr(pool.apr);
    }
  };

  const p0 = parseFloat(initialPrice) || 1;
  const p1 = parseFloat(newPrice) || 1;
  const da = parseFloat(depositA) || 0;
  const db = parseFloat(depositB) || 0;

  const ratio = p1 / p0;
  const ilPct = calcIL(ratio);

  const initValue = da * p0 + db;
  const holdValue = da * p1 + db;
  const lpValueA = da * Math.sqrt(ratio);
  const lpValueB = db / Math.sqrt(ratio);
  const lpValue = lpValueA * p1 + lpValueB;
  const ilDollar = lpValue - holdValue;

  const breakEvenDays = poolApr && poolApr > 0 ? (Math.abs(ilPct) / (poolApr / 365)).toFixed(1) : null;

  const SCENARIOS = [
    { label: '1.25× up', change: 1.25 },
    { label: '1.5× up', change: 1.50 },
    { label: '2× up', change: 2.00 },
    { label: '3× up', change: 3.00 },
    { label: '5× up', change: 5.00 },
    { label: '0.75× dn', change: 0.75 },
    { label: '0.5× dn', change: 0.50 },
    { label: '0.25× dn', change: 0.25 },
  ];

  return (
    <GlassCard className="p-5 space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Calculator className="w-5 h-5 text-primary" />
          <h3 className="font-semibold">Impermanent Loss Calculator</h3>
        </div>
      </div>

      {pools.length > 0 && (
        <div className="p-3 bg-primary/5 border border-primary/20 rounded-xl space-y-2">
          <Label className="text-[10px] uppercase font-bold text-primary/70">Load from Pool</Label>
          <Select value={selectedPoolIdx} onValueChange={handlePoolSelect}>
            <SelectTrigger className="h-9">
              <SelectValue placeholder="Select a pool pair" />
            </SelectTrigger>
            <SelectContent>
              {pools.map((p, i) => (
                <SelectItem key={i} value={i.toString()}>
                  {p.token_a_symbol}/{p.token_b_symbol} ({p.apr}% APR)
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {poolApr !== null && (
            <div className="flex justify-between text-xs px-1">
              <span className="text-muted-foreground">Pool APY: <strong className="text-emerald-400">{poolApr}%</strong></span>
              {breakEvenDays && (
                <span className="text-muted-foreground">Fees to break even: <strong className="text-primary">{Math.abs(ilPct).toFixed(2)}%</strong></span>
              )}
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-3">
          <div>
            <Label className="text-xs text-muted-foreground">Initial {tokenALabel} price ({tokenBLabel})</Label>
            <Input value={initialPrice} onChange={e => setInitialPrice(e.target.value)} type="number" className="mt-1 font-mono text-sm" />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">New {tokenALabel} price ({tokenBLabel})</Label>
            <Input value={newPrice} onChange={e => setNewPrice(e.target.value)} type="number" className="mt-1 font-mono text-sm" />
          </div>
        </div>
        <div className="space-y-3">
          <div>
            <Label className="text-xs text-muted-foreground">{tokenALabel} deposited</Label>
            <Input value={depositA} onChange={e => setDepositA(e.target.value)} type="number" className="mt-1 font-mono text-sm" />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">{tokenBLabel} deposited (paired side)</Label>
            <Input value={depositB} onChange={e => setDepositB(e.target.value)} type="number" className="mt-1 font-mono text-sm" />
          </div>
        </div>
      </div>

      <div className={`p-4 rounded-xl border ${ilPct < -1 ? 'bg-red-500/10 border-red-500/30' : ilPct < 0 ? 'bg-amber-500/10 border-amber-500/30' : 'bg-emerald-500/10 border-emerald-500/30'}`}>
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <p className="text-xs text-muted-foreground">Impermanent Loss</p>
            <p className={`text-3xl font-bold ${ilPct < -1 ? 'text-red-400' : ilPct < 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
              {ilPct.toFixed(3)}%
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs text-muted-foreground">IL in dollar terms</p>
            <p className={`text-lg font-bold ${ilDollar < 0 ? 'text-red-400' : 'text-emerald-400'}`}>
              {ilDollar >= 0 ? '+' : ''}${ilDollar.toFixed(2)}
            </p>
          </div>
        </div>
      </div>

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

      {breakEvenDays && (
        <div className="p-4 bg-primary/10 border border-primary/20 rounded-xl text-center">
          <p className="text-xs text-muted-foreground uppercase font-bold tracking-tight">Break-even Analysis</p>
          <div className="mt-1">
            <span className="text-2xl font-bold text-primary">{breakEvenDays}</span>
            <span className="text-sm font-medium ml-1">days</span>
          </div>
          <p className="text-[10px] text-muted-foreground mt-1">estimated time for {poolApr}% APR to cover current impermanent loss</p>
        </div>
      )}

      <div className="flex gap-2 p-3 bg-muted/20 rounded-lg text-xs text-muted-foreground">
        <Info className="w-3.5 h-3.5 shrink-0 mt-0.5 text-primary" />
        <p>IL measures the difference between holding tokens vs providing liquidity.
          Fees earned in the pool can compensate for IL — factor in pool APY before deciding.</p>
      </div>
    </GlassCard>
  );
};