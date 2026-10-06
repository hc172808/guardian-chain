import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Clock3, Loader2, RefreshCw, Rocket } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { GlassCard } from '@/components/ui/GlassCard';
import { api } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';

type ReviewStatus = 'pending_review' | 'deployment_pending';

interface StablecoinReviewItem {
  id: string;
  name: string;
  symbol: string;
  description: string | null;
  peg_type: string;
  peg_value: string;
  collateral_type: string;
  collateral_ratio: string;
  status: ReviewStatus;
  owner_address: string | null;
  creator_wallet: string | null;
  deployment_chain_id: number | null;
  deployment_tx_hash: string | null;
  deployment_error: string | null;
  creator_username: string | null;
  creator_email: string | null;
  created_at: string;
}

export function StablecoinReviewQueue() {
  const { toast } = useToast();
  const [items, setItems] = useState<StablecoinReviewItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [workingId, setWorkingId] = useState<string | null>(null);

  const loadQueue = useCallback(async (quiet = false) => {
    if (quiet) setRefreshing(true);
    else setLoading(true);
    try {
      const data = await api.get('/api/admin/stablecoins/pending');
      setItems(Array.isArray(data) ? data : []);
    } catch (error: any) {
      if (!quiet) {
        toast({
          title: 'Could not load stablecoin review queue',
          description: error.message,
          variant: 'destructive',
        });
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [toast]);

  useEffect(() => {
    void loadQueue();
    const interval = window.setInterval(() => void loadQueue(true), 30000);
    return () => window.clearInterval(interval);
  }, [loadQueue]);

  const deploy = async (item: StablecoinReviewItem) => {
    setWorkingId(item.id);
    try {
      const updated = await api.post(`/api/admin/stablecoins/${item.id}/approve`, {});
      toast({
        title: updated.status === 'active' ? `${item.symbol} is deployed` : 'Deployment submitted',
        description: updated.status === 'active'
          ? 'The contract is confirmed on GYDS Chain.'
          : 'The token will activate after the chain confirms its contract.',
      });
      await loadQueue(true);
    } catch (error: any) {
      toast({
        title: 'Deployment was not completed',
        description: error.message,
        variant: 'destructive',
      });
      await loadQueue(true);
    } finally {
      setWorkingId(null);
    }
  };

  return (
    <GlassCard className="p-5 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Rocket className="h-5 w-5 text-primary" />
            User Stablecoin Reviews
            {items.length > 0 && <Badge variant="secondary">{items.length}</Badge>}
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Approving signs and submits an ERC-20 deployment on GYDS Chain (198282). A stablecoin becomes active only after its transaction is confirmed.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => void loadQueue(true)}
          disabled={refreshing}
          aria-label="Refresh stablecoin review queue"
        >
          <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      {loading ? (
        <div className="py-8 text-center text-sm text-muted-foreground">
          <Loader2 className="h-5 w-5 mx-auto mb-2 animate-spin" />
          Loading review queue…
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-8 text-center">
          <CheckCircle2 className="h-7 w-7 mx-auto text-emerald-400 mb-2" />
          <p className="font-medium">No stablecoins need review</p>
          <p className="text-sm text-muted-foreground mt-1">New user submissions will appear here.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((item) => {
            const deploying = item.status === 'deployment_pending';
            const creator = item.creator_username || item.creator_email || 'Unknown creator';
            return (
              <div key={item.id} className="rounded-xl border border-border/70 bg-background/40 p-4">
                <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
                  <div className="min-w-0 space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="font-semibold">{item.symbol} — {item.name}</h4>
                      <Badge
                        variant="outline"
                        className={deploying
                          ? 'border-blue-400 text-blue-400'
                          : 'border-amber-400 text-amber-400'}
                      >
                        {deploying ? 'Deployment pending' : 'Needs approval'}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Submitted by {creator} · {item.peg_type} peg · {item.collateral_type.replace(/_/g, ' ')} · {item.collateral_ratio}% collateral
                    </p>
                    {item.description && <p className="text-sm">{item.description}</p>}
                    <div className="text-xs text-muted-foreground">
                      Creator wallet: {item.creator_wallet
                        ? <code className="break-all">{item.creator_wallet}</code>
                        : <span className="text-amber-400">not linked — creator must link a wallet before deployment</span>}
                    </div>
                    {item.deployment_tx_hash && (
                      <div className="text-xs text-muted-foreground">
                        Deployment transaction: <code className="break-all">{item.deployment_tx_hash}</code>
                      </div>
                    )}
                    {item.deployment_error && (
                      <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 p-2 text-xs text-amber-300">
                        <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                        <span>{item.deployment_error}</span>
                      </div>
                    )}
                    {deploying && (
                      <p className="flex items-center gap-1 text-xs text-blue-300">
                        <Clock3 className="h-3.5 w-3.5" />
                        Waiting for a confirmed receipt; this queue checks status automatically.
                      </p>
                    )}
                  </div>
                  <Button
                    size="sm"
                    onClick={() => void deploy(item)}
                    disabled={workingId !== null || (!deploying && !item.creator_wallet)}
                    className="shrink-0"
                  >
                    {workingId === item.id
                      ? <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      : <Rocket className="h-4 w-4 mr-2" />}
                    {deploying ? 'Check / retry deployment' : 'Approve & deploy'}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </GlassCard>
  );
}
