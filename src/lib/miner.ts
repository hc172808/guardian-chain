// Miner — picks pending transactions out of the mempool and confirms them.
//
// Each call to mineBlock():
//   1. Verifies at least one node is online.
//   2. Pulls up to MAX_TX_PER_BLOCK pending transactions oldest-first.
//   3. Re-validates each one (a tx may have become invalid since submission
//      because another now-confirmed tx spent the same balance first).
//   4. Marks valid txs as confirmed.
//   5. Records a "block" in admin_config and credits the miner with the
//      block reward + collected fees, distributed via the active mining pool.
//
// This is intentionally driven by an explicit API call (button or interval)
// rather than a database trigger — keeps the logic visible & testable from
// the frontend while still enforcing all the rules.

import { supabase } from '@/integrations/supabase/client';
import { requireActiveNodes } from './networkGuard';
import { distributePoolReward } from './miningPools';

const MAX_TX_PER_BLOCK = 250;
const BLOCK_REWARD_GYDS = 50; // base reward; admin can override via admin_config.block_reward

export interface MinedBlock {
  height: number;
  hash: string;
  miner_address: string;
  miner_user_id: string | null;
  tx_count: number;
  fees: number;
  reward: number;
  timestamp: string;
  confirmed_tx_hashes: string[];
  rejected: { tx_hash: string; reason: string }[];
}

const blockHash = (height: number, timestamp: string, txHashes: string[]): string => {
  const payload = `${height}|${timestamp}|${txHashes.join(',')}`;
  // Lightweight hash; chain.go does the cryptographic version on the real node.
  let h1 = 0x6a09e667 >>> 0;
  for (let i = 0; i < payload.length; i++) {
    h1 = Math.imul(h1 ^ payload.charCodeAt(i), 16777619) >>> 0;
  }
  return '0x' + Array.from({ length: 8 }, (_, i) => ((h1 + i * 0x9e3779b9) >>> 0).toString(16).padStart(8, '0')).join('');
};

const loadBlockReward = async (): Promise<number> => {
  const { data } = await supabase
    .from('admin_config')
    .select('config_value')
    .eq('config_key', 'mining_block_reward')
    .maybeSingle();
  const v = Number((data?.config_value as any)?.amount);
  return Number.isFinite(v) && v > 0 ? v : BLOCK_REWARD_GYDS;
};

const loadLastHeight = async (): Promise<number> => {
  const { data } = await supabase
    .from('admin_config')
    .select('config_value')
    .eq('config_key', 'mining_last_block')
    .maybeSingle();
  return Number((data?.config_value as any)?.height) || 0;
};

const saveLastBlock = async (block: MinedBlock) => {
  await supabase.from('admin_config').upsert(
    { config_key: 'mining_last_block', config_value: block as any, updated_by: null },
    { onConflict: 'config_key' },
  );
  // Append to the rolling block log (last 50 only, to keep the row small).
  const { data: logRow } = await supabase
    .from('admin_config')
    .select('config_value')
    .eq('config_key', 'mining_block_log')
    .maybeSingle();
  const log = ((logRow?.config_value as any)?.blocks ?? []) as MinedBlock[];
  log.unshift(block);
  await supabase.from('admin_config').upsert(
    { config_key: 'mining_block_log', config_value: { blocks: log.slice(0, 50) } as any, updated_by: null },
    { onConflict: 'config_key' },
  );
};

// Re-derive an address's confirmed balance INCLUDING txs confirmed earlier in
// THIS block. Map of running deltas during a single mining pass.
const applyTxToBalances = (deltas: Map<string, number>, fromAddr: string, toAddr: string, amount: number, fee: number) => {
  const f = fromAddr.toLowerCase();
  const t = toAddr.toLowerCase();
  deltas.set(f, (deltas.get(f) ?? 0) - (amount + fee));
  deltas.set(t, (deltas.get(t) ?? 0) + amount);
};

export const mineBlock = async (minerUserId?: string, minerAddress?: string): Promise<MinedBlock> => {
  // 1) Network must be live — the miner itself counts.
  const net = await requireActiveNodes();
  const miner = minerUserId
    ? { user_id: minerUserId, address: minerAddress ?? `user:${minerUserId}` }
    : { user_id: net.liveNodes[0].user_id, address: `node:${net.liveNodes[0].id}` };

  // 2) Pull pending txs oldest first.
  const { data: pending, error: pErr } = await supabase
    .from('transactions')
    .select('id, user_id, from_address, to_address, amount, fee, tx_hash, status, created_at')
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(MAX_TX_PER_BLOCK);
  if (pErr) throw new Error(`Failed to read mempool: ${pErr.message}`);

  const confirmed: string[] = [];
  const rejected: { tx_hash: string; reason: string }[] = [];
  const inBlockDeltas = new Map<string, number>();

  // System addresses are not balance-checked.
  const SYSTEM_ADDRS = new Set(['faucet', 'swap-pool', 'system', 'lp-bank', 'mint', 'bridge']);

  let totalFees = 0;
  const now = new Date().toISOString();

  for (const tx of (pending ?? []) as any[]) {
    try {
      const fromAddr = (tx.from_address ?? '').toLowerCase();
      if (!SYSTEM_ADDRS.has(fromAddr)) {
        // Confirmed balance + this-block deltas applied so far
        const { data: ledger } = await supabase
          .from('transactions')
          .select('from_address, to_address, amount, fee')
          .eq('status', 'confirmed')
          .or(`from_address.eq.${fromAddr},to_address.eq.${fromAddr}`);
        let bal = 0;
        for (const r of (ledger ?? []) as any[]) {
          const a = Number(r.amount || 0), f = Number(r.fee || 0);
          if ((r.from_address ?? '').toLowerCase() === fromAddr) bal -= (a + f);
          if ((r.to_address   ?? '').toLowerCase() === fromAddr) bal += a;
        }
        bal += inBlockDeltas.get(fromAddr) ?? 0;

        const need = Number(tx.amount) + Number(tx.fee || 0);
        if (bal < need) {
          rejected.push({ tx_hash: tx.tx_hash, reason: `Insufficient balance at mining time (${bal.toFixed(6)} < ${need.toFixed(6)})` });
          await supabase.from('transactions').update({ status: 'rejected' }).eq('id', tx.id);
          continue;
        }
      }

      await supabase
        .from('transactions')
        .update({ status: 'confirmed', confirmed_at: now })
        .eq('id', tx.id)
        .eq('status', 'pending'); // optimistic lock — only confirm if still pending

      applyTxToBalances(inBlockDeltas, tx.from_address, tx.to_address, Number(tx.amount), Number(tx.fee || 0));
      totalFees += Number(tx.fee || 0);
      confirmed.push(tx.tx_hash);
    } catch (e: any) {
      rejected.push({ tx_hash: tx.tx_hash, reason: e?.message ?? 'Validation failed' });
    }
  }

  // 3) Reward + block record (always emit a block, even if empty — proves the
  // miner is alive and earns the base reward).
  const baseReward = await loadBlockReward();
  const totalReward = baseReward + totalFees;
  const height = (await loadLastHeight()) + 1;
  const hash = blockHash(height, now, confirmed);

  const block: MinedBlock = {
    height, hash,
    miner_address: miner.address,
    miner_user_id: miner.user_id,
    tx_count: confirmed.length,
    fees: totalFees,
    reward: totalReward,
    timestamp: now,
    confirmed_tx_hashes: confirmed,
    rejected,
  };

  await saveLastBlock(block);
  await distributePoolReward(miner.user_id, miner.address, totalReward, height);

  return block;
};
