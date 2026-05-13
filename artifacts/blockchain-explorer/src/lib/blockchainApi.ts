const API_BASE = '/api';

async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  const text = await res.text();
  let json: unknown;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`Invalid JSON from API (HTTP ${res.status})`);
  }
  if (!res.ok) throw new Error((json as { error?: string })?.error || `HTTP ${res.status}`);
  return json as T;
}

export interface WalletInfo {
  address: string;
  balance: string;
  transactionCount: string;
}

export async function createWallet(): Promise<{ address: string }> {
  return apiFetch('/blockchain/wallet/create', { method: 'POST' });
}

export async function getWallet(address: string): Promise<WalletInfo> {
  return apiFetch(`/blockchain/wallet/${address}`);
}

export interface TxSendParams {
  from: string;
  to: string;
  value: string;
}

export async function sendTransaction(params: TxSendParams): Promise<{ txHash: string }> {
  return apiFetch('/blockchain/tx/send', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

export interface TxDetail {
  transaction: Record<string, unknown> | null;
  receipt: Record<string, unknown> | null;
}

export async function getTransaction(hash: string): Promise<TxDetail> {
  return apiFetch(`/blockchain/tx/${hash}`);
}

export interface BlocksResponse {
  blocks: Record<string, unknown>[];
  count: number;
  source: string;
}

export async function getBlocks(limit = 20): Promise<BlocksResponse> {
  return apiFetch(`/blockchain/blocks?limit=${limit}`);
}

export interface BlockDetailResponse {
  block: Record<string, unknown>;
}

export async function getBlock(id: string | number): Promise<BlockDetailResponse> {
  return apiFetch(`/blockchain/block/${id}`);
}

export interface TransactionsResponse {
  transactions: Record<string, unknown>[];
  count: number;
  source: string;
}

export async function getTransactions(limit = 20): Promise<TransactionsResponse> {
  return apiFetch(`/blockchain/transactions?limit=${limit}`);
}

export interface NetworkStats {
  blockHeight: number;
  gasPrice: string;
  peerCount: number;
  chainId: number;
}

export async function getNetworkStats(): Promise<NetworkStats> {
  return apiFetch('/blockchain/network/stats');
}

export interface HealthStatus {
  rpc: string;
  indexerDb: string;
}

export async function getHealth(): Promise<HealthStatus> {
  return apiFetch('/blockchain/health');
}
