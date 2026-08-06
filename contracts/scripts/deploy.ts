import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying GydsSwap contracts to GYDSchain (Chain ID 198282)");
  console.log("Deployer:", deployer.address);
  console.log("Balance:", ethers.formatEther(await deployer.provider.getBalance(deployer.address)), "GYDS");

  // 1. Deploy WGYDS
  const WGYDS = await ethers.getContractFactory("WGYDS");
  const wgyds = await WGYDS.deploy();
  await wgyds.waitForDeployment();
  console.log("WGYDS:            ", await wgyds.getAddress());

  // 2. Deploy GydsSwapFactory
  const Factory = await ethers.getContractFactory("GydsSwapFactory");
  const factory = await Factory.deploy(deployer.address);
  await factory.waitForDeployment();
  const factoryAddr = await factory.getAddress();
  console.log("GydsSwapFactory:  ", factoryAddr);

  // 3. Deploy GydsSwapRouter
  const Router = await ethers.getContractFactory("GydsSwapRouter");
  const router = await Router.deploy(factoryAddr, await wgyds.getAddress());
  await router.waitForDeployment();
  console.log("GydsSwapRouter:   ", await router.getAddress());

  // 4. Deploy GydsSwapFarm (emission: 1 GYDS per block)
  const Farm = await ethers.getContractFactory("GydsSwapFarm");
  const emissionRate = ethers.parseEther("1");
  const farm = await Farm.deploy(deployer.address, emissionRate);
  await farm.waitForDeployment();
  console.log("GydsSwapFarm:     ", await farm.getAddress());

  // 5. Create initial pairs
  const pairs: Array<[string, string, string, string]> = [
    // In a real deployment, use actual deployed token addresses
    // These are placeholder addresses for testing
    ["0x0000000000000000000000000000000000000001", "0x0000000000000000000000000000000000000002", "GYDS", "USDT"],
    ["0x0000000000000000000000000000000000000001", "0x0000000000000000000000000000000000000003", "GYDS", "ETH"],
    ["0x0000000000000000000000000000000000000001", "0x0000000000000000000000000000000000000004", "GYDS", "BTC"],
    ["0x0000000000000000000000000000000000000001", "0x0000000000000000000000000000000000000005", "GYDS", "USDC"],
  ];

  console.log("\nDeployment complete. Summary:");
  console.log("─────────────────────────────────────────");
  console.log("Network:           GYDSchain (Chain ID 198282)");
  console.log("WGYDS:            ", await wgyds.getAddress());
  console.log("GydsSwapFactory:  ", factoryAddr);
  console.log("GydsSwapRouter:   ", await router.getAddress());
  console.log("GydsSwapFarm:     ", await farm.getAddress());
  console.log("─────────────────────────────────────────");
  console.log("\nNext steps:");
  console.log("1. Update INIT_CODE_HASH in GydsSwapLibrary.sol");
  console.log("2. Set feeTo address: factory.setFeeTo(<treasury>)");
  console.log("3. Create pairs with real token addresses: factory.createPair(...)");
  console.log("4. Add pools to farm: farm.addPool(<glpToken>, <allocPoints>)");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
