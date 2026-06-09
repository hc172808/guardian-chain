import { useEffect, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { api } from '@/lib/api';

export const useTransactionNotifications = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const lastSeenRef = useRef<string | null>(null);

  useEffect(() => {
    if (!user) return;

    const poll = async () => {
      try {
        const txs = await api.get('/api/transactions');
        if (!Array.isArray(txs) || txs.length === 0) return;
        const latest = txs[0];
        if (!latest) return;
        if (lastSeenRef.current === null) {
          lastSeenRef.current = latest.id;
          return;
        }
        if (latest.id !== lastSeenRef.current) {
          lastSeenRef.current = latest.id;
          if (latest.status === 'confirmed') {
            toast({
              title: '✅ Transaction Confirmed',
              description: `${latest.amount} GYD — ${latest.tx_hash?.slice(0, 10)}...`,
            });
          } else if (latest.status === 'pending') {
            toast({
              title: '⏳ Transaction Pending',
              description: `${latest.amount} GYD submitted`,
            });
          }
        }
      } catch {
        // ignore
      }
    };

    poll();
    const interval = setInterval(poll, 15000);
    return () => clearInterval(interval);
  }, [user, toast]);
};
