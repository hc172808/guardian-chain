import { useState, useEffect, useCallback, useRef } from 'react';
import { Block, Transaction } from '@/lib/blockchain';
import { RPC_CONFIG } from '@/config/network';

interface BlockchainWebSocketState {
  isConnected: boolean;
  latestBlock: Block | null;
  latestTransactions: Transaction[];
  pendingTransactions: Transaction[];
  error: string | null;
}

interface WebSocketMessage {
  type: 'newBlock' | 'newTransaction' | 'pendingTransaction' | 'status';
  data: any;
}

export const useBlockchainWebSocket = () => {
  const [state, setState] = useState<BlockchainWebSocketState>({
    isConnected: false,
    latestBlock: null,
    latestTransactions: [],
    pendingTransactions: [],
    error: null,
  });

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttempts = useRef(0);
  const maxReconnectAttempts = 5;

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    try {
      // Use the WebSocket URL from config
      const wsUrl = RPC_CONFIG.wsUrl;

      wsRef.current = new WebSocket(wsUrl);

      wsRef.current.onopen = () => {
        console.log('WebSocket connected to blockchain node');
        setState(prev => ({ ...prev, isConnected: true, error: null }));
        reconnectAttempts.current = 0;

        // Subscribe to events
        wsRef.current?.send(JSON.stringify({
          jsonrpc: '2.0',
          method: 'subscribe',
          params: ['newBlocks', 'newTransactions', 'pendingTransactions'],
          id: 1,
        }));
      };

      wsRef.current.onmessage = (event) => {
        try {
          const message: WebSocketMessage = JSON.parse(event.data);
          
          switch (message.type) {
            case 'newBlock':
              const newBlock = parseBlock(message.data);
              setState(prev => ({
                ...prev,
                latestBlock: newBlock,
                latestTransactions: [
                  ...newBlock.transactions.slice(0, 10),
                  ...prev.latestTransactions.slice(0, 90),
                ],
              }));
              break;

            case 'newTransaction':
              const newTx = parseTransaction(message.data);
              setState(prev => ({
                ...prev,
                latestTransactions: [newTx, ...prev.latestTransactions.slice(0, 99)],
                pendingTransactions: prev.pendingTransactions.filter(
                  tx => tx.id !== newTx.id
                ),
              }));
              break;

            case 'pendingTransaction':
              const pendingTx = parseTransaction(message.data);
              setState(prev => ({
                ...prev,
                pendingTransactions: [pendingTx, ...prev.pendingTransactions.slice(0, 49)],
              }));
              break;

            case 'status':
              console.log('Node status:', message.data);
              break;
          }
        } catch (err) {
          console.error('Failed to parse WebSocket message:', err);
        }
      };

      wsRef.current.onclose = () => {
        console.log('WebSocket disconnected');
        setState(prev => ({ ...prev, isConnected: false }));
        
        // Attempt reconnection
        if (reconnectAttempts.current < maxReconnectAttempts) {
          const delay = Math.min(1000 * Math.pow(2, reconnectAttempts.current), 30000);
          reconnectTimeoutRef.current = setTimeout(() => {
            reconnectAttempts.current++;
            connect();
          }, delay);
        }
      };

      wsRef.current.onerror = (error) => {
        console.error('WebSocket error:', error);
        setState(prev => ({ 
          ...prev, 
          error: 'Failed to connect to blockchain node',
          isConnected: false,
        }));
      };
    } catch (err) {
      console.error('Failed to create WebSocket:', err);
      setState(prev => ({ 
        ...prev, 
        error: 'WebSocket connection failed',
        isConnected: false,
      }));
    }
  }, []);

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setState(prev => ({ ...prev, isConnected: false }));
  }, []);

  const subscribe = useCallback((events: string[]) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        jsonrpc: '2.0',
        method: 'subscribe',
        params: events,
        id: Date.now(),
      }));
    }
  }, []);

  const unsubscribe = useCallback((events: string[]) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        jsonrpc: '2.0',
        method: 'unsubscribe',
        params: events,
        id: Date.now(),
      }));
    }
  }, []);

  useEffect(() => {
    connect();
    return () => disconnect();
  }, [connect, disconnect]);

  return {
    ...state,
    connect,
    disconnect,
    subscribe,
    unsubscribe,
  };
};

// Helper functions to parse blockchain data
const parseBlock = (data: any): Block => ({
  height: data.height || data.number || 0,
  hash: data.hash || '',
  previousHash: data.parentHash || data.previousHash || '',
  timestamp: data.timestamp ? data.timestamp * 1000 : Date.now(),
  transactions: (data.transactions || []).map(parseTransaction),
  validator: data.miner || data.validator || '',
  validatorStake: data.validatorStake || 0,
  finalized: data.finalized ?? true,
  miningRewards: data.miningRewards || [],
  signature: data.signature || '',
});

const parseTransaction = (data: any): Transaction => ({
  id: data.id || data.hash || '',
  from: data.from || '',
  to: data.to || '',
  amount: parseFloat(data.amount || data.value) || 0,
  fee: parseFloat(data.fee || data.gasPrice) || 0,
  nonce: data.nonce || 0,
  timestamp: data.timestamp ? data.timestamp * 1000 : Date.now(),
  status: data.status || 'pending',
});
