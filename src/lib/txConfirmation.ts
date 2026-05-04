// BC-7 — Pending → Confirmed via real RPC.
//
// All transaction inserts now go through `submitAndAwaitConfirmation`,
// which:
//   1. Inserts the tx with `status='pending'` (NOT 'confirmed' anymore).
//   2. Polls the node RPC (`eth_getTransactionReceipt`) every `pollMs`.
//   3. Flips the row to `status='confirmed'` (and stamps `confirmed_at`)
//      once a receipt is returned with `status: 0x1`.
//   4. Flips it to `status='failed'` if the receipt has `status: 0x0`,
//      or after `timeoutMs` of polling with no receipt.
//
// The function returns immediately with the inserted row so the UI can
// show a "pending" state right away. The promise resolved by `awaitFinal`
// settles when the tx reaches a terminal state.

import { supabase } from '@/integrations/supabase/client';
import { NETWORK_CONFIG } from '@/config/network';

export type TxStatus = 'pending' | 'confirmed' | 'failed';

export interface SubmitTxInput {
  user_id: string;
  from_address: string;
  to_address: string;
  amount: number;
  fee: number;
  tx_hash: string;
  wallet_id?: string | null;
  /** Override RPC endpoint (e.g. for active-network switching). */
  rpcEndpoint?: string;
  /** How often to poll for the receipt. Default 2s. */
  pollMs?: number;
  /** Hard timeout. Default 60s — after this we mark the tx `failed`. */
  timeoutMs?: number;
}

export interface SubmitTxResult {
  /** Inserted row (status will be `pending`). */
  insertedTxId: string;
  /** Resolves when the tx reaches a terminal state. */
  awaitFinal: Promise<TxStatus>;
}

async function rpcGetReceipt(endpoint: string, hash: string): Promise<{ status?: string } | null> {
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: Date.now(),
        method: 'eth_getTransactionReceipt',
        params: [hash],
      }),
    });
    if (!res.ok) return null;
    const json = await res.json();
    return json.result ?? null;
  } catch {
    return null;
  }
}

async function updateTxStatus(id: string, status: TxStatus) {
  const patch: Record<string, unknown> = { status };
  if (status === 'confirmed') patch.confirmed_at = new Date().toISOString();
  await supabase.from('transactions').update(patch).eq('id', id);
}

/**
 * Insert a transaction as `pending` and poll the node RPC until it confirms
 * or times out. Returns the inserted id immediately + a promise that
 * resolves with the terminal status.
 */
export async function submitAndAwaitConfirmation(
  input: SubmitTxInput,
): Promise<SubmitTxResult> {
  const {
    user_id,
    from_address,
    to_address,
    amount,
    fee,
    tx_hash,
    wallet_id = null,
    rpcEndpoint = NETWORK_CONFIG.rpcUrls.primary,
    pollMs = 2000,
    timeoutMs = 60_000,
  } = input;

  const { data, error } = await supabase
    .from('transactions')
    .insert({
      user_id,
      from_address,
      to_address,
      amount,
      fee,
      tx_hash,
      status: 'pending',
      wallet_id,
    })
    .select('id')
    .single();

  if (error || !data) {
    throw error ?? new Error('Failed to insert pending transaction');
  }

  const insertedTxId = data.id as string;

  const awaitFinal: Promise<TxStatus> = (async () => {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const receipt = await rpcGetReceipt(rpcEndpoint, tx_hash);
      if (receipt && typeof receipt.status === 'string') {
        const ok = receipt.status === '0x1' || receipt.status === '1';
        const final: TxStatus = ok ? 'confirmed' : 'failed';
        await updateTxStatus(insertedTxId, final);
        return final;
      }
      await new Promise((r) => setTimeout(r, pollMs));
    }
    // Timed out — mark failed so the UI doesn't show a permanent spinner.
    await updateTxStatus(insertedTxId, 'failed');
    return 'failed';
  })();

  // Don't let an unhandled rejection crash the page if the caller forgets to await.
  awaitFinal.catch((e) => console.error('[txConfirmation] poller error', e));

  return { insertedTxId, awaitFinal };
}

/** Reusable check used by UI gates: returns true once the tx is `confirmed`. */
export async function isTxConfirmed(id: string): Promise<boolean> {
  const { data } = await supabase
    .from('transactions')
    .select('status')
    .eq('id', id)
    .maybeSingle();
  return data?.status === 'confirmed';
}
