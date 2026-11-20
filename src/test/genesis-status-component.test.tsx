import React from "react";
import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "@/lib/api";
import { GenesisStatus } from "@/components/dashboard/GenesisStatus";

vi.mock("@/lib/api", () => ({ api: { get: vi.fn() } }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ isFounder: false }) }));
vi.mock("@/contexts/NetworkContext", () => ({
  useNetwork: () => ({ selectedNetwork: "mainnet" }),
  NETWORK_BADGE: {
    mainnet: { label: "Mainnet" },
    testnet: { label: "Testnet" },
    devnet: { label: "Devnet" },
  },
}));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));

const GENESIS_HASH = `0x${"a".repeat(64)}`;

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("GenesisStatus", () => {
  it("refreshes a pending status and displays the live block without requiring supply data", async () => {
    vi.useFakeTimers();
    let statusCalls = 0;
    vi.mocked(api.get).mockImplementation(async (path: string) => {
      if (path === "/api/config/founder_wallet") {
        return { configValue: { address: "0x0000000000000000000000000000000000000001" } } as any;
      }
      statusCalls += 1;
      if (statusCalls === 1) return { configured: false, network: "mainnet" } as any;
      return {
        configured: true,
        network: "mainnet",
        genesisHash: GENESIS_HASH,
        genesisTimestamp: 101,
        initialSupplyWei: null,
        symbol: "GYDS",
      } as any;
    });

    render(<GenesisStatus />);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(screen.getByText("Pending")).toBeInTheDocument();
    expect(screen.getByText("Waiting for a live genesis block")).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });

    expect(screen.getByText("Initialized")).toBeInTheDocument();
    expect(screen.getByText("Genesis Block Hash")).toBeInTheDocument();
    expect(screen.getByText(`${GENESIS_HASH.slice(0, 12)}…${GENESIS_HASH.slice(-10)}`)).toBeInTheDocument();
    expect(screen.getByText(new Date(101_000).toLocaleString())).toBeInTheDocument();
    expect(screen.queryByText("Pending")).not.toBeInTheDocument();
    expect(statusCalls).toBe(2);
  });
});
