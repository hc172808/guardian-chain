export interface BridgeChain {
  id: string;
  name: string;
  symbol: string;
  chainId: number;
  logo: string;
  color: string;
  bridgeFee: number;
  evm: boolean;
}

export const EXTERNAL_CHAINS: BridgeChain[] = [
  // ── Major L1s ──
  { id: 'ethereum',  name: 'Ethereum',          symbol: 'ETH',   chainId: 1,      logo: '⟠', color: 'from-blue-400 to-purple-500',    bridgeFee: 0.005, evm: true  },
  { id: 'bsc',       name: 'BNB Chain',          symbol: 'BNB',   chainId: 56,     logo: '⬡', color: 'from-yellow-400 to-amber-500',   bridgeFee: 0.003, evm: true  },
  { id: 'polygon',   name: 'Polygon',            symbol: 'MATIC', chainId: 137,    logo: '⬢', color: 'from-purple-400 to-purple-600',  bridgeFee: 0.002, evm: true  },
  { id: 'avalanche', name: 'Avalanche',          symbol: 'AVAX',  chainId: 43114,  logo: '▲', color: 'from-red-400 to-red-600',        bridgeFee: 0.003, evm: true  },
  { id: 'fantom',    name: 'Fantom',             symbol: 'FTM',   chainId: 250,    logo: '👻', color: 'from-blue-500 to-indigo-500',   bridgeFee: 0.002, evm: true  },
  { id: 'cronos',    name: 'Cronos',             symbol: 'CRO',   chainId: 25,     logo: '🔷', color: 'from-blue-400 to-cyan-500',     bridgeFee: 0.002, evm: true  },
  // ── ETH Layer-2s ──
  { id: 'arbitrum',  name: 'Arbitrum One',       symbol: 'ETH',   chainId: 42161,  logo: '🔵', color: 'from-blue-500 to-blue-700',    bridgeFee: 0.002, evm: true  },
  { id: 'optimism',  name: 'Optimism',           symbol: 'ETH',   chainId: 10,     logo: '🔴', color: 'from-red-500 to-red-700',      bridgeFee: 0.002, evm: true  },
  { id: 'base',      name: 'Base',               symbol: 'ETH',   chainId: 8453,   logo: '🔵', color: 'from-blue-600 to-indigo-600',  bridgeFee: 0.002, evm: true  },
  { id: 'zksync',    name: 'zkSync Era',         symbol: 'ETH',   chainId: 324,    logo: '⚡', color: 'from-indigo-400 to-purple-500', bridgeFee: 0.002, evm: true  },
  { id: 'linea',     name: 'Linea',              symbol: 'ETH',   chainId: 59144,  logo: '✦', color: 'from-gray-400 to-gray-600',    bridgeFee: 0.002, evm: true  },
  // ── Non-EVM chains ──
  { id: 'solana',    name: 'Solana',             symbol: 'SOL',   chainId: 0,      logo: '◎', color: 'from-green-400 to-teal-500',   bridgeFee: 0.004, evm: false },
  { id: 'near',      name: 'NEAR Protocol',      symbol: 'NEAR',  chainId: 0,      logo: '🔷', color: 'from-black to-gray-700',       bridgeFee: 0.003, evm: false },
  { id: 'cosmos',    name: 'Cosmos Hub',         symbol: 'ATOM',  chainId: 0,      logo: '⚛', color: 'from-violet-400 to-purple-600', bridgeFee: 0.003, evm: false },
  { id: 'polkadot',  name: 'Polkadot',           symbol: 'DOT',   chainId: 0,      logo: '●', color: 'from-pink-400 to-rose-600',    bridgeFee: 0.003, evm: false },
  { id: 'cardano',   name: 'Cardano',            symbol: 'ADA',   chainId: 0,      logo: '₳', color: 'from-blue-400 to-blue-700',    bridgeFee: 0.004, evm: false },
  { id: 'tron',      name: 'TRON',               symbol: 'TRX',   chainId: 0,      logo: '♦', color: 'from-red-400 to-red-600',      bridgeFee: 0.003, evm: false },
  { id: 'ton',       name: 'TON Network',        symbol: 'TON',   chainId: 0,      logo: '💎', color: 'from-blue-400 to-cyan-400',   bridgeFee: 0.003, evm: false },
  { id: 'xrp',       name: 'XRP Ledger',         symbol: 'XRP',   chainId: 0,      logo: '✕', color: 'from-gray-400 to-gray-600',   bridgeFee: 0.002, evm: false },
  { id: 'stellar',   name: 'Stellar',            symbol: 'XLM',   chainId: 0,      logo: '✦', color: 'from-sky-400 to-blue-500',    bridgeFee: 0.002, evm: false },
  { id: 'algorand',  name: 'Algorand',           symbol: 'ALGO',  chainId: 0,      logo: '▲', color: 'from-gray-300 to-gray-600',   bridgeFee: 0.002, evm: false },
  { id: 'hedera',    name: 'Hedera',             symbol: 'HBAR',  chainId: 0,      logo: '⬡', color: 'from-indigo-400 to-violet-500', bridgeFee: 0.002, evm: false },
  { id: 'aptos',     name: 'Aptos',              symbol: 'APT',   chainId: 0,      logo: '∞', color: 'from-cyan-400 to-teal-500',   bridgeFee: 0.003, evm: false },
  { id: 'sui',       name: 'Sui',                symbol: 'SUI',   chainId: 0,      logo: '💧', color: 'from-blue-400 to-cyan-500',  bridgeFee: 0.003, evm: false },
  { id: 'icp',       name: 'Internet Computer',  symbol: 'ICP',   chainId: 0,      logo: '∞', color: 'from-pink-500 to-purple-600', bridgeFee: 0.004, evm: false },
];

export const GYDS_CHAIN = {
  id: 'gyds', name: 'GYDS Network', symbol: 'GYDS', chainId: 198282, logo: '◇', color: 'from-primary to-primary/50',
};
