import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { GlassCard } from '@/components/ui/GlassCard';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Wallet, TrendingUp, Lock, Copy, ArrowUpRight, ArrowDownLeft, RefreshCw } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';

const fmt = (n: number) =>
  new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

export const UserBalanceCard = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const { data: wallets = [], isLoading, refetch } = useQuery({
    queryKey: ['wallets', user?.id],
    queryFn: () => api.get('/api/wallets'),
    refetchInterval: 30000,
  });

  const primary = wallets[0];
  const gydsBalance  = parseFloat(primary?.gyds_balance  ?? primary?.gydsBalance  ?? '0');
  const lockedBalance = parseFloat(primary?.locked_balance ?? primary?.lockedBalance ?? '0');
  const available    = gydsBalance - lockedBalance;
  const usdValue     = gydsBalance * 0.05;

  const copyAddress = () => {
    if (!primary?.address) return;
    navigator.clipboard.writeText(primary.address);
    toast({ title: 'Copied!', description: 'Wallet address copied to clipboard.' });
  };

  if (isLoading) {
    return (
      <GlassCard className="p-6 animate-pulse">
        <div className="h-24 bg-secondary/30 rounded-lg" />
      </GlassCard>
    );
  }

  if (!primary) {
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

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
      <GlassCard className="p-6 border border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/20">
              <Wallet className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h3 className="font-semibold">Your GYDS Balance</h3>
              <p className="text-xs text-muted-foreground font-mono">
                {primary.address.slice(0, 10)}…{primary.address.slice(-6)}
                <button onClick={copyAddress} className="ml-1 text-primary hover:text-primary/80 transition-colors">
                  <Copy className="h-3 w-3 inline" />
                </button>
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs text-emerald-400 border-emerald-400/30">Live</Badge>
            <button onClick={() => refetch()} className="text-muted-foreground hover:text-primary transition-colors">
              <RefreshCw className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-5">
          <div>
            <p className="text-xs text-muted-foreground mb-1">Total Balance</p>
            <p className="text-2xl font-bold text-primary">{fmt(gydsBalance)}</p>
            <p className="text-xs text-muted-foreground">GYDS</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-1">Available</p>
            <p className="text-xl font-semibold text-emerald-400">{fmt(available)}</p>
            <p className="text-xs text-muted-foreground">GYDS</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-1">USD Value</p>
            <p className="text-xl font-semibold flex items-center gap-1">
              <TrendingUp className="h-4 w-4 text-emerald-400" />
              ${fmt(usdValue)}
            </p>
            <p className="text-xs text-muted-foreground">@ $0.05 / GYDS</p>
          </div>
        </div>

        {lockedBalance > 0 && (
          <div className="flex items-center gap-2 text-xs text-amber-400 bg-amber-400/10 rounded-lg px-3 py-2 mb-4">
            <Lock className="h-3.5 w-3.5 flex-shrink-0" />
            <span>{fmt(lockedBalance)} GYDS locked (staking / pending)</span>
          </div>
        )}

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
