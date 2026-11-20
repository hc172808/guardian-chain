export type CoinNetwork = 'mainnet' | 'testnet' | 'devnet' | 'all' | string;

export function getBaseCoinSymbol(symbol: string): string {
  const normalized = symbol.trim().toUpperCase();
  if (normalized === 'TGYDS') return 'GYDS';
  if (normalized === 'TGYD') return 'GYD';
  return normalized;
}

export function getDisplayCoinSymbol(network: CoinNetwork, symbol: string): string {
  const baseSymbol = getBaseCoinSymbol(symbol);
  if (network === 'testnet') {
    if (baseSymbol === 'GYDS') return 'TGYDS';
    if (baseSymbol === 'GYD') return 'TGYD';
  }
  return baseSymbol;
}
