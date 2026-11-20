import { describe, expect, it } from 'vitest';
import { normalizePerpMarkets, normalizePerpPositions } from '@/lib/perpsMarkets';

describe('perpetual market response normalization', () => {
  it('drops unavailable markets instead of passing null prices into the UI', () => {
    expect(normalizePerpMarkets([
      { pair: 'GYDS/USD', price: null, available: false },
      { pair: 'GYDS/ETH', price: '0', available: true },
      { pair: 'GYDS/BTC', price: '0.125', available: true, change: null, funding: '0.001', oi: '2000', maxLeverage: '20', minSize: '100' },
    ])).toEqual([
      {
        pair: 'GYDS/BTC',
        price: 0.125,
        change: 0,
        funding: 0.001,
        oi: 2000,
        maxLeverage: 20,
        minSize: 100,
      },
    ]);
  });

  it('returns an empty list for malformed market responses', () => {
    expect(normalizePerpMarkets({ error: 'unavailable' })).toEqual([]);
    expect(normalizePerpMarkets([null, { price: 10 }, { pair: 'GYDS/USD', price: 'bad' }])).toEqual([]);
  });

  it('normalizes PostgreSQL numeric strings in open positions', () => {
    expect(normalizePerpPositions([{
      id: 'position-1',
      market: 'GYDS/USD',
      side: 'short',
      size: '250',
      leverage: '5',
      entry_price: '0.025',
      liquidation_price: '0.0295',
      margin: '50',
      pnl: '-1.25',
      created_at: '2026-11-05T00:00:00.000Z',
    }])).toEqual([{
      id: 'position-1',
      market: 'GYDS/USD',
      side: 'short',
      size: 250,
      leverage: 5,
      entry_price: 0.025,
      liquidation_price: 0.0295,
      margin: 50,
      pnl: -1.25,
      created_at: '2026-11-05T00:00:00.000Z',
    }]);
  });
});
