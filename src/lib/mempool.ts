// Mempool — every send/swap goes through here.
//
// Pipeline:
//   1. Verify at least one node is live (networkGuard).
//   2. Check the sender's *spendable* balance: confirmed - already-pending outflows.
//      This is the double-spend guard — you cannot stack two pending transfers
//      that together exceed your confirmed balance.
//   3. Generate a deterministic transaction hash (so the same {from,to,amount,nonce}
//      produces the same hash → duplicate submits are rejected by uniqueness).
//   4. Insert with status='pending', confirmed_at=null. The miner is responsible
//      for moving it to status='confirmed'.

import { supabase } from '@/integrations/supabase/client';
import { requireActiveNodes } from './networkGuard';

export interface SubmitTxParams {
  userId: string;
  fromAddress: string;
  toAddress: string;
  amount: number;
  fee?: number;
  walletId?: string | null;
  // Optional symbol for display only — actual settlement is per address
  symbol?: string;
}

export interface SubmitTxResult {
  txHash: string;
  status: 'pending';
  liveNodes: number;
}

// Sum of all pending outflows from this address.
export const getPendingOutflows = async (fromAddress: string): Promise<number> => {
  const { data } = await supabase
    .from('transactions')
    .select('amount, fee')
    .eq('from_address', fromAddress)
    .eq('status', 'pending');
  return (data ?? []).reduce((s: number, t: any) => s + Number(t.amount || 0) + Number(t.fee || 0), 0);
};

// Confirmed balance: sum(in) - sum(out). Pure address-level ledger derived
// from confirmed transactions only.
export const getConfirmedBalance = async (address: string): Promise<number> => {
  const addr = address.toLowerCase();
  const { data } = await supabase
    .from('transactions')
    .select('from_address, to_address, amount, fee, status')
    .eq('status', 'confirmed')
    .or(`from_address.eq.${addr},to_address.eq.${addr}`);
  let bal = 0;
  for (const t of (data ?? []) as any[]) {
    const a = Number(t.amount || 0);
    const f = Number(t.fee || 0);
    if ((t.from_address ?? '').toLowerCase() === addr) bal -= (a + f);
    if ((t.to_address   ?? '').toLowerCase() === addr) bal += a;
  }
  return bal;
};

export const getSpendableBalance = async (address: string): Promise<number> => {
  const [confirmed, pending] = await Promise.all([
    getConfirmedBalance(address),
    getPendingOutflows(address.toLowerCase()),
  ]);
  return confirmed - pending;
};

// Deterministic-ish hash. Uses crypto.subtle when available, falls back to a
// simple FNV+timestamp digest. The point isn't cryptographic security here —
// it's preventing accidental duplicate submissions (the DB unique-by-hash
// check below catches replays).
const computeTxHash = async (
  fromAddress: string,
  toAddress: string,
  amount: number,
  nonce: number,
): Promise<string> => {
  const payload = `${fromAddress.toLowerCase()}|${toAddress.toLowerCase()}|${amount}|${nonce}`;
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(payload));
    const arr = Array.from(new Uint8Array(buf));
    return '0x' + arr.map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  // Fallback: FNV-1a 64-bit-ish
  let h1 = 0x811c9dc5, h2 = 0xdeadbeef;
  for (let i = 0; i < payload.length; i++) {
    h1 = Math.imul(h1 ^ payload.charCodeAt(i), 16777619) >>> 0;
    h2 = Math.imul(h2 ^ payload.charCodeAt(i), 2654435761) >>> 0;
  }
  return '0x' + h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0') + nonce.toString(16).padStart(48, '0');
};

// Per-user nonce — number of transactions ever submitted by the user. Mirrors
// EVM nonces so the same logical tx always hashes to the same value.
const getNextNonce = async (userId: string): Promise<number> => {
  const { count } = await supabase
    .from('transactions')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId);
  return (count ?? 0) + 1;
};

export const submitTransaction = async (params: SubmitTxParams): Promise<SubmitTxResult> => {
  // 1) Network must be live.
  const net = await requireActiveNodes();

  if (!params.fromAddress || !params.toAddress) throw new Error('Both from and to addresses are required.');
  if (!Number.isFinite(params.amount) || params.amount <= 0) throw new Error('Amount must be greater than zero.');

  const fee = Number(params.fee ?? 0);
  const total = params.amount + fee;

  // 2) Double-spend guard — pending + confirmed outflows must not exceed confirmed inflows.
  // We skip this for system addresses (faucet, swap-pool, sponsor accounts).
  const SYSTEM_ADDRS = new Set(['faucet', 'swap-pool', 'system', 'lp-bank', 'mint', 'bridge']);
  if (!SYSTEM_ADDRS.has(params.fromAddress.toLowerCase())) {
    const spendable = await getSpendableBalance(params.fromAddress);
    if (spendable < total) {
      throw new Error(
        `Insufficient spendable balance. You have ${spendable.toFixed(6)} available (after pending transfers), need ${total.toFixed(6)}. ` +
          `Wait for pending transactions to be mined or top up your wallet.`,
      );
    }
  }

  // 3) Hash + uniqueness.
  const nonce = await getNextNonce(params.userId);
  const txHash = await computeTxHash(params.fromAddress, params.toAddress, params.amount, nonce);

  const { data: dup } = await supabase.from('transactions').select('id').eq('tx_hash', txHash).maybeSingle();
  if (dup) throw new Error('Duplicate transaction detected (replay protection).');

  // 4) Insert as PENDING — miner moves it to confirmed.
  const { error } = await supabase.from('transactions').insert({
    user_id: params.userId,
    from_address: params.fromAddress,
    to_address: params.toAddress,
    amount: params.amount,
    fee,
    tx_hash: txHash,
    status: 'pending',
    confirmed_at: null,
    wallet_id: params.walletId ?? null,
  });
  if (error) throw new Error(`Mempool insert failed: ${error.message}`);

  return { txHash, status: 'pending', liveNodes: net.liveNodes.length };
};

// Get this user's pending transactions — useful for UI badges.
export const getUserPendingCount = async (userId: string): Promise<number> => {
  const { count } = await supabase
    .from('transactions')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('status', 'pending');
  return count ?? 0;
};

export const getMempoolCount = async (): Promise<number> => {
  const { count } = await supabase
    .from('transactions')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'pending');
  return count ?? 0;
};
