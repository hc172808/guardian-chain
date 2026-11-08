export interface PerpMarket {
  pair: string;
  price: number;
  change: number;
  funding: number;
  oi: number;
  maxLeverage: number;
  minSize: number;
}

export interface PerpPosition {
  id: string;
  market: string;
  side: 'long' | 'short';
  size: number;
  leverage: number;
  entry_price: number;
  liquidation_price: number;
  margin: number;
  pnl: number;
  created_at: string;
}

const finiteNumber = (value: unknown, fallback = 0) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};

export function normalizePerpMarkets(payload: unknown): PerpMarket[] {
  if (!Array.isArray(payload)) return [];

  return payload.flatMap((item: any) => {
    if (!item || typeof item.pair !== 'string' || item.available === false || item.price == null) return [];
    const price = finiteNumber(item.price, Number.NaN);
    if (!Number.isFinite(price) || price <= 0) return [];

    return [{
      pair: item.pair,
      price,
      change: finiteNumber(item.change),
      funding: finiteNumber(item.funding),
      oi: finiteNumber(item.oi),
      maxLeverage: Math.max(1, finiteNumber(item.maxLeverage, 1)),
      minSize: Math.max(0, finiteNumber(item.minSize)),
    }];
  });
}

export function normalizePerpPositions(payload: unknown): PerpPosition[] {
  if (!Array.isArray(payload)) return [];

  return payload
    .filter((item: any) => item && typeof item.id === 'string' && typeof item.market === 'string')
    .map((item: any) => ({
      ...item,
      side: item.side === 'short' ? 'short' as const : 'long' as const,
      size: finiteNumber(item.size),
      leverage: Math.max(1, finiteNumber(item.leverage, 1)),
      entry_price: finiteNumber(item.entry_price),
      liquidation_price: finiteNumber(item.liquidation_price),
      margin: finiteNumber(item.margin),
      pnl: finiteNumber(item.pnl),
      created_at: String(item.created_at ?? ''),
    }));
}
