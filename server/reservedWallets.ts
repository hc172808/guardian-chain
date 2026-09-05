/**
 * reservedWallets.ts — canonical genesis allocation table (server side).
 *
 * Mirrors src/config/wallets.ts (RESERVED_WALLETS) so the API and the UI agree
 * on which addresses hold the 1,000,000,000 GYDS genesis supply.
 *
 * The founder slot uses the real founder wallet address (FOUNDER_WALLET_ADDRESS
 * / FOUNDER_WALLET env, same fallback as seed.ts) so that logging in with that
 * wallet shows the real allocation instead of a placeholder.
 */

export const FOUNDER_WALLET_ADDRESS = (
  process.env.FOUNDER_WALLET_ADDRESS ??
  process.env.FOUNDER_WALLET ??
  "0x6422d12bfaddee5142bfad21b3006a74d09017b1"
).toLowerCase();

export interface ReservedWallet {
  key: string;
  name: string;
  address: string;
  allocation: number; // GYDS
  description: string;
}

export const RESERVED_WALLETS: ReservedWallet[] = [
  {
    key: "founder",
    name: "Founder Wallet",
    address: FOUNDER_WALLET_ADDRESS,
    allocation: 100_000_000,
    description: "Founder allocation (10% of supply)",
  },
  {
    key: "miningPool",
    name: "Mining Pool",
    address: "0x0000000000000000000000000000000000000002",
    allocation: 400_000_000,
    description: "Mining rewards distribution pool (40%)",
  },
  {
    key: "liquidityPool",
    name: "Liquidity Pool",
    address: "0x0000000000000000000000000000000000000003",
    allocation: 200_000_000,
    description: "DEX liquidity provision (20%)",
  },
  {
    key: "stakingRewards",
    name: "Staking Rewards",
    address: "0x0000000000000000000000000000000000000004",
    allocation: 150_000_000,
    description: "PoS validator staking rewards (15%)",
  },
  {
    key: "developmentFund",
    name: "Development Fund",
    address: "0x0000000000000000000000000000000000000005",
    allocation: 100_000_000,
    description: "Development and ecosystem growth (10%)",
  },
  {
    key: "team",
    name: "Team Wallet",
    address: "0x0000000000000000000000000000000000000006",
    allocation: 50_000_000,
    description: "Team allocation, 36-month vesting (5%)",
  },
];

export const TOTAL_GENESIS_SUPPLY = RESERVED_WALLETS.reduce((s, w) => s + w.allocation, 0);

export function isReservedAddress(address: string): boolean {
  const a = address.toLowerCase();
  return RESERVED_WALLETS.some((w) => w.address.toLowerCase() === a);
}
