import { describe, expect, it, vi } from "vitest";
import {
  fetchOraclePriceUpdates,
  getOracleFeedHealth,
} from "../../server/oraclePriceFeeds";

const now = Date.UTC(2026, 10, 20, 12, 0, 0);

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

function providerFetch(overrides: { bitcoin?: unknown; ethereum?: unknown } = {}) {
  return vi.fn(async (input: string | URL | Request) => {
    const url = String(input);
    if (url.includes("coingecko.com")) {
      return jsonResponse({
        bitcoin: overrides.bitcoin ?? {
          usd: 67_000.125,
          last_updated_at: Math.floor((now - 30_000) / 1000),
        },
        ethereum: overrides.ethereum ?? {
          usd: 3_400.5,
          last_updated_at: Math.floor((now - 30_000) / 1000),
        },
      });
    }
    throw new Error(`Unexpected price source: ${url}`);
  }) as unknown as typeof fetch;
}

describe("automatic oracle price refresh", () => {
  it("accepts recent verified provider prices and never invents a GYDS quote", async () => {
    const result = await fetchOraclePriceUpdates(providerFetch(), now);

    expect(result.updates.map((update) => update.feedId)).toEqual(["BTC/USD", "ETH/USD"]);
    expect(result.updates.find((update) => update.feedId === "BTC/USD")?.value).toBe("67000.125");
    expect(result.errors["GYD/USD"]).toMatch(/Fiat exchange rates are not treated as token prices/);
    expect(result.errors["GYDS/USD"]).toMatch(/No verified public market listing/);
  });

  it("rejects stale and invalid upstream quotes", async () => {
    const fetcher = providerFetch({
      bitcoin: {
        usd: 67_000,
        last_updated_at: Math.floor((now - 10 * 60_000) / 1000),
      },
      ethereum: {
        usd: -1,
        last_updated_at: Math.floor((now - 30_000) / 1000),
      },
    });
    const result = await fetchOraclePriceUpdates(fetcher, now);

    expect(result.updates.some((update) => update.feedId === "BTC/USD")).toBe(false);
    expect(result.updates.some((update) => update.feedId === "ETH/USD")).toBe(false);
    expect(result.errors["BTC/USD"]).toMatch(/recent USD price/);
    expect(result.errors["ETH/USD"]).toMatch(/positive, recent USD price/);
  });

  it("reports provider outages without returning old or fabricated values", async () => {
    const fetcher = vi.fn(async () => jsonResponse({ error: "temporarily unavailable" }, 503)) as unknown as typeof fetch;
    const result = await fetchOraclePriceUpdates(fetcher, now);

    expect(result.updates).toEqual([]);
    expect(result.errors["BTC/USD"]).toMatch(/HTTP 503/);
    expect(result.errors["ETH/USD"]).toMatch(/HTTP 503/);
  });

  it("serves only fresh supported provider values as live", () => {
    const live = getOracleFeedHealth({
      feed_id: "BTC/USD",
      value: "67000",
      provider: "CoinGecko",
      active: true,
      source_updated_at: new Date(now - 30_000),
      last_updated: new Date(now - 10_000),
    }, now);
    const stale = getOracleFeedHealth({
      feed_id: "BTC/USD",
      value: "67000",
      provider: "CoinGecko",
      active: true,
      source_updated_at: new Date(now - 10 * 60_000),
      last_updated: new Date(now - 10 * 60_000),
    }, now);
    const manual = getOracleFeedHealth({
      feed_id: "GYDS/USD",
      value: "0.08",
      provider: "manual",
      active: true,
      last_updated: new Date(now),
    }, now);

    expect(live.status).toBe("live");
    expect(stale.status).toBe("stale");
    expect(manual.status).toBe("unavailable");
    expect(manual.source).toBeNull();
  });
});
