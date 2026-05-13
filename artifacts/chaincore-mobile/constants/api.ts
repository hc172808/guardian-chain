const domain = process.env.EXPO_PUBLIC_DOMAIN ?? "localhost:8080";
export const API_BASE = domain.startsWith("http")
  ? domain
  : `https://${domain}`;

export function apiUrl(path: string): string {
  return `${API_BASE}${path}`;
}

export async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(apiUrl(path), {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "Unknown error");
    throw new Error(`API ${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}
