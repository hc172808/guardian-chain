import { useState, useEffect, useCallback } from 'react';

// Chain IDs per network
export const NET_CHAIN: Record<string, { chainIdHex: string; chainId: number; symbol: string; name: string }> = {
  mainnet: { chainId: 198282, chainIdHex: '0x3068a', symbol: 'GYDS',  name: 'GYDS Mainnet' },
  testnet: { chainId: 13371, chainIdHex: '0x343B', symbol: 'tGYDS', name: 'GYDS Testnet' },
  devnet:  { chainId: 13372, chainIdHex: '0x343C', symbol: 'dGYDS', name: 'GYDS Devnet'  },
};

export interface RpcBalanceResult {
  gydsBalance: string | null;           // total GYDS across all addresses (formatted)
  perAddress: Record<string, string>;   // lowercase address → formatted GYDS balance
  chainId: number;
  chainIdHex: string;
  symbol: string;
  networkName: string;
  loading: boolean;
  error: string | null;
  lastFetched: Date | null;
  source: string | null;               // 'local-node' | 'registered-node' | 'db' | null
  refresh: () => void;
}

/**
 * Fetches GYDS balance for each address via the server-side /api/rpc/balance proxy.
 * The server tries local test-nodes first, then registered nodes, then DB balance.
 * This avoids the browser-vs-localhost problem entirely.
 */
export function useRpcBalance(
  addresses: string[],
  network: string = 'mainnet',
): RpcBalanceResult {
  const [gydsBalance, setGydsBalance] = useState<string | null>(null);
  const [perAddress, setPerAddress]   = useState<Record<string, string>>({});
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState<string | null>(null);
  const [lastFetched, setLastFetched] = useState<Date | null>(null);
  const [source, setSource]           = useState<string | null>(null);
  const [trigger, setTrigger]         = useState(0);

  const refresh = useCallback(() => setTrigger(t => t + 1), []);

  // Resolve 'all' → 'mainnet'
  const resolvedNet = (network === 'all' || !NET_CHAIN[network]) ? 'mainnet' : network;
  const netInfo = NET_CHAIN[resolvedNet] ?? NET_CHAIN.mainnet;

  useEffect(() => {
    if (!addresses.length) { setLoading(false); setGydsBalance('0'); setPerAddress({}); return; }

    let cancelled = false;
    setLoading(true);
    setError(null);

    const addrParam = addresses.filter(a => /^0x[0-9a-fA-F]{40}$/.test(a)).join(',');
    if (!addrParam) {
      setLoading(false);
      setGydsBalance('0');
      setPerAddress({});
      return;
    }

    fetch(`/api/rpc/balance?addresses=${encodeURIComponent(addrParam)}&network=${resolvedNet}`)
      .then(r => r.json())
      .then(data => {
        if (cancelled) return;
        setGydsBalance(data.total ?? '0');
        setPerAddress(data.perAddress ?? {});
        setSource(data.source ?? null);
        setLastFetched(new Date());
        setError(null);
      })
      .catch(err => {
        if (cancelled) return;
        setError('Balance fetch failed');
        setGydsBalance(null);
        setPerAddress({});
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addresses.join(','), resolvedNet, trigger]);

  return {
    gydsBalance,
    perAddress,
    chainId:     netInfo.chainId,
    chainIdHex:  netInfo.chainIdHex,
    symbol:      netInfo.symbol,
    networkName: netInfo.name,
    loading,
    error,
    lastFetched,
    source,
    refresh,
  };
}
