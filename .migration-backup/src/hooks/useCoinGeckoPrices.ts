import { useState, useEffect } from 'react';

interface PriceData {
  [key: string]: {
    usd: number;
    usd_24h_change: number;
  };
}

const COIN_IDS = {
  ethereum: 'ethereum',
  bsc: 'binancecoin',
  polygon: 'matic-network',
  solana: 'solana',
};

export const useCoinGeckoPrices = () => {
  const [prices, setPrices] = useState<Record<string, number>>({
    ethereum: 3200,
    bsc: 580,
    polygon: 0.95,
    solana: 145,
  });
  const [changes, setChanges] = useState<Record<string, number>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const fetchPrices = async () => {
    try {
      setIsLoading(true);
      const ids = Object.values(COIN_IDS).join(',');
      const response = await fetch(
        `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true`
      );

      if (!response.ok) {
        throw new Error('Failed to fetch prices');
      }

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
      // Keep using fallback prices
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchPrices();
    
    // Refresh prices every 60 seconds
    const interval = setInterval(fetchPrices, 60000);
    
    return () => clearInterval(interval);
  }, []);

  return { prices, changes, isLoading, error, lastUpdated, refetch: fetchPrices };
};

