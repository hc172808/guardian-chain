import { useState, useEffect, useCallback } from 'react';

interface NetworkInfo {
  chainId: number | null;
  networkName: string | null;
  isExternalNetwork: boolean;
  suggestBridge: boolean;
}

const KNOWN_NETWORKS: Record<number, string> = {
  1: 'Ethereum',
  56: 'BNB Chain',
  137: 'Polygon',
  // Solana doesn't use chainId in the same way
  13370: 'GYDS Network',
};

const EXTERNAL_CHAIN_IDS = [1, 56, 137]; // ETH, BSC, Polygon

export const useNetworkDetection = () => {
  const [network, setNetwork] = useState<NetworkInfo>({
    chainId: null,
    networkName: null,
    isExternalNetwork: false,
    suggestBridge: false,
  });
  const [isDetecting, setIsDetecting] = useState(false);

  const detectNetwork = useCallback(async () => {
    if (typeof window === 'undefined' || !window.ethereum) {
      return;
    }

    setIsDetecting(true);
    try {
      const chainIdHex = await window.ethereum.request({ method: 'eth_chainId' });
      const chainId = parseInt(chainIdHex, 16);
      const networkName = KNOWN_NETWORKS[chainId] || `Chain ${chainId}`;
      const isExternalNetwork = EXTERNAL_CHAIN_IDS.includes(chainId);

      setNetwork({
        chainId,
        networkName,
        isExternalNetwork,
        suggestBridge: isExternalNetwork,
      });
    } catch (err) {
      console.error('Network detection error:', err);
    } finally {
      setIsDetecting(false);
    }
  }, []);

  useEffect(() => {
    detectNetwork();

    // Listen for network changes
    if (typeof window !== 'undefined' && window.ethereum) {
      const handleChainChanged = (chainIdHex: string) => {
        const chainId = parseInt(chainIdHex, 16);
        const networkName = KNOWN_NETWORKS[chainId] || `Chain ${chainId}`;
        const isExternalNetwork = EXTERNAL_CHAIN_IDS.includes(chainId);

        setNetwork({
          chainId,
          networkName,
          isExternalNetwork,
          suggestBridge: isExternalNetwork,
        });
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
