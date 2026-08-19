import { pool as pgPool } from "./db";

export type CurrencyCode = "USD" | "EUR" | "GBP" | "CAD" | "AUD" | "GYD" | "JMD";

const FALLBACK_RATES: Record<CurrencyCode, number> = {
  USD: 1,
  EUR: 0.92,
  GBP: 0.79,
  CAD: 1.36,
  AUD: 1.53,
  GYD: 209.0,
  JMD: 156.5,
};

interface RateCache {
  rates: Record<CurrencyCode, number>;
  fetchedAt: number;
  fallback: boolean;
}

let _cache: RateCache | null = null;
const CACHE_TTL_MS = 15 * 60 * 1000;

export async function getExchangeRates(): Promise<RateCache> {
  if (_cache && Date.now() - _cache.fetchedAt < CACHE_TTL_MS) {
    return _cache;
  }

  // Try multiple free APIs in order
  const APIS = [
    async () => {
      const res = await fetch("https://open.er-api.com/v6/latest/USD", { signal: AbortSignal.timeout(7000) });
      if (!res.ok) throw new Error(`er-api HTTP ${res.status}`);
      const data = await res.json();
      if (data?.result !== "success" || !data?.rates) throw new Error("er-api bad response");
      return data.rates as Record<string, number>;
    },
    async () => {
      const res = await fetch("https://api.frankfurter.app/latest?from=USD&to=EUR,GBP,CAD,AUD", { signal: AbortSignal.timeout(7000) });
      if (!res.ok) throw new Error(`frankfurter HTTP ${res.status}`);
      const data = await res.json();
      if (!data?.rates) throw new Error("frankfurter bad response");
      // Frankfurter doesn't have GYD/JMD — supplement with fallback for those
      return { USD: 1, ...data.rates, GYD: FALLBACK_RATES.GYD, JMD: FALLBACK_RATES.JMD } as Record<string, number>;
    },
  ];

  for (const tryApi of APIS) {
    try {
      const rawRates = await tryApi();
      const rates: Record<CurrencyCode, number> = { ...FALLBACK_RATES };
      for (const code of Object.keys(FALLBACK_RATES) as CurrencyCode[]) {
        if (typeof rawRates[code] === "number" && rawRates[code] > 0) {
          rates[code] = rawRates[code];
        }
      }
      rates.USD = 1;
      _cache = { rates, fetchedAt: Date.now(), fallback: false };
      console.log("[exchange-rates] Fetched live rates successfully");
      return _cache;
    } catch (err: any) {
      console.warn("[exchange-rates] API attempt failed:", err.message);
    }
  }

  console.warn("[exchange-rates] All APIs failed, using fallback rates");
  _cache = { rates: { ...FALLBACK_RATES }, fetchedAt: Date.now(), fallback: true };
  return _cache;
}

export async function ensurePreferredCurrencyColumn(): Promise<void> {
  try {
    await pgPool.query(`
      ALTER TABLE profiles
      ADD COLUMN IF NOT EXISTS preferred_currency TEXT NOT NULL DEFAULT 'USD'
    `);
    console.log("[currency] preferred_currency column ready");
  } catch (e: any) {
    console.warn("[currency] column check:", e.message);
  }
}
