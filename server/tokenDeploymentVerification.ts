import {
  ContractFactory,
  Interface,
  formatUnits,
  getAddress,
  isAddress,
  parseUnits,
} from "ethers";
import tokenArtifact from "../src/lib/contracts/gydsTokenArtifact.json";
import { callConfiguredGydsRpc } from "./chainRpc";

export const GYDS_MAINNET_CHAIN_ID = 198282;

type RpcReader = (
  method: string,
  params?: any[],
  pinnedEndpoint?: string,
) => Promise<{ result: any; endpoint: string }>;

export interface Grc20DeploymentInput {
  name: unknown;
  symbol: unknown;
  decimals: unknown;
  initialSupply: unknown;
  initialSupplyBaseUnits: unknown;
  creatorWallet: unknown;
  address: unknown;
  deploymentTxHash: unknown;
  chainId: unknown;
}

export interface VerifiedGrc20Deployment {
  name: string;
  symbol: string;
  decimals: number;
  initialSupply: string;
  initialSupplyBaseUnits: string;
  verifiedInitialBalanceBaseUnits: string;
  creatorWallet: string;
  contractAddress: string;
  deploymentTxHash: string;
  deploymentBlockNumber: string;
  chainId: number;
}

const tokenReadInterface = new Interface([
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function totalSupply() view returns (uint256)",
  "function balanceOf(address) view returns (uint256)",
]);

const FORBIDDEN_AUTHORITY_FUNCTIONS = new Set([
  "owner",
  "mint",
  "burn",
  "pause",
  "unpause",
  "freeze",
  "blacklist",
  "transferOwnership",
  "renounceOwnership",
]);

function fail(message: string): never {
  throw new Error(message);
}

function parseQuantity(value: unknown): bigint | null {
  try {
    if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) {
      return BigInt(value);
    }
    if (typeof value === "string" && /^(?:0x[0-9a-f]+|[0-9]+)$/i.test(value)) {
      return BigInt(value);
    }
  } catch {}
  return null;
}

function validateInput(input: Grc20DeploymentInput) {
  const name = typeof input.name === "string" ? input.name.trim() : "";
  const symbol = typeof input.symbol === "string" ? input.symbol.trim().toUpperCase() : "";
  const decimals = Number(input.decimals);
  const initialSupply = typeof input.initialSupply === "string" ? input.initialSupply.trim() : "";
  const baseUnitsInput = typeof input.initialSupplyBaseUnits === "string"
    ? input.initialSupplyBaseUnits
    : String(input.initialSupplyBaseUnits ?? "");
  const creatorWalletInput = typeof input.creatorWallet === "string" ? input.creatorWallet : "";
  const addressInput = typeof input.address === "string" ? input.address : "";
  const txHash = typeof input.deploymentTxHash === "string" ? input.deploymentTxHash : "";
  const chainId = Number(input.chainId);

  if (!name || name.length > 64) fail("Token name must be 1–64 characters.");
  if (!/^[A-Z0-9][A-Z0-9._-]{0,9}$/.test(symbol)) {
    fail("Token symbol must contain 1–10 letters, numbers, dots, underscores, or hyphens.");
  }
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 18) {
    fail("Token decimals must be a whole number from 0 to 18.");
  }
  if (!/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(initialSupply) || initialSupply.length > 100) {
    fail("Initial supply must be a positive decimal value.");
  }
  if (!isAddress(creatorWalletInput) || !isAddress(addressInput)) {
    fail("Creator wallet and contract address must be valid EVM addresses.");
  }
  if (!/^0x[a-fA-F0-9]{64}$/.test(txHash)) fail("Deployment transaction hash is invalid.");
  if (chainId !== GYDS_MAINNET_CHAIN_ID) fail(`Token deployments must use GYDS mainnet (${GYDS_MAINNET_CHAIN_ID}).`);

  let expectedSupply: bigint;
  try {
    expectedSupply = parseUnits(initialSupply, decimals);
  } catch {
    return fail("Initial supply has more fractional digits than the selected decimals.");
  }
  if (expectedSupply <= 0n || expectedSupply >= 1n << 256n) {
    fail("Initial supply must fit in a positive uint256 value.");
  }
  if (!/^(?:0|[1-9]\d*)$/.test(baseUnitsInput) || BigInt(baseUnitsInput) !== expectedSupply) {
    fail("Initial supply base units do not match the declared supply and decimals.");
  }

  return {
    name,
    symbol,
    decimals,
    initialSupply: formatUnits(expectedSupply, decimals),
    expectedSupply,
    creatorWallet: getAddress(creatorWalletInput),
    contractAddress: getAddress(addressInput),
    txHash: txHash.toLowerCase(),
  };
}

export async function getTokenDeploymentReadiness(
  rpc: RpcReader = callConfiguredGydsRpc,
): Promise<{ ready: boolean; chainId: number | null; reason?: string }> {
  try {
    const chain = await rpc("eth_chainId");
    const chainId = Number(parseQuantity(chain.result));
    if (chainId !== GYDS_MAINNET_CHAIN_ID) {
      return {
        ready: false,
        chainId: Number.isFinite(chainId) ? chainId : null,
        reason: `The configured server RPC is not on GYDS mainnet (expected chain ID ${GYDS_MAINNET_CHAIN_ID}).`,
      };
    }
    const block = await rpc("eth_blockNumber", [], chain.endpoint);
    if (parseQuantity(block.result) === null) {
      return { ready: false, chainId, reason: "The configured server RPC did not return a valid mainnet block number." };
    }
    return { ready: true, chainId };
  } catch {
    return {
      ready: false,
      chainId: null,
      reason: "A reachable, explicitly configured GYDS mainnet RPC is required for independent deployment verification. Local test nodes simulate receipts and do not execute token contracts.",
    };
  }
}

export async function verifyGrc20Deployment(
  input: Grc20DeploymentInput,
  rpc: RpcReader = callConfiguredGydsRpc,
): Promise<VerifiedGrc20Deployment> {
  if (tokenArtifact.abi.some((entry: any) =>
    entry.type === "function" && FORBIDDEN_AUTHORITY_FUNCTIONS.has(entry.name)
  )) {
    fail("The configured token contract artifact includes privileged authority functions.");
  }
  const requested = validateInput(input);

  let chain = await rpc("eth_chainId");
  if (Number(parseQuantity(chain.result)) !== GYDS_MAINNET_CHAIN_ID) {
    fail(`The configured server RPC is not on GYDS mainnet (expected chain ID ${GYDS_MAINNET_CHAIN_ID}).`);
  }
  const endpoint = chain.endpoint;

  const [transactionResponse, receiptResponse] = await Promise.all([
    rpc("eth_getTransactionByHash", [requested.txHash], endpoint),
    rpc("eth_getTransactionReceipt", [requested.txHash], endpoint),
  ]);
  const transaction = transactionResponse.result;
  const receipt = receiptResponse.result;
  if (!transaction || !receipt) fail("The configured mainnet RPC cannot find this deployment transaction and receipt.");
  if (String(transaction.hash ?? "").toLowerCase() !== requested.txHash ||
      String(receipt.transactionHash ?? "").toLowerCase() !== requested.txHash) {
    fail("The transaction hash returned by mainnet RPC does not match the submitted deployment.");
  }
  if (!isAddress(String(transaction.from ?? "")) ||
      getAddress(transaction.from) !== requested.creatorWallet ||
      !isAddress(String(receipt.from ?? "")) ||
      getAddress(receipt.from) !== requested.creatorWallet) {
    fail("The confirmed transaction sender does not match the creator wallet.");
  }
  if (transaction.to !== null && transaction.to !== undefined && transaction.to !== "0x") {
    fail("The transaction is not a contract-creation transaction.");
  }
  if (parseQuantity(receipt.status) !== 1n) fail("The token deployment transaction did not succeed on-chain.");
  if (!isAddress(String(receipt.contractAddress ?? "")) ||
      getAddress(receipt.contractAddress) !== requested.contractAddress) {
    fail("The confirmed receipt contract address does not match the submitted token address.");
  }

  const factory = new ContractFactory(tokenArtifact.abi, tokenArtifact.bytecode);
  const expectedDeployment = await factory.getDeployTransaction(
    requested.name,
    requested.symbol,
    requested.decimals,
    requested.expectedSupply,
  );
  const expectedInput = String(expectedDeployment.data ?? "").toLowerCase();
  const transactionInput = String(transaction.input ?? transaction.data ?? "").toLowerCase();
  if (!expectedInput || transactionInput !== expectedInput) {
    fail("The confirmed transaction input does not match the GYDSchain token contract and settings.");
  }

  const blockNumber = parseQuantity(receipt.blockNumber);
  if (blockNumber === null) fail("The confirmed receipt did not include a valid block number.");

  const codeResponse = await rpc("eth_getCode", [requested.contractAddress, "latest"], endpoint);
  if (typeof codeResponse.result !== "string" || !/^0x[0-9a-f]+$/i.test(codeResponse.result) || codeResponse.result === "0x") {
    fail("No deployed contract code is available at the confirmed token address.");
  }

  const readContract = async (method: string, args: unknown[] = []) => {
    const data = tokenReadInterface.encodeFunctionData(method, args);
    const response = await rpc("eth_call", [{ to: requested.contractAddress, data }, "latest"], endpoint);
    if (typeof response.result !== "string" || !response.result.startsWith("0x")) {
      fail(`Mainnet RPC could not verify the token's ${method} value.`);
    }
    try {
      return tokenReadInterface.decodeFunctionResult(method, response.result)[0];
    } catch {
      return fail(`Mainnet RPC returned an invalid ${method} value.`);
    }
  };

  const [name, symbol, decimals, totalSupply, creatorBalance] = await Promise.all([
    readContract("name"),
    readContract("symbol"),
    readContract("decimals"),
    readContract("totalSupply"),
    readContract("balanceOf", [requested.creatorWallet]),
  ]);

  if (
    name !== requested.name ||
    symbol !== requested.symbol ||
    Number(decimals) !== requested.decimals ||
    BigInt(totalSupply) !== requested.expectedSupply ||
    BigInt(creatorBalance) !== requested.expectedSupply
  ) {
    fail("The deployed token's on-chain name, symbol, decimals, supply, or creator balance does not match.");
  }

  return {
    name: String(name),
    symbol: String(symbol),
    decimals: Number(decimals),
    initialSupply: formatUnits(BigInt(totalSupply), Number(decimals)),
    initialSupplyBaseUnits: BigInt(totalSupply).toString(),
    verifiedInitialBalanceBaseUnits: BigInt(creatorBalance).toString(),
    creatorWallet: requested.creatorWallet,
    contractAddress: requested.contractAddress,
    deploymentTxHash: requested.txHash,
    deploymentBlockNumber: blockNumber.toString(),
    chainId: GYDS_MAINNET_CHAIN_ID,
  };
}
