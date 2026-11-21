export interface OraclePriceUpdate {
  feedId: string;
  value: string;
  provider: string;
  sourceUpdatedAt: Date;
}

export interface OraclePriceFetchResult {
  updates: OraclePriceUpdate[];
  errors: Record<string, string>;
}

export interface OracleFeedHealth {
  status: "live" | "stale" | "pending" | "unavailable" | "disabled";
  source: string | null;
  sourceUpdatedAt: string | null;
  fetchedAt: string | null;
  lastAttemptedAt: string | null;
  ageMs: number | null;
  error: string | null;
}

const CRYPTO_MAX_AGE_MS = 5 * 60_000;
const FUTURE_CLOCK_TOLERANCE_MS = 60_000;
const REFRESH_COOLDOWN_MS = 45_000;

const LIVE_FEED_SOURCES: Record<string, { provider: string; maxAgeMs: number }> = {
  "BTC/USD": { provider: "CoinGecko", maxAgeMs: CRYPTO_MAX_AGE_MS },
  "ETH/USD": { provider: "CoinGecko", maxAgeMs: CRYPTO_MAX_AGE_MS },
};

const COINGECKO_URL =
  "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum&vs_currencies=usd&include_last_updated_at=true";
const GYD_SOURCE_UNAVAILABLE =
  "No verified token market or deployed on-chain price feed is configured for GYD/USD. Fiat exchange rates are not treated as token prices.";
const GYDS_SOURCE_UNAVAILABLE =
  "No verified public market listing or deployed on-chain pool is configured for GYDS/USD.";

function errorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.slice(0, 240);
}

function priceDecimal(value: unknown): string | null {
  const price = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(price) || price <= 0) return null;
  const rounded = Number(price.toFixed(12));
  return Number.isFinite(rounded) && rounded > 0 ? String(rounded) : null;
}

function sourceDate(value: unknown, now: number, maxAgeMs: number): Date | null {
  const seconds = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  const timestamp = seconds * 1000;
  const age = now - timestamp;
  if (age < -FUTURE_CLOCK_TOLERANCE_MS || age > maxAgeMs) return null;
  return new Date(timestamp);
}

async function readJson(
  fetcher: typeof fetch,
  url: string,
): Promise<{ ok: boolean; status: number; data: any }> {
  const response = await fetcher(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(7_000),
  });
  if (!response.ok) throw new Error(`Provider returned HTTP ${response.status}.`);
  return { ok: response.ok, status: response.status, data: await response.json() };
}

export async function fetchOraclePriceUpdates(
  fetcher: typeof fetch = fetch,
  now = Date.now(),
): Promise<OraclePriceFetchResult> {
  const updates: OraclePriceUpdate[] = [];
  const errors: Record<string, string> = {};

  try {
    const { data } = await readJson(fetcher, COINGECKO_URL);
    for (const [feedId, coinId] of [
      ["BTC/USD", "bitcoin"],
      ["ETH/USD", "ethereum"],
    ] as const) {
      const entry = data?.[coinId];
      const value = priceDecimal(entry?.usd);
      const updatedAt = sourceDate(entry?.last_updated_at, now, CRYPTO_MAX_AGE_MS);
      if (!value || !updatedAt) {
        errors[feedId] = "CoinGecko did not return a positive, recent USD price.";
        continue;
      }
      updates.push({ feedId, value, provider: "CoinGecko", sourceUpdatedAt: updatedAt });
    }
  } catch (error) {
    const message = `CoinGecko refresh failed: ${errorMessage(error)}`;
    errors["BTC/USD"] = message;
    errors["ETH/USD"] = message;
  }

  // A fiat GYD/USD exchange rate does not prove the market price of the
  // project's GYD token, so it must not be substituted for a token quote.
  errors["GYD/USD"] = GYD_SOURCE_UNAVAILABLE;
  errors["GYDS/USD"] = GYDS_SOURCE_UNAVAILABLE;
  return { updates, errors };
}

export function getOracleFeedHealth(
  feed: {
    feed_id?: unknown;
    value?: unknown;
    provider?: unknown;
    active?: unknown;
    source_updated_at?: unknown;
    last_updated?: unknown;
    last_refresh_attempted_at?: unknown;
    refresh_error?: unknown;
  },
  now = Date.now(),
): OracleFeedHealth {
  const feedId = String(feed.feed_id ?? "").trim().toUpperCase();
  const sourceConfig = LIVE_FEED_SOURCES[feedId];
  const error = typeof feed.refresh_error === "string" && feed.refresh_error
    ? feed.refresh_error
    : null;
  const parseDate = (value: unknown): number | null => {
    if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.getTime() : null;
    if (typeof value !== "string" && typeof value !== "number") return null;
    const parsed = new Date(value).getTime();
    return Number.isFinite(parsed) ? parsed : null;
  };

  const sourceTimestamp = parseDate(feed.source_updated_at);
  const fetchedTimestamp = parseDate(feed.last_updated);
  const attemptedTimestamp = parseDate(feed.last_refresh_attempted_at);
  const sourceUpdatedAt = sourceTimestamp === null ? null : new Date(sourceTimestamp).toISOString();
  const fetchedAt = fetchedTimestamp === null ? null : new Date(fetchedTimestamp).toISOString();
  const lastAttemptedAt = attemptedTimestamp === null ? null : new Date(attemptedTimestamp).toISOString();
  const ageMs = sourceTimestamp === null ? null : Math.max(0, now - sourceTimestamp);
  const numericValue = Number(feed.value);

  if (feed.active === false) {
    return {
      status: "disabled",
      source: sourceConfig?.provider ?? null,
      sourceUpdatedAt,
      fetchedAt,
      lastAttemptedAt,
      ageMs,
      error,
    };
  }
  if (!sourceConfig) {
    return {
      status: "unavailable",
      source: null,
      sourceUpdatedAt: null,
      fetchedAt,
      lastAttemptedAt,
      ageMs: null,
      error: error ?? (
        feedId === "GYDS/USD"
          ? GYDS_SOURCE_UNAVAILABLE
          : feedId === "GYD/USD"
            ? GYD_SOURCE_UNAVAILABLE
            : `No verified live source is configured for ${feedId || "this feed"}.`
      ),
    };
  }

  const provider = String(feed.provider ?? "");
  if (
    provider !== sourceConfig.provider ||
    sourceTimestamp === null ||
    !Number.isFinite(numericValue) ||
    numericValue <= 0
  ) {
    return {
      status: error ? "unavailable" : "pending",
      source: provider === sourceConfig.provider ? provider : null,
      sourceUpdatedAt,
      fetchedAt,
      lastAttemptedAt,
      ageMs,
      error,
    };
  }

  if (sourceTimestamp - now > FUTURE_CLOCK_TOLERANCE_MS || ageMs! > sourceConfig.maxAgeMs) {
    return {
      status: "stale",
      source: provider,
      sourceUpdatedAt,
      fetchedAt,
      lastAttemptedAt,
      ageMs,
      error,
    };
  }

  return { status: "live", source: provider, sourceUpdatedAt, fetchedAt, lastAttemptedAt, ageMs, error };
}

let refreshInFlight: Promise<{
  updated: string[];
  failed: Record<string, string>;
  skipped: boolean;
}> | null = null;
let lastRefreshStartedAt = 0;

export function refreshOracleFeeds(): Promise<{
  updated: string[];
  failed: Record<string, string>;
  skipped: boolean;
}> {
  if (refreshInFlight) return refreshInFlight;
  if (Date.now() - lastRefreshStartedAt < REFRESH_COOLDOWN_MS) {
    return Promise.resolve({ updated: [], failed: {}, skipped: true });
  }

  lastRefreshStartedAt = Date.now();
  refreshInFlight = (async () => {
    const { storage } = await import("./storage");
    const feeds = await storage.getOracleFeeds();
    const activeFeeds = new Set(
      feeds.filter((feed: any) => feed.active).map((feed: any) => String(feed.feed_id).toUpperCase()),
    );
    const fetched = await fetchOraclePriceUpdates();
    const updated: string[] = [];
    const failed: Record<string, string> = {};

    for (const price of fetched.updates) {
      if (!activeFeeds.has(price.feedId)) continue;
      try {
        await storage.updateOracleFeedFromSource(price);
        updated.push(price.feedId);
      } catch (error) {
        failed[price.feedId] = `Could not save live price: ${errorMessage(error)}`;
      }
    }

    for (const [feedId, message] of Object.entries(fetched.errors)) {
      if (!activeFeeds.has(feedId)) continue;
      failed[feedId] = message;
      try {
        await storage.recordOracleFeedRefreshFailure(feedId, message);
      } catch (error) {
        failed[feedId] = `${message} Could not record refresh status: ${errorMessage(error)}`;
      }
    }

    return { updated, failed, skipped: false };
  })().finally(() => {
    refreshInFlight = null;
  });
  return refreshInFlight;
}
