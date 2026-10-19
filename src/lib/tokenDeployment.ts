import {
  BrowserProvider,
  Contract,
  ContractFactory,
  formatEther,
  formatUnits,
  getAddress,
  isAddress,
  parseUnits,
  type TransactionReceipt,
} from "ethers";
import tokenArtifact from "./contracts/gydsTokenArtifact.json";
import { getEthereumProvider, NETWORK_CONFIG, switchToNetwork } from "@/config/network";

export const GYDS_CHAIN_ID = 198282;
export const GYDS_CHAIN_NAME = NETWORK_CONFIG.chainName;
export const GYDS_BLOCK_EXPLORER = NETWORK_CONFIG.blockExplorerUrls[0];

export interface Grc20TokenInput {
  name: string;
  symbol: string;
  decimals: number;
  initialSupply: string;
  mintEnabled: boolean;
}

export interface DeploymentEstimate {
  gasLimit: string;
  maxFeePerGas: string;
  estimatedFeeWei: string;
  estimatedFeeGyds: string;
}

export interface PreparedGrc20Deployment {
  provider: BrowserProvider;
  signer: ReturnType<BrowserProvider["getSigner"]> extends Promise<infer S> ? S : never;
  creatorWallet: string;
  input: Grc20TokenInput;
  initialSupplyBaseUnits: string;
  factory: ContractFactory;
  estimate: DeploymentEstimate | null;
  estimateWarning: string | null;
}

export interface Grc20DeploymentResult {
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
  mintEnabled: boolean;
}

export type DeploymentStep =
  | "awaiting_wallet_approval"
  | "deployment_pending"
  | "deployment_confirmed"
  | "verification_failed"
  | "deployment_failed";

function normalizeInput(input: Grc20TokenInput): Grc20TokenInput {
  const name = input.name.trim();
  const symbol = input.symbol.trim().toUpperCase();
  if (!name || name.length > 64) throw new Error("Token name must be 1–64 characters.");
  if (!/^[A-Z0-9][A-Z0-9._-]{0,9}$/.test(symbol)) {
    throw new Error("Symbol must be 1–10 letters, numbers, dots, underscores, or hyphens.");
  }
  if (!Number.isInteger(input.decimals) || input.decimals < 0 || input.decimals > 18) {
    throw new Error("Decimals must be a whole number from 0 to 18.");
  }

  const initialSupply = input.initialSupply.trim();
  if (!/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(initialSupply)) {
    throw new Error("Initial supply must be a positive decimal number.");
  }
  const baseUnits = parseUnits(initialSupply, input.decimals);
  if (baseUnits <= 0n) throw new Error("Initial supply must be greater than zero.");

  return { ...input, name, symbol, initialSupply };
}

async function requireMainnet(eth: NonNullable<ReturnType<typeof getEthereumProvider>>) {
  let chainId = Number(BigInt(await eth.request({ method: "eth_chainId" })));
  if (chainId !== GYDS_CHAIN_ID) {
    await switchToNetwork("mainnet");
    chainId = Number(BigInt(await eth.request({ method: "eth_chainId" })));
  }
  if (chainId !== GYDS_CHAIN_ID) {
    throw new Error(`Connect your wallet to ${GYDS_CHAIN_NAME} (chain ID ${GYDS_CHAIN_ID}) before continuing.`);
  }
}

export async function prepareGrc20Deployment(input: Grc20TokenInput): Promise<PreparedGrc20Deployment> {
  const normalized = normalizeInput(input);
  const eth = getEthereumProvider();
  if (!eth) throw new Error("No EVM wallet was found. Open this page in an EVM wallet browser or install a wallet extension.");

  const accounts = await eth.request({ method: "eth_requestAccounts" });
  if (!Array.isArray(accounts) || !accounts[0] || !isAddress(accounts[0])) {
    throw new Error("Your wallet did not provide a valid account.");
  }
  await requireMainnet(eth);

  const provider = new BrowserProvider(eth as any);
  const signer = await provider.getSigner(getAddress(accounts[0]));
  const creatorWallet = getAddress(await signer.getAddress());
  const initialSupplyBaseUnits = parseUnits(normalized.initialSupply, normalized.decimals).toString();
  const factory = new ContractFactory(tokenArtifact.abi, tokenArtifact.bytecode, signer);
  const args = [
    normalized.name,
    normalized.symbol,
    normalized.decimals,
    creatorWallet,
    BigInt(initialSupplyBaseUnits),
    normalized.mintEnabled,
  ];

  let estimate: DeploymentEstimate | null = null;
  let estimateWarning: string | null = null;
  try {
    const deployTransaction = await factory.getDeployTransaction(...args);
    const [gasLimit, feeData] = await Promise.all([
      provider.estimateGas({ ...deployTransaction, from: creatorWallet }),
      provider.getFeeData(),
    ]);
    const maxFeePerGas = feeData.maxFeePerGas ?? feeData.gasPrice;
    if (maxFeePerGas && maxFeePerGas > 0n) {
      estimate = {
        gasLimit: gasLimit.toString(),
        maxFeePerGas: maxFeePerGas.toString(),
        estimatedFeeWei: (gasLimit * maxFeePerGas).toString(),
        estimatedFeeGyds: formatEther(gasLimit * maxFeePerGas),
      };
    } else {
      estimateWarning = "This wallet's RPC did not return a gas price. Review the final fee in your wallet before approving.";
    }
  } catch (error) {
    estimateWarning = error instanceof Error
      ? `Fee estimate unavailable (${error.message}). Your wallet will show the final fee before approval.`
      : "Fee estimate unavailable. Your wallet will show the final fee before approval.";
  }

  return {
    provider,
    signer,
    creatorWallet,
    input: normalized,
    initialSupplyBaseUnits,
    factory,
    estimate,
    estimateWarning,
  };
}

export async function submitGrc20Deployment(
  prepared: PreparedGrc20Deployment,
  onStep: (step: DeploymentStep, transactionHash?: string) => void,
): Promise<Grc20DeploymentResult> {
  const eth = getEthereumProvider();
  if (!eth) throw new Error("Wallet connection was lost before deployment.");
  await requireMainnet(eth);
  const currentAccounts = await eth.request({ method: "eth_accounts" });
  if (!Array.isArray(currentAccounts) || getAddress(currentAccounts[0] ?? "") !== prepared.creatorWallet) {
    throw new Error("The active wallet account changed after the estimate. Reconnect the intended creator wallet.");
  }

  let contract: Contract;
  let transactionHash: string | undefined;
  try {
    onStep("awaiting_wallet_approval");
    contract = await prepared.factory.deploy(
      prepared.input.name,
      prepared.input.symbol,
      prepared.input.decimals,
      prepared.creatorWallet,
      BigInt(prepared.initialSupplyBaseUnits),
      prepared.input.mintEnabled,
    );
    const transaction = contract.deploymentTransaction();
    if (!transaction?.hash) throw new Error("The wallet did not return a deployment transaction hash.");
    transactionHash = transaction.hash;
    onStep("deployment_pending", transactionHash);

    const receipt = await transaction.wait();
    if (!receipt || receipt.status !== 1) {
      onStep("deployment_failed", transactionHash);
      throw new Error(`Deployment transaction ${transactionHash} failed on-chain.`);
    }
    onStep("deployment_confirmed", transactionHash);

    const contractAddress = getAddress(await contract.getAddress());
    const receiptAddress = receipt.contractAddress ? getAddress(receipt.contractAddress) : contractAddress;
    if (receiptAddress !== contractAddress) {
      onStep("verification_failed", transactionHash);
      throw new Error("The confirmed receipt contract address does not match the deployed token.");
    }

    const deployedCode = await prepared.provider.getCode(contractAddress);
    if (!deployedCode || deployedCode === "0x") {
      onStep("verification_failed", transactionHash);
      throw new Error("The deployment is confirmed, but no contract code is present at its address.");
    }

    const deployedToken = new Contract(contractAddress, tokenArtifact.abi, prepared.provider);
    const [name, symbol, decimals, supply, creatorBalance, owner, mintingEnabled] = await Promise.all([
      deployedToken.name(),
      deployedToken.symbol(),
      deployedToken.decimals(),
      deployedToken.totalSupply(),
      deployedToken.balanceOf(prepared.creatorWallet),
      deployedToken.owner(),
      deployedToken.mintingEnabled(),
    ]);
    const expectedSupply = BigInt(prepared.initialSupplyBaseUnits);
    if (
      name !== prepared.input.name ||
      symbol !== prepared.input.symbol ||
      Number(decimals) !== prepared.input.decimals ||
      BigInt(supply) !== expectedSupply ||
      BigInt(creatorBalance) !== expectedSupply ||
      getAddress(owner) !== prepared.creatorWallet ||
      Boolean(mintingEnabled) !== prepared.input.mintEnabled
    ) {
      onStep("verification_failed", transactionHash);
      throw new Error("The deployed contract's name, supply, creator balance, owner, or mint setting did not match the confirmed request.");
    }

    return {
      name,
      symbol,
      decimals: Number(decimals),
      initialSupply: formatUnits(supply, Number(decimals)),
      initialSupplyBaseUnits: BigInt(supply).toString(),
      verifiedInitialBalanceBaseUnits: BigInt(creatorBalance).toString(),
      creatorWallet: prepared.creatorWallet,
      contractAddress,
      deploymentTxHash: transactionHash,
      deploymentBlockNumber: BigInt(receipt.blockNumber).toString(),
      chainId: GYDS_CHAIN_ID,
      mintEnabled: Boolean(mintingEnabled),
    };
  } catch (error) {
    if (transactionHash) {
      onStep("verification_failed", transactionHash);
    } else {
      onStep("deployment_failed");
    }
    throw error;
  }
}

export async function transferGrc20Ownership(
  contractAddressInput: string,
  newOwnerInput: string,
): Promise<{ txHash: string; previousOwner: string; newOwner: string }> {
  if (!isAddress(contractAddressInput) || !isAddress(newOwnerInput)) {
    throw new Error("Enter valid token and recipient wallet addresses.");
  }
  const contractAddress = getAddress(contractAddressInput);
  const newOwner = getAddress(newOwnerInput);
  const eth = getEthereumProvider();
  if (!eth) throw new Error("No EVM wallet was found.");

  const accounts = await eth.request({ method: "eth_requestAccounts" });
  if (!Array.isArray(accounts) || !accounts[0]) throw new Error("Connect the current token owner's wallet.");
  await requireMainnet(eth);

  const provider = new BrowserProvider(eth as any);
  const signer = await provider.getSigner(getAddress(accounts[0]));
  const previousOwner = getAddress(await signer.getAddress());
  const token = new Contract(contractAddress, tokenArtifact.abi, signer);
  const ownerBefore = getAddress(await token.owner());
  if (ownerBefore !== previousOwner) {
    throw new Error("Only the current on-chain owner can transfer this token's authority.");
  }
  if (newOwner === previousOwner) throw new Error("Choose a different owner address.");

  const tx = await token.transferOwnership(newOwner);
  const receipt: TransactionReceipt | null = await tx.wait();
  if (!receipt || receipt.status !== 1) {
    throw new Error(`Ownership transfer transaction ${tx.hash} failed on-chain.`);
  }
  const ownerAfter = getAddress(await token.owner());
  if (ownerAfter !== newOwner) throw new Error("The transaction confirmed, but the on-chain owner did not update.");
  return { txHash: tx.hash, previousOwner, newOwner: ownerAfter };
}
