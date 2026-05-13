// Blockchain API client — routes through edge function proxy to Go RPC node
// No Supabase dependency for blockchain data

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const FUNCTION_BASE = `${SUPABASE_URL}/functions/v1/blockchain-api`;

async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${FUNCTION_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'apikey': SUPABASE_KEY,
      ...(options.headers || {}),
    },
  });
  const text = await res.text();
  const ct = res.headers.get('content-type') || '';
  // Edge function failures (cold start, missing env, gateway errors) can return
  // an HTML error page. Surface a clean error instead of crashing JSON.parse.
  if (!ct.includes('application/json')) {
    if (!res.ok) throw new Error(`Edge function HTTP ${res.status}`);
    throw new Error('Unexpected non-JSON response from blockchain-api');
  }
  let json: any;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`Invalid JSON from blockchain-api (HTTP ${res.status})`);
  }
  if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
  return json as T;
}

// ── Wallet ──
export interface WalletInfo {
  address: string;
  balance: string;
  transactionCount: string;
}

export async function createWallet(): Promise<{ address: string }> {
  return apiFetch('/wallet/create', { method: 'POST' });
}

export async function getWallet(address: string): Promise<WalletInfo> {
  return apiFetch(`/wallet/${address}`);
}

// ── Transactions ──
export interface TxSendParams {
  from: string;
  to: string;
  value: string;
}

export async function sendTransaction(params: TxSendParams): Promise<{ txHash: string }> {
  return apiFetch('/tx/send', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

export interface TxDetail {
  transaction: Record<string, unknown> | null;
  receipt: Record<string, unknown> | null;
}

export async function getTransaction(hash: string): Promise<TxDetail> {
  return apiFetch(`/tx/${hash}`);
}

// ── Blocks ──
export interface BlocksResponse {
  blocks: Record<string, unknown>[];
  count: number;
  source: string;
}

export async function getBlocks(limit = 20): Promise<BlocksResponse> {
  return apiFetch(`/blocks?limit=${limit}`);
}

export interface BlockDetailResponse {
  block: Record<string, unknown>;
}

export async function getBlock(id: string | number): Promise<BlockDetailResponse> {
  return apiFetch(`/block/${id}`);
}

// ── Transactions list ──
export interface TransactionsResponse {
  transactions: Record<string, unknown>[];
  count: number;
  source: string;
}

export async function getTransactions(limit = 20): Promise<TransactionsResponse> {
  return apiFetch(`/transactions?limit=${limit}`);
}

// ── Network ──
export interface NetworkStats {
  blockHeight: number;
  gasPrice: string;
  peerCount: number;
  chainId: number;
}

export async function getNetworkStats(): Promise<NetworkStats> {
  return apiFetch('/network/stats');
}

// ── Health ──
export interface HealthStatus {
  rpc: string;
  indexerDb: string;
}

export async function getHealth(): Promise<HealthStatus> {
  return apiFetch('/health');
}
