import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "@/lib/api";
import { computeUserBalances, getUserAddresses } from "@/lib/balances";

vi.mock("@/lib/api", () => ({
  api: { get: vi.fn() },
  extractTransactionRows: (response: unknown) => Array.isArray(response) ? response : [],
}));

const USER_ADDRESS = "0x1111111111111111111111111111111111111111";
const TREASURY_ADDRESS = "0x2222222222222222222222222222222222222222";

afterEach(() => vi.clearAllMocks());

describe("DeFi app-ledger balance ownership", () => {
  it("does not include the shared treasury address in a user's balances", async () => {
    vi.mocked(api.get).mockImplementation(async (path: string) => {
      if (path === "/api/wallets") return [{ address: USER_ADDRESS }] as any;
      if (path === "/api/config/founder_wallet") {
        return { configValue: { address: TREASURY_ADDRESS } } as any;
      }
      if (path === "/api/token-operations") {
        return [{
          status: "confirmed",
          wallet_address: TREASURY_ADDRESS,
          operation_type: "premine_gyds",
          amount: "300000000",
        }] as any;
      }
      return [] as any;
    });

    const addresses = await getUserAddresses("new-user");
    const balances = await computeUserBalances("new-user", addresses);

    expect(addresses).toEqual(new Set([USER_ADDRESS]));
    expect(balances).toEqual({ gydsBalance: 0, gydBalance: 0, gusdBalance: 0 });
    expect(api.get).not.toHaveBeenCalledWith("/api/config/founder_wallet");
  });
});
