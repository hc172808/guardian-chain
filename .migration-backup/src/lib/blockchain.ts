// Blockchain types and utilities
import { TOKENOMICS } from '@/config/wallets';

// Mining reward formulas based on algorithm and hash rate
// RandomX (CPU): 1 KH/s = 0.00032077 GYDS/day, 0.00962324 GYDS/month
// kHeavyHash (GPU): 1000 GH/s = 0.00000298 GYDS/day, 0.0000894 GYDS/month

export type MiningAlgorithm = 'randomx' | 'kheavyhash';

export const MINING_REWARDS = {
  randomx: {
    name: 'RandomX',
    type: 'CPU' as const,
    // Per H/s per second reward rate
    rewardPerHashPerSecond: 0.00032077 / 1000 / 86400, // KH/s daily rate converted to H/s per second
    // Reference rates
    referenceRates: {
      hashRate: 1000, // H/s (1 KH/s)
      dailyReward: 0.00032077,
      monthlyReward: 0.00962324,
    },
    // At 1000 H/s
    lowHashRates: {
      hashRate: 1000, // H/s
      dailyReward: 3.2e-7, // 0.00000032
      monthlyReward: 0.00000962,
    },
  },
  kheavyhash: {
    name: 'kHeavyHash',
    type: 'GPU' as const,
    // Per GH/s per second reward rate
    rewardPerHashPerSecond: 0.00000298 / 1000 / 86400, // 1000 GH/s daily rate converted to 1 GH/s per second
    // Reference rates (at 1000 GH/s = 1 TH/s)
    referenceRates: {
      hashRate: 1000e9, // 1000 GH/s
      dailyReward: 0.00000298,
      monthlyReward: 0.0000894,
    },
  },
};

// Calculate mining reward based on algorithm, hash rate, and time
export const calculateMiningReward = (
  algorithm: MiningAlgorithm,
  hashRate: number, // H/s for RandomX, GH/s for kHeavyHash
  durationSeconds: number,
  humanScore: number = 100
): number => {
  const config = MINING_REWARDS[algorithm];
  const humanMultiplier = Math.max(0.1, humanScore / 100);
  
  if (algorithm === 'randomx') {
    // hashRate is in H/s
    const dailyRate = (hashRate / 1000) * config.referenceRates.dailyReward;
    const perSecondRate = dailyRate / 86400;
    return perSecondRate * durationSeconds * humanMultiplier;
  } else {
    // hashRate is in GH/s
    const dailyRate = (hashRate / 1000) * config.referenceRates.dailyReward;
    const perSecondRate = dailyRate / 86400;
    return perSecondRate * durationSeconds * humanMultiplier;
  }
};

// Estimate earnings for display
export const estimateMiningEarnings = (
  algorithm: MiningAlgorithm,
  hashRate: number, // H/s for RandomX, GH/s for kHeavyHash
  humanScore: number = 100
): { daily: number; monthly: number; yearly: number } => {
  const humanMultiplier = Math.max(0.1, humanScore / 100);
  const config = MINING_REWARDS[algorithm];
  
  let dailyReward: number;
  if (algorithm === 'randomx') {
    // hashRate in H/s, reference is 1000 H/s = 1 KH/s
    dailyReward = (hashRate / 1000) * config.referenceRates.dailyReward;
  } else {
    // hashRate in GH/s, reference is 1000 GH/s
    dailyReward = (hashRate / 1000) * config.referenceRates.dailyReward;
  }
  
  return {
    daily: dailyReward * humanMultiplier,
    monthly: dailyReward * 30 * humanMultiplier,
    yearly: dailyReward * 365 * humanMultiplier,
  };
};

export interface Block {
  height: number;
  hash: string;
  previousHash: string;
  timestamp: number;
  transactions: Transaction[];
  validator: string;
  validatorStake: number;
  miningRewards: MiningReward[];
  signature: string;
  finalized: boolean;
}

export interface Transaction {
  id: string;
  from: string;
  to: string;
  amount: number;
  fee: number;
  nonce: number;
  timestamp: number;
  status: 'pending' | 'confirmed' | 'failed';
}

export interface Validator {
  address: string;
  stake: number;
  totalBlocks: number;
  uptime: number;
  isActive: boolean;
  joinedAt: number;
}

export interface Miner {
  address: string;
  hashRate: number;
  validShares: number;
  invalidShares: number;
  totalRewards: number;
  sessionCap: number;
  currentDifficulty: number;
  lastShareTime: number;
  isBanned: boolean;
  antiBot: AntiBotScore;
}

export interface MiningReward {
  minerId: string;
  shares: number;
  reward: number;
  difficulty: number;
}

export interface AntiBotScore {
  humanScore: number; // 0-100, 100 = definitely human
  behaviorScore: number;
  timingVariance: number;
  proofOfWork: boolean;
}

export interface MiningPool {
  id: string;
  name: string;
  totalHashRate: number;
  miners: number;
  fee: number;
  minPayout: number;
}

// Anti-bot formulas
export const ANTI_BOT_FORMULAS = {
  // Human behavior score based on timing variance
  humanScore: (timingVariance: number, avgInterval: number) => {
    // Bots have very consistent timing, humans don't
    const cv = timingVariance / avgInterval; // Coefficient of variation
    return Math.min(100, Math.max(0, cv * 200));
  },
  
  // Rate limiting: shares per minute allowed
  maxSharesPerMinute: (difficulty: number, humanScore: number) => {
    const baseRate = 60 / difficulty;
    const humanMultiplier = 0.5 + (humanScore / 200); // 0.5x to 1x based on human score
    return Math.floor(baseRate * humanMultiplier);
  },
  
  // Session reward cap (prevents farming)
  sessionRewardCap: (sessionDuration: number, baseReward: number) => {
    // Logarithmic scaling to prevent long sessions from being too profitable
    const hours = sessionDuration / 3600000;
    return baseReward * Math.log2(hours + 1) * 10;
  },
  
  // Per-address daily cap
  dailyAddressCap: (totalNetworkReward: number, addressCount: number) => {
    return (totalNetworkReward * 0.1) / Math.max(1, Math.log2(addressCount));
  },
};

// Difficulty adjustment formulas
export const DIFFICULTY_FORMULAS = {
  // Target block time: 120 seconds (2 minutes)
  TARGET_BLOCK_TIME: 120000,
  
  // Minimum share interval in ms (rate limiting)
  MIN_SHARE_INTERVAL: 5000, // 5 seconds minimum between shares
  
  // Adjust difficulty based on actual vs target time
  adjustDifficulty: (currentDiff: number, actualTime: number, targetTime: number) => {
    const ratio = targetTime / actualTime;
    const adjustment = Math.max(0.5, Math.min(2, ratio)); // Clamp between 0.5x and 2x
    return currentDiff * adjustment;
  },
  
  // Mining difficulty curve based on network hash rate
  networkDifficulty: (totalHashRate: number, targetSharesPerBlock: number) => {
    return (totalHashRate * 120) / targetSharesPerBlock; // 120s block time
  },
  
  // Individual miner difficulty (prevents speed abuse)
  minerDifficulty: (baseNetworkDiff: number, minerHashRate: number, avgHashRate: number) => {
    const ratio = minerHashRate / avgHashRate;
    if (ratio > 1.5) {
      // More aggressive penalty for fast miners
      return baseNetworkDiff * Math.pow(ratio, 2);
    }
    return baseNetworkDiff;
  },
  
  // Check if share submission is rate limited
  isRateLimited: (lastShareTime: number) => {
    return Date.now() - lastShareTime < 5000; // 5 second minimum
  },
};

// Generate random hash
export const generateHash = (): string => {
  const chars = '0123456789abcdef';
  return Array.from({ length: 64 }, () => chars[Math.floor(Math.random() * 16)]).join('');
};

// Generate random address
export const generateAddress = (): string => {
  return '0x' + generateHash().slice(0, 40);
};

// Format large numbers
export const formatNumber = (num: number): string => {
  if (num >= 1e12) return (num / 1e12).toFixed(2) + 'T';
  if (num >= 1e9) return (num / 1e9).toFixed(2) + 'B';
  if (num >= 1e6) return (num / 1e6).toFixed(2) + 'M';
  if (num >= 1e3) return (num / 1e3).toFixed(2) + 'K';
  return num.toFixed(2);
};

// Format hash rate
export const formatHashRate = (hashRate: number): string => {
  if (hashRate >= 1e15) return (hashRate / 1e15).toFixed(2) + ' PH/s';
  if (hashRate >= 1e12) return (hashRate / 1e12).toFixed(2) + ' TH/s';
  if (hashRate >= 1e9) return (hashRate / 1e9).toFixed(2) + ' GH/s';
  if (hashRate >= 1e6) return (hashRate / 1e6).toFixed(2) + ' MH/s';
  if (hashRate >= 1e3) return (hashRate / 1e3).toFixed(2) + ' KH/s';
  return hashRate.toFixed(2) + ' H/s';
};

// Generate mock data
export const generateMockBlocks = (count: number): Block[] => {
  const blocks: Block[] = [];
  let previousHash = '0'.repeat(64);
  
  for (let i = 0; i < count; i++) {
    const hash = generateHash();
    blocks.push({
      height: i,
      hash,
      previousHash,
      timestamp: Date.now() - (count - i) * 10000,
      transactions: Array.from({ length: Math.floor(Math.random() * 20) + 1 }, () => ({
        id: generateHash().slice(0, 16),
        from: generateAddress(),
        to: generateAddress(),
        amount: Math.random() * 1000,
        fee: Math.random() * 0.01,
        nonce: Math.floor(Math.random() * 1000),
        timestamp: Date.now(),
        status: 'confirmed' as const,
      })),
      validator: generateAddress(),
      validatorStake: Math.random() * 100000 + 10000,
      miningRewards: Array.from({ length: Math.floor(Math.random() * 5) + 1 }, () => ({
        minerId: generateAddress(),
        shares: Math.floor(Math.random() * 100),
        reward: Math.random() * 10,
        difficulty: Math.random() * 1000000,
      })),
      signature: generateHash(),
      finalized: i < count - 3,
    });
    previousHash = hash;
  }
  
  return blocks;
};

export const generateMockValidators = (count: number): Validator[] => {
  return Array.from({ length: count }, () => ({
    address: generateAddress(),
    stake: Math.random() * 100000 + 5000,
    totalBlocks: Math.floor(Math.random() * 1000),
    uptime: 95 + Math.random() * 5,
    isActive: Math.random() > 0.1,
    joinedAt: Date.now() - Math.random() * 86400000 * 365,
  }));
};

export const generateMockMiners = (count: number): Miner[] => {
  return Array.from({ length: count }, () => ({
    address: generateAddress(),
    hashRate: Math.random() * 1e9,
    validShares: Math.floor(Math.random() * 10000),
    invalidShares: Math.floor(Math.random() * 100),
    totalRewards: Math.random() * 1000,
    sessionCap: 100,
    currentDifficulty: Math.random() * 1e6,
    lastShareTime: Date.now() - Math.random() * 60000,
    isBanned: Math.random() < 0.02,
    antiBot: {
      humanScore: Math.random() * 100,
      behaviorScore: Math.random() * 100,
      timingVariance: Math.random() * 500,
      proofOfWork: Math.random() > 0.1,
    },
  }));
};

export const generateMockPools = (count: number): MiningPool[] => {
  const poolNames = ['NeonPool', 'CyberMine', 'QuantumHash', 'ChainForge', 'BitStorm'];
  return Array.from({ length: count }, (_, i) => ({
    id: generateHash().slice(0, 8),
    name: poolNames[i % poolNames.length],
    totalHashRate: Math.random() * 1e12,
    miners: Math.floor(Math.random() * 1000) + 10,
    fee: Math.random() * 2 + 0.5,
    minPayout: Math.random() * 10 + 1,
  }));
};
