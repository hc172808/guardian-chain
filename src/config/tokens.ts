// GYDSchain Blockchain - Dual NATIVE Coin Configuration
// CRITICAL: Both GYDS and GYD are NATIVE COINS, not tokens!

export interface NativeCoinConfig {
  name: string;
  symbol: string;
  decimals: number;
  maxSupply: number;
  initialPrice: number;
  isPegged: boolean;
  pegValue?: number;
  description: string;
  isGasCoin: boolean;
  canUserHold: boolean;
}

export interface ChainConfig {
  chainId: number;
  chainName: string;
  gasCoin: NativeCoinConfig;
  stableCoin: NativeCoinConfig;
  rpcUrls: string[];
  blockExplorerUrls: string[];
  iconUrls?: string[];
  founderAddress?: string;
}

// GYDS - Native gas/staking coin
export const GYDS_COIN: NativeCoinConfig = {
  name: 'GYDSchain',
  symbol: 'GYDS',
  decimals: 18,
  maxSupply: 100_000_000_000,
  initialPrice: 0.0000001,
  isPegged: false,
  description: 'Native gas and staking coin - users never touch directly',
  isGasCoin: true,
  canUserHold: false,
};

// GYD - Native stablecoin for user transactions
export const GYD_COIN: NativeCoinConfig = {
  name: 'GYDchain',
  symbol: 'GYD',
  decimals: 6,
  maxSupply: Number.MAX_SAFE_INTEGER,
  initialPrice: 1.0,
  isPegged: true,
  pegValue: 1.0,
  description: 'Native stablecoin for user transactions - pegged to USD',
  isGasCoin: false,
  canUserHold: true,
};

// GUSD - Guardian Dollar, USD-pegged ecosystem stablecoin
export const GUSD_COIN: NativeCoinConfig = {
  name: 'Guardian Dollar',
  symbol: 'GUSD',
  decimals: 18,
  maxSupply: Number.MAX_SAFE_INTEGER,
  initialPrice: 1.0,
  isPegged: true,
  pegValue: 1.0,
  description: 'Stable Value. Trusted Everywhere. — reserve-backed stablecoin for payments, commerce, and DeFi across the GYDS ecosystem',
  isGasCoin: false,
  canUserHold: true,
};

export const GUSD_BRANDING = {
  tagline: 'Stable Value. Trusted Everywhere.',
  colors: {
    royalBlue: '#0A4FFF',
    navyBlue: '#082567',
    silver: '#C0C0C0',
    white: '#FFFFFF',
  },
  fonts: ['Inter', 'Montserrat', 'Poppins'],
};

// Legacy exports
export const GYDS_TOKEN = GYDS_COIN;
export const GYD_TOKEN = GYD_COIN;
export type TokenConfig = NativeCoinConfig;

// Chain configuration - using netlifegy.com endpoints
export const CHAIN_CONFIG: ChainConfig = {
  chainId: 13370,
  chainName: 'GYDSchain Mainnet',
  gasCoin: GYDS_COIN,
  stableCoin: GYD_COIN,
  rpcUrls: [
    'https://rpc.netlifegy.com',
    'https://rpc2.netlifegy.com',
    'https://rpc3.netlifegy.com',
    'http://localhost:8546',
    ...(import.meta.env.VITE_RPC_LAN ? [`http://${import.meta.env.VITE_RPC_LAN}:8546`] : []),
  ],
  blockExplorerUrls: ['https://explorer.netlifegy.com'],
  iconUrls: ['https://app.netlifegy.com/icon.png'],
};

// Native coin addresses (protocol-level, not contracts)
export const NATIVE_COIN_IDS = {
  GYDS: 0,
  GYD: 1,
  GUSD: 2,
  BURN: '0x000000000000000000000000000000000000dEaD',
};

export const TOKEN_ADDRESSES = {
  GYDS: '0x0000000000000000000000000000000000000000',
  GYD: '0x0000000000000000000000000000000000000001',
  GUSD: '0x0000000000000000000000000000000000000002',
  BURN: NATIVE_COIN_IDS.BURN,
};

// Economics for both native coins
export const COIN_ECONOMICS = {
  gyds: {
    blockReward: 100,
    halvingInterval: 2_100_000,
    targetBlockTime: 12,
    burnRateOnTransfer: 0.001,
    stakingAPY: 12,
    minGasPrice: 1000000000,
  },
  gyd: {
    mintFee: 0.001,
    burnFee: 0.001,
    collateralRatio: 1.0,
    minMintAmount: 1,
  },
  gusd: {
    mintFee: 0.001,
    burnFee: 0.001,
    collateralRatio: 1.0,
    minMintAmount: 1,
  },
};

export const TOKENOMICS = COIN_ECONOMICS;

// Environment configuration keys
export const ENV_CONFIG_KEYS = {
  RPC_ENDPOINT: 'GYDS_RPC_ENDPOINT',
  RPC_PORT: 'GYDS_RPC_PORT',
  WS_ENDPOINT: 'GYDS_WS_ENDPOINT',
  WS_PORT: 'GYDS_WS_PORT',
  NODE_TYPE: 'GYDS_NODE_TYPE',
  DATA_DIR: 'GYDS_DATA_DIR',
  STORAGE_SIZE_GB: 'GYDS_STORAGE_SIZE_GB',
  MAX_PEERS: 'GYDS_MAX_PEERS',
  MINING_ENABLED: 'GYDS_MINING_ENABLED',
  MINING_THREADS: 'GYDS_MINING_THREADS',
  MINING_WALLET: 'GYDS_MINING_WALLET',
  WG_PRIVATE_KEY: 'GYDS_WG_PRIVATE_KEY',
  WG_PUBLIC_KEY: 'GYDS_WG_PUBLIC_KEY',
  WG_SERVER_ENDPOINT: 'GYDS_WG_SERVER_ENDPOINT',
  WG_SERVER_PORT: 'GYDS_WG_SERVER_PORT',
  WG_ALLOWED_IPS: 'GYDS_WG_ALLOWED_IPS',
  GYD_PEGGED: 'GYDS_GYD_PEGGED',
  GYD_PRICE: 'GYDS_GYD_PRICE',
  GYDS_PRICE: 'GYDS_TOKEN_PRICE',
  API_PORT: 'GYDS_API_PORT',
  API_KEY: 'GYDS_API_KEY',
  ADMIN_WALLET: 'GYDS_ADMIN_WALLET',
  FOUNDER_WALLET: 'GYDS_FOUNDER_WALLET',
};

// Default environment values - using netlifegy.com
export const DEFAULT_ENV_VALUES = {
  [ENV_CONFIG_KEYS.RPC_ENDPOINT]: 'https://rpc.netlifegy.com',
  [ENV_CONFIG_KEYS.RPC_PORT]: '8545',
  [ENV_CONFIG_KEYS.WS_ENDPOINT]: 'wss://ws.netlifegy.com',
  [ENV_CONFIG_KEYS.WS_PORT]: '8546',
  [ENV_CONFIG_KEYS.NODE_TYPE]: 'litenode',
  [ENV_CONFIG_KEYS.DATA_DIR]: '$HOME/.gydschain',
  [ENV_CONFIG_KEYS.STORAGE_SIZE_GB]: '10',
  [ENV_CONFIG_KEYS.MAX_PEERS]: '50',
  [ENV_CONFIG_KEYS.MINING_ENABLED]: 'false',
  [ENV_CONFIG_KEYS.MINING_THREADS]: '2',
  [ENV_CONFIG_KEYS.WG_SERVER_ENDPOINT]: 'vpn.netlifegy.com',
  [ENV_CONFIG_KEYS.WG_SERVER_PORT]: '51820',
  [ENV_CONFIG_KEYS.WG_ALLOWED_IPS]: '10.0.0.0/24',
  [ENV_CONFIG_KEYS.GYD_PEGGED]: 'true',
  [ENV_CONFIG_KEYS.GYD_PRICE]: '1.0',
  [ENV_CONFIG_KEYS.API_PORT]: '3030',
};
