import crypto from "crypto";

// Computed lazily (not a module-level const) — process.env is populated by
// server/index.ts's .env loader, which runs AFTER this module's imports are
// resolved (ES module import hoisting), so a top-level const here would have
// baked in stale/missing env values and silently ignored any admin-configured
// RPC override.
// All local node ports in priority order (rpc → fullnode → lite → boost → validator → genesis → bootnode)
// mainnet ports: 8545,8565,8555,8575,8585,8590,8595
// testnet ports: 8600,8602,8601,8603,8604,8605,8606
// devnet  ports: 8650,8652,8651,8653,8654,8655,8656
const LOCAL_FALLBACK_PORTS = [8545, 8565, 8555, 8575, 8585, 8590, 8595];

function getRpcEndpoints(): string[] {
  const primary = process.env.GYDS_RPC_URL || "http://localhost:8545";
  // If admin has configured explicit backup URLs, use those; otherwise fall through local ports
  const configuredBackups = process.env.GYDS_RPC_BACKUP_URLS
    ? process.env.GYDS_RPC_BACKUP_URLS.split(",").map((s) => s.trim()).filter(Boolean)
    : LOCAL_FALLBACK_PORTS.map(p => `http://localhost:${p}`);
  const explicit = process.env.GYDS_LOCAL_RPC_URL ? [process.env.GYDS_LOCAL_RPC_URL.trim()] : [];
  // Deduplicate while preserving order
  const seen = new Set<string>();
  return [primary, ...configuredBackups, ...explicit].filter(u => {
    if (!u || seen.has(u)) return false;
    seen.add(u);
    return true;
  });
}

const TIMEOUT_MS = 8000;

async function rpcCall(url: string, method: string, params: any[] = []): Promise<any> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", method, params, id: 1 }),
      signal: controller.signal,
    });
    const json = await res.json();
    if (json.error) throw new Error(json.error.message ?? JSON.stringify(json.error));
    return json.result;
  } finally {
    clearTimeout(timer);
  }
}

async function rpcCallWithFallback(method: string, params: any[] = []): Promise<{ result: any; endpoint: string }> {
  const errors: string[] = [];
  for (const url of getRpcEndpoints()) {
    try {
      const result = await rpcCall(url, method, params);
      return { result, endpoint: url };
    } catch (err: any) {
      errors.push(`${url}: ${err.message}`);
    }
  }
  throw new Error(`All RPC endpoints failed:\n${errors.join("\n")}`);
}

export async function getChainBlockNumber(): Promise<number | null> {
  try {
    const { result } = await rpcCallWithFallback("eth_blockNumber");
    return parseInt(result, 16);
  } catch {
    return null;
  }
}

export async function getChainBalance(address: string): Promise<string | null> {
  try {
    const { result } = await rpcCallWithFallback("eth_getBalance", [address, "latest"]);
    const wei = BigInt(result);
    const gyds = Number(wei) / 1e18;
    return gyds.toFixed(6);
  } catch {
    return null;
  }
}

export async function getTransactionReceipt(txHash: string): Promise<any | null> {
  try {
    const { result } = await rpcCallWithFallback("eth_getTransactionReceipt", [txHash]);
    return result;
  } catch {
    return null;
  }
}

export async function getTransactionCount(address: string): Promise<number> {
  const { result } = await rpcCallWithFallback("eth_getTransactionCount", [address, "pending"]);
  return parseInt(result, 16);
}

export async function getGasPrice(): Promise<bigint> {
  const { result } = await rpcCallWithFallback("eth_gasPrice");
  return BigInt(result);
}

export async function getChainIdRpc(): Promise<number> {
  const { result } = await rpcCallWithFallback("eth_chainId");
  return parseInt(result, 16);
}

export async function getTransactionByHash(txHash: string): Promise<any | null> {
  try {
    const { result } = await rpcCallWithFallback("eth_getTransactionByHash", [txHash]);
    return result;
  } catch {
    return null;
  }
}

export interface BuildTxParams {
  fromAddress: string;
  toAddress: string;
  amountEther: number;
  privateKey?: string;
  chainId?: number;
}

function buildTxHash(from: string, to: string, amount: number, nonce: number, ts: number): string {
  const raw = `${from.toLowerCase()}|${to.toLowerCase()}|${amount}|${nonce}|${ts}`;
  return "0x" + crypto.createHash("sha256").update(raw).digest("hex");
}

export interface BroadcastResult {
  txHash: string;
  onChain: boolean;
  endpoint?: string;
  blockNumber?: number | null;
  error?: string;
}

export async function broadcastTransfer(params: {
  fromAddress: string;
  toAddress: string;
  amountEther: number;
  nonce?: number;
  chainId?: number;
  signedRawTx?: string;
}): Promise<BroadcastResult> {
  const { fromAddress, toAddress, amountEther, signedRawTx } = params;
  const chainId = params.chainId ?? 13370;

  if (signedRawTx) {
    try {
      const { result, endpoint } = await rpcCallWithFallback("eth_sendRawTransaction", [signedRawTx]);
      const blockNumber = await getChainBlockNumber();
      return { txHash: result, onChain: true, endpoint, blockNumber };
    } catch (err: any) {
      return {
        txHash: buildTxHash(fromAddress, toAddress, amountEther, params.nonce ?? 1, Date.now()),
        onChain: false,
        error: err.message,
      };
    }
  }

  const nonce = params.nonce ?? Date.now();
  const txHash = buildTxHash(fromAddress, toAddress, amountEther, nonce, Date.now());

  try {
    const amountHex = "0x" + Math.floor(amountEther * 1e18).toString(16);
    const nonceHex  = "0x" + nonce.toString(16);
    const gasHex    = "0x5208";
    const gasPriceHex = "0x3B9ACA00";

    const txObj = {
      from:     fromAddress,
      to:       toAddress,
      value:    amountHex,
      gas:      gasHex,
      gasPrice: gasPriceHex,
      nonce:    nonceHex,
      chainId:  "0x" + chainId.toString(16),
    };

    const { result, endpoint } = await rpcCallWithFallback("gyds_sendTransaction", [txObj]);
    const onChainHash = typeof result === "string" ? result : txHash;
    const blockNumber = await getChainBlockNumber();
    return { txHash: onChainHash, onChain: true, endpoint, blockNumber };
  } catch (err: any) {
    return {
      txHash,
      onChain: false,
      error: `RPC broadcast failed: ${err.message}`,
    };
  }
}

export async function pollForConfirmation(
  txHash: string,
  maxAttempts = 12,
  intervalMs = 5000
): Promise<{ confirmed: boolean; blockNumber?: number }> {
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise(r => setTimeout(r, intervalMs));
    try {
      const receipt = await getTransactionReceipt(txHash);
      if (receipt && receipt.blockNumber) {
        return { confirmed: true, blockNumber: parseInt(receipt.blockNumber, 16) };
      }
    } catch {}
  }
  return { confirmed: false };
}

export async function checkRpcHealth(): Promise<{ online: boolean; endpoint?: string; blockNumber?: number; error?: string }> {
  try {
    const { result, endpoint } = await rpcCallWithFallback("eth_blockNumber");
    return { online: true, endpoint, blockNumber: parseInt(result, 16) };
  } catch (err: any) {
    return { online: false, error: err.message };
  }
}

export interface EndpointHealth {
  url: string;
  ok: boolean;
  chainId?: number;
  blockNumber?: number;
  latencyMs?: number;
  error?: string;
}

// Probes one RPC URL directly (no fallback) so callers can show per-endpoint
// status instead of only "some endpoint worked".
export async function testEndpoint(url: string, timeoutMs = 6000): Promise<EndpointHealth> {
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", method: "eth_chainId", params: [], id: 1 }),
      signal: controller.signal,
    });
    const json = await res.json();
    if (json.error) throw new Error(json.error.message ?? JSON.stringify(json.error));
    const chainId = parseInt(json.result, 16);
    let blockNumber: number | undefined;
    try {
      const bnRes = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", method: "eth_blockNumber", params: [], id: 2 }),
        signal: controller.signal,
      });
      const bnJson = await bnRes.json();
      if (!bnJson.error) blockNumber = parseInt(bnJson.result, 16);
    } catch {}
    return { url, ok: true, chainId, blockNumber, latencyMs: Date.now() - started };
  } catch (err: any) {
    const aborted = err?.name === "AbortError";
    return {
      url,
      ok: false,
      latencyMs: Date.now() - started,
      error: aborted ? `Timed out after ${timeoutMs}ms (connection opened but never responded)` : err.message,
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function testEndpoints(urls: string[]): Promise<EndpointHealth[]> {
  return Promise.all(urls.map((u) => testEndpoint(u)));
}
