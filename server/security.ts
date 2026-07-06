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

// ── In-memory state ──────────────────────────────────────────────────────────
const blockedIps   = new Set<string>();                  // permanent bans
const ALWAYS_ALLOW = new Set<string>(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);

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
// Resolve the real *public* client IP behind Cloudflare / Nginx / any reverse proxy.
// Preference order (user-chosen policy): CF-Connecting-IP → X-Real-IP → first XFF hop → req.ip → socket.
// Strips IPv6 "::ffff:" prefix and normalises "::1" → "127.0.0.1" so bans compare cleanly.
export function getClientIp(req: any): string {
  const h = req.headers ?? {};
  const pick = (v: any): string => Array.isArray(v) ? v[0] : (typeof v === "string" ? v : "");
  let ip =
    pick(h["cf-connecting-ip"]) ||
    pick(h["true-client-ip"]) ||
    pick(h["x-real-ip"]) ||
    pick(h["x-forwarded-for"]).split(",")[0].trim() ||
    req.ip ||
    req.socket?.remoteAddress ||
    "0.0.0.0";
  ip = String(ip).trim();
  if (ip.startsWith("::ffff:")) ip = ip.slice(7);
  if (ip === "::1") ip = "127.0.0.1";
  return ip;
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

  // (1) Skip static assets & health check
  if (
    path.startsWith("/assets/") ||
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
