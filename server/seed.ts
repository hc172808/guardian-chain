import { pool } from "./db";
import bcrypt from "bcryptjs";

// ─── Founder wallet ────────────────────────────────────────────────────────────
// This address is granted admin + founder roles on every startup.
// Ownership is cryptographically verified at login (nonce + signature), so only
// the holder of the private key can actually authenticate as admin/founder.
// Override with FOUNDER_WALLET_ADDRESS env var if the key is rotated.
const FOUNDER_WALLET = (
  process.env.FOUNDER_WALLET_ADDRESS ?? "0x6422d12bfaddee5142bfad21b3006a74d09017b1"
).toLowerCase();

// ─── helpers ─────────────────────────────────────────────────────────────────

async function grantRoles(userId: string, roles: string[]) {
  for (const role of roles) {
    await pool.query(
      `INSERT INTO user_roles (id, user_id, role)
       VALUES (gen_random_uuid(), $1, $2)
       ON CONFLICT DO NOTHING`,
      [userId, role]
    );
  }
}

// ─── seedFounder ─────────────────────────────────────────────────────────────

export async function seedFounder() {
  try {
    // ── Step 1: Grant admin + founder to whoever owns the founder wallet ──────
    // This is safe: wallet login requires a signed nonce proving private key ownership.
    const walletRow = await pool.query(
      `SELECT id FROM users WHERE LOWER(wallet_address) = $1 LIMIT 1`,
      [FOUNDER_WALLET]
    );
    if (walletRow.rows.length > 0) {
      await grantRoles(walletRow.rows[0].id, ["user", "admin", "founder"]);
      console.log("[seed] Ensured admin/founder on wallet account:", walletRow.rows[0].id);
      // Wallet account exists — no need for the email bootstrap account.
      return;
    }

    // ── Step 2: Bootstrap-only email account ─────────────────────────────────
    // Only create the email/password account when BOTH conditions are true:
    //   a) No account owns the founder wallet yet (checked above), AND
    //   b) No users exist at all (truly empty DB — first-run bootstrap only).
    // This prevents an attacker who pre-registered the founder email from
    // receiving elevated roles — they would not match condition (b).
    const userCount = await pool.query(`SELECT COUNT(*) FROM users`);
    const isEmpty = parseInt(userCount.rows[0].count, 10) === 0;

    if (!isEmpty) {
      // DB has users but none own the founder wallet yet.
      // Do not auto-promote any existing account by email.
      // The founder should log in via wallet to claim admin/founder.
      console.log("[seed] No wallet account for founder — connect wallet 0x6422...b1 to claim admin.");
      return;
    }

    // Empty DB — safe to create the bootstrap account.
    // Password comes from env var or a generated random — never hardcoded in a
    // log message that could leak via CI, Docker logs, or a build artefact.
    const bootstrapPassword = process.env.FOUNDER_PASSWORD ?? crypto.randomUUID().replace(/-/g, "").slice(0, 16);
    const id = `founder_netlifegy_${Date.now()}`;
    const passwordHash = await bcrypt.hash(bootstrapPassword, 12);
    const email    = "netlifegy@gmail.com";
    const username = "netlifegy";

    await pool.query(
      `INSERT INTO users (id, email, username, password_hash, wallet_address, first_name, last_name, updated_at)
       VALUES ($1, $2, $3, $4, $5, 'Founder', 'GYDSchain', NOW())
       ON CONFLICT DO NOTHING`,
      [id, email, username, passwordHash, FOUNDER_WALLET]
    );

    await pool.query(
      `INSERT INTO profiles (id, user_id, email, username, display_name, role)
       VALUES (gen_random_uuid(), $1, $2, $3, 'Founder', 'founder')
       ON CONFLICT (user_id) DO NOTHING`,
      [id, email, username]
    );

    await grantRoles(id, ["user", "admin", "founder"]);

    console.log(`[seed] Founder bootstrap account created (first-run only):`);
    console.log(`  Username: ${username}`);
    console.log(`  Email:    ${email}`);
    console.log(`  Wallet:   ${FOUNDER_WALLET}`);
    // Only log the password when it was explicitly supplied via env var.
    // A randomly-generated password is shown once so the admin can note it;
    // a supplied one is omitted to avoid re-logging a known secret.
    if (!process.env.FOUNDER_PASSWORD) {
      console.log(`  Password: ${bootstrapPassword}  ← SAVE THIS — shown only once. Change after first login.`);
    } else {
      console.log(`  Password: (set via FOUNDER_PASSWORD env var)`);
    }
  } catch (err: any) {
    // Seed errors are non-fatal — the server still starts.
    console.error("[seed] Founder seed error:", err.message);
  }
}

// ─── seedFirewallDefaults ─────────────────────────────────────────────────────

export async function seedFirewallDefaults() {
  try {
    const { rows } = await pool.query(`SELECT COUNT(*) FROM firewall_rules`);
    if (parseInt(rows[0].count, 10) > 0) return;

    const defaultRules = [
      { rule_type: "port", action: "allow", protocol: "tcp", port: "22",   direction: "inbound",  description: "SSH" },
      { rule_type: "port", action: "allow", protocol: "tcp", port: "80",   direction: "inbound",  description: "HTTP" },
      { rule_type: "port", action: "allow", protocol: "tcp", port: "443",  direction: "inbound",  description: "HTTPS" },
      { rule_type: "port", action: "allow", protocol: "tcp", port: "5001", direction: "inbound",  description: "App API" },
      { rule_type: "port", action: "deny",  protocol: "tcp", port: "3306", direction: "inbound",  description: "Block MySQL" },
    ];

    for (const rule of defaultRules) {
      await pool.query(
        `INSERT INTO firewall_rules (id, rule_type, action, protocol, port, direction, description, is_active, created_at, updated_at)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, true, NOW(), NOW())
         ON CONFLICT DO NOTHING`,
        [rule.rule_type, rule.action, rule.protocol, rule.port, rule.direction, rule.description]
      );
    }
    console.log("[seed] Default firewall rules created");
  } catch (err: any) {
    console.warn("[seed] Firewall defaults error:", err.message);
  }
}
