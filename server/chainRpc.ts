import crypto from "crypto";

// Computed lazily (not a module-level const) — process.env is populated by
// server/index.ts's .env loader, which runs AFTER this module's imports are
// resolved (ES module import hoisting), so a top-level const here would have
// baked in stale/missing env values and silently ignored any admin-configured
// RPC override.
function getRpcEndpoints(): string[] {
  return getConfiguredGydsRpcEndpoints();
}

function getConfiguredRpcEndpoints(): string[] {
  const primary = process.env.GYDS_RPC_URL?.trim();
  const backups = process.env.GYDS_RPC_BACKUP_URLS
    ? process.env.GYDS_RPC_BACKUP_URLS.split(",").map((s) => s.trim()).filter(Boolean)
    : [];
  return [...new Set([primary, ...backups].filter((url): url is string => Boolean(url)))];
}

export function getConfiguredGydsRpcEndpoints(): string[] {
  const local = process.env.GYDS_LOCAL_RPC_URL?.trim();
  return [...new Set([local, ...getConfiguredRpcEndpoints()].filter((url): url is string => Boolean(url)))];
}

const TIMEOUT_MS = 8000;
const LOCAL_HEALTH_CACHE_MS = 5000;
const localRpcHealth = new Map<string, { checkedAt: number; healthy: boolean }>();

export function isLoopbackRpcEndpoint(endpoint: string): boolean {
  try {
    const hostname = new URL(endpoint).hostname.toLowerCase().replace(/^\[|\]$/g, "");
    return hostname === "localhost" ||
      hostname.endsWith(".localhost") ||
      hostname.startsWith("127.") ||
      hostname === "::1";
  } catch {
    return false;
  }
}

interface JsonRpcResponse {
  result?: any;
  error?: { message?: string; code?: number; data?: unknown };
}

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
    const json = await res.json() as JsonRpcResponse;
    if (json.error) throw new Error(json.error.message ?? JSON.stringify(json.error));
    return json.result;
  } finally {
    clearTimeout(timer);
  }
}

export async function callGydsRpcAtEndpoint(endpoint: string, method: string, params: any[] = []): Promise<any> {
  return rpcCall(endpoint, method, params);
}

function parseRpcQuantity(value: unknown): bigint | null {
  if (typeof value !== "string" || !/^0x[0-9a-f]+$/i.test(value)) return null;
  try {
    return BigInt(value);
  } catch {
    return null;
  }
}

function isKnownSimulatedClientVersion(value: unknown): boolean {
  if (typeof value !== "string") return true;
  return /^GYDSchain\/(?:mainnet|testnet|devnet)\//i.test(value) ||
    /^GYDS-(?:RPC|Fullnode)\/1\.0\.0$/i.test(value);
}

function getConfiguredChainId(): number {
  if (process.env.GYDS_NETWORK?.toLowerCase() === "testnet") return 198281;
  return 198282;
}

export async function assertHealthyLocalGydsRpc(
  endpoint: string,
  expectedChainId = 198282,
): Promise<void> {
  const [chainIdResult, clientVersion, syncing, peerCountResult, blockNumberResult] = await Promise.all([
    rpcCall(endpoint, "eth_chainId"),
    rpcCall(endpoint, "web3_clientVersion"),
    rpcCall(endpoint, "eth_syncing"),
    rpcCall(endpoint, "net_peerCount"),
    rpcCall(endpoint, "eth_blockNumber"),
  ]);
  if (Number.parseInt(String(chainIdResult), 16) !== expectedChainId) {
    throw new Error("The local RPC reports the wrong GYDS chain ID.");
  }
  if (isKnownSimulatedClientVersion(clientVersion)) {
    throw new Error("The local RPC identifies as a simulated development node.");
  }
  if (syncing !== false) {
    throw new Error("The local GYDS node is still syncing or did not report sync status.");
  }
  const peerCount = parseRpcQuantity(peerCountResult);
  if (peerCount === null || peerCount < 1n) {
    throw new Error("The local GYDS node has no connected peers.");
  }
  const blockNumber = parseRpcQuantity(blockNumberResult);
  if (blockNumber === null || blockNumber < 1n) {
    throw new Error("The local GYDS node did not return a valid chain head.");
  }
}

async function ensureHealthyLocalGydsRpc(endpoint: string): Promise<void> {
  const expectedChainId = getConfiguredChainId();
  const cacheKey = `${endpoint}|${expectedChainId}`;
  const cached = localRpcHealth.get(cacheKey);
  if (cached && Date.now() - cached.checkedAt < LOCAL_HEALTH_CACHE_MS) {
    if (!cached.healthy) throw new Error("The configured local RPC is not a healthy GYDS node.");
    return;
  }
  try {
    await assertHealthyLocalGydsRpc(endpoint, expectedChainId);
    localRpcHealth.set(cacheKey, { checkedAt: Date.now(), healthy: true });
  } catch (error) {
    localRpcHealth.set(cacheKey, { checkedAt: Date.now(), healthy: false });
    throw error;
  }
}

async function rpcCallWithFallback(
  method: string,
  params: any[] = [],
  pinnedEndpoint?: string,
): Promise<{ result: any; endpoint: string }> {
  if (pinnedEndpoint) {
    if (isLoopbackRpcEndpoint(pinnedEndpoint)) await ensureHealthyLocalGydsRpc(pinnedEndpoint);
    const result = await rpcCall(pinnedEndpoint, method, params);
    return { result, endpoint: pinnedEndpoint };
  }
  const errors: string[] = [];
  for (const url of getRpcEndpoints()) {
    try {
      if (isLoopbackRpcEndpoint(url)) await ensureHealthyLocalGydsRpc(url);
      const result = await rpcCall(url, method, params);
      return { result, endpoint: url };
    } catch (err: any) {
      errors.push(`${url}: ${err.message}`);
    }
  }
  throw new Error(`All RPC endpoints failed:\n${errors.join("\n")}`);
}

export async function callGydsRpc(method: string, params: any[] = []): Promise<any> {
  const { result } = await rpcCallWithFallback(method, params);
  return result;
}

/**
 * Read from explicitly configured GYDS RPC endpoints only. A configured local
 * full node is tried first, followed by the primary and backup RPCs. The
 * deployment caller is responsible for rejecting known simulated local nodes.
 */
export async function callConfiguredGydsRpc(
  method: string,
  params: any[] = [],
  pinnedEndpoint?: string,
): Promise<{ result: any; endpoint: string }> {
  const endpoints = getConfiguredGydsRpcEndpoints();
  if (!endpoints.length) {
    throw new Error("No explicit local or remote GYDS RPC is configured.");
  }
  if (pinnedEndpoint) {
    if (!endpoints.includes(pinnedEndpoint)) {
      throw new Error("The pinned GYDS RPC is no longer configured.");
    }
    return rpcCallWithFallback(method, params, pinnedEndpoint);
  }

  const errors: string[] = [];
  for (const endpoint of endpoints) {
    try {
      return await rpcCallWithFallback(method, params, endpoint);
    } catch (error: any) {
      errors.push(error?.message ?? String(error));
    }
  }
  throw new Error(`Configured GYDS mainnet RPC endpoints failed: ${errors.join("; ")}`);
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

export async function getTransactionReceipt(txHash: string, endpoint?: string): Promise<any | null> {
  try {
    const { result } = await rpcCallWithFallback("eth_getTransactionReceipt", [txHash], endpoint);
    return result;
  } catch {
    return null;
  }
}

export async function getTransactionCount(address: string, endpoint?: string): Promise<number> {
  const { result } = await rpcCallWithFallback("eth_getTransactionCount", [address, "pending"], endpoint);
  return parseInt(result, 16);
}

export async function getGasPrice(endpoint?: string): Promise<bigint> {
  const { result } = await rpcCallWithFallback("eth_gasPrice", [], endpoint);
  return BigInt(result);
}

export async function getChainIdRpc(): Promise<number> {
  const { chainId } = await getChainContextRpc();
  return chainId;
}

export async function getChainContextRpc(): Promise<{ chainId: number; endpoint: string }> {
  const { result, endpoint } = await rpcCallWithFallback("eth_chainId");
  return { chainId: parseInt(result, 16), endpoint };
}

export async function getTransactionByHash(txHash: string): Promise<any | null> {
  try {
    const { result } = await rpcCallWithFallback("eth_getTransactionByHash", [txHash]);
    return result;
  } catch {
    return null;
  }
}

export async function estimateTransactionGas(fromAddress: string, data: string, endpoint?: string): Promise<bigint> {
  const { result } = await rpcCallWithFallback("eth_estimateGas", [{
    from: fromAddress,
    data,
    value: "0x0",
  }], endpoint);
  return BigInt(result);
}

export async function broadcastRawTransaction(
  rawTransaction: string,
  pinnedEndpoint?: string,
): Promise<{ txHash: string; endpoint: string }> {
  const { result, endpoint } = await rpcCallWithFallback("eth_sendRawTransaction", [rawTransaction], pinnedEndpoint);
  if (typeof result !== "string" || !/^0x[a-fA-F0-9]{64}$/.test(result)) {
    throw new Error("RPC returned an invalid transaction hash");
  }
  return { txHash: result, endpoint };
}

export async function getContractCode(address: string, endpoint?: string): Promise<string | null> {
  try {
    const { result } = await rpcCallWithFallback("eth_getCode", [address, "latest"], endpoint);
    return typeof result === "string" ? result : null;
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
  token?: "GYDS" | "GYD" | "GUSD";
  nonce?: number;
  chainId?: number;
  signedRawTx?: string;
}): Promise<BroadcastResult> {
  const { fromAddress, toAddress, amountEther, signedRawTx } = params;
  const token = params.token ?? "GYDS";
  const chainId = params.chainId ?? 198282;

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
      token,
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
    const json = await res.json() as JsonRpcResponse;
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
      const bnJson = await bnRes.json() as JsonRpcResponse;
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
