export function truncateAddress(addr: string | undefined, chars = 6): string {
  if (!addr) return "—";
  if (addr.length <= chars * 2 + 2) return addr;
  return `${addr.slice(0, chars)}...${addr.slice(-4)}`;
}

export function formatDistanceToNow(timestamp: string | number): string {
  const date = typeof timestamp === "string" ? new Date(timestamp) : new Date(timestamp);
  const now = Date.now();
  const diff = Math.floor((now - date.getTime()) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export function formatNumber(n: number | string | undefined, decimals = 2): string {
  const num = Number(n);
  if (isNaN(num)) return "—";
  if (num >= 1e9) return `${(num / 1e9).toFixed(decimals)}B`;
  if (num >= 1e6) return `${(num / 1e6).toFixed(decimals)}M`;
  if (num >= 1e3) return `${(num / 1e3).toFixed(decimals)}K`;
  return num.toFixed(decimals);
}

export function formatHash(hash: string | undefined): string {
  if (!hash) return "—";
  return `${hash.slice(0, 8)}...${hash.slice(-6)}`;
}

export function msToCountdown(ms: number): string {
  if (ms <= 0) return "Ready";
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}
