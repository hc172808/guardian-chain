import { db } from "./db";
import { users, userRoles, profiles } from "../shared/schema";
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
