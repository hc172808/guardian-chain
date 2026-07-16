import { useState, useEffect, useCallback } from 'react';
import { ethers } from 'ethers';

// Local test-node ports per network
const NET_PORT: Record<string, number> = {
  mainnet: 8545,
  testnet: 8600,
  devnet:  8650,
};

// Chain IDs per network
export const NET_CHAIN: Record<string, { chainIdHex: string; chainId: number; symbol: string; name: string }> = {
  mainnet: { chainId: 13370, chainIdHex: '0x343A', symbol: 'GYDS',  name: 'GYDS Mainnet' },
  testnet: { chainId: 13371, chainIdHex: '0x343B', symbol: 'tGYDS', name: 'GYDS Testnet' },
  devnet:  { chainId: 13372, chainIdHex: '0x343C', symbol: 'dGYDS', name: 'GYDS Devnet'  },
};

export interface RpcBalanceResult {
  gydsBalance: string | null;           // total GYDS across all addresses (formatted ether)
  perAddress: Record<string, string>;   // lowercase address → formatted GYDS balance
  chainId: number;                      // active network chain ID (decimal)
  chainIdHex: string;                   // active network chain ID (hex)
  symbol: string;                       // native token symbol for the selected network
  networkName: string;                  // human-readable network name
  loading: boolean;
  error: string | null;
  lastFetched: Date | null;
  refresh: () => void;
}

/**
 * Fetches GYDS (eth_getBalance) from the local test-node RPC for each address.
 *
 * @param addresses  List of wallet addresses to check.
 * @param network    'mainnet' | 'testnet' | 'devnet' | 'all'  (defaults to 'mainnet').
 *                   'all' is treated as mainnet for the RPC query.
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
  const [trigger, setTrigger]         = useState(0);

  const refresh = useCallback(() => setTrigger(t => t + 1), []);

  // Resolve 'all' → 'mainnet' for the actual RPC query
  const resolvedNet = (network === 'all' || !NET_PORT[network]) ? 'mainnet' : network;
  const netInfo = NET_CHAIN[resolvedNet] ?? NET_CHAIN.mainnet;

  useEffect(() => {
    if (!addresses.length) { setLoading(false); return; }

    let cancelled = false;
    setLoading(true);
    setError(null);

    const port     = NET_PORT[resolvedNet] ?? 8545;
    const endpoint = `http://localhost:${port}`;

    (async () => {
      try {
        let total = BigInt(0);
        const addrMap: Record<string, string> = {};

        for (const addr of addresses) {
          if (!ethers.isAddress(addr)) {
            addrMap[addr.toLowerCase()] = '0';
            continue;
          }
          try {
            const provider = new ethers.JsonRpcProvider(endpoint, undefined, { polling: false });
            const bal = await Promise.race([
              provider.getBalance(addr),
              new Promise<never>((_, rej) => setTimeout(() => rej(new Error('timeout')), 4000)),
            ]) as bigint;
            addrMap[addr.toLowerCase()] = ethers.formatEther(bal);
            total += bal;
          } catch {
            addrMap[addr.toLowerCase()] = '0';
          }
        }

        if (!cancelled) {
          setGydsBalance(ethers.formatEther(total));
          setPerAddress(addrMap);
          setLastFetched(new Date());
          setError(null);
        }
      } catch {
        if (!cancelled) {
          setError('RPC offline');
          setGydsBalance(null);
          setPerAddress({});
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  // Re-run when addresses, network, or manual refresh changes
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
    refresh,
  };
}
