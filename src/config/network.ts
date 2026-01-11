// GYDS Blockchain Network Configuration
// Compatible with Trust Wallet, MetaMask, and EIP-3085 standard

import { GENESIS_CONFIG, TOKENOMICS } from './wallets';

// Main network configuration for wallet integration
export const NETWORK_CONFIG = {
  // Chain ID must be unique - using 13370 for GYDS mainnet
  // This avoids conflicts with common test networks
  chainId: 13370,
  chainIdHex: '0x343A', // 13370 in hex
  
  // Network name shown in wallets
  chainName: 'GYDS Network',
  
  // Native currency configuration (for Trust Wallet, MetaMask, etc.)
  nativeCurrency: {
    name: TOKENOMICS.name,
    symbol: TOKENOMICS.symbol,
    decimals: TOKENOMICS.decimals,
  },
  
  // RPC endpoints (update these with your actual server addresses)
  rpcUrls: {
    primary: 'https://rpc.gyds.network',
    backup: [
      'https://rpc2.gyds.network',
      'https://rpc3.gyds.network',
    ],
    local: 'http://localhost:8546',
  },
  
  // Block explorer URL
  blockExplorerUrls: ['https://explorer.gyds.network'],
  
  // Icon URLs for wallet display
  iconUrls: ['https://gyds.network/icon.png'],
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
    primary: 'https://testnet-rpc.gyds.network',
    local: 'http://localhost:8547',
  },
  blockExplorerUrls: ['https://testnet-explorer.gyds.network'],
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
  wsUrl: NETWORK_CONFIG.rpcUrls.primary.replace('https://', 'wss://').replace('http://', 'ws://') + '/ws',
  timeout: 30000,
  retryAttempts: 3,
  retryDelay: 1000,
};

// RPC endpoint configuration for the Go backend
export const RPC_ENDPOINTS = {
  // Standard Ethereum JSON-RPC methods that wallets expect
  methods: {
    // Network info
    'eth_chainId': 'Returns the chain ID',
    'net_version': 'Returns the network ID',
    'eth_protocolVersion': 'Returns the protocol version',
    'net_listening': 'Returns true if actively listening',
    'net_peerCount': 'Returns number of peers',
    
    // Block info
    'eth_blockNumber': 'Returns latest block number',
    'eth_getBlockByNumber': 'Returns block by number',
    'eth_getBlockByHash': 'Returns block by hash',
    
    // Account info
    'eth_getBalance': 'Returns account balance',
    'eth_getTransactionCount': 'Returns account nonce',
    'eth_getCode': 'Returns code at address',
    'eth_getStorageAt': 'Returns storage at position',
    
    // Transaction methods
    'eth_sendRawTransaction': 'Submits signed transaction',
    'eth_getTransactionByHash': 'Returns transaction by hash',
    'eth_getTransactionReceipt': 'Returns transaction receipt',
    'eth_estimateGas': 'Estimates gas for transaction',
    'eth_gasPrice': 'Returns current gas price',
    
    // Call methods
    'eth_call': 'Executes call without creating transaction',
    
    // Subscription (WebSocket)
    'eth_subscribe': 'Subscribe to events',
    'eth_unsubscribe': 'Unsubscribe from events',
  },
  
  // Mining-specific methods (custom)
  miningMethods: {
    'gyds_getMiningWork': 'Get current mining work',
    'gyds_submitShare': 'Submit mining share',
    'gyds_getMiningStats': 'Get miner statistics',
    'gyds_getPoolInfo': 'Get pool information',
  },
  
  // Validator methods (custom)
  validatorMethods: {
    'gyds_getValidators': 'Get validator list',
    'gyds_getValidatorInfo': 'Get validator details',
    'gyds_stake': 'Stake tokens',
    'gyds_unstake': 'Unstake tokens',
  },
};

// Gas configuration
export const GAS_CONFIG = {
  // Base gas price in wei (1 Gwei = 1e9 wei)
  baseFeePerGas: 1000000000, // 1 Gwei
  maxPriorityFeePerGas: 1500000000, // 1.5 Gwei
  
  // Gas limits for different transaction types
  gasLimits: {
    transfer: 21000,
    tokenTransfer: 65000,
    contractDeploy: 3000000,
    contractCall: 100000,
  },
};

// Helper to add network to wallet (MetaMask, Trust Wallet, etc.)
export const addNetworkToWallet = async (isTestnet = false): Promise<boolean> => {
  if (typeof window === 'undefined' || !window.ethereum) {
    throw new Error('No Ethereum provider found. Please install MetaMask or Trust Wallet.');
  }

  const params = getNetworkParams(isTestnet);
  
  try {
    await window.ethereum.request({
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
  if (typeof window === 'undefined' || !window.ethereum) {
    throw new Error('No Ethereum provider found');
  }

  const chainIdHex = isTestnet ? TESTNET_CONFIG.chainIdHex : NETWORK_CONFIG.chainIdHex;
  
  try {
    await window.ethereum.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: chainIdHex }],
    });
    return true;
  } catch (error: any) {
    // Chain not added, try to add it
    if (error.code === 4902) {
      return addNetworkToWallet(isTestnet);
    }
    throw error;
  }
};

// Check if currently on GYDS network
export const isOnGYDSNetwork = async (): Promise<boolean> => {
  if (typeof window === 'undefined' || !window.ethereum) {
    return false;
  }
  
  try {
    const chainId = await window.ethereum.request({ method: 'eth_chainId' });
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
