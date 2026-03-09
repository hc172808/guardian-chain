import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowRight, CheckCircle2, Clock, ExternalLink } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface BridgeTransaction {
  id: string;
  amount: number;
  usdt_amount: number | null;
  wallet_address: string;
  tx_hash: string | null;
  status: string;
  created_at: string;
}

export const BridgeHistory = () => {
  const { user } = useAuth();
  const [transactions, setTransactions] = useState<BridgeTransaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!user) return;

    const loadHistory = async () => {
      setIsLoading(true);
      const { data, error } = await supabase
        .from('token_operations')
        .select('*')
        .eq('operation_type', 'bridge_mint_gyds')
        .eq('created_by', user.id)
        .order('created_at', { ascending: false })
        .limit(10);

      if (!error && data) {
        setTransactions(data);
      }
      setIsLoading(false);
    };

    loadHistory();

    // Subscribe to real-time updates
    const channel = supabase
      .channel('bridge-history')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'token_operations',
          filter: `operation_type=eq.bridge_mint_gyds`,
        },
        () => loadHistory()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  if (!user) {
    return (
      <div className="text-center text-muted-foreground py-6 text-sm">
        Connect wallet to view history
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map(i => (
          <Skeleton key={i} className="h-16 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  if (transactions.length === 0) {
    return (
      <div className="text-center text-muted-foreground py-6 text-sm">
        No bridge transactions yet
      </div>
    );
  }

  return (
    <div className="space-y-3 max-h-64 overflow-y-auto">
      {transactions.map(tx => (
        <div
          key={tx.id}
          className="flex items-center justify-between p-3 rounded-lg bg-card/50 border border-border/30"
        >
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
              <ArrowRight className="h-4 w-4 text-primary" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">
                  Bridge → GYDS
                </span>
                {tx.status === 'confirmed' ? (
                  <CheckCircle2 className="h-3 w-3 text-green-500" />
                ) : (
                  <Clock className="h-3 w-3 text-yellow-500" />
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                {formatDistanceToNow(new Date(tx.created_at), { addSuffix: true })}
              </p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-sm font-mono font-semibold text-primary">
              +{tx.amount.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </p>
            {tx.usdt_amount && (
              <p className="text-xs text-muted-foreground font-mono">
                ${tx.usdt_amount.toFixed(2)}
              </p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
};
