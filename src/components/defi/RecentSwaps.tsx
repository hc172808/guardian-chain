import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Badge } from '@/components/ui/badge';
import { ArrowRight, Clock } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface SwapTx {
  id: string;
  amount: number;
  fee: number;
  from_address: string;
  to_address: string;
  status: string;
  created_at: string;
  tx_hash: string | null;
}

export const RecentSwaps = () => {
  const { user } = useAuth();
  const [swaps, setSwaps] = useState<SwapTx[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) { setSwaps([]); setLoading(false); return; }

    const load = async () => {
      setLoading(true);
      const { data } = await supabase
        .from('transactions')
        .select('id, amount, fee, from_address, to_address, status, created_at, tx_hash')
        .eq('user_id', user.id)
        .eq('to_address', 'swap-pool')
        .order('created_at', { ascending: false })
        .limit(5);
      if (data) setSwaps(data);
      setLoading(false);
    };

    load();

    const channel = supabase
      .channel('user-swaps')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'transactions', filter: `user_id=eq.${user.id}` }, () => load())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user]);

  if (!user || (swaps.length === 0 && !loading)) return null;

  return (
    <div className="space-y-3 pt-2">
      <div className="flex items-center gap-2">
        <Clock className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-semibold text-muted-foreground">Recent Swaps</span>
      </div>

      {loading ? (
        <div className="text-sm text-muted-foreground text-center py-3">Loading...</div>
      ) : (
        <div className="space-y-2">
          {swaps.map((tx) => (
            <div
              key={tx.id}
              className="flex items-center justify-between p-3 rounded-xl bg-card/50 border border-border/30"
            >
              <div className="flex items-center gap-2 min-w-0">
                <div className="flex items-center gap-1 text-sm font-medium truncate">
                  <span className="truncate max-w-[80px]">{(tx.from_address ?? (tx as any).fromAddress ?? '—').slice(0, 8)}…</span>
                  <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0" />
                  <span className="text-muted-foreground">Swap</span>
                </div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <div className="text-right">
                  <div className="text-sm font-semibold">{Number(tx.amount).toFixed(4)}</div>
                  <div className="text-xs text-muted-foreground">
                    {formatDistanceToNow(new Date(tx.created_at), { addSuffix: true })}
                  </div>
                </div>
                <Badge
                  variant="secondary"
                  className={tx.status === 'confirmed' ? 'text-primary bg-primary/10' : 'text-amber-500 bg-amber-500/10'}
                >
                  {tx.status}
                </Badge>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
