import { useState, useEffect, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { GlassCard } from '@/components/ui/GlassCard';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supabase } from '@/integrations/supabase/client';
import { ArrowLeft, Copy, ExternalLink, Users, ArrowUpRight, ArrowDownLeft, TrendingUp, Coins, Shield, Lock, Unlock, Flame, Edit, Plus, Clock, User, Pause, CheckCircle, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Area, AreaChart } from 'recharts';
import { toast } from '@/hooks/use-toast';

interface TokenData {
  id: string;
  name: string;
  symbol: string;
  address: string;
  total_supply: number;
  burned_supply: number;
  decimals: number;
  logo_url: string | null;
  creator_id: string;
  gyds_liquidity: number;
  lp_lock_type: string;
  lp_unlock_time: string | null;
  freeze_enabled: boolean;
  freeze_locked: boolean;
  freeze_holder: string | null;
  mint_enabled: boolean;
  mint_locked: boolean;
  mint_holder: string | null;
  update_enabled: boolean;
  update_locked: boolean;
  update_holder: string | null;
  is_active: boolean;
  created_at: string;
}

// Mock price history for chart
const generatePriceHistory = (days: number) => {
  const data = [];
  let price = 0.00001 + Math.random() * 0.0001;
  const now = Date.now();
  for (let i = days; i >= 0; i--) {
    price *= 1 + (Math.random() - 0.48) * 0.15;
    price = Math.max(price, 0.000001);
    data.push({
      date: new Date(now - i * 86400000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      price: parseFloat(price.toFixed(8)),
    });
  }
  return data;
};

// Mock holders
const generateMockHolders = (symbol: string) => [
  { address: '0x' + 'a'.repeat(6) + '...' + 'f'.repeat(4), balance: 50000000, pct: 50 },
  { address: '0x' + 'b'.repeat(6) + '...' + 'e'.repeat(4), balance: 15000000, pct: 15 },
  { address: '0x' + 'c'.repeat(6) + '...' + 'd'.repeat(4), balance: 10000000, pct: 10 },
  { address: '0x' + 'd'.repeat(6) + '...' + 'c'.repeat(4), balance: 8000000, pct: 8 },
  { address: '0x' + 'e'.repeat(6) + '...' + 'b'.repeat(4), balance: 5000000, pct: 5 },
  { address: '0x' + 'f'.repeat(6) + '...' + 'a'.repeat(4), balance: 2000000, pct: 2 },
];

// Mock transactions
const generateMockTxs = () => Array.from({ length: 10 }, (_, i) => ({
  hash: '0x' + Math.random().toString(16).slice(2, 14) + '...',
  type: Math.random() > 0.5 ? 'buy' : 'sell',
  amount: Math.floor(Math.random() * 100000),
  value: (Math.random() * 10).toFixed(4),
  time: `${Math.floor(Math.random() * 60)}m ago`,
  from: '0x' + Math.random().toString(16).slice(2, 8) + '...',
  to: '0x' + Math.random().toString(16).slice(2, 8) + '...',
}));

const TokenDetail = () => {
  const { address } = useParams<{ address: string }>();
  const [token, setToken] = useState<TokenData | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('chart');

  const priceHistory = useMemo(() => generatePriceHistory(30), []);
  const holders = useMemo(() => token ? generateMockHolders(token.symbol) : [], [token]);
  const txs = useMemo(() => generateMockTxs(), []);

  useEffect(() => {
    const fetch = async () => {
      if (!address) return;
      const { data } = await supabase
        .from('tokens')
        .select('*')
        .eq('address', address)
        .maybeSingle();
      setToken(data as TokenData | null);
      setLoading(false);
    };
    fetch();
  }, [address]);

  const copyAddress = () => {
    navigator.clipboard.writeText(address || '');
    toast({ title: 'Address copied' });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!token) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4 p-4">
        <h1 className="text-2xl font-bold">Token Not Found</h1>
        <p className="text-muted-foreground">No token found at address {address}</p>
        <Link to="/explorer">
          <Button variant="outline" className="gap-2"><ArrowLeft className="h-4 w-4" /> Back to Explorer</Button>
        </Link>
      </div>
    );
  }

  const circulatingSupply = token.total_supply - token.burned_supply;
  const currentPrice = priceHistory[priceHistory.length - 1]?.price || 0;
  const prevPrice = priceHistory[priceHistory.length - 2]?.price || currentPrice;
  const priceChange = ((currentPrice - prevPrice) / prevPrice) * 100;

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="border-b border-border/50 bg-background/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link to="/explorer">
              <Button variant="ghost" size="icon"><ArrowLeft className="h-5 w-5" /></Button>
            </Link>
            <span className="text-sm text-muted-foreground">GYDS Explorer</span>
          </div>
          <Link to="/explorer">
            <Button variant="outline" size="sm" className="gap-1">
              <ExternalLink className="h-3 w-3" /> Explorer
            </Button>
          </Link>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        {/* Token Info Header */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <GlassCard className="p-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
              <div className="w-14 h-14 rounded-full bg-gradient-to-br from-primary to-primary/50 flex items-center justify-center overflow-hidden shrink-0">
                {token.logo_url ? (
                  <img src={token.logo_url} alt={token.symbol} className="w-full h-full object-cover" />
                ) : (
                  <span className="text-xl font-bold">{token.symbol[0]}</span>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-2xl font-bold">{token.name}</h1>
                  <Badge variant="secondary">{token.symbol}</Badge>
                  {token.is_active ? (
                    <Badge className="bg-primary/20 text-primary">Active</Badge>
                  ) : (
                    <Badge variant="destructive">Inactive</Badge>
                  )}
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <code className="text-xs text-muted-foreground truncate max-w-[200px] sm:max-w-none">{token.address}</code>
                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={copyAddress}>
                    <Copy className="h-3 w-3" />
                  </Button>
                </div>
              </div>
              <div className="text-right">
                <div className="text-2xl font-mono font-bold">${currentPrice.toFixed(8)}</div>
                <span className={cn("text-sm font-medium", priceChange >= 0 ? "text-primary" : "text-destructive")}>
                  {priceChange >= 0 ? '+' : ''}{priceChange.toFixed(2)}%
                </span>
              </div>
            </div>
          </GlassCard>
        </motion.div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'Market Cap', value: `$${(circulatingSupply * currentPrice).toLocaleString(undefined, { maximumFractionDigits: 2 })}`, icon: TrendingUp },
            { label: 'Liquidity', value: `${token.gyds_liquidity.toLocaleString()} GYDS`, icon: Coins },
            { label: 'Holders', value: holders.length.toString(), icon: Users },
            { label: 'LP Lock', value: token.lp_lock_type === 'burned' ? 'Burned 🔥' : 'Locked', icon: Lock },
          ].map((stat) => (
            <GlassCard key={stat.label} className="p-4">
              <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
                <stat.icon className="h-3.5 w-3.5" />
                {stat.label}
              </div>
              <div className="font-semibold text-sm">{stat.value}</div>
            </GlassCard>
          ))}
        </div>

        {/* Authorities */}
        <GlassCard className="p-4">
          <h3 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
            <Shield className="h-4 w-4" /> Token Authorities
          </h3>
          <div className="grid grid-cols-3 gap-3">
            {[
              { name: 'Freeze', enabled: token.freeze_enabled, locked: token.freeze_locked },
              { name: 'Mint', enabled: token.mint_enabled, locked: token.mint_locked },
              { name: 'Update', enabled: token.update_enabled, locked: token.update_locked },
            ].map((auth) => (
              <div key={auth.name} className="flex items-center gap-2 text-sm">
                {auth.locked ? <Lock className="h-3.5 w-3.5 text-muted-foreground" /> : <Unlock className="h-3.5 w-3.5 text-primary" />}
                <span>{auth.name}:</span>
                <Badge variant={auth.enabled ? 'default' : 'secondary'} className="text-xs">
                  {auth.enabled ? (auth.locked ? 'Locked' : 'Enabled') : 'Disabled'}
                </Badge>
              </div>
            ))}
          </div>
        </GlassCard>

        {/* Tabs */}
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="w-full">
            <TabsTrigger value="chart" className="flex-1">Price Chart</TabsTrigger>
            <TabsTrigger value="txs" className="flex-1">Transactions</TabsTrigger>
            <TabsTrigger value="holders" className="flex-1">Holders</TabsTrigger>
          </TabsList>

          <TabsContent value="chart">
            <GlassCard className="p-4">
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={priceHistory}>
                    <defs>
                      <linearGradient id="priceGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                    <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" tickFormatter={(v) => `$${v}`} />
                    <Tooltip
                      contentStyle={{ background: 'hsl(var(--background))', border: '1px solid hsl(var(--border))', borderRadius: 8 }}
                      labelStyle={{ color: 'hsl(var(--foreground))' }}
                      formatter={(value: number) => [`$${value.toFixed(8)}`, 'Price']}
                    />
                    <Area type="monotone" dataKey="price" stroke="hsl(var(--primary))" fill="url(#priceGrad)" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </GlassCard>
          </TabsContent>

          <TabsContent value="txs">
            <GlassCard className="p-0 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/50 text-muted-foreground">
                      <th className="text-left p-3 font-medium">Type</th>
                      <th className="text-left p-3 font-medium">Hash</th>
                      <th className="text-right p-3 font-medium">Amount</th>
                      <th className="text-right p-3 font-medium">Value (GYDS)</th>
                      <th className="text-right p-3 font-medium">Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {txs.map((tx, i) => (
                      <tr key={i} className="border-b border-border/20 hover:bg-muted/30 transition-colors">
                        <td className="p-3">
                          <Badge className={cn(
                            "text-xs",
                            tx.type === 'buy' ? 'bg-primary/20 text-primary' : 'bg-destructive/20 text-destructive'
                          )}>
                            {tx.type === 'buy' ? <ArrowDownLeft className="h-3 w-3 mr-1" /> : <ArrowUpRight className="h-3 w-3 mr-1" />}
                            {tx.type.toUpperCase()}
                          </Badge>
                        </td>
                        <td className="p-3 font-mono text-xs">{tx.hash}</td>
                        <td className="p-3 text-right font-mono">{tx.amount.toLocaleString()}</td>
                        <td className="p-3 text-right font-mono">{tx.value}</td>
                        <td className="p-3 text-right text-muted-foreground">{tx.time}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </GlassCard>
          </TabsContent>

          <TabsContent value="holders">
            <GlassCard className="p-0 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/50 text-muted-foreground">
                    <th className="text-left p-3 font-medium">#</th>
                    <th className="text-left p-3 font-medium">Address</th>
                    <th className="text-right p-3 font-medium">Balance</th>
                    <th className="text-right p-3 font-medium">%</th>
                  </tr>
                </thead>
                <tbody>
                  {holders.map((h, i) => (
                    <tr key={i} className="border-b border-border/20 hover:bg-muted/30 transition-colors">
                      <td className="p-3 text-muted-foreground">{i + 1}</td>
                      <td className="p-3 font-mono text-xs">{h.address}</td>
                      <td className="p-3 text-right font-mono">{h.balance.toLocaleString()}</td>
                      <td className="p-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <div className="w-16 h-1.5 bg-secondary rounded-full overflow-hidden">
                            <div className="h-full bg-primary rounded-full" style={{ width: `${h.pct}%` }} />
                          </div>
                          <span className="text-muted-foreground w-10 text-right">{h.pct}%</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </GlassCard>
          </TabsContent>
        </Tabs>

        {/* Supply Info */}
        <GlassCard className="p-4">
          <h3 className="text-sm font-medium text-muted-foreground mb-3">Supply Distribution</h3>
          <div className="space-y-3">
            <div className="flex justify-between text-sm">
              <span>Total Supply</span>
              <span className="font-mono">{token.total_supply.toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span>Burned</span>
              <span className="font-mono text-destructive">{token.burned_supply.toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span>Circulating</span>
              <span className="font-mono text-primary">{circulatingSupply.toLocaleString()}</span>
            </div>
            <div className="h-2 bg-secondary rounded-full overflow-hidden flex">
              <div className="h-full bg-primary" style={{ width: `${(circulatingSupply / token.total_supply) * 100}%` }} />
              <div className="h-full bg-destructive" style={{ width: `${(token.burned_supply / token.total_supply) * 100}%` }} />
            </div>
          </div>
        </GlassCard>
      </main>
    </div>
  );
};

export default TokenDetail;
