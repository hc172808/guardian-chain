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

    // Empty DB — create bootstrap accounts.
    const founderPassword = process.env.FOUNDER_PASSWORD ?? "password";
    const adminPassword   = process.env.ADMIN_PASSWORD   ?? "password";

    // ── Founder account ──────────────────────────────────────────────────────
    const founderId   = `founder_bootstrap_${Date.now()}`;
    const founderHash = await bcrypt.hash(founderPassword, 12);

    await pool.query(
      `INSERT INTO users (id, email, username, password_hash, wallet_address, first_name, last_name, updated_at)
       VALUES ($1, $2, $3, $4, $5, 'Founder', 'GYDSchain', NOW())
       ON CONFLICT DO NOTHING`,
      [founderId, "founder@gydschain.local", "founder", founderHash, FOUNDER_WALLET]
    );
    await pool.query(
      `INSERT INTO profiles (id, user_id, email, username, display_name, role)
       VALUES (gen_random_uuid(), $1, $2, $3, 'Founder', 'founder')
       ON CONFLICT (user_id) DO NOTHING`,
      [founderId, "founder@gydschain.local", "founder"]
    );
    await grantRoles(founderId, ["user", "admin", "founder"]);

    // ── Admin account ────────────────────────────────────────────────────────
    const adminId   = "admin_bootstrap_001";
    const adminHash = await bcrypt.hash(adminPassword, 12);

    await pool.query(
      `INSERT INTO users (id, email, username, password_hash, first_name, last_name, updated_at)
       VALUES ($1, $2, $3, $4, 'Admin', 'User', NOW())
       ON CONFLICT (username) DO UPDATE SET password_hash=$4, updated_at=NOW()`,
      [adminId, "admin@gydschain.local", "admin", adminHash]
    );
    await pool.query(
      `INSERT INTO profiles (id, user_id, email, username, display_name, role)
       VALUES (gen_random_uuid(), $1, $2, $3, 'Admin', 'admin')
       ON CONFLICT (user_id) DO UPDATE SET username=$3, display_name='Admin', role='admin'`,
      [adminId, "admin@gydschain.local", "admin"]
    );
    await grantRoles(adminId, ["user", "admin"]);

    console.log(`[seed] Bootstrap accounts created (first-run only):`);
    console.log(`  Founder — username: founder  password: ${founderPassword}`);
    console.log(`  Admin   — username: admin    password: ${adminPassword}`);
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
