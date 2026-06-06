import { useState, useEffect } from 'react';
import { Layout } from '@/components/layout/Layout';
import { GlassCard } from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useWalletConnect } from '@/hooks/useWalletConnect';
import { useToast } from '@/hooks/use-toast';
import { motion } from 'framer-motion';
import { Droplets, Wallet, Loader2, Clock, AlertTriangle } from 'lucide-react';

const FAUCET_AMOUNTS = {
  gyd: 100,
  gyds: 0.5,
};
const COOLDOWN_MS = 24 * 60 * 60 * 1000; // 24 hours

const FaucetPage = () => {
  const { user } = useAuth();
  const { address, isConnected } = useWalletConnect();
  const { toast } = useToast();
  const [isClaiming, setIsClaiming] = useState<'gyd' | 'gyds' | null>(null);
  const [lastClaim, setLastClaim] = useState<Record<string, number>>({});
  const [manualAddress, setManualAddress] = useState('');

  const targetAddress = isConnected && address ? address : manualAddress;

  // Load existing cooldowns from DB (server-enforced, survives refresh)
  useEffect(() => {
    if (!user) return;
    (async () => {
      const since = new Date(Date.now() - COOLDOWN_MS).toISOString();
      const { data } = await supabase
        .from('faucet_claims')
        .select('token_type, created_at')
        .eq('user_id', user.id)
        .gte('created_at', since);
      if (data) {
        const next: Record<string, number> = {};
        data.forEach((c) => {
          const t = new Date(c.created_at).getTime();
          if (!next[c.token_type] || t > next[c.token_type]) next[c.token_type] = t;
        });
        setLastClaim(next);
      }
    })();
  }, [user]);

  const canClaim = (type: string) => {
    const last = lastClaim[type] || 0;
    return Date.now() - last > COOLDOWN_MS;
  };

  const nextClaimIn = (type: string) => {
    const last = lastClaim[type] || 0;
    const remaining = COOLDOWN_MS - (Date.now() - last);
    if (remaining <= 0) return '';
    const h = Math.floor(remaining / 3_600_000);
    const m = Math.floor((remaining % 3_600_000) / 60_000);
    return `${h}h ${m}m`;
  };

  const claim = async (type: 'gyd' | 'gyds') => {
    if (!user) {
      toast({ title: 'Login Required', description: 'Please sign in first.', variant: 'destructive' });
      return;
    }
    if (!targetAddress) {
      toast({ title: 'Address Required', description: 'Connect wallet or enter an address.', variant: 'destructive' });
      return;
    }
    if (!canClaim(type)) {
      toast({ title: 'Cooldown Active', description: 'You can claim once every 24 hours.', variant: 'destructive' });
      return;
    }

    setIsClaiming(type);
    try {
      const { data, error } = await supabase.functions.invoke('faucet-claim', {
        body: { token_type: type, wallet_address: targetAddress },
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error || 'Claim failed');

      setLastClaim(prev => ({ ...prev, [type]: Date.now() }));
      toast({
        title: `🎉 Claimed ${data.amount} ${type.toUpperCase()}!`,
        description: `Test tokens sent to ${targetAddress.slice(0, 8)}...`,
      });
    } catch (err: any) {
      toast({ title: 'Claim Failed', description: err.message, variant: 'destructive' });
    } finally {
      setIsClaiming(null);
    }
  };

  return (
    <Layout>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="max-w-xl mx-auto space-y-6">
        <div className="text-center">
          <h1 className="text-3xl font-bold flex items-center justify-center gap-3">
            <Droplets className="w-8 h-8 text-primary" />
            Testnet Faucet
          </h1>
          <p className="text-muted-foreground mt-2">
            Claim free test GYD and GYDS tokens for development and testing
          </p>
          <Badge variant="outline" className="mt-2 text-amber-400 border-amber-400/30">Testnet Only</Badge>
        </div>

        {/* Wallet / Address */}
        <GlassCard className="p-4 space-y-3">
          <p className="text-sm font-medium">Recipient Address</p>
          {isConnected && address ? (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-secondary/50">
              <Wallet className="h-4 w-4 text-primary" />
              <code className="text-sm font-mono flex-1">{address}</code>
              <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30">Connected</Badge>
            </div>
          ) : (
            <Input
              placeholder="0x... or connect wallet"
              value={manualAddress}
              onChange={(e) => setManualAddress(e.target.value)}
              className="font-mono"
            />
          )}
        </GlassCard>

        {/* Claim Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <GlassCard className="p-6 space-y-4 text-center">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center mx-auto text-2xl font-bold">
              G
            </div>
            <div>
              <h3 className="text-xl font-bold">GYD</h3>
              <p className="text-sm text-muted-foreground">Stablecoin (1 USD)</p>
              <p className="text-2xl font-bold mt-2">{FAUCET_AMOUNTS.gyd} GYD</p>
            </div>
            <Button
              className="w-full"
              disabled={isClaiming !== null || !user || !targetAddress || !canClaim('gyd')}
              onClick={() => claim('gyd')}
            >
              {isClaiming === 'gyd' ? (
                <span className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Claiming...</span>
              ) : !canClaim('gyd') ? (
                <span className="flex items-center gap-2"><Clock className="h-4 w-4" /> Cooldown</span>
              ) : (
                'Claim GYD'
              )}
            </Button>
          </GlassCard>

          <GlassCard className="p-6 space-y-4 text-center">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary to-primary/50 flex items-center justify-center mx-auto text-2xl font-bold">
              Gs
            </div>
            <div>
              <h3 className="text-xl font-bold">GYDS</h3>
              <p className="text-sm text-muted-foreground">Gas & Staking</p>
              <p className="text-2xl font-bold mt-2">{FAUCET_AMOUNTS.gyds} GYDS</p>
            </div>
            <Button
              className="w-full"
              disabled={isClaiming !== null || !user || !targetAddress || !canClaim('gyds')}
              onClick={() => claim('gyds')}
            >
              {isClaiming === 'gyds' ? (
                <span className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Claiming...</span>
              ) : !canClaim('gyds') ? (
                <span className="flex items-center gap-2"><Clock className="h-4 w-4" /> Cooldown</span>
              ) : (
                'Claim GYDS'
              )}
            </Button>
          </GlassCard>
        </div>

        {/* Info */}
        <GlassCard className="p-4 border-amber-500/30 bg-amber-500/5">
          <div className="flex gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-400 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-muted-foreground space-y-1">
              <p><strong className="text-foreground">Testnet tokens have no real value.</strong></p>
              <p>• Claim limit: once every 24 hours per token type</p>
              <p>• {FAUCET_AMOUNTS.gyd} GYD + {FAUCET_AMOUNTS.gyds} GYDS per claim</p>
              <p>• Tokens are for testing DeFi, staking, and transactions</p>
            </div>
          </div>
        </GlassCard>
      </motion.div>
    </Layout>
  );
};

export default FaucetPage;
