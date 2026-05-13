import { Router, type Request, type Response } from "express";
import { db } from "@workspace/db";
import * as schema from "@workspace/db/schema";
import { count, sum, desc } from "drizzle-orm";

const router = Router();

// ── Shared state ────────────────────────────────────────────────────────────

// Block height advances 1 block every 12 s from server start baseline.
const BASELINE_HEIGHT = 1_234_567;
const SERVER_START_MS = Date.now();
const CHAIN_ID = 1337;

function currentBlockHeight(): number {
  return BASELINE_HEIGHT + Math.floor((Date.now() - SERVER_START_MS) / 12_000);
}

function makeBlock(height: number) {
  return {
    number: height,
    hash: `0x${height.toString(16).padStart(64, "0")}`,
    parentHash: `0x${(height - 1).toString(16).padStart(64, "0")}`,
    timestamp: Math.floor(SERVER_START_MS / 1000) + (height - BASELINE_HEIGHT) * 12,
    transactions: Math.floor(Math.random() * 20),
    validator: `0x${(height % 16).toString(16).padStart(40, "0")}`,
    size: 4096 + Math.floor(Math.random() * 4096),
    gasUsed: Math.floor(Math.random() * 15_000_000),
    gasLimit: 30_000_000,
  };
}

function makeTx(blockNumber: number, index: number) {
  const rnd = (blockNumber * 1000 + index).toString(16);
  return {
    hash: `0x${rnd.padStart(64, "a")}`,
    from: `0x${(index % 16).toString(16).padStart(40, "0")}`,
    to: `0x${((index + 1) % 16).toString(16).padStart(40, "0")}`,
    value: (BigInt(index) * BigInt(1e15)).toString(),
    blockNumber,
    timestamp: Math.floor(SERVER_START_MS / 1000) + (blockNumber - BASELINE_HEIGHT) * 12,
    status: "success",
    gasUsed: 21_000 + Math.floor(Math.random() * 50_000),
    gasPrice: "1000000000",
  };
}

// ── SSE real-time stream ─────────────────────────────────────────────────────

router.get("/blockchain/stream", (req: Request, res: Response) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  const send = (event: string, data: unknown) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  // Send current state immediately on connect
  const height = currentBlockHeight();
  send("newBlock", makeBlock(height));

  const interval = setInterval(() => {
    const h = currentBlockHeight();
    const block = makeBlock(h);
    send("newBlock", block);

    const txCount = Math.floor(Math.random() * 5);
    for (let i = 0; i < txCount; i++) {
      send("newTransaction", makeTx(h, i));
    }
  }, 5_000);

  // Keep-alive comment every 20 s
  const keepAlive = setInterval(() => {
    res.write(": keep-alive\n\n");
  }, 20_000);

  req.on("close", () => {
    clearInterval(interval);
    clearInterval(keepAlive);
    res.end();
  });
});

// ── Blocks ───────────────────────────────────────────────────────────────────

router.get("/blockchain/blocks", (_req: Request, res: Response) => {
  const limit = Math.min(Number(_req.query.limit) || 20, 50);
  const height = currentBlockHeight();
  const blocks = Array.from({ length: limit }, (_, i) => makeBlock(height - i));
  res.json({ blocks, count: limit, source: "stub" });
});

router.get("/blockchain/block/:id", (req: Request, res: Response) => {
  const id = req.params.id;
  const num = parseInt(id, 10);
  const height = isNaN(num) ? currentBlockHeight() : num;
  res.json({ block: makeBlock(height) });
});

// ── Transactions ─────────────────────────────────────────────────────────────

router.get("/blockchain/transactions", (_req: Request, res: Response) => {
  const limit = Math.min(Number(_req.query.limit) || 20, 50);
  const height = currentBlockHeight();
  const transactions = Array.from({ length: limit }, (_, i) => makeTx(height - Math.floor(i / 3), i));
  res.json({ transactions, count: limit, source: "stub" });
});

router.get("/blockchain/tx/:hash", (req: Request, res: Response) => {
  res.json({ transaction: { hash: req.params.hash }, receipt: null });
});

// ── Network stats (live DB counts) ──────────────────────────────────────────

router.get("/blockchain/network/stats", async (_req: Request, res: Response) => {
  try {
    const [validatorsRow, walletsRow, txsRow] = await Promise.all([
      db.select({ n: count() }).from(schema.networkValidatorsTable),
      db.select({ n: count() }).from(schema.walletsTable),
      db.select({ n: count() }).from(schema.transactionsTable),
    ]);

    const peerCount = Number(validatorsRow[0]?.n ?? 0);
    const walletCount = Number(walletsRow[0]?.n ?? 0);
    const txCount = Number(txsRow[0]?.n ?? 0);

    res.json({
      blockHeight: currentBlockHeight(),
      gasPrice: "1000000000",
      peerCount: peerCount || 12,
      validatorCount: peerCount,
      walletCount,
      totalTransactions: txCount,
      chainId: CHAIN_ID,
      source: "live",
    });
  } catch {
    res.json({
      blockHeight: currentBlockHeight(),
      gasPrice: "1000000000",
      peerCount: 12,
      chainId: CHAIN_ID,
      source: "stub",
    });
  }
});

// ── Health ───────────────────────────────────────────────────────────────────

router.get("/blockchain/health", async (_req: Request, res: Response) => {
  try {
    await db.select({ n: count() }).from(schema.networkValidatorsTable);
    res.json({ rpc: "stub", indexerDb: "ok" });
  } catch {
    res.json({ rpc: "stub", indexerDb: "down" });
  }
});

// ── Wallet (look up by address in wallets table) ─────────────────────────────

router.get("/blockchain/wallet/:address", async (req: Request, res: Response) => {
  const address = req.params.address;
  try {
    const { eq } = await import("drizzle-orm");
    const rows = await db
      .select({ id: schema.walletsTable.id })
      .from(schema.walletsTable)
      .where(eq(schema.walletsTable.address, address))
      .limit(1);

    res.json({
      address,
      balance: "0",
      transactionCount: rows.length > 0 ? "1" : "0",
      exists: rows.length > 0,
    });
  } catch {
    res.json({ address, balance: "0", transactionCount: "0", exists: false });
  }
});

// ── Token price history (synthetic 7-day from current DB row) ────────────────

router.get("/blockchain/token-price/history", async (_req: Request, res: Response) => {
  try {
    const rows = await db
      .select()
      .from(schema.tokenPriceTable)
      .orderBy(desc(schema.tokenPriceTable.updated_at))
      .limit(1);

    const currentPrice = rows[0]?.price ?? 0.042; // 0.042 default when table empty
    const now = Date.now();
    const points = Array.from({ length: 7 }, (_, i) => {
      const ts = now - (6 - i) * 86_400_000;
      const variance = 1 + Math.sin(i * 1.3) * 0.08;
      return { timestamp: ts, price: +(currentPrice * variance).toFixed(6) };
    });
    const source = rows.length > 0 ? "db" : "default";
    res.json({ prices: points, current: currentPrice, source });
  } catch {
    const fallback = 0.042;
    const now = Date.now();
    const points = Array.from({ length: 7 }, (_, i) => ({
      timestamp: now - (6 - i) * 86_400_000,
      price: +(fallback * (1 + Math.sin(i * 1.3) * 0.08)).toFixed(6),
    }));
    res.json({ prices: points, current: fallback, source: "fallback" });
  }
});

router.post("/blockchain/wallet/create", (_req: Request, res: Response) => {
  const rand = Math.random().toString(16).slice(2, 42).padStart(40, "0");
  res.json({ address: `0x${rand}` });
});

router.post("/blockchain/tx/send", (_req: Request, res: Response) => {
  const hash = `0x${Math.random().toString(16).slice(2).padStart(64, "0")}`;
  res.json({ txHash: hash });
});

export default router;
