import { afterEach, describe, expect, it, vi } from "vitest";
import { buildRpcEndpointList, checkRpcEndpoint } from "./infrastructureHealth";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("infrastructure RPC health checks", () => {
  it("uses configured endpoints first and adds unique localhost node ports", () => {
    expect(buildRpcEndpointList(
      [" https://rpc.example.test ", "http://127.0.0.1:8545", ""],
      [8545, 8565, 0],
    )).toEqual([
      "https://rpc.example.test",
      "http://127.0.0.1:8545",
      "http://127.0.0.1:8565",
    ]);
  });

  it("reports a valid JSON-RPC block number as reachable", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      json: async () => ({ result: "0x2a" }),
    })));

    await expect(checkRpcEndpoint("http://127.0.0.1:8545")).resolves.toMatchObject({
      url: "http://127.0.0.1:8545",
      reachable: true,
      blockNumber: "0x2a",
    });
  });

  it("reports JSON-RPC errors as unreachable", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      json: async () => ({ error: { message: "node unavailable" } }),
    })));

    await expect(checkRpcEndpoint("http://127.0.0.1:8545")).resolves.toMatchObject({
      reachable: false,
      error: "node unavailable",
    });
  });
});
