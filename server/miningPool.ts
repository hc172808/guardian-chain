/**
 * GYDS Mining Pool — self-contained pool server used by /api/mining/rpc.
 * Handles: mining_connect, mining_getWork, mining_getStats,
 *          mining_submitShare, mining_getPoolInfo, mining_disconnect
 *
 * No external node needed — the pool manages difficulty, jobs, and
 * reward accounting internally. Miners submit SHA-256 PoW shares;
 * accepted shares are credited to the miner's wallet via token_operations.
 */
import crypto from 'crypto';
import { pool as pgPool } from './db';

// ── Config ────────────────────────────────────────────────────────────────────
const POOL_NAME        = 'GYDS Mining Pool';
const POOL_FEE         = 0.01;          // 1% pool fee
const BASE_DIFFICULTY  = 1_000_000;     // Starting difficulty
const REWARD_PER_SHARE = 0.001;         // GYDS per valid share
const JOB_TTL_MS       = 120_000;       // New job every 120 s (GYDS block time)
const SESSION_TTL_MS   = 10 * 60_000;  // Drop inactive sessions after 10 min
const MAX_SESSIONS     = 1000;

// ── Types ─────────────────────────────────────────────────────────────────────
export interface MiningJob {
  jobId: string;
  prevBlockHash: string;
  target: string;       // 64-char hex (256-bit) — hash must be < this
  difficulty: number;
  blockHeight: number;
  createdAt: number;
}

interface MinerSession {
  sessionId: string;
  minerAddress: string;
  workerName: string;
  connectedAt: number;
  lastSeen: number;
  validShares: number;
  rejectedShares: number;
  totalReward: number;
  hashRate: number;       // last reported H/s (informational)
}

// ── State ─────────────────────────────────────────────────────────────────────
const sessions = new Map<string, MinerSession>();
let currentJob: MiningJob | null = null;
let blockHeight = 1000; // synthetic block height

function sha256(s: string): string {
  return crypto.createHash('sha256').update(s).digest('hex');
}

function makeTarget(difficulty: number): string {
  // target = 2^256 / difficulty  (64-char hex string)
  // We compute it as a padded hex by dividing MAX_UINT256.
  // Approximation: shift bits right by log2(difficulty).
  const bits = Math.min(255, Math.max(0, Math.floor(Math.log2(difficulty))));
  const leadingZeros = Math.floor(bits / 4);
  return '0'.repeat(leadingZeros) + 'f'.repeat(64 - leadingZeros);
}

function newJob(): MiningJob {
  blockHeight++;
  return {
    jobId: crypto.randomUUID(),
    prevBlockHash: sha256(String(blockHeight) + Date.now()),
    target: makeTarget(BASE_DIFFICULTY),
    difficulty: BASE_DIFFICULTY,
    blockHeight,
    createdAt: Date.now(),
  };
}

// Refresh job periodically
function refreshJobIfStale() {
  if (!currentJob || Date.now() - currentJob.createdAt > JOB_TTL_MS) {
    currentJob = newJob();
  }
}

// Prune inactive sessions
function pruneSessions() {
  const now = Date.now();
  for (const [id, s] of sessions) {
    if (now - s.lastSeen > SESSION_TTL_MS) sessions.delete(id);
  }
  // Hard cap
  if (sessions.size > MAX_SESSIONS) {
    const oldest = [...sessions.entries()]
      .sort((a, b) => a[1].lastSeen - b[1].lastSeen)
      .slice(0, sessions.size - MAX_SESSIONS);
    for (const [id] of oldest) sessions.delete(id);
  }
}

// Credit reward to miner's wallet via DB
async function creditReward(minerAddress: string, amount: number): Promise<void> {
  try {
    const txHash = '0x' + crypto.randomBytes(32).toString('hex');
    await pgPool.query(
      `INSERT INTO token_operations (id, operation_type, amount, wallet_address, tx_hash, status, created_by, usdt_amount, created_at, updated_at)
       VALUES (gen_random_uuid(), 'mining_reward', $1, $2, $3, 'confirmed', NULL, 0, NOW(), NOW())`,
      [amount, minerAddress.toLowerCase(), txHash]
    );
  } catch {
    // Non-fatal — reward still credited in session memory
  }
}

// ── Public API ─────────────────────────────────────────────────────────────────
export function handleMiningRpc(method: string, params: any): {
  result?: any;
  error?: { code: number; message: string };
  asyncFn?: () => Promise<{ result?: any; error?: { code: number; message: string } }>;
} {
  refreshJobIfStale();
  pruneSessions();

  switch (method) {
    // ── mining_connect ──────────────────────────────────────────────────────
    case 'mining_connect': {
      const rawAddress = String(params?.minerAddress ?? '').trim();
      const minerAddress = rawAddress.toLowerCase();
      const workerName = String(params?.workerName ?? 'worker').trim().slice(0, 64);
      if (!minerAddress || minerAddress.length < 4) {
        return { error: { code: -32602, message: 'Invalid minerAddress — must be a non-empty wallet address or user ID.' } };
      }
      const sessionId = crypto.randomUUID();
      sessions.set(sessionId, {
        sessionId,
        minerAddress,
        workerName,
        connectedAt: Date.now(),
        lastSeen: Date.now(),
        validShares: 0,
        rejectedShares: 0,
        totalReward: 0,
        hashRate: 0,
      });
      return {
        result: {
          sessionId,
          poolName: POOL_NAME,
          difficulty: currentJob!.difficulty,
          target: currentJob!.target,
          fee: POOL_FEE,
          chainId: 198282,
          network: 'GYDS Mainnet',
        },
      };
    }

    // ── mining_getWork ──────────────────────────────────────────────────────
    case 'mining_getWork': {
      const sessionId = String(params?.sessionId ?? '');
      const session = sessions.get(sessionId);
      if (!session) return { error: { code: -32600, message: 'Unknown session — call mining_connect first.' } };
      session.lastSeen = Date.now();
      return {
        result: {
          jobId: currentJob!.jobId,
          prevBlockHash: currentJob!.prevBlockHash,
          target: currentJob!.target,
          difficulty: currentJob!.difficulty,
          blockHeight: currentJob!.blockHeight,
          timestamp: Math.floor(Date.now() / 1000),
        },
      };
    }

    // ── mining_submitShare ──────────────────────────────────────────────────
    case 'mining_submitShare': {
      const { sessionId, jobId, nonce, hash } = params ?? {};
      const session = sessions.get(String(sessionId ?? ''));
      if (!session) return { error: { code: -32600, message: 'Unknown session.' } };
      session.lastSeen = Date.now();

      // Job must still be current
      if (!currentJob || currentJob.jobId !== jobId) {
        session.rejectedShares++;
        return { result: { accepted: false, message: 'Stale job — fetch new work.' } };
      }

      // Verify the hash
      const expectedHash = sha256(`${currentJob.prevBlockHash}${session.minerAddress}${nonce}`);
      if (expectedHash !== hash) {
        session.rejectedShares++;
        return { result: { accepted: false, message: 'Hash mismatch.' } };
      }

      // Check hash < target
      const hashBig = BigInt('0x' + hash);
      const targetBig = BigInt('0x' + currentJob.target);
      if (hashBig >= targetBig) {
        session.rejectedShares++;
        return { result: { accepted: false, message: 'Hash does not meet target difficulty.' } };
      }

      const netReward = REWARD_PER_SHARE * (1 - POOL_FEE);
      session.validShares++;
      session.totalReward += netReward;

      return {
        result: { accepted: true, reward: netReward.toFixed(6) },
        asyncFn: () => creditReward(session.minerAddress, netReward).then(() => ({
          result: { accepted: true, reward: netReward.toFixed(6) },
        })),
      };
    }

    // ── mining_getStats ─────────────────────────────────────────────────────
    case 'mining_getStats': {
      const sessionId = String(params?.sessionId ?? '');
      const session = sessions.get(sessionId);
      if (!session) return { error: { code: -32600, message: 'Unknown session.' } };
      session.lastSeen = Date.now();
      return {
        result: {
          minerAddress: session.minerAddress,
          workerName: session.workerName,
          validShares: session.validShares,
          rejectedShares: session.rejectedShares,
          totalReward: session.totalReward,
          uptime: Math.floor((Date.now() - session.connectedAt) / 1000),
          poolFee: POOL_FEE,
          currentBlockHeight: currentJob?.blockHeight ?? 0,
          currentDifficulty: currentJob?.difficulty ?? BASE_DIFFICULTY,
        },
      };
    }

    // ── mining_getPoolInfo ──────────────────────────────────────────────────
    case 'mining_getPoolInfo': {
      const activeCount = [...sessions.values()].filter(s => Date.now() - s.lastSeen < 60_000).length;
      const totalShares = [...sessions.values()].reduce((s, m) => s + m.validShares, 0);
      return {
        result: {
          name: POOL_NAME,
          chainId: 198282,
          network: 'GYDS Mainnet',
          fee: POOL_FEE,
          minPayout: 0.01,
          difficulty: currentJob?.difficulty ?? BASE_DIFFICULTY,
          blockHeight: currentJob?.blockHeight ?? 0,
          activeMiners: activeCount,
          totalShares,
          rewardPerShare: REWARD_PER_SHARE,
          algorithm: 'SHA-256',
          blockTime: 120,
        },
      };
    }

    // ── mining_disconnect ───────────────────────────────────────────────────
    case 'mining_disconnect': {
      const sessionId = String(params?.sessionId ?? '');
      sessions.delete(sessionId);
      return { result: { ok: true } };
    }

    default:
      return { error: { code: -32601, message: `Method not found: ${method}` } };
  }
}

// Pool stats for the dashboard API
export function getPoolStats() {
  refreshJobIfStale();
  pruneSessions();
  const active = [...sessions.values()].filter(s => Date.now() - s.lastSeen < 60_000);
  return {
    activeSessions: active.length,
    totalSessions: sessions.size,
    currentJob: currentJob ? {
      jobId: currentJob.jobId,
      blockHeight: currentJob.blockHeight,
      difficulty: currentJob.difficulty,
      ageMs: Date.now() - currentJob.createdAt,
    } : null,
    poolName: POOL_NAME,
    fee: POOL_FEE,
    rewardPerShare: REWARD_PER_SHARE,
  };
}
