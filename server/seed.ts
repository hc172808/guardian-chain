import { db } from "./db";
import { users, userRoles, profiles } from "../shared/schema";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";

export async function seedFounder() {
  const email = "netlifegy@gmail.com";
  const username = "netlifegy";
  const defaultPassword = "GYDSchain2026!";

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
      return;
    }

    const id = `founder_netlifegy_${Date.now()}`;
    const passwordHash = await bcrypt.hash(defaultPassword, 12);

    await db.insert(users).values({
      id,
      email,
      username,
      passwordHash,
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
  } catch (err: any) {
    console.error("[seed] Founder seed error:", err.message);
  }
}
