// Mining pools — solo + group, fully admin-configurable.
//
// Storage (all in admin_config so no schema migration is needed):
//   - 'mining_pools'                 → MiningPool[]
//   - `mining_pool_member_<userId>`  → { pool_id, joined_at }
//   - `mining_pool_stats_<poolId>`   → aggregate stats {members, total_shares, total_rewards}
//   - `mining_pool_payout_<userId>`  → { pool_id, accrued_gyds, paid_gyds, last_payout_at }
//
// Distribution: when a block is mined, its reward goes to the miner's pool.
// SOLO pool → 100% to the miner (minus pool fee, which for solo is 0 by default).
// GROUP pool → splits reward across all member miners by their share weight
// (PPS = each member who's mined ≥1 share gets a flat split; PPLNS = recent
// shares weighted; we implement PPS for now and store the chosen scheme so a
// future iteration can branch).

import { supabase } from '@/integrations/supabase/client';

export type PoolType = 'solo' | 'group';
export type PayoutScheme = 'PPS' | 'PPLNS';

export interface MiningPool {
  id: string;
  name: string;
  type: PoolType;
  fee_pct: number;          // 0..100
  min_payout_gyds: number;
  payout_scheme: PayoutScheme;
  enabled: boolean;
  max_members: number;      // 0 = unlimited
  description?: string;
  created_at: string;
}

export interface PoolMembership {
  pool_id: string;
  user_id: string;
  joined_at: string;
}

export interface PoolStats {
  members: number;
  total_shares: number;
  total_rewards: number;
  blocks_found: number;
}

export interface UserPayoutLedger {
  pool_id: string;
  accrued_gyds: number;
  paid_gyds: number;
  last_payout_at: string | null;
}

const POOLS_KEY = 'mining_pools';

export const DEFAULT_POOLS: MiningPool[] = [
  {
    id: 'solo-default',
    name: 'Solo Mining',
    type: 'solo',
    fee_pct: 0,
    min_payout_gyds: 1,
    payout_scheme: 'PPS',
    enabled: true,
    max_members: 0,
    description: 'Mine alone. You keep 100% of every block you find.',
    created_at: new Date().toISOString(),
  },
  {
    id: 'group-community',
    name: 'Community Pool',
    type: 'group',
    fee_pct: 1,
    min_payout_gyds: 10,
    payout_scheme: 'PPS',
    enabled: true,
    max_members: 0,
    description: 'Pool resources with other miners for steady, predictable rewards.',
    created_at: new Date().toISOString(),
  },
];

// ── CRUD ────────────────────────────────────────────────────────────────────

export const listPools = async (): Promise<MiningPool[]> => {
  const { data } = await supabase
    .from('admin_config')
    .select('config_value')
    .eq('config_key', POOLS_KEY)
    .maybeSingle();
  const pools = (data?.config_value as any)?.pools as MiningPool[] | undefined;
  if (!pools || !pools.length) return DEFAULT_POOLS;
  return pools;
};

export const savePools = async (pools: MiningPool[], updatedBy?: string) => {
  await supabase.from('admin_config').upsert(
    { config_key: POOLS_KEY, config_value: { pools } as any, updated_by: updatedBy ?? null },
    { onConflict: 'config_key' },
  );
};

export const upsertPool = async (pool: MiningPool, updatedBy?: string) => {
  const pools = await listPools();
  const idx = pools.findIndex((p) => p.id === pool.id);
  if (idx >= 0) pools[idx] = pool;
  else pools.push(pool);
  await savePools(pools, updatedBy);
};

export const deletePool = async (poolId: string, updatedBy?: string) => {
  const pools = (await listPools()).filter((p) => p.id !== poolId);
  await savePools(pools, updatedBy);
};

// ── Membership ──────────────────────────────────────────────────────────────

const memberKey = (userId: string) => `mining_pool_member_${userId}`;
const statsKey  = (poolId: string) => `mining_pool_stats_${poolId}`;
const payoutKey = (userId: string) => `mining_pool_payout_${userId}`;

export const getMembership = async (userId: string): Promise<PoolMembership | null> => {
  const { data } = await supabase
    .from('admin_config')
    .select('config_value')
    .eq('config_key', memberKey(userId))
    .maybeSingle();
  const v = data?.config_value as any;
  if (!v?.pool_id) return null;
  return { pool_id: v.pool_id, user_id: userId, joined_at: v.joined_at };
};

export const joinPool = async (userId: string, poolId: string): Promise<void> => {
  const pools = await listPools();
  const pool = pools.find((p) => p.id === poolId);
  if (!pool) throw new Error('Pool not found.');
  if (!pool.enabled) throw new Error('This pool is currently disabled.');

  if (pool.type === 'group' && pool.max_members > 0) {
    const stats = await getPoolStats(poolId);
    if (stats.members >= pool.max_members) throw new Error('Pool is full.');
  }

  const previous = await getMembership(userId);
  if (previous?.pool_id === poolId) return;
  if (previous) await leavePool(userId);

  await supabase.from('admin_config').upsert(
    {
      config_key: memberKey(userId),
      config_value: { pool_id: poolId, joined_at: new Date().toISOString() } as any,
      updated_by: userId,
    },
    { onConflict: 'config_key' },
  );

  const stats = await getPoolStats(poolId);
  await writePoolStats(poolId, { ...stats, members: stats.members + 1 });
};

export const leavePool = async (userId: string): Promise<void> => {
  const m = await getMembership(userId);
  if (!m) return;
  await supabase.from('admin_config').delete().eq('config_key', memberKey(userId));
  const stats = await getPoolStats(m.pool_id);
  await writePoolStats(m.pool_id, { ...stats, members: Math.max(0, stats.members - 1) });
};

// ── Stats & payouts ─────────────────────────────────────────────────────────

export const getPoolStats = async (poolId: string): Promise<PoolStats> => {
  const { data } = await supabase
    .from('admin_config')
    .select('config_value')
    .eq('config_key', statsKey(poolId))
    .maybeSingle();
  const v = (data?.config_value as any) ?? {};
  return {
    members:       Number(v.members)       || 0,
    total_shares:  Number(v.total_shares)  || 0,
    total_rewards: Number(v.total_rewards) || 0,
    blocks_found:  Number(v.blocks_found)  || 0,
  };
};

const writePoolStats = (poolId: string, stats: PoolStats) =>
  supabase.from('admin_config').upsert(
    { config_key: statsKey(poolId), config_value: stats as any, updated_by: null },
    { onConflict: 'config_key' },
  );

export const getUserPayout = async (userId: string): Promise<UserPayoutLedger | null> => {
  const { data } = await supabase
    .from('admin_config')
    .select('config_value')
    .eq('config_key', payoutKey(userId))
    .maybeSingle();
  const v = data?.config_value as any;
  return v ?? null;
};

const writeUserPayout = (userId: string, ledger: UserPayoutLedger) =>
  supabase.from('admin_config').upsert(
    { config_key: payoutKey(userId), config_value: ledger as any, updated_by: userId },
    { onConflict: 'config_key' },
  );

// Find every userId that's a member of `poolId` by scanning member_* keys.
const listPoolMembers = async (poolId: string): Promise<string[]> => {
  const { data } = await supabase
    .from('admin_config')
    .select('config_key, config_value')
    .like('config_key', 'mining_pool_member_%');
  const out: string[] = [];
  for (const row of (data ?? []) as any[]) {
    if (row.config_value?.pool_id === poolId) {
      out.push(row.config_key.replace('mining_pool_member_', ''));
    }
  }
  return out;
};

// Called by the miner after each successful block.
export const distributePoolReward = async (
  minerUserId: string | null,
  _minerAddress: string,
  totalReward: number,
  blockHeight: number,
): Promise<void> => {
  if (!minerUserId || totalReward <= 0) return;

  const membership = await getMembership(minerUserId);
  const pools = await listPools();
  // Default to solo if no membership.
  const pool = pools.find((p) => p.id === membership?.pool_id) ?? pools.find((p) => p.type === 'solo') ?? DEFAULT_POOLS[0];

  const fee = (totalReward * (pool.fee_pct || 0)) / 100;
  const distributable = Math.max(0, totalReward - fee);

  // Update pool stats.
  const stats = await getPoolStats(pool.id);
  await writePoolStats(pool.id, {
    ...stats,
    total_rewards: stats.total_rewards + totalReward,
    blocks_found: stats.blocks_found + 1,
    total_shares: stats.total_shares + 1,
  });

  if (pool.type === 'solo') {
    await creditUser(minerUserId, pool.id, distributable, blockHeight);
    return;
  }

  // GROUP: split distributable across all members.
  const members = await listPoolMembers(pool.id);
  if (members.length === 0) {
    await creditUser(minerUserId, pool.id, distributable, blockHeight);
    return;
  }
  const share = distributable / members.length;
  for (const uid of members) {
    await creditUser(uid, pool.id, share, blockHeight);
  }
};

const creditUser = async (userId: string, poolId: string, gyds: number, blockHeight: number) => {
  const prev = await getUserPayout(userId);
  const ledger: UserPayoutLedger = {
    pool_id: poolId,
    accrued_gyds: (prev?.accrued_gyds ?? 0) + gyds,
    paid_gyds:    prev?.paid_gyds ?? 0,
    last_payout_at: new Date().toISOString(),
  };
  await writeUserPayout(userId, ledger);

  // Record the payout as a token_operations 'mint' so it shows up in the
  // user's normal balance accounting (same pattern faucet uses).
  await supabase.from('token_operations').insert({
    operation_type: 'mint',
    wallet_address: `user:${userId}`,
    amount: gyds,
    tx_hash: `0xblock${blockHeight.toString(16).padStart(8, '0')}-${userId.slice(0, 8)}`,
    status: 'confirmed',
    created_by: userId,
    usdt_amount: 0,
  });
};
