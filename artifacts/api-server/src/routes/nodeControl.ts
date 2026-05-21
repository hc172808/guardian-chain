import { Router, type Request, type Response } from "express";
import { spawn } from "child_process";
import path from "path";

const router = Router();

const LITENODE_HTTP = "http://localhost:8545";
const LITENODE_BIN = path.resolve(
  process.cwd(),
  "../../artifacts/gyds-litenode/bin/gyds-litenode",
);

let litenodeProcess: ReturnType<typeof spawn> | null = null;
const litenodeLog: string[] = [];

async function probeLitenode() {
  try {
    const rpc = (method: string, id: number) =>
      fetch(`${LITENODE_HTTP}/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id, method, params: [] }),
        signal: AbortSignal.timeout(2000),
      }).then((r) => r.json() as Promise<{ result?: string }>);

    const [blk, peers, chain] = await Promise.all([
      rpc("eth_blockNumber", 1),
      rpc("net_peerCount", 2),
      rpc("eth_chainId", 3),
    ]);

    return {
      online: true,
      blockHeight: blk.result ? parseInt(blk.result, 16) : null,
      peers: peers.result ? parseInt(peers.result, 16) : null,
      chainId: chain.result ? parseInt(chain.result, 16) : null,
    };
  } catch {
    return { online: false, blockHeight: null, peers: null, chainId: null };
  }
}

function startProcess() {
  litenodeLog.length = 0;
  const proc = spawn(LITENODE_BIN, ["start"], {
    env: { ...process.env, PORT: "8545" },
    detached: false,
  });
  litenodeProcess = proc;
  const push = (d: Buffer) => {
    for (const line of d.toString().split("\n").filter(Boolean)) {
      litenodeLog.push(line);
      if (litenodeLog.length > 300) litenodeLog.shift();
    }
  };
  proc.stdout?.on("data", push);
  proc.stderr?.on("data", push);
  proc.on("exit", () => { litenodeProcess = null; });
  return proc;
}

// GET /api/admin/nodes/status
router.get("/status", async (_req: Request, res: Response) => {
  const litenode = await probeLitenode();
  res.json({
    litenode: {
      ...litenode,
      managedByApi: litenodeProcess !== null,
      recentLogs: litenodeLog.slice(-30),
    },
  });
});

// POST /api/admin/nodes/litenode/start
router.post("/litenode/start", async (_req: Request, res: Response) => {
  const probe = await probeLitenode();
  if (probe.online) {
    res.json({ ok: false, message: "Litenode is already running on port 8545." });
    return;
  }
  startProcess();
  res.json({ ok: true, message: "Litenode starting…" });
});

// POST /api/admin/nodes/litenode/stop
router.post("/litenode/stop", (_req: Request, res: Response) => {
  if (!litenodeProcess) {
    res.json({ ok: false, message: "No API-managed litenode process found." });
    return;
  }
  litenodeProcess.kill("SIGTERM");
  litenodeProcess = null;
  res.json({ ok: true, message: "Litenode stopped." });
});

// POST /api/admin/nodes/litenode/restart
router.post("/litenode/restart", async (_req: Request, res: Response) => {
  if (litenodeProcess) {
    litenodeProcess.kill("SIGTERM");
    litenodeProcess = null;
    await new Promise<void>((r) => setTimeout(r, 1500));
  }
  startProcess();
  res.json({ ok: true, message: "Litenode restarting…" });
});

// GET /api/admin/nodes/litenode/logs
router.get("/litenode/logs", (_req: Request, res: Response) => {
  res.json({ logs: litenodeLog.slice(-100) });
});

export default router;
