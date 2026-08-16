import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowRight, CheckCircle2, Clock } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface BridgeTransaction {
  id: string;
  from_chain: string;
  to_chain: string;
  from_token: string;
  to_token: string;
  amount: number | string;
  received: number | string | null;
  fee: number | string;
  tx_hash: string | null;
  dest_tx_hash: string | null;
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
      try {
        const data = await api.get('/api/bridge/history');
        setTransactions(Array.isArray(data) ? data as BridgeTransaction[] : []);
      } catch {
        setTransactions([]);
      } finally {
        setIsLoading(false);
      }
    };

    loadHistory();
    const interval = window.setInterval(loadHistory, 15_000);
    return () => window.clearInterval(interval);
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
                  {tx.from_chain} → {tx.to_chain}
                </span>
                {['confirmed', 'completed'].includes(tx.status) ? (
                  <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                ) : (
                  <Clock className="h-3 w-3 text-amber-500" />
                )}
              </div>
              <p className="text-xs text-muted-foreground">{tx.status} · {formatDistanceToNow(new Date(tx.created_at), { addSuffix: true })}</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-sm font-mono font-semibold text-primary">
              {Number(tx.amount).toLocaleString(undefined, { maximumFractionDigits: 6 })} {tx.from_token}
            </p>
            {tx.received !== null && (
              <p className="text-xs text-muted-foreground font-mono">
                {Number(tx.received).toLocaleString(undefined, { maximumFractionDigits: 6 })} {tx.to_token}
              </p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
};
