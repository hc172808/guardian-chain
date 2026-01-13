// GYDS Blockchain Dual Token Configuration
// GYDSchain (GYDS) - Native utility token
// GYDchain (GYD) - Stablecoin pegged to USD

export interface TokenConfig {
  name: string;
  symbol: string;
  decimals: number;
  maxSupply: number;
  initialPrice: number;
  isPegged: boolean;
  pegValue?: number;
  description: string;
}

export interface ChainConfig {
  chainId: number;
  chainName: string;
  nativeCurrency: TokenConfig;
  stableCoin: TokenConfig;
  rpcUrls: string[];
  blockExplorerUrls: string[];
  iconUrls?: string[];
}

// GYDSchain - Native utility/governance token
export const GYDS_TOKEN: TokenConfig = {
  name: 'GYDSchain',
  symbol: 'GYDS',
  decimals: 18,
  maxSupply: 100_000_000_000, // 100 billion
  initialPrice: 0.0000001,
  isPegged: false,
  description: 'Native utility and governance token for the GYDS blockchain',
};

// GYDchain - USD-pegged stablecoin
export const GYD_TOKEN: TokenConfig = {
  name: 'GYDchain',
  symbol: 'GYD',
  decimals: 18,
  maxSupply: Number.MAX_SAFE_INTEGER, // No cap - minted based on collateral
  initialPrice: 1.0,
  isPegged: true,
  pegValue: 1.0, // 1 GYD = 1 USD
  description: 'USD-pegged stablecoin on the GYDS blockchain',
};

// Chain configuration for wallet integration
export const CHAIN_CONFIG: ChainConfig = {
  chainId: 13370,
  chainName: 'GYDSchain Mainnet',
  nativeCurrency: GYDS_TOKEN,
  stableCoin: GYD_TOKEN,
  rpcUrls: ['https://rpc.gydschain.io', 'http://localhost:8545'],
  blockExplorerUrls: ['https://explorer.gydschain.io'],
  iconUrls: ['https://gydschain.io/icon.png'],
};

// Token addresses (contract addresses on the chain)
export const TOKEN_ADDRESSES = {
  GYDS: '0x0000000000000000000000000000000000000000', // Native token (like ETH)
  GYD: '0x0000000000000000000000000000000000001000', // Stablecoin contract
  BURN: '0x000000000000000000000000000000000000dEaD',
};

// Tokenomics for both tokens
export const TOKENOMICS = {
  gyds: {
    blockReward: 100,
    halvingInterval: 2_100_000,
    targetBlockTime: 12,
    burnRateOnTransfer: 0.001, // 0.1%
    stakingAPY: 12, // 12% annual
  },
  gyd: {
    mintFee: 0.001, // 0.1% fee on minting
    burnFee: 0.001, // 0.1% fee on burning
    collateralRatio: 1.0, // 100% collateralized
  },
};

// Environment configuration keys (to be set by admin)
export const ENV_CONFIG_KEYS = {
  // RPC Configuration
  RPC_ENDPOINT: 'GYDS_RPC_ENDPOINT',
  RPC_PORT: 'GYDS_RPC_PORT',
  WS_ENDPOINT: 'GYDS_WS_ENDPOINT',
  WS_PORT: 'GYDS_WS_PORT',
  
  // Node Configuration
  NODE_TYPE: 'GYDS_NODE_TYPE',
  DATA_DIR: 'GYDS_DATA_DIR',
  STORAGE_SIZE_GB: 'GYDS_STORAGE_SIZE_GB',
  MAX_PEERS: 'GYDS_MAX_PEERS',
  
  // Mining Configuration
  MINING_ENABLED: 'GYDS_MINING_ENABLED',
  MINING_THREADS: 'GYDS_MINING_THREADS',
  MINING_WALLET: 'GYDS_MINING_WALLET',
  
  // WireGuard Configuration
  WG_PRIVATE_KEY: 'GYDS_WG_PRIVATE_KEY',
  WG_PUBLIC_KEY: 'GYDS_WG_PUBLIC_KEY',
  WG_SERVER_ENDPOINT: 'GYDS_WG_SERVER_ENDPOINT',
  WG_SERVER_PORT: 'GYDS_WG_SERVER_PORT',
  WG_ALLOWED_IPS: 'GYDS_WG_ALLOWED_IPS',
  
  // Token Configuration
  GYD_PEGGED: 'GYDS_GYD_PEGGED',
  GYD_PRICE: 'GYDS_GYD_PRICE',
  GYDS_PRICE: 'GYDS_TOKEN_PRICE',
  
  // API Configuration
  API_PORT: 'GYDS_API_PORT',
  API_KEY: 'GYDS_API_KEY',
  
  // Admin Configuration
  ADMIN_WALLET: 'GYDS_ADMIN_WALLET',
  FOUNDER_WALLET: 'GYDS_FOUNDER_WALLET',
};

// Default environment values
export const DEFAULT_ENV_VALUES = {
  [ENV_CONFIG_KEYS.RPC_ENDPOINT]: 'http://localhost',
  [ENV_CONFIG_KEYS.RPC_PORT]: '8545',
  [ENV_CONFIG_KEYS.WS_ENDPOINT]: 'ws://localhost',
  [ENV_CONFIG_KEYS.WS_PORT]: '8546',
  [ENV_CONFIG_KEYS.NODE_TYPE]: 'litenode',
  [ENV_CONFIG_KEYS.DATA_DIR]: '$HOME/.gydschain',
  [ENV_CONFIG_KEYS.STORAGE_SIZE_GB]: '10',
  [ENV_CONFIG_KEYS.MAX_PEERS]: '50',
  [ENV_CONFIG_KEYS.MINING_ENABLED]: 'false',
  [ENV_CONFIG_KEYS.MINING_THREADS]: '2',
  [ENV_CONFIG_KEYS.WG_SERVER_ENDPOINT]: 'vpn.gydschain.io',
  [ENV_CONFIG_KEYS.WG_SERVER_PORT]: '51820',
  [ENV_CONFIG_KEYS.WG_ALLOWED_IPS]: '10.0.0.0/24',
  [ENV_CONFIG_KEYS.GYD_PEGGED]: 'true',
  [ENV_CONFIG_KEYS.GYD_PRICE]: '1.0',
  [ENV_CONFIG_KEYS.API_PORT]: '3030',
};
