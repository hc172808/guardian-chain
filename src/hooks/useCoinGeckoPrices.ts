import { useState, useEffect } from 'react';

interface PriceData {
  [key: string]: {
    usd: number;
    usd_24h_change: number;
  };
}

export const COIN_IDS: Record<string, string> = {
  ethereum:  'ethereum',
  bsc:       'binancecoin',
  polygon:   'matic-network',
  solana:    'solana',
  avalanche: 'avalanche-2',
  arbitrum:  'ethereum',        // ARB bridges ETH
  optimism:  'ethereum',        // OP bridges ETH
  base:      'ethereum',        // Base bridges ETH
  fantom:    'fantom',
  cronos:    'crypto-com-chain',
  near:      'near',
  cosmos:    'cosmos',
  polkadot:  'polkadot',
  cardano:   'cardano',
  tron:      'tron',
  ton:       'the-open-network',
  xrp:       'ripple',
  stellar:   'stellar',
  algorand:  'algorand',
  hedera:    'hedera-hashgraph',
  aptos:     'aptos',
  sui:       'sui',
  icp:       'internet-computer',
  zksync:    'ethereum',        // zkSync bridges ETH
  linea:     'ethereum',        // Linea bridges ETH
};

const FALLBACK_PRICES: Record<string, number> = {
  ethereum:  3200,   bsc:      580,    polygon:  0.95,
  solana:    145,    avalanche:35,     arbitrum: 3200,
  optimism:  3200,   base:     3200,   fantom:   0.65,
  cronos:    0.10,   near:     6.5,    cosmos:   9.5,
  polkadot:  7.8,    cardano:  0.45,   tron:     0.12,
  ton:       5.8,    xrp:      0.55,   stellar:  0.11,
  algorand:  0.19,   hedera:   0.09,   aptos:    9.2,
  sui:       1.8,    icp:      12.5,   zksync:   3200,
  linea:     3200,
};

export const useCoinGeckoPrices = () => {
  const [prices, setPrices] = useState<Record<string, number>>(FALLBACK_PRICES);
  const [changes, setChanges] = useState<Record<string, number>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const fetchPrices = async () => {
    try {
      setIsLoading(true);
      // Deduplicate CoinGecko IDs (some chains share ETH price)
      const uniqueIds = [...new Set(Object.values(COIN_IDS))].join(',');
      const response = await fetch(
        `https://api.coingecko.com/api/v3/simple/price?ids=${uniqueIds}&vs_currencies=usd&include_24hr_change=true`
      );

      if (!response.ok) throw new Error('Failed to fetch prices');

      const data: PriceData = await response.json();

      const newPrices: Record<string, number> = {};
      const newChanges: Record<string, number> = {};

      Object.entries(COIN_IDS).forEach(([chainId, coinId]) => {
        if (data[coinId]) {
          newPrices[chainId] = data[coinId].usd;
          newChanges[chainId] = data[coinId].usd_24h_change || 0;
        }
      });

      setPrices(prev => ({ ...prev, ...newPrices }));
      setChanges(newChanges);
      setLastUpdated(new Date());
      setError(null);
    } catch (err) {
      console.error('CoinGecko API error:', err);
      setError('Failed to fetch live prices');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchPrices();
    const interval = setInterval(fetchPrices, 60000);
    return () => clearInterval(interval);
  }, []);

  return { prices, changes, isLoading, error, lastUpdated, refetch: fetchPrices };
};
