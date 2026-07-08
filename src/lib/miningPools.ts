// Mining pools — solo + group, fully admin-configurable.
import { api } from '@/lib/api';

export type PoolType = 'solo' | 'group';
export type PayoutScheme = 'PPS' | 'PPLNS';

export interface MiningPool {
  id: string;
  name: string;
  type: PoolType;
  fee_pct: number;
  min_payout_gyds: number;
  payout_scheme: PayoutScheme;
  enabled: boolean;
  max_members: number;
  description?: string;
  created_at: string;
}

export interface PoolMembership { pool_id: string; user_id: string; joined_at: string; }
export interface PoolStats { members: number; total_shares: number; total_rewards: number; blocks_found: number; }
export interface UserPayoutLedger { pool_id: string; accrued_gyds: number; paid_gyds: number; last_payout_at: string | null; }

const POOLS_KEY = 'mining_pools';
const memberKey = (userId: string) => `mining_pool_member_${userId}`;
const statsKey  = (poolId: string) => `mining_pool_stats_${poolId}`;
const payoutKey = (userId: string) => `mining_pool_payout_${userId}`;

const getConfig = async (key: string) => {
  try { const r = await api.get(`/api/config/${key}`); return r?.config_value ?? null; } catch { return null; }
};
const setConfig = async (key: string, value: unknown) => {
  try { await api.post('/api/config', { key, value }); } catch {}
};

const defaultPools = (): MiningPool[] => [
  { id: 'solo', name: 'Solo Mining', type: 'solo', fee_pct: 0, min_payout_gyds: 0, payout_scheme: 'PPS', enabled: true, max_members: 0, description: 'Mine independently — 100% of the block reward goes to you.', created_at: new Date().toISOString() },
  { id: 'group-alpha', name: 'Pool Alpha', type: 'group', fee_pct: 2, min_payout_gyds: 10, payout_scheme: 'PPS', enabled: true, max_members: 100, description: 'Group mining pool — share rewards proportionally.', created_at: new Date().toISOString() },
];

export const loadPools = async (): Promise<MiningPool[]> => {
  const v = await getConfig(POOLS_KEY);
  return Array.isArray(v) ? v : defaultPools();
};

export const savePools = async (pools: MiningPool[], _userId?: string): Promise<void> => {
  await setConfig(POOLS_KEY, pools);
};

export const getUserMembership = async (userId: string): Promise<PoolMembership | null> => {
  const v = await getConfig(memberKey(userId));
  return v ? (v as PoolMembership) : null;
};

export const joinPool = async (userId: string, poolId: string): Promise<void> => {
  const pools = await loadPools();
  const pool = pools.find(p => p.id === poolId);
  if (!pool) throw new Error('Pool not found');
  if (!pool.enabled) throw new Error('Pool is disabled');
  if (pool.max_members > 0) {
    const stats = (await getConfig(statsKey(poolId))) as PoolStats | null;
    if (stats && stats.members >= pool.max_members) throw new Error('Pool is full');
  }
  const membership: PoolMembership = { pool_id: poolId, user_id: userId, joined_at: new Date().toISOString() };
  await setConfig(memberKey(userId), membership);
  const stats = ((await getConfig(statsKey(poolId))) ?? { members: 0, total_shares: 0, total_rewards: 0, blocks_found: 0 }) as PoolStats;
  await setConfig(statsKey(poolId), { ...stats, members: stats.members + 1 });
};

export const leavePool = async (userId: string): Promise<void> => {
  const membership = await getUserMembership(userId);
  if (!membership) return;
  await setConfig(memberKey(userId), null);
  const stats = ((await getConfig(statsKey(membership.pool_id))) ?? { members: 1, total_shares: 0, total_rewards: 0, blocks_found: 0 }) as PoolStats;
  await setConfig(statsKey(membership.pool_id), { ...stats, members: Math.max(0, stats.members - 1) });
};

export const getPoolStats = async (poolId: string): Promise<PoolStats> => {
  const v = await getConfig(statsKey(poolId));
  return (v as PoolStats) ?? { members: 0, total_shares: 0, total_rewards: 0, blocks_found: 0 };
};

export const getUserPayoutLedger = async (userId: string): Promise<UserPayoutLedger | null> => {
  const v = await getConfig(payoutKey(userId));
  return v ? (v as UserPayoutLedger) : null;
};

export const distributePoolReward = async (
  minerUserId: string,
  minerAddress: string,
  totalReward: number,
  blockHeight: number,
): Promise<void> => {
  const membership = await getUserMembership(minerUserId);
  const poolId = membership?.pool_id ?? 'solo';
  const pools = await loadPools();
  const pool = pools.find(p => p.id === poolId) ?? { fee_pct: 0, type: 'solo' as PoolType };
  const afterFee = totalReward * (1 - (pool.fee_pct ?? 0) / 100);

  if (pool.type === 'solo') {
    const ledger = (await getUserPayoutLedger(minerUserId)) ?? { pool_id: poolId, accrued_gyds: 0, paid_gyds: 0, last_payout_at: null };
    await setConfig(payoutKey(minerUserId), { ...ledger, pool_id: poolId, accrued_gyds: ledger.accrued_gyds + afterFee });
  } else {
    const stats = await getPoolStats(poolId);
    const perMember = stats.members > 0 ? afterFee / stats.members : afterFee;
    const ledger = (await getUserPayoutLedger(minerUserId)) ?? { pool_id: poolId, accrued_gyds: 0, paid_gyds: 0, last_payout_at: null };
    await setConfig(payoutKey(minerUserId), { ...ledger, pool_id: poolId, accrued_gyds: ledger.accrued_gyds + perMember });
  }

  const stats = await getPoolStats(poolId);
  await setConfig(statsKey(poolId), {
    ...stats,
    total_rewards: stats.total_rewards + totalReward,
    total_shares: stats.total_shares + 1,
    blocks_found: stats.blocks_found + 1,
  });

  try {
    await api.post('/api/token-operations', {
      operation_type: 'mint_gyds',
      amount: String(afterFee),
      wallet_address: minerAddress,
      tx_hash: `0xreward-${blockHeight}-${Date.now().toString(16)}`,
      status: 'confirmed',
    });
  } catch {}
};

export const listPools = async (): Promise<MiningPool[]> => loadPools();
export const getMembership = getUserMembership;
export const getUserPayout = getUserPayoutLedger;
