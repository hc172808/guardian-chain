import { useCallback, useEffect, useMemo, useState } from 'react';
import { GlassCard } from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { api } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import { Download, RefreshCw, Send, Wallet as WalletIcon } from 'lucide-react';

interface TreasuryWallet {
  key: string;
  name: string;
  address: string;
  allocation: number;
  description: string;
  balance: number;
}

interface Transfer {
  id: string;
  fromAddress: string;
  toAddress: string;
  amount: string | number;
  fee: string | number;
  txHash: string | null;
  status: string;
  tokenSymbol: string | null;
  createdAt: string;
}

const fmt = (n: number) =>
  new Intl.NumberFormat('en-US', { maximumFractionDigits: 6 }).format(n);

const short = (a: string) => (a ? `${a.slice(0, 8)}…${a.slice(-6)}` : '—');

function downloadCsv(name: string, rows: Array<Record<string, unknown>>) {
  if (!rows.length) return;
  const headers = Array.from(new Set(rows.flatMap((r) => Object.keys(r))));
  const esc = (v: unknown) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [headers.join(','), ...rows.map((r) => headers.map((h) => esc(r[h])).join(','))].join('\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `${name}-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function TreasuryWallets() {
  const { toast } = useToast();
  const [wallets, setWallets] = useState<TreasuryWallet[]>([]);
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [totalSupply, setTotalSupply] = useState(0);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [amount, setAmount] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [w, t] = await Promise.all([
        api.get('/api/admin/treasury/wallets'),
        api.get('/api/admin/treasury/transfers'),
      ]);
      setWallets(w?.wallets ?? []);
      setTotalSupply(Number(w?.totalSupply ?? 0));
      setTransfers(t?.transfers ?? []);
      if (!from && w?.wallets?.length) setFrom(w.wallets[0].address);
    } catch (e: unknown) {
      toast({
        title: 'Could not load treasury',
        description: e instanceof Error ? e.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [toast, from]);

  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const totalHeld = useMemo(
    () => wallets.reduce((s, w) => s + Number(w.balance || 0), 0),
    [wallets],
  );
  const sender = wallets.find((w) => w.address === from);

  const submit = async () => {
    const amt = Number(amount);
    if (!from || !to || !(amt > 0)) {
      toast({ title: 'Fill in every field', description: 'Pick a source wallet, a destination address and an amount above zero.', variant: 'destructive' });
      return;
    }
    if (sender && amt > sender.balance) {
      toast({ title: 'Not enough funds', description: `${sender.name} holds ${fmt(sender.balance)} GYDS.`, variant: 'destructive' });
      return;
    }
    setSending(true);
    try {
      const res = await api.post('/api/admin/treasury/transfer', { from, to: to.trim(), amount: amt });
      toast({ title: 'Transfer sent', description: `${fmt(amt)} GYDS · ${short(res?.txHash ?? '')}` });
      setAmount('');
      setTo('');
      await load();
    } catch (e: unknown) {
      toast({
        title: 'Transfer failed',
        description: e instanceof Error ? e.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <WalletIcon className="h-5 w-5 text-primary" /> Treasury Wallets
          </h2>
          <p className="text-sm text-muted-foreground">
            {fmt(totalHeld)} GYDS held across {wallets.length} wallets of {fmt(totalSupply)} genesis supply
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {wallets.map((w) => (
          <GlassCard key={w.key} className="p-4 space-y-2">
            <div className="flex items-start justify-between gap-2">
              <div className="font-medium">{w.name}</div>
              <Badge variant="secondary">{fmt(w.allocation)} alloc</Badge>
            </div>
            <div className="text-2xl font-bold text-primary">{fmt(w.balance)} <span className="text-sm text-muted-foreground">GYDS</span></div>
            <div className="text-xs font-mono text-muted-foreground break-all">{w.address}</div>
            <p className="text-xs text-muted-foreground">{w.description}</p>
          </GlassCard>
        ))}
        {!wallets.length && !loading && (
          <GlassCard className="p-6 text-sm text-muted-foreground">No treasury wallets found.</GlassCard>
        )}
      </div>

      <GlassCard className="p-5 space-y-4">
        <h3 className="font-semibold flex items-center gap-2"><Send className="h-4 w-4 text-primary" /> Send GYDS</h3>
        <div className="grid gap-4 md:grid-cols-3">
          <div className="space-y-2">
            <Label>From</Label>
            <Select value={from} onValueChange={setFrom}>
              <SelectTrigger><SelectValue placeholder="Source wallet" /></SelectTrigger>
              <SelectContent>
                {wallets.map((w) => (
                  <SelectItem key={w.address} value={w.address}>
                    {w.name} — {fmt(w.balance)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>To address</Label>
            <Input value={to} onChange={(e) => setTo(e.target.value)} placeholder="0x…" className="font-mono" />
          </div>
          <div className="space-y-2">
            <Label>Amount (GYDS)</Label>
            <Input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.0" inputMode="decimal" />
          </div>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <Button onClick={() => void submit()} disabled={sending}>
            {sending ? 'Sending…' : 'Send transfer'}
          </Button>
          {wallets.filter((w) => w.address !== from).slice(0, 3).map((w) => (
            <Button key={w.address} variant="ghost" size="sm" onClick={() => setTo(w.address)}>
              → {w.name}
            </Button>
          ))}
        </div>
      </GlassCard>

      <GlassCard className="p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">Transaction history</h3>
          <Button variant="outline" size="sm" onClick={() => downloadCsv('treasury-transfers', transfers as unknown as Array<Record<string, unknown>>)} disabled={!transfers.length}>
            <Download className="h-4 w-4 mr-2" /> Export CSV
          </Button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-muted-foreground border-b border-border/50">
                <th className="py-2 pr-3">Date</th>
                <th className="py-2 pr-3">From</th>
                <th className="py-2 pr-3">To</th>
                <th className="py-2 pr-3 text-right">Amount</th>
                <th className="py-2 pr-3">Status</th>
                <th className="py-2">Tx</th>
              </tr>
            </thead>
            <tbody>
              {transfers.map((t) => (
                <tr key={t.id} className="border-b border-border/30">
                  <td className="py-2 pr-3 whitespace-nowrap">{new Date(t.createdAt).toLocaleString()}</td>
                  <td className="py-2 pr-3 font-mono text-xs">{short(t.fromAddress)}</td>
                  <td className="py-2 pr-3 font-mono text-xs">{short(t.toAddress)}</td>
                  <td className="py-2 pr-3 text-right">{fmt(Number(t.amount))} {t.tokenSymbol ?? 'GYDS'}</td>
                  <td className="py-2 pr-3">
                    <Badge variant={t.status === 'confirmed' ? 'secondary' : 'outline'}>{t.status}</Badge>
                  </td>
                  <td className="py-2 font-mono text-xs">{short(t.txHash ?? '')}</td>
                </tr>
              ))}
              {!transfers.length && (
                <tr><td colSpan={6} className="py-6 text-center text-muted-foreground">No treasury transfers yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </GlassCard>
    </div>
  );
}

export default TreasuryWallets;
