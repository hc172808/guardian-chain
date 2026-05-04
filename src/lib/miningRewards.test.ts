import { describe, it, expect } from 'vitest';
import {
  distributeBlockReward,
  toAuditRows,
  MINING_POOL_WALLET,
  type MinerShare,
} from './miningRewards';

const A = '0x000000000000000000000000000000000000aaaa';
const B = '0x000000000000000000000000000000000000bbbb';
const C = '0x000000000000000000000000000000000000cccc';

const ONE_TOKEN = 10n ** 18n;

describe('distributeBlockReward — solo path', () => {
  it('credits the entire block reward to the single miner', () => {
    const r = distributeBlockReward({
      blockReward: ONE_TOKEN,
      poolFeeBps: 0,
      shares: [{ address: A, shareWeight: 1n }],
      blockHeight: 100,
      solo: true,
    });
    expect(r.credits).toHaveLength(1);
    expect(r.credits[0].toAddress).toBe(A);
    expect(r.credits[0].amount).toBe(ONE_TOKEN);
    expect(r.credits[0].kind).toBe('solo_reward');
    expect(r.poolFee).toBe(0n);
    expect(r.unallocated).toBe(0n);
  });

  it('rejects solo with multiple shares', () => {
    expect(() =>
      distributeBlockReward({
        blockReward: ONE_TOKEN,
        poolFeeBps: 0,
        shares: [
          { address: A, shareWeight: 1n },
          { address: B, shareWeight: 1n },
        ],
        blockHeight: 1,
        solo: true,
      }),
    ).toThrow(/solo/);
  });
});

describe('distributeBlockReward — pool path', () => {
  it('splits 50/50 with no fee', () => {
    const r = distributeBlockReward({
      blockReward: ONE_TOKEN,
      poolFeeBps: 0,
      shares: [
        { address: A, shareWeight: 1n },
        { address: B, shareWeight: 1n },
      ],
      blockHeight: 1,
      solo: false,
    });
    const a = r.credits.find((c) => c.toAddress === A)!;
    const b = r.credits.find((c) => c.toAddress === B)!;
    expect(a.amount).toBe(ONE_TOKEN / 2n);
    expect(b.amount).toBe(ONE_TOKEN / 2n);
    expect(r.poolFee).toBe(0n);
  });

  it('takes a 2 % pool fee', () => {
    const r = distributeBlockReward({
      blockReward: 1000n,
      poolFeeBps: 200, // 2 %
      shares: [{ address: A, shareWeight: 1n }],
      blockHeight: 1,
      solo: false,
    });
    expect(r.poolFee).toBe(20n);
    const minerCredit = r.credits.find((c) => c.kind === 'miner_reward')!;
    const poolCredit = r.credits.find((c) => c.kind === 'pool_fee')!;
    expect(minerCredit.amount).toBe(980n);
    expect(poolCredit.toAddress).toBe(MINING_POOL_WALLET);
    expect(poolCredit.amount).toBe(20n);
  });

  it('splits pro-rata by share weight', () => {
    const r = distributeBlockReward({
      blockReward: 10_000n,
      poolFeeBps: 0,
      shares: [
        { address: A, shareWeight: 70n },
        { address: B, shareWeight: 20n },
        { address: C, shareWeight: 10n },
      ],
      blockHeight: 1,
      solo: false,
    });
    expect(r.credits.find((c) => c.toAddress === A)!.amount).toBe(7000n);
    expect(r.credits.find((c) => c.toAddress === B)!.amount).toBe(2000n);
    expect(r.credits.find((c) => c.toAddress === C)!.amount).toBe(1000n);
  });

  it('sweeps integer-division dust into the pool fee — no silent drops', () => {
    // 10 / 3 = 3.33… → integer math gives 3 each = 9, leaves 1 dust
    const r = distributeBlockReward({
      blockReward: 10n,
      poolFeeBps: 0,
      shares: [
        { address: A, shareWeight: 1n },
        { address: B, shareWeight: 1n },
        { address: C, shareWeight: 1n },
      ],
      blockHeight: 1,
      solo: false,
    });
    const sum = r.credits.reduce((acc, c) => acc + c.amount, 0n);
    expect(sum).toBe(10n);
    const dustRow = r.credits.find((c) => c.kind === 'pool_fee');
    expect(dustRow).toBeDefined();
    expect(dustRow!.amount).toBe(1n);
    expect(dustRow!.toAddress).toBe(MINING_POOL_WALLET);
  });

  it('preserves invariant across many random splits (property test)', () => {
    // Deterministic LCG so the test is reproducible
    let seed = 0x12345;
    const rand = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed;
    };
    for (let trial = 0; trial < 50; trial++) {
      const n = 2 + (rand() % 8);
      const shares: MinerShare[] = Array.from({ length: n }, (_, i) => ({
        address: `0x${(i + 0x1000).toString(16).padStart(40, '0')}`,
        shareWeight: BigInt(1 + (rand() % 1000)),
      }));
      const reward = BigInt(1_000_000 + (rand() % 1_000_000_000));
      const fee = rand() % 1000; // 0–10 %
      const r = distributeBlockReward({
        blockReward: reward,
        poolFeeBps: fee,
        shares,
        blockHeight: trial,
        solo: false,
      });
      const sum = r.credits.reduce((acc, c) => acc + c.amount, 0n);
      expect(sum).toBe(reward);
      expect(r.unallocated).toBe(0n);
    }
  });
});

describe('distributeBlockReward — input validation', () => {
  it('rejects empty share lists', () => {
    expect(() =>
      distributeBlockReward({
        blockReward: 1n,
        poolFeeBps: 0,
        shares: [],
        blockHeight: 1,
        solo: false,
      }),
    ).toThrow(/no eligible miners/);
  });

  it('rejects negative or zero block reward', () => {
    expect(() =>
      distributeBlockReward({
        blockReward: 0n,
        poolFeeBps: 0,
        shares: [{ address: A, shareWeight: 1n }],
        blockHeight: 1,
        solo: true,
      }),
    ).toThrow();
  });

  it('rejects poolFeeBps out of range', () => {
    expect(() =>
      distributeBlockReward({
        blockReward: 1n,
        poolFeeBps: 10001,
        shares: [{ address: A, shareWeight: 1n }],
        blockHeight: 1,
        solo: false,
      }),
    ).toThrow();
  });

  it('rejects malformed addresses', () => {
    expect(() =>
      distributeBlockReward({
        blockReward: 1n,
        poolFeeBps: 0,
        shares: [{ address: 'not-an-address', shareWeight: 1n }],
        blockHeight: 1,
        solo: true,
      }),
    ).toThrow(/invalid address/);
  });

  it('rejects zero or negative share weight', () => {
    expect(() =>
      distributeBlockReward({
        blockReward: 100n,
        poolFeeBps: 0,
        shares: [{ address: A, shareWeight: 0n }],
        blockHeight: 1,
        solo: false,
      }),
    ).toThrow(/weight/);
  });
});

describe('toAuditRows', () => {
  it('flattens credits to insert-shaped audit rows', () => {
    const r = distributeBlockReward({
      blockReward: 1000n,
      poolFeeBps: 100,
      shares: [{ address: A, shareWeight: 1n }],
      blockHeight: 42,
      solo: false,
    });
    const rows = toAuditRows(r);
    expect(rows[0].block_height).toBe(42);
    expect(rows[0].from_address).toBe(MINING_POOL_WALLET);
    expect(rows[0].amount).toBe('990');
    expect(rows[1].kind).toBe('pool_fee');
    expect(rows[1].amount).toBe('10');
  });
});
