// GYDS Blockchain Network Configuration
// Compatible with Trust Wallet, MetaMask, Phantom (EVM), and any EIP-3085 wallet.

import { GENESIS_CONFIG, TOKENOMICS } from './wallets';

// All RPC endpoints — main + backups + local
export const RPC_ENDPOINTS_LIST = {
  main: 'https://rpc.netlifegy.com',
  backups: [
    'https://rpc2.netlifegy.com',
    'https://rpc3.netlifegy.com',
  ],
  local: [
    'http://localhost:8546',
    ...(import.meta.env.VITE_LOCAL_RPC_URL ? [import.meta.env.VITE_LOCAL_RPC_URL as string] : []),
  ],
};

export const ALL_RPC_ENDPOINTS = [
  RPC_ENDPOINTS_LIST.main,
  ...RPC_ENDPOINTS_LIST.backups,
  ...RPC_ENDPOINTS_LIST.local,
];

// ── Network kinds ───────────────────────────────────────────────────────────
export type NetworkKind = 'mainnet' | 'testnet' | 'devnet';

// Mainnet
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

// Testnet
export const TESTNET_CONFIG = {
  chainId: 13371,
  chainIdHex: '0x343B',
  chainName: 'GYDS Testnet',
  nativeCurrency: { name: 'Test GYDS', symbol: 'tGYDS', decimals: 18 },
  rpcUrls: {
    primary: 'https://testnet-rpc.netlifegy.com',
    backup: [] as string[],
    local: ['http://localhost:8547'],
  },
  blockExplorerUrls: ['https://testnet-explorer.netlifegy.com'],
  iconUrls: [] as string[],
};

// Devnet — for token launches before they're promoted to mainnet
export const DEVNET_CONFIG = {
  chainId: 13372,
  chainIdHex: '0x343C',
  chainName: 'GYDS Devnet',
  nativeCurrency: { name: 'Dev GYDS', symbol: 'dGYDS', decimals: 18 },
  rpcUrls: {
    primary: 'https://devnet-rpc.netlifegy.com',
    backup: [] as string[],
    local: ['http://localhost:8548'],
  },
  blockExplorerUrls: ['https://devnet-explorer.netlifegy.com'],
  iconUrls: [] as string[],
};

export const NETWORK_BY_KIND = {
  mainnet: NETWORK_CONFIG,
  testnet: TESTNET_CONFIG,
  devnet: DEVNET_CONFIG,
} as const;

// Service endpoints
export const SERVICE_ENDPOINTS = {
  rpc: 'https://rpc.netlifegy.com',
  rpc2: 'https://rpc2.netlifegy.com',
  rpc3: 'https://rpc3.netlifegy.com',
  ws: 'wss://ws.netlifegy.com',
  explorer: 'https://explorer.netlifegy.com',
  vpn: 'vpn.netlifegy.com',
  testnetRpc: 'https://testnet-rpc.netlifegy.com',
  devnetRpc: 'https://devnet-rpc.netlifegy.com',
};

// EIP-3085 params for wallet_addEthereumChain
export const getNetworkParams = (kind: NetworkKind = 'mainnet') => {
  const config = NETWORK_BY_KIND[kind];
  const rpcUrls = [config.rpcUrls.primary, ...(config.rpcUrls.backup ?? [])];
  return {
    chainId: config.chainIdHex,
    chainName: config.chainName,
    nativeCurrency: config.nativeCurrency,
    rpcUrls,
    blockExplorerUrls: config.blockExplorerUrls,
    iconUrls: config.iconUrls ?? [],
  };
};

// ── Provider discovery ──────────────────────────────────────────────────────
//
// Old code only checked window.ethereum, which misses:
//   • Phantom EVM (exposed at window.phantom?.ethereum)
//   • EIP-6963 multi-provider wallets that don't always inject window.ethereum
//   • Mobile wallets that only inject inside their own in-app browser
//
// We now scan every known location and return the first usable provider.

type EIP1193 = {
  request: (args: { method: string; params?: any[] }) => Promise<any>;
  on?: (event: string, callback: (...args: any[]) => void) => void;
  removeListener?: (event: string, callback: (...args: any[]) => void) => void;
  isMetaMask?: boolean;
  isTrust?: boolean;
  isPhantom?: boolean;
  isCoinbaseWallet?: boolean;
};

const eip6963Providers: { info: { name: string; rdns: string }; provider: EIP1193 }[] = [];

if (typeof window !== 'undefined') {
  window.addEventListener('eip6963:announceProvider', (event: any) => {
    if (event?.detail?.provider) eip6963Providers.push(event.detail);
  });
  // Ask any wallet that supports EIP-6963 to announce itself.
  window.dispatchEvent(new Event('eip6963:requestProvider'));
}

export const getEthereumProvider = (): EIP1193 | null => {
  if (typeof window === 'undefined') return null;

  // 1) Standard MetaMask / Trust / Brave / etc.
  if ((window as any).ethereum) {
    const eth = (window as any).ethereum as EIP1193 & { providers?: EIP1193[] };
    if (Array.isArray(eth.providers) && eth.providers.length) {
      return (
        eth.providers.find((p) => p.isMetaMask) ??
        eth.providers.find((p) => p.isTrust) ??
        eth.providers[0]
      );
    }
    return eth;
  }

  // 2) Phantom EVM
  const phantomEth = (window as any).phantom?.ethereum as EIP1193 | undefined;
  if (phantomEth) return phantomEth;

  // 3) Trust Wallet's dedicated injection
  const trust = (window as any).trustwallet as EIP1193 | undefined;
  if (trust) return trust;

  // 4) EIP-6963 announced providers
  if (eip6963Providers.length) return eip6963Providers[0].provider;

  return null;
};

export const hasEthereumProvider = (): boolean => !!getEthereumProvider();

// Mobile in-app browser detection — useful for the user-facing error.
export const isMobile = (): boolean =>
  typeof navigator !== 'undefined' && /android|iphone|ipad|ipod|mobile/i.test(navigator.userAgent);

const noWalletError = (): Error => {
  const mobile = isMobile();
  return new Error(
    mobile
      ? 'No EVM wallet found in this browser. On mobile, open this site INSIDE your wallet app (MetaMask → Browser tab, Trust Wallet → DApps, Phantom → Browser). Once the page is loaded inside the wallet app, the "Add Network" button will work.'
      : 'No EVM wallet detected. Install MetaMask, Trust Wallet (Brave Wallet), or Phantom (with EVM enabled), then refresh this page. If a wallet is installed, make sure its extension is unlocked and enabled for this site.',
  );
};

// Add network to whichever wallet we found.
export const addNetworkToWallet = async (kind: NetworkKind = 'mainnet'): Promise<boolean> => {
  const provider = getEthereumProvider();
  if (!provider) throw noWalletError();

  // Use this app's own /rpc endpoint as the first RPC URL so wallet validation
  // always succeeds — even if rpc.netlifegy.com hasn't been deployed yet.
  const appRpc = (typeof window !== 'undefined' ? window.location.origin : '') + '/rpc';
  const base = getNetworkParams(kind);
  const params = {
    ...base,
    rpcUrls: [appRpc, ...base.rpcUrls.filter((u: string) => u !== appRpc)],
  };

  try {
    await provider.request({ method: 'wallet_addEthereumChain', params: [params] });
    return true;
  } catch (error: any) {
    if (error?.code === 4001) throw new Error('You rejected the request in your wallet.');
    // Some wallets pass a user-friendly message in error.data.message
    const msg = (error as any)?.data?.message || error?.message || 'Failed to add network';
    throw new Error(msg);
  }
};

// Switch to a network (auto-add if missing).
export const switchToNetwork = async (kind: NetworkKind = 'mainnet'): Promise<boolean> => {
  const provider = getEthereumProvider();
  if (!provider) throw noWalletError();

  const cfg = NETWORK_BY_KIND[kind];
  try {
    await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: cfg.chainIdHex }] });
    return true;
  } catch (error: any) {
    if (error?.code === 4902) return addNetworkToWallet(kind);
    throw error;
  }
};

export const isOnGYDSNetwork = async (): Promise<boolean> => {
  const provider = getEthereumProvider();
  if (!provider) return false;
  try {
    const chainId = await provider.request({ method: 'eth_chainId' });
    return [NETWORK_CONFIG.chainIdHex, TESTNET_CONFIG.chainIdHex, DEVNET_CONFIG.chainIdHex].includes(chainId);
  } catch {
    return false;
  }
};

// Trust Wallet specific configuration (legacy export — kept for backwards-compat)
export const TRUST_WALLET_CONFIG = {
  chainId: NETWORK_CONFIG.chainId,
  name: NETWORK_CONFIG.chainName,
  symbol: TOKENOMICS.symbol,
  decimals: TOKENOMICS.decimals,
  rpcUrl: NETWORK_CONFIG.rpcUrls.primary,
  blockExplorerUrl: NETWORK_CONFIG.blockExplorerUrls[0],
};

export const RPC_CONFIG = {
  fullNodeUrl: NETWORK_CONFIG.rpcUrls.primary,
  backupUrls: RPC_ENDPOINTS_LIST.backups,
  localUrls: RPC_ENDPOINTS_LIST.local,
  wsUrl: 'wss://ws.netlifegy.com',
  timeout: 30000,
  retryAttempts: 3,
  retryDelay: 1000,
};

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

declare global {
  interface Window {
    ethereum?: EIP1193 & { providers?: EIP1193[] };
    phantom?: { ethereum?: EIP1193 };
    trustwallet?: EIP1193;
  }
}
