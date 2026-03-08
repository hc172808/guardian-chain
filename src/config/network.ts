// GYDS Blockchain Network Configuration
// Compatible with Trust Wallet, MetaMask, and EIP-3085 standard

import { GENESIS_CONFIG, TOKENOMICS } from './wallets';

// All RPC endpoints — main + backups + local
export const RPC_ENDPOINTS_LIST = {
  main: 'https://rpc.netlifegy.com',
  backups: [
    'https://rpc2.netlifegy.com',
    'https://rpc3.netlifegy.com',
  ],
  local: [
    'https://localhost:8546',
    'https://192.168.18.106:8546',
  ],
};

// All endpoints flattened for failover
export const ALL_RPC_ENDPOINTS = [
  RPC_ENDPOINTS_LIST.main,
  ...RPC_ENDPOINTS_LIST.backups,
  ...RPC_ENDPOINTS_LIST.local,
];

// Main network configuration for wallet integration
export const NETWORK_CONFIG = {
  chainId: 13370,
  chainIdHex: '0x343A',
  chainName: 'GYDS Network',
  nativeCurrency: {
    name: TOKENOMICS.name,
    symbol: TOKENOMICS.symbol,
    decimals: TOKENOMICS.decimals,
  },
  rpcUrls: {
    primary: RPC_ENDPOINTS_LIST.main,
    backup: RPC_ENDPOINTS_LIST.backups,
    local: RPC_ENDPOINTS_LIST.local,
  },
  blockExplorerUrls: ['https://explorer.netlifegy.com'],
  iconUrls: ['https://netlifegy.com/icon.png'],
};

// Testnet configuration
export const TESTNET_CONFIG = {
  chainId: 13371,
  chainIdHex: '0x343B',
  chainName: 'GYDS Testnet',
  nativeCurrency: {
    name: 'Test GYDS',
    symbol: 'tGYDS',
    decimals: 18,
  },
  rpcUrls: {
    primary: 'https://testnet-rpc.netlifegy.com',
    local: 'http://localhost:8547',
  },
  blockExplorerUrls: ['https://testnet-explorer.netlifegy.com'],
};

// Service endpoints
export const SERVICE_ENDPOINTS = {
  rpc: 'https://rpc.netlifegy.com',
  rpc2: 'https://rpc2.netlifegy.com',
  rpc3: 'https://rpc3.netlifegy.com',
  ws: 'wss://ws.netlifegy.com',
  explorer: 'https://explorer.netlifegy.com',
  vpn: 'vpn.netlifegy.com',
  testnetRpc: 'https://testnet-rpc.netlifegy.com',
};

// EIP-3085 compatible network parameters for wallet_addEthereumChain
export const getNetworkParams = (isTestnet = false) => {
  const config = isTestnet ? TESTNET_CONFIG : NETWORK_CONFIG;
  
  const rpcUrls = [config.rpcUrls.primary];
  if ('backup' in config.rpcUrls && Array.isArray(config.rpcUrls.backup)) {
    rpcUrls.push(...config.rpcUrls.backup);
  }
  
  return {
    chainId: config.chainIdHex,
    chainName: config.chainName,
    nativeCurrency: config.nativeCurrency,
    rpcUrls,
    blockExplorerUrls: config.blockExplorerUrls,
    iconUrls: 'iconUrls' in config ? config.iconUrls : [],
  };
};

// Trust Wallet specific configuration
export const TRUST_WALLET_CONFIG = {
  chainId: NETWORK_CONFIG.chainId,
  name: NETWORK_CONFIG.chainName,
  symbol: TOKENOMICS.symbol,
  decimals: TOKENOMICS.decimals,
  rpcUrl: NETWORK_CONFIG.rpcUrls.primary,
  blockExplorerUrl: NETWORK_CONFIG.blockExplorerUrls[0],
};

// RPC configuration for connecting to full nodes
export const RPC_CONFIG = {
  fullNodeUrl: NETWORK_CONFIG.rpcUrls.primary,
  backupUrls: RPC_ENDPOINTS_LIST.backups,
  localUrls: RPC_ENDPOINTS_LIST.local,
  wsUrl: 'wss://ws.netlifegy.com/ws',
  timeout: 30000,
  retryAttempts: 3,
  retryDelay: 1000,
};

// RPC endpoint configuration for the Go backend
export const RPC_ENDPOINTS = {
  methods: {
    'eth_chainId': 'Returns the chain ID',
    'net_version': 'Returns the network ID',
    'eth_protocolVersion': 'Returns the protocol version',
    'net_listening': 'Returns true if actively listening',
    'net_peerCount': 'Returns number of peers',
    'eth_blockNumber': 'Returns latest block number',
    'eth_getBlockByNumber': 'Returns block by number',
    'eth_getBlockByHash': 'Returns block by hash',
    'eth_getBalance': 'Returns account balance',
    'eth_getTransactionCount': 'Returns account nonce',
    'eth_getCode': 'Returns code at address',
    'eth_getStorageAt': 'Returns storage at position',
    'eth_sendRawTransaction': 'Submits signed transaction',
    'eth_getTransactionByHash': 'Returns transaction by hash',
    'eth_getTransactionReceipt': 'Returns transaction receipt',
    'eth_estimateGas': 'Estimates gas for transaction',
    'eth_gasPrice': 'Returns current gas price',
    'eth_call': 'Executes call without creating transaction',
    'eth_subscribe': 'Subscribe to events',
    'eth_unsubscribe': 'Unsubscribe from events',
  },
  miningMethods: {
    'gyds_getMiningWork': 'Get current mining work',
    'gyds_submitShare': 'Submit mining share',
    'gyds_getMiningStats': 'Get miner statistics',
    'gyds_getPoolInfo': 'Get pool information',
  },
  validatorMethods: {
    'gyds_getValidators': 'Get validator list',
    'gyds_getValidatorInfo': 'Get validator details',
    'gyds_stake': 'Stake tokens',
    'gyds_unstake': 'Unstake tokens',
  },
};

// Gas configuration
export const GAS_CONFIG = {
  baseFeePerGas: 1000000000,
  maxPriorityFeePerGas: 1500000000,
  gasLimits: {
    transfer: 21000,
    tokenTransfer: 65000,
    contractDeploy: 3000000,
    contractCall: 100000,
  },
};

// Check if an Ethereum provider (MetaMask, Trust Wallet) is available
export const hasEthereumProvider = (): boolean => {
  return typeof window !== 'undefined' && !!window.ethereum;
};

// Helper to add network to wallet (MetaMask, Trust Wallet, etc.)
export const addNetworkToWallet = async (isTestnet = false): Promise<boolean> => {
  if (!hasEthereumProvider()) {
    throw new Error(
      'No Ethereum wallet detected. Please install MetaMask or Trust Wallet first, then refresh this page. ' +
      'You can also add the network manually using the details below.'
    );
  }

  const params = getNetworkParams(isTestnet);
  
  try {
    await window.ethereum!.request({
      method: 'wallet_addEthereumChain',
      params: [params],
    });
    return true;
  } catch (error: any) {
    if (error.code === 4001) {
      throw new Error('User rejected the request');
    }
    throw error;
  }
};

// Helper to switch to GYDS network
export const switchToNetwork = async (isTestnet = false): Promise<boolean> => {
  if (!hasEthereumProvider()) {
    throw new Error(
      'No Ethereum wallet detected. Install MetaMask or Trust Wallet, then refresh this page.'
    );
  }

  const chainIdHex = isTestnet ? TESTNET_CONFIG.chainIdHex : NETWORK_CONFIG.chainIdHex;
  
  try {
    await window.ethereum!.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: chainIdHex }],
    });
    return true;
  } catch (error: any) {
    if (error.code === 4902) {
      return addNetworkToWallet(isTestnet);
    }
    throw error;
  }
};

// Check if currently on GYDS network
export const isOnGYDSNetwork = async (): Promise<boolean> => {
  if (!hasEthereumProvider()) {
    return false;
  }
  
  try {
    const chainId = await window.ethereum!.request({ method: 'eth_chainId' });
    return chainId === NETWORK_CONFIG.chainIdHex || chainId === TESTNET_CONFIG.chainIdHex;
  } catch {
    return false;
  }
};

// Ethereum window type extension
declare global {
  interface Window {
    ethereum?: {
      request: (args: { method: string; params?: any[] }) => Promise<any>;
      on: (event: string, callback: (...args: any[]) => void) => void;
      removeListener: (event: string, callback: (...args: any[]) => void) => void;
      isMetaMask?: boolean;
      isTrust?: boolean;
    };
  }
}
