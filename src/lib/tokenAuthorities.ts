// Single source of truth for every token authority the platform supports.
// Admin enables/disables which ones users may pick and sets the GYDS fee
// for each. Stored under admin_config['token_factory_pricing'].authorities.

export type AuthorityKey =
  | 'mint'
  | 'freeze'
  | 'update'
  | 'burn'
  | 'pause'
  | 'blacklist'
  | 'transfer_fee'
  | 'transfer_hook'
  | 'permanent_delegate'
  | 'close_authority'
  | 'non_transferable';

export interface AuthorityDef {
  key: AuthorityKey;
  label: string;
  description: string;
  warning?: string;
}

export const ALL_AUTHORITIES: AuthorityDef[] = [
  { key: 'mint',               label: 'Mint Authority',          description: 'Create new tokens after launch', warning: 'High risk — holders cannot detect future inflation.' },
  { key: 'freeze',             label: 'Freeze Authority',        description: 'Freeze/unfreeze any holder account' },
  { key: 'update',             label: 'Update Metadata',         description: 'Change name, symbol, or logo after launch' },
  { key: 'burn',               label: 'Burn Authority',          description: 'Burn tokens from any account' },
  { key: 'pause',              label: 'Pause Authority',         description: 'Globally pause/unpause all transfers' },
  { key: 'blacklist',          label: 'Blacklist Authority',     description: 'Block specific addresses from transferring' },
  { key: 'transfer_fee',       label: 'Transfer Fee',            description: 'Charge a fee on every transfer (in basis points)' },
  { key: 'transfer_hook',      label: 'Transfer Hook',           description: 'Run a custom program on every transfer', warning: 'Advanced — requires hook program address.' },
  { key: 'permanent_delegate', label: 'Permanent Delegate',      description: 'Move tokens from any holder at any time', warning: 'EXTREME risk — operator owns every balance.' },
  { key: 'close_authority',    label: 'Close Authority',         description: 'Close mint/holder accounts and reclaim rent' },
  { key: 'non_transferable',   label: 'Non-Transferable (Soulbound)', description: 'Tokens cannot be transferred after minting' },
];

export interface AuthorityConfig {
  enabled: boolean;
  fee: number; // GYDS
}

export type AuthoritiesConfig = Record<AuthorityKey, AuthorityConfig>;

export const DEFAULT_AUTHORITIES_CONFIG: AuthoritiesConfig = {
  mint:               { enabled: true,  fee: 200 },
  freeze:             { enabled: true,  fee: 50 },
  update:             { enabled: true,  fee: 25 },
  burn:               { enabled: true,  fee: 30 },
  pause:              { enabled: false, fee: 100 },
  blacklist:          { enabled: false, fee: 150 },
  transfer_fee:       { enabled: false, fee: 75 },
  transfer_hook:      { enabled: false, fee: 250 },
  permanent_delegate: { enabled: false, fee: 500 },
  close_authority:    { enabled: false, fee: 50 },
  non_transferable:   { enabled: false, fee: 100 },
};

export interface MainnetPromotionConfig {
  enabled: boolean;
  min_age_days: number;
  min_market_cap_usd: number;
  promotion_fee: number; // GYDS, charged on auto-promotion (0 = free)
  gyds_price_usd: number; // used to convert GYDS-denominated MC into USD
}

export const DEFAULT_PROMOTION_CONFIG: MainnetPromotionConfig = {
  enabled: true,
  min_age_days: 30,
  min_market_cap_usd: 10000,
  promotion_fee: 0,
  gyds_price_usd: 1, // override in admin if your GYDS has a different USD peg
};

export interface TokenFactoryPricing {
  deployment_fee: number;
  min_liquidity: number;
  global_max_buy_per_wallet: number;
  global_daily_buy_limit: number;
  authorities: AuthoritiesConfig;
  mainnet_promotion: MainnetPromotionConfig;
  // legacy fields kept for backward compat with old rows
  freeze_authority_fee?: number;
  update_authority_fee?: number;
  mint_authority_fee?: number;
}

export const DEFAULT_PRICING: TokenFactoryPricing = {
  deployment_fee: 100,
  min_liquidity: 100,
  global_max_buy_per_wallet: 0,
  global_daily_buy_limit: 0,
  authorities: DEFAULT_AUTHORITIES_CONFIG,
  mainnet_promotion: DEFAULT_PROMOTION_CONFIG,
};

// Normalize a raw admin_config blob into the strict TokenFactoryPricing shape,
// upgrading legacy rows that only had freeze/update/mint flat fees.
export const normalizePricing = (raw: any): TokenFactoryPricing => {
  const r = raw ?? {};
  const authorities: AuthoritiesConfig = { ...DEFAULT_AUTHORITIES_CONFIG };
  if (r.authorities && typeof r.authorities === 'object') {
    for (const k of Object.keys(authorities) as AuthorityKey[]) {
      const a = r.authorities[k];
      if (a) authorities[k] = { enabled: !!a.enabled, fee: Number(a.fee) || 0 };
    }
  }
  // Legacy migration: if old flat fees exist and new authorities config is at defaults, prefer the legacy values.
  if (typeof r.freeze_authority_fee === 'number') authorities.freeze.fee = r.freeze_authority_fee;
  if (typeof r.update_authority_fee === 'number') authorities.update.fee = r.update_authority_fee;
  if (typeof r.mint_authority_fee   === 'number') authorities.mint.fee   = r.mint_authority_fee;

  const promotion: MainnetPromotionConfig = {
    ...DEFAULT_PROMOTION_CONFIG,
    ...(r.mainnet_promotion ?? {}),
  };

  return {
    deployment_fee: Number(r.deployment_fee) || DEFAULT_PRICING.deployment_fee,
    min_liquidity:  Number(r.min_liquidity)  || DEFAULT_PRICING.min_liquidity,
    global_max_buy_per_wallet: Number(r.global_max_buy_per_wallet) || 0,
    global_daily_buy_limit:    Number(r.global_daily_buy_limit)    || 0,
    authorities,
    mainnet_promotion: promotion,
  };
};
