function roleName(value: unknown): string | null {
  const candidate =
    typeof value === "string"
      ? value
      : value && typeof value === "object" && "role" in value
        ? (value as { role?: unknown }).role
        : null;

  return typeof candidate === "string" ? candidate.trim().toLowerCase() : null;
}

export function normalizeRoleNames(roles: readonly unknown[]): string[] {
  return [...new Set(roles.map(roleName).filter((role): role is string => Boolean(role)))];
}

export function hasAdminRole(roles: readonly unknown[]): boolean {
  return normalizeRoleNames(roles).some((role) => role === "admin" || role === "founder");
}

export function hasFounderRole(roles: readonly unknown[]): boolean {
  return normalizeRoleNames(roles).includes("founder");
}
