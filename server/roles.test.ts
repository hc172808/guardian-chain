import { describe, expect, it } from "vitest";
import { hasAdminRole, hasFounderRole, normalizeRoleNames } from "./roles";

describe("admin role checks", () => {
  it("allows admin and founder rows, regardless of capitalization", () => {
    expect(hasAdminRole([{ role: "Admin" }])).toBe(true);
    expect(hasAdminRole(["FOUNDER"])).toBe(true);
    expect(hasFounderRole([{ role: "Founder" }])).toBe(true);
  });

  it("does not grant admin access to ordinary roles", () => {
    expect(hasAdminRole(["user", { role: "moderator" }])).toBe(false);
    expect(hasFounderRole(["admin"])).toBe(false);
  });

  it("normalizes and deduplicates database role rows", () => {
    expect(normalizeRoleNames([{ role: "Admin" }, "admin", { role: "Founder" }])).toEqual([
      "admin",
      "founder",
    ]);
  });
});
