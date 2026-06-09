// Devnet → Mainnet auto-promotion engine.
import { api } from '@/lib/api';
import {
  AuthorityKey,
  AuthoritiesConfig,
  MainnetPromotionConfig,
  normalizePricing,
} from './tokenAuthorities';

export interface TokenNetworkState {
  network_type: 'devnet' | 'mainnet';
  mainnet_promoted_at?: string | null;
  market_cap_usd: number;
  extra_authorities: Partial<Record<AuthorityKey, boolean | number>>;
}

const DEFAULT_STATE: TokenNetworkState = {
  network_type: 'devnet',
  mainnet_promoted_at: null,
  market_cap_usd: 0,
  extra_authorities: {},
};

const stateKey = (tokenId: string) => `token_network_${tokenId}`;

export const writeTokenNetworkState = async (
  tokenId: string,
  state: Partial<TokenNetworkState>,
  userId?: string,
): Promise<void> => {
  const existing = await readTokenNetworkState(tokenId);
  const merged: TokenNetworkState = { ...existing, ...state };
  await api.post('/api/config', { key: stateKey(tokenId), value: merged });
};

export const readTokenNetworkState = async (tokenId: string): Promise<TokenNetworkState> => {
  try {
    const data = await api.get(`/api/config/${stateKey(tokenId)}`);
    if (!data?.config_value) return { ...DEFAULT_STATE };
    const v = data.config_value as any;
    return {
      network_type: v.network_type === 'mainnet' ? 'mainnet' : 'devnet',
      mainnet_promoted_at: v.mainnet_promoted_at ?? null,
      market_cap_usd: Number(v.market_cap_usd) || 0,
      extra_authorities: v.extra_authorities ?? {},
    };
  } catch { return { ...DEFAULT_STATE }; }
};

export const readAllTokenNetworkStates = async (): Promise<Map<string, TokenNetworkState>> => {
  try {
    const allConfigs = await api.get('/api/config');
    const map = new Map<string, TokenNetworkState>();
    for (const row of allConfigs ?? []) {
      if (!String(row.config_key ?? '').startsWith('token_network_')) continue;
      const id = row.config_key.replace('token_network_', '');
      const v = row.config_value;
      map.set(id, {
        network_type: v?.network_type === 'mainnet' ? 'mainnet' : 'devnet',
        mainnet_promoted_at: v?.mainnet_promoted_at ?? null,
        market_cap_usd: Number(v?.market_cap_usd) || 0,
        extra_authorities: v?.extra_authorities ?? {},
      });
    }
    return map;
  } catch { return new Map(); }
};

export const loadPricingConfig = async () => {
  try {
    const data = await api.get('/api/config/token_factory_pricing');
    return normalizePricing(data?.config_value);
  } catch { return normalizePricing(null); }
};

export interface TokenLike {
  id: string;
  total_supply: number;
  burned_supply?: number;
  gyds_liquidity: number;
}

export const computeMarketCapUsd = (token: TokenLike, gydsPriceUsd: number): number => {
  const liq = Number(token.gyds_liquidity) || 0;
  return liq * gydsPriceUsd > 0 ? liq * gydsPriceUsd : 0;
};

export interface EligibilityResult {
  eligible: boolean;
  reason: string;
  ageDays: number;
  marketCapUsd: number;
  daysUntilEligible: number;
  capUntilEligible: number;
}

export const evaluateEligibility = (
  token: { id: string; created_at: string },
  state: TokenNetworkState,
  marketCapUsd: number,
  promo: MainnetPromotionConfig,
): EligibilityResult => {
  const ageDays = (Date.now() - new Date(token.created_at).getTime()) / 86_400_000;
  const ageOk = ageDays >= promo.min_age_days;
  const capOk = marketCapUsd >= promo.min_market_cap_usd;
  const daysUntilEligible = Math.max(0, promo.min_age_days - ageDays);
  const capUntilEligible  = Math.max(0, promo.min_market_cap_usd - marketCapUsd);
  let reason: string;
  if (state.network_type === 'mainnet') reason = 'Already on mainnet';
  else if (!promo.enabled)              reason = 'Auto-promotion disabled by admin';
  else if (ageOk && capOk)             reason = 'Eligible — ready to promote';
  else if (!ageOk && !capOk)           reason = `Needs ${daysUntilEligible.toFixed(1)} more days and $${capUntilEligible.toLocaleString()} more market cap`;
  else if (!ageOk)                     reason = `Needs ${daysUntilEligible.toFixed(1)} more days on devnet`;
  else                                  reason = `Needs $${capUntilEligible.toLocaleString()} more market cap`;
  return { eligible: state.network_type === 'devnet' && promo.enabled && ageOk && capOk, reason, ageDays, marketCapUsd, daysUntilEligible, capUntilEligible };
};

export interface SweepResult {
  scanned: number;
  promoted: { id: string; symbol: string; marketCapUsd: number; ageDays: number }[];
  pending: { id: string; symbol: string; reason: string }[];
}

export const runPromotionSweep = async (): Promise<SweepResult> => {
  const pricing = await loadPricingConfig();
  const promo = pricing.mainnet_promotion;
  const result: SweepResult = { scanned: 0, promoted: [], pending: [] };
  try {
    const tokens = await api.get('/api/tokens');
    if (!tokens?.length) return result;
    const allStates = await readAllTokenNetworkStates();
    for (const t of tokens as any[]) {
      const state = allStates.get(t.id) ?? { ...DEFAULT_STATE };
      if (state.network_type === 'mainnet') continue;
      result.scanned++;
      const mc = computeMarketCapUsd(t, promo.gyds_price_usd);
      const verdict = evaluateEligibility(t, state, mc, promo);
      await writeTokenNetworkState(t.id, { market_cap_usd: mc });
      if (verdict.eligible) {
        const now = new Date().toISOString();
        await writeTokenNetworkState(t.id, { network_type: 'mainnet', mainnet_promoted_at: now, market_cap_usd: mc });
        result.promoted.push({ id: t.id, symbol: t.symbol, marketCapUsd: mc, ageDays: verdict.ageDays });
      } else {
        result.pending.push({ id: t.id, symbol: t.symbol, reason: verdict.reason });
      }
    }
  } catch {}
  return result;
};
