import { ethers } from "ethers";
import fs from "node:fs";
import path from "node:path";
import { pool } from "./db";
import {
  broadcastRawTransaction,
  estimateTransactionGas,
  getChainContextRpc,
  getContractCode,
  getGasPrice,
  getTransactionCount,
  getTransactionReceipt,
} from "./chainRpc";

const GYDS_MAINNET_CHAIN_ID = 198282;

export class StablecoinDeploymentError extends Error {
  constructor(message: string, public readonly statusCode = 500) {
    super(message);
    this.name = "StablecoinDeploymentError";
  }
}

export interface UserStablecoinRow {
  id: string;
  name: string;
  symbol: string;
  decimals: number;
  total_supply: string | number;
  status: string;
  address: string | null;
  owner_address: string | null;
  deployment_tx_hash: string | null;
  deployment_raw_tx: string | null;
  deployment_error: string | null;
  deployment_chain_id: number | null;
  approved_by: string | null;
}

let schemaReady: Promise<void> | undefined;

export function ensureStablecoinDeploymentSchema(): Promise<void> {
  if (!schemaReady) {
    schemaReady = pool.query(`
      ALTER TABLE user_stablecoins ADD COLUMN IF NOT EXISTS legacy_address TEXT;
      ALTER TABLE user_stablecoins ADD COLUMN IF NOT EXISTS owner_address TEXT;
      ALTER TABLE user_stablecoins ADD COLUMN IF NOT EXISTS deployment_chain_id INTEGER;
      ALTER TABLE user_stablecoins ADD COLUMN IF NOT EXISTS deployment_tx_hash TEXT;
      ALTER TABLE user_stablecoins ADD COLUMN IF NOT EXISTS deployment_raw_tx TEXT;
      ALTER TABLE user_stablecoins ADD COLUMN IF NOT EXISTS deployment_error TEXT;
      UPDATE user_stablecoins
      SET status='pending_review', is_approved=false, approved_by=NULL, approved_at=NULL,
          legacy_address=COALESCE(legacy_address,address),
          address=NULL,
          deployment_error='This approval predates on-chain deployment and must be reviewed again.',
          updated_at=NOW()
      WHERE status='active' AND deployment_tx_hash IS NULL;
    `).then(() => undefined).catch((error) => {
      schemaReady = undefined;
      throw error;
    });
  }
  return schemaReady;
}

function getArtifact(): { abi: any[]; bytecode: string } {
  const artifactPath = path.resolve(
    process.cwd(),
    "contracts/stablecoin-artifacts/UserStablecoin.sol/UserStablecoin.json",
  );
  try {
    const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
    if (!Array.isArray(artifact.abi) || typeof artifact.bytecode !== "string" || !artifact.bytecode.startsWith("0x")) {
      throw new Error("Invalid compiled artifact");
    }
    return artifact;
  } catch {
    throw new StablecoinDeploymentError(
      "The stablecoin deployment contract artifact is missing or invalid. Rebuild the UserStablecoin contract artifact.",
      503,
    );
  }
}

function getDeploymentWallet(): ethers.Wallet {
  const privateKey = process.env.STABLECOIN_DEPLOYER_PRIVATE_KEY;
  if (!privateKey) {
    throw new StablecoinDeploymentError("The stablecoin deployment signer is not configured.", 503);
  }
  try {
    return new ethers.Wallet(privateKey);
  } catch {
    throw new StablecoinDeploymentError("The stablecoin deployment signer is malformed.", 503);
  }
}

async function getVerifiedMainnetRpc(): Promise<{ chainId: number; endpoint: string }> {
  if (process.env.GYDS_NETWORK && process.env.GYDS_NETWORK.toLowerCase() !== "mainnet") {
    throw new StablecoinDeploymentError("Stablecoin contract deployment is restricted to GYDS mainnet.", 409);
  }
  let context: { chainId: number; endpoint: string };
  try {
    context = await getChainContextRpc();
  } catch {
    throw new StablecoinDeploymentError("Could not reach a GYDS Chain RPC to verify the deployment network.", 503);
  }
  if (context.chainId !== GYDS_MAINNET_CHAIN_ID) {
    throw new StablecoinDeploymentError(
      `The connected RPC is not GYDS mainnet (expected chain ID ${GYDS_MAINNET_CHAIN_ID}; got ${context.chainId}).`,
      409,
    );
  }
  return context;
}

function transactionSucceeded(receipt: any): boolean {
  try {
    return BigInt(receipt?.status ?? 0) === 1n;
  } catch {
    return false;
  }
}

export async function reconcileStablecoinDeployment(
  id: string,
  txHash: string,
): Promise<UserStablecoinRow | null> {
  await ensureStablecoinDeploymentSchema();

  let context: { chainId: number; endpoint: string };
  try {
    context = await getChainContextRpc();
  } catch {
    return null;
  }
  if (context.chainId !== GYDS_MAINNET_CHAIN_ID) return null;

  const receipt = await getTransactionReceipt(txHash, context.endpoint);
  if (!receipt || receipt.status === undefined || receipt.status === null) return null;

  if (transactionSucceeded(receipt)) {
    const contractAddress = typeof receipt.contractAddress === "string" ? receipt.contractAddress : "";
    if (!ethers.isAddress(contractAddress)) return null;

    const code = await getContractCode(contractAddress, context.endpoint);
    if (code === null) return null;
    if (code === "0x") {
      await pool.query(
        `UPDATE user_stablecoins
         SET status='pending_review', is_approved=false, approved_by=NULL, approved_at=NULL,
             deployment_raw_tx=NULL, deployment_error='Deployment receipt had no contract bytecode',
             updated_at=NOW()
         WHERE id=$1 AND status='deployment_pending' AND deployment_tx_hash=$2`,
        [id, txHash],
      );
      return null;
    }

    const { rows: [updated] } = await pool.query(
      `UPDATE user_stablecoins
       SET status='active', is_approved=true, approved_at=NOW(), address=$1,
           deployment_raw_tx=NULL, deployment_error=NULL, updated_at=NOW()
       WHERE id=$2 AND status='deployment_pending' AND deployment_tx_hash=$3
       RETURNING *`,
      [ethers.getAddress(contractAddress), id, txHash],
    );
    return updated ?? null;
  }

  await pool.query(
    `UPDATE user_stablecoins
     SET status='pending_review', is_approved=false, approved_by=NULL, approved_at=NULL,
         deployment_raw_tx=NULL, deployment_error='On-chain deployment transaction reverted; review and retry deployment',
         updated_at=NOW()
     WHERE id=$1 AND status='deployment_pending' AND deployment_tx_hash=$2`,
    [id, txHash],
  );
  return null;
}

export async function deployOrResumeStablecoin(
  id: string,
  approvedBy: string,
  linkedOwnerAddress: string | null,
): Promise<{ stablecoin: UserStablecoinRow; pending: boolean }> {
  await ensureStablecoinDeploymentSchema();

  const signer = getDeploymentWallet();
  const lockClient = await pool.connect();
  const advisoryKey = `stablecoin-deployment:${signer.address.toLowerCase()}`;
  let lockHeld = false;
  let transactionOpen = false;

  try {
    await lockClient.query("SELECT pg_advisory_lock(hashtext($1)::bigint)", [advisoryKey]);
    lockHeld = true;

    await lockClient.query("BEGIN");
    transactionOpen = true;
    const { rows: [coin] } = await lockClient.query(
      `SELECT * FROM user_stablecoins WHERE id=$1 FOR UPDATE`,
      [id],
    );
    if (!coin) throw new StablecoinDeploymentError("Stablecoin not found.", 404);

    if (coin.status === "active" && coin.address && coin.deployment_tx_hash) {
      await lockClient.query("COMMIT");
      transactionOpen = false;
      return { stablecoin: coin, pending: false };
    }

    if (coin.status === "deployment_pending" && coin.deployment_tx_hash) {
      const txHash = String(coin.deployment_tx_hash);
      const rawTransaction = typeof coin.deployment_raw_tx === "string" ? coin.deployment_raw_tx : null;
      await lockClient.query("COMMIT");
      transactionOpen = false;

      const { endpoint } = await getVerifiedMainnetRpc();
      if (rawTransaction) {
        try {
          await broadcastRawTransaction(rawTransaction, endpoint);
        } catch {
          await pool.query(
            `UPDATE user_stablecoins SET deployment_error='RPC did not acknowledge the saved deployment transaction; retry is safe', updated_at=NOW()
             WHERE id=$1 AND status='deployment_pending' AND deployment_tx_hash=$2`,
            [id, txHash],
          );
        }
      }
      await reconcileStablecoinDeployment(id, txHash);
      const { rows: [updated] } = await pool.query(`SELECT * FROM user_stablecoins WHERE id=$1`, [id]);
      if (!updated) throw new StablecoinDeploymentError("Stablecoin not found.", 404);
      return { stablecoin: updated, pending: updated.status === "deployment_pending" };
    }

    if (coin.status !== "pending_review") {
      throw new StablecoinDeploymentError(
        `Stablecoin cannot be deployed while its status is "${coin.status}".`,
        409,
      );
    }

    const ownerAddress = coin.owner_address || linkedOwnerAddress;
    if (!ownerAddress || !ethers.isAddress(ownerAddress)) {
      throw new StablecoinDeploymentError(
        "The creator must link a valid wallet before this stablecoin can be deployed.",
        400,
      );
    }
    const normalizedOwner = ethers.getAddress(ownerAddress);
    const decimals = Number(coin.decimals ?? 18);
    if (!Number.isInteger(decimals) || decimals < 0 || decimals > 18) {
      throw new StablecoinDeploymentError("Stablecoin decimals must be between 0 and 18.", 400);
    }

    const { chainId, endpoint } = await getVerifiedMainnetRpc();
    const artifact = getArtifact();
    const deployData = await new ethers.ContractFactory(artifact.abi, artifact.bytecode)
      .getDeployTransaction(
        String(coin.name),
        String(coin.symbol),
        decimals,
        normalizedOwner,
        ethers.parseUnits(String(coin.total_supply ?? "0"), decimals),
      );
    if (typeof deployData.data !== "string") {
      throw new StablecoinDeploymentError("Could not encode the stablecoin deployment transaction.");
    }

    let nonce: number;
    let gasPrice: bigint;
    let estimatedGas: bigint;
    try {
      [nonce, gasPrice, estimatedGas] = await Promise.all([
        getTransactionCount(signer.address, endpoint),
        getGasPrice(endpoint),
        estimateTransactionGas(signer.address, deployData.data, endpoint),
      ]);
    } catch {
      throw new StablecoinDeploymentError(
        "The GYDS mainnet RPC could not prepare the contract deployment transaction.",
        503,
      );
    }
    const gasLimit = estimatedGas * 130n / 100n;

    let rawTransaction: string;
    try {
      rawTransaction = await signer.signTransaction({
        to: null,
        value: 0n,
        data: deployData.data,
        nonce,
        gasPrice,
        gasLimit,
        chainId,
        type: 0,
      });
    } catch {
      throw new StablecoinDeploymentError("Could not sign the stablecoin deployment transaction.");
    }
    const txHash = ethers.keccak256(rawTransaction);

    const { rows: [pendingCoin] } = await lockClient.query(
      `UPDATE user_stablecoins
       SET status='deployment_pending', is_approved=false, approved_by=$1, approved_at=NULL,
           owner_address=$2, deployment_chain_id=$3, deployment_tx_hash=$4,
           deployment_raw_tx=$5, deployment_error=NULL, updated_at=NOW()
       WHERE id=$6 AND status='pending_review'
       RETURNING *`,
      [approvedBy, normalizedOwner, chainId, txHash, rawTransaction, id],
    );
    if (!pendingCoin) throw new StablecoinDeploymentError("Stablecoin review state changed; refresh and try again.", 409);

    await lockClient.query("COMMIT");
    transactionOpen = false;

    try {
      const broadcast = await broadcastRawTransaction(rawTransaction, endpoint);
      if (broadcast.txHash.toLowerCase() !== txHash.toLowerCase()) {
        await pool.query(
          `UPDATE user_stablecoins SET deployment_error='RPC returned a different hash for the signed deployment transaction', updated_at=NOW()
           WHERE id=$1 AND status='deployment_pending' AND deployment_tx_hash=$2`,
          [id, txHash],
        );
      }
    } catch {
      await pool.query(
        `UPDATE user_stablecoins SET deployment_error='RPC did not acknowledge the deployment transaction; retry is safe', updated_at=NOW()
         WHERE id=$1 AND status='deployment_pending' AND deployment_tx_hash=$2`,
        [id, txHash],
      );
    }

    await reconcileStablecoinDeployment(id, txHash);
    const { rows: [updated] } = await pool.query(`SELECT * FROM user_stablecoins WHERE id=$1`, [id]);
    if (!updated) throw new StablecoinDeploymentError("Stablecoin not found after deployment submission.", 404);
    return { stablecoin: updated, pending: updated.status === "deployment_pending" };
  } catch (error) {
    if (transactionOpen) await lockClient.query("ROLLBACK").catch(() => {});
    if (error instanceof StablecoinDeploymentError) throw error;
    throw new StablecoinDeploymentError("Stablecoin deployment failed. Check the deployment configuration and RPC.");
  } finally {
    if (lockHeld) {
      await lockClient.query("SELECT pg_advisory_unlock(hashtext($1)::bigint)", [advisoryKey]).catch(() => {});
    }
    lockClient.release();
  }
}