async function parseResponse(res: Response) {
  const contentType = res.headers.get("content-type") ?? "";
  const text = await res.text();

  // JSON path
  if (contentType.includes("application/json")) {
    try {
      return text ? JSON.parse(text) : {};
    } catch {
      throw new Error(`Invalid JSON response (status ${res.status})`);
    }
  }

  // Non-JSON — commonly HTML error / SPA fallback page. Don't try to JSON.parse it.
  const trimmed = text.trimStart().toLowerCase();
  const looksHtml = trimmed.startsWith("<!doctype") || trimmed.startsWith("<html");
  if (looksHtml) {
    throw new Error(
      res.ok
        ? "Server returned an HTML page instead of JSON (likely a routing/proxy issue)."
        : `Server error ${res.status}: request did not reach the API.`,
    );
  }

  // Best-effort JSON parse as a last resort (some backends omit content-type)
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    throw new Error(text || res.statusText || `Request failed (${res.status})`);
  }
}

async function apiFetch(path: string, options?: RequestInit) {
  const res = await fetch(path, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(options?.headers ?? {}) },
    ...options,
  });
  if (!res.ok) {
    const body = await parseResponse(res).catch((e) => ({ error: e.message }));
    const err = (body && typeof body === "object" ? (body as any).error : null) ?? res.statusText;
    throw new Error(err);
  }
  return parseResponse(res);
}

export const api = {
  get: (path: string) => apiFetch(path),
  post: (path: string, body: unknown) => apiFetch(path, { method: "POST", body: JSON.stringify(body) }),
  patch: (path: string, body: unknown) => apiFetch(path, { method: "PATCH", body: JSON.stringify(body) }),
  put: (path: string, body: unknown) => apiFetch(path, { method: "PUT", body: JSON.stringify(body) }),
  delete: (path: string) => apiFetch(path, { method: "DELETE" }),
};
