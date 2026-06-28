import { db } from "./db";
import { users, userRoles, profiles, firewallRules, fail2banJails, rateLimitRules, ddosProtection } from "../shared/schema";
import { eq, or } from "drizzle-orm";
import bcrypt from "bcryptjs";

export async function seedFounder() {
  const email = "netlifegy@gmail.com";
  const username = "netlifegy";
  const defaultPassword = "GYDSchain2026!";
  // If FOUNDER_WALLET_ADDRESS env var is set, link it to the founder account
  const founderWallet = process.env.FOUNDER_WALLET_ADDRESS?.toLowerCase() ?? null;

  try {
    const existing = await db.select().from(users).where(eq(users.email, email));
    if (existing.length > 0) {
      const u = existing[0];
      const existingRoles = await db.select().from(userRoles).where(eq(userRoles.userId, u.id));
      const roleNames = existingRoles.map(r => r.role);
      if (!roleNames.includes("founder")) {
        await db.insert(userRoles).values({ userId: u.id, role: "founder" }).onConflictDoNothing();
        console.log("[seed] Added founder role to existing user:", email);
      }
      if (!roleNames.includes("admin")) {
        await db.insert(userRoles).values({ userId: u.id, role: "admin" }).onConflictDoNothing();
        console.log("[seed] Added admin role to existing user:", email);
      }
      // If the founder wallet is already owned by a different web3 user, grant them admin/founder roles
      if (founderWallet) {
        const walletUsers = await db.select().from(users).where(eq(users.walletAddress, founderWallet));
        const walletTakenByOther = walletUsers.some(wu => wu.id !== u.id);
        for (const wu of walletUsers) {
          if (wu.id === u.id) continue;
          const wuRoles = await db.select().from(userRoles).where(eq(userRoles.userId, wu.id));
          const wuRoleNames = wuRoles.map(r => r.role);
          if (!wuRoleNames.includes("founder")) await db.insert(userRoles).values({ userId: wu.id, role: "founder" }).onConflictDoNothing();
          if (!wuRoleNames.includes("admin")) await db.insert(userRoles).values({ userId: wu.id, role: "admin" }).onConflictDoNothing();
          console.log("[seed] Granted admin/founder to wallet user:", wu.id);
        }
        // Only link to the founder account if the wallet isn't already taken
        if (!walletTakenByOther && !u.walletAddress) {
          await db.update(users).set({ walletAddress: founderWallet }).where(eq(users.id, u.id));
          console.log("[seed] Linked founder wallet to founder account:", founderWallet);
        }
      }
      return;
    }

    const id = `founder_netlifegy_${Date.now()}`;
    const passwordHash = await bcrypt.hash(defaultPassword, 12);

    await db.insert(users).values({
      id,
      email,
      username,
      passwordHash,
      walletAddress: founderWallet ?? undefined,
      firstName: "Founder",
      lastName: "GYDSchain",
      updatedAt: new Date(),
    });

    await db.insert(profiles).values({
      userId: id,
      email,
      username,
      displayName: "Founder",
      role: "founder",
    }).onConflictDoNothing();

    await db.insert(userRoles).values({ userId: id, role: "user" }).onConflictDoNothing();
    await db.insert(userRoles).values({ userId: id, role: "admin" }).onConflictDoNothing();
    await db.insert(userRoles).values({ userId: id, role: "founder" }).onConflictDoNothing();

    console.log(`[seed] Founder account created:`);
    console.log(`  Email:    ${email}`);
    console.log(`  Username: ${username}`);
    console.log(`  Password: ${defaultPassword}  ← CHANGE THIS AFTER FIRST LOGIN`);
    if (founderWallet) console.log(`  Wallet:   ${founderWallet}`);
  } catch (err: any) {
    console.error("[seed] Founder seed error:", err.message);
  }
}

export async function seedFirewallDefaults() {
  try {
    const existing = await db.select().from(firewallRules);
    if (existing.length > 0) return;
    await db.insert(firewallRules).values([
      { ruleType: 'ufw', action: 'allow', protocol: 'tcp', port: '22',    direction: 'in',  description: 'SSH access',           isActive: true },
      { ruleType: 'ufw', action: 'allow', protocol: 'tcp', port: '80',    direction: 'in',  description: 'HTTP',                 isActive: true },
      { ruleType: 'ufw', action: 'allow', protocol: 'tcp', port: '443',   direction: 'in',  description: 'HTTPS / WSS',          isActive: true },
      { ruleType: 'ufw', action: 'allow', protocol: 'tcp', port: '8545',  direction: 'in',  description: 'RPC endpoint',         isActive: true },
      { ruleType: 'ufw', action: 'allow', protocol: 'tcp', port: '8546',  direction: 'in',  description: 'WebSocket RPC',        isActive: true },
      { ruleType: 'ufw', action: 'allow', protocol: 'any', port: '30303', direction: 'in',  description: 'P2P Sync (TCP+UDP)',   isActive: true },
      { ruleType: 'ufw', action: 'allow', protocol: 'udp', port: '51820', direction: 'in',  description: 'WireGuard VPN',        isActive: true },
      { ruleType: 'ufw', action: 'deny',  protocol: 'tcp', port: '5432',  direction: 'in',  description: 'Block external DB',    isActive: true },
      { ruleType: 'ufw', action: 'allow', protocol: 'any', port: null,    direction: 'out', description: 'Allow all outbound',   isActive: true },
    ]);
    console.log('[seed] Default UFW firewall rules created');

    const jailsExist = await db.select().from(fail2banJails);
    if (jailsExist.length === 0) {
      await db.insert(fail2banJails).values([
        { jailName: 'sshd',            isEnabled: true,  maxRetries: 5,  banTime: 3600,  findTime: 600, logPath: '/var/log/auth.log',         filterName: 'sshd',            description: 'SSH brute-force protection' },
        { jailName: 'rpc-bruteforce',  isEnabled: true,  maxRetries: 10, banTime: 7200,  findTime: 300, logPath: '/var/log/nginx/access.log', filterName: 'nginx-rpc',       description: 'RPC endpoint abuse detection' },
        { jailName: 'nginx-http-auth', isEnabled: true,  maxRetries: 5,  banTime: 3600,  findTime: 600, logPath: '/var/log/nginx/error.log',  filterName: 'nginx-http-auth', description: 'HTTP auth failures' },
        { jailName: 'p2p-flood',       isEnabled: false, maxRetries: 50, banTime: 86400, findTime: 60,  logPath: '/var/log/gyds/p2p.log',     filterName: 'gyds-p2p',        description: 'P2P connection flood protection' },
      ]);
      console.log('[seed] Default Fail2Ban jails created');
    }

    const rlExist = await db.select().from(rateLimitRules);
    if (rlExist.length === 0) {
      await db.insert(rateLimitRules).values([
        { name: 'RPC Rate Limit',     endpoint: '/rpc',        requestsPerWindow: 100, windowSeconds: 60, burstLimit: 30, action: 'throttle', isEnabled: true,  description: 'Prevent RPC flooding' },
        { name: 'API General Limit',  endpoint: '/api/*',      requestsPerWindow: 200, windowSeconds: 60, burstLimit: 50, action: 'throttle', isEnabled: true,  description: 'General API protection' },
        { name: 'Auth Rate Limit',    endpoint: '/api/auth/*', requestsPerWindow: 10,  windowSeconds: 60, burstLimit: 5,  action: 'ban',      isEnabled: true,  description: 'Login brute-force protection' },
        { name: 'WebSocket Limit',    endpoint: ':8546',       requestsPerWindow: 50,  windowSeconds: 60, burstLimit: 20, action: 'drop',     isEnabled: true,  description: 'WebSocket connection limit' },
        { name: 'P2P Connection Cap', endpoint: ':30303',      requestsPerWindow: 100, windowSeconds: 60, burstLimit: 40, action: 'drop',     isEnabled: false, description: 'P2P peer connection limit' },
      ]);
      console.log('[seed] Default rate limit rules created');
    }

    const ddosExist = await db.select().from(ddosProtection);
    if (ddosExist.length === 0) {
      await db.insert(ddosProtection).values([
        { name: 'SYN Flood Guard',       protectionType: 'syn_flood',         threshold: 1000, action: 'drop',      isEnabled: true,  description: 'Block TCP SYN flood attacks' },
        { name: 'HTTP Flood Mitigation', protectionType: 'http_flood',        threshold: 500,  action: 'challenge', isEnabled: true,  description: 'Rate-limit HTTP flood requests' },
        { name: 'UDP Flood Block',       protectionType: 'udp_flood',         threshold: 2000, action: 'drop',      isEnabled: true,  description: 'Discard UDP flood packets' },
        { name: 'Slowloris Defense',     protectionType: 'slowloris',         threshold: 200,  action: 'reject',    isEnabled: true,  description: 'Terminate slow HTTP connections' },
        { name: 'Connection Limit',      protectionType: 'connection_limit',  threshold: 150,  action: 'reject',    isEnabled: true,  description: 'Limit simultaneous connections per IP' },
        { name: 'DNS Amplification',     protectionType: 'dns_amplification', threshold: 100,  action: 'drop',      isEnabled: false, description: 'Block DNS reflection attacks' },
      ]);
      console.log('[seed] Default DDoS protection rules created');
    }
  } catch (err: any) {
    console.warn('[seed] Firewall defaults error:', err.message);
  }
}
