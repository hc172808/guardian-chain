import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Wallet, LogOut, Copy } from 'lucide-react';
import { useWalletConnect } from '@/hooks/useWalletConnect';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { getUserAddresses, computeUserBalances } from '@/lib/balances';

export const WalletConnectBar = () => {
  const { address, isConnected, isConnecting, connect, disconnect } = useWalletConnect();
  const { user } = useAuth();
  const { toast } = useToast();
  const [gydBalance, setGydBalance] = useState(0);
  const [gydsBalance, setGydsBalance] = useState(0);

  useEffect(() => {
    if (!user) return;

    const loadBalances = async () => {
      const myAddresses = await getUserAddresses(user.id, address ?? undefined, user.email ?? undefined);
      const { gydsBalance: gyds, gydBalance: gyd } = await computeUserBalances(user.id, myAddresses);
      setGydBalance(gyd);
      setGydsBalance(gyds);
    };

    loadBalances();

    const channel = supabase
      .channel('wallet-bar-balances')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'transactions' }, () => loadBalances())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'token_operations' }, () => loadBalances())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user, isConnected, address]);

  const copyAddress = () => {
    if (address) {
      navigator.clipboard.writeText(address);
      toast({ title: 'Copied!', description: 'Wallet address copied' });
    }
  };

  if (isConnected && address) {
    return (
      <div className="flex items-center justify-between p-3 rounded-xl bg-card/80 border border-border/50 mb-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
            <Wallet className="h-4 w-4 text-primary" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Connected</p>
            <button onClick={copyAddress} className="flex items-center gap-1 text-sm font-mono hover:text-primary transition-colors">
              {address.slice(0, 6)}...{address.slice(-4)}
              <Copy className="h-3 w-3" />
            </button>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <p className="text-xs font-mono font-semibold">{gydBalance.toFixed(2)} <span className="text-muted-foreground">GYD</span></p>
            <p className="text-[10px] font-mono text-muted-foreground">{gydsBalance.toFixed(2)} GYDS</p>
          </div>
          <Badge variant="outline" className="text-xs hidden sm:inline-flex">GYDS Network</Badge>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={disconnect}>
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </div>
    );
  }

  return (
    <Button
      onClick={connect}
      disabled={isConnecting}
      className="w-full mb-4 gap-2"
      variant="outline"
    >
      <Wallet className="h-4 w-4" />
      {isConnecting ? 'Connecting...' : 'Connect Wallet'}
    </Button>
  );
};
