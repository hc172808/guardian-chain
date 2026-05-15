import { replitUsers, type ReplitUser, type UpsertReplitUser } from "@workspace/db/schema";
import { db } from "@workspace/db";
import { eq } from "drizzle-orm";

export interface IAuthStorage {
  getUser(id: string): Promise<ReplitUser | undefined>;
  upsertUser(user: UpsertReplitUser): Promise<ReplitUser>;
}

class AuthStorage implements IAuthStorage {
  async getUser(id: string): Promise<ReplitUser | undefined> {
    const [user] = await db.select().from(replitUsers).where(eq(replitUsers.id, id));
    return user;
  }

  async upsertUser(userData: UpsertReplitUser): Promise<ReplitUser> {
    const [user] = await db
      .insert(replitUsers)
      .values(userData)
      .onConflictDoUpdate({
        target: replitUsers.id,
        set: { ...userData, updatedAt: new Date() },
      })
      .returning();
    return user;
  }
}

export const authStorage = new AuthStorage();
