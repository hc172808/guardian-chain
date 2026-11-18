export interface RpcEndpointHealth {
  url: string;
  reachable: boolean;
  latency: number;
  blockNumber?: string;
  error?: string;
}

export function buildRpcEndpointList(
  configuredUrls: readonly (string | null | undefined)[],
  localPorts: readonly number[],
): string[] {
  const configured = configuredUrls
    .map((url) => url?.trim())
    .filter((url): url is string => Boolean(url));
  const local = localPorts
    .filter((port) => Number.isInteger(port) && port > 0 && port <= 65535)
    .map((port) => `http://127.0.0.1:${port}`);

  return [...new Set([...configured, ...local])];
}

export async function checkRpcEndpoint(url: string, timeoutMs = 2500): Promise<RpcEndpointHealth> {
  const startedAt = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", method: "eth_blockNumber", params: [], id: 1 }),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const payload = await response.json() as {
      result?: unknown;
      error?: { message?: string } | string;
    };
    if (payload.error) {
      const message = typeof payload.error === "string" ? payload.error : payload.error.message;
      throw new Error(message || "RPC returned an error.");
    }
    if (typeof payload.result !== "string" || !/^0x[0-9a-f]+$/i.test(payload.result)) {
      throw new Error("RPC returned an invalid block number.");
    }

    return {
      url,
      reachable: true,
      latency: Date.now() - startedAt,
      blockNumber: payload.result,
    };
  } catch (error: unknown) {
    return {
      url,
      reachable: false,
      latency: Date.now() - startedAt,
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    clearTimeout(timeout);
  }
}
