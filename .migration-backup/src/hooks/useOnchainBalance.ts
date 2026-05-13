// FE-12: read on-chain native balance via JSON-RPC eth_getBalance.
// Falls back gracefully when node is unreachable so the UI keeps showing
// the DB-aggregated balance from `getUserBalances`.

import { useEffect, useState } from 'react';
import { ALL_RPC_ENDPOINTS } from '@/config/network';

export interface OnchainBalance {
  /** native balance in human units (GYDS), null while loading or unreachable */
  native: number | null;
  /** which RPC URL answered, or null if all failed */
  source: string | null;
  /** true while the node is reachable and answered with a valid hex */
  online: boolean;
  loading: boolean;
}

const POLL_MS = 12_000;

async function rpcGetBalance(url: string, address: string, signal: AbortSignal): Promise<bigint | null> {
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'eth_getBalance',
        params: [address, 'latest'],
      }),
      signal,
    });
    if (!res.ok) return null;
    const json = await res.json();
    if (typeof json?.result !== 'string') return null;
    return BigInt(json.result);
  } catch {
    return null;
  }
}

export function useOnchainBalance(address?: string | null): OnchainBalance {
  const [state, setState] = useState<OnchainBalance>({
    native: null,
    source: null,
    online: false,
    loading: false,
  });

  useEffect(() => {
    if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
      setState({ native: null, source: null, online: false, loading: false });
      return;
    }

    let cancelled = false;
    const controller = new AbortController();

    const tick = async () => {
      setState((s) => ({ ...s, loading: true }));
      for (const url of ALL_RPC_ENDPOINTS) {
        const wei = await rpcGetBalance(url, address, controller.signal);
        if (cancelled) return;
        if (wei !== null) {
          // 18 decimals → number with reasonable precision
          const native = Number(wei) / 1e18;
          setState({ native, source: url, online: true, loading: false });
          return;
        }
      }
      if (!cancelled) {
        setState({ native: null, source: null, online: false, loading: false });
      }
    };

    tick();
    const id = setInterval(tick, POLL_MS);
    return () => {
      cancelled = true;
      controller.abort();
      clearInterval(id);
    };
  }, [address]);

  return state;
}
