/**
 * Canonical genesis allocation table. Recipient addresses are supplied by the
 * server deployment and are never embedded in the client bundle or source.
 */
export const RESERVED_WALLET_ENV = {
  founder: "GYDS_TREASURY_FOUNDER_ADDRESS",
  miningPool: "GYDS_TREASURY_MINING_POOL_ADDRESS",
  liquidityPool: "GYDS_TREASURY_LIQUIDITY_POOL_ADDRESS",
  stakingRewards: "GYDS_TREASURY_STAKING_REWARDS_ADDRESS",
  developmentFund: "GYDS_TREASURY_DEVELOPMENT_FUND_ADDRESS",
  team: "GYDS_TREASURY_TEAM_ADDRESS",
} as const;

export type ReservedWalletKey = keyof typeof RESERVED_WALLET_ENV;
export type WalletConfigurationIssueReason = "missing" | "invalid" | "duplicate";

export interface ReservedWallet {
  key: ReservedWalletKey;
  name: string;
  address: string;
  allocation: number;
  description: string;
}

export interface WalletConfigurationIssue {
  key: ReservedWalletKey;
  envVar: string;
  reason: WalletConfigurationIssueReason;
  message: string;
}

const WALLET_DEFINITIONS: Omit<ReservedWallet, "address">[] = [
  {
    key: "founder",
    name: "Founder Wallet",
    allocation: 300_000_000,
    description: "Founder allocation (10% of supply)",
  },
  {
    key: "miningPool",
    name: "Mining Pool",
    allocation: 1_200_000_000,
    description: "Mining rewards distribution pool (40%)",
  },
  {
    key: "liquidityPool",
    name: "Liquidity Pool",
    allocation: 600_000_000,
    description: "DEX liquidity provision (20%)",
  },
  {
    key: "stakingRewards",
    name: "Staking Rewards",
    allocation: 450_000_000,
    description: "PoS validator staking rewards (15%)",
  },
  {
    key: "developmentFund",
    name: "Development Fund",
    allocation: 300_000_000,
    description: "Development and ecosystem growth (10%)",
  },
  {
    key: "team",
    name: "Team Wallet",
    allocation: 150_000_000,
    description: "Team allocation, 36-month vesting (5%)",
  },
];

export const TOTAL_GENESIS_SUPPLY = WALLET_DEFINITIONS.reduce((sum, wallet) => sum + wallet.allocation, 0);
const ADDRESS_PATTERN = /^0x[a-fA-F0-9]{40}$/;

export function isWalletAddress(value: unknown): value is string {
  return typeof value === "string" && ADDRESS_PATTERN.test(value.trim());
}

export function getReservedWalletConfiguration(): {
  configured: boolean;
  wallets: ReservedWallet[];
  issues: WalletConfigurationIssue[];
} {
  const wallets = WALLET_DEFINITIONS.map((definition) => ({
    ...definition,
    address: (process.env[RESERVED_WALLET_ENV[definition.key]] ?? "").trim().toLowerCase(),
  }));
  const issues: WalletConfigurationIssue[] = [];
  const firstAddressByValue = new Map<string, ReservedWalletKey>();

  for (const wallet of wallets) {
    const envVar = RESERVED_WALLET_ENV[wallet.key];
    if (!wallet.address) {
      issues.push({
        key: wallet.key,
        envVar,
        reason: "missing",
        message: `Set ${envVar} on the server.`,
      });
      continue;
    }

    if (!isWalletAddress(wallet.address)) {
      issues.push({
        key: wallet.key,
        envVar,
        reason: "invalid",
        message: `${envVar} must be a 20-byte 0x wallet address.`,
      });
      continue;
    }

    const firstKey = firstAddressByValue.get(wallet.address);
    if (firstKey) {
      issues.push({
        key: wallet.key,
        envVar,
        reason: "duplicate",
        message: `${envVar} must be different from ${RESERVED_WALLET_ENV[firstKey]}.`,
      });
    } else {
      firstAddressByValue.set(wallet.address, wallet.key);
    }
  }

  return { configured: issues.length === 0, wallets, issues };
}

export function getConfiguredReservedWallets(): ReservedWallet[] {
  const configuration = getReservedWalletConfiguration();
  if (!configuration.configured) {
    throw new Error(
      `Treasury recipient addresses are incomplete: ${configuration.issues.map((issue) => issue.envVar).join(", ")}.`,
    );
  }
  return configuration.wallets;
}

export function isReservedAddress(address: string): boolean {
  if (!address) return false;
  const configuration = getReservedWalletConfiguration();
  if (!configuration.configured) return false;
  const normalized = address.toLowerCase();
  return configuration.wallets.some((wallet) => wallet.address === normalized);
}
