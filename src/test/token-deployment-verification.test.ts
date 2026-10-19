import { ContractFactory, Interface, parseUnits, verifyMessage, Wallet } from "ethers";
import { describe, expect, it } from "vitest";
import tokenArtifact from "../lib/contracts/gydsTokenArtifact.json";
import { makeTokenRegistrationProofMessage } from "../../shared/tokenDeploymentProof";
import {
  getTokenDeploymentReadiness,
  verifyGrc20Deployment,
} from "../../server/tokenDeploymentVerification";

const creator = "0x1111111111111111111111111111111111111111";
const contractAddress = "0x2222222222222222222222222222222222222222";
const txHash = `0x${"ab".repeat(32)}`;
const chainId = 198282;
const supply = parseUnits("1.23", 2);
const reads = new Interface([
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function totalSupply() view returns (uint256)",
  "function balanceOf(address) view returns (uint256)",
]);

async function deploymentInput() {
  const factory = new ContractFactory(tokenArtifact.abi, tokenArtifact.bytecode);
  const tx = await factory.getDeployTransaction("Verified Token", "VFY", 2, supply);
  return {
    name: "Verified Token",
    symbol: "VFY",
    decimals: 2,
    initialSupply: "1.23",
    initialSupplyBaseUnits: supply.toString(),
    creatorWallet: creator,
    address: contractAddress,
    deploymentTxHash: txHash,
    chainId,
    data: String(tx.data),
  };
}

function createRpc(transactionInput: string, options: { chain?: string; supply?: bigint } = {}) {
  const rpc = async (method: string, params: any[] = []) => {
    switch (method) {
      case "eth_chainId":
        return { result: options.chain ?? "0x3068a", endpoint: "configured-mainnet-rpc" };
      case "eth_blockNumber":
        return { result: "0x100", endpoint: "configured-mainnet-rpc" };
      case "eth_getTransactionByHash":
        return {
          result: { hash: txHash, from: creator, to: null, input: transactionInput },
          endpoint: "configured-mainnet-rpc",
        };
      case "eth_getTransactionReceipt":
        return {
          result: {
            transactionHash: txHash,
            status: "0x1",
            from: creator,
            contractAddress,
            blockNumber: "0x99",
          },
          endpoint: "configured-mainnet-rpc",
        };
      case "eth_getCode":
        return { result: "0x60006000", endpoint: "configured-mainnet-rpc" };
      case "eth_call": {
        const data = String(params[0]?.data ?? "");
        const fragment = reads.getFunction(data.slice(0, 10));
        if (!fragment) throw new Error("Unexpected contract read");
        const resultByFunction: Record<string, unknown[]> = {
          name: ["Verified Token"],
          symbol: ["VFY"],
          decimals: [2],
          totalSupply: [options.supply ?? supply],
          balanceOf: [options.supply ?? supply],
        };
        return {
          result: reads.encodeFunctionResult(fragment, resultByFunction[fragment.name]),
          endpoint: "configured-mainnet-rpc",
        };
      }
      default:
        throw new Error(`Unexpected RPC method ${method}`);
    }
  };
  return rpc;
}

describe("server-side GRC-20 deployment verification", () => {
  it("uses a fixed-supply artifact with no privileged authority functions", async () => {
    const factory = new ContractFactory(tokenArtifact.abi, tokenArtifact.bytecode);
    const forbidden = new Set([
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
    expect(factory.interface.fragments.find(fragment => fragment.type === "constructor")?.inputs.length).toBe(4);
    expect(tokenArtifact.abi.filter(item => item.type === "function").some(item => forbidden.has(item.name))).toBe(false);
  });

  it("requires a configured mainnet RPC before enabling deployment", async () => {
    const readiness = await getTokenDeploymentReadiness(async () => {
      throw new Error("No explicit mainnet RPC");
    });

    expect(readiness).toEqual({
      ready: false,
      chainId: null,
      reason: "A reachable, explicitly configured GYDS mainnet RPC is required for independent deployment verification. Local test nodes simulate receipts and do not execute token contracts.",
    });
  });

  it("accepts a confirmed artifact deployment with exact creator allocation", async () => {
    const submitted = await deploymentInput();
    const verified = await verifyGrc20Deployment(submitted, createRpc(submitted.data));

    expect(verified).toMatchObject({
      name: "Verified Token",
      symbol: "VFY",
      decimals: 2,
      initialSupply: "1.23",
      initialSupplyBaseUnits: "123",
      verifiedInitialBalanceBaseUnits: "123",
      creatorWallet: creator,
      contractAddress,
      deploymentTxHash: txHash,
      deploymentBlockNumber: "153",
      chainId,
    });
  });

  it("rejects a different creation payload even when RPC reports a successful receipt", async () => {
    const submitted = await deploymentInput();

    await expect(
      verifyGrc20Deployment(submitted, createRpc("0x6000")),
    ).rejects.toThrow("transaction input does not match");
  });

  it("rejects a supply or creator balance that differs from the exact declared amount", async () => {
    const submitted = await deploymentInput();

    await expect(
      verifyGrc20Deployment(submitted, createRpc(submitted.data, { supply: 122n })),
    ).rejects.toThrow("on-chain name, symbol, decimals, supply, or creator balance");
  });

  it("rejects a server RPC on any chain other than GYDS mainnet", async () => {
    const submitted = await deploymentInput();

    await expect(
      verifyGrc20Deployment(submitted, createRpc(submitted.data, { chain: "0x1" })),
    ).rejects.toThrow("not on GYDS mainnet");
  });

  it("binds the saved deployment proof to the signed-in account and creator wallet", async () => {
    const wallet = new Wallet(`0x${"11".repeat(32)}`);
    const deployment = {
      chainId,
      contractAddress,
      deploymentTxHash: txHash,
      creatorWallet: wallet.address,
      initialSupplyBaseUnits: supply.toString(),
    };
    const message = makeTokenRegistrationProofMessage("account-123", deployment);
    const signature = await wallet.signMessage(message);

    expect(verifyMessage(message, signature)).toBe(wallet.address);
    expect(verifyMessage(makeTokenRegistrationProofMessage("different-account", deployment), signature))
      .not.toBe(wallet.address);
  });
});
