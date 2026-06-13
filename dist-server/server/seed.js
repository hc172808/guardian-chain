"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.seedFounder = seedFounder;
const db_1 = require("./db");
const schema_1 = require("../shared/schema");
const drizzle_orm_1 = require("drizzle-orm");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
async function seedFounder() {
    const email = "netlifegy@gmail.com";
    const username = "netlifegy";
    const defaultPassword = "GYDSchain2026!";
    try {
        const existing = await db_1.db.select().from(schema_1.users).where((0, drizzle_orm_1.eq)(schema_1.users.email, email));
        if (existing.length > 0) {
            const u = existing[0];
            const existingRoles = await db_1.db.select().from(schema_1.userRoles).where((0, drizzle_orm_1.eq)(schema_1.userRoles.userId, u.id));
            const roleNames = existingRoles.map(r => r.role);
            if (!roleNames.includes("founder")) {
                await db_1.db.insert(schema_1.userRoles).values({ userId: u.id, role: "founder" }).onConflictDoNothing();
                console.log("[seed] Added founder role to existing user:", email);
            }
            if (!roleNames.includes("admin")) {
                await db_1.db.insert(schema_1.userRoles).values({ userId: u.id, role: "admin" }).onConflictDoNothing();
                console.log("[seed] Added admin role to existing user:", email);
            }
            return;
        }
        const id = `founder_netlifegy_${Date.now()}`;
        const passwordHash = await bcryptjs_1.default.hash(defaultPassword, 12);
        await db_1.db.insert(schema_1.users).values({
            id,
            email,
            username,
            passwordHash,
            firstName: "Founder",
            lastName: "GYDSchain",
            updatedAt: new Date(),
        });
        await db_1.db.insert(schema_1.profiles).values({
            userId: id,
            email,
            username,
            displayName: "Founder",
            role: "founder",
        }).onConflictDoNothing();
        await db_1.db.insert(schema_1.userRoles).values({ userId: id, role: "user" }).onConflictDoNothing();
        await db_1.db.insert(schema_1.userRoles).values({ userId: id, role: "admin" }).onConflictDoNothing();
        await db_1.db.insert(schema_1.userRoles).values({ userId: id, role: "founder" }).onConflictDoNothing();
        console.log(`[seed] Founder account created:`);
        console.log(`  Email:    ${email}`);
        console.log(`  Username: ${username}`);
        console.log(`  Password: ${defaultPassword}  ← CHANGE THIS AFTER FIRST LOGIN`);
    }
    catch (err) {
        console.error("[seed] Founder seed error:", err.message);
    }
}
