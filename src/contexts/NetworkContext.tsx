import { createContext, useContext, useState, useCallback, ReactNode } from 'react';

export type NetworkKind = 'mainnet' | 'testnet' | 'devnet';
export const ALL_NETWORKS: NetworkKind[] = ['mainnet', 'testnet', 'devnet'];

interface NetworkContextValue {
  activeNetworks: Set<NetworkKind>;     // which networks are "on" (visible)
  selectedNetwork: NetworkKind | 'all'; // which network tab is currently selected
  setSelectedNetwork: (n: NetworkKind | 'all') => void;
  toggleNetwork: (n: NetworkKind) => void;
  enableAll: () => void;
  disableAll: () => void;
  isNetworkEnabled: (n: NetworkKind) => boolean;
}

const NetworkContext = createContext<NetworkContextValue>({
  activeNetworks: new Set(ALL_NETWORKS),
  selectedNetwork: 'all',
  setSelectedNetwork: () => {},
  toggleNetwork: () => {},
  enableAll: () => {},
  disableAll: () => {},
  isNetworkEnabled: () => true,
});

const STORAGE_KEY = 'gyds_active_networks';
const SELECTED_KEY = 'gyds_selected_network';

function loadActiveNetworks(): Set<NetworkKind> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed: string[] = JSON.parse(raw);
      const valid = parsed.filter((n): n is NetworkKind => ALL_NETWORKS.includes(n as NetworkKind));
      if (valid.length) return new Set(valid);
    }
  } catch {}
  return new Set(ALL_NETWORKS);
}

function loadSelectedNetwork(): NetworkKind | 'all' {
  try {
    const raw = localStorage.getItem(SELECTED_KEY);
    if (raw === 'all' || ALL_NETWORKS.includes(raw as NetworkKind)) return raw as NetworkKind | 'all';
  } catch {}
  return 'all';
}

export const NetworkProvider = ({ children }: { children: ReactNode }) => {
  const [activeNetworks, setActiveNetworks] = useState<Set<NetworkKind>>(loadActiveNetworks);
  const [selectedNetwork, setSelectedNetworkState] = useState<NetworkKind | 'all'>(loadSelectedNetwork);

  const setSelectedNetwork = useCallback((n: NetworkKind | 'all') => {
    setSelectedNetworkState(n);
    localStorage.setItem(SELECTED_KEY, n);
  }, []);

  const toggleNetwork = useCallback((n: NetworkKind) => {
    setActiveNetworks(prev => {
      const next = new Set(prev);
      if (next.has(n)) {
        if (next.size === 1) return prev; // keep at least one enabled
        next.delete(n);
      } else {
        next.add(n);
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify([...next]));
      return next;
    });
  }, []);

  const enableAll = useCallback(() => {
    const next = new Set<NetworkKind>(ALL_NETWORKS);
    setActiveNetworks(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...next]));
  }, []);

  const disableAll = useCallback(() => {
    // leave mainnet on — can't disable everything
    const next = new Set<NetworkKind>(['mainnet']);
    setActiveNetworks(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...next]));
  }, []);

  const isNetworkEnabled = useCallback((n: NetworkKind) => activeNetworks.has(n), [activeNetworks]);

  return (
    <NetworkContext.Provider value={{ activeNetworks, selectedNetwork, setSelectedNetwork, toggleNetwork, enableAll, disableAll, isNetworkEnabled }}>
      {children}
    </NetworkContext.Provider>
  );
};

export const useNetwork = () => useContext(NetworkContext);

// NETWORK_COLORS and label helpers used across pages
export const NETWORK_BADGE: Record<NetworkKind, { label: string; dot: string; border: string; bg: string; text: string }> = {
  mainnet: { label: 'Mainnet', dot: 'bg-emerald-400', border: 'border-emerald-400/50', bg: 'bg-emerald-400/10', text: 'text-emerald-300' },
  testnet: { label: 'Testnet', dot: 'bg-yellow-400',  border: 'border-yellow-400/50',  bg: 'bg-yellow-400/10',  text: 'text-yellow-300'  },
  devnet:  { label: 'Devnet',  dot: 'bg-blue-400',    border: 'border-blue-400/50',    bg: 'bg-blue-400/10',    text: 'text-blue-300'    },
};
