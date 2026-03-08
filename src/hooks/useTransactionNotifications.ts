import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';

export const useTransactionNotifications = () => {
  const { user } = useAuth();
  const { toast } = useToast();

  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel('tx-notifications')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'transactions' },
        (payload) => {
          const tx = payload.new as any;
          if (tx.user_id !== user.id) return;
          if (tx.status === 'confirmed' && payload.old?.status !== 'confirmed') {
            toast({
              title: '✅ Transaction Confirmed',
              description: `${tx.amount} GYD — ${tx.tx_hash?.slice(0, 10)}...`,
            });
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'transactions' },
        (payload) => {
          const tx = payload.new as any;
          if (tx.user_id !== user.id) return;
          if (tx.status === 'confirmed') {
            toast({
              title: '✅ Transaction Confirmed',
              description: `${tx.amount} GYD — ${tx.tx_hash?.slice(0, 10)}...`,
            });
          } else if (tx.status === 'pending') {
            toast({
              title: '⏳ Transaction Pending',
              description: `${tx.amount} GYD submitted`,
            });
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user, toast]);
};
