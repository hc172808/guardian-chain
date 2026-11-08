import { afterEach, describe, expect, it, vi } from "vitest";
import {
  callGydsRpc,
  getConfiguredGydsRpcEndpoints,
} from "../../server/chainRpc";

type RpcCall = { endpoint: string; method: string };

function stubRpc(respond: (endpoint: string, method: string) => unknown) {
  const calls: RpcCall[] = [];
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const endpoint = String(input);
    const body = JSON.parse(String(init?.body ?? "{}"));
    calls.push({ endpoint, method: body.method });
    return {
      ok: true,
      json: async () => ({ jsonrpc: "2.0", id: body.id, result: respond(endpoint, body.method) }),
    } as Response;
  }));
  return calls;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("GYDS RPC local failover", () => {
  it("skips the built-in simulated localhost node and falls back to configured remote RPC", async () => {
    vi.stubEnv("GYDS_NETWORK", "mainnet");
    vi.stubEnv("GYDS_LOCAL_RPC_URL", "http://127.0.0.1:18545");
    vi.stubEnv("GYDS_RPC_URL", "https://rpc.example.test");
    vi.stubEnv("GYDS_RPC_BACKUP_URLS", "");

    const calls = stubRpc((endpoint, method) => {
      if (endpoint.includes("127.0.0.1")) {
        const simulated: Record<string, unknown> = {
          eth_chainId: "0x3068a",
          web3_clientVersion: "GYDSchain/mainnet/rpc/v1.0.0",
          eth_syncing: false,
          net_peerCount: "0x4",
          eth_blockNumber: "0x20",
        };
        return simulated[method];
      }
      return method === "eth_blockNumber" ? "0x42" : "0x3068a";
    });

    await expect(callGydsRpc("eth_blockNumber")).resolves.toBe("0x42");
    expect(calls.some(({ endpoint }) => endpoint === "https://rpc.example.test")).toBe(true);
  });

  it("uses an explicitly configured healthy local node before remote RPC", async () => {
    vi.stubEnv("GYDS_NETWORK", "mainnet");
    vi.stubEnv("GYDS_LOCAL_RPC_URL", "http://127.0.0.1:18546");
    vi.stubEnv("GYDS_RPC_URL", "https://rpc.example.test");
    vi.stubEnv("GYDS_RPC_BACKUP_URLS", "");

    const calls = stubRpc((_endpoint, method) => {
      const local: Record<string, unknown> = {
        eth_chainId: "0x3068a",
        web3_clientVersion: "GYDSClient/v2.0.0",
        eth_syncing: false,
        net_peerCount: "0x2",
        eth_blockNumber: "0x42",
      };
      return local[method];
    });

    await expect(callGydsRpc("eth_blockNumber")).resolves.toBe("0x42");
    expect(calls.every(({ endpoint }) => endpoint === "http://127.0.0.1:18546")).toBe(true);
  });

  it("does not invent localhost endpoints when none are configured", () => {
    vi.stubEnv("GYDS_LOCAL_RPC_URL", "");
    vi.stubEnv("GYDS_RPC_URL", "");
    vi.stubEnv("GYDS_RPC_BACKUP_URLS", "");

    expect(getConfiguredGydsRpcEndpoints()).toEqual([]);
  });
});
