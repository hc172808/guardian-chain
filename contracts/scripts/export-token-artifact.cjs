const fs = require("node:fs");
const path = require("node:path");

const contractsDir = path.resolve(__dirname, "..");
const buildInfoDir = path.join(contractsDir, "token-artifacts", "build-info");
const hardhatArtifactPath = path.join(
  contractsDir,
  "token-artifacts",
  "token-source",
  "GydsToken.sol",
  "GydsToken.json",
);

if (!fs.existsSync(hardhatArtifactPath)) {
  throw new Error("Compile the isolated GydsToken contract before exporting its wallet artifact.");
}

const artifact = JSON.parse(fs.readFileSync(hardhatArtifactPath, "utf8"));
const buildInfo = fs.readdirSync(buildInfoDir)
  .filter((file) => file.endsWith(".json"))
  .map((file) => JSON.parse(fs.readFileSync(path.join(buildInfoDir, file), "utf8")))
  .find((info) => info.output?.contracts?.[artifact.sourceName]?.[artifact.contractName]);

if (!buildInfo) {
  throw new Error("Could not find compiler metadata for GydsToken.");
}

const contractOutput = buildInfo.output.contracts[artifact.sourceName][artifact.contractName];
const output = {
  contractName: artifact.contractName,
  sourceName: artifact.sourceName,
  abi: artifact.abi,
  bytecode: artifact.bytecode,
  deployedBytecode: artifact.deployedBytecode,
  immutableReferences: contractOutput.evm.deployedBytecode.immutableReferences ?? {},
};

const destination = path.resolve(
  contractsDir,
  "..",
  "src",
  "lib",
  "contracts",
  "gydsTokenArtifact.json",
);
fs.mkdirSync(path.dirname(destination), { recursive: true });
fs.writeFileSync(destination, `${JSON.stringify(output, null, 2)}\n`);
console.log(`Exported GydsToken ABI and bytecode to ${path.relative(contractsDir, destination)}`);
