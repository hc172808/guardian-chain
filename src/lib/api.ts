async function parseResponse(res: Response, path?: string) {
  const contentType = res.headers.get("content-type") ?? "";
  const text = await res.text();
  const endpoint = path ?? "(unknown endpoint)";

  // JSON path
  if (contentType.includes("application/json")) {
    try {
      return text ? JSON.parse(text) : {};
    } catch {
      console.error(`[api] Invalid JSON from ${endpoint} status=${res.status} snippet=`, text.slice(0, 200));
      throw new Error(`Invalid JSON response (status ${res.status}) from ${endpoint}`);
    }
  }

  // Non-JSON — commonly an HTML error / SPA-fallback page.
  const trimmed = text.trimStart().toLowerCase();
  const looksHtml = trimmed.startsWith("<!doctype") || trimmed.startsWith("<html");
  if (looksHtml) {
    console.error(
      `[api] HTML response from ${endpoint} status=${res.status} contentType=${contentType || "(none)"} — snippet:`,
      text.slice(0, 200),
    );
    throw new Error(
      res.ok
        ? `Server returned HTML instead of JSON from ${endpoint} (status ${res.status}) — likely a routing/proxy issue.`
        : `Server error ${res.status} from ${endpoint}: request did not reach the API.`,
    );
  }

  // Best-effort JSON parse as a last resort (some backends omit content-type)
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    console.error(`[api] Non-JSON response from ${endpoint} status=${res.status} contentType=${contentType || "(none)"}`);
    throw new Error(text || res.statusText || `Request failed (${res.status}) from ${endpoint}`);
  }
}

async function apiFetch(path: string, options?: RequestInit) {
  const res = await fetch(path, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(options?.headers ?? {}) },
    ...options,
  });
  if (!res.ok) {
    const body = await parseResponse(res, path).catch((e) => ({ error: e.message }));
    const err = (body && typeof body === "object" ? (body as any).error : null) ?? res.statusText;
    throw new Error(err);
  }
  return parseResponse(res, path);
}

export const api = {
  get: (path: string) => apiFetch(path),
  post: (path: string, body: unknown) => apiFetch(path, { method: "POST", body: JSON.stringify(body) }),
  patch: (path: string, body: unknown) => apiFetch(path, { method: "PATCH", body: JSON.stringify(body) }),
  put: (path: string, body: unknown) => apiFetch(path, { method: "PUT", body: JSON.stringify(body) }),
  delete: (path: string) => apiFetch(path, { method: "DELETE" }),
};
