import { HardhatUserConfig, subtask } from "hardhat/config";
import { TASK_COMPILE_SOLIDITY_GET_SOURCE_PATHS } from "hardhat/builtin-tasks/task-names";
import path from "node:path";
import "@nomicfoundation/hardhat-toolbox";

// Keep this focused test/deployment artifact isolated from unrelated legacy
// AMM contracts in this directory.
subtask(TASK_COMPILE_SOLIDITY_GET_SOURCE_PATHS).setAction(async (_args, _hre, runSuper) => {
  const sourcePaths = await runSuper();
  return sourcePaths.filter((sourcePath: string) => path.basename(sourcePath) === "UserStablecoin.sol");
});

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
    sources: "./",
    tests: "./test",
    cache: "./cache-stablecoin",
    artifacts: "./stablecoin-artifacts",
  },
};

export default config;