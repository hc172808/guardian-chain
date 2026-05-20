import { useEffect, useRef, useState } from 'react';

export interface BlockStats {
  blockHeight: number | null;
  loading: boolean;
  online: boolean;
}

const POLL_MS = 6_000;

export function useBlockStats(): BlockStats {
  const [state, setState] = useState<BlockStats>({ blockHeight: null, loading: true, online: false });
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    let cancelled = false;

    const tick = async () => {
      try {
        const res = await fetch('/api/blockchain/network/stats', {
          signal: AbortSignal.timeout(4000),
        });
        if (!res.ok) throw new Error('bad response');
        const data = (await res.json()) as { blockHeight?: number };
        if (!cancelled) {
          setState({ blockHeight: data.blockHeight ?? null, loading: false, online: true });
        }
      } catch {
        if (!cancelled) {
          setState((s) => ({ ...s, loading: false, online: false }));
        }
      }
    };

    tick();
    timerRef.current = setInterval(tick, POLL_MS);

    return () => {
      cancelled = true;
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  return state;
}
