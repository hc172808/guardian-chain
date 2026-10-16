const RPC_TIMEOUT_MS = 2_500;

export interface GenesisRpcSnapshot {
  chainId: number;
  genesisHash: string;
  genesisTimestamp: number | null;
  initialSupplyWei: string;
}

function parseRpcQuantity(value: unknown): number | null {
  if (typeof value !== "string" || !/^0x[0-9a-f]+$/i.test(value)) return null;
  try {
    const parsed = BigInt(value);
    return parsed <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(parsed) : null;
  } catch {
    return null;
  }
}

export function normalizeNodeRpcUrl(hostValue: unknown, portValue: unknown, defaultPort: number): string | null {
  if (typeof hostValue !== "string" || !hostValue.trim()) return null;
  const host = hostValue.trim();
  const rawUrl = host.includes("://")
    ? host
    : `http://${host.match(/:/g)?.length && host.match(/:/g)!.length > 1 && !host.startsWith("[") ? `[${host}]` : host}`;

  try {
    const url = new URL(rawUrl);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (url.username || url.password) return null;
    if (!url.port) {
      const parsedPort = Number(portValue);
      const port = Number.isInteger(parsedPort) && parsedPort > 0 && parsedPort <= 65_535
        ? parsedPort
        : defaultPort;
      url.port = String(port);
    }
    url.search = "";
    url.hash = "";
    return url.toString().replace(/\/+$/, "");
  } catch {
    return null;
  }
}

export async function readGenesisSnapshotFromRpc(
  rpcUrl: string,
  expectedChainId: number,
  allocationAddresses: string[],
  fetcher: typeof fetch = fetch,
): Promise<GenesisRpcSnapshot | null> {
  if (!allocationAddresses.length || allocationAddresses.some((address) => !/^0x[0-9a-f]{40}$/i.test(address))) {
    return null;
  }

  const rpc = async (method: string, params: unknown[] = []) => {
    const response = await fetcher(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      signal: AbortSignal.timeout(RPC_TIMEOUT_MS),
    });
    if (!response.ok) throw new Error(`RPC request failed with status ${response.status}`);
    const payload = await response.json() as { result?: unknown; error?: { message?: string } };
    if (payload.error || !("result" in payload)) throw new Error(payload.error?.message ?? "Invalid JSON-RPC response");
    return payload.result;
  };

  try {
    const [chainIdValue, blockValue] = await Promise.all([
      rpc("eth_chainId"),
      rpc("eth_getBlockByNumber", ["0x0", false]),
    ]);
    const chainId = parseRpcQuantity(chainIdValue);
    if (chainId !== expectedChainId || !blockValue || typeof blockValue !== "object") return null;

    const block = blockValue as { number?: unknown; hash?: unknown; timestamp?: unknown };
    const blockNumber = parseRpcQuantity(block.number);
    if (blockNumber !== 0 || typeof block.hash !== "string" || !/^0x[0-9a-f]{64}$/i.test(block.hash)) {
      return null;
    }

    const balanceValues = await Promise.all(
      allocationAddresses.map((address) => rpc("eth_getBalance", [address, "0x0"])),
    );
    let initialSupplyWei = 0n;
    for (const balance of balanceValues) {
      if (typeof balance !== "string" || !/^0x[0-9a-f]+$/i.test(balance)) return null;
      initialSupplyWei += BigInt(balance);
    }

    const timestamp = parseRpcQuantity(block.timestamp);
    return {
      chainId,
      genesisHash: block.hash,
      genesisTimestamp: timestamp,
      initialSupplyWei: initialSupplyWei.toString(),
    };
  } catch {
    return null;
  }
}
