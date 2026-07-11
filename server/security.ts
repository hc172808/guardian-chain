/**
 * Firewall & DDoS Protection — real-time server-side security enforcement.
 * Loaded from admin_config at startup and refreshed every 5 min.
 *
 * Layers (applied in order):
 *  1. Static-asset bypass
 *  2. Firewall enabled check
 *  3. Background settings refresh
 *  4. Always-allow IPs (loopback/internal)
 *  5. Lockdown mode
 *  6. Permanent IP block-list
 *  7. Temporary ban check (escalating: 5m → 30m → 4h → permanent)
 *  8. Honeypot path detection → instant temp-ban
 *  9. Suspicious User-Agent detection → temp-ban
 * 10. Burst detection: >20 req in 5 s → DDoS flag → temp-ban
 * 11. Sustained rate limiting: >N req/min → progressive penalty
 * 12. Payload attack-pattern detection (body + query string)
 * 13. Auto-block at high sensitivity
 */
import { storage } from "./storage";
import { pool as pgConnPool } from "./db";

// ── In-memory state ──────────────────────────────────────────────────────────
const blockedIps   = new Set<string>();                  // permanent bans

// IPs that bypass ALL firewall checks — loopback + anything in IP_WHITELIST env var.
// IP_WHITELIST=1.2.3.4,5.6.7.8  (comma-separated, supports CIDR notation stripped to host)
const ALWAYS_ALLOW = new Set<string>(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);
(function loadEnvWhitelist() {
  const raw = process.env.IP_WHITELIST ?? "";
  raw.split(",").map(s => s.trim()).filter(Boolean).forEach(ip => {
    // Normalise "::ffff:x" → "x" and "::1" → "127.0.0.1" for consistency
    if (ip.startsWith("::ffff:")) ip = ip.slice(7);
    if (ip === "::1") ip = "127.0.0.1";
    ALWAYS_ALLOW.add(ip);
    console.log(`[Security] Whitelisted IP from env: ${ip}`);
  });
})();

let firewallEnabled  = true;
let lockdownMode     = false;
let autoBlock        = true;
let scanPayloads     = true;
let sensitivityLevel = 6;
let lastRefresh      = 0;
const REFRESH_MS     = 5 * 60_000;

// Per-IP request windows
const reqWindows   = new Map<string, { count: number; start: number }>();  // 60-second window
const burstWindows = new Map<string, { count: number; start: number }>();  // 5-second burst window
const BURST_WINDOW_MS  = 5_000;
const BURST_THRESHOLD  = 25;  // >25 req in 5 s triggers DDoS classification

// Progressive temporary bans — escalating durations per IP
interface TempBan { expiresAt: number; strikes: number; }
const tempBanned = new Map<string, TempBan>();
const BAN_DURATIONS_MS = [
  5  * 60_000,   // strike 1 → 5 min
  30 * 60_000,   // strike 2 → 30 min
  4  * 60 * 60_000, // strike 3 → 4 h
];                // strike 4+ → permanent (moved to blockedIps)

// Counters exposed to the status endpoint
export const securityStats = {
  blocked: 0,
  rateBlocked: 0,
  payloadBlocked: 0,
  burstBlocked: 0,
  honeypotBlocked: 0,
  uaBlocked: 0,
  tempBanned: 0,
};

// ── Attack patterns (body + query string) ────────────────────────────────────
const ATTACK_PATTERNS: { name: string; re: RegExp; severity: "medium" | "high" | "critical" }[] = [
  // Injection
  { name: "SQL injection",            re: /('|--).*?(;|DROP\s+TABLE|INSERT\s+INTO|SELECT\s+.*FROM|UNION\s+SELECT)/i,           severity: "critical" },
  { name: "NoSQL injection",          re: /\$where|\$gt|\$lt|\$ne|\$regex|\$exists|\$not\s*:/i,                               severity: "high"     },
  { name: "LDAP injection",           re: /[()&|!][^)]{0,30}\)|\*\)\([^)]{0,30}=/,                                           severity: "high"     },
  // Command / path
  { name: "Shell injection",          re: /[;&|`$]\s*(rm|cat|bash|sh|python|wget|curl|chmod|nc|netcat)\b/i,                   severity: "critical" },
  { name: "Path traversal",           re: /\.\.[/\\]|%2e%2e[/\\%]|\.\.%2f|%252e%252e/i,                                      severity: "high"     },
  { name: "Null byte injection",      re: /%00|\x00/,                                                                         severity: "high"     },
  // XSS / template / code
  { name: "XSS attempt",             re: /<script[\s>]|javascript:|on\w+\s*=/i,                                               severity: "high"     },
  { name: "SSTI",                     re: /\{\{.*?\}\}|\{%.*?%\}|\$\{[^}]{2,}\}/,                                             severity: "high"     },
  { name: "PHP object injection",     re: /O:\d+:"[A-Za-z]+":\d+:\{/i,                                                        severity: "high"     },
  // XXE / XML
  { name: "XXE injection",            re: /<!ENTITY\s+\w+\s+SYSTEM\s+["']/i,                                                  severity: "critical" },
  { name: "XML bomb / injection",     re: /<!DOCTYPE[^>]*\[|<!\[CDATA\[/i,                                                    severity: "high"     },
  // Network / header attacks
  { name: "SSRF attempt",             re: /https?:\/\/(localhost|127\.|10\.|192\.168\.|169\.254\.|0\.0\.0\.0|::1)/i,          severity: "high"     },
  { name: "HTTP response splitting",  re: /[\r\n]+(Content-Type|Location|Set-Cookie|X-)\s*:/i,                                severity: "critical" },
  // Log4Shell
  { name: "Log4Shell",                re: /\$\{jndi:(ldap|dns|rmi|http|ldaps|iiop|corba|nis|nds):\/\//i,                     severity: "critical" },
  // Privilege escalation probes
  { name: "Mass assignment probe",    re: /"(is_admin|_isAdmin|isFounder|is_superuser|role|sudo|root)"\s*:\s*(true|1|"admin"|"root"|"founder")/i, severity: "high" },
  // Blockchain-specific
  { name: "RPC replay flood",         re: /eth_sendRawTransaction.{0,200}eth_sendRawTransaction/i,                             severity: "medium"   },
  { name: "Private key exposure",     re: /0x[0-9a-fA-F]{64}/,                                                                severity: "medium"   },
];

// ── Honeypot paths — scanners that hit these get temp-banned immediately ─────
const HONEYPOT_PATHS = new Set([
  // WordPress probes
  "/wp-admin", "/wp-login.php", "/wp-content", "/wp-includes",
  "/wp-cron.php", "/wp-config.php", "/wordpress/wp-admin",
  // Common shells
  "/shell.php", "/cmd.php", "/webshell.php", "/c99.php", "/r57.php",
  "/b374k.php", "/wso.php", "/alfa.php", "/priv8.php",
  // Config / secret exposure
  "/.env", "/.env.local", "/.env.production", "/.env.development",
  "/.git/config", "/.git/HEAD", "/.htaccess", "/.htpasswd",
  "/config.php", "/config.yml", "/config.yaml",
  // PHPMyAdmin / DB admin
  "/phpmyadmin", "/phpMyAdmin", "/pma", "/mysql", "/adminer.php",
  "/db-admin", "/myadmin",
  // XML-RPC / legacy
  "/xmlrpc.php", "/cgi-bin/php",
  // Java / Spring Actuator
  "/actuator", "/actuator/env", "/actuator/heapdump", "/actuator/beans",
  "/actuator/health/liveness",
  // Tomcat
  "/manager/html", "/host-manager/html", "/jmx-console", "/web-console",
  // Apache
  "/server-status", "/server-info",
  // Kubernetes / cloud metadata probes
  "/api/v1/pods", "/api/v1/secrets", "/api/v1/namespaces",
  "/latest/meta-data", "/computeMetadata/v1",
  // Laravel
  "/telescope/requests", "/_ignition/execute-solution",
  // System files
  "/etc/passwd", "/etc/shadow", "/proc/self/environ",
  // Misc
  "/.DS_Store", "/robots.txt.bak", "/web.config",
  "/crossdomain.xml", "/clientaccesspolicy.xml",
  "/solr/admin", "/solr/",
]);

function isHoneypotPath(p: string): boolean {
  const lc = p.toLowerCase().split("?")[0]; // strip query string
  if (HONEYPOT_PATHS.has(lc)) return true;
  // Fuzzy: any path with a .php / .asp / .cgi extension (our app has none)
  if (/\.(php\d?|asp|aspx|jsp|cgi|pl|sh|bat|cfm|shtml)(\?|$)/.test(lc)) return true;
  // Any /wp-* path
  if (lc.startsWith("/wp-")) return true;
  // Git / svn / hg probe (with or without trailing slash)
  if (lc === "/.git" || lc.includes("/.git/") || lc === "/.svn" || lc.includes("/.svn/") || lc === "/.hg" || lc.includes("/.hg/")) return true;
  // Double-encoded traversal
  if (lc.includes("%252e") || lc.includes("%252f")) return true;
  return false;
}

// ── Suspicious User-Agent patterns ───────────────────────────────────────────
const BAD_UA_PATTERNS: RegExp[] = [
  /sqlmap/i,
  /nikto/i,
  /\bnmap\b/i,
  /masscan/i,
  /zgrab/i,
  /acunetix/i,
  /nessus/i,
  /openvas/i,
  /w3af/i,
  /dirbuster/i,
  /gobuster/i,
  /\bwfuzz\b/i,
  /\bhydra\b/i,
  /metasploit/i,
  /havij/i,
  /burpsuite/i,
  /owasp[\s_-]?zap/i,
  /libwww-perl/i,
  /python-requests\/[01]\./i,   // very old python-requests often used in attack scripts
  /\bshodan\b/i,
  /\bcensys\b/i,
  /\bsemrushbot\b/i,
  /\bahrefs\b/i,
  /\bmajestic\b/i,
  /\bpetalbot\b/i,
  /\bxenu\b/i,
  /\bharvest\b/i,
  /\bemail\s*extractor\b/i,
  /\bspider\b.*\bscan/i,
  /scanner\/\d/i,
  /nuclei\//i,
  /ncrack/i,
  /\bfuzz\b/i,
];

// ── Helpers ───────────────────────────────────────────────────────────────────
// Trusted proxy allowlist for forwarded-IP headers. Only when the immediate
// TCP peer (`req.socket.remoteAddress`) is in this set will we trust
// CF-Connecting-IP / True-Client-IP / X-Real-IP / X-Forwarded-For — otherwise
// those headers are ignored (they can be spoofed by any HTTP client).
// Loopback is always trusted (Express `app.set('trust proxy', 1)` handles req.ip);
// extend via env var TRUSTED_PROXIES="1.2.3.4,10.0.0.5".
const TRUSTED_PROXIES = new Set<string>(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);
(function loadTrustedProxies() {
  const raw = process.env.TRUSTED_PROXIES ?? "";
  raw.split(",").map(s => s.trim()).filter(Boolean).forEach(ip => {
    if (ip.startsWith("::ffff:")) ip = ip.slice(7);
    if (ip === "::1") ip = "127.0.0.1";
    TRUSTED_PROXIES.add(ip);
    console.log(`[Security] Trusted proxy from env: ${ip}`);
  });
})();

// ── Cloudflare edge IP ranges ──────────────────────────────────────────────────
// Published at https://www.cloudflare.com/ips/ — rarely changes. When a request's
// immediate TCP peer falls in one of these ranges, we know it really did come
// through Cloudflare's edge, so it's safe to trust the CF-Connecting-IP header
// for the *real* visitor IP. Without this, every visitor behind Cloudflare looks
// like they share Cloudflare's edge IP — which means one auto-ban (e.g. from one
// abusive visitor) blocks EVERY visitor, including the site owner.
// Disable with CLOUDFLARE_TRUST=false if you are not using Cloudflare.
const CLOUDFLARE_CIDRS = [
  "173.245.48.0/20", "103.21.244.0/22", "103.22.200.0/22", "103.31.4.0/22",
  "141.101.64.0/18", "108.162.192.0/18", "190.93.240.0/20", "188.114.96.0/20",
  "197.234.240.0/22", "198.41.128.0/17", "162.158.0.0/15", "104.16.0.0/13",
  "104.24.0.0/14", "172.64.0.0/13", "131.0.72.0/22",
  "2400:cb00::/32", "2606:4700::/32", "2803:f800::/32", "2405:b500::/32",
  "2405:8100::/32", "2a06:98c0::/29", "2c0f:f248::/32",
];
const CLOUDFLARE_TRUST_ENABLED = process.env.CLOUDFLARE_TRUST !== "false";

function ip4ToLong(ip: string): number | null {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some(p => isNaN(p) || p < 0 || p > 255)) return null;
  return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
}

function ip6ToBig(ip: string): bigint | null {
  // Expand "::" shorthand into 8 groups of 16 bits.
  const parts = ip.split("::");
  if (parts.length > 2) return null;
  const head = parts[0] ? parts[0].split(":").filter(Boolean) : [];
  const tail = parts.length === 2 && parts[1] ? parts[1].split(":").filter(Boolean) : [];
  const missing = 8 - head.length - tail.length;
  if (parts.length === 1 && missing !== 0) return null; // no "::" but not full 8 groups
  const groups = parts.length === 2 ? [...head, ...Array(Math.max(missing, 0)).fill("0"), ...tail] : head;
  if (groups.length !== 8) return null;
  try {
    return groups.reduce((acc, g) => (acc << 16n) | BigInt(parseInt(g || "0", 16)), 0n);
  } catch { return null; }
}

function ipInCidr(ip: string, cidr: string): boolean {
  const [range, bitsStr] = cidr.split("/");
  const bits = parseInt(bitsStr, 10);
  if (range.includes(":")) {
    if (!ip.includes(":")) return false;
    const ipBig = ip6ToBig(ip);
    const rangeBig = ip6ToBig(range);
    if (ipBig === null || rangeBig === null) return false;
    const mask = bits === 0 ? 0n : (~0n << BigInt(128 - bits)) & ((1n << 128n) - 1n);
    return (ipBig & mask) === (rangeBig & mask);
  }
  if (ip.includes(":")) return false;
  const ipLong = ip4ToLong(ip);
  const rangeLong = ip4ToLong(range);
  if (ipLong === null || rangeLong === null) return false;
  const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
  return (ipLong & mask) === (rangeLong & mask);
}

export function isCloudflareEdgeIp(ip: string): boolean {
  if (!CLOUDFLARE_TRUST_ENABLED) return false;
  return CLOUDFLARE_CIDRS.some(cidr => ipInCidr(ip, cidr));
}

function normalizeIp(ip: string): string {
  ip = String(ip ?? "").trim();
  if (ip.startsWith("::ffff:")) ip = ip.slice(7);
  if (ip === "::1") ip = "127.0.0.1";
  return ip;
}

export function isTrustedProxy(ip: string): boolean {
  const n = normalizeIp(ip);
  return TRUSTED_PROXIES.has(n) || isCloudflareEdgeIp(n);
}

// Resolve the real *public* client IP behind Cloudflare / Nginx / any reverse proxy.
// Only trusts forwarded-IP headers when the immediate peer is a trusted proxy;
// otherwise falls back to the socket peer address so spoofed headers are ignored.
export function getClientIp(req: any): string {
  const h = req.headers ?? {};
  const pick = (v: any): string => Array.isArray(v) ? v[0] : (typeof v === "string" ? v : "");
  const peer = normalizeIp(req.socket?.remoteAddress ?? req.connection?.remoteAddress ?? "");
  const trusted = !peer || TRUSTED_PROXIES.has(peer) || isCloudflareEdgeIp(peer);

  if (trusted) {
    const forwarded =
      pick(h["cf-connecting-ip"]) ||
      pick(h["true-client-ip"]) ||
      pick(h["x-real-ip"]) ||
      pick(h["x-forwarded-for"]).split(",")[0].trim() ||
      req.ip ||
      peer;
    return normalizeIp(forwarded) || "0.0.0.0";
  }

  // Untrusted peer — reject spoofed headers, use socket address only.
  // Log the first time we see a spoof attempt for observability.
  if (h["x-forwarded-for"] || h["x-real-ip"] || h["cf-connecting-ip"] || h["true-client-ip"]) {
    console.warn(`[Security] Ignoring forwarded-IP headers from untrusted peer ${peer}`);
  }
  return peer || "0.0.0.0";
}

function maxRps(sensitivity: number): number {
  // sensitivity 1→100 rps, 10→15 rps
  return Math.max(15, 110 - sensitivity * 9.5);
}

// ── Temporary ban management ──────────────────────────────────────────────────
function isTempBanned(ip: string): { banned: boolean; ttlSec: number } {
  const ban = tempBanned.get(ip);
  if (!ban) return { banned: false, ttlSec: 0 };
  if (Date.now() >= ban.expiresAt) {
    // Expired — keep strike count but mark as not banned right now
    return { banned: false, ttlSec: 0 };
  }
  return { banned: true, ttlSec: Math.ceil((ban.expiresAt - Date.now()) / 1000) };
}

function addTempBan(ip: string, reason: string): number {
  const existing = tempBanned.get(ip);
  const strikes = (existing?.strikes ?? 0) + 1;

  if (strikes >= 4) {
    // Escalate to permanent block
    blockIp(ip);
    tempBanned.delete(ip);
    console.warn(`[Security] PERMANENT block ${ip} after ${strikes} strikes — ${reason}`);
    return 0;
  }

  const durationMs = BAN_DURATIONS_MS[strikes - 1] ?? BAN_DURATIONS_MS[BAN_DURATIONS_MS.length - 1];
  const expiresAt  = Date.now() + durationMs;
  tempBanned.set(ip, { expiresAt, strikes });
  securityStats.tempBanned++;
  const mins = Math.round(durationMs / 60_000);
  console.warn(`[Security] Temp-ban ${ip} for ${mins} min (strike ${strikes}) — ${reason}`);
  return Math.ceil(durationMs / 1000);
}

// Periodically clean expired temp bans (every 10 min)
setInterval(() => {
  const now = Date.now();
  for (const [ip, ban] of tempBanned) {
    if (now >= ban.expiresAt) {
      // Leave strikes but reset expiry by deleting (strikes are still needed for next offense)
      // Actually we want to keep the strike count. Store with expiresAt=0 to signal "expired ban".
      tempBanned.set(ip, { expiresAt: 0, strikes: ban.strikes });
    }
  }
  // Also clean stale rate-limit windows
  const cutoff = now - 60_000;
  for (const [ip, win] of reqWindows) {
    if (win.start < cutoff) reqWindows.delete(ip);
  }
  for (const [ip, win] of burstWindows) {
    if (win.start < now - BURST_WINDOW_MS) burstWindows.delete(ip);
  }
}, 10 * 60_000);

// ── Public API ────────────────────────────────────────────────────────────────
export function blockIp(ip: string) {
  blockedIps.add(ip);
  persistBlockedIps();
}

export function unblockIp(ip: string) {
  blockedIps.delete(ip);
  tempBanned.delete(ip);
  persistBlockedIps();
}

export function clearAllBlockedIps() {
  blockedIps.clear();
  tempBanned.clear();
  persistBlockedIps();
}

export function getBlockedIpList(): string[] {
  return [...blockedIps];
}

export function getTempBannedList(): Array<{ ip: string; expiresAt: number; strikes: number }> {
  const now = Date.now();
  return [...tempBanned.entries()]
    .filter(([, b]) => b.expiresAt > now)
    .map(([ip, b]) => ({ ip, expiresAt: b.expiresAt, strikes: b.strikes }));
}

export function getFirewallStatus() {
  return {
    enabled:        firewallEnabled,
    lockdown:       lockdownMode,
    autoBlock,
    sensitivity:    sensitivityLevel,
    blockedCount:   blockedIps.size,
    tempBannedCount: getTempBannedList().length,
    lastRefreshMs:  lastRefresh,
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
      firewallEnabled  = s.enabled     ?? true;
      autoBlock        = s.auto_block  ?? true;
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
  const path: string = req.path ?? "";

  // (1) Skip static assets, health check, and auth routes
  // Auth routes must never be payload-scanned — legitimate passwords/fields
  // can match XSS/injection patterns and produce false positives.
  if (
    path.startsWith("/assets/") ||
    path.startsWith("/api/auth/") ||
    path === "/favicon.ico"     ||
    path === "/health"
  ) return next();

  // (2) Firewall toggle
  if (!firewallEnabled) return next();

  // (3) Background-refresh when stale (non-blocking)
  if (Date.now() - lastRefresh > REFRESH_MS) {
    refreshSecuritySettings().catch(() => {});
  }

  const ip = getClientIp(req);

  // (4) Always-allow IPs (loopback / internal)
  if (ALWAYS_ALLOW.has(ip)) return next();

  // (5) Lockdown — allow only auth routes
  if (lockdownMode && !path.startsWith("/api/auth")) {
    securityStats.blocked++;
    return res.status(503).json({
      error: "Service temporarily unavailable — network lockdown is active.",
      code: "LOCKDOWN",
    });
  }

  // (6) Permanent IP block-list
  if (blockedIps.has(ip)) {
    securityStats.blocked++;
    return res.status(403).json({ error: "Access denied.", code: "IP_BLOCKED" });
  }

  // (7) Temporary ban check
  const tb = isTempBanned(ip);
  if (tb.banned) {
    securityStats.blocked++;
    return res.status(429).json({
      error: "Access temporarily denied — too many violations.",
      code: "TEMP_BANNED",
      retryAfter: tb.ttlSec,
    });
  }

  // (8) Honeypot path detection
  if (isHoneypotPath(path)) {
    securityStats.honeypotBlocked++;
    if (autoBlock) {
      const ttl = addTempBan(ip, `honeypot path: ${path}`);
      return res.status(403).json({
        error: "Access denied.",
        code: "FORBIDDEN",
        ...(ttl > 0 ? { retryAfter: ttl } : {}),
      });
    }
    return res.status(404).json({ error: "Not found." });
  }

  // (9) Suspicious User-Agent detection
  const ua = String(req.headers?.["user-agent"] ?? "");
  if (ua && BAD_UA_PATTERNS.some(re => re.test(ua))) {
    securityStats.uaBlocked++;
    console.warn(`[Security] Blocked scanner UA from ${ip}: ${ua.substring(0, 80)}`);
    if (autoBlock && sensitivityLevel >= 5) {
      addTempBan(ip, `bad user-agent: ${ua.substring(0, 60)}`);
    }
    return res.status(403).json({ error: "Access denied.", code: "UA_BLOCKED" });
  }

  // (10) Burst detection (DDoS flood — 5-second window)
  if (path.startsWith("/api/") || path.startsWith("/rpc")) {
    const now = Date.now();
    const burst = burstWindows.get(ip);
    if (!burst || now - burst.start > BURST_WINDOW_MS) {
      burstWindows.set(ip, { count: 1, start: now });
    } else {
      burst.count++;
      if (burst.count > BURST_THRESHOLD) {
        securityStats.burstBlocked++;
        console.warn(`[Security] DDoS burst from ${ip}: ${burst.count} req in 5s`);
        if (autoBlock && sensitivityLevel >= 4) {
          const ttl = addTempBan(ip, `DDoS burst (${burst.count} req/5s)`);
          return res.status(429).json({
            error: "Too many requests — DDoS protection triggered.",
            code: "BURST_LIMIT",
            retryAfter: ttl > 0 ? ttl : 300,
          });
        }
        return res.status(429).json({
          error: "Too many requests. Slow down.",
          code: "BURST_LIMIT",
          retryAfter: Math.ceil((burst.start + BURST_WINDOW_MS - now) / 1000),
        });
      }
    }
  }

  // (11) Sustained rate limiting (60-second window, API routes only)
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
        if (autoBlock && sensitivityLevel >= 7) {
          const ttl = addTempBan(ip, `rate limit (${win.count} req/min > ${limit})`);
          if (ttl === 0) {
            // Permanently blocked
            return res.status(403).json({ error: "Access denied.", code: "IP_BLOCKED" });
          }
          return res.status(429).json({
            error: "Rate limit exceeded — temporary ban applied.",
            code: "RATE_BANNED",
            retryAfter: ttl,
          });
        }
        return res.status(429).json({
          error: "Rate limit exceeded. Slow down.",
          code: "RATE_LIMITED",
          retryAfter: Math.ceil((win.start + 60_000 - now) / 1000),
        });
      }
    }
  }

  // (12) Payload + query string inspection
  if (scanPayloads && sensitivityLevel >= 4) {
    // Combine body + query string for inspection
    const bodyStr  = req.body && typeof req.body === "object" ? JSON.stringify(req.body) : "";
    const queryStr = req.url?.split("?")[1] ?? "";
    const target   = bodyStr + " " + decodeURIComponent(queryStr);

    for (const { name, re, severity } of ATTACK_PATTERNS) {
      if (re.test(target)) {
        securityStats.payloadBlocked++;
        console.warn(`[Security] ${severity.toUpperCase()} attack from ${ip}: ${name}`);
        if (autoBlock && sensitivityLevel >= 5) {
          blockIp(ip);
          return res.status(403).json({
            error: `Request blocked — ${name} detected.`,
            code: "PAYLOAD_BLOCKED",
          });
        }
        if (severity === "critical") {
          return res.status(403).json({
            error: "Request blocked — malicious payload detected.",
            code: "PAYLOAD_BLOCKED",
          });
        }
      }
    }
  }

  next();
}

// ═══════════════════════════════════════════════════════════════════════════════
// Persistent public-IP ban system (DB-backed).
// - IP resolution goes through getClientIp() (CF-Connecting-IP → X-Real-IP → XFF).
// - `ip_bans` holds manual + auto-issued bans (permanent when expires_at IS NULL).
// - `login_failures` feeds the brute-force auto-banner (≥10 fails / 15 min = 24h ban).
// - Every API request is gated by ipBanGate() before hitting a route handler.
// ═══════════════════════════════════════════════════════════════════════════════

const banCache = new Map<string, { until: number; expiresAt: number | null }>(); // ip → cache entry
const BAN_CACHE_TTL_MS = 30_000;

export async function initIpBanTables() {
  const pool = pgConnPool;
  if (!pool) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ip_bans (
      ip          TEXT PRIMARY KEY,
      reason      TEXT,
      banned_by   TEXT,
      banned_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      expires_at  TIMESTAMPTZ,
      auto        BOOLEAN NOT NULL DEFAULT FALSE
    );
    CREATE INDEX IF NOT EXISTS idx_ip_bans_expires ON ip_bans(expires_at);

    CREATE TABLE IF NOT EXISTS login_failures (
      ip           TEXT NOT NULL,
      attempted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      email        TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_login_failures_ip_time ON login_failures(ip, attempted_at);

    ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_ip  TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at  TIMESTAMPTZ;
  `);
  // Prune anything expired at startup
  await pool.query(`DELETE FROM login_failures WHERE attempted_at < NOW() - INTERVAL '24 hours'`).catch(() => {});
}

async function isIpBannedDb(ip: string): Promise<{ banned: boolean; expiresAt: number | null }> {
  const pool = pgConnPool;
  if (!pool) return { banned: false, expiresAt: null };
  const cached = banCache.get(ip);
  if (cached && cached.until > Date.now()) {
    if (cached.expiresAt === null) return { banned: true, expiresAt: null };
    if (cached.expiresAt > Date.now()) return { banned: true, expiresAt: cached.expiresAt };
    return { banned: false, expiresAt: null };
  }
  const r = await pool.query(
    `SELECT expires_at FROM ip_bans WHERE ip=$1 AND (expires_at IS NULL OR expires_at > NOW()) LIMIT 1`,
    [ip]
  ).catch(() => ({ rows: [] as any[] }));
  if (r.rows.length === 0) {
    banCache.set(ip, { until: Date.now() + BAN_CACHE_TTL_MS, expiresAt: 0 });
    return { banned: false, expiresAt: null };
  }
  const expiresAt = r.rows[0].expires_at ? new Date(r.rows[0].expires_at).getTime() : null;
  banCache.set(ip, { until: Date.now() + BAN_CACHE_TTL_MS, expiresAt });
  return { banned: true, expiresAt };
}

/** Paths that are always reachable even from a banned IP so that admin/founder
 *  operators can recover via wallet-signature login. */
const BAN_BYPASS_PATHS = new Set(["/api/auth/nonce", "/api/auth/web3"]);

/** Middleware: block any request from an IP present in `ip_bans`. */
export async function ipBanGate(req: any, res: any, next: any) {
  const ip = getClientIp(req);
  if (ALWAYS_ALLOW.has(ip)) return next();
  // Allow wallet-signature login endpoints through so privileged operators
  // can always sign in and self-unban.
  if (BAN_BYPASS_PATHS.has(req.path)) return next();
  const { banned, expiresAt } = await isIpBannedDb(ip);
  if (!banned) return next();
  return res.status(403).json({
    error: "Your IP address has been banned from this service.",
    code: "IP_BANNED",
    ip,
    expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
  });
}

/** Fast synchronous cache check used by login handlers before password verification. */
export function isIpBannedCached(ip: string): boolean {
  const c = banCache.get(ip);
  if (!c || c.until <= Date.now()) return false;
  if (c.expiresAt === null) return true;
  return c.expiresAt > Date.now();
}

export async function addIpBan(opts: { ip: string; reason?: string; bannedBy?: string; expiresAt?: Date | null; auto?: boolean }) {
  const pool = pgConnPool;
  if (!pool) throw new Error("db unavailable");
  await pool.query(
    `INSERT INTO ip_bans (ip, reason, banned_by, expires_at, auto)
     VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (ip) DO UPDATE SET reason=EXCLUDED.reason, banned_by=EXCLUDED.banned_by,
                                    expires_at=EXCLUDED.expires_at, auto=EXCLUDED.auto,
                                    banned_at=NOW()`,
    [opts.ip, opts.reason ?? null, opts.bannedBy ?? null, opts.expiresAt ?? null, !!opts.auto]
  );
  banCache.delete(opts.ip);
}

export async function removeIpBan(ip: string) {
  const pool = pgConnPool;
  if (!pool) throw new Error("db unavailable");
  await pool.query(`DELETE FROM ip_bans WHERE ip=$1`, [ip]);
  banCache.delete(ip);
}

/**
 * Purge any bans/temp-bans that were mistakenly placed on a Cloudflare edge IP
 * itself (rather than a real visitor IP). This happens when the app was running
 * without Cloudflare-aware trust: every visitor looked like they shared
 * Cloudflare's edge IP, so one abusive visitor's auto-ban blocked everyone,
 * including the site owner. Safe to run any time — real attacker IPs are never
 * inside Cloudflare's published ranges.
 */
export async function clearCloudflareEdgeFalsePositives(): Promise<{ removedBans: number; removedTemp: number; removedBlocked: number }> {
  let removedTemp = 0, removedBlocked = 0, removedBans = 0;

  for (const ip of [...tempBanned.keys()]) {
    if (isCloudflareEdgeIp(ip)) { tempBanned.delete(ip); removedTemp++; }
  }
  for (const ip of [...blockedIps]) {
    if (isCloudflareEdgeIp(ip)) { blockedIps.delete(ip); removedBlocked++; }
  }
  if (removedBlocked > 0) persistBlockedIps();

  const pool = pgConnPool;
  if (pool) {
    const r = await pool.query(`SELECT ip FROM ip_bans WHERE expires_at IS NULL OR expires_at > NOW()`).catch(() => ({ rows: [] as any[] }));
    const badIps = r.rows.map((row: any) => row.ip).filter((ip: string) => isCloudflareEdgeIp(ip));
    if (badIps.length > 0) {
      await pool.query(`DELETE FROM ip_bans WHERE ip = ANY($1)`, [badIps]).catch(() => {});
      badIps.forEach((ip: string) => banCache.delete(ip));
      removedBans = badIps.length;
    }
  }

  if (removedTemp + removedBlocked + removedBans > 0) {
    console.warn(`[Security] Cleared Cloudflare-edge false-positive bans: ${removedBans} persistent, ${removedTemp} temp, ${removedBlocked} permanent-blocked`);
  }
  return { removedBans, removedTemp, removedBlocked };
}

export async function listIpBans() {
  const pool = pgConnPool;
  if (!pool) return [];
  const r = await pool.query(
    `SELECT ip, reason, banned_by, banned_at, expires_at, auto
       FROM ip_bans
      WHERE expires_at IS NULL OR expires_at > NOW()
      ORDER BY banned_at DESC LIMIT 500`
  );
  return r.rows;
}

// ── Honeypot redirect (short-window brute force) ─────────────────────────────
// After SHORT_LIMIT failed logins from one IP in SHORT_WINDOW_SEC seconds we
// tell the client to redirect to a configurable "honeypot" URL (e.g. a warning
// page or a trap site). The URL is read from admin_config.honeypot_redirect_url
// with an env-var fallback and a 60s in-memory cache.
export const SHORT_WINDOW_SEC = 30;
export const SHORT_LIMIT = 3;
const LONG_WINDOW_MIN = 15;
const LONG_LIMIT = 10;

let honeypotCache: { url: string | null; until: number } = { url: null, until: 0 };
// Default fallback: the built-in /blocked test warning page. Admins can override
// via admin_config.honeypot_redirect_url or the HONEYPOT_REDIRECT_URL env var.
const DEFAULT_HONEYPOT_URL = "/blocked";
export async function getHoneypotRedirectUrl(): Promise<string | null> {
  if (honeypotCache.until > Date.now()) return honeypotCache.url;
  let url: string | null = process.env.HONEYPOT_REDIRECT_URL?.trim() || null;
  try {
    const v = await (storage as any).getAdminConfig?.("honeypot_redirect_url");
    if (v && String(v).trim()) url = String(v).trim();
  } catch {}
  if (!url) url = DEFAULT_HONEYPOT_URL;
  honeypotCache = { url, until: Date.now() + 60_000 };
  return url;
}
export function invalidateHoneypotCache() { honeypotCache = { url: null, until: 0 }; }

/**
 * Is the given username/email tied to an admin or founder account?
 * Used to prevent privileged operators from ever being locked out — they
 * always retain a wallet-signature fallback path.
 */
export async function isPrivilegedUsername(usernameOrEmail: string): Promise<boolean> {
  if (!usernameOrEmail) return false;
  const pool = pgConnPool;
  if (!pool) return false;
  const r = await pool.query(
    `SELECT 1
       FROM users u
       JOIN user_roles r ON r.user_id = u.id
      WHERE (LOWER(u.username) = LOWER($1) OR LOWER(u.email) = LOWER($1))
        AND r.role IN ('admin','founder')
      LIMIT 1`,
    [usernameOrEmail]
  ).catch(() => ({ rowCount: 0 } as any));
  return (r.rowCount ?? 0) > 0;
}

/** True when this wallet address is registered against an admin/founder user. */
export async function isPrivilegedWallet(address: string): Promise<boolean> {
  if (!address) return false;
  const pool = pgConnPool;
  if (!pool) return false;
  const addr = address.toLowerCase();
  const founderEnv = (process.env.FOUNDER_WALLET_ADDRESS ?? process.env.FOUNDER_WALLET ?? "0x6422d12bfaddee5142bfad21b3006a74d09017b1").toLowerCase();
  if (addr === founderEnv) return true;
  const r = await pool.query(
    `SELECT 1
       FROM users u
       JOIN user_roles r ON r.user_id = u.id
      WHERE LOWER(u.wallet_address) = $1
        AND r.role IN ('admin','founder')
      LIMIT 1`,
    [addr]
  ).catch(() => ({ rowCount: 0 } as any));
  return (r.rowCount ?? 0) > 0;
}

/** Record a failed login and evaluate short-window redirect + long-window auto-ban.
 *  Admin/founder accounts never trigger auto-bans or honeypot redirects — they can
 *  always fall back to wallet-signature login (`privileged: true` in the response). */
export async function recordLoginFailure(
  ip: string,
  email?: string
): Promise<{ autoBanned: boolean; shortCount: number; longCount: number; redirectUrl: string | null; privileged: boolean }> {
  const pool = pgConnPool;
  if (!pool || ALWAYS_ALLOW.has(ip)) {
    return { autoBanned: false, shortCount: 0, longCount: 0, redirectUrl: null, privileged: false };
  }
  const privileged = email ? await isPrivilegedUsername(email) : false;
  await pool.query(`INSERT INTO login_failures (ip, email) VALUES ($1,$2)`, [ip, email ?? null]).catch(() => {});
  const r = await pool.query(
    `SELECT
       COUNT(*) FILTER (WHERE attempted_at > NOW() - ($1 || ' seconds')::interval)::int  AS short_c,
       COUNT(*) FILTER (WHERE attempted_at > NOW() - ($2 || ' minutes')::interval)::int  AS long_c
     FROM login_failures WHERE ip=$3`,
    [SHORT_WINDOW_SEC, LONG_WINDOW_MIN, ip]
  ).catch(() => ({ rows: [{ short_c: 0, long_c: 0 }] as any[] }));
  const shortCount = r.rows[0]?.short_c ?? 0;
  const longCount = r.rows[0]?.long_c ?? 0;

  // Privileged operator: never auto-ban, never honeypot-redirect. They always
  // keep the wallet-signature fallback open so they can't lock themselves out.
  if (privileged) {
    return { autoBanned: false, shortCount, longCount, redirectUrl: null, privileged: true };
  }

  let autoBanned = false;
  if (longCount >= LONG_LIMIT) {
    await addIpBan({
      ip,
      reason: `auto: ${longCount} failed logins in ${LONG_WINDOW_MIN} min`,
      bannedBy: "system",
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      auto: true,
    }).catch(() => {});
    console.warn(`[ip-ban] Auto-banned ${ip} for 24h after ${longCount} failed logins`);
    autoBanned = true;
  }

  const redirectUrl = shortCount >= SHORT_LIMIT ? await getHoneypotRedirectUrl() : null;
  return { autoBanned, shortCount, longCount, redirectUrl, privileged: false };
}

export async function clearLoginFailures(ip: string) {
  const pool = pgConnPool;
  if (!pool) return;
  await pool.query(`DELETE FROM login_failures WHERE ip=$1`, [ip]).catch(() => {});
}

// ═══════════════════════════════════════════════════════════════════════════════
// Progressive account lockout — escalating timeout per identifier (username/email).
// 1st wrong password → short timeout (default 1 min), each subsequent wrong
// password while/after a lockout escalates the timeout, up to a configurable max
// (default 24h). While locked, the client is told to redirect to an
// admin/founder-configured URL. Admin/founder accounts are always exempt (they
// keep the wallet-signature fallback instead — see isPrivilegedUsername).
// Settings live in admin_config under "lockout_settings" and are cached 60s.
// ═══════════════════════════════════════════════════════════════════════════════

export interface LockoutSettings {
  enabled: boolean;
  durationsSec: number[];
  redirectUrl: string | null;
}

export const DEFAULT_LOCKOUT_DURATIONS_SEC = [
  60,          // 1st lockout   → 1 min
  5 * 60,      // 2nd           → 5 min
  15 * 60,     // 3rd           → 15 min
  60 * 60,     // 4th           → 1 h
  6 * 60 * 60, // 5th           → 6 h
  24 * 60 * 60, // 6th+         → 24 h (cap)
];

const DEFAULT_LOCKOUT_SETTINGS: LockoutSettings = {
  enabled: true,
  durationsSec: DEFAULT_LOCKOUT_DURATIONS_SEC,
  redirectUrl: "/locked-out",
};

let lockoutSettingsCache: { value: LockoutSettings; until: number } = { value: DEFAULT_LOCKOUT_SETTINGS, until: 0 };

export async function getLockoutSettings(): Promise<LockoutSettings> {
  if (lockoutSettingsCache.until > Date.now()) return lockoutSettingsCache.value;
  let value = DEFAULT_LOCKOUT_SETTINGS;
  try {
    const row = await (storage as any).getConfig?.("lockout_settings");
    if (row?.configValue) {
      const s = row.configValue as any;
      value = {
        enabled: s.enabled !== false,
        durationsSec: Array.isArray(s.durationsSec) && s.durationsSec.length > 0
          ? s.durationsSec.map((n: any) => Math.max(1, Number(n) || 0))
          : DEFAULT_LOCKOUT_DURATIONS_SEC,
        redirectUrl: typeof s.redirectUrl === "string" && s.redirectUrl.trim() ? s.redirectUrl.trim() : null,
      };
    }
  } catch {}
  lockoutSettingsCache = { value, until: Date.now() + 60_000 };
  return value;
}

export function invalidateLockoutSettingsCache() { lockoutSettingsCache = { value: DEFAULT_LOCKOUT_SETTINGS, until: 0 }; }

export async function initLockoutTable() {
  const pool = pgConnPool;
  if (!pool) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS login_lockouts (
      identifier   TEXT PRIMARY KEY,
      strikes      INT NOT NULL DEFAULT 0,
      locked_until TIMESTAMPTZ,
      updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_login_lockouts_locked_until ON login_lockouts(locked_until);
  `);
  // Prune stale rows (never locked recently, no point keeping strikes forever)
  await pool.query(`DELETE FROM login_lockouts WHERE updated_at < NOW() - INTERVAL '30 days'`).catch(() => {});
}

function normalizeIdentifier(identifier: string): string {
  return String(identifier ?? "").trim().toLowerCase();
}

/** Check whether this identifier is currently locked out. */
export async function checkLockout(identifier: string): Promise<{ locked: boolean; lockedUntil: number | null; redirectUrl: string | null }> {
  const id = normalizeIdentifier(identifier);
  if (!id) return { locked: false, lockedUntil: null, redirectUrl: null };
  const settings = await getLockoutSettings();
  if (!settings.enabled) return { locked: false, lockedUntil: null, redirectUrl: null };
  const pool = pgConnPool;
  if (!pool) return { locked: false, lockedUntil: null, redirectUrl: null };
  const r = await pool.query(
    `SELECT locked_until FROM login_lockouts WHERE identifier=$1`,
    [id]
  ).catch(() => ({ rows: [] as any[] }));
  const lockedUntil = r.rows[0]?.locked_until ? new Date(r.rows[0].locked_until).getTime() : null;
  if (lockedUntil && lockedUntil > Date.now()) {
    return { locked: true, lockedUntil, redirectUrl: settings.redirectUrl };
  }
  return { locked: false, lockedUntil: null, redirectUrl: null };
}

/** Record a failed login attempt for this identifier and escalate the lockout.
 *  Privileged (admin/founder) identifiers are exempt — callers should check
 *  isPrivilegedUsername() first and skip this for privileged accounts. */
export async function recordLockoutFailure(
  identifier: string
): Promise<{ locked: boolean; lockedUntil: number | null; strikes: number; redirectUrl: string | null }> {
  const id = normalizeIdentifier(identifier);
  const settings = await getLockoutSettings();
  if (!id || !settings.enabled) return { locked: false, lockedUntil: null, strikes: 0, redirectUrl: null };
  const pool = pgConnPool;
  if (!pool) return { locked: false, lockedUntil: null, strikes: 0, redirectUrl: null };

  const r = await pool.query(
    `INSERT INTO login_lockouts (identifier, strikes, updated_at)
     VALUES ($1, 1, NOW())
     ON CONFLICT (identifier) DO UPDATE SET strikes = login_lockouts.strikes + 1, updated_at = NOW()
     RETURNING strikes`,
    [id]
  ).catch(() => ({ rows: [{ strikes: 1 }] as any[] }));
  const strikes = r.rows[0]?.strikes ?? 1;

  const durations = settings.durationsSec;
  const durationSec = durations[Math.min(strikes - 1, durations.length - 1)];
  const lockedUntil = Date.now() + durationSec * 1000;

  await pool.query(
    `UPDATE login_lockouts SET locked_until=$2 WHERE identifier=$1`,
    [id, new Date(lockedUntil)]
  ).catch(() => {});

  console.warn(`[lockout] ${id} locked for ${durationSec}s (strike ${strikes})`);
  return { locked: true, lockedUntil, strikes, redirectUrl: settings.redirectUrl };
}

/** Clear lockout state for this identifier (successful login, or admin unlock). */
export async function clearLockout(identifier: string) {
  const id = normalizeIdentifier(identifier);
  const pool = pgConnPool;
  if (!pool || !id) return;
  await pool.query(`DELETE FROM login_lockouts WHERE identifier=$1`, [id]).catch(() => {});
}

/** List all currently-active lockouts (for the admin panel). */
export async function listActiveLockouts(): Promise<Array<{ identifier: string; strikes: number; lockedUntil: string | null }>> {
  const pool = pgConnPool;
  if (!pool) return [];
  const r = await pool.query(
    `SELECT identifier, strikes, locked_until FROM login_lockouts
      WHERE locked_until IS NOT NULL AND locked_until > NOW()
      ORDER BY locked_until DESC LIMIT 500`
  ).catch(() => ({ rows: [] as any[] }));
  return r.rows.map((row: any) => ({
    identifier: row.identifier,
    strikes: row.strikes,
    lockedUntil: row.locked_until ? new Date(row.locked_until).toISOString() : null,
  }));
}


