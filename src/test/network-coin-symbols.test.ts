import { describe, expect, it } from 'vitest';
import { getBaseCoinSymbol, getDisplayCoinSymbol } from '@/lib/networkCoinSymbols';

describe('network coin symbols', () => {
  it('uses TGYDS and TGYD on testnet', () => {
    expect(getDisplayCoinSymbol('testnet', 'GYDS')).toBe('TGYDS');
    expect(getDisplayCoinSymbol('testnet', 'GYD')).toBe('TGYD');
  });

  it('keeps mainnet symbols unchanged', () => {
    expect(getDisplayCoinSymbol('mainnet', 'GYDS')).toBe('GYDS');
    expect(getDisplayCoinSymbol('mainnet', 'GYD')).toBe('GYD');
  });

  it('normalizes test symbols back to their canonical asset names', () => {
    expect(getBaseCoinSymbol('TGYDS')).toBe('GYDS');
    expect(getBaseCoinSymbol('TGYD')).toBe('GYD');
  });
});
