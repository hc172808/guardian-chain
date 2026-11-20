import React from "react";
import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "@/lib/api";
import { TreasuryWallets } from "@/components/admin/TreasuryWallets";

vi.mock("@/lib/api", () => ({ api: { get: vi.fn(), post: vi.fn() } }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));

const unconfiguredWallets = [
  "founder",
  "miningPool",
  "liquidityPool",
  "stakingRewards",
  "developmentFund",
  "team",
].map((key) => ({
  key,
  name: key,
  address: "",
  allocation: 1,
  description: "",
  balance: 0,
}));

afterEach(() => vi.clearAllMocks());

describe("TreasuryWallets", () => {
  it("renders safely when server treasury addresses are not configured", async () => {
    vi.mocked(api.get).mockImplementation(async (path: string) => (
      path.endsWith("/wallets")
        ? { wallets: unconfiguredWallets, configured: false, issues: [], totalSupply: 0 }
        : { transfers: [] }
    ) as any);

    render(<TreasuryWallets />);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(screen.getByText("Treasury Wallets")).toBeInTheDocument();
    expect(screen.getByText("Configure treasury recipient addresses on the server")).toBeInTheDocument();
    expect(screen.getAllByText("Address not configured")).toHaveLength(6);
    expect(screen.getByRole("button", { name: "Configure addresses first" })).toBeDisabled();
  });
});
