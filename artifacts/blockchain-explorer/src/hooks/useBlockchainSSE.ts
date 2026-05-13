import { useState, useEffect, useRef, useCallback } from 'react';
import { Block, Transaction } from '@/lib/blockchain';

interface BlockchainSSEState {
  isConnected: boolean;
  latestBlock: Block | null;
  latestTransactions: Transaction[];
  pendingTransactions: Transaction[];
  error: string | null;
}

const parseBlock = (data: Record<string, unknown>): Block => ({
  height: (data.height as number) || (data.number as number) || 0,
  hash: (data.hash as string) || '',
  previousHash: (data.parentHash as string) || (data.previousHash as string) || '',
  timestamp: data.timestamp ? (data.timestamp as number) * 1000 : Date.now(),
  transactions: [],
  validator: (data.miner as string) || (data.validator as string) || '',
  validatorStake: 0,
  finalized: true,
  miningRewards: [],
  signature: '',
});

const parseTx = (data: Record<string, unknown>): Transaction => ({
  id: (data.id as string) || (data.hash as string) || '',
  from: (data.from as string) || '',
  to: (data.to as string) || '',
  amount: parseFloat((data.amount as string) || (data.value as string) || '0') || 0,
  fee: parseFloat((data.fee as string) || (data.gasPrice as string) || '0') || 0,
  nonce: (data.nonce as number) || 0,
  timestamp: data.timestamp ? (data.timestamp as number) * 1000 : Date.now(),
  status: ((data.status as string) || 'confirmed') as 'pending' | 'confirmed' | 'failed',
});

/**
 * Connects to GET /api/blockchain/stream (Server-Sent Events).
 * Exposes the same shape as useBlockchainWebSocket so callers are interchangeable.
 */
export const useBlockchainSSE = () => {
  const [state, setState] = useState<BlockchainSSEState>({
    isConnected: false,
    latestBlock: null,
    latestTransactions: [],
    pendingTransactions: [],
    error: null,
  });

  const esRef = useRef<EventSource | null>(null);
  const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const attemptsRef = useRef(0);

  const connect = useCallback(() => {
    if (esRef.current && esRef.current.readyState !== EventSource.CLOSED) return;

    const es = new EventSource('/api/blockchain/stream');
    esRef.current = es;

    es.addEventListener('newBlock', (e) => {
      try {
        const data = JSON.parse(e.data) as Record<string, unknown>;
        const block = parseBlock(data);
        setState(prev => ({
          ...prev,
          isConnected: true,
          error: null,
          latestBlock: block,
        }));
        attemptsRef.current = 0;
      } catch {
        // ignore malformed event
      }
    });

    es.addEventListener('newTransaction', (e) => {
      try {
        const data = JSON.parse(e.data) as Record<string, unknown>;
        const tx = parseTx(data);
        setState(prev => ({
          ...prev,
          latestTransactions: [tx, ...prev.latestTransactions.slice(0, 99)],
        }));
      } catch {
        // ignore
      }
    });

    es.onopen = () => {
      setState(prev => ({ ...prev, isConnected: true, error: null }));
      attemptsRef.current = 0;
    };

    es.onerror = () => {
      es.close();
      setState(prev => ({ ...prev, isConnected: false, error: 'Stream disconnected, reconnecting…' }));
      const delay = Math.min(1000 * Math.pow(2, attemptsRef.current), 30_000);
      retryRef.current = setTimeout(() => {
        attemptsRef.current += 1;
        connect();
      }, delay);
    };
  }, []);

  const disconnect = useCallback(() => {
    if (retryRef.current) clearTimeout(retryRef.current);
    esRef.current?.close();
    esRef.current = null;
    setState(prev => ({ ...prev, isConnected: false }));
  }, []);

  useEffect(() => {
    connect();
    return () => disconnect();
  }, [connect, disconnect]);

  return {
    ...state,
    connect,
    disconnect,
    // no-op stubs to keep the same interface as useBlockchainWebSocket
    subscribe: (_events: string[]) => {},
    unsubscribe: (_events: string[]) => {},
  };
};
