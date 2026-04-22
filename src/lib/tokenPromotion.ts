// Devnet → Mainnet auto-promotion engine.
//
// A token created via TokenFactory starts on devnet. Once it satisfies BOTH
//   (a) age >= mainnet_promotion.min_age_days  (default 30 days)
//   (b) market cap (USD) >= mainnet_promotion.min_market_cap_usd (default $10,000)
// it is automatically promoted to mainnet.
//
// Per-token network state is mirrored in admin_config under
// `token_network_<token_id>` so that we don't depend on the corresponding
// columns being present yet on the live Supabase table.

import { supabase } from '@/integrations/supabase/client';
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

// ── State persistence ────────────────────────────────────────────────────────

export const writeTokenNetworkState = async (
  tokenId: string,
  state: Partial<TokenNetworkState>,
  userId?: string,
): Promise<void> => {
  // Merge with existing
  const existing = await readTokenNetworkState(tokenId);
  const merged: TokenNetworkState = { ...existing, ...state };
  await supabase.from('admin_config').upsert(
    {
      config_key: stateKey(tokenId),
      config_value: merged as any,
      updated_by: userId ?? null,
    },
    { onConflict: 'config_key' },
  );
};

export const readTokenNetworkState = async (tokenId: string): Promise<TokenNetworkState> => {
  const { data } = await supabase
    .from('admin_config')
    .select('config_value')
    .eq('config_key', stateKey(tokenId))
    .maybeSingle();
  if (!data?.config_value) return { ...DEFAULT_STATE };
  const v = data.config_value as any;
  return {
    network_type: v.network_type === 'mainnet' ? 'mainnet' : 'devnet',
    mainnet_promoted_at: v.mainnet_promoted_at ?? null,
    market_cap_usd: Number(v.market_cap_usd) || 0,
    extra_authorities: v.extra_authorities ?? {},
  };
};

// Bulk-load all token network rows in one query (for list pages).
export const readAllTokenNetworkStates = async (): Promise<Map<string, TokenNetworkState>> => {
  const { data } = await supabase
    .from('admin_config')
    .select('config_key, config_value')
    .like('config_key', 'token_network_%');
  const map = new Map<string, TokenNetworkState>();
  for (const row of data ?? []) {
    const id = (row as any).config_key.replace('token_network_', '');
    const v = (row as any).config_value;
    map.set(id, {
      network_type: v.network_type === 'mainnet' ? 'mainnet' : 'devnet',
      mainnet_promoted_at: v.mainnet_promoted_at ?? null,
      market_cap_usd: Number(v.market_cap_usd) || 0,
      extra_authorities: v.extra_authorities ?? {},
    });
  }
  return map;
};

// ── Pricing config ───────────────────────────────────────────────────────────

export const loadPricingConfig = async () => {
  const { data } = await supabase
    .from('admin_config')
    .select('config_value')
    .eq('config_key', 'token_factory_pricing')
    .maybeSingle();
  return normalizePricing(data?.config_value);
};

// ── Market cap calculation ───────────────────────────────────────────────────
//
// Market cap = circulating_supply * price_in_usd.
//
// Token price is derived from the constant-product LP relationship:
//   price_in_gyds = gyds_liquidity / circulating_supply
//   price_in_usd  = price_in_gyds * gyds_price_usd
// Therefore:
//   market_cap_usd = circulating_supply * (gyds_liquidity / circulating_supply) * gyds_price_usd
//                  = gyds_liquidity * gyds_price_usd
//
// This is a conservative lower bound — admins can override it explicitly.

export interface TokenLike {
  id: string;
  total_supply: number;
  burned_supply?: number;
  gyds_liquidity: number;
}

export const computeMarketCapUsd = (token: TokenLike, gydsPriceUsd: number): number => {
  const liq = Number(token.gyds_liquidity) || 0;
  const mc = liq * gydsPriceUsd;
  return mc > 0 ? mc : 0;
};

// ── Eligibility & promotion ─────────────────────────────────────────────────

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
  const created = new Date(token.created_at).getTime();
  const ageDays = (Date.now() - created) / 86_400_000;
  const ageOk = ageDays >= promo.min_age_days;
  const capOk = marketCapUsd >= promo.min_market_cap_usd;
  const daysUntilEligible = Math.max(0, promo.min_age_days - ageDays);
  const capUntilEligible  = Math.max(0, promo.min_market_cap_usd - marketCapUsd);

  let reason: string;
  if (state.network_type === 'mainnet') reason = 'Already on mainnet';
  else if (!promo.enabled)              reason = 'Auto-promotion disabled by admin';
  else if (ageOk && capOk)              reason = 'Eligible — ready to promote';
  else if (!ageOk && !capOk)            reason = `Needs ${daysUntilEligible.toFixed(1)} more days and $${capUntilEligible.toLocaleString()} more market cap`;
  else if (!ageOk)                      reason = `Needs ${daysUntilEligible.toFixed(1)} more days on devnet`;
  else                                   reason = `Needs $${capUntilEligible.toLocaleString()} more market cap`;

  return {
    eligible: state.network_type === 'devnet' && promo.enabled && ageOk && capOk,
    reason,
    ageDays,
    marketCapUsd,
    daysUntilEligible,
    capUntilEligible,
  };
};

export interface SweepResult {
  scanned: number;
  promoted: { id: string; symbol: string; marketCapUsd: number; ageDays: number }[];
  pending: { id: string; symbol: string; reason: string }[];
}

// Scan every devnet token, recompute market cap, promote those that qualify.
// Safe to call repeatedly — promoted tokens are skipped on subsequent runs.
export const runPromotionSweep = async (): Promise<SweepResult> => {
  const pricing = await loadPricingConfig();
  const promo = pricing.mainnet_promotion;

  const { data: tokens } = await supabase
    .from('tokens')
    .select('id, name, symbol, total_supply, burned_supply, gyds_liquidity, created_at')
    .eq('is_active', true);

  const result: SweepResult = { scanned: 0, promoted: [], pending: [] };
  if (!tokens?.length) return result;

  const allStates = await readAllTokenNetworkStates();

  for (const t of tokens as any[]) {
    const state = allStates.get(t.id) ?? { ...DEFAULT_STATE };
    if (state.network_type === 'mainnet') continue;
    result.scanned++;

    const mc = computeMarketCapUsd(t, promo.gyds_price_usd);
    const verdict = evaluateEligibility(t, state, mc, promo);

    // Always update market cap value
    await writeTokenNetworkState(t.id, { market_cap_usd: mc });

    if (verdict.eligible) {
      const now = new Date().toISOString();
      await writeTokenNetworkState(t.id, {
        network_type: 'mainnet',
        mainnet_promoted_at: now,
        market_cap_usd: mc,
      });
      // Best-effort update of the live tokens row if the columns exist.
      try {
        await supabase
          .from('tokens')
          // @ts-expect-error — columns may not exist yet on legacy schemas
          .update({ network_type: 'mainnet', mainnet_promoted_at: now, market_cap_usd: mc })
          .eq('id', t.id);
      } catch { /* ignore — admin_config row is canonical */ }

      result.promoted.push({ id: t.id, symbol: t.symbol, marketCapUsd: mc, ageDays: verdict.ageDays });
    } else {
      result.pending.push({ id: t.id, symbol: t.symbol, reason: verdict.reason });
    }
  }

  return result;
};
