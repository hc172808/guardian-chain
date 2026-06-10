import { useState, useEffect, useCallback } from 'react';
import { ethers } from 'ethers';
import { ALL_RPC_ENDPOINTS } from '@/config/network';

interface RpcBalanceResult {
  gydsBalance: string | null;
  loading: boolean;
  error: string | null;
  lastFetched: Date | null;
  refresh: () => void;
}

async function tryFetchBalance(address: string): Promise<string | null> {
  for (const endpoint of ALL_RPC_ENDPOINTS) {
    try {
      const provider = new ethers.JsonRpcProvider(endpoint, undefined, { polling: false });
      const bal = await Promise.race([
        provider.getBalance(address),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 4000)),
      ]);
      return ethers.formatEther(bal as bigint);
    } catch {
      continue;
    }
  }
  return null;
}

export function useRpcBalance(addresses: string[]): RpcBalanceResult {
  const [gydsBalance, setGydsBalance] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastFetched, setLastFetched] = useState<Date | null>(null);
  const [trigger, setTrigger] = useState(0);

  const refresh = useCallback(() => setTrigger(t => t + 1), []);

  useEffect(() => {
    if (!addresses.length) return;

    let cancelled = false;
    setLoading(true);
    setError(null);

    (async () => {
      try {
        let total = BigInt(0);
        for (const addr of addresses) {
          if (!ethers.isAddress(addr)) continue;
          for (const endpoint of ALL_RPC_ENDPOINTS) {
            try {
              const provider = new ethers.JsonRpcProvider(endpoint, undefined, { polling: false });
              const bal = await Promise.race([
                provider.getBalance(addr),
                new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 4000)),
              ]) as bigint;
              total += bal;
              break;
            } catch {
              continue;
            }
          }
        }
        if (!cancelled) {
          setGydsBalance(ethers.formatEther(total));
          setLastFetched(new Date());
          setError(null);
        }
      } catch (err: any) {
        if (!cancelled) {
          setError('RPC offline');
          setGydsBalance(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [addresses.join(','), trigger]);

  return { gydsBalance, loading, error, lastFetched, refresh };
}
