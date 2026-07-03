import { useState, useEffect, useCallback } from 'react';
import { api } from '@/lib/api';
import { GlassCard } from '@/components/ui/GlassCard';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Wallet, TrendingUp, Copy, ArrowUpRight, ArrowDownLeft, RefreshCw } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { getUserAddresses, computeUserBalances } from '@/lib/balances';
import { useCurrency } from '@/contexts/CurrencyContext';

const NETWORKS = ['Testnet', 'Mainnet', 'Devnet'] as const;
type Network = typeof NETWORKS[number];

const NETWORK_COLORS: Record<Network, string> = {
  Testnet: 'text-amber-400 border-amber-400/30 bg-amber-400/10',
  Mainnet: 'text-emerald-400 border-emerald-400/30 bg-emerald-400/10',
  Devnet:  'text-blue-400 border-blue-400/30 bg-blue-400/10',
};

const fmtQty = (n: number) =>
  new Intl.NumberFormat('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 4 }).format(n);

export const UserBalanceCard = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const { fmt, symbol, ratesUnavailable } = useCurrency();

  const [gydsBalance, setGydsBalance]   = useState(0);
  const [gydBalance,  setGydBalance]    = useState(0);
  const [gusdBalance, setGusdBalance]   = useState(0);
  const [address,     setAddress]       = useState('');
  const [loading,     setLoading]       = useState(true);
  const [network, setNetwork]           = useState<Network>(
    () => (localStorage.getItem('gyds_network') as Network) || 'Testnet'
  );
  const [gydsPrice, setGydsPrice]       = useState(0.05);

  const loadBalances = useCallback(async () => {
    if (!user) { setLoading(false); return; }
    try {
      const [wallets, priceData, serverBalance] = await Promise.all([
        api.get('/api/wallets').catch(() => []),
        api.get('/api/token-price').catch(() => null),
        api.get('/api/user/balance').catch(() => null),
      ]);
      if (wallets?.length) setAddress(wallets[0].address);
      if (priceData?.price) setGydsPrice(Number(priceData.price));

      if (serverBalance && (serverBalance.gyds !== undefined || serverBalance.gyd !== undefined)) {
        setGydsBalance(Number(serverBalance.gyds ?? 0));
        setGydBalance(Number(serverBalance.gyd ?? 0));
        setGusdBalance(Number(serverBalance.gusd ?? 0));
      } else {
        const myAddresses = await getUserAddresses(user.id);
        const balances = await computeUserBalances(user.id, myAddresses);
        setGydsBalance(balances.gydsBalance);
        setGydBalance(balances.gydBalance);
        setGusdBalance(balances.gusdBalance);
      }
    } catch {}
    setLoading(false);
  }, [user]);

  useEffect(() => {
    loadBalances();
    const iv = setInterval(loadBalances, 5000);
    return () => clearInterval(iv);
  }, [loadBalances]);

  const switchNetwork = (n: Network) => {
    setNetwork(n);
    localStorage.setItem('gyds_network', n);
  };

  const copyAddress = () => {
    if (!address) return;
    navigator.clipboard.writeText(address);
    toast({ title: 'Copied!', description: 'Wallet address copied to clipboard.' });
  };

  if (loading) {
    return (
      <GlassCard className="p-6 animate-pulse">
        <div className="h-32 bg-secondary/30 rounded-lg" />
      </GlassCard>
    );
  }

  if (!address && !loading) {
    return (
      <GlassCard className="p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 rounded-lg bg-primary/20">
            <Wallet className="h-5 w-5 text-primary" />
          </div>
          <h3 className="font-semibold">Your Wallet</h3>
        </div>
        <p className="text-sm text-muted-foreground mb-4">No wallet found. Create one to get started.</p>
        <Button size="sm" onClick={() => navigate('/wallet')}>Create Wallet</Button>
      </GlassCard>
    );
  }

  const usdGyds  = gydsBalance * gydsPrice;
  const usdGyd   = gydBalance  * 1.00;
  const usdGusd  = gusdBalance * 1.00;
  const totalUsd = usdGyds + usdGyd + usdGusd;

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
      <GlassCard className="p-6 border border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
        {/* Header */}
        <div className="flex items-start justify-between mb-5 gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/20">
              <Wallet className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h3 className="font-semibold">Your Balance</h3>
              {address && (
                <p className="text-xs text-muted-foreground font-mono">
                  {address.slice(0, 10)}…{address.slice(-6)}
                  <button onClick={copyAddress} className="ml-1 text-primary hover:text-primary/80 transition-colors">
                    <Copy className="h-3 w-3 inline" />
                  </button>
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {NETWORKS.map(n => (
              <button
                key={n}
                onClick={() => switchNetwork(n)}
                className={`text-xs px-2 py-1 rounded-full border font-medium transition-all ${
                  network === n ? NETWORK_COLORS[n] : 'text-muted-foreground border-muted-foreground/20 hover:border-muted-foreground/40'
                }`}
              >
                {n}
              </button>
            ))}
            <Badge variant="outline" className="text-xs text-emerald-400 border-emerald-400/30">Live</Badge>
            <button onClick={loadBalances} className="text-muted-foreground hover:text-primary transition-colors">
              <RefreshCw className="h-4 w-4" />
            </button>
          </div>
        </div>

        {ratesUnavailable && (
          <div className="mb-3 text-xs text-amber-400/80 bg-amber-400/5 border border-amber-400/20 rounded px-2 py-1">
            Using estimated rates — live exchange data unavailable
          </div>
        )}

        {/* Balance Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 mb-5">
          <div>
            <p className="text-xs text-muted-foreground mb-1">GYDS</p>
            <p className="text-xl font-bold text-primary">{fmtQty(gydsBalance)}</p>
            <p className="text-xs text-muted-foreground">{fmt(usdGyds)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-1">GYD</p>
            <p className="text-xl font-bold text-emerald-400">{fmtQty(gydBalance)}</p>
            <p className="text-xs text-muted-foreground">{fmt(usdGyd)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-1">GUSD</p>
            <p className="text-xl font-bold text-[#0A4FFF]">{fmtQty(gusdBalance)}</p>
            <p className="text-xs text-muted-foreground">{fmt(usdGusd)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-1">Total ({symbol})</p>
            <p className="text-xl font-semibold flex items-center gap-1">
              <TrendingUp className="h-4 w-4 text-emerald-400" />
              {fmt(totalUsd)}
            </p>
            <p className="text-xs text-muted-foreground">@ {fmt(gydsPrice)}/GYDS</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-1">Network</p>
            <p className={`text-sm font-semibold ${NETWORK_COLORS[network].split(' ')[0]}`}>{network}</p>
            <p className="text-xs text-muted-foreground">Chain 13370</p>
          </div>
        </div>

        <div className="flex gap-2">
          <Button size="sm" variant="outline" className="flex-1 gap-1.5" onClick={() => navigate('/wallet')}>
            <ArrowUpRight className="h-3.5 w-3.5" />
            Send
          </Button>
          <Button size="sm" variant="outline" className="flex-1 gap-1.5" onClick={() => navigate('/wallet')}>
            <ArrowDownLeft className="h-3.5 w-3.5" />
            Receive
          </Button>
          <Button size="sm" className="flex-1 gap-1.5 bg-primary/20 hover:bg-primary/30 border border-primary/30" onClick={() => navigate('/wallet')}>
            <Wallet className="h-3.5 w-3.5" />
            Wallet
          </Button>
        </div>
      </GlassCard>
    </motion.div>
  );
};
