export function normalizeOracleFeedId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const feedId = value.trim().toUpperCase();
  return /^[A-Z0-9][A-Z0-9._-]{0,19}(?:\/[A-Z0-9][A-Z0-9._-]{0,19})?$/.test(feedId)
    ? feedId
    : null;
}

export function normalizeOracleValue(value: unknown): string | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const normalized = typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value.toLocaleString("en-US", { useGrouping: false, maximumFractionDigits: 18 })
    : String(value).trim();
  if (normalized.length > 80 || !/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(normalized)) return null;
  if (!Number.isFinite(Number(normalized)) || Number(normalized) < 0) return null;
  return normalized;
}

export function normalizeOracleDecimals(value: unknown, defaultValue = 8): number | null {
  if (value === null || (typeof value === "string" && !/^\d+$/.test(value.trim()))) return null;
  const decimals = value === undefined ? defaultValue : Number(value);
  return Number.isInteger(decimals) && decimals >= 0 && decimals <= 18
    ? decimals
    : null;
}
