import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Wallet, LogOut, Copy } from 'lucide-react';
import { useWalletConnect } from '@/hooks/useWalletConnect';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';

export const WalletConnectBar = () => {
  const { address, isConnected, isConnecting, connect, disconnect } = useWalletConnect();
  const { user } = useAuth();
  const { toast } = useToast();
  const [gydBalance, setGydBalance] = useState(0);
  const [gydsBalance, setGydsBalance] = useState(0);

  useEffect(() => {
    if (!user || !isConnected) return;

    const loadBalances = async () => {
      // Get user wallets
      const { data: userWallets } = await supabase
        .from('wallets')
        .select('address')
        .eq('user_id', user.id);

      const myAddresses = new Set((userWallets || []).map(w => w.address.toLowerCase()));

      // Check founder wallet
      const { data: founderConfig } = await supabase
        .from('admin_config')
        .select('config_value')
        .eq('config_key', 'founder_wallet')
        .maybeSingle();

      if (founderConfig?.config_value) {
        const fc = founderConfig.config_value as Record<string, string>;
        if (fc.address) myAddresses.add(fc.address.toLowerCase());
      }

      if (user.email === 'netlifegy@gmail.com') {
        myAddresses.add('0x0000000000000000000000000000000000000001');
      }

      const isCreator = (createdBy: string | null) => createdBy === user.id;

      // Get confirmed transactions
      const { data: txData } = await supabase
        .from('transactions')
        .select('*')
        .eq('user_id', user.id)
        .eq('status', 'confirmed');

      // Get token operations
      const { data: opsData } = await supabase
        .from('token_operations')
        .select('*')
        .eq('status', 'confirmed');

      let gyds = 0;
      let gyd = 0;

      if (opsData) {
        opsData.forEach(op => {
          const addressMatch = myAddresses.has(op.wallet_address.toLowerCase());
          const creatorMatch = isCreator(op.created_by);
          if (!addressMatch && !creatorMatch) return;
          if (op.operation_type === 'mint_gyds' || op.operation_type === 'premine_gyds' || op.operation_type === 'mint' || op.operation_type === 'bridge_mint_gyds') {
            gyds += op.amount;
          } else if (op.operation_type === 'mint_gyd' || op.operation_type === 'premine_gyd') {
            gyd += op.amount;
          } else if (op.operation_type === 'burn_gyds' || op.operation_type === 'burn' || op.operation_type === 'bridge_burn_gyds') {
            gyds -= op.amount;
          } else if (op.operation_type === 'burn_gyd') {
            gyd -= op.amount;
          }
        });
      }

      if (txData) {
        txData.forEach(tx => {
          const fromMe = myAddresses.has(tx.from_address.toLowerCase());
          const toMe = myAddresses.has(tx.to_address.toLowerCase());
          if (fromMe) gyd -= tx.amount + tx.fee;
          if (toMe) gyd += tx.amount;
        });
      }

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
  }, [user, isConnected]);

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
