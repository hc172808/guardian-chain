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

// Normalize block fields from litenode (uses "number"/"transactions") to
// the RPCBlock shape Explorer expects ("height"/"tx_count").
function normalizeBlock(b: Record<string, unknown>): Record<string, unknown> {
  return {
    ...b,
    // height is canonical — fall back to "number" field from litenode
    height: (b.height ?? b.number ?? 0) as number,
    // tx_count is canonical — fall back to "transactions" count from litenode
    tx_count: (b.tx_count ?? b.transactions ?? 0) as number,
    // gas fields
    gas_used: b.gas_used ?? b.gasUsed ?? 0,
    gas_limit: b.gas_limit ?? b.gasLimit ?? 30_000_000,
    // timestamp: keep as-is; litenode uses Unix seconds, multiply if needed
    timestamp: (() => {
      const ts = Number(b.timestamp ?? 0);
      return ts < 1e12 ? ts * 1000 : ts; // convert seconds → ms
    })(),
    proposer_addr: b.proposer_addr ?? b.validator ?? '',
  };
}

function normalizeTransaction(tx: Record<string, unknown>): Record<string, unknown> {
  return {
    ...tx,
    from_addr: tx.from_addr ?? tx.from ?? '',
    to_addr: tx.to_addr ?? tx.to ?? '',
    block_height: tx.block_height ?? tx.blockNumber ?? 0,
    coin_type: tx.coin_type ?? 'GYDS',
    tx_type: tx.tx_type ?? 'transfer',
    status: tx.status ?? 'success',
    fee: tx.fee ?? tx.gasPrice ?? '0',
    amount: tx.amount ?? tx.value ?? '0',
    timestamp: (() => {
      const ts = Number(tx.timestamp ?? 0);
      return ts < 1e12 ? ts * 1000 : ts;
    })(),
  };
}

export interface BlocksResponse {
  blocks: Record<string, unknown>[];
  count: number;
  source: string;
}

export async function getBlocks(limit = 20): Promise<BlocksResponse> {
  const data = await apiFetch<BlocksResponse>(`/blockchain/blocks?limit=${limit}`);
  return { ...data, blocks: (data.blocks ?? []).map(normalizeBlock) };
}

export interface BlockDetailResponse {
  block: Record<string, unknown>;
}

export async function getBlock(id: string | number): Promise<BlockDetailResponse> {
  const data = await apiFetch<BlockDetailResponse>(`/blockchain/block/${id}`);
  return { ...data, block: normalizeBlock(data.block ?? {}) };
}

export interface TransactionsResponse {
  transactions: Record<string, unknown>[];
  count: number;
  source: string;
}

export async function getTransactions(limit = 20): Promise<TransactionsResponse> {
  const data = await apiFetch<TransactionsResponse>(`/blockchain/transactions?limit=${limit}`);
  return { ...data, transactions: (data.transactions ?? []).map(normalizeTransaction) };
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
