// Miner — picks pending transactions out of the mempool and confirms them.
import { api } from '@/lib/api';
import { requireActiveNodes } from './networkGuard';
import { distributePoolReward } from './miningPools';

const MAX_TX_PER_BLOCK = 250;
const BLOCK_REWARD_GYDS = 50;

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
  let h1 = 0x6a09e667 >>> 0;
  for (let i = 0; i < payload.length; i++) {
    h1 = Math.imul(h1 ^ payload.charCodeAt(i), 16777619) >>> 0;
  }
  return '0x' + Array.from({ length: 8 }, (_, i) => ((h1 + i * 0x9e3779b9) >>> 0).toString(16).padStart(8, '0')).join('');
};

const loadBlockReward = async (): Promise<number> => {
  try {
    const data = await api.get('/api/config/mining_block_reward');
    const v = Number((data?.config_value as any)?.amount);
    return Number.isFinite(v) && v > 0 ? v : BLOCK_REWARD_GYDS;
  } catch { return BLOCK_REWARD_GYDS; }
};

const loadLastHeight = async (): Promise<number> => {
  try {
    const data = await api.get('/api/config/mining_last_block');
    return Number((data?.config_value as any)?.height) || 0;
  } catch { return 0; }
};

const saveLastBlock = async (block: MinedBlock) => {
  await api.post('/api/config', { key: 'mining_last_block', value: block });
  try {
    const logRow = await api.get('/api/config/mining_block_log');
    const log = ((logRow?.config_value as any)?.blocks ?? []) as MinedBlock[];
    log.unshift(block);
    await api.post('/api/config', { key: 'mining_block_log', value: { blocks: log.slice(0, 50) } });
  } catch {}
};

const applyTxToBalances = (deltas: Map<string, number>, fromAddr: string, toAddr: string, amount: number, fee: number) => {
  const f = fromAddr.toLowerCase();
  const t = toAddr.toLowerCase();
  deltas.set(f, (deltas.get(f) ?? 0) - (amount + fee));
  deltas.set(t, (deltas.get(t) ?? 0) + amount);
};

export const mineBlock = async (minerUserId?: string, minerAddress?: string): Promise<MinedBlock> => {
  const net = await requireActiveNodes();
  const miner = minerUserId
    ? { user_id: minerUserId, address: minerAddress ?? `user:${minerUserId}` }
    : { user_id: net.liveNodes[0]?.user_id ?? null, address: `node:${net.liveNodes[0]?.id ?? 'unknown'}` };

  const transactionResponse = await api.get('/api/transactions');
  // The API returns a paginated object and camelCase aliases, while the
  // mining validator works with the legacy snake_case transaction shape.
  const allTxs = (Array.isArray(transactionResponse)
    ? transactionResponse
    : transactionResponse?.transactions ?? []
  ).map((tx: any) => ({
    ...tx,
    from_address: tx.from_address ?? tx.fromAddress ?? '',
    to_address: tx.to_address ?? tx.toAddress ?? '',
    tx_hash: tx.tx_hash ?? tx.txHash ?? '',
    created_at: tx.created_at ?? tx.createdAt ?? new Date(0).toISOString(),
  }));
  const pending = (allTxs ?? [])
    .filter((t: any) => t.status === 'pending')
    .sort((a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
    .slice(0, MAX_TX_PER_BLOCK);

  const confirmed: string[] = [];
  const rejected: { tx_hash: string; reason: string }[] = [];
  const inBlockDeltas = new Map<string, number>();
  const SYSTEM_ADDRS = new Set(['faucet', 'swap-pool', 'system', 'lp-bank', 'mint', 'bridge']);
  let totalFees = 0;
  const now = new Date().toISOString();

  for (const tx of pending as any[]) {
    try {
      const fromAddr = (tx.from_address ?? '').toLowerCase();
      if (!SYSTEM_ADDRS.has(fromAddr)) {
        const ledger = (allTxs ?? []).filter((t: any) =>
          t.status === 'confirmed' && (
            (t.from_address ?? '').toLowerCase() === fromAddr ||
            (t.to_address ?? '').toLowerCase() === fromAddr
          )
        );
        let bal = 0;
        for (const r of ledger) {
          const a = Number(r.amount || 0), f = Number(r.fee || 0);
          if ((r.from_address ?? '').toLowerCase() === fromAddr) bal -= (a + f);
          if ((r.to_address ?? '').toLowerCase() === fromAddr) bal += a;
        }
        bal += inBlockDeltas.get(fromAddr) ?? 0;
        const need = Number(tx.amount) + Number(tx.fee || 0);
        if (bal < need) {
          rejected.push({ tx_hash: tx.tx_hash, reason: `Insufficient balance (${bal.toFixed(6)} < ${need.toFixed(6)})` });
          await api.patch(`/api/transactions/${tx.id}`, { status: 'rejected' }).catch(() => {});
          continue;
        }
      }

      await api.patch(`/api/transactions/${tx.id}`, { status: 'confirmed', confirmed_at: now }).catch(() => {});
      applyTxToBalances(inBlockDeltas, tx.from_address, tx.to_address, Number(tx.amount), Number(tx.fee || 0));
      totalFees += Number(tx.fee || 0);
      confirmed.push(tx.tx_hash);
    } catch (e: any) {
      rejected.push({ tx_hash: tx.tx_hash, reason: e?.message ?? 'Validation failed' });
    }
  }

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
  await distributePoolReward(miner.user_id ?? '', miner.address, totalReward, height);
  return block;
};
