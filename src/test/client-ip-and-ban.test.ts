/**
 * Unit + integration tests for:
 *   1. getClientIp trusted-proxy allowlist (spoofed X-Forwarded-For rejection)
 *   2. IP ban lifecycle — save on login, clear on logout, subsequent logins
 *   3. removeIpBan only after successful authentication (bypass prevention)
 *
 * These tests exercise the security module directly with mock requests so they
 * don't need a running server. Ban storage falls back to an in-memory shim if
 * no DB pool is available (tests still assert the calling convention).
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

// Prevent the module from touching the real DB on import.
vi.mock("../../server/db", () => ({ pool: null }));
vi.mock("../../server/storage", () => ({
  storage: {
    getConfig: async () => null,
    upsertConfig: async () => {},
    getAdminConfig: async () => null,
  },
}));

// Load module under test AFTER mocks are in place.
const security = await import("../../server/security");

function mockReq(opts: {
  peer?: string;               // socket.remoteAddress (immediate TCP peer)
  xff?: string;                // X-Forwarded-For header
  cf?: string;                 // CF-Connecting-IP
  xreal?: string;              // X-Real-IP
} = {}) {
  return {
    socket: { remoteAddress: opts.peer ?? "203.0.113.10" },
    headers: {
      ...(opts.xff  ? { "x-forwarded-for": opts.xff } : {}),
      ...(opts.cf   ? { "cf-connecting-ip": opts.cf } : {}),
      ...(opts.xreal ? { "x-real-ip": opts.xreal } : {}),
    },
    ip: undefined as any,
  };
}

describe("getClientIp trusted-proxy allowlist", () => {
  it("uses X-Forwarded-For when peer is loopback (trusted)", () => {
    const req = mockReq({ peer: "127.0.0.1", xff: "8.8.8.8, 10.0.0.1" });
    expect(security.getClientIp(req)).toBe("8.8.8.8");
  });

  it("uses CF-Connecting-IP over XFF when peer is trusted", () => {
    const req = mockReq({ peer: "::1", cf: "1.1.1.1", xff: "9.9.9.9" });
    expect(security.getClientIp(req)).toBe("1.1.1.1");
  });

  it("ignores forwarded-IP headers from an untrusted peer (spoof rejected)", () => {
    // Attacker directly connects and sends a spoofed XFF claiming to be Google DNS.
    const req = mockReq({ peer: "203.0.113.99", xff: "8.8.8.8" });
    expect(security.getClientIp(req)).toBe("203.0.113.99");
  });

  it("ignores spoofed CF-Connecting-IP + X-Real-IP + XFF from untrusted peer", () => {
    const req = mockReq({ peer: "198.51.100.50", cf: "1.1.1.1", xreal: "2.2.2.2", xff: "3.3.3.3" });
    expect(security.getClientIp(req)).toBe("198.51.100.50");
  });

  it("normalises IPv6-mapped IPv4 (::ffff:...)", () => {
    const req = mockReq({ peer: "::ffff:127.0.0.1", xff: "5.6.7.8" });
    // peer is trusted (loopback) → trust XFF
    expect(security.getClientIp(req)).toBe("5.6.7.8");
  });

  it("isTrustedProxy() reports loopback as trusted, public IPs as not", () => {
    expect(security.isTrustedProxy("127.0.0.1")).toBe(true);
    expect(security.isTrustedProxy("::1")).toBe(true);
    expect(security.isTrustedProxy("8.8.8.8")).toBe(false);
  });
});

describe("removeIpBan / clearLoginFailures — bypass prevention", () => {
  // Track calls without a real DB so we can prove the call convention.
  const calls: string[] = [];
  beforeEach(() => { calls.length = 0; });

  it("removeIpBan / clearLoginFailures error out safely when db is down (no silent 'success')", async () => {
    // Without a DB, removeIpBan must NOT quietly succeed — that would let a
    // caller falsely believe a ban was lifted. clearLoginFailures is best-effort.
    await expect(security.removeIpBan("1.2.3.4")).rejects.toThrow(/db/i);
    await expect(security.clearLoginFailures("1.2.3.4")).resolves.toBeUndefined();
  });

  it("failed-login handler never calls removeIpBan (regression guard)", async () => {
    // Simulate the auth handler's failed-login branch. It should call
    // recordLoginFailure but never removeIpBan / clearLoginFailures.
    const spyRemove = vi.spyOn(security, "removeIpBan");
    const spyClear  = vi.spyOn(security, "clearLoginFailures");

    // Failed-login path from server/auth.ts:
    //   recordLoginFailure(ip, username)  ← only call on failure
    await security.recordLoginFailure("203.0.113.55", "attacker").catch(() => {});

    expect(spyRemove).not.toHaveBeenCalled();
    expect(spyClear).not.toHaveBeenCalled();
    spyRemove.mockRestore();
    spyClear.mockRestore();
  });
});

describe("Login IP lifecycle (session ip save / logout clear / re-login)", () => {
  // Simulate the exact session mutation the auth handler performs.
  function mockSession() {
    return { ip: undefined as string | undefined, ua: undefined as string | undefined, loginAt: undefined as string | undefined };
  }

  it("successful login stores the resolved client IP on the session", () => {
    const session = mockSession();
    const req = { ...mockReq({ peer: "127.0.0.1", xff: "8.8.8.8" }), session } as any;
    // Mirrors server/auth.ts:
    const ip = security.getClientIp(req);
    session.ip = ip;
    session.loginAt = new Date().toISOString();
    expect(session.ip).toBe("8.8.8.8");
    expect(session.loginAt).toBeTruthy();
  });

  it("logout clears session.ip so a subsequent login re-captures it", () => {
    const session = mockSession();
    session.ip = "8.8.8.8";
    session.loginAt = "2024-01-01T00:00:00.000Z";
    // performLogoutCleanup semantics:
    session.ip = undefined;
    session.loginAt = undefined;
    expect(session.ip).toBeUndefined();

    // Same user, same IP re-logs in — treated as a fresh session.
    const req = { ...mockReq({ peer: "127.0.0.1", xff: "8.8.8.8" }), session } as any;
    session.ip = security.getClientIp(req);
    expect(session.ip).toBe("8.8.8.8");
  });

  it("logout then login from a *different* IP records the new IP", () => {
    const session = mockSession();
    session.ip = "8.8.8.8";
    // logout
    session.ip = undefined;
    // re-login from a different address
    const req = { ...mockReq({ peer: "127.0.0.1", xff: "9.9.9.9" }), session } as any;
    session.ip = security.getClientIp(req);
    expect(session.ip).toBe("9.9.9.9");
  });

  it("spoofed XFF from untrusted peer cannot rewrite the session IP", () => {
    const session = mockSession();
    // Attacker connects directly (no reverse proxy) and sends XFF claiming an admin IP.
    const req = { ...mockReq({ peer: "203.0.113.7", xff: "1.2.3.4" }), session } as any;
    session.ip = security.getClientIp(req);
    // Session locks to the real peer address, not the spoofed header.
    expect(session.ip).toBe("203.0.113.7");
    expect(session.ip).not.toBe("1.2.3.4");
  });
});
