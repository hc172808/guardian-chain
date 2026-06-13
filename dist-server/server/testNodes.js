"use strict";
/**
 * Test node manager — spawns/kills four in-process simulated blockchain nodes
 * for development/testing within the Replit environment or any deployed server.
 *
 * RPC Node      (8545) : Ethereum-compatible JSON-RPC endpoint
 * Lite Node     (8555) : Lightweight header-sync node
 * Full Node     (8565) : Full-state node with mempool, traces, storage queries
 * Boost Node    (8575) : High-throughput MEV/priority-tx node, 1-second blocks
 *
 * All servers bind to 0.0.0.0 so they are reachable on any network interface.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.testNodeManager = void 0;
const http_1 = require("http");
const MAX_LOGS = 200;
const state = {
    rpc: { running: false, startedAt: null, port: 8545, server: null, logs: [], blockHeight: 1000, peers: 4, txPool: 0, blockTimer: null },
    lite: { running: false, startedAt: null, port: 8555, server: null, logs: [], blockHeight: 1000, peers: 2, txPool: 0, blockTimer: null },
    fullnode: { running: false, startedAt: null, port: 8565, server: null, logs: [], blockHeight: 1000, peers: 10, txPool: 12, blockTimer: null },
    boostnode: { running: false, startedAt: null, port: 8575, server: null, logs: [], blockHeight: 1000, peers: 18, txPool: 40, blockTimer: null },
};
function addLog(type, msg) {
    const ts = new Date().toISOString().replace("T", " ").slice(0, 19);
    state[type].logs.push(`[${ts}] ${msg}`);
    if (state[type].logs.length > MAX_LOGS)
        state[type].logs.shift();
}
function randHex(len) {
    return Array.from({ length: len }, () => Math.floor(Math.random() * 16).toString(16)).join("");
}
function blockObject(s, extraTxCount = 0) {
    return {
        number: "0x" + s.blockHeight.toString(16),
        hash: "0x" + randHex(64),
        parentHash: "0x" + randHex(64),
        timestamp: "0x" + Math.floor(Date.now() / 1000).toString(16),
        gasUsed: "0x" + (21000 * extraTxCount || 0x5208).toString(16),
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
        baseFeePerGas: "0x" + (1000000000).toString(16),
    };
}
function jsonRpcDispatch(rpc, s, nodeLabel, opts = {}) {
    switch (rpc.method) {
        case "eth_blockNumber": return "0x" + s.blockHeight.toString(16);
        case "net_version": return "13370";
        case "eth_chainId": return "0x" + (13370).toString(16);
        case "eth_gasPrice": return "0x" + (opts.boosted ? 5000000000 : 20000000000).toString(16);
        case "eth_maxPriorityFeePerGas": return "0x" + (opts.boosted ? 2000000000 : 1000000000).toString(16);
        case "net_peerCount": return "0x" + s.peers.toString(16);
        case "web3_clientVersion": return `GYDSchain/${nodeLabel}/v0.2.0`;
        case "eth_syncing": return false;
        case "eth_getBalance": return "0x" + (1000000000000000000n).toString(16);
        case "eth_getTransactionCount": return "0x" + Math.floor(Math.random() * 100).toString(16);
        case "eth_estimateGas": return "0x" + (21000).toString(16);
        case "eth_getBlockByNumber": return blockObject(s, Math.floor(Math.random() * (opts.boosted ? 30 : 5)));
        case "eth_getBlockByHash": return blockObject(s, 0);
        case "eth_call": return "0x";
        case "eth_getCode": return "0x";
        case "eth_getStorageAt": return "0x" + "0".repeat(64);
        case "eth_sendRawTransaction": return "0x" + randHex(64);
        case "eth_getTransactionReceipt": return {
            transactionHash: "0x" + randHex(64),
            blockNumber: "0x" + s.blockHeight.toString(16),
            blockHash: "0x" + randHex(64),
            gasUsed: "0x5208",
            status: "0x1",
            logs: [],
            logsBloom: "0x" + "0".repeat(512),
        };
        case "eth_getLogs": return [];
        case "txpool_status": return { pending: "0x" + s.txPool.toString(16), queued: "0x0" };
        case "txpool_content": return { pending: {}, queued: {} };
        case "debug_traceTransaction": return { gas: 21000, returnValue: "", structLogs: [] };
        case "eth_getFilterChanges": return [];
        case "eth_newFilter": return "0x1";
        default: return null;
    }
}
// ── RPC node ─────────────────────────────────────────────────────────────────
function rpcHandler(req, res) {
    if (req.method === "OPTIONS") {
        res.writeHead(204, cors());
        res.end();
        return;
    }
    if (req.method !== "POST") {
        res.writeHead(405);
        res.end();
        return;
    }
    let body = "";
    req.on("data", (c) => { body += c.toString(); });
    req.on("end", () => {
        try {
            const rpc = JSON.parse(body);
            const s = state.rpc;
            const result = jsonRpcDispatch(rpc, s, "rpc-node");
            addLog("rpc", `${rpc.method} → block #${s.blockHeight}`);
            res.writeHead(200, { "Content-Type": "application/json", ...cors() });
            res.end(JSON.stringify(Array.isArray(rpc)
                ? rpc.map((r) => ({ jsonrpc: "2.0", id: r.id, result: null }))
                : { jsonrpc: "2.0", id: rpc.id, result }));
        }
        catch {
            res.writeHead(400);
            res.end(JSON.stringify({ error: "Invalid JSON-RPC" }));
        }
    });
}
// ── Lite node ────────────────────────────────────────────────────────────────
function liteHandler(_req, res) {
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
function fullnodeHandler(req, res) {
    if (req.method === "OPTIONS") {
        res.writeHead(204, cors());
        res.end();
        return;
    }
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
    if (req.method !== "POST") {
        res.writeHead(405);
        res.end();
        return;
    }
    let body = "";
    req.on("data", (c) => { body += c.toString(); });
    req.on("end", () => {
        try {
            const rpc = JSON.parse(body);
            const result = jsonRpcDispatch(rpc, s, "full-node");
            addLog("fullnode", `${rpc.method} → block #${s.blockHeight} | pool: ${s.txPool}`);
            res.writeHead(200, { "Content-Type": "application/json", ...cors() });
            res.end(JSON.stringify(Array.isArray(rpc)
                ? rpc.map((r) => ({ jsonrpc: "2.0", id: r.id, result: null }))
                : { jsonrpc: "2.0", id: rpc.id, result }));
        }
        catch {
            res.writeHead(400);
            res.end(JSON.stringify({ error: "Invalid JSON-RPC" }));
        }
    });
}
// ── Boost node ───────────────────────────────────────────────────────────────
function boostnodeHandler(req, res) {
    if (req.method === "OPTIONS") {
        res.writeHead(204, cors());
        res.end();
        return;
    }
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
    if (req.method !== "POST") {
        res.writeHead(405);
        res.end();
        return;
    }
    let body = "";
    req.on("data", (c) => { body += c.toString(); });
    req.on("end", () => {
        try {
            const rpc = JSON.parse(body);
            const result = jsonRpcDispatch(rpc, s, "boost-node", { boosted: true });
            addLog("boostnode", `${rpc.method} → block #${s.blockHeight} | pool: ${s.txPool} | tps: ${Math.floor(s.txPool * 0.8)}`);
            res.writeHead(200, { "Content-Type": "application/json", ...cors() });
            res.end(JSON.stringify(Array.isArray(rpc)
                ? rpc.map((r) => ({ jsonrpc: "2.0", id: r.id, result: null }))
                : { jsonrpc: "2.0", id: rpc.id, result }));
        }
        catch {
            res.writeHead(400);
            res.end(JSON.stringify({ error: "Invalid JSON-RPC" }));
        }
    });
}
function cors() {
    return {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
    };
}
const HANDLERS = {
    rpc: rpcHandler,
    lite: liteHandler,
    fullnode: fullnodeHandler,
    boostnode: boostnodeHandler,
};
const NODE_LABELS = {
    rpc: "RPC",
    lite: "Lite",
    fullnode: "Full Node",
    boostnode: "Boost Node",
};
const BLOCK_INTERVALS = {
    rpc: 3000,
    lite: 3000,
    fullnode: 2000,
    boostnode: 1000,
};
// ── Public API ───────────────────────────────────────────────────────────────
exports.testNodeManager = {
    start(type) {
        const s = state[type];
        if (s.running)
            return { ok: false, message: `${NODE_LABELS[type]} is already running` };
        const srv = (0, http_1.createServer)(HANDLERS[type]);
        srv.on("error", (err) => {
            addLog(type, `ERROR: ${err.message}`);
            if (err.code === "EADDRINUSE") {
                s.running = false;
                s.server = null;
                if (s.blockTimer) {
                    clearInterval(s.blockTimer);
                    s.blockTimer = null;
                }
            }
        });
        srv.listen(s.port, "0.0.0.0", () => {
            s.running = true;
            s.startedAt = new Date().toISOString();
            addLog(type, `${NODE_LABELS[type]} started on port ${s.port}`);
            addLog(type, `Chain ID: 13370 | Mode: ${type}`);
            addLog(type, `Listening at http://0.0.0.0:${s.port}`);
            if (type === "boostnode")
                addLog(type, "MEV bundle endpoint: POST /boost/bundle");
            if (type === "fullnode")
                addLog(type, "Full-state RPC + txpool_status + debug_traceTransaction enabled");
            const interval = BLOCK_INTERVALS[type];
            s.blockTimer = setInterval(() => {
                s.blockHeight++;
                const peerChange = Math.random() > 0.8 ? (Math.random() > 0.5 ? 1 : -1) : 0;
                s.peers = Math.max(1, s.peers + peerChange);
                if (type === "rpc") {
                    const txCount = Math.floor(Math.random() * 5);
                    addLog(type, `Block #${s.blockHeight} mined | ${txCount} txs | ${s.peers} peers`);
                }
                else if (type === "lite") {
                    addLog(type, `Header #${s.blockHeight} synced | ${s.peers} peers`);
                }
                else if (type === "fullnode") {
                    const txCount = Math.floor(Math.random() * 15) + 1;
                    s.txPool = Math.max(0, s.txPool + Math.floor(Math.random() * 8) - txCount);
                    addLog(type, `Block #${s.blockHeight} | ${txCount} txs included | pool: ${s.txPool} | ${s.peers} peers`);
                }
                else {
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
    stop(type) {
        const s = state[type];
        if (!s.running)
            return { ok: false, message: `${NODE_LABELS[type]} is not running` };
        if (s.blockTimer) {
            clearInterval(s.blockTimer);
            s.blockTimer = null;
        }
        s.server?.close(() => addLog(type, `${NODE_LABELS[type]} stopped`));
        s.running = false;
        s.server = null;
        s.startedAt = null;
        return { ok: true, message: `${NODE_LABELS[type]} stopped` };
    },
    status() {
        const pick = (t) => ({
            running: state[t].running, startedAt: state[t].startedAt,
            port: state[t].port, blockHeight: state[t].blockHeight,
            peers: state[t].peers, txPool: state[t].txPool,
        });
        return {
            rpc: pick("rpc"),
            lite: pick("lite"),
            fullnode: pick("fullnode"),
            boostnode: pick("boostnode"),
        };
    },
    getLogs(type) {
        return [...state[type].logs];
    },
    stopAll() {
        ["rpc", "lite", "fullnode", "boostnode"].forEach(t => {
            if (state[t].running)
                this.stop(t);
        });
    },
};
