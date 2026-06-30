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
 */

import { createServer, IncomingMessage, ServerResponse, Server } from "http";
import { Pool } from "pg";

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
  s.logs.push(`[${ts}] ${msg}`);
  if (s.logs.length > MAX_LOGS) s.logs.shift();
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
    case "eth_getBalance":            return "0x" + (1_000_000_000_000_000_000n).toString(16);
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
    case "eth_mining":        return false;
    case "eth_hashrate":      return "0x0";
    case "eth_accounts":      return [];
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
            const result = rpc.method === "eth_blockNumber" ? "0x0"
              : rpc.method === "eth_chainId" ? cfg.chainIdHex
              : rpc.method === "net_version" ? String(cfg.chainId)
              : rpc.method === "net_enode" ? getGenesisEnode(network)
              : rpc.method === "eth_getBlockByNumber" && (rpc.params?.[0] === "0x0" || rpc.params?.[0] === "earliest")
                ? blockObject(s, cfg, 0)
              : null;
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
            const result = rpc.method === "net_peerCount" ? "0x" + s.peers.toString(16)
              : rpc.method === "net_version"  ? String(cfg.chainId)
              : rpc.method === "eth_chainId"  ? cfg.chainIdHex
              : rpc.method === "admin_peers"  ? Array.from({ length: s.peers }, (_, i) => ({
                  id: "0x" + randHex(64), name: `Geth/peer-${i}/v1.0.0`,
                  network: { remoteAddress: `${Math.floor(Math.random()*256)}.0.0.${i}:30303` },
                }))
              : null;
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
  start(network: Network, type: NodeType): { ok: boolean; message: string } {
    const s = state[network][type];
    const cfg = NETWORK_CFGS[network];
    if (s.running) return { ok: false, message: `${NODE_LABELS[type]} (${network}) is already running` };

    const srv = createServer(makeHandler(network, type));
    srv.on("error", (err: Error) => {
      addLog(network, type, `ERROR: ${err.message}`);
      if ((err as any).code === "EADDRINUSE") {
        s.running = false; s.server = null;
        if (s.blockTimer) { clearInterval(s.blockTimer); s.blockTimer = null; }
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

      // genesis and bootnode don't produce blocks — skip the block timer
      if (BLOCK_INTERVALS[type] === 0) return;

      s.blockTimer = setInterval(() => {
        s.blockHeight++;
        s.peers = Math.max(1, s.peers + (Math.random() > 0.8 ? (Math.random() > 0.5 ? 1 : -1) : 0));

        if (type === "rpc") {
          const txCount = Math.floor(Math.random() * 5);
          addLog(network, type, `Block #${s.blockHeight} | ${txCount} txs | ${s.peers} peers`);
        } else if (type === "lite") {
          addLog(network, type, `Header #${s.blockHeight} synced | ${s.peers} peers`);
        } else if (type === "fullnode") {
          const txCount = Math.floor(Math.random() * 15) + 1;
          s.txPool = Math.max(0, s.txPool + Math.floor(Math.random() * 8) - txCount);
          addLog(network, type, `Block #${s.blockHeight} | ${txCount} txs | pool: ${s.txPool} | ${s.peers} peers`);
        } else if (type === "validator") {
          const validators = MOCK_VALIDATORS[network];
          const txCount = Math.floor(Math.random() * 8) + 1;
          const proposer = validators[s.blockHeight % validators.length].address;
          const epoch = Math.floor(s.blockHeight / 100);
          s.txPool = Math.max(0, s.txPool + Math.floor(Math.random() * 5) - txCount);
          validators[s.blockHeight % validators.length].blocksProposed++;
          addLog(network, type, `Block #${s.blockHeight} by ${proposer.slice(0, 10)}… | ${txCount} txs | epoch ${epoch} | +${txCount * 2} ${cfg.symbol}`);
        } else {
          const txCount = Math.floor(Math.random() * 40) + 10;
          const mev = Math.random() > 0.6 ? ` | MEV #${Math.floor(Math.random() * 9999)}` : "";
          s.txPool = Math.max(0, s.txPool + Math.floor(Math.random() * 20) - txCount);
          addLog(network, type, `Block #${s.blockHeight} | ${txCount} txs | pool: ${s.txPool}${mev}`);
        }
      }, BLOCK_INTERVALS[type]);
    });

    s.server = srv;
    return { ok: true, message: `Starting ${NODE_LABELS[type]} (${cfg.name}) on port ${s.port}…` };
  },


  stop(network: Network, type: NodeType): { ok: boolean; message: string } {
    const s = state[network][type];
    if (!s.running) return { ok: false, message: `${NODE_LABELS[type]} (${network}) is not running` };
    if (s.blockTimer) { clearInterval(s.blockTimer); s.blockTimer = null; }
    s.server?.close(() => addLog(network, type, `${NODE_LABELS[type]} stopped`));
    s.running = false; s.server = null; s.startedAt = null;
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
};
