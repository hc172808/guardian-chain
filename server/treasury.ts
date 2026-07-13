import { ethers } from "ethers";
import { getChainBalance, getTransactionCount, getGasPrice, getChainIdRpc, broadcastTransfer, getTransactionReceipt } from "./chainRpc";

// Real on-chain treasury signing. When TREASURY_PRIVATE_KEY is configured
// (Admin → Server Config → Treasury), mint operations become actual signed
// transfers from this funded account instead of database-only bookkeeping.
// When it's absent, callers should fall back to the existing simulated flow.
//
// Deliberately does NOT use ethers.JsonRpcProvider for network calls — its
// automatic network-detection handshake hung indefinitely against this
// chain's RPC in testing. Instead we reuse chainRpc.ts's plain-fetch calls
// (which have real per-call timeouts) for reads/broadcast, and only use
// ethers.Wallet for offline transaction signing (no network access needed).

export function generateTreasuryWallet(): { address: string; privateKey: string; mnemonic: string | null } {
  const wallet = ethers.Wallet.createRandom();
  return {
    address: wallet.address,
    privateKey: wallet.privateKey,
    mnemonic: wallet.mnemonic?.phrase ?? null,
  };
}

export function hasTreasuryKey(): boolean {
  return !!process.env.TREASURY_PRIVATE_KEY;
}

export function getTreasuryAddress(): string | null {
  const key = process.env.TREASURY_PRIVATE_KEY;
  if (!key) return null;
  try {
    return new ethers.Wallet(key).address;
  } catch {
    return null;
  }
}

export async function getTreasuryBalance(): Promise<{ address: string; balance: string } | null> {
  const address = getTreasuryAddress();
  if (!address) return null;
  const balance = await getChainBalance(address);
  if (balance === null) throw new Error("RPC unreachable or timed out reading balance");
  return { address, balance };
}

export interface TreasuryTransferResult {
  txHash: string;
  onChain: true;
  blockNumber?: number | null;
}

// Signs (offline) and broadcasts a real transfer from the treasury account.
// Throws on failure (insufficient funds, RPC unreachable, bad address, etc.)
// — callers decide whether to fall back to a simulated record or surface
// the error.
export async function sendTreasuryTransfer(toAddress: string, amountEther: number): Promise<TreasuryTransferResult> {
  const key = process.env.TREASURY_PRIVATE_KEY;
  if (!key) throw new Error("TREASURY_PRIVATE_KEY is not configured");
  if (!ethers.isAddress(toAddress)) throw new Error(`Invalid recipient address: ${toAddress}`);
  if (!(amountEther > 0)) throw new Error("Amount must be greater than 0");

  const wallet = new ethers.Wallet(key);
  const [nonce, gasPrice, chainId] = await Promise.all([
    getTransactionCount(wallet.address),
    getGasPrice(),
    getChainIdRpc(),
  ]);

  const signedRawTx = await wallet.signTransaction({
    to: toAddress,
    value: ethers.parseEther(String(amountEther)),
    nonce,
    gasLimit: 21000n,
    gasPrice,
    chainId,
    type: 0,
  });

  const result = await broadcastTransfer({
    fromAddress: wallet.address,
    toAddress,
    amountEther,
    signedRawTx,
  });

  if (!result.onChain) throw new Error(result.error ?? "Broadcast failed");
  return { txHash: result.txHash, onChain: true, blockNumber: result.blockNumber };
}
