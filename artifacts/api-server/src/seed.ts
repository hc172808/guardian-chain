import { db } from "@workspace/db";
import * as schema from "@workspace/db/schema";

export async function seedDatabase() {
  console.log("🌱 Seeding database...");

  // ── Network Validators ────────────────────────────────────────────────────
  console.log("  → Validators...");
  await db.delete(schema.networkValidatorsTable);
  await db.insert(schema.networkValidatorsTable).values([
    {
      address: "0xA1B2C3D4E5F6A1B2C3D4E5F6A1B2C3D4E5F6A1B2",
      name: "GYDS Genesis Node",
      stake: 500_000,
      commission: 5,
      uptime: 99.98,
      blocks_proposed: 48_320,
      last_vote_height: 1_234_560,
      is_active: true,
      is_jailed: false,
    },
    {
      address: "0xB2C3D4E5F6A1B2C3D4E5F6A1B2C3D4E5F6A1B2C3",
      name: "Staking Pool Alpha",
      stake: 320_000,
      commission: 7,
      uptime: 99.75,
      blocks_proposed: 31_200,
      last_vote_height: 1_234_559,
      is_active: true,
      is_jailed: false,
    },
    {
      address: "0xC3D4E5F6A1B2C3D4E5F6A1B2C3D4E5F6A1B2C3D4",
      name: "Decentralized Ventures",
      stake: 275_000,
      commission: 8,
      uptime: 99.60,
      blocks_proposed: 27_890,
      last_vote_height: 1_234_558,
      is_active: true,
      is_jailed: false,
    },
    {
      address: "0xD4E5F6A1B2C3D4E5F6A1B2C3D4E5F6A1B2C3D4E5",
      name: "ChainSecure Labs",
      stake: 200_000,
      commission: 6,
      uptime: 99.90,
      blocks_proposed: 22_100,
      last_vote_height: 1_234_557,
      is_active: true,
      is_jailed: false,
    },
    {
      address: "0xE5F6A1B2C3D4E5F6A1B2C3D4E5F6A1B2C3D4E5F6",
      name: "Node Runners DAO",
      stake: 180_000,
      commission: 10,
      uptime: 98.40,
      blocks_proposed: 18_750,
      last_vote_height: 1_234_545,
      is_active: true,
      is_jailed: false,
    },
    {
      address: "0xF6A1B2C3D4E5F6A1B2C3D4E5F6A1B2C3D4E5F6A1",
      name: "Jailed Node (Demo)",
      stake: 50_000,
      commission: 12,
      uptime: 71.20,
      blocks_proposed: 4_200,
      last_vote_height: 1_230_000,
      is_active: false,
      is_jailed: true,
    },
  ]);

  // ── Tokens ────────────────────────────────────────────────────────────────
  console.log("  → Tokens...");
  await db.delete(schema.tokensTable);
  await db.insert(schema.tokensTable).values([
    {
      name: "GYDS Coin",
      symbol: "GYDS",
      description: "The native gas and staking token of the GYDSchain ecosystem.",
      decimals: 18,
      total_supply: 1_000_000_000,
      circulating_supply: 420_000_000,
      price: 0.0423,
      price_change_24h: 3.21,
      market_cap: 17_766_000,
      volume_24h: 1_204_800,
      token_type: "NATIVE",
      is_active: true,
      is_verified: true,
    },
    {
      name: "GYD Stablecoin",
      symbol: "GYD",
      description: "USD-pegged stablecoin minted on GYDSchain.",
      decimals: 18,
      total_supply: 50_000_000,
      circulating_supply: 50_000_000,
      price: 1.0,
      price_change_24h: 0.01,
      market_cap: 50_000_000,
      volume_24h: 4_500_000,
      token_type: "STABLECOIN",
      is_active: true,
      is_verified: true,
    },
    {
      name: "ChainCore Token",
      symbol: "CORE",
      description: "Governance token for the ChainCore protocol.",
      decimals: 18,
      total_supply: 100_000_000,
      circulating_supply: 35_000_000,
      price: 0.127,
      price_change_24h: -1.85,
      market_cap: 4_445_000,
      volume_24h: 312_400,
      token_type: "ERC20",
      is_active: true,
      is_verified: true,
    },
    {
      name: "Yield Finance",
      symbol: "YFI-G",
      description: "Auto-compounding yield aggregator on GYDSchain.",
      decimals: 18,
      total_supply: 10_000,
      circulating_supply: 8_200,
      price: 142.50,
      price_change_24h: 5.72,
      market_cap: 1_168_500,
      volume_24h: 89_300,
      token_type: "ERC20",
      is_active: true,
      is_verified: false,
    },
    {
      name: "DeepSea NFT",
      symbol: "DSEA",
      description: "NFT-backed liquidity token.",
      decimals: 0,
      total_supply: 9_999,
      circulating_supply: 9_999,
      price: 0.0087,
      price_change_24h: -4.10,
      market_cap: 86_991,
      volume_24h: 12_400,
      token_type: "ERC721",
      is_active: true,
      is_verified: false,
    },
  ]);

  // ── Liquidity Pools ───────────────────────────────────────────────────────
  console.log("  → Liquidity pools...");
  await db.delete(schema.liquidityPoolsTable);
  await db.insert(schema.liquidityPoolsTable).values([
    {
      token_a_symbol: "GYDS",
      token_b_symbol: "GYD",
      tvl: 8_420_000,
      volume_24h: 1_840_000,
      fees_24h: 5_520,
      apr: 24.7,
      fee_tier: 0.003,
      is_active: true,
      creator_id: "system",
    },
    {
      token_a_symbol: "GYDS",
      token_b_symbol: "CORE",
      tvl: 2_310_000,
      volume_24h: 420_000,
      fees_24h: 1_260,
      apr: 38.4,
      fee_tier: 0.003,
      is_active: true,
      creator_id: "system",
    },
    {
      token_a_symbol: "GYD",
      token_b_symbol: "YFI-G",
      tvl: 980_000,
      volume_24h: 157_000,
      fees_24h: 471,
      apr: 17.6,
      fee_tier: 0.003,
      is_active: true,
      creator_id: "system",
    },
    {
      token_a_symbol: "GYDS",
      token_b_symbol: "YFI-G",
      tvl: 640_000,
      volume_24h: 89_400,
      fees_24h: 268,
      apr: 51.2,
      fee_tier: 0.005,
      is_active: true,
      creator_id: "system",
    },
    {
      token_a_symbol: "GYD",
      token_b_symbol: "DSEA",
      tvl: 210_000,
      volume_24h: 31_200,
      fees_24h: 156,
      apr: 12.3,
      fee_tier: 0.005,
      is_active: true,
      creator_id: "system",
    },
  ]);

  // ── Token Price ───────────────────────────────────────────────────────────
  console.log("  → Token price...");
  await db.delete(schema.tokenPriceTable);
  await db.insert(schema.tokenPriceTable).values([
    {
      price: 0.0423,
      total_supply: 1_000_000_000,
      circulating_supply: 420_000_000,
      burned_total: 12_400_000,
    },
  ]);

  // ── Feature Toggles ───────────────────────────────────────────────────────
  console.log("  → Feature toggles...");
  await db.delete(schema.featureTogglesTable);
  await db.insert(schema.featureTogglesTable).values([
    { feature_key: "defi_swap",      feature_name: "DeFi Swap",        description: "Enable token swapping.", is_enabled: true,  admin_only: false },
    { feature_key: "faucet",         feature_name: "Faucet",            description: "Enable the GYDS test faucet.", is_enabled: true,  admin_only: false },
    { feature_key: "token_launch",   feature_name: "Token Launch",      description: "Allow new token launches.", is_enabled: true,  admin_only: false },
    { feature_key: "smart_contracts",feature_name: "Smart Contracts",   description: "Enable smart contract editor.", is_enabled: true,  admin_only: false },
    { feature_key: "node_terminal",  feature_name: "Node Terminal",     description: "Admin-only node terminal.", is_enabled: true,  admin_only: true  },
    { feature_key: "analytics_v2",   feature_name: "Analytics V2",      description: "Next-gen analytics (beta).", is_enabled: false, admin_only: false },
  ]);

  // ── Documentation ─────────────────────────────────────────────────────────
  console.log("  → Documentation...");
  await db.delete(schema.documentationTable);
  await db.insert(schema.documentationTable).values([
    {
      title: "Getting Started with GYDSchain",
      slug: "getting-started",
      category: "intro",
      order_index: 0,
      is_published: true,
      content: "## Welcome to GYDSchain\n\nGYDSchain is a Proof-of-Stake blockchain with a dual-coin system: **GYDS** (gas & staking) and **GYD** (USD-pegged stablecoin).\n\n### Quick Start\n1. Install the GYDS Litenode\n2. Create a wallet\n3. Claim testnet tokens from the Faucet\n4. Explore blocks in the Explorer",
    },
    {
      title: "GYDS Tokenomics",
      slug: "tokenomics",
      category: "intro",
      order_index: 1,
      is_published: true,
      content: "## Tokenomics\n\n- **Total Supply:** 1,000,000,000 GYDS\n- **Circulating:** 420,000,000 GYDS\n- **Burned:** 12,400,000 GYDS\n\n### Distribution\n- 40% Community & Ecosystem\n- 25% Staking Rewards\n- 20% Team & Advisors (4-year vest)\n- 15% Treasury",
    },
    {
      title: "Running a Validator Node",
      slug: "running-a-validator",
      category: "nodes",
      order_index: 0,
      is_published: true,
      content: "## Validator Setup\n\n### Requirements\n- 4 CPU cores, 16 GB RAM, 500 GB SSD\n- Minimum 50,000 GYDS stake\n\n```bash\ncurl -sSL https://install.gydschain.io | bash\ngyds-litenode start --validator\n```",
    },
    {
      title: "DeFi on GYDSchain",
      slug: "defi-guide",
      category: "defi",
      order_index: 0,
      is_published: true,
      content: "## DeFi Guide\n\n### Swapping Tokens\nUse the Swap tab to exchange GYDS ↔ GYD or any listed token pair.\n\n### Providing Liquidity\nAdd liquidity to a pool to earn a share of the 0.3% swap fee.",
    },
    {
      title: "Smart Contract Deployment",
      slug: "smart-contracts",
      category: "developers",
      order_index: 0,
      is_published: true,
      content: "## Smart Contracts\n\nGYDSchain is EVM-compatible. Deploy Solidity contracts using the built-in editor.\n\n### Steps\n1. Write or paste your Solidity code\n2. Compile and review bytecode\n3. Deploy to the network\n4. Verify your contract",
    },
  ]);

  // ── Sample Transactions ───────────────────────────────────────────────────
  console.log("  → Sample transactions...");
  await db.delete(schema.transactionsTable);
  await db.insert(schema.transactionsTable).values([
    {
      hash: "0xabc123def456abc123def456abc123def456abc123def456abc123def456abc1",
      block_height: 1_234_560,
      from_address: "0xA1B2C3D4E5F6A1B2C3D4E5F6A1B2C3D4E5F6A1B2",
      to_address: "0xB2C3D4E5F6A1B2C3D4E5F6A1B2C3D4E5F6A1B2C3",
      value: 1500, fee: 0.021, status: "success", tx_type: "transfer",
      is_confirmed: true, confirmations: 120,
    },
    {
      hash: "0xdef456abc123def456abc123def456abc123def456abc123def456abc123def4",
      block_height: 1_234_559,
      from_address: "0xC3D4E5F6A1B2C3D4E5F6A1B2C3D4E5F6A1B2C3D4",
      to_address: "0xD4E5F6A1B2C3D4E5F6A1B2C3D4E5F6A1B2C3D4E5",
      value: 25000, fee: 0.035, status: "success", tx_type: "stake",
      is_confirmed: true, confirmations: 108,
    },
    {
      hash: "0x123abc456def123abc456def123abc456def123abc456def123abc456def123a",
      block_height: 1_234_558,
      from_address: "0xE5F6A1B2C3D4E5F6A1B2C3D4E5F6A1B2C3D4E5F6",
      to_address: "0xF6A1B2C3D4E5F6A1B2C3D4E5F6A1B2C3D4E5F6A1",
      value: 500, fee: 0.018, status: "success", tx_type: "transfer",
      is_confirmed: true, confirmations: 95,
    },
    {
      hash: "0x456def123abc456def123abc456def123abc456def123abc456def123abc456d",
      block_height: 1_234_567,
      from_address: "0xB2C3D4E5F6A1B2C3D4E5F6A1B2C3D4E5F6A1B2C3",
      to_address: "0xA1B2C3D4E5F6A1B2C3D4E5F6A1B2C3D4E5F6A1B2",
      value: 8750, fee: 0.022, status: "pending", tx_type: "transfer",
      is_confirmed: false, confirmations: 0,
    },
    {
      hash: "0x789abc012def789abc012def789abc012def789abc012def789abc012def789a",
      block_height: 1_234_555,
      from_address: "0xD4E5F6A1B2C3D4E5F6A1B2C3D4E5F6A1B2C3D4E5",
      to_address: null,
      value: 100_000, fee: 0.05, status: "success", tx_type: "deploy",
      is_confirmed: true, confirmations: 360,
    },
  ]);

  // ── Token Launches ────────────────────────────────────────────────────────
  console.log("  → Token launches...");
  await db.delete(schema.tokenLaunchesTable);
  const now = new Date();
  const soon = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
  const past = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000);
  await db.insert(schema.tokenLaunchesTable).values([
    {
      name: "AquaDAO", symbol: "AQUA",
      description: "Decentralized water resource management DAO.",
      creator_id: "system", status: "active",
      target_raise: 500_000, raised_amount: 312_400,
      initial_price: 0.001, max_price: 0.01,
      bonding_curve_type: "linear", bonding_curve_steepness: 1.2,
      participants: 847, is_premier: true,
      starts_at: past, ends_at: soon,
    },
    {
      name: "SolarNode", symbol: "SLRN",
      description: "Tokenized solar energy certificates on-chain.",
      creator_id: "system", status: "active",
      target_raise: 200_000, raised_amount: 78_600,
      initial_price: 0.0005, max_price: 0.005,
      bonding_curve_type: "exponential", bonding_curve_steepness: 1.5,
      participants: 231, is_premier: false,
      starts_at: past, ends_at: soon,
    },
    {
      name: "MetaLand", symbol: "MLAND",
      description: "Virtual real estate in the GYDSchain metaverse.",
      creator_id: "system", status: "completed",
      target_raise: 1_000_000, raised_amount: 1_000_000,
      initial_price: 0.002, max_price: 0.02,
      bonding_curve_type: "linear", bonding_curve_steepness: 1.0,
      participants: 3412, is_premier: true,
      starts_at: past, ends_at: past,
    },
  ]);

  console.log("✅ Seed complete!");
  process.exit(0);
}

if (process.argv[1] && process.argv[1].includes("seed")) {
  seedDatabase().catch((err) => {
    console.error("Seed failed:", err);
    process.exit(1);
  });
}
