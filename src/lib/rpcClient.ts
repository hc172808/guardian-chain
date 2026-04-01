// RPC client for fetching blocks & transactions from the Go node's PostgreSQL-backed REST API

import { NETWORK_CONFIG } from '@/config/network';

const RPC_BASE = NETWORK_CONFIG.rpcUrl || 'http://localhost:8546';

export interface RPCBlock {
  height: number;
  hash: string;
  previous_hash: string;
  proposer_addr: string;
  tx_count: number;
  gas_used: number;
  gas_limit: number;
  data: string;
  timestamp: string;
}

export interface RPCTransaction {
  hash: string;
  block_hash: string;
  block_height: number;
  from_addr: string;
  to_addr: string;
  amount: string;
  fee: string;
  coin_type: string;
  tx_type: string;
  status: string;
  nonce: number;
  timestamp: string;
}

export async function fetchLatestBlocks(limit = 20): Promise<RPCBlock[]> {
  try {
    const res = await fetch(`${RPC_BASE}/blocks?limit=${limit}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    return json.blocks ?? [];
  } catch {
    console.warn('[rpc] fetchLatestBlocks failed, node may be offline');
    return [];
  }
}

export async function fetchLatestTransactions(limit = 20): Promise<RPCTransaction[]> {
  try {
    const res = await fetch(`${RPC_BASE}/transactions?limit=${limit}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    return json.transactions ?? [];
  } catch {
    console.warn('[rpc] fetchLatestTransactions failed, node may be offline');
    return [];
  }
}

export async function fetchDBHealth(): Promise<boolean> {
  try {
    const res = await fetch(`${RPC_BASE}/health/db`);
    return res.ok;
  } catch {
    return false;
  }
}
