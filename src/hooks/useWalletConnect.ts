import { useState, useEffect, useCallback } from 'react';
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

  const loadWallet = useCallback(async () => {
    if (!user) {
      setWallet({ address: null, balance: '0', isConnected: false, isConnecting: false });
      return;
    }
    try {
      const res = await fetch('/api/wallets', { credentials: 'include' });
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        setWallet(prev => ({
          ...prev,
          address: data[0].address,
          isConnected: true,
        }));
      }
    } catch {
      // silent — no wallet yet
    }
  }, [user]);

  // Auto-load wallet on mount / user change
  useEffect(() => {
    loadWallet();
  }, [loadWallet]);

  // Listen for wallet-created events dispatched after create / import
  useEffect(() => {
    const onWalletCreated = (e: CustomEvent) => {
      const address = e.detail?.address;
      if (address) {
        setWallet({ address, balance: '0', isConnected: true, isConnecting: false });
      }
    };
    window.addEventListener('wallet-created', onWalletCreated as EventListener);
    return () => window.removeEventListener('wallet-created', onWalletCreated as EventListener);
  }, []);

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
      const res = await fetch('/api/wallets', { credentials: 'include' });
      const data = res.ok ? await res.json() : [];

      if (Array.isArray(data) && data.length > 0) {
        setWallet({
          address: data[0].address,
          balance: '0',
          isConnected: true,
          isConnecting: false,
        });
        toast({ title: 'Wallet Connected', description: `Address: ${data[0].address.slice(0, 8)}...` });
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
