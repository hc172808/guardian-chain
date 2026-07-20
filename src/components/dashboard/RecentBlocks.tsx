import { useState, useEffect, useCallback } from 'react';
import { GlassCard } from '../ui/GlassCard';
import { CheckCircle, Clock, ExternalLink, Loader2, Blocks as BlocksIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { api } from '@/lib/api';
import { useNetwork, NetworkKind, NETWORK_BADGE } from '@/contexts/NetworkContext';

interface RecentTx {
  id: string;
  from_address: string;
  to_address: string;
  amount: number;
  status: string;
  created_at: string;
  block_height: number | null;
  tx_hash: string | null;
  token_symbol?: string;
  network?: string;
}

export const RecentBlocks = () => {
  const { selectedNetwork } = useNetwork();
  const network: NetworkKind = selectedNetwork === 'all' ? 'mainnet' : selectedNetwork;
  const badge = NETWORK_BADGE[network];

  const [transactions, setTransactions] = useState<RecentTx[]>([]);
  const [loading,      setLoading]      = useState(true);

  const fetchTxs = useCallback(async () => {
    try {
      // Fetch user transactions then filter client-side by network
      // (the /api/transactions endpoint returns the user's own txs)
      const data = await api.get('/api/transactions').catch(() => []);
      const rows: RecentTx[] = Array.isArray(data) ? data : [];

      // Filter by selected network when not 'all'
      const filtered = selectedNetwork === 'all'
        ? rows
        : rows.filter(tx => !tx.network || tx.network === network);

      setTransactions(filtered.slice(0, 8));
    } catch {}
    setLoading(false);
  }, [network, selectedNetwork]);

  useEffect(() => {
    setLoading(true);
    fetchTxs();
    const iv = setInterval(fetchTxs, 10_000);
    return () => clearInterval(iv);
  }, [fetchTxs]);

  return (
    <GlassCard>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <h3 className="text-lg font-semibold">Recent Activity</h3>
          {/* Show which network's transactions are displayed */}
          <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${badge.border} ${badge.bg} ${badge.text}`}>
            {badge.label}
          </span>
        </div>
        <Link
          to="/explorer"
          className="text-sm text-primary hover:text-primary/80 flex items-center gap-1"
        >
          View All <ExternalLink className="w-3 h-3" />
        </Link>
      </div>

      {loading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : transactions.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          <BlocksIcon className="h-10 w-10 mx-auto mb-3 opacity-50" />
          <p>No activity on {badge.label} yet</p>
          <p className="text-xs mt-1">Transactions will appear here once the network is active</p>
        </div>
      ) : (
        <div className="space-y-3">
          {transactions.map((tx, index) => (
            <motion.div
              key={tx.id}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.05 }}
              className="flex items-center gap-4 p-3 rounded-lg bg-secondary/30 hover:bg-secondary/50 transition-colors"
            >
              <div className="flex-shrink-0">
                {tx.status === 'confirmed' ? (
                  <div className="p-2 rounded-lg bg-primary/10">
                    <CheckCircle className="w-4 h-4 text-primary" />
                  </div>
                ) : (
                  <div className="p-2 rounded-lg bg-yellow-500/10">
                    <Clock className="w-4 h-4 text-yellow-500 animate-pulse" />
                  </div>
                )}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm font-medium truncate">
                    {tx.tx_hash ? tx.tx_hash.slice(0, 16) + '...' : 'Pending'}
                  </span>
                  <span className={cn(
                    'text-xs px-2 py-0.5 rounded-full',
                    tx.status === 'confirmed'
                      ? 'bg-primary/10 text-primary'
                      : 'bg-yellow-500/10 text-yellow-500'
                  )}>
                    {tx.status === 'confirmed' ? 'Confirmed' : 'Pending'}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground font-mono truncate mt-1">
                  {tx.from_address ? tx.from_address.slice(0, 10) + '...' : 'System'}
                  {' → '}
                  {tx.to_address   ? tx.to_address.slice(0, 10)   + '...' : 'Unknown'}
                </p>
              </div>

              <div className="text-right flex-shrink-0">
                <p className="text-sm font-medium">
                  {Number(tx.amount).toLocaleString()} {tx.token_symbol || 'GYDS'}
                </p>
                <p className="text-xs text-muted-foreground">
                  {new Date(tx.created_at).toLocaleTimeString()}
                </p>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </GlassCard>
  );
};
