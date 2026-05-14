import { useEffect, useRef, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { API_BASE } from "@/constants/api";
import type { Block, Transaction } from "./useApi";

type StreamEvent = "newBlock" | "newTransaction";

interface StreamMessage {
  type: StreamEvent;
  data: Block | Transaction;
}

interface UseBlockStreamOptions {
  onBlock?: (block: Block) => void;
  onTransaction?: (tx: Transaction) => void;
  enabled?: boolean;
}

export function useBlockStream({
  onBlock,
  onTransaction,
  enabled = true,
}: UseBlockStreamOptions = {}) {
  const queryClient = useQueryClient();
  const esRef = useRef<EventSource | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectDelay = useRef(2000);
  const mounted = useRef(true);

  const connect = useCallback(() => {
    if (!mounted.current || !enabled) return;

    const url = `${API_BASE}/api/blockchain/stream`;
    const es = new EventSource(url);
    esRef.current = es;

    es.onopen = () => {
      reconnectDelay.current = 2000;
    };

    es.onmessage = (evt) => {
      try {
        const msg: StreamMessage = JSON.parse(evt.data);
        if (msg.type === "newBlock") {
          const block = msg.data as Block;
          queryClient.setQueryData<Block[]>(["blocks", 20], (prev) => {
            if (!prev) return [block];
            const exists = prev.some((b) => b.number === block.number);
            if (exists) return prev;
            return [block, ...prev].slice(0, 20);
          });
          queryClient.setQueryData<Block[]>(["blocks", 40], (prev) => {
            if (!prev) return [block];
            const exists = prev.some((b) => b.number === block.number);
            if (exists) return prev;
            return [block, ...prev].slice(0, 40);
          });
          queryClient.setQueryData<Block[]>(["blocks", 8], (prev) => {
            if (!prev) return [block];
            const exists = prev.some((b) => b.number === block.number);
            if (exists) return prev;
            return [block, ...prev].slice(0, 8);
          });
          queryClient.invalidateQueries({ queryKey: ["networkStats"] });
          onBlock?.(block);
        } else if (msg.type === "newTransaction") {
          const tx = msg.data as Transaction;
          queryClient.setQueryData<Transaction[]>(["transactions", 20], (prev) => {
            if (!prev) return [tx];
            const exists = prev.some((t) => t.hash === tx.hash);
            if (exists) return prev;
            return [tx, ...prev].slice(0, 20);
          });
          queryClient.setQueryData<Transaction[]>(["transactions", 40], (prev) => {
            if (!prev) return [tx];
            const exists = prev.some((t) => t.hash === tx.hash);
            if (exists) return prev;
            return [tx, ...prev].slice(0, 40);
          });
          onTransaction?.(tx);
        }
      } catch {
      }
    };

    es.onerror = () => {
      es.close();
      esRef.current = null;
      if (!mounted.current) return;
      reconnectTimer.current = setTimeout(() => {
        reconnectDelay.current = Math.min(reconnectDelay.current * 1.5, 30000);
        connect();
      }, reconnectDelay.current);
    };
  }, [enabled, onBlock, onTransaction, queryClient]);

  useEffect(() => {
    mounted.current = true;
    if (enabled) connect();
    return () => {
      mounted.current = false;
      esRef.current?.close();
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
    };
  }, [connect, enabled]);
}
