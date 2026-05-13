import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/constants/api";

export interface NetworkStats {
  blockHeight: number;
  gasPrice: string;
  peerCount: number;
  validatorCount: number;
  walletCount: number;
  totalTransactions: number;
  chainId: number;
  source: string;
}

export interface Block {
  number: number;
  hash: string;
  parentHash: string;
  timestamp: number;
  transactions: number;
  validator: string;
  size: number;
  gasUsed: number;
  gasLimit: number;
}

export interface Transaction {
  hash: string;
  from: string;
  to: string;
  value: string;
  blockNumber: number;
  timestamp: number;
  status: string;
  gasUsed: number;
  gasPrice: string;
}

export interface PricePoint {
  timestamp: number;
  price: number;
}

export interface FaucetClaim {
  id: string;
  wallet_address: string;
  token: string;
  amount: string;
  status: string;
  created_at: string;
}

interface TableResponse<T> {
  data: T[];
  error: null | string;
  count: number;
}

export function useNetworkStats() {
  return useQuery<NetworkStats>({
    queryKey: ["networkStats"],
    queryFn: () => apiFetch<NetworkStats>("/api/blockchain/network/stats"),
    refetchInterval: 12000,
    staleTime: 5000,
  });
}

export function useBlocks(limit = 20) {
  return useQuery<Block[]>({
    queryKey: ["blocks", limit],
    queryFn: async () => {
      const res = await apiFetch<{ blocks: Block[]; count: number }>(
        `/api/blockchain/blocks?limit=${limit}`
      );
      return res.blocks ?? [];
    },
    refetchInterval: 12000,
    staleTime: 5000,
  });
}

export function useBlock(id: string | number) {
  return useQuery<Block | null>({
    queryKey: ["block", id],
    queryFn: async () => {
      const res = await apiFetch<{ block: Block }>(`/api/blockchain/block/${id}`);
      return res.block ?? null;
    },
    enabled: !!id,
  });
}

export function useTransactions(limit = 20) {
  return useQuery<Transaction[]>({
    queryKey: ["transactions", limit],
    queryFn: async () => {
      const res = await apiFetch<{ transactions: Transaction[]; count: number }>(
        `/api/blockchain/transactions?limit=${limit}`
      );
      return res.transactions ?? [];
    },
    refetchInterval: 12000,
    staleTime: 5000,
  });
}

export function useTransaction(hash: string) {
  return useQuery<Transaction | null>({
    queryKey: ["tx", hash],
    queryFn: async () => {
      const res = await apiFetch<{ transaction: Transaction }>(
        `/api/blockchain/tx/${hash}`
      );
      return res.transaction ?? null;
    },
    enabled: !!hash,
  });
}

export function usePriceHistory() {
  return useQuery<{ prices: PricePoint[]; current: number }>({
    queryKey: ["priceHistory"],
    queryFn: () =>
      apiFetch<{ prices: PricePoint[]; current: number }>(
        "/api/blockchain/token-price/history"
      ),
    refetchInterval: 60000,
    staleTime: 30000,
  });
}

export function useFaucetClaims(address: string) {
  return useQuery<FaucetClaim[]>({
    queryKey: ["faucetClaims", address],
    queryFn: async () => {
      if (!address) return [];
      const res = await apiFetch<TableResponse<FaucetClaim>>(
        `/api/table/faucet_claims?_filter_eq=wallet_address:${address}&_order_col=created_at&_order_dir=desc&_limit=5`
      );
      return res.data ?? [];
    },
    enabled: !!address,
  });
}

export function useClaimFaucet() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { wallet_address: string; token: string }) =>
      apiFetch<FaucetClaim>("/api/table/faucet_claims", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["faucetClaims"] });
    },
  });
}
