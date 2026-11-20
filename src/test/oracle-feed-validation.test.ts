import { describe, expect, it } from "vitest";
import {
  normalizeOracleDecimals,
  normalizeOracleFeedId,
  normalizeOracleValue,
} from "../../server/oracleFeedValidation";

describe("oracle feed configuration validation", () => {
  it("normalizes valid feed symbols and pairs", () => {
    expect(normalizeOracleFeedId(" gyds/usd ")).toBe("GYDS/USD");
    expect(normalizeOracleFeedId("btc")).toBe("BTC");
  });

  it("rejects malformed feed IDs", () => {
    expect(normalizeOracleFeedId("")).toBeNull();
    expect(normalizeOracleFeedId("GYDS/USD/ETH")).toBeNull();
    expect(normalizeOracleFeedId("GYDS USD")).toBeNull();
    expect(normalizeOracleFeedId("A".repeat(21))).toBeNull();
  });

  it("accepts non-negative decimal prices without accepting exponent or negative forms", () => {
    expect(normalizeOracleValue("0.0000001")).toBe("0.0000001");
    expect(normalizeOracleValue(1e-7)).toBe("0.0000001");
    expect(normalizeOracleValue("0")).toBe("0");
    expect(normalizeOracleValue("-1")).toBeNull();
    expect(normalizeOracleValue("1e3")).toBeNull();
    expect(normalizeOracleValue(Number.NaN)).toBeNull();
  });

  it("limits feed decimals to integers from zero through eighteen", () => {
    expect(normalizeOracleDecimals(undefined)).toBe(8);
    expect(normalizeOracleDecimals("18")).toBe(18);
    expect(normalizeOracleDecimals("")).toBeNull();
    expect(normalizeOracleDecimals(19)).toBeNull();
    expect(normalizeOracleDecimals(2.5)).toBeNull();
  });
});
