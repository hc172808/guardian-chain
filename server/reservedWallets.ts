/**
 * reservedWallets.ts — canonical genesis allocation table (server side).
 *
 * Mirrors src/config/wallets.ts (RESERVED_WALLETS) so the API and UI use the
 * approved public recipients for the 3,000,000,000 GYDS genesis allocation.
 *
 * The founder login/admin wallet can be configured separately. The genesis
 * recipient list stays fixed to the six addresses approved for both networks.
 */

export const GENESIS_FOUNDER_ADDRESS = "0x6422d12bfaddee5142bfad21b3006a74d09017b1";

export const FOUNDER_WALLET_ADDRESS = (
  process.env.FOUNDER_WALLET_ADDRESS ??
  process.env.FOUNDER_WALLET ??
  GENESIS_FOUNDER_ADDRESS
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
    address: GENESIS_FOUNDER_ADDRESS,
    allocation: 300_000_000,
    description: "Founder allocation (10% of supply)",
  },
  {
    key: "miningPool",
    name: "Mining Pool",
    address: "0x484a282e391C75595337F1B0314CCa4e2F31E188",
    allocation: 1_200_000_000,
    description: "Mining rewards distribution pool (40%)",
  },
  {
    key: "liquidityPool",
    name: "Liquidity Pool",
    address: "0xcAA827c6F120Bc0cAcbcfa53476eE3b41b37c9e4",
    allocation: 600_000_000,
    description: "DEX liquidity provision (20%)",
  },
  {
    key: "stakingRewards",
    name: "Staking Rewards",
    address: "0xF71EFF5d7290dC897BF2f1619Ce02AB98Af73040",
    allocation: 450_000_000,
    description: "PoS validator staking rewards (15%)",
  },
  {
    key: "developmentFund",
    name: "Development Fund",
    address: "0x67B5d5581C2438ae4C1207544960394085125F83",
    allocation: 300_000_000,
    description: "Development and ecosystem growth (10%)",
  },
  {
    key: "team",
    name: "Team Wallet",
    address: "0xA8029E177f234A7A838dDB36fbA57336b02Df197",
    allocation: 150_000_000,
    description: "Team allocation, 36-month vesting (5%)",
  },
];

export const TOTAL_GENESIS_SUPPLY = RESERVED_WALLETS.reduce((s, w) => s + w.allocation, 0);

export function isReservedAddress(address: string): boolean {
  const a = address.toLowerCase();
  return RESERVED_WALLETS.some((w) => w.address.toLowerCase() === a);
}
