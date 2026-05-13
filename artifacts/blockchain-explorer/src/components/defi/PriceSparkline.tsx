import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

interface PriceSparklineProps {
  coinId: string;
  color?: string;
  width?: number;
  height?: number;
}

const COINGECKO_IDS: Record<string, string> = {
  ethereum: 'ethereum',
  bsc: 'binancecoin',
  polygon: 'matic-network',
  solana: 'solana',
};

// GYDS-chain native tokens served from our own API
const NATIVE_IDS = new Set(['gyds', 'gyd', 'chaincore']);

// Simple SVG sparkline from 7-day price data
export const PriceSparkline = ({ coinId, color = 'hsl(var(--primary))', width = 60, height = 20 }: PriceSparklineProps) => {
  const [points, setPoints] = useState<number[]>([]);
  const [isUp, setIsUp] = useState(true);

  useEffect(() => {
    const fetchSparkline = async () => {
      try {
        // For native GYDS tokens use our own price history endpoint
        if (NATIVE_IDS.has(coinId.toLowerCase())) {
          const res = await fetch('/api/blockchain/token-price/history');
          if (res.ok) {
            const data = await res.json() as { prices: { timestamp: number; price: number }[] };
            const prices = data.prices.map(p => p.price);
            setPoints(prices);
            if (prices.length >= 2) setIsUp(prices[prices.length - 1] >= prices[0]);
            return;
          }
        }

        // For well-known external tokens try CoinGecko
        const geckoId = COINGECKO_IDS[coinId];
        if (!geckoId) throw new Error('no-gecko-id');
        const res = await fetch(
          `https://api.coingecko.com/api/v3/coins/${geckoId}/market_chart?vs_currency=usd&days=7&interval=daily`
        );
        if (!res.ok) throw new Error('gecko-failed');
        const data = await res.json() as { prices: number[][] };
        const prices: number[] = data.prices?.map((p) => p[1]) || [];
        setPoints(prices);
        if (prices.length >= 2) setIsUp(prices[prices.length - 1] >= prices[0]);
      } catch {
        // Stable fallback — deterministic so it doesn't flicker on re-render
        const seed = coinId.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
        const mock = Array.from({ length: 7 }, (_, i) =>
          100 + Math.sin((seed + i) * 0.8) * 10
        );
        setPoints(mock);
      }
    };

    fetchSparkline();
  }, [coinId]);

  if (points.length < 2) {
    return <div style={{ width, height }} className="bg-muted/30 rounded animate-pulse" />;
  }

  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;

  const pathPoints = points.map((p, i) => {
    const x = (i / (points.length - 1)) * width;
    const y = height - ((p - min) / range) * (height - 2) - 1;
    return `${x},${y}`;
  });

  const strokeColor = isUp ? 'hsl(var(--chart-2))' : 'hsl(var(--destructive))';

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="shrink-0">
      <polyline
        fill="none"
        stroke={strokeColor}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={pathPoints.join(' ')}
      />
    </svg>
  );
};
