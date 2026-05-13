import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';

interface WalletState {
  address: string | null;
  balance: string;
  isConnected: boolean;
  isConnecting: boolean;
}

export const useWalletConnect = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [wallet, setWallet] = useState<WalletState>({
    address: null,
    balance: '0',
    isConnected: false,
    isConnecting: false,
  });

  // Load wallet from database on mount
  useEffect(() => {
    if (!user) {
      setWallet({ address: null, balance: '0', isConnected: false, isConnecting: false });
      return;
    }

    const loadWallet = async () => {
      const { data } = await supabase
        .from('wallets')
        .select('address')
        .eq('user_id', user.id)
        .limit(1);

      if (data && data.length > 0) {
        setWallet(prev => ({
          ...prev,
          address: data[0].address,
          isConnected: true,
        }));
      }
    };

    loadWallet();
  }, [user]);

  const connect = useCallback(async () => {
    if (!user) {
      toast({
        title: 'Login Required',
        description: 'Please sign in to connect your wallet.',
        variant: 'destructive',
      });
      return;
    }

    setWallet(prev => ({ ...prev, isConnecting: true }));

    try {
      // Check if user already has a wallet
      const { data: existing } = await supabase
        .from('wallets')
        .select('address')
        .eq('user_id', user.id)
        .limit(1);

      if (existing && existing.length > 0) {
        setWallet({
          address: existing[0].address,
          balance: '0',
          isConnected: true,
          isConnecting: false,
        });
        toast({ title: 'Wallet Connected', description: `Address: ${existing[0].address.slice(0, 8)}...` });
        return;
      }

      toast({
        title: 'No Wallet Found',
        description: 'Create a wallet on the Wallet page first.',
        variant: 'destructive',
      });
    } catch {
      toast({
        title: 'Connection Failed',
        description: 'Could not connect wallet. Try again.',
        variant: 'destructive',
      });
    } finally {
      setWallet(prev => ({ ...prev, isConnecting: false }));
    }
  }, [user, toast]);

  const disconnect = useCallback(() => {
    setWallet({ address: null, balance: '0', isConnected: false, isConnecting: false });
  }, []);

  return { ...wallet, connect, disconnect };
};
