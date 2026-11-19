// Public recipient addresses are configured on the server at deployment.
// Only non-address metadata belongs in the client bundle.

export const GENESIS_CONFIG = {
  // Genesis block configuration
  timestamp: new Date('2024-01-01T00:00:00Z').getTime() / 1000,
  chainId: 198282, // Updated to unique GYDS chain ID
  initialSupply: 3_000_000_000, // 3 billion GYDS
  initialPrice: 0.0000001, // Starting price in USD
};

export const RESERVED_WALLET_METADATA = {
  founder: {
    name: 'Founder Wallet',
    allocation: 300_000_000, // 10% of total supply
    vestingMonths: 48,
    description: 'Founder allocation with 48-month vesting',
  },
  miningPool: {
    name: 'Mining Pool',
    allocation: 1_200_000_000, // 40% of total supply
    description: 'Mining rewards distribution pool',
  },
  liquidityPool: {
    name: 'Liquidity Pool',
    allocation: 600_000_000, // 20% of total supply
    description: 'DEX liquidity provision',
  },
  stakingRewards: {
    name: 'Staking Rewards',
    allocation: 450_000_000, // 15% of total supply
    description: 'PoS validator staking rewards',
  },
  developmentFund: {
    name: 'Development Fund',
    allocation: 300_000_000, // 10% of total supply
    vestingMonths: 24,
    description: 'Development and ecosystem growth',
  },
  team: {
    name: 'Team Wallet',
    allocation: 150_000_000, // 5% of total supply
    vestingMonths: 36,
    description: 'Team allocation with 36-month vesting',
  },
};

export const BURN_ADDRESS = '0x000000000000000000000000000000000000dEaD';

// Token economics
export const TOKENOMICS = {
  name: 'GYDS',
  symbol: 'GYDS',
  decimals: 18,
  maxSupply: 3_000_000_000,
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

