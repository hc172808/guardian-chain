/**
 * Test node manager — spawns/kills five in-process simulated blockchain nodes
 * for development/testing within the Replit environment or any deployed server.
 *
 * RPC Node       (8545) : Ethereum-compatible JSON-RPC endpoint
 * Lite Node      (8555) : Lightweight header-sync node
 * Full Node      (8565) : Full-state node with mempool, traces, storage queries
 * Boost Node     (8575) : High-throughput MEV/priority-tx node, 1-second blocks
 * Validator Node (8585) : PoS validator node with staking, slashing, rewards
 *
 * All servers bind to 0.0.0.0 so they are reachable on any network interface.
 */

import { createServer, IncomingMessage, ServerResponse, Server } from "http";

const MAX_LOGS = 200;

export type NodeType = "rpc" | "lite" | "fullnode" | "boostnode" | "validator";

interface NodeState {
  running: boolean;
  startedAt: string | null;
  port: number;
  server: Server | null;
  logs: string[];
  blockHeight: number;
  peers: number;
  txPool: number;
  blockTimer: ReturnType<typeof setInterval> | null;
}

const state: Record<NodeType, NodeState> = {
  rpc:      { running: false, startedAt: null, port: 8545, server: null, logs: [], blockHeight: 1_000, peers: 4,  txPool: 0,  blockTimer: null },
  lite:     { running: false, startedAt: null, port: 8555, server: null, logs: [], blockHeight: 1_000, peers: 2,  txPool: 0,  blockTimer: null },
  fullnode: { running: false, startedAt: null, port: 8565, server: null, logs: [], blockHeight: 1_000, peers: 10, txPool: 12, blockTimer: null },
  boostnode:{ running: false, startedAt: null, port: 8575, server: null, logs: [], blockHeight: 1_000, peers: 18, txPool: 40, blockTimer: null },
  validator:{ running: false, startedAt: null, port: 8585, server: null, logs: [], blockHeight: 1_000, peers: 5,  txPool: 3,  blockTimer: null },
};

function addLog(type: NodeType, msg: string) {
  const ts = new Date().toISOString().replace("T", " ").slice(0, 19);
  state[type].logs.push(`[${ts}] ${msg}`);
  if (state[type].logs.length > MAX_LOGS) state[type].logs.shift();
}

function randHex(len: number) {
  return Array.from({ length: len }, () => Math.floor(Math.random() * 16).toString(16)).join("");
}

function blockObject(s: NodeState, extraTxCount = 0) {
  return {
    number: "0x" + s.blockHeight.toString(16),
    hash: "0x" + randHex(64),
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
  };
}

function jsonRpcDispatch(rpc: any, s: NodeState, nodeLabel: string, opts: { boosted?: boolean } = {}): unknown {
  switch (rpc.method) {
    case "eth_blockNumber":         return "0x" + s.blockHeight.toString(16);
    case "net_version":             return "13370";
    case "eth_chainId":             return "0x" + (13370).toString(16);
    case "eth_gasPrice":            return "0x" + (opts.boosted ? 5_000_000_000 : 20_000_000_000).toString(16);
    case "eth_maxPriorityFeePerGas":return "0x" + (opts.boosted ? 2_000_000_000 : 1_000_000_000).toString(16);
    case "net_peerCount":           return "0x" + s.peers.toString(16);
    case "web3_clientVersion":      return `GYDSchain/${nodeLabel}/v0.2.0`;
    case "eth_syncing":             return false;
    case "eth_getBalance":          return "0x" + (1_000_000_000_000_000_000n).toString(16);
    case "eth_getTransactionCount": return "0x" + Math.floor(Math.random() * 100).toString(16);
    case "eth_estimateGas":         return "0x" + (21_000).toString(16);
    case "eth_getBlockByNumber":    return blockObject(s, Math.floor(Math.random() * (opts.boosted ? 30 : 5)));
    case "eth_getBlockByHash":      return blockObject(s, 0);
    case "eth_call":                return "0x";
    case "eth_getCode":             return "0x";
    case "eth_getStorageAt":        return "0x" + "0".repeat(64);
    case "eth_sendRawTransaction":  return "0x" + randHex(64);
    case "eth_getTransactionReceipt": return {
      transactionHash: "0x" + randHex(64),
      blockNumber: "0x" + s.blockHeight.toString(16),
      blockHash: "0x" + randHex(64),
      gasUsed: "0x5208",
      status: "0x1",
      logs: [],
      logsBloom: "0x" + "0".repeat(512),
    };
    case "eth_getLogs":             return [];
    case "txpool_status":           return { pending: "0x" + s.txPool.toString(16), queued: "0x0" };
    case "txpool_content":          return { pending: {}, queued: {} };
    case "debug_traceTransaction":  return { gas: 21000, returnValue: "", structLogs: [] };
    case "eth_getFilterChanges":    return [];
    case "eth_newFilter":           return "0x1";
    default:                        return null;
  }
}

// ── RPC node ─────────────────────────────────────────────────────────────────
function rpcHandler(req: IncomingMessage, res: ServerResponse) {
  if (req.method === "OPTIONS") {
    res.writeHead(204, cors()); res.end(); return;
  }
  if (req.method !== "POST") { res.writeHead(405); res.end(); return; }
  let body = "";
  req.on("data", (c: Buffer) => { body += c.toString(); });
  req.on("end", () => {
    try {
      const rpc = JSON.parse(body);
      const s = state.rpc;
      const result = jsonRpcDispatch(rpc, s, "rpc-node");
      addLog("rpc", `${rpc.method} → block #${s.blockHeight}`);
      res.writeHead(200, { "Content-Type": "application/json", ...cors() });
      res.end(JSON.stringify(Array.isArray(rpc)
        ? rpc.map((r: any) => ({ jsonrpc: "2.0", id: r.id, result: null }))
        : { jsonrpc: "2.0", id: rpc.id, result }));
    } catch { res.writeHead(400); res.end(JSON.stringify({ error: "Invalid JSON-RPC" })); }
  });
}

// ── Lite node ────────────────────────────────────────────────────────────────
function liteHandler(_req: IncomingMessage, res: ServerResponse) {
  const s = state.lite;
  res.writeHead(200, { "Content-Type": "application/json", ...cors() });
  res.end(JSON.stringify({
    node: "GYDSchain/lite-node/v0.2.0",
    chainId: 13370, syncing: false,
    currentBlock: s.blockHeight,
    peers: s.peers, mode: "lite",
    uptime: s.startedAt ? Math.floor((Date.now() - new Date(s.startedAt).getTime()) / 1000) : 0,
  }));
  addLog("lite", `status poll → block #${s.blockHeight}`);
}

// ── Full node ────────────────────────────────────────────────────────────────
function fullnodeHandler(req: IncomingMessage, res: ServerResponse) {
  if (req.method === "OPTIONS") { res.writeHead(204, cors()); res.end(); return; }

  const s = state.fullnode;

  if (req.method === "GET") {
    res.writeHead(200, { "Content-Type": "application/json", ...cors() });
    res.end(JSON.stringify({
      node: "GYDSchain/full-node/v0.2.0",
      chainId: 13370, syncing: false,
      currentBlock: s.blockHeight,
      peers: s.peers, txPool: s.txPool,
      mode: "full",
      uptime: s.startedAt ? Math.floor((Date.now() - new Date(s.startedAt).getTime()) / 1000) : 0,
    }));
    return;
  }

  if (req.method !== "POST") { res.writeHead(405); res.end(); return; }
  let body = "";
  req.on("data", (c: Buffer) => { body += c.toString(); });
  req.on("end", () => {
    try {
      const rpc = JSON.parse(body);
      const result = jsonRpcDispatch(rpc, s, "full-node");
      addLog("fullnode", `${rpc.method} → block #${s.blockHeight} | pool: ${s.txPool}`);
      res.writeHead(200, { "Content-Type": "application/json", ...cors() });
      res.end(JSON.stringify(Array.isArray(rpc)
        ? rpc.map((r: any) => ({ jsonrpc: "2.0", id: r.id, result: null }))
        : { jsonrpc: "2.0", id: rpc.id, result }));
    } catch { res.writeHead(400); res.end(JSON.stringify({ error: "Invalid JSON-RPC" })); }
  });
}

// ── Boost node ───────────────────────────────────────────────────────────────
function boostnodeHandler(req: IncomingMessage, res: ServerResponse) {
  if (req.method === "OPTIONS") { res.writeHead(204, cors()); res.end(); return; }

  const s = state.boostnode;
  const url = req.url ?? "/";

  if (url === "/boost/status" || (req.method === "GET" && url === "/")) {
    res.writeHead(200, { "Content-Type": "application/json", ...cors() });
    res.end(JSON.stringify({
      node: "GYDSchain/boost-node/v0.2.0",
      chainId: 13370, syncing: false,
      currentBlock: s.blockHeight,
      peers: s.peers, txPool: s.txPool,
      mode: "boost",
      blockTime: "1s",
      mevBundles: Math.floor(Math.random() * 8),
      tps: Math.floor(s.txPool * 0.8 + Math.random() * 10),
      priorityFee: "2 gwei",
      uptime: s.startedAt ? Math.floor((Date.now() - new Date(s.startedAt).getTime()) / 1000) : 0,
    }));
    return;
  }

  if (url === "/boost/bundle" && req.method === "POST") {
    res.writeHead(200, { "Content-Type": "application/json", ...cors() });
    res.end(JSON.stringify({ bundleHash: "0x" + randHex(64), status: "queued", eta: "< 1 block" }));
    addLog("boostnode", `MEV bundle received → queued for block #${s.blockHeight + 1}`);
    return;
  }

  if (req.method !== "POST") { res.writeHead(405); res.end(); return; }
  let body = "";
  req.on("data", (c: Buffer) => { body += c.toString(); });
  req.on("end", () => {
    try {
      const rpc = JSON.parse(body);
      const result = jsonRpcDispatch(rpc, s, "boost-node", { boosted: true });
      addLog("boostnode", `${rpc.method} → block #${s.blockHeight} | pool: ${s.txPool} | tps: ${Math.floor(s.txPool * 0.8)}`);
      res.writeHead(200, { "Content-Type": "application/json", ...cors() });
      res.end(JSON.stringify(Array.isArray(rpc)
        ? rpc.map((r: any) => ({ jsonrpc: "2.0", id: r.id, result: null }))
        : { jsonrpc: "2.0", id: rpc.id, result }));
    } catch { res.writeHead(400); res.end(JSON.stringify({ error: "Invalid JSON-RPC" })); }
  });
}

// ── Validator node ───────────────────────────────────────────────────────────
// Simulated PoS validator: JSON-RPC + validator-specific methods + /validators status
const MOCK_VALIDATORS = [
  { address: "0x0000000000000000000000000000000000000001", staked: 10000, commission: 0.05, active: true, blocksProposed: 0 },
  { address: "0x0000000000000000000000000000000000000002", staked: 5000,  commission: 0.08, active: true, blocksProposed: 0 },
  { address: "0x0000000000000000000000000000000000000003", staked: 2000,  commission: 0.10, active: true, blocksProposed: 0 },
];

function validatorHandler(req: IncomingMessage, res: ServerResponse) {
  if (req.method === "OPTIONS") { res.writeHead(204, cors()); res.end(); return; }

  const s = state.validator;
  const url = req.url ?? "/";

  if (url === "/validators" && req.method === "GET") {
    MOCK_VALIDATORS[0].blocksProposed = s.blockHeight;
    res.writeHead(200, { "Content-Type": "application/json", ...cors() });
    res.end(JSON.stringify(MOCK_VALIDATORS));
    return;
  }

  if (req.method === "GET") {
    res.writeHead(200, { "Content-Type": "application/json", ...cors() });
    res.end(JSON.stringify({
      node: "GYDSchain/validator-node/v1.0.0",
      chainId: 13370, syncing: false,
      currentBlock: s.blockHeight,
      peers: s.peers, txPool: s.txPool,
      mode: "validator",
      blockTime: "120s",
      validators: MOCK_VALIDATORS.length,
      activeSet: MOCK_VALIDATORS.filter(v => v.active).length,
      epoch: Math.floor(s.blockHeight / 100),
      epochLength: 100,
      stakeRequired: "1000 GYDS",
      uptime: s.startedAt ? Math.floor((Date.now() - new Date(s.startedAt).getTime()) / 1000) : 0,
    }));
    return;
  }

  if (req.method !== "POST") { res.writeHead(405); res.end(); return; }
  let body = "";
  req.on("data", (c: Buffer) => { body += c.toString(); });
  req.on("end", () => {
    try {
      const rpc = JSON.parse(body);
      let result: unknown;

      // Validator-specific methods
      if (rpc.method === "validator_info") {
        result = {
          validators: MOCK_VALIDATORS.length, activeSet: MOCK_VALIDATORS.filter(v => v.active).length,
          blockTime: "120s", stakeReq: "1000 GYDS", slashing: true,
          epoch: Math.floor(s.blockHeight / 100), epochLength: 100,
          rewardPerBlock: "2 GYDS",
        };
      } else if (rpc.method === "validator_set") {
        result = MOCK_VALIDATORS.map(v => ({
          ...v, slashed: false, slashCount: 0,
          uptime: 0.999,
          joinedAt: new Date(Date.now() - 86400000 * 30).toISOString(),
        }));
      } else if (rpc.method === "validator_getRewards") {
        result = { totalRewards: s.blockHeight * 2, rewardPerBlock: 2, pendingRewards: (s.blockHeight % 100) * 2, commissionEarned: s.blockHeight * 0.1 };
      } else if (rpc.method === "validator_register") {
        const params = rpc.params ?? [];
        MOCK_VALIDATORS.push({ address: params[0] ?? "0x" + randHex(40), staked: params[1] ?? 1000, commission: 0.05, active: true, blocksProposed: 0 });
        result = { registered: true };
      } else {
        result = jsonRpcDispatch(rpc, s, "validator-node");
      }

      addLog("validator", `${rpc.method} → block #${s.blockHeight} | validators: ${MOCK_VALIDATORS.length}`);
      res.writeHead(200, { "Content-Type": "application/json", ...cors() });
      res.end(JSON.stringify(Array.isArray(rpc)
        ? rpc.map((r: any) => ({ jsonrpc: "2.0", id: r.id, result: null }))
        : { jsonrpc: "2.0", id: rpc.id, result }));
    } catch { res.writeHead(400); res.end(JSON.stringify({ error: "Invalid JSON-RPC" })); }
  });
}

function cors() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

const HANDLERS: Record<NodeType, (req: IncomingMessage, res: ServerResponse) => void> = {
  rpc:       rpcHandler,
  lite:      liteHandler,
  fullnode:  fullnodeHandler,
  boostnode: boostnodeHandler,
  validator: validatorHandler,
};

const NODE_LABELS: Record<NodeType, string> = {
  rpc:       "RPC",
  lite:      "Lite",
  fullnode:  "Full Node",
  boostnode: "Boost Node",
  validator: "Validator Node",
};

const BLOCK_INTERVALS: Record<NodeType, number> = {
  rpc:       3000,
  lite:      3000,
  fullnode:  2000,
  boostnode: 1000,
  validator: 5000,  // simulated at 5s for test (real: 120s)
};

// ── Public API ───────────────────────────────────────────────────────────────
export const testNodeManager = {
  start(type: NodeType): { ok: boolean; message: string } {
    const s = state[type];
    if (s.running) return { ok: false, message: `${NODE_LABELS[type]} is already running` };

    const srv = createServer(HANDLERS[type]);
    srv.on("error", (err: Error) => {
      addLog(type, `ERROR: ${err.message}`);
      if ((err as any).code === "EADDRINUSE") {
        s.running = false; s.server = null;
        if (s.blockTimer) { clearInterval(s.blockTimer); s.blockTimer = null; }
      }
    });

    srv.listen(s.port, "0.0.0.0", () => {
      s.running = true;
      s.startedAt = new Date().toISOString();
      addLog(type, `${NODE_LABELS[type]} started on port ${s.port}`);
      addLog(type, `Chain ID: 13370 | Mode: ${type}`);
      addLog(type, `Listening at http://0.0.0.0:${s.port}`);
      if (type === "boostnode") addLog(type, "MEV bundle endpoint: POST /boost/bundle");
      if (type === "fullnode")  addLog(type, "Full-state RPC + txpool_status + debug_traceTransaction enabled");
      if (type === "validator") addLog(type, "PoS consensus engine started | validator_info, validator_set, validator_getRewards, validator_register");

      const interval = BLOCK_INTERVALS[type];
      s.blockTimer = setInterval(() => {
        s.blockHeight++;
        const peerChange = Math.random() > 0.8 ? (Math.random() > 0.5 ? 1 : -1) : 0;
        s.peers = Math.max(1, s.peers + peerChange);

        if (type === "rpc") {
          const txCount = Math.floor(Math.random() * 5);
          addLog(type, `Block #${s.blockHeight} mined | ${txCount} txs | ${s.peers} peers`);
        } else if (type === "lite") {
          addLog(type, `Header #${s.blockHeight} synced | ${s.peers} peers`);
        } else if (type === "fullnode") {
          const txCount = Math.floor(Math.random() * 15) + 1;
          s.txPool = Math.max(0, s.txPool + Math.floor(Math.random() * 8) - txCount);
          addLog(type, `Block #${s.blockHeight} | ${txCount} txs included | pool: ${s.txPool} | ${s.peers} peers`);
        } else if (type === "validator") {
          const txCount = Math.floor(Math.random() * 8) + 1;
          const proposer = MOCK_VALIDATORS[s.blockHeight % MOCK_VALIDATORS.length].address;
          const epoch = Math.floor(s.blockHeight / 100);
          const reward = txCount * 2 + " GYDS";
          s.txPool = Math.max(0, s.txPool + Math.floor(Math.random() * 5) - txCount);
          MOCK_VALIDATORS[s.blockHeight % MOCK_VALIDATORS.length].blocksProposed++;
          addLog(type, `Block #${s.blockHeight} proposed by ${proposer.slice(0, 10)}… | ${txCount} txs | epoch ${epoch} | reward ${reward}`);
        } else {
          const txCount = Math.floor(Math.random() * 40) + 10;
          const mev = Math.random() > 0.6 ? ` | MEV bundle #${Math.floor(Math.random() * 9999)}` : "";
          s.txPool = Math.max(0, s.txPool + Math.floor(Math.random() * 20) - txCount);
          addLog(type, `Block #${s.blockHeight} | ${txCount} txs | pool: ${s.txPool} | ${s.peers} peers${mev}`);
        }
      }, interval);
    });

    s.server = srv;
    return { ok: true, message: `Starting ${NODE_LABELS[type]} on port ${s.port}…` };
  },

  stop(type: NodeType): { ok: boolean; message: string } {
    const s = state[type];
    if (!s.running) return { ok: false, message: `${NODE_LABELS[type]} is not running` };
    if (s.blockTimer) { clearInterval(s.blockTimer); s.blockTimer = null; }
    s.server?.close(() => addLog(type, `${NODE_LABELS[type]} stopped`));
    s.running = false; s.server = null; s.startedAt = null;
    return { ok: true, message: `${NODE_LABELS[type]} stopped` };
  },

  status() {
    const pick = (t: NodeType) => ({
      running: state[t].running, startedAt: state[t].startedAt,
      port: state[t].port, blockHeight: state[t].blockHeight,
      peers: state[t].peers, txPool: state[t].txPool,
    });
    return {
      rpc:       pick("rpc"),
      lite:      pick("lite"),
      fullnode:  pick("fullnode"),
      boostnode: pick("boostnode"),
      validator: pick("validator"),
    };
  },

  getLogs(type: NodeType) {
    return [...state[type].logs];
  },

  stopAll() {
    (["rpc", "lite", "fullnode", "boostnode", "validator"] as NodeType[]).forEach(t => {
      if (state[t].running) this.stop(t);
    });
  },
};
