/**
 * Multi-network test node manager — localhost "real" nodes
 * Supports: mainnet (13370), testnet (13371), devnet (13372)
 * 7 node types × 3 networks = 21 total node instances
 *
 * Port allocation:
 *   Mainnet: rpc=8545, lite=8555, fullnode=8565, boostnode=8575, validator=8585, genesis=8590, bootnode=8595
 *   Testnet: rpc=8600, lite=8601, fullnode=8602, boostnode=8603, validator=8604, genesis=8605, bootnode=8606
 *   Devnet:  rpc=8650, lite=8651, fullnode=8652, boostnode=8653, validator=8654, genesis=8655, bootnode=8656
 *
 * Nodes persist across server restarts — desired state is stored in the test_node_state DB table.
 * A node runs UNTIL the admin explicitly clicks Stop. Server restarts auto-resume all running nodes.
 *
 * All node logs are written to: logs/test-nodes.log (relative to project root)
 */

import { createServer, IncomingMessage, ServerResponse, Server } from "http";
import { Pool } from "pg";
import * as fs from "fs";
import * as path from "path";

// ── File logger setup ─────────────────────────────────────────────────────────
const LOG_DIR  = path.resolve(process.cwd(), "logs");
const LOG_FILE = path.join(LOG_DIR, "test-nodes.log");

try { fs.mkdirSync(LOG_DIR, { recursive: true }); } catch {}

let _logStream: fs.WriteStream | null = null;
function getLogStream(): fs.WriteStream {
  if (!_logStream || (_logStream as any).destroyed) {
    _logStream = fs.createWriteStream(LOG_FILE, { flags: "a" });
    _logStream.on("error", (e) => console.warn("[test-node-log] write error:", e.message));
  }
  return _logStream;
}

function writeToFile(line: string) {
  try { getLogStream().write(line + "\n"); } catch {}
}

export function getNodeLogFilePath() { return LOG_FILE; }
export function clearNodeLogFile() {
  try { fs.writeFileSync(LOG_FILE, ""); } catch {}
}

const pgPool = new Pool({ connectionString: process.env.DATABASE_URL });

// ── Persist desired state to DB ──────────────────────────────────────────────
export async function saveTestNodeState(network: string, type: string, shouldRun: boolean) {
  const key = `${network}:${type}`;
  try {
    await pgPool.query(
      `INSERT INTO test_node_state (id, should_run, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (id) DO UPDATE SET should_run=$2, updated_at=NOW()`,
      [key, shouldRun]
    );
  } catch (e: any) {
    console.warn(`[test-node] persist state failed for ${key}:`, e.message);
  }
}

export async function loadPersistedTestNodeState(): Promise<Array<{ network: string; type: string }>> {
  try {
    const { rows } = await pgPool.query(
      `SELECT id FROM test_node_state WHERE should_run = true`
    );
    return rows.map((r: any) => {
      const [network, type] = r.id.split(":");
      return { network, type };
    });
  } catch (e: any) {
    console.warn("[test-node] failed to load persisted state:", e.message);
    return [];
  }
}

const MAX_LOGS = 200;

export type Network  = "mainnet" | "testnet" | "devnet";
export type NodeType = "rpc" | "lite" | "fullnode" | "boostnode" | "validator" | "genesis" | "bootnode";

interface NetworkCfg {
  chainId:    number;
  chainIdHex: string;
  symbol:     string;
  name:       string;
  label:      string;
  ports:      Record<NodeType, number>;
}

export const NETWORK_CFGS: Record<Network, NetworkCfg> = {
  mainnet: {
    chainId: 13370, chainIdHex: "0x343A", symbol: "GYDS",
    name: "GYDS Network (Mainnet)", label: "mainnet",
    ports: { rpc: 8545, lite: 8555, fullnode: 8565, boostnode: 8575, validator: 8585, genesis: 8590, bootnode: 8595 },
  },
  testnet: {
    chainId: 13371, chainIdHex: "0x343B", symbol: "tGYDS",
    name: "GYDS Testnet", label: "testnet",
    ports: { rpc: 8600, lite: 8601, fullnode: 8602, boostnode: 8603, validator: 8604, genesis: 8605, bootnode: 8606 },
  },
  devnet: {
    chainId: 13372, chainIdHex: "0x343C", symbol: "dGYDS",
    name: "GYDS Devnet", label: "devnet",
    ports: { rpc: 8650, lite: 8651, fullnode: 8652, boostnode: 8653, validator: 8654, genesis: 8655, bootnode: 8656 },
  },
};

export const ALL_NETWORKS:  Network[]  = ["mainnet", "testnet", "devnet"];
export const ALL_NODE_TYPES: NodeType[] = ["rpc", "lite", "fullnode", "boostnode", "validator", "genesis", "bootnode"];

interface NodeState {
  running:    boolean;
  startedAt:  string | null;
  network:    Network;
  type:       NodeType;
  port:       number;
  server:     Server | null;
  logs:       string[];
  blockHeight: number;
  peers:       number;
  txPool:      number;
  blockTimer:  ReturnType<typeof setInterval> | null;
}

const INITIAL_PEERS: Record<NodeType, number> = { rpc: 4, lite: 2, fullnode: 10, boostnode: 18, validator: 5, genesis: 0, bootnode: 32 };
const INITIAL_POOL:  Record<NodeType, number> = { rpc: 0, lite: 0, fullnode: 12, boostnode: 40, validator: 3,  genesis: 0, bootnode: 0  };

// ── Shared per-network chain state ────────────────────────────────────────────
// All node types on the same network share ONE block height counter and ONE
// balance trie so they are always in sync with each other.
const networkChain: Record<Network, {
  blockHeight: number;
  timer:       ReturnType<typeof setInterval> | null;
  /** key = "TOKEN:0xlowercaseaddress" → wei as bigint */
  balances:    Map<string, bigint>;
  txLog:       Array<{ hash: string; from: string; to: string; token: string; value: bigint; block: number }>;
}> = {
  mainnet: { blockHeight: 1_000, timer: null, balances: new Map(), txLog: [] },
  testnet: { blockHeight: 1_000, timer: null, balances: new Map(), txLog: [] },
  devnet:  { blockHeight: 1_000, timer: null, balances: new Map(), txLog: [] },
};

/** Credit tokens to an address on a network (faucet, premine, transfers). */
export function creditAddress(network: Network, address: string, token: "GYDS" | "GYD" | "GUSD", amountWei: bigint): void {
  if (!address || amountWei <= 0n) return;
  const key   = `${token}:${address.toLowerCase()}`;
  const chain = networkChain[network];
  chain.balances.set(key, (chain.balances.get(key) ?? 0n) + amountWei);
}

/** Debit tokens from an address. Returns false if insufficient balance. */
export function debitAddress(network: Network, address: string, token: "GYDS" | "GYD" | "GUSD", amountWei: bigint): boolean {
  if (!address || amountWei <= 0n) return false;
  const key     = `${token}:${address.toLowerCase()}`;
  const chain   = networkChain[network];
  const current = chain.balances.get(key) ?? 0n;
  if (current < amountWei) return false;
  chain.balances.set(key, current - amountWei);
  return true;
}

/** Read on-chain balance for an address (returns wei as bigint). */
export function getNetworkBalance(network: Network, address: string, token: "GYDS" | "GYD" | "GUSD" = "GYDS"): bigint {
  const key = `${token}:${address.toLowerCase()}`;
  return networkChain[network].balances.get(key) ?? 0n;
}

/** Get the current chain block height for a network (shared across all nodes). */
export function getChainBlockHeight(network: Network): number {
  return networkChain[network].blockHeight;
}

/**
 * Convert a decimal string (e.g. "500" or "1.5") to wei (BigInt, 18 decimals)
 * without going through JS Number, which loses precision for values ≥ 2^53.
 */
function decimalToWei(decimal: string): bigint {
  const clean  = String(decimal ?? "0").trim();
  const [intPart = "0", fracPart = ""] = clean.split(".");
  const frac18 = fracPart.padEnd(18, "0").slice(0, 18);
  return BigInt(intPart || "0") * 10n ** 18n + BigInt(frac18 || "0");
}

/** Token type normaliser — maps DB token_type / token_symbol strings to trie keys. */
function normToken(raw: string): "GYDS" | "GYD" | "GUSD" | null {
  const s = raw?.toLowerCase?.() ?? "";
  if (s === "gyds") return "GYDS";
  if (s === "gyd")  return "GYD";
  if (s === "gusd") return "GUSD";
  return null;
}

/**
 * Seed the in-memory balance trie from persistent DB data.
 * Called once on server start AFTER nodes are resumed.
 *
 * Sources:
 *   1. faucet_claims  — every completed faucet drip credits the recipient
 *   2. transactions   — confirmed to_address credits (from_address debits)
 *
 * Balances are credited to ALL networks so every RPC node
 * (mainnet / testnet / devnet) reflects the same user balances.
 */
export async function seedBalanceTrie(): Promise<void> {
  const start = Date.now();
  let credited = 0;

  try {
    // ── 1. Faucet claims ────────────────────────────────────────────────────
    const { rows: faucet } = await pgPool.query<{
      wallet_address: string;
      token_type: string;
      total: string;
      network: string;
    }>(`
      SELECT LOWER(wallet_address)            AS wallet_address,
             LOWER(token_type)               AS token_type,
             SUM(amount)::text               AS total,
             COALESCE(network, 'testnet')    AS network
      FROM   faucet_claims
      GROUP  BY LOWER(wallet_address), LOWER(token_type), COALESCE(network, 'testnet')
    `);

    for (const row of faucet) {
      const token = normToken(row.token_type);
      if (!token) continue;
      const wei = decimalToWei(row.total);
      if (wei <= 0n) continue;
      // Faucet claims are network-specific — only credit the tagged network
      const net = (ALL_NETWORKS.includes((row as any).network as Network) ? (row as any).network : "testnet") as Network;
      creditAddress(net, row.wallet_address, token, wei);
      credited++;
    }

    // ── 2. Token operations (premines, mints) — per network ─────────────────
    const { rows: ops } = await pgPool.query<{
      wallet_address: string;
      operation_type: string;
      total: string;
      network: string;
    }>(`
      SELECT LOWER(wallet_address) AS wallet_address,
             LOWER(operation_type) AS operation_type,
             SUM(amount)::text     AS total,
             COALESCE(network, 'mainnet') AS network
      FROM   token_operations
      WHERE  status = 'confirmed'
      GROUP  BY LOWER(wallet_address), LOWER(operation_type), COALESCE(network, 'mainnet')
    `).catch(() => ({ rows: [] }));

    for (const row of ops) {
      const opType = row.operation_type ?? "";
      let token: "GYDS" | "GYD" | "GUSD" | null = null;
      let sign = 1;
      if (opType.includes("gusd"))       token = "GUSD";
      else if (opType.includes("gyds"))  token = "GYDS";
      else if (opType.includes("gyd"))   token = "GYD";
      if (opType.includes("burn"))       sign = -1;
      if (!token) continue;
      const wei = decimalToWei(row.total);
      if (wei <= 0n) continue;
      // Premines = genesis allocation, visible on ALL networks
      // Regular mints = network-specific (only credit the tagged network)
      const nets: Network[] = opType.includes("premine")
        ? ALL_NETWORKS
        : (ALL_NETWORKS.includes(row.network as Network) ? [row.network as Network] : ["testnet"]);
      for (const net of nets) {
        if (sign > 0) creditAddress(net, row.wallet_address, token, wei);
        else          debitAddress(net, row.wallet_address, token, wei);
      }
      credited++;
    }

    // ── 3. Confirmed transactions (net credit per address) ──────────────────
    const { rows: txs } = await pgPool.query<{
      address: string;
      token_symbol: string;
      net_wei: string;
    }>(`
      SELECT addr                        AS address,
             LOWER(token_symbol)         AS token_symbol,
             SUM(direction * amount)::text AS net_wei
      FROM (
        SELECT LOWER(to_address)   AS addr,  token_symbol,  amount,  1 AS direction FROM transactions WHERE status IN ('confirmed','completed','success')
        UNION ALL
        SELECT LOWER(from_address) AS addr,  token_symbol,  amount, -1 AS direction FROM transactions WHERE status IN ('confirmed','completed','success')
      ) t
      GROUP BY addr, LOWER(token_symbol)
    `);

    for (const row of txs) {
      const token = normToken(row.token_symbol);
      if (!token) continue;
      // net_wei from DB is a signed decimal string (e.g. "-500" or "250")
      const isNeg  = row.net_wei.startsWith("-");
      const absWei = decimalToWei(row.net_wei.replace("-", ""));
      if (absWei === 0n) continue;
      for (const net of ALL_NETWORKS) {
        if (!isNeg) creditAddress(net, row.address, token, absWei);
        else        debitAddress(net, row.address, token, absWei);
      }
      credited++;
    }

    console.log(`[balance-trie] Seeded ${credited} address/token pairs from DB in ${Date.now() - start}ms`);
  } catch (e: any) {
    console.warn("[balance-trie] Seed failed (non-fatal):", e.message);
  }
}

const state: Record<Network, Record<NodeType, NodeState>> = {} as any;
for (const network of ALL_NETWORKS) {
  state[network] = {} as any;
  const cfg = NETWORK_CFGS[network];
  for (const type of ALL_NODE_TYPES) {
    state[network][type] = {
      running: false, startedAt: null, network, type,
      port: cfg.ports[type], server: null, logs: [],
      blockHeight: 1_000, peers: INITIAL_PEERS[type], txPool: INITIAL_POOL[type],
      blockTimer: null,
    };
  }
}

const MOCK_VALIDATORS: Record<Network, Array<{ address: string; staked: number; commission: number; active: boolean; blocksProposed: number }>> = {
  mainnet: [
    { address: "0x0000000000000000000000000000000000000001", staked: 10000, commission: 0.05, active: true, blocksProposed: 0 },
    { address: "0x0000000000000000000000000000000000000002", staked: 5000,  commission: 0.08, active: true, blocksProposed: 0 },
    { address: "0x0000000000000000000000000000000000000003", staked: 2000,  commission: 0.10, active: true, blocksProposed: 0 },
  ],
  testnet: [
    { address: "0x0000000000000000000000000000000000000011", staked: 5000,  commission: 0.05, active: true, blocksProposed: 0 },
    { address: "0x0000000000000000000000000000000000000012", staked: 1000,  commission: 0.10, active: true, blocksProposed: 0 },
  ],
  devnet: [
    { address: "0x0000000000000000000000000000000000000021", staked: 1000,  commission: 0.00, active: true, blocksProposed: 0 },
  ],
};

function addLog(network: Network, type: NodeType, msg: string) {
  const s = state[network][type];
  const ts = new Date().toISOString().replace("T", " ").slice(0, 19);
  const line = `[${ts}] [${network}/${type}] ${msg}`;
  s.logs.push(`[${ts}] ${msg}`);
  if (s.logs.length > MAX_LOGS) s.logs.shift();
  writeToFile(line);
}

function randHex(len: number) {
  return Array.from({ length: len }, () => Math.floor(Math.random() * 16).toString(16)).join("");
}

// Stable per-network genesis enode public keys (generated once on module load, constant per process)
const GENESIS_ENODE_KEYS: Record<Network, string> = {
  mainnet: randHex(128),
  testnet: randHex(128),
  devnet:  randHex(128),
};

export function getGenesisEnode(network: Network): string {
  const cfg = NETWORK_CFGS[network];
  return `enode://${GENESIS_ENODE_KEYS[network]}@127.0.0.1:${cfg.ports.genesis}`;
}

function blockObject(s: NodeState, cfg: NetworkCfg, extraTxCount = 0) {
  return {
    number: "0x" + s.blockHeight.toString(16),
    hash:   "0x" + randHex(64),
    parentHash: "0x" + randHex(64),
    timestamp: "0x" + Math.floor(Date.now() / 1000).toString(16),
    gasUsed: "0x" + (21_000 * extraTxCount || 0x5208).toString(16),
    gasLimit: "0x1000000",
    miner: "0x" + "a".repeat(40),
    transactions: Array.from({ length: extraTxCount }, () => "0x" + randHex(64)),
    difficulty: "0x1",
    totalDifficulty: "0x" + s.blockHeight.toString(16),
    size: "0x1a3",
    nonce: "0x0000000000000000",
    extraData: "0x47594453636861696e",
    logsBloom: "0x" + "0".repeat(512),
    sha3Uncles: "0x1dcc4de8dec75d7aab85b567b6ccd41ad312451b948a7413f0a142fd40d49347",
    stateRoot: "0x" + "d".repeat(64),
    transactionsRoot: "0x" + "e".repeat(64),
    receiptsRoot: "0x" + "f".repeat(64),
    baseFeePerGas: "0x" + (1_000_000_000).toString(16),
    chainId: cfg.chainIdHex,
  };
}

function generateMockLogs(params: any, s: NodeState): Array<Record<string, any>> {
  const count = Math.floor(Math.random() * 4);
  const fromBlock = params?.[0]?.fromBlock ?? s.blockHeight - 10;
  const toBlock   = params?.[0]?.toBlock   ?? s.blockHeight;
  const topics    = params?.[0]?.topics    ?? [];
  return Array.from({ length: count }, (_, i) => ({
    address: "0x" + randHex(40),
    blockHash: "0x" + randHex(64),
    blockNumber: "0x" + (Math.max(0, Math.min(toBlock, fromBlock + i))).toString(16),
    data: "0x" + randHex(64),
    logIndex: "0x" + i.toString(16),
    removed: false,
    topics: topics.length ? topics : ["0x" + randHex(64), "0x" + randHex(64)],
    transactionHash: "0x" + randHex(64),
    transactionIndex: "0x0",
  }));
}

function generateMockTxpool(s: NodeState): Record<string, any> {
  const pending: Record<string, any> = {};
  const queued: Record<string, any> = {};
  const count = Math.min(s.txPool, 5);
  for (let i = 0; i < count; i++) {
    const addr = "0x" + randHex(40);
    pending[addr] = {
      [i]: { nonce: "0x" + i.toString(16), gasPrice: "0x" + (20e9).toString(16), gas: "0x5208", value: "0x" + (1e18).toString(16), input: "0x", to: "0x" + randHex(40), from: addr },
    };
  }
  return { pending, queued };
}

function generateMockTrace(params: any, s: NodeState): Record<string, any> {
  const txHash = params?.[0] ?? "0x" + randHex(64);
  const depth = Math.floor(Math.random() * 8) + 2;
  return {
    gas: 21000 + depth * 5000,
    returnValue: "0x" + randHex(64),
    structLogs: Array.from({ length: depth }, (_, i) => ({
      pc: i * 4,
      op: ["PUSH1", "MSTORE", "SLOAD", "SSTORE", "CALL", "RETURN", "STOP"][i % 7],
      gas: 21000 - i * 500,
      gasCost: 3 + i,
      depth: i + 1,
      stack: ["0x" + randHex(64)],
      memory: "0x" + randHex(128),
      storage: {},
      refund: 0,
      refies: 0,
    })),
  };
}

function generateMockFilterChanges(params: any, s: NodeState): Array<Record<string, any>> {
  const filterId = params?.[0] ?? "0x1";
  const count = Math.floor(Math.random() * 3);
  return Array.from({ length: count }, (_, i) => ({
    address: "0x" + randHex(40),
    blockHash: "0x" + randHex(64),
    blockNumber: "0x" + (s.blockHeight - i).toString(16),
    data: "0x" + randHex(64),
    logIndex: "0x" + i.toString(16),
    removed: false,
    topics: ["0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef", "0x" + randHex(64)],
    transactionHash: "0x" + randHex(64),
    transactionIndex: "0x0",
  }));
}

function jsonRpcDispatch(rpc: any, s: NodeState, cfg: NetworkCfg, opts: { boosted?: boolean } = {}): unknown {
  switch (rpc.method) {
    case "eth_blockNumber":           return "0x" + s.blockHeight.toString(16);
    case "net_version":               return String(cfg.chainId);
    case "eth_chainId":               return cfg.chainIdHex;
    case "eth_gasPrice":              return "0x" + (opts.boosted ? 5_000_000_000 : 20_000_000_000).toString(16);
    case "eth_maxPriorityFeePerGas":  return "0x" + (opts.boosted ? 2_000_000_000 : 1_000_000_000).toString(16);
    case "net_peerCount":             return "0x" + s.peers.toString(16);
    case "web3_clientVersion":        return `GYDSchain/${cfg.label}/${s.type}/v1.0.0`;
    case "eth_syncing":               return false;
    case "eth_getBalance": {
      const addr = String(rpc.params?.[0] ?? "").toLowerCase();
      return "0x" + (networkChain[s.network].balances.get(`GYDS:${addr}`) ?? 0n).toString(16);
    }
    // gyds_getTokenBalance(address, token) — returns GYD or GUSD balance as hex wei
    case "gyds_getTokenBalance": {
      const addr  = String(rpc.params?.[0] ?? "").toLowerCase();
      const tok   = normToken(String(rpc.params?.[1] ?? "GYDS")) ?? "GYDS";
      return "0x" + (networkChain[s.network].balances.get(`${tok}:${addr}`) ?? 0n).toString(16);
    }
    case "eth_getTransactionCount":   return "0x" + Math.floor(Math.random() * 100).toString(16);
    case "eth_estimateGas":           return "0x" + (21_000).toString(16);
    case "eth_getBlockByNumber":      return blockObject(s, cfg, Math.floor(Math.random() * (opts.boosted ? 30 : 5)));
    case "eth_getBlockByHash":        return blockObject(s, cfg, 0);
    case "eth_call":                  return "0x";
    case "eth_getCode":               return "0x";
    case "eth_getStorageAt":          return "0x" + "0".repeat(64);
    case "eth_sendRawTransaction":    return "0x" + randHex(64);
    case "eth_getTransactionReceipt": return {
      transactionHash: "0x" + randHex(64), blockNumber: "0x" + s.blockHeight.toString(16),
      blockHash: "0x" + randHex(64), gasUsed: "0x5208", status: "0x1", logs: [],
      logsBloom: "0x" + "0".repeat(512),
    };
    case "eth_getLogs":               return generateMockLogs(rpc.params, s);
    case "txpool_status":             return { pending: "0x" + s.txPool.toString(16), queued: "0x0" };
    case "txpool_content":            return generateMockTxpool(s);
    case "debug_traceTransaction":    return generateMockTrace(rpc.params, s);
    case "eth_getFilterChanges":      return generateMockFilterChanges(rpc.params, s);
    case "eth_newFilter":             return "0x" + randHex(8);
    case "eth_uninstallFilter":       return true;
    case "eth_getFilterLogs":         return generateMockLogs(rpc.params, s);
    case "eth_subscribe":             return "0x" + randHex(16);
    case "eth_unsubscribe":           return true;
    case "eth_getUncleCountByBlockNumber": return "0x0";
    case "eth_getUncleCountByBlockHash":   return "0x0";
    case "eth_getTransactionByHash":  return {
      hash: "0x" + randHex(64), nonce: "0x" + Math.floor(Math.random()*100).toString(16),
      blockHash: "0x" + randHex(64), blockNumber: "0x" + s.blockHeight.toString(16),
      transactionIndex: "0x0", from: "0x" + "a".repeat(40), to: "0x" + "b".repeat(40),
      value: "0x" + (1e18).toString(16), gas: "0x5208", gasPrice: "0x" + (20e9).toString(16),
      input: "0x", chainId: cfg.chainIdHex,
    };
    case "eth_getTransactionByBlockHashAndIndex": return {
      hash: "0x" + randHex(64), nonce: "0x1", blockHash: "0x" + randHex(64),
      blockNumber: "0x" + s.blockHeight.toString(16), transactionIndex: rpc.params?.[1] ?? "0x0",
      from: "0x" + "c".repeat(40), to: "0x" + "d".repeat(40), value: "0x" + (1e18).toString(16),
      gas: "0x5208", gasPrice: "0x" + (20e9).toString(16), input: "0x", chainId: cfg.chainIdHex,
    };
    case "eth_getTransactionByBlockNumberAndIndex": return {
      hash: "0x" + randHex(64), nonce: "0x1", blockHash: "0x" + randHex(64),
      blockNumber: rpc.params?.[0] ?? "0x" + s.blockHeight.toString(16), transactionIndex: rpc.params?.[1] ?? "0x0",
      from: "0x" + "e".repeat(40), to: "0x" + "f".repeat(40), value: "0x" + (1e18).toString(16),
      gas: "0x5208", gasPrice: "0x" + (20e9).toString(16), input: "0x", chainId: cfg.chainIdHex,
    };
    case "eth_getBlockTransactionCountByNumber": return "0x" + Math.floor(Math.random()*5).toString(16);
    case "eth_getBlockTransactionCountByHash":   return "0x" + Math.floor(Math.random()*5).toString(16);
    case "eth_getProof": return {
      address: rpc.params?.[0] ?? "0x" + "0".repeat(40), balance: "0x" + (1e18).toString(16),
      nonce: "0x0", codeHash: "0x" + randHex(64), storageHash: "0x" + randHex(64),
      accountProof: [], storageProof: [],
    };
    case "eth_feeHistory": return {
      oldestBlock: "0x" + (s.blockHeight - 10).toString(16),
      baseFeePerGas: Array.from({ length: 11 }, () => "0x" + (1e9 + Math.floor(Math.random()*5e9)).toString(16)),
      gasUsedRatio: Array.from({ length: 10 }, () => Math.random()),
      reward: [],
    };
    case "eth_createAccessList": return { accessList: [], gasUsed: "0x5208" };
    case "eth_getWork":       return [];
    case "eth_submitWork":    return true;
    case "eth_submitHashrate": return true;
    case "eth_protocolVersion": return "0x41";
    case "eth_coinbase":      return "0x" + "0".repeat(40);
    case "eth_mining":        return true;
    case "eth_hashrate":      return "0x" + Math.floor(Math.random() * 1e9).toString(16);
    case "eth_accounts":      return [];

    // ── admin namespace ────────────────────────────────────────────────────────
    case "admin_nodeInfo":    return {
      id:        randHex(128),
      name:      `GYDSchain/${cfg.label}/${s.type}/v1.0.0`,
      enode:     `enode://${randHex(128)}@0.0.0.0:${s.port}`,
      enr:       "enr:-" + randHex(64),
      ip:        "0.0.0.0",
      listenAddr: `0.0.0.0:${s.port}`,
      ports:     { discovery: s.port, listener: s.port },
      protocols: {
        eth: { network: cfg.chainId, difficulty: 17179869184, genesis: "0x" + randHex(64), config: { chainId: cfg.chainId }, head: "0x" + randHex(64) },
      },
    };
    case "admin_peers":       return Array.from({ length: s.peers }, (_, i) => ({
      caps:       ["eth/66", "eth/67", "snap/1"],
      enode:      `enode://${randHex(128)}@${Math.floor(Math.random()*256)}.${Math.floor(Math.random()*256)}.${Math.floor(Math.random()*256)}.${i + 1}:30303`,
      id:         randHex(64),
      name:       `GYDSchain/peer-${i}/v1.0.0`,
      network:    { localAddress: `0.0.0.0:${s.port}`, remoteAddress: `${Math.floor(Math.random()*256)}.0.0.${i + 1}:30303`, inbound: false, trusted: false, static: false },
      protocols:  { eth: { version: 67, difficulty: "0x" + (1e15).toString(16), head: "0x" + randHex(64) } },
    }));
    case "admin_addPeer":     return true;
    case "admin_removePeer":  return true;
    case "admin_addTrustedPeer":    return true;
    case "admin_removeTrustedPeer": return true;
    case "admin_datadir":     return `/var/lib/gyds/${cfg.label}/${s.type}`;
    case "admin_exportChain": return true;
    case "admin_importChain": return true;
    case "admin_startHTTP":   return true;
    case "admin_stopHTTP":    return true;
    case "admin_startWS":     return true;
    case "admin_stopWS":      return true;
    case "admin_setSolc":     return "";
    case "admin_sleep":       return 0;

    // ── web3 namespace ─────────────────────────────────────────────────────────
    case "web3_sha3":         return "0x" + randHex(64);   // keccak256 of input
    // web3_clientVersion already handled above

    // ── net namespace extras ──────────────────────────────────────────────────
    case "net_listening":     return true;

    // ── miner namespace ────────────────────────────────────────────────────────
    case "miner_start":       return null;   // geth returns null on success
    case "miner_stop":        return true;
    case "miner_setEtherbase":   return true;
    case "miner_setGasPrice":    return true;
    case "miner_setGasLimit":    return true;
    case "miner_setExtra":       return true;
    case "miner_getHashrate":    return Math.floor(Math.random() * 1e9);
    case "miner_setRecommitInterval": return null;

    // ── personal namespace ────────────────────────────────────────────────────
    case "personal_listAccounts":  return [];
    case "personal_newAccount":    return "0x" + randHex(40);
    case "personal_unlockAccount": return true;
    case "personal_lockAccount":   return true;
    case "personal_sendTransaction": return "0x" + randHex(64);
    case "personal_sign":          return "0x" + randHex(130);
    case "personal_ecRecover":     return "0x" + randHex(40);
    case "personal_importRawKey":  return "0x" + randHex(40);
    case "personal_listWallets":   return [];
    case "personal_openWallet":    return null;
    case "personal_deriveAccount": return "0x" + randHex(40);

    // ── debug namespace ───────────────────────────────────────────────────────
    case "debug_verbosity":          return null;
    case "debug_vmodule":            return null;
    case "debug_backtraceAt":        return null;
    case "debug_memStats":           return { Alloc: Math.floor(Math.random()*1e8), TotalAlloc: Math.floor(Math.random()*1e9), Sys: Math.floor(Math.random()*5e8), NumGC: Math.floor(Math.random()*1000) };
    case "debug_gcStats":            return { LastGC: new Date().toISOString(), NumGC: Math.floor(Math.random()*1000), PauseTotal: "1ms" };
    case "debug_cpuProfile":         return null;
    case "debug_startCPUProfile":    return null;
    case "debug_stopCPUProfile":     return null;
    case "debug_goTrace":            return null;
    case "debug_startGoTrace":       return null;
    case "debug_stopGoTrace":        return null;
    case "debug_blockProfile":       return null;
    case "debug_setBlockProfileRate":return null;
    case "debug_mutexProfile":       return null;
    case "debug_setMutexProfileFraction": return null;
    case "debug_writeMemProfile":    return null;
    case "debug_stacks":             return "goroutine 1 [running]:\nruntime/debug.Stack()\n";
    case "debug_freeOSMemory":       return null;
    case "debug_setGCPercent":       return 100;
    case "debug_getBlockRlp":        return "0x" + randHex(256);
    case "debug_printBlock":         return `Block #${s.blockHeight}: hash=0x${randHex(64)}`;
    case "debug_seedHash":           return "0x" + randHex(64);
    case "debug_chaindbProperty":    return "";
    case "debug_chaindbCompact":     return null;
    case "debug_setHead":            return null;
    case "debug_dumpBlock":          return { root: "0x" + randHex(64), accounts: {} };
    case "debug_accountRange":       return { accounts: {}, next: "0x" + "0".repeat(40) };
    case "debug_storageRangeAt":     return { storage: {}, nextKey: null };
    case "debug_getModifiedAccountsByNumber": return [];
    case "debug_getModifiedAccountsByHash":   return [];
    case "debug_getBadBlocks":       return [];

    case "mining_connect":    return { sessionId: randHex(32), poolName: "GYDS-" + cfg.label + "-Pool", difficulty: "0000ffff", blockHeight: s.blockHeight, chainId: cfg.chainId };
    case "mining_disconnect": return { ok: true };
    case "mining_getWork":    return { jobId: randHex(16), target: "0000ffff" + "f".repeat(56), difficulty: "0000ffff", blockHeight: s.blockHeight, prevBlockHash: "0x" + randHex(64), timestamp: Math.floor(Date.now() / 1000), algorithm: "randomx" };
    case "mining_submitShare":
    case "mining_submitWork": return { accepted: true, reward: 0.01, message: "Share accepted!", newDifficulty: "0000ffff" };
    case "mining_getStats":   return { hashRate: Math.floor(Math.random() * 5e6), validShares: Math.floor(Math.random() * 100), rejectedShares: Math.floor(Math.random() * 3), totalReward: Math.random() * 10, currentDifficulty: "0000ffff", humanScore: Math.random(), sessionId: randHex(16), uptime: Math.floor(Math.random() * 3600) };
    case "mining_getPoolInfo": return { name: "GYDS-" + cfg.label + "-Pool", totalHashRate: Math.floor(Math.random() * 1e9), activeMiners: Math.floor(Math.random() * 50) + 1, blocksFound: Math.floor(Math.random() * 1000), poolFee: 1.0, minPayout: 0.1, difficulty: "0000ffff" };
    case "gyds_sendTransaction": {
      // Custom GYDS transfer: { from, to, token, value } where value is wei as hex or bigint string
      const p        = rpc.params?.[0] ?? {};
      const fromAddr = String(p.from  ?? "").toLowerCase();
      const toAddr   = String(p.to    ?? "").toLowerCase();
      const token    = (["GYDS", "GYD", "GUSD"].includes(String(p.token ?? "").toUpperCase())
                        ? String(p.token).toUpperCase()
                        : "GYDS") as "GYDS" | "GYD" | "GUSD";
      let valueWei: bigint;
      try { valueWei = BigInt(p.value ?? 0); } catch { return null; }
      if (!fromAddr || !toAddr || valueWei <= 0n) return null;
      if (!debitAddress(s.network, fromAddr, token, valueWei)) return null; // insufficient funds
      creditAddress(s.network, toAddr, token, valueWei);
      const txHash = "0x" + randHex(64);
      networkChain[s.network].txLog.push({ hash: txHash, from: fromAddr, to: toAddr, token, value: valueWei, block: networkChain[s.network].blockHeight });
      if (networkChain[s.network].txLog.length > 500) networkChain[s.network].txLog.shift();
      return txHash;
    }
    default:                          return null;
  }
}

function cors() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}

function makeHandler(network: Network, type: NodeType) {
  const cfg = NETWORK_CFGS[network];

  return function handler(req: IncomingMessage, res: ServerResponse) {
    const s = state[network][type];
    if (req.method === "OPTIONS") { res.writeHead(204, cors()); res.end(); return; }
    const url = req.url ?? "/";

    // ── Genesis node ──────────────────────────────────────────────────────────
    if (type === "genesis") {
      if (req.method === "GET") {
        if (url === "/genesis.json" || url === "/genesis") {
          res.writeHead(200, { "Content-Type": "application/json", ...cors() });
          res.end(JSON.stringify({
            config: {
              chainId: cfg.chainId, homesteadBlock: 0, eip155Block: 0, eip158Block: 0,
              byzantiumBlock: 0, constantinopleBlock: 0, petersburgBlock: 0,
              istanbulBlock: 0, berlinBlock: 0, londonBlock: 0,
            },
            difficulty: "0x400",
            gasLimit:   "0x8000000",
            alloc: {},
            extraData: "0x" + "47594453" + "0".repeat(56),
            nonce:      "0x0000000000000042",
            timestamp:  "0x" + Math.floor(Date.now() / 1000).toString(16),
            mixHash:    "0x" + "0".repeat(64),
            parentHash: "0x" + "0".repeat(64),
            coinbase:   "0x" + "0".repeat(40),
            network:    cfg.name, symbol: cfg.symbol,
          }));
          addLog(network, type, "Genesis config served");
          return;
        }
        res.writeHead(200, { "Content-Type": "application/json", ...cors() });
        res.end(JSON.stringify({
          node:       `GYDSchain/${cfg.label}/genesis/v1.0.0`,
          chainId:    cfg.chainId, chainIdHex: cfg.chainIdHex,
          chainName:  cfg.name, symbol: cfg.symbol,
          genesisBlock: 0, mode: "genesis",
          endpoints: { genesis: `/genesis.json` },
          uptime: s.startedAt ? Math.floor((Date.now() - new Date(s.startedAt).getTime()) / 1000) : 0,
        }));
        addLog(network, type, "Status poll");
        return;
      }
      if (req.method === "POST") {
        let body = "";
        req.on("data", (c: Buffer) => { body += c.toString(); });
        req.on("end", () => {
          try {
            const rpc = JSON.parse(body);
            let result: unknown =
                rpc.method === "eth_blockNumber" ? "0x" + s.blockHeight.toString(16)
              : rpc.method === "eth_chainId"     ? cfg.chainIdHex
              : rpc.method === "net_version"     ? String(cfg.chainId)
              : rpc.method === "net_enode"       ? getGenesisEnode(network)
              : rpc.method === "eth_getBlockByNumber" && (rpc.params?.[0] === "0x0" || rpc.params?.[0] === "earliest")
                ? blockObject(s, cfg, 0)
              : "__FALLTHROUGH__";
            if (result === "__FALLTHROUGH__") result = jsonRpcDispatch(rpc, s, cfg);
            res.writeHead(200, { "Content-Type": "application/json", ...cors() });
            res.end(JSON.stringify({ jsonrpc: "2.0", id: rpc.id, result }));
          } catch { res.writeHead(400); res.end(JSON.stringify({ error: "Invalid JSON-RPC" })); }
        });
        return;
      }
      res.writeHead(405); res.end(); return;
    }

    // ── Boot node ─────────────────────────────────────────────────────────────
    if (type === "bootnode") {
      if (req.method === "GET") {
        if (url === "/peers") {
          const peers = Array.from({ length: s.peers }, (_, i) => ({
            id:      "0x" + randHex(128),
            addr:    `${Math.floor(Math.random()*256)}.${Math.floor(Math.random()*256)}.${Math.floor(Math.random()*256)}.${Math.floor(Math.random()*256)}:30303`,
            network: cfg.label, chainId: cfg.chainId,
          }));
          res.writeHead(200, { "Content-Type": "application/json", ...cors() });
          res.end(JSON.stringify({ peers, count: peers.length }));
          addLog(network, type, `Peers list served (${peers.length} peers)`);
          return;
        }
        res.writeHead(200, { "Content-Type": "application/json", ...cors() });
        res.end(JSON.stringify({
          node: `GYDSchain/${cfg.label}/bootnode/v1.0.0`,
          chainId: cfg.chainId, chainIdHex: cfg.chainIdHex,
          chainName: cfg.name, symbol: cfg.symbol,
          peers: s.peers, mode: "bootnode",
          enode: `enode://` + randHex(128) + `@${cfg.label}.netlifegy.com:${s.port}`,
          uptime: s.startedAt ? Math.floor((Date.now() - new Date(s.startedAt).getTime()) / 1000) : 0,
        }));
        addLog(network, type, `Status poll → ${s.peers} peers known`);
        return;
      }
      if (req.method === "POST") {
        let body = "";
        req.on("data", (c: Buffer) => { body += c.toString(); });
        req.on("end", () => {
          try {
            const rpc = JSON.parse(body);
            // Route everything through the shared dispatcher so all namespaces work on bootnode too
            const result = jsonRpcDispatch(rpc, s, cfg);
            res.writeHead(200, { "Content-Type": "application/json", ...cors() });
            res.end(JSON.stringify({ jsonrpc: "2.0", id: rpc.id, result }));
          } catch { res.writeHead(400); res.end(JSON.stringify({ error: "Invalid JSON-RPC" })); }
        });
        return;
      }
      res.writeHead(405); res.end(); return;
    }

    if (req.method === "GET") {
      if (type === "lite") {
        res.writeHead(200, { "Content-Type": "application/json", ...cors() });
        res.end(JSON.stringify({
          node: `GYDSchain/${cfg.label}/lite-node/v1.0.0`, chainId: cfg.chainId,
          chainIdHex: cfg.chainIdHex, chainName: cfg.name, symbol: cfg.symbol,
          syncing: false, currentBlock: s.blockHeight, peers: s.peers, mode: "lite",
          uptime: s.startedAt ? Math.floor((Date.now() - new Date(s.startedAt).getTime()) / 1000) : 0,
        }));
        addLog(network, type, `Status poll → block #${s.blockHeight}`);
        return;
      }
      if (url === "/validators" && type === "validator") {
        MOCK_VALIDATORS[network][0].blocksProposed = s.blockHeight;
        res.writeHead(200, { "Content-Type": "application/json", ...cors() });
        res.end(JSON.stringify(MOCK_VALIDATORS[network]));
        return;
      }
      res.writeHead(200, { "Content-Type": "application/json", ...cors() });
      res.end(JSON.stringify({
        node: `GYDSchain/${cfg.label}/${type}/v1.0.0`, chainId: cfg.chainId,
        chainIdHex: cfg.chainIdHex, chainName: cfg.name, symbol: cfg.symbol,
        syncing: false, currentBlock: s.blockHeight, peers: s.peers, txPool: s.txPool, mode: type,
        uptime: s.startedAt ? Math.floor((Date.now() - new Date(s.startedAt).getTime()) / 1000) : 0,
        blockTime: "120s",
        ...(type === "boostnode" ? { mevBundles: Math.floor(Math.random() * 8), tps: Math.floor(s.txPool * 0.8 + Math.random() * 10), priorityFee: "2 gwei" } : {}),
        ...(type === "validator" ? {
          validators: MOCK_VALIDATORS[network].length,
          activeSet: MOCK_VALIDATORS[network].filter(v => v.active).length,
          epoch: Math.floor(s.blockHeight / 100), epochLength: 100,
          stakeRequired: "1000 " + cfg.symbol,
        } : {}),
      }));
      return;
    }

    if (url === "/boost/bundle" && req.method === "POST") {
      res.writeHead(200, { "Content-Type": "application/json", ...cors() });
      res.end(JSON.stringify({ bundleHash: "0x" + randHex(64), status: "queued", eta: "< 1 block", network: cfg.label }));
      addLog(network, type, `MEV bundle received → queued for block #${s.blockHeight + 1}`);
      return;
    }

    if (req.method !== "POST") { res.writeHead(405); res.end(); return; }

    let body = "";
    req.on("data", (c: Buffer) => { body += c.toString(); });
    req.on("end", () => {
      try {
        const rpc = JSON.parse(body);
        let result: unknown;

        if (type === "validator") {
          if (rpc.method === "validator_info") {
            result = {
              validators: MOCK_VALIDATORS[network].length, activeSet: MOCK_VALIDATORS[network].filter(v => v.active).length,
              blockTime: "120s", stakeReq: "1000 " + cfg.symbol, slashing: true,
              epoch: Math.floor(s.blockHeight / 100), epochLength: 100, rewardPerBlock: "2 " + cfg.symbol,
              chainId: cfg.chainId, network: cfg.label,
            };
          } else if (rpc.method === "validator_set") {
            result = MOCK_VALIDATORS[network].map(v => ({ ...v, slashed: false, slashCount: 0, uptime: 0.999, joinedAt: new Date(Date.now() - 86400000 * 30).toISOString() }));
          } else if (rpc.method === "validator_getRewards") {
            result = { totalRewards: s.blockHeight * 2, rewardPerBlock: 2, pendingRewards: (s.blockHeight % 100) * 2, commissionEarned: s.blockHeight * 0.1, symbol: cfg.symbol };
          } else if (rpc.method === "validator_register") {
            const params = rpc.params ?? [];
            MOCK_VALIDATORS[network].push({ address: params[0] ?? "0x" + randHex(40), staked: params[1] ?? 1000, commission: 0.05, active: true, blocksProposed: 0 });
            result = { registered: true, network: cfg.label };
          } else {
            result = jsonRpcDispatch(rpc, s, cfg);
          }
        } else {
          result = jsonRpcDispatch(rpc, s, cfg, { boosted: type === "boostnode" });
        }

        addLog(network, type, `${rpc.method} → block #${s.blockHeight}`);
        res.writeHead(200, { "Content-Type": "application/json", ...cors() });
        res.end(JSON.stringify(Array.isArray(rpc)
          ? rpc.map((r: any) => ({ jsonrpc: "2.0", id: r.id, result: null }))
          : { jsonrpc: "2.0", id: rpc.id, result }));
      } catch { res.writeHead(400); res.end(JSON.stringify({ error: "Invalid JSON-RPC" })); }
    });
  };
}

const BLOCK_INTERVALS: Record<NodeType, number> = {
  rpc: 3000, lite: 3000, fullnode: 2000, boostnode: 1000, validator: 5000, genesis: 0, bootnode: 0,
};

const NODE_LABELS: Record<NodeType, string> = {
  rpc: "RPC Node", lite: "Lite Node", fullnode: "Full Node", boostnode: "Boost Node",
  validator: "Validator Node", genesis: "Genesis Node", bootnode: "Boot Node",
};

export const testNodeManager = {
  /** Returns a Promise so the route can await a real start/fail result. */
  start(network: Network, type: NodeType): Promise<{ ok: boolean; message: string }> {
    return new Promise((resolve) => {
      const s = state[network][type];
      const cfg = NETWORK_CFGS[network];
      if (s.running) {
        resolve({ ok: false, message: `${NODE_LABELS[type]} (${network}) is already running` });
        return;
      }

      // Only one genesis node is allowed running at a time across all networks
      if (type === "genesis") {
        for (const net of ALL_NETWORKS) {
          if (net !== network && state[net].genesis.running) {
            resolve({ ok: false, message: `Genesis node already running on ${net}. Only one genesis node is allowed across all networks — stop it first.` });
            return;
          }
        }
      }

      const srv = createServer(makeHandler(network, type));
      let settled = false;

      srv.on("error", (err: Error) => {
        addLog(network, type, `ERROR: ${err.message}`);
        s.running = false; s.server = null;
        if (s.blockTimer) { clearInterval(s.blockTimer); s.blockTimer = null; }
        if (!settled) {
          settled = true;
          const hint = (err as any).code === "EADDRINUSE"
            ? ` — port ${s.port} is already in use`
            : "";
          resolve({ ok: false, message: `${NODE_LABELS[type]} failed to start: ${err.message}${hint}` });
        }
      });

      srv.listen(s.port, "0.0.0.0", () => {
        s.running = true;
        s.startedAt = new Date().toISOString();
        addLog(network, type, `${NODE_LABELS[type]} started on port ${s.port}`);

        addLog(network, type, `Network: ${cfg.name} | Chain ID: ${cfg.chainId} | Symbol: ${cfg.symbol}`);
        addLog(network, type, `Endpoint: http://0.0.0.0:${s.port}`);
        if (type === "boostnode") addLog(network, type, "MEV bundle endpoint: POST /boost/bundle");
        if (type === "fullnode")  addLog(network, type, "Full-state RPC + txpool_status + debug_traceTransaction enabled");
        if (type === "validator") addLog(network, type, "PoS consensus started | validator_info, validator_set, validator_getRewards, validator_register");
        if (type === "genesis")   addLog(network, type, `Genesis block served at GET /genesis.json | Chain ID: ${cfg.chainId}`);
        if (type === "bootnode")  addLog(network, type, `Peer discovery active | ${s.peers} peers known | enode available at GET /`);

        if (!settled) {
          settled = true;
          resolve({ ok: true, message: `${NODE_LABELS[type]} (${cfg.name}) started on port ${s.port}` });
        }

        // Sync node to shared chain state immediately
        const chain = networkChain[network];
        s.blockHeight = chain.blockHeight;

        // Start the shared 3-second block timer if this is the first node on this network
        if (chain.timer === null) {
          chain.timer = setInterval(() => {
            chain.blockHeight++;
            // Mirror block height to ALL running nodes including genesis and bootnode
            for (const t of ALL_NODE_TYPES) {
              if (state[network][t].running) state[network][t].blockHeight = chain.blockHeight;
            }
          }, 3_000);
          addLog(network, type, `Shared block timer started — all ${network} nodes synced at block #${chain.blockHeight}`);
        }

        // genesis and bootnode don't log per-block activity
        if (BLOCK_INTERVALS[type] === 0) return;

        // Per-node activity logger (reads shared block height — does NOT increment it)
        s.blockTimer = setInterval(() => {
          const h = chain.blockHeight; // authoritative shared height
          s.blockHeight = h;
          s.peers = Math.max(1, s.peers + (Math.random() > 0.8 ? (Math.random() > 0.5 ? 1 : -1) : 0));

          if (type === "rpc") {
            const txCount = Math.floor(Math.random() * 5);
            addLog(network, type, `Block #${h} | ${txCount} txs | ${s.peers} peers`);
          } else if (type === "lite") {
            addLog(network, type, `Header #${h} synced | ${s.peers} peers`);
          } else if (type === "fullnode") {
            const txCount = Math.floor(Math.random() * 15) + 1;
            s.txPool = Math.max(0, s.txPool + Math.floor(Math.random() * 8) - txCount);
            addLog(network, type, `Block #${h} | ${txCount} txs | pool: ${s.txPool} | ${s.peers} peers`);
          } else if (type === "validator") {
            const validators = MOCK_VALIDATORS[network];
            const txCount = Math.floor(Math.random() * 8) + 1;
            const proposer = validators[h % validators.length].address;
            const epoch = Math.floor(h / 100);
            s.txPool = Math.max(0, s.txPool + Math.floor(Math.random() * 5) - txCount);
            validators[h % validators.length].blocksProposed++;
            addLog(network, type, `Block #${h} by ${proposer.slice(0, 10)}… | ${txCount} txs | epoch ${epoch} | +${txCount * 2} ${cfg.symbol}`);
          } else {
            const txCount = Math.floor(Math.random() * 40) + 10;
            const mev = Math.random() > 0.6 ? ` | MEV #${Math.floor(Math.random() * 9999)}` : "";
            s.txPool = Math.max(0, s.txPool + Math.floor(Math.random() * 20) - txCount);
            addLog(network, type, `Block #${h} | ${txCount} txs | pool: ${s.txPool}${mev}`);
          }
        }, BLOCK_INTERVALS[type]);
      });

      s.server = srv;
    });
  },


  stop(network: Network, type: NodeType): { ok: boolean; message: string } {
    const s = state[network][type];
    if (!s.running) return { ok: false, message: `${NODE_LABELS[type]} (${network}) is not running` };
    if (s.blockTimer) { clearInterval(s.blockTimer); s.blockTimer = null; }
    s.server?.close(() => addLog(network, type, `${NODE_LABELS[type]} stopped`));
    s.running = false; s.server = null; s.startedAt = null;

    // If no more nodes running on this network, stop the shared block timer
    const chain = networkChain[network];
    const anyStillRunning = ALL_NODE_TYPES.some(t => t !== type && state[network][t].running);
    if (!anyStillRunning && chain.timer !== null) {
      clearInterval(chain.timer);
      chain.timer = null;
      addLog(network, type, `Shared block timer stopped — no more nodes running on ${network}`);
    }
    return { ok: true, message: `${NODE_LABELS[type]} (${network}) stopped` };
  },

  status() {
    const result: any = {};
    for (const network of ALL_NETWORKS) {
      result[network] = {};
      for (const type of ALL_NODE_TYPES) {
        const s = state[network][type];
        result[network][type] = {
          running: s.running, startedAt: s.startedAt, port: s.port,
          blockHeight: s.blockHeight, peers: s.peers, txPool: s.txPool,
        };
      }
    }
    return result;
  },

  getLogs(network: Network, type: NodeType) {
    return [...state[network][type].logs];
  },

  stopAll() {
    for (const network of ALL_NETWORKS) {
      for (const type of ALL_NODE_TYPES) {
        if (state[network][type].running) this.stop(network, type);
      }
    }
  },

  getRunningNodes(): Array<{ network: Network; type: NodeType; port: number }> {
    const result: Array<{ network: Network; type: NodeType; port: number }> = [];
    for (const network of ALL_NETWORKS) {
      for (const type of ALL_NODE_TYPES) {
        const s = state[network][type];
        if (s.running) result.push({ network, type, port: s.port });
      }
    }
    return result;
  },

  /**
   * Start all 7 node types for a network sequentially in proper dependency order:
   * genesis → bootnode → rpc → fullnode → validator → lite → boostnode
   * Each node waits 500ms after starting before the next begins.
   */
  async startSequential(
    network: Network,
    onProgress?: (step: number, total: number, type: NodeType, ok: boolean, msg: string) => void
  ): Promise<{ ok: boolean; started: NodeType[]; failed: NodeType[] }> {
    const ORDER: NodeType[] = ["genesis", "bootnode", "rpc", "fullnode", "validator", "lite", "boostnode"];
    const started: NodeType[] = [];
    const failed:  NodeType[] = [];
    for (let i = 0; i < ORDER.length; i++) {
      const type = ORDER[i];
      if (state[network][type].running) {
        started.push(type);
        onProgress?.(i + 1, ORDER.length, type, true, "Already running");
        continue;
      }
      const result = await this.start(network, type);
      if (result.ok) {
        started.push(type);
        await saveTestNodeState(network, type, true);
      } else {
        failed.push(type);
      }
      onProgress?.(i + 1, ORDER.length, type, result.ok, result.message);
      // Small delay so each node binds its port before the next one tries
      await new Promise(r => setTimeout(r, 500));
    }
    return { ok: failed.length === 0, started, failed };
  },
};
