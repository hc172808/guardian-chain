// Mining reward distribution — pure, deterministic, audit-friendly.
//
// MIN-2: All reward distribution writes go through this module so we have
// a single, tested code path that produces the `token_operations` rows
// (one per recipient) credited from the reserved `mining_pool` wallet.
//
// Constraints enforced here:
//   - No floating-point math for token amounts (we work in integer "units"
//     and only convert to display once at the boundary).
//   - The sum of all recipient credits + the pool fee MUST equal the block
//     reward exactly. Any rounding dust is sent to the pool (pool fee row),
//     never silently dropped.
//   - Solo submissions get 100 % of the post-fee reward.
//   - Pool submissions are split pro-rata by `shareWeight` (BigInt).
//   - Empty share lists are rejected — the caller must handle "no eligible
//     miners" before calling distribute().

/** Canonical mining-pool reserved wallet (see TOKENOMICS / wallets.ts). */
export const MINING_POOL_WALLET = '0x0000000000000000000000000000000000000002';

export interface MinerShare {
  /** Wallet address that submitted the share. Must be 0x + 40 hex. */
  address: string;
  /** Pro-rata weight; usually `validShareCount` × `difficulty`. BigInt to avoid float drift. */
  shareWeight: bigint;
}

export interface DistributeInput {
  /** Block reward in smallest token units (e.g. 1e18 wei-equivalent). */
  blockReward: bigint;
  /** Pool fee in basis points (1 bp = 0.01 %). 0 = solo, 100 = 1 %, 200 = 2 %, etc. Max 10000. */
  poolFeeBps: number;
  /** Submitting miners. */
  shares: MinerShare[];
  /** Block height the reward is for — used for audit trail only. */
  blockHeight: number;
  /** Set to `true` if this is a solo submission (single miner takes 100 %, no fee split). */
  solo: boolean;
}

export interface RewardCredit {
  /** Recipient wallet — either a miner address or the MINING_POOL_WALLET (for the fee). */
  toAddress: string;
  /** Amount in smallest token units. */
  amount: bigint;
  /** `pool_fee` for the operator share, `miner_reward` for miner shares. */
  kind: 'miner_reward' | 'pool_fee' | 'solo_reward';
  /** For audit only — share weight that produced this credit (0 for the pool fee). */
  weight: bigint;
}

export interface DistributionResult {
  blockHeight: number;
  fromAddress: string; // always MINING_POOL_WALLET — the source of funds
  totalReward: bigint;
  poolFee: bigint;
  credits: RewardCredit[];
  /** Always 0 after distribution — exposed so tests / audit can assert it. */
  unallocated: bigint;
}

const ADDR_RE = /^0x[0-9a-fA-F]{40}$/;

function assertValidAddress(addr: string, label: string) {
  if (!ADDR_RE.test(addr)) {
    throw new Error(`${label}: invalid address ${addr}`);
  }
}

/**
 * Deterministic, integer-only reward distribution.
 *
 * Returns the list of credits to insert as `token_operations` rows. The
 * caller is responsible for performing the inserts atomically (e.g. a
 * Postgres transaction) — this function does NOT touch the database so
 * it can be unit-tested without mocks.
 */
export function distributeBlockReward(input: DistributeInput): DistributionResult {
  const { blockReward, poolFeeBps, shares, blockHeight, solo } = input;

  if (blockReward <= 0n) throw new Error('blockReward must be > 0');
  if (!Number.isInteger(poolFeeBps) || poolFeeBps < 0 || poolFeeBps > 10000) {
    throw new Error('poolFeeBps must be an integer in [0, 10000]');
  }
  if (shares.length === 0) throw new Error('no eligible miners — refusing to distribute');
  if (!Number.isInteger(blockHeight) || blockHeight < 0) {
    throw new Error('blockHeight must be a non-negative integer');
  }

  for (const s of shares) {
    assertValidAddress(s.address, 'share.address');
    if (s.shareWeight <= 0n) throw new Error(`share weight must be > 0 (got ${s.shareWeight} for ${s.address})`);
  }

  // ── Solo path ────────────────────────────────────────────────────────────
  if (solo) {
    if (shares.length !== 1) {
      throw new Error('solo distribution requires exactly one share');
    }
    const winner = shares[0];
    return {
      blockHeight,
      fromAddress: MINING_POOL_WALLET,
      totalReward: blockReward,
      poolFee: 0n,
      unallocated: 0n,
      credits: [
        {
          toAddress: winner.address,
          amount: blockReward,
          kind: 'solo_reward',
          weight: winner.shareWeight,
        },
      ],
    };
  }

  // ── Pool path ────────────────────────────────────────────────────────────
  // Pool fee first, integer division → any rounding goes to remainder which
  // we then sweep into the pool fee at the end (operator gets the dust).
  const poolFee = (blockReward * BigInt(poolFeeBps)) / 10000n;
  const distributable = blockReward - poolFee;

  const totalWeight = shares.reduce((acc, s) => acc + s.shareWeight, 0n);

  // Initial pro-rata split using integer division.
  const credits: RewardCredit[] = shares.map((s) => ({
    toAddress: s.address,
    amount: (distributable * s.shareWeight) / totalWeight,
    kind: 'miner_reward',
    weight: s.shareWeight,
  }));

  // Calculate dust from integer division and add it to the pool fee so the
  // sum of credits exactly equals `blockReward` (no silent drops).
  const distributedToMiners = credits.reduce((acc, c) => acc + c.amount, 0n);
  const dust = distributable - distributedToMiners;
  const finalPoolFee = poolFee + dust;

  if (finalPoolFee > 0n) {
    credits.push({
      toAddress: MINING_POOL_WALLET,
      amount: finalPoolFee,
      kind: 'pool_fee',
      weight: 0n,
    });
  }

  const total = credits.reduce((acc, c) => acc + c.amount, 0n);
  if (total !== blockReward) {
    // Defensive: we always want this invariant to hold.
    throw new Error(`accounting bug: credits sum to ${total}, expected ${blockReward}`);
  }

  return {
    blockHeight,
    fromAddress: MINING_POOL_WALLET,
    totalReward: blockReward,
    poolFee: finalPoolFee,
    unallocated: 0n,
    credits,
  };
}

/** Convenience helper for the audit log — flattens to plain (string-amount) rows. */
export function toAuditRows(result: DistributionResult) {
  return result.credits.map((c) => ({
    block_height: result.blockHeight,
    from_address: result.fromAddress,
    to_address: c.toAddress,
    amount: c.amount.toString(),
    kind: c.kind,
    share_weight: c.weight.toString(),
  }));
}
