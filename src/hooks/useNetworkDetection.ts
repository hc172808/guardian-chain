import { useState, useEffect, useCallback } from 'react';
import { NETWORK_CONFIG, TESTNET_CONFIG, DEVNET_CONFIG } from '@/config/network';

export type NetworkKind = 'mainnet' | 'testnet' | 'devnet' | 'external' | 'unknown';

interface NetworkInfo {
  chainId: number | null;
  networkName: string | null;
  networkKind: NetworkKind;
  isGYDSNetwork: boolean;
  isExternalNetwork: boolean;
  suggestBridge: boolean;
}

const GYDS_NETWORKS: Record<number, { name: string; kind: NetworkKind }> = {
  [NETWORK_CONFIG.chainId]: { name: NETWORK_CONFIG.chainName, kind: 'mainnet' },
  [TESTNET_CONFIG.chainId]: { name: TESTNET_CONFIG.chainName, kind: 'testnet' },
  [DEVNET_CONFIG.chainId]:  { name: DEVNET_CONFIG.chainName,  kind: 'devnet'  },
};

const EXTERNAL_NETWORKS: Record<number, string> = {
  1:     'Ethereum',
  56:    'BNB Chain',
  137:   'Polygon',
  42161: 'Arbitrum One',
  10:    'Optimism',
  43114: 'Avalanche',
  250:   'Fantom',
  8453:  'Base',
};

const EXTERNAL_CHAIN_IDS = new Set(Object.keys(EXTERNAL_NETWORKS).map(Number));

const DEFAULT_STATE: NetworkInfo = {
  chainId: null,
  networkName: null,
  networkKind: 'unknown',
  isGYDSNetwork: false,
  isExternalNetwork: false,
  suggestBridge: false,
};

function resolveNetwork(chainId: number): NetworkInfo {
  if (GYDS_NETWORKS[chainId]) {
    const { name, kind } = GYDS_NETWORKS[chainId];
    return {
      chainId,
      networkName: name,
      networkKind: kind,
      isGYDSNetwork: true,
      isExternalNetwork: false,
      suggestBridge: false,
    };
  }
  if (EXTERNAL_CHAIN_IDS.has(chainId)) {
    return {
      chainId,
      networkName: EXTERNAL_NETWORKS[chainId],
      networkKind: 'external',
      isGYDSNetwork: false,
      isExternalNetwork: true,
      suggestBridge: true,
    };
  }
  return {
    chainId,
    networkName: `Chain ${chainId}`,
    networkKind: 'unknown',
    isGYDSNetwork: false,
    isExternalNetwork: false,
    suggestBridge: false,
  };
}

export const useNetworkDetection = () => {
  const [network, setNetwork] = useState<NetworkInfo>(DEFAULT_STATE);
  const [isDetecting, setIsDetecting] = useState(false);

  const detectNetwork = useCallback(async () => {
    if (typeof window === 'undefined' || !window.ethereum) return;

    setIsDetecting(true);
    try {
      const chainIdHex = await window.ethereum.request({ method: 'eth_chainId' });
      const chainId = parseInt(chainIdHex, 16);
      setNetwork(resolveNetwork(chainId));
    } catch (err) {
      console.error('Network detection error:', err);
    } finally {
      setIsDetecting(false);
    }
  }, []);

  useEffect(() => {
    detectNetwork();

    if (typeof window !== 'undefined' && window.ethereum) {
      const handleChainChanged = (chainIdHex: string) => {
        const chainId = parseInt(chainIdHex, 16);
        setNetwork(resolveNetwork(chainId));
      };

      window.ethereum.on('chainChanged', handleChainChanged);
      return () => {
        window.ethereum.removeListener('chainChanged', handleChainChanged);
      };
    }
  }, [detectNetwork]);

  const dismissSuggestion = useCallback(() => {
    setNetwork(prev => ({ ...prev, suggestBridge: false }));
  }, []);

  return { ...network, isDetecting, detectNetwork, dismissSuggestion };
};
