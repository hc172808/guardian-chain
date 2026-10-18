import { ethers } from "hardhat";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const EXPECTED_CHAIN_ID = 198282n;

function readOptionalTokenAddress(key: string): string | null {
  const value = process.env[key]?.trim();
  if (!value) return null;
  if (!ethers.isAddress(value) || value.toLowerCase() === ZERO_ADDRESS) {
    throw new Error(`${key} must be a real, non-zero ERC-20 contract address.`);
  }
  return ethers.getAddress(value);
}

function saveAddressesToRootEnv(values: Record<string, string>) {
  const envPath = fileURLToPath(new URL("../../.env", import.meta.url));
  let content = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf8") : "";
  for (const [key, value] of Object.entries(values)) {
    const line = `${key}=${value}`;
    const pattern = new RegExp(`^${key}=.*$`, "m");
    content = pattern.test(content) ? content.replace(pattern, line) : `${content.replace(/\s*$/, "")}\n${line}\n`;
  }
  fs.writeFileSync(path.resolve(envPath), content, "utf8");
}

async function validateTokenContract(address: string | null, expectedSymbol: "USDT" | "GYD") {
  if (!address) return;
  const code = await ethers.provider.getCode(address);
  if (!code || code === "0x") {
    throw new Error(`${expectedSymbol} address has no contract code on the connected chain.`);
  }
  const token = new ethers.Contract(address, [
    "function symbol() view returns (string)",
    "function decimals() view returns (uint8)",
  ], ethers.provider);
  const [symbol, decimals] = await Promise.all([token.symbol(), token.decimals()]);
  if (String(symbol).toUpperCase() !== expectedSymbol) {
    throw new Error(`${expectedSymbol} address reports token symbol "${symbol}". Refusing to create a misleading pair.`);
  }
  if (Number(decimals) > 36) {
    throw new Error(`${expectedSymbol} token reports unsupported decimals (${decimals}).`);
  }
}

async function main() {
  if (!process.env.DEPLOYER_PRIVATE_KEY) {
    throw new Error("DEPLOYER_PRIVATE_KEY is not configured. Add it as a server secret; do not paste it into chat or commit it.");
  }
  const [deployer] = await ethers.getSigners();
  const chainId = (await ethers.provider.getNetwork()).chainId;
  if (chainId !== EXPECTED_CHAIN_ID) {
    throw new Error(
      `Refusing to deploy GydsSwap: connected RPC is chain ${chainId}; expected GYDS mainnet ${EXPECTED_CHAIN_ID}.`,
    );
  }

  const usdtAddress = readOptionalTokenAddress("GYDS_USDT_TOKEN_ADDRESS");
  const gydAddress = readOptionalTokenAddress("GYDS_GYD_TOKEN_ADDRESS");
  await validateTokenContract(usdtAddress, "USDT");
  await validateTokenContract(gydAddress, "GYD");
  console.log("Deploying GydsSwap core to GYDS mainnet (198282)");
  console.log("Deployer:", deployer.address);
  console.log("Balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "GYDS");

  const WGYDS = await ethers.getContractFactory("WGYDS");
  const wgyds = await WGYDS.deploy();
  await wgyds.waitForDeployment();
  const wgydsAddress = await wgyds.getAddress();
  console.log("WGYDS:", wgydsAddress);

  const Factory = await ethers.getContractFactory("GydsSwapFactory");
  const factory = await Factory.deploy(deployer.address);
  await factory.waitForDeployment();
  const factoryAddress = await factory.getAddress();
  console.log("Factory:", factoryAddress);

  const Router = await ethers.getContractFactory("GydsSwapRouter");
  const router = await Router.deploy(factoryAddress, wgydsAddress);
  await router.waitForDeployment();
  const routerAddress = await router.getAddress();
  console.log("Router:", routerAddress);

  if (usdtAddress) {
    const tx = await factory.createPair(wgydsAddress, usdtAddress, "WGYDS", "USDT");
    await tx.wait();
    console.log("Created WGYDS/USDT pair using configured USDT contract:", usdtAddress);
  } else {
    console.log("No USDT pair created. Set GYDS_USDT_TOKEN_ADDRESS to a real ERC-20 before creating the pair.");
  }

  if (gydAddress && usdtAddress) {
    const tx = await factory.createPair(gydAddress, usdtAddress, "GYD", "USDT");
    await tx.wait();
    console.log("Created GYD/USDT pair using configured GYD and USDT contracts.");
  } else {
    console.log("No GYD/USDT pair created. Both GYDS_GYD_TOKEN_ADDRESS and GYDS_USDT_TOKEN_ADDRESS are required.");
  }

  saveAddressesToRootEnv({
    GYDS_SWAP_WGYDS_ADDRESS: wgydsAddress,
    GYDS_SWAP_FACTORY_ADDRESS: factoryAddress,
    GYDS_SWAP_ROUTER_ADDRESS: routerAddress,
    ...(usdtAddress ? { GYDS_USDT_TOKEN_ADDRESS: usdtAddress } : {}),
    ...(gydAddress ? { GYDS_GYD_TOKEN_ADDRESS: gydAddress } : {}),
  });

  console.log("\nContract addresses saved to the project .env file.");
  console.log("After restarting the app, check Admin → Server Config → DeFi Contracts.");
  console.log("Before users can trade, create the required pair(s) and add real initial liquidity.");
  if (usdtAddress && !gydAddress) {
    console.log("GYDS/USDT can be prepared; GYD/USDT still needs a real GYD ERC-20 contract address.");
  }
}

main().catch((err) => {
  console.error("GydsSwap deployment failed:", err?.message ?? err);
  process.exitCode = 1;
});
