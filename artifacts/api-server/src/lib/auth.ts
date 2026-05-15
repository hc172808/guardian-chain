import { getAuth } from "@clerk/express";
import type { Request } from "express";

/**
 * Safe wrapper around Clerk's getAuth().
 * Returns { userId: null } when Clerk middleware is not active
 * (e.g. CLERK_SECRET_KEY not set in dev/testing).
 */
export function safeGetAuth(req: Request): { userId: string | null } {
  if (!process.env.CLERK_SECRET_KEY) {
    return { userId: null };
  }
  try {
    return getAuth(req);
  } catch {
    return { userId: null };
  }
}
