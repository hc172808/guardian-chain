import { describe, expect, it, vi } from "vitest";
import { normalizeNodeRpcUrl, readGenesisSnapshotFromRpc } from "../../server/genesisStatus";

const ADDRESSES = [
  "0x0000000000000000000000000000000000000001",
  "0x0000000000000000000000000000000000000002",
];
const TOTAL_WEI = 3_000_000_000n * 10n ** 18n;
const GENESIS_HASH = `0x${"a".repeat(64)}`;

function mockRpcFetch(options?: { chainId?: string; blockNumber?: string | null; balances?: Record<string, string> }) {
  const calls: Array<{ method: string; params: unknown[] }> = [];
  const fetcher = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as { method: string; params?: unknown[] };
    calls.push({ method: body.method, params: body.params ?? [] });
    let result: unknown;
    if (body.method === "eth_chainId") result = options?.chainId ?? "0x3068a";
    else if (body.method === "eth_getBlockByNumber") {
      result = options?.blockNumber === null
        ? null
        : { number: options?.blockNumber ?? "0x0", hash: GENESIS_HASH, timestamp: "0x65" };
    } else if (body.method === "eth_getBalance") {
      const address = String(body.params?.[0]).toLowerCase();
      result = options?.balances?.[address] ?? "0x0";
    }
    return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as unknown as typeof fetch;
  return { fetcher, calls };
}

describe("node-reported genesis status", () => {
  it("sums initial balances read from block zero on the matching chain", async () => {
    const left = TOTAL_WEI / 3n;
    const right = TOTAL_WEI - left;
    const { fetcher, calls } = mockRpcFetch({
      balances: {
        [ADDRESSES[0]]: `0x${left.toString(16)}`,
        [ADDRESSES[1]]: `0x${right.toString(16)}`,
      },
    });

    const snapshot = await readGenesisSnapshotFromRpc("http://node.example:8545", 198282, ADDRESSES, fetcher);

    expect(snapshot).toEqual({
      chainId: 198282,
      genesisHash: GENESIS_HASH,
      genesisTimestamp: 101,
      initialSupplyWei: TOTAL_WEI.toString(),
    });
    expect(calls).toContainEqual({ method: "eth_getBlockByNumber", params: ["0x0", false] });
    expect(calls).toContainEqual({ method: "eth_getBalance", params: [ADDRESSES[0], "0x0"] });
  });

  it("does not report supply when the node has the wrong chain ID or no genesis block", async () => {
    const wrongChain = mockRpcFetch({ chainId: "0x1" });
    expect(await readGenesisSnapshotFromRpc("http://node.example:8545", 198282, ADDRESSES, wrongChain.fetcher)).toBeNull();

    const noGenesis = mockRpcFetch({ blockNumber: null });
    expect(await readGenesisSnapshotFromRpc("http://node.example:8545", 198282, ADDRESSES, noGenesis.fetcher)).toBeNull();
  });

  it("rejects unsafe node URLs and malformed node balances", async () => {
    expect(normalizeNodeRpcUrl("https://user:pass@node.example", null, 8545)).toBeNull();
    expect(normalizeNodeRpcUrl("node.example", 8545, 8600)).toBe("http://node.example:8545/");

    const { fetcher } = mockRpcFetch({ balances: { [ADDRESSES[0]]: "3 GYDS" } });
    expect(await readGenesisSnapshotFromRpc("http://node.example:8545", 198282, ADDRESSES, fetcher)).toBeNull();
  });
});
