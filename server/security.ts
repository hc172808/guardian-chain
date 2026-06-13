/**
 * AI Firewall — real-time server-side security enforcement.
 * Loaded from admin_config at startup and refreshed every 5 min.
 * Provides:
 *   - IP block-list enforcement
 *   - Lockdown mode
 *   - Adaptive rate limiting (sensitivity-based)
 *   - Payload attack-pattern detection
 *   - Auto-block at high sensitivity
 */
import { storage } from "./storage";

// ── In-memory state ──────────────────────────────────────────────────────────
const blockedIps = new Set<string>();
// IPs that always bypass the firewall
const ALWAYS_ALLOW = new Set<string>(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);

let firewallEnabled   = true;
let lockdownMode      = false;
let autoBlock         = true;
let scanPayloads      = true;
let sensitivityLevel  = 6;
let lastRefresh       = 0;
const REFRESH_MS      = 5 * 60_000; // 5 min

// Per-IP sliding window
const reqWindows = new Map<string, { count: number; start: number }>();

// Counters exposed to the status endpoint
export const securityStats = { blocked: 0, rateBlocked: 0, payloadBlocked: 0 };

// ── Attack patterns ──────────────────────────────────────────────────────────
const ATTACK_PATTERNS: { name: string; re: RegExp; severity: "medium" | "high" | "critical" }[] = [
  { name: "SQL injection",     re: /('|--).*?(;|DROP\s+TABLE|INSERT\s+INTO|SELECT\s+.*FROM|UNION\s+SELECT)/i, severity: "critical" },
  { name: "Path traversal",    re: /\.\.[/\\]/,              severity: "high"     },
  { name: "Shell injection",   re: /[;&|`$]\s*(rm|cat|bash|sh|python|wget|curl)\b/i, severity: "critical" },
  { name: "XSS attempt",       re: /<script[\s>]|javascript:|on\w+\s*=/i,           severity: "high"     },
  { name: "SSRF attempt",      re: /https?:\/\/(localhost|127\.|10\.|192\.168\.|169\.254\.)/i, severity: "high" },
  { name: "RPC replay flood",  re: /eth_sendRawTransaction.{0,200}eth_sendRawTransaction/i,   severity: "medium" },
];

// ── Helpers ───────────────────────────────────────────────────────────────────
function getClientIp(req: any): string {
  const fwd = req.headers?.["x-forwarded-for"];
  if (fwd) return String(fwd).split(",")[0].trim();
  return req.socket?.remoteAddress ?? "0.0.0.0";
}

function maxRps(sensitivity: number): number {
  // sensitivity 1→100 rps, 10→15 rps
  return Math.max(15, 110 - sensitivity * 9.5);
}

// ── Public API ────────────────────────────────────────────────────────────────
export function blockIp(ip: string) {
  blockedIps.add(ip);
  persistBlockedIps();
}

export function unblockIp(ip: string) {
  blockedIps.delete(ip);
  persistBlockedIps();
}

export function clearAllBlockedIps() {
  blockedIps.clear();
  persistBlockedIps();
}

export function getBlockedIpList(): string[] {
  return [...blockedIps];
}

export function getFirewallStatus() {
  return {
    enabled:       firewallEnabled,
    lockdown:      lockdownMode,
    autoBlock,
    sensitivity:   sensitivityLevel,
    blockedCount:  blockedIps.size,
    lastRefreshMs: lastRefresh,
    ...securityStats,
  };
}

function persistBlockedIps() {
  storage.upsertConfig("blocked_ips", [...blockedIps] as any).catch(() => {});
}

// ── Load / refresh settings ───────────────────────────────────────────────────
export async function refreshSecuritySettings() {
  try {
    const fwCfg = await storage.getConfig("ai_firewall_settings");
    if (fwCfg?.configValue) {
      const s = fwCfg.configValue as any;
      firewallEnabled  = s.enabled  ?? true;
      autoBlock        = s.auto_block ?? true;
      scanPayloads     = s.scan_payloads ?? true;
      sensitivityLevel = s.sensitivity ?? 6;
      lockdownMode     = s.threat_response === "lockdown";
    }
    const ipCfg = await storage.getConfig("blocked_ips");
    if (ipCfg?.configValue && Array.isArray(ipCfg.configValue)) {
      blockedIps.clear();
      (ipCfg.configValue as string[]).forEach(ip => blockedIps.add(ip));
    }
    lastRefresh = Date.now();
  } catch (e: any) {
    console.warn("[Security] refresh failed:", e.message);
  }
}

// ── Express middleware ────────────────────────────────────────────────────────
export function aiFirewallMiddleware(req: any, res: any, next: any) {
  // Skip static assets
  const path: string = req.path ?? "";
  if (
    path.startsWith("/assets/") ||
    path === "/favicon.ico" ||
    path === "/health"
  ) return next();

  if (!firewallEnabled) return next();

  // Background-refresh when stale (non-blocking)
  if (Date.now() - lastRefresh > REFRESH_MS) {
    refreshSecuritySettings().catch(() => {});
  }

  const ip = getClientIp(req);

  // Always-allowed IPs (loopback / internal)
  if (ALWAYS_ALLOW.has(ip)) return next();

  // Lockdown — allow only auth routes
  if (lockdownMode && !path.startsWith("/api/auth")) {
    securityStats.blocked++;
    return res.status(503).json({
      error: "Service temporarily unavailable — network lockdown is active.",
      code: "LOCKDOWN",
    });
  }

  // Blocked IP
  if (blockedIps.has(ip)) {
    securityStats.blocked++;
    return res.status(403).json({ error: "Access denied.", code: "IP_BLOCKED" });
  }

  // Rate limiting (API routes only)
  if (path.startsWith("/api/") && sensitivityLevel >= 3) {
    const limit = maxRps(sensitivityLevel);
    const now   = Date.now();
    const win   = reqWindows.get(ip);
    if (!win || now - win.start > 60_000) {
      reqWindows.set(ip, { count: 1, start: now });
    } else {
      win.count++;
      if (win.count > limit) {
        securityStats.rateBlocked++;
        if (autoBlock && sensitivityLevel >= 8) {
          blockIp(ip);
          console.warn(`[Security] Auto-blocked ${ip} — rate limit exceeded (${win.count} req/min)`);
        }
        return res.status(429).json({
          error: "Rate limit exceeded. Slow down.",
          code: "RATE_LIMITED",
          retryAfter: Math.ceil((win.start + 60_000 - now) / 1000),
        });
      }
    }
  }

  // Payload inspection
  if (scanPayloads && sensitivityLevel >= 4 && req.body && typeof req.body === "object") {
    const body = JSON.stringify(req.body);
    for (const { name, re, severity } of ATTACK_PATTERNS) {
      if (re.test(body)) {
        securityStats.payloadBlocked++;
        console.warn(`[Security] ${severity.toUpperCase()} attack from ${ip}: ${name}`);
        if (autoBlock && sensitivityLevel >= 6) {
          blockIp(ip);
          return res.status(403).json({
            error: `Request blocked — ${name} detected.`,
            code: "PAYLOAD_BLOCKED",
          });
        }
      }
    }
  }

  next();
}
