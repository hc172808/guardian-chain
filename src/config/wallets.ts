// GYDS Blockchain Wallet Configuration
// This file contains all reserved wallet addresses for the blockchain

export const GENESIS_CONFIG = {
  // Genesis block configuration
  timestamp: new Date('2024-01-01T00:00:00Z').getTime() / 1000,
  chainId: 1337,
  initialSupply: 100_000_000_000, // 100 billion GYDS
  initialPrice: 0.0000001, // Starting price in USD
};

export const RESERVED_WALLETS = {
  // Founder wallet - receives genesis block allocation
  founder: {
    address: '0x0000000000000000000000000000000000000001',
    name: 'Founder Wallet',
    allocation: 10_000_000_000, // 10% of total supply
    vestingMonths: 48,
    description: 'Founder allocation with 48-month vesting',
  },

  // Mining pool wallet - distributes mining rewards
  miningPool: {
    address: '0x0000000000000000000000000000000000000002',
    name: 'Mining Pool',
    allocation: 40_000_000_000, // 40% of total supply
    description: 'Mining rewards distribution pool',
  },

  // Liquidity pool wallet - DEX liquidity provision
  liquidityPool: {
    address: '0x0000000000000000000000000000000000000003',
    name: 'Liquidity Pool',
    allocation: 20_000_000_000, // 20% of total supply
    description: 'DEX liquidity provision',
  },

  // Staking rewards wallet
  stakingRewards: {
    address: '0x0000000000000000000000000000000000000004',
    name: 'Staking Rewards',
    allocation: 15_000_000_000, // 15% of total supply
    description: 'PoS validator staking rewards',
  },

  // Development fund wallet
  developmentFund: {
    address: '0x0000000000000000000000000000000000000005',
    name: 'Development Fund',
    allocation: 10_000_000_000, // 10% of total supply
    vestingMonths: 24,
    description: 'Development and ecosystem growth',
  },

  // Team wallet
  team: {
    address: '0x0000000000000000000000000000000000000006',
    name: 'Team Wallet',
    allocation: 5_000_000_000, // 5% of total supply
    vestingMonths: 36,
    description: 'Team allocation with 36-month vesting',
  },

  // Burn address - tokens sent here are permanently destroyed
  burn: {
    address: '0x000000000000000000000000000000000000dEaD',
    name: 'Burn Address',
    allocation: 0,
    description: 'Token burn address - permanently destroys tokens',
  },
};

// Token economics
export const TOKENOMICS = {
  name: 'GYDS',
  symbol: 'GYDS',
  decimals: 18,
  maxSupply: 100_000_000_000,
  initialPrice: 0.0000001,
  
  // Emission schedule
  blockReward: 100, // GYDS per block
  halvingInterval: 2_100_000, // Blocks until halving
  
  // Mining parameters
  targetBlockTime: 12, // seconds
  maxSharesPerMinute: 100,
  sessionRewardCap: 1000,
  dailyAddressCap: 10000,
  
  // Burn mechanics
  burnRateOnTransfer: 0.001, // 0.1% burn on each transfer
  burnForMint: true, // USDT burning enables GYDS minting
};

// Get all wallet addresses as an array
export const getAllWalletAddresses = () => {
  return Object.values(RESERVED_WALLETS).map(w => w.address);
};

// Check if an address is a reserved wallet
export const isReservedWallet = (address: string): boolean => {
  return getAllWalletAddresses().includes(address.toLowerCase());
};

// Get wallet info by address
export const getWalletByAddress = (address: string) => {
  return Object.values(RESERVED_WALLETS).find(
    w => w.address.toLowerCase() === address.toLowerCase()
  );
};
