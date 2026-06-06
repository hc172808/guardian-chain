import { useEffect, useState } from 'react';
import { GlassCard } from '@/components/ui/GlassCard';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { ScrollText, Loader2, Droplets, Coins, DollarSign } from 'lucide-react';

interface OpRow {
  id: string;
  action: string;
  category: string;
  target_id: string | null;
  details: Record<string, any> | null;
  created_at: string;
}

const iconFor = (action: string) => {
  if (action === 'faucet_claim') return Droplets;
  if (action.startsWith('token_price')) return DollarSign;
  if (action.startsWith('stablecoin')) return Coins;
  return ScrollText;
};

export const MyOperationsFeed = () => {
  const { user } = useAuth();
  const [rows, setRows] = useState<OpRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase
        .from('audit_logs')
        .select('id, action, category, target_id, details, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(50);
      setRows((data as OpRow[]) ?? []);
      setLoading(false);
    })();
  }, [user]);

  return (
    <GlassCard className="p-6">
      <div className="flex items-center gap-2 mb-4">
        <ScrollText className="w-5 h-5 text-primary" />
        <h3 className="text-lg font-semibold">My Operations</h3>
        <Badge variant="outline" className="ml-auto">{rows.length}</Badge>
      </div>
      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-6">No operations yet. Claim from the faucet or save stablecoin settings to see entries here.</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => {
            const Icon = iconFor(r.action);
            return (
              <li key={r.id} className="flex items-start gap-3 p-3 rounded-lg bg-secondary/30 border border-border/40">
                <Icon className="w-4 h-4 mt-0.5 text-primary flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm">{r.action}</span>
                    {r.target_id && <Badge variant="secondary" className="text-xs">{r.target_id}</Badge>}
                  </div>
                  {r.details && (
                    <p className="text-xs text-muted-foreground font-mono truncate">
                      {r.details.amount != null && `${r.details.amount} `}
                      {r.details.tx_hash ?? r.details.price ?? ''}
                    </p>
                  )}
                </div>
                <span className="text-xs text-muted-foreground whitespace-nowrap">
                  {new Date(r.created_at).toLocaleString()}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </GlassCard>
  );
};
