import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { AlertCircle, CheckCircle2, Clock } from 'lucide-react';
import { getNetworkStatus, NetworkStatus } from '@/lib/networkGuard';
import { getMempoolCount } from '@/lib/mempool';

// Compact banner: shows "Network online · X tx pending" or a clear offline
// warning. Drop it anywhere transactions originate so the user is never
// surprised when their send rolls into the mempool.
export const NetworkStatusBanner = ({ className = '' }: { className?: string }) => {
  const [net, setNet] = useState<NetworkStatus | null>(null);
  const [mempool, setMempool] = useState(0);

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      const [s, m] = await Promise.all([getNetworkStatus(), getMempoolCount()]);
      if (!alive) return;
      setNet(s);
      setMempool(m);
    };
    tick();
    const id = setInterval(tick, 15_000);
    return () => { alive = false; clearInterval(id); };
  }, []);

  if (!net) return null;

  if (!net.ok) {
    return (
      <div
        className={`flex items-center gap-2 p-3 rounded-lg border border-destructive/40 bg-destructive/10 text-sm ${className}`}
        data-testid="banner-network-offline"
      >
        <AlertCircle className="h-4 w-4 text-destructive shrink-0" />
        <div className="flex-1">
          <p className="font-medium text-destructive">Network Offline</p>
          <p className="text-xs text-muted-foreground">{net.reason}</p>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`flex items-center justify-between gap-2 p-2 rounded-lg border border-emerald-500/30 bg-emerald-500/5 text-xs ${className}`}
      data-testid="banner-network-online"
    >
      <div className="flex items-center gap-2">
        <CheckCircle2 className="h-3 w-3 text-emerald-400" />
        <span><span className="font-semibold text-emerald-300">{net.liveNodes.length}</span> node(s) online</span>
      </div>
      <Badge variant="outline" className="text-xs gap-1">
        <Clock className="h-3 w-3" /> {mempool} pending
      </Badge>
    </div>
  );
};
