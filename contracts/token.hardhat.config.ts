import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.20",
    settings: {
      optimizer: { enabled: true, runs: 200 },
      evmVersion: "paris",
    },
  },
  networks: {
    hardhat: { chainId: 198282 },
  },
  paths: {
    sources: "./token-source",
    tests: "./token-test",
    cache: "./cache-token",
    artifacts: "./token-artifacts",
  },
};

export default config;
