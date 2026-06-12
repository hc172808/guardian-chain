/**
 * Test node manager — spawns/kills two in-process simulated blockchain nodes
 * for development/testing within the Replit environment.
 *
 * RPC Node  : simulates an Ethereum-compatible JSON-RPC endpoint on port 8545
 * Lite Node : simulates a lightweight header-sync node on port 8555
 *
 * Both are pure Node.js HTTP servers so they work without any Go binaries.
 */

import { createServer, IncomingMessage, ServerResponse, Server } from "http";

const MAX_LOGS = 200;

type NodeType = "rpc" | "lite";

interface NodeState {
  running: boolean;
  startedAt: string | null;
  port: number;
  server: Server | null;
  logs: string[];
  blockHeight: number;
  peers: number;
  blockTimer: ReturnType<typeof setInterval> | null;
}

const state: Record<NodeType, NodeState> = {
  rpc:  { running: false, startedAt: null, port: 8545, server: null, logs: [], blockHeight: 1000, peers: 4, blockTimer: null },
  lite: { running: false, startedAt: null, port: 8555, server: null, logs: [], blockHeight: 1000, peers: 2, blockTimer: null },
};

function addLog(type: NodeType, msg: string) {
  const ts = new Date().toISOString().replace("T", " ").slice(0, 19);
  state[type].logs.push(`[${ts}] ${msg}`);
  if (state[type].logs.length > MAX_LOGS) state[type].logs.shift();
}

// ── RPC node handler (Ethereum JSON-RPC subset) ──────────────────────────────
function rpcHandler(req: IncomingMessage, res: ServerResponse) {
  if (req.method !== "POST") { res.writeHead(405); res.end(); return; }
  let body = "";
  req.on("data", (c: Buffer) => { body += c.toString(); });
  req.on("end", () => {
    try {
      const rpc = JSON.parse(body);
      const s = state.rpc;
      let result: unknown = null;

      switch (rpc.method) {
        case "eth_blockNumber":
          result = "0x" + s.blockHeight.toString(16);
          break;
        case "net_version":
          result = "13370";
          break;
        case "eth_chainId":
          result = "0x" + (13370).toString(16);
          break;
        case "eth_gasPrice":
          result = "0x" + (20_000_000_000).toString(16);
          break;
        case "eth_getBlockByNumber": {
          const h = s.blockHeight;
          result = {
            number: "0x" + h.toString(16),
            hash: "0x" + Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join(""),
            parentHash: "0x" + Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join(""),
            timestamp: "0x" + Math.floor(Date.now() / 1000).toString(16),
            gasUsed: "0x5208",
            gasLimit: "0x1000000",
            miner: "0x" + "a".repeat(40),
            transactions: [],
            difficulty: "0x1",
            totalDifficulty: "0x" + h.toString(16),
            size: "0x1a3",
            nonce: "0x0000000000000000",
            extraData: "0x47594453636861696e",
            logsBloom: "0x" + "0".repeat(512),
            sha3Uncles: "0x1dcc4de8dec75d7aab85b567b6ccd41ad312451b948a7413f0a142fd40d49347",
            stateRoot: "0x" + "d".repeat(64),
            transactionsRoot: "0x" + "e".repeat(64),
            receiptsRoot: "0x" + "f".repeat(64),
          };
          break;
        }
        case "net_peerCount":
          result = "0x" + s.peers.toString(16);
          break;
        case "web3_clientVersion":
          result = "GYDSchain/test-rpcnode/v0.1.0";
          break;
        case "eth_syncing":
          result = false;
          break;
        case "eth_getBalance":
          result = "0x" + (1_000_000_000_000_000_000n).toString(16);
          break;
        default:
          result = null;
      }

      const resp = Array.isArray(rpc)
        ? rpc.map((r: any) => ({ jsonrpc: "2.0", id: r.id, result: null }))
        : { jsonrpc: "2.0", id: rpc.id, result };

      addLog("rpc", `${rpc.method} → block #${s.blockHeight}`);
      res.writeHead(200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
      res.end(JSON.stringify(resp));
    } catch {
      res.writeHead(400);
      res.end(JSON.stringify({ error: "Invalid JSON-RPC" }));
    }
  });
}

// ── Lite node handler (header sync status) ──────────────────────────────────
function liteHandler(_req: IncomingMessage, res: ServerResponse) {
  const s = state.lite;
  res.writeHead(200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
  res.end(JSON.stringify({
    node: "GYDSchain/lite-node/v0.1.0",
    chainId: 13370,
    syncing: false,
    currentBlock: s.blockHeight,
    peers: s.peers,
    mode: "lite",
    uptime: s.startedAt ? Math.floor((Date.now() - new Date(s.startedAt).getTime()) / 1000) : 0,
  }));
  addLog("lite", `status poll → block #${s.blockHeight}`);
}

// ── Public API ───────────────────────────────────────────────────────────────
export const testNodeManager = {
  start(type: NodeType): { ok: boolean; message: string } {
    const s = state[type];
    if (s.running) return { ok: false, message: `${type} node is already running` };

    const handler = type === "rpc" ? rpcHandler : liteHandler;

    const srv = createServer(handler);
    srv.on("error", (err: Error) => {
      addLog(type, `ERROR: ${err.message}`);
      // port already in use — mark as not running
      if ((err as any).code === "EADDRINUSE") {
        s.running = false;
        s.server = null;
        if (s.blockTimer) { clearInterval(s.blockTimer); s.blockTimer = null; }
      }
    });

    srv.listen(s.port, "0.0.0.0", () => {
      s.running = true;
      s.startedAt = new Date().toISOString();
      addLog(type, `${type === "rpc" ? "RPC" : "Lite"} node started on port ${s.port}`);
      addLog(type, `Chain ID: 13370 | Mode: ${type === "rpc" ? "full-rpc" : "lite"}`);
      addLog(type, `Listening at http://0.0.0.0:${s.port}`);

      // Simulate block production every 3 seconds
      s.blockTimer = setInterval(() => {
        s.blockHeight++;
        const peerChange = Math.random() > 0.8 ? (Math.random() > 0.5 ? 1 : -1) : 0;
        s.peers = Math.max(1, s.peers + peerChange);

        if (type === "rpc") {
          const txCount = Math.floor(Math.random() * 5);
          addLog(type, `Block #${s.blockHeight} mined | ${txCount} txs | ${s.peers} peers`);
        } else {
          addLog(type, `Header #${s.blockHeight} synced | ${s.peers} peers`);
        }
      }, 3000);
    });

    s.server = srv;
    return { ok: true, message: `Starting ${type} node on port ${s.port}…` };
  },

  stop(type: NodeType): { ok: boolean; message: string } {
    const s = state[type];
    if (!s.running) return { ok: false, message: `${type} node is not running` };

    if (s.blockTimer) { clearInterval(s.blockTimer); s.blockTimer = null; }
    s.server?.close(() => {
      addLog(type, `${type === "rpc" ? "RPC" : "Lite"} node stopped`);
    });
    s.running = false;
    s.server = null;
    s.startedAt = null;
    return { ok: true, message: `${type} node stopped` };
  },

  status() {
    return {
      rpc:  { running: state.rpc.running,  startedAt: state.rpc.startedAt,  port: state.rpc.port,  blockHeight: state.rpc.blockHeight,  peers: state.rpc.peers  },
      lite: { running: state.lite.running, startedAt: state.lite.startedAt, port: state.lite.port, blockHeight: state.lite.blockHeight, peers: state.lite.peers },
    };
  },

  getLogs(type: NodeType) {
    return [...state[type].logs];
  },

  stopAll() {
    if (state.rpc.running)  this.stop("rpc");
    if (state.lite.running) this.stop("lite");
  },
};
